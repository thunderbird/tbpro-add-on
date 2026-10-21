import { ContainerType } from '@prisma/client';

import 'dotenv/config';
import { Request, Router } from 'express';

import {
  addErrorHandling,
  USER_ERRORS,
  wrapAsyncHandler,
} from '../errors/routes';

import {
  assertLegacyBackupWritable,
  getAdminStatus,
  getAllUserGroupContainers,
  getBackup,
  getFTUEStatus,
  getUserById,
  getUserPublicKey,
  setBackup,
  updateUserPublicKey,
  deleteUser,
  getAllUsers,
} from '../models/users';

import { getDataFromAuthenticatedRequest } from '@send-backend/auth/client';
import { KEY_BACKUP_V2 } from '@send-backend/config';
import {
  BACKUP_FORMAT_SUPERSEDED,
  BaseError,
} from '@send-backend/errors/models';
import { requireAdminPermisions, requireJWT } from '../middleware';

const router: Router = Router();

/**
 * @swagger
 * /api/users/me:
 *   get:
 *     tags: [Users]
 *     summary: Get current user information
 *     description: Retrieves the logged-in user from the current session
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *       404:
 *         description: User not found
 */
router.get(
  '/me',
  requireJWT,
  wrapAsyncHandler(async (req, res) => {
    const { id } = getDataFromAuthenticatedRequest(req);

    const user = await getUserById(id);
    if (!user) {
      return res.status(404).json({
        message: 'User not found.',
      });
    }
    return res.status(200).json({
      message: 'success',
      user,
    });
  })
);

/**
 * @swagger
 * /api/users/publickey/{id}:
 *   get:
 *     tags: [Users]
 *     summary: Get user's public key
 *     description: Retrieves the public key for a specific user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *     responses:
 *       200:
 *         description: Public key retrieved successfully
 *       404:
 *         description: Public key not found
 */
router.get(
  '/publickey/:id',
  requireJWT,
  addErrorHandling(USER_ERRORS.PUBLIC_KEY_NOT_FOUND),
  wrapAsyncHandler(async (req, res) => {
    const { id } = getDataFromAuthenticatedRequest(req);
    const user = await getUserPublicKey(id);
    res.status(200).json(user);
  })
);

// Update user's public key
// TODO: decide whether this should just be a "profile update" function
// that can take any of the following: email, publicKey, avatar...
/**
 * @swagger
 * /api/users/publickey:
 *   post:
 *     tags: [Users]
 *     summary: Update user's public key
 *     description: Updates the public key for the authenticated user
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               publicKey:
 *                 type: string
 *     responses:
 *       200:
 *         description: Public key updated successfully
 *       400:
 *         description: Profile update failed
 */
router.post(
  '/publickey',
  requireJWT,
  addErrorHandling(USER_ERRORS.PROFILE_NOT_UPDATED),
  wrapAsyncHandler(async (req, res) => {
    const {
      publicKey,
    }: {
      publicKey: string;
    } = req.body;

    const { id } = getDataFromAuthenticatedRequest(req);

    const update = await updateUserPublicKey(
      id,
      JSON.stringify(publicKey).trim()
    );
    res.status(200).json({
      update,
    });
  })
);

/**
 * @swagger
 * /api/users/folders:
 *   get:
 *     tags: [Users]
 *     summary: Get user's folders
 *     description: Retrieves all folders for the authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Folders retrieved successfully
 *       404:
 *         description: Folders not found
 */
router.get(
  '/folders',
  requireJWT,
  addErrorHandling(USER_ERRORS.FOLDERS_NOT_FOUND),
  wrapAsyncHandler(async (req, res) => {
    const { id } = getDataFromAuthenticatedRequest(req);

    const containers = await getAllUserGroupContainers(
      id,
      ContainerType.FOLDER
    );
    res.status(200).json(containers);
  })
);

// everything above this line is confirmed for q1-dogfood use
// ==================================================================================

/**
 * @swagger
 * /api/users/login:
 *   post:
 *     tags: [Users]
 *     summary: User login
 *     description: Authenticates and logs in a user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Login successful
 *       404:
 *         description: Login failed
 */
router.post(
  '/login',
  requireJWT,
  addErrorHandling(USER_ERRORS.DEV_LOGIN_FAILED),
  wrapAsyncHandler(async (req, res) => {
    const { id } = getDataFromAuthenticatedRequest(req);
    const user = await getUserById(id);

    if (user) {
      res.status(200).json(user);
    } else {
      res.status(404).send();
    }
  })
);

/**
 * @swagger
 * /api/users/backup:
 *   post:
 *     tags: [Users]
 *     summary: Create authenticated user backup
 *     description: Creates a backup for the authenticated user
 *
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               keys:
 *                 type: string
 *               keypair:
 *                 type: string
 *               keystring:
 *                 type: string
 *               salt:
 *                 type: string
 *     responses:
 *       200:
 *         description: Backup created successfully
 *       400:
 *         description: Backup failed
 *       409:
 *         description: The user is on backup format v2; legacy writes are refused (code BACKUP_FORMAT_SUPERSEDED)
 */
