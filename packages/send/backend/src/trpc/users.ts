import { hashPassword, verifyHash } from '@send-backend/auth/client';
import {
  getKeyBackupV2Mode,
  KEY_BACKUP_V2,
  VERSION,
} from '@send-backend/config';
import {
  BACKUP_FORMAT_SUPERSEDED,
  BaseError,
} from '@send-backend/errors/models';
import {
  createLoginSession,
  deleteContainer,
  deleteUpload,
  getContainersOwnedByUser,
  getUploadsOwnedByUser,
} from '@send-backend/models';
import { checkCompatibility } from '@send-backend/utils/compatibility';
import { TRPCError } from '@trpc/server';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import {
  assertLegacyBackupWritable,
  createUserWithPassword,
  getBackupVersion,
  getFTUEStatus,
  getHashedPassword,
  getUserByEmailV2,
  getUserById,
  KeyUpgrade,
  markFTUEComplete,
  resetKeys,
  updateUniqueHash,
  upgradeKeys,
} from '../models/users';
import { router, publicProcedure as trpc } from '../trpc';
import { isAuthed, requirePublicLogin, useEnvironment } from './middlewares';

const b64 = z.string().regex(/^[A-Za-z0-9+/_-]+={0,2}$/);
const encryptedItem = z.object({ iv: b64, ct: b64 });

// Shape check only; the server never decrypts the backup.
const backupV2Envelope = z.object({
  v: z.literal(KEY_BACKUP_V2),
  kdf: z.object({
    name: z.literal('PBKDF2'),
    hash: z.literal('SHA-256'),
    iterations: z.number().int().positive(),
    salt: b64,
  }),
  wrappedBackupKey: b64,
  items: z.object({
    publicKey: encryptedItem,
    privateKey: encryptedItem,
    containerKeys: z.record(z.string(), encryptedItem),
  }),
});

const backupV2Json = z.string().refine((raw) => {
  try {
    return backupV2Envelope.safeParse(JSON.parse(raw)).success;
  } catch {
    return false;
  }
}, 'backup must be a v2 key backup envelope');

/**
 * Delete every container and upload row the user owns. Containers go first so
 * their items (which cascade) release the uploads they reference. This removes
 * database rows only; it does not touch the stored objects (`storage.del`),
 * unlike `burnFolder` in models/sharing.ts.
 */
async function deleteUserContent(userId: string) {
  const containers = await getContainersOwnedByUser(userId);
  const uploads = await getUploadsOwnedByUser(userId);
  await Promise.all(containers.map(({ id }) => deleteContainer(id)));
  await Promise.all(uploads.map(({ id }) => deleteUpload(id)));
}