router.post(
  '/backup',
  requireJWT,
  addErrorHandling(USER_ERRORS.BACKUP_FAILED),
  wrapAsyncHandler(async (req, res) => {
    const { id } = getDataFromAuthenticatedRequest(req);
    try {
      await assertLegacyBackupWritable(id, 'POST /api/users/backup');
    } catch (e) {
      if (e instanceof BaseError && e.message === BACKUP_FORMAT_SUPERSEDED) {
        const { statusCode, message } = USER_ERRORS.BACKUP_FORMAT_SUPERSEDED;
        return res
          .status(statusCode)
          .json({ statusCode, code: BACKUP_FORMAT_SUPERSEDED, message });
      }
      throw e;
    }
    const { keys, keypair, keystring, salt } = req.body;
    // We're not using the return value, but we want to make sure the backup runs
    await setBackup(id, keys, keypair, keystring, salt);
    res.status(200).json({
      message: 'backup complete',
    });
  })
);

/**
 * @swagger
 * /api/users/backup:
 *   get:
 *     tags: [Users]
 *     summary: Get authenticated user backup
 *     description: Retrieves the backup for the authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: >
 *           Backup retrieved successfully. Users on backup format v1 get the
 *           legacy fields; users on v2 get only the v2 envelope (a JSON string)
 *           and the legacy fields are absent.
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   properties:
 *                     backupContainerKeys:
 *                       type: string
 *                     backupKeypair:
 *                       type: string
 *                     backupKeystring:
 *                       type: string
 *                     backupSalt:
 *                       type: string
 *                 - type: object
 *                   properties:
 *                     backupVersion:
 *                       type: integer
 *                       enum: [2]
 *                     backup:
 *                       type: string
 *                       description: v2 backup envelope, JSON-encoded
 *       404:
 *         description: Backup not found
 */
router.get(
  '/backup',
  requireJWT,
  addErrorHandling(USER_ERRORS.BACKUP_NOT_FOUND),
  wrapAsyncHandler(async (req, res) => {
    try {
      const { id } = getDataFromAuthenticatedRequest(req);
      const row = await getBackup(id);
      if (!row) {
        return res.status(200).json(row);
      }
      const { backup, backupVersion, ...legacy } = row;
      if (backupVersion >= KEY_BACKUP_V2) {
        return res.status(200).json({ backupVersion, backup });
      }
      res.status(200).json(legacy);
    } catch {
      res.status(USER_ERRORS.BACKUP_NOT_FOUND.statusCode).json({
        message: USER_ERRORS.BACKUP_NOT_FOUND.message,
      });
    }
  })
);

/**
 * @swagger
 * /api/users/ftue:
 *   get:
 *     tags: [Users]
 *     summary: Get FTUE status
 *     description: Returns whether the first-time user experience has been completed for the authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: FTUE status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isFTUEComplete:
 *                   type: boolean
 */
router.get('/ftue', requireJWT, async (req: Request, res) => {
  const { id } = getDataFromAuthenticatedRequest(req);
  const isFTUEComplete = await getFTUEStatus(id);
  res.status(200).json({ isFTUEComplete });
});

/**
 * @swagger
 * /api/users/is-admin:
 *   get:
 *     tags: [Users]
 *     summary: Check if user is admin
 *     description: Returns whether the authenticated user has admin permissions
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Admin status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isAdmin:
 *                   type: boolean
 */
router.get('/is-admin', requireJWT, async (req: Request, res) => {
  const { id } = getDataFromAuthenticatedRequest(req);
  const isAdmin = await getAdminStatus(id);
  res.status(200).json({ isAdmin: isAdmin ?? false });
});

/* ADMIN ONLY ROUTES */

/**
 * @swagger
 * /api/users/all-users:
 *   get:
 *     tags: [Users]
 *     summary: Get all users (admin only)
 *     description: Retrieves all users except the currently authenticated admin user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All users retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *       403:
 *         description: Forbidden - admin permissions required
 */
router.get(
  '/all-users',
  requireJWT,
  requireAdminPermisions,
  async (req, res) => {
    const { id } = getDataFromAuthenticatedRequest(req);
    const users = await getAllUsers();
    const allUsersExceptCurrent = users.filter((user) => user.id !== id);
    return res.status(200).json(allUsersExceptCurrent);
  }
);

/**
 * @swagger
 * /api/users/{id}:
 *   delete:
 *     tags: [Users]
 *     summary: Delete a user (admin only)
 *     description: Permanently deletes a user by ID. Admins cannot delete their own account.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the user to delete
 *     responses:
 *       200:
 *         description: User deleted successfully
 *       400:
 *         description: Cannot delete your own user
 *       403:
 *         description: Forbidden - admin permissions required
 *       404:
 *         description: User not found or deletion failed
 */
router.delete(
  '/:id',
  requireJWT,
  requireAdminPermisions,
  addErrorHandling(USER_ERRORS.USER_NOT_DELETED),
  wrapAsyncHandler(async (req, res) => {
    const { id } = getDataFromAuthenticatedRequest(req);
    // make sure we don't delete our own user by accident
    if (id === req.params.id) {
      return res.status(400).json({
        message: 'You cannot delete your own user.',
      });
    }

    await deleteUser(req.params.id);

    return res.status(200).json({ message: 'User data deleted successfully.' });
  })
);

export default router;