export const usersRouter = router({
  /**
   * @openapi
   * /trpc/getUser:
   *   get:
   *     tags:
   *       - Users
   *     summary: Get current user ID
   *     security:
   *       - bearerAuth: []
   *     description: Returns the ID of the currently authenticated user
   *     responses:
   *       200:
   *         description: User ID
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 user:
   *                   type: number
   *                   description: ID of the current user
   */
  getUser: trpc.use(isAuthed).query(({ ctx }) => {
    return { user: Number(ctx.user.id) };
  }),

  /**
   * @openapi
   * /trpc/settings:
   *   get:
   *     tags:
   *       - Users
   *     summary: Get API settings and compatibility
   *     description: Returns API version and compatibility information
   *     parameters:
   *       - in: query
   *         name: input
   *         schema:
   *           type: object
   *           properties:
   *             version:
   *               type: string
   *               description: Client version to check compatibility against
   *     responses:
   *       200:
   *         description: API settings and compatibility information
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 apiVersion:
   *                   type: string
   *                   description: Current API version
   *                 compatibility:
   *                   type: object
   *                   properties:
   *                     resolvedCompatibility:
   *                       type: boolean
   *                       description: Whether compatibility has been resolved
   *                     result:
   *                       type: string
   *                       description: Compatibility result
   *                 clientVersion:
   *                   type: string
   *                   description: Client version that was checked
   *                 keyBackupV2:
   *                   type: object
   *                   description: Key backup v2 rollout state
   *                   properties:
   *                     mode:
   *                       type: string
   *                       enum: [off, optin, auto]
   *                     available:
   *                       type: boolean
   *                     userVersion:
   *                       type: integer
   *                       nullable: true
   *                       description: Caller's backupVersion; null when signed out
   */
  settings: trpc
    .input(
      z.object({
        version: z.string(),
        appName: z.string().nullable(),
      })
    )
    .query(async ({ ctx, input: { version: clientVersion, appName } }) => {
      const compatibility = {
        resolvedCompatibility: false,
        result: 'UNRESOLVED',
      };

      const compatibilityResult = checkCompatibility(clientVersion, VERSION!);

      compatibility.result = compatibilityResult;
      compatibility.resolvedCompatibility = true;

      // When users use the tbpro addon, we don't want to check compatibility
      if (appName && appName.includes('addon')) {
        // If the client name includes 'addon', we don't want to check compatibility
        compatibility.result = 'COMPATIBLE';
        compatibility.resolvedCompatibility = true;
      }

      const apiVersion = VERSION;
      const mode = getKeyBackupV2Mode();
      let userVersion: number | null = null;
      if (ctx?.user?.id) {
        try {
          userVersion = await getBackupVersion(ctx.user.id);
        } catch (e) {
          console.error('settings: could not read backupVersion', e);
        }
      }
      const keyBackupV2 = { mode, available: mode !== 'off', userVersion };
      return { apiVersion, compatibility, clientVersion, keyBackupV2 };
    }),

  /**
   * @openapi
   * /trpc/resetKeys:
   *   post:
   *     tags:
   *       - Users
   *     summary: Reset user keys (Development Only)
   *     description: Resets user keys and deletes all containers and uploads (Development Only)
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Keys reset successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   description: Whether the reset was successful
   *       409:
   *         description: CONFLICT with message BACKUP_FORMAT_SUPERSEDED when the user is on backup format v2
   */
  resetKeys: trpc
    .use(isAuthed)
    // The client must generate and hand us a fresh, already-encrypted key blob
    // so we can swap it in atomically instead of nulling the recovery material
    // and hoping setup completes before the user closes the tab (issue #1116).
    .input(
      z.object({
        publicKey: z.string().min(1),
        backupKeypair: z.string().min(1),
        backupKeystring: z.string().min(1),
        backupSalt: z.string().min(1),
        backupContainerKeys: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const id = ctx.user.id;
      try {
        await assertLegacyBackupWritable(id, 'resetKeys');
      } catch (e) {
        if (e instanceof BaseError && e.message === BACKUP_FORMAT_SUPERSEDED) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: BACKUP_FORMAT_SUPERSEDED,
          });
        }
        throw e;
      }
      try {
        // 1. Write-new-then-swap: install the confirmed replacement blob FIRST.
        //    Only once this succeeds is it safe to abandon the old containers.
        await resetKeys(id, input);
      } catch (e) {
        console.error(e);
        throw new TRPCError({
          message: 'Could not reset keys',
          code: 'UNPROCESSABLE_CONTENT',
        });
      }

      // 2. Delete the old containers/uploads. Their keys only existed in the
      //    blob we just replaced, so they are unreachable either way. A failure
      //    here must NOT surface as a failed reset: the client would then never
      //    adopt or show the new passphrase, leaving a server blob nobody can
      //    open (the exact lockout #1116 exists to prevent). Log and move on;
      //    anything left behind can be cleaned up later.
      try {
        await deleteUserContent(id);
      } catch (e) {
        console.error('resetKeys: key swap succeeded but cleanup failed', e);
      }

      return { success: true };
    }),

  /**
   * @openapi
   * /trpc/upgradeKeys:
   *   post:
   *     tags:
   *       - Users
   *     summary: Install a v2 key backup and a new public key
   *     description: >
   *       Atomically replaces the public key and backup with a v2 envelope and
   *       clears the legacy backup columns. Optionally re-wraps item keys in
   *       containers the caller owns (each guarded by expectedWrappedKey) and
   *       deletes the caller's access links. Refused while KEY_BACKUP_V2_MODE is off.
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Upgrade applied
   *       400:
   *         description: Malformed input or backup envelope
   *       409:
   *         description: CONFLICT (KEY_UPGRADE_STALE) when an item changed or is not the caller's; nothing is written
   *       412:
   *         description: PRECONDITION_FAILED (KEY_BACKUP_V2_DISABLED) when the mode is off
   */
  upgradeKeys: trpc
    .use(isAuthed)
    .input(
      z.object({
        publicKey: z.string().min(1),
        backup: backupV2Json,
        backupVersion: z.literal(KEY_BACKUP_V2),
        // Container.wrappedKey is written at creation but never read, so there
        // is nothing to update server-side; accepted for forward compatibility.
        containers: z
          .array(z.object({ id: z.string(), wrappedKey: z.string() }))
          .optional(),
        items: z
          .array(
            z.object({
              id: z.number().int(),
              wrappedKey: z.string().min(1),
              expectedWrappedKey: z.string().min(1),
            })
          )
          .optional(),
        revokeLinks: z.boolean().optional(),
        trigger: z.enum(['optin', 'auto']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (getKeyBackupV2Mode() === 'off') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'KEY_BACKUP_V2_DISABLED',
        });
      }
      const userId = ctx.user.id;
      try {
        const { from, items, linksRevoked } = await upgradeKeys(
          userId,
          input as KeyUpgrade
        );
        console.info(
          'key backup upgraded',
          JSON.stringify({
            userId,
            from,
            to: KEY_BACKUP_V2,
            trigger: input.trigger,
            items,
            linksRevoked,
          })
        );
        return { backupVersion: KEY_BACKUP_V2, linksRevoked };
      } catch (e) {
        if (e instanceof BaseError) {
          throw new TRPCError({ code: 'CONFLICT', message: e.message });
        }
        console.error('upgradeKeys failed', e);
        throw new TRPCError({
          code: 'UNPROCESSABLE_CONTENT',
          message: 'Could not upgrade keys',
        });
      }
    }),

  /**
   * @openapi
   * /trpc/deleteFiles:
   *   post:
   *     tags:
   *       - Users
   *     summary: Delete user files
   *     description: Deletes all user files, containers, and uploads (Development Only)
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Files deleted successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   description: Whether the deletion was successful
   */
  deleteFiles: trpc.use(isAuthed).mutation(async ({ ctx }) => {
    const id = ctx.user.id;
    try {
      await deleteUserContent(id);
      return { success: true };
    } catch (e) {
      console.error(e);
      throw new TRPCError({
        message: 'Could not reset keys',
        code: 'UNPROCESSABLE_CONTENT',
      });
    }
  }),

  /**
   * @openapi
   * /trpc/userLogin:
   *   post:
   *     tags:
   *       - Users
   *     summary: User login (Development Only)
   *     description: Authenticates a user with email and password (Development Only)
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               email:
   *                 type: string
   *                 description: User's email address
   *               password:
   *                 type: string
   *                 description: User's password
   *     responses:
   *       200:
   *         description: Login successful
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 state:
   *                   type: string
   *                   description: Login state token
   */
  userLogin: trpc
    .use(requirePublicLogin)
    .use((props) => useEnvironment(props, ['stage', 'development']))
    .input(
      z.object({
        email: z.string(),
        password: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      // Check if the user already exists
      try {
        const userData = await getHashedPassword(input.email);
        // If the user already exists, throw a conflict error
        if (!userData?.hashedPassword) {
          throw Error('User not found');
        }

        const isPasswordMatch = await verifyHash(
          input.password,
          userData.hashedPassword
        );

        if (!isPasswordMatch) {
          throw Error('Password does not match');
        }

        const { state } = await handleSuccessfulLogin(input.email, userData.id);
        return { state };
      } catch {
        throw new TRPCError({
          message: 'Incorrect email or password',
          code: 'BAD_REQUEST',
        });
      }
    }),

  isFTUE: trpc.use(isAuthed).query(async ({ ctx }) => {
    const isFTUEComplete = await getFTUEStatus(ctx.user.id);
    return { isFTUEComplete };
  }),

  markFTUEComplete: trpc.use(isAuthed).mutation(async ({ ctx }) => {
    await markFTUEComplete(ctx.user.id);
  }),

  /**
   * @openapi
   * /trpc/registerUser:
   *   post:
   *     tags:
   *       - Users
   *     summary: Register new user (Development Only)
   *     description: Creates a new user account (Development Only)
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               email:
   *                 type: string
   *                 description: User's email address
   *               password:
   *                 type: string
   *                 description: User's password
   *     responses:
   *       200:
   *         description: User registered successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 id:
   *                   type: number
   *                   description: ID of the newly created user
   *                 state:
   *                   type: string
   *                   description: Login state token
   */
  registerUser: trpc
    .use(requirePublicLogin)
    .use((props) => useEnvironment(props, ['stage', 'development']))
    .input(
      z.object({
        email: z.string(),
        password: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      // Check if the user already exists
      try {
        const userData = await getUserByEmailV2(input.email);
        // If the user already exists, throw a conflict error
        if (userData?.id) {
          throw Error('User already exists');
        }
      } catch {
        throw new TRPCError({
          message: 'User already exists',
          code: 'CONFLICT',
        });
      }

      try {
        const hashedPassword = await hashPassword(input.password);

        const { id } = await createUserWithPassword(
          input.email,
          hashedPassword
        );

        const { state } = await handleSuccessfulLogin(input.email, id);

        return { id, state };
      } catch (e) {
        console.error(e);
        throw new TRPCError({
          message: 'Unable to create new user',
          code: 'UNPROCESSABLE_CONTENT',
        });
      }
    }),
});

async function handleSuccessfulLogin(email: string, id: string) {
  const uid = uuidv4();
  // Generate the unique_id with the user's email
  const state = `${uid}____${email}`;

  const uniqueHash = createHash('sha256').update(uid).digest('hex');

  await updateUniqueHash(id, uniqueHash);

  await createLoginSession(state);
  return { state, id };
}
