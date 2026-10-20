import { beforeEach, describe, expect, it, vi } from 'vitest';

// Device-handoff passphrase rows: bounded base64 inputs, owned by the creator,
// rate-limited per user, readable only by their owner while fresh, and swept
// after an hour.
// The real model runs against an in-memory stand-in for the Prisma table.

type Row = {
  id: string;
  createdAt: Date;
  ownerId: string | null;
  encryptedPassphrase: string;
  wrappedEncryptionKey: string;
  salt: string;
  codeSalt: string;
};

type Where = {
  id?: string;
  ownerId?: string;
  createdAt?: { lt?: Date; gte?: Date };
};

const h = vi.hoisted(() => {
  const rows: Row[] = [];
  const matches = (row: Row, where: Where = {}) =>
    (where.id === undefined || row.id === where.id) &&
    (where.ownerId === undefined || row.ownerId === where.ownerId) &&
    (!where.createdAt?.lt || row.createdAt < where.createdAt.lt) &&
    (!where.createdAt?.gte || row.createdAt >= where.createdAt.gte);
  let nextId = 0;
  const table = {
    create: vi.fn(async ({ data }: { data: Omit<Row, 'id' | 'createdAt'> }) => {
      const row = { id: `row-${++nextId}`, createdAt: new Date(), ...data };
      rows.push(row);
      return { id: row.id };
    }),
    count: vi.fn(
      async ({ where }: { where: Where }) =>
        rows.filter((r) => matches(r, where)).length
    ),
    findFirst: vi.fn(async ({ where }: { where: Where }) => {
      const row = rows.find((r) => matches(r, where));
      if (!row) return null;
      const { encryptedPassphrase, wrappedEncryptionKey, salt, codeSalt } = row;
      return { encryptedPassphrase, wrappedEncryptionKey, salt, codeSalt };
    }),
    deleteMany: vi.fn(async ({ where }: { where: Where }) => {
      const doomed = rows.filter((r) => matches(r, where));
      doomed.forEach((r) => rows.splice(rows.indexOf(r), 1));
      return { count: doomed.length };
    }),
  };
  return { rows, table };
});

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(function () {
    return { encryptedPassphrase: h.table };
  }),
}));
vi.mock('@send-backend/models/sharing', () => ({}));
vi.mock('../../models/containers', () => ({}));
vi.mock('@send-backend/ws/verify', () => ({
  verificationEmitter: { emit: vi.fn() },
}));
vi.mock('../../trpc/middlewares', () => ({
  getAuthenticatedUserId: async (ctx: { user?: { id?: string } }) =>
    ctx?.user?.id ?? null,
  isAuthed: ({ ctx, next }: { ctx: { user: unknown }; next: () => unknown }) =>
    ctx?.user ? next() : Promise.reject(new Error('FORBIDDEN')),
}));

import {
  ENCRYPTED_PASSPHRASE_READ_TTL_MS,
  ENCRYPTED_PASSPHRASE_TTL_MS,
  MAX_ENCRYPTED_PASSPHRASES_PER_WINDOW,
} from '../../models/verification';
import { sharingRouter } from '../../trpc/sharing';

function callerFor(userId: string) {
  return sharingRouter.createCaller({
    res: null,
    authorization: null,
    user: { id: userId },
    cookies: { jwtToken: null, jwtRefreshToken: null },
    oidcUser: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

// Same encoding as the frontend's Util.arrayBufferToBase64.
const toBase64 = (buf: ArrayBuffer | Uint8Array) =>
  btoa(encodeURIComponent(String.fromCharCode(...new Uint8Array(buf))));

// Builds the payload exactly the way verification-store.ts does.
async function clientPayload(passphrase: string, code: string) {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const codeSalt = crypto.getRandomValues(new Uint8Array(16));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: salt },
    key,
    new TextEncoder().encode(passphrase)
  );
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(code),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  const wrappingKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: codeSalt, iterations: 100000, hash: 'SHA-256' },
    material,
    { name: 'AES-KW', length: 256 },
    true,
    ['wrapKey', 'unwrapKey']
  );
  const wrapped = await crypto.subtle.wrapKey(
    'raw',
    key,
    wrappingKey,
    'AES-KW'
  );
  return {
    encryptedPassphrase: toBase64(ciphertext),
    wrappedEncryptionKey: toBase64(wrapped),
    salt: toBase64(salt),
    codeSalt: toBase64(codeSalt),
  };
}

const small = {
  encryptedPassphrase: 'QUJD',
  wrappedEncryptionKey: 'REVG',
  salt: 'R0hJ',
  codeSalt: 'SktM',
};

describe('encrypted passphrase handoff', () => {
  beforeEach(() => {
    h.rows.length = 0;
    vi.clearAllMocks();
  });

  it('round-trips a real client payload to the same user', async () => {
    const payload = await clientPayload(
      'scissors umbrella question universe abstract elephant',
      '123456'
    );
    const caller = callerFor('user-a');

    const { success, id } = await caller.shareEncryptedPassphrase(payload);
    expect(success).toBe(true);
    expect(h.rows[0].ownerId).toBe('user-a');

    expect(await caller.getEncryptedPassphrase(id)).toEqual(payload);
    // Every same-account client fetches the row; a second read still works.
    expect(await caller.getEncryptedPassphrase(id)).toEqual(payload);
  });

  it('stops returning a row once it is past the read TTL', async () => {
    const { id } = await callerFor('user-a').shareEncryptedPassphrase(small);
    h.rows[0].createdAt = new Date(
      Date.now() - ENCRYPTED_PASSPHRASE_READ_TTL_MS - 1000
    );

    expect(await callerFor('user-a').getEncryptedPassphrase(id)).toBeNull();
  });

  it("does not return another user's row", async () => {
    const { id } = await callerFor('user-a').shareEncryptedPassphrase(small);

    expect(await callerFor('user-b').getEncryptedPassphrase(id)).toBeNull();
  });

  it.each(
    Object.entries({
      encryptedPassphrase: 4096,
      wrappedEncryptionKey: 2048,
      salt: 512,
      codeSalt: 512,
    })
  )('rejects an oversize %s with BAD_REQUEST', async (field, max) => {
    await expect(
      callerFor('user-a').shareEncryptedPassphrase({
        ...small,
        [field]: 'A'.repeat(max + 4),
      })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(h.table.create).not.toHaveBeenCalled();
  });

  it('rejects non-base64 input with BAD_REQUEST', async () => {
    await expect(
      callerFor('user-a').shareEncryptedPassphrase({
        ...small,
        salt: '<script>',
      })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('rejects the store after the per-user cap within the window', async () => {
    const caller = callerFor('user-a');
    for (let i = 0; i < MAX_ENCRYPTED_PASSPHRASES_PER_WINDOW; i++) {
      await caller.shareEncryptedPassphrase(small);
    }

    await expect(caller.shareEncryptedPassphrase(small)).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    });
    expect(h.rows).toHaveLength(MAX_ENCRYPTED_PASSPHRASES_PER_WINDOW);
    // Other users are unaffected.
    await expect(
      callerFor('user-b').shareEncryptedPassphrase(small)
    ).resolves.toMatchObject({ success: true });
  });

  it('sweeps rows older than the TTL, including legacy ownerless rows', async () => {
    const old = new Date(Date.now() - ENCRYPTED_PASSPHRASE_TTL_MS - 1000);
    h.rows.push(
      { id: 'stale', createdAt: old, ownerId: 'user-a', ...small },
      { id: 'legacy', createdAt: old, ownerId: null, ...small },
      { id: 'fresh', createdAt: new Date(), ownerId: 'user-b', ...small }
    );

    await callerFor('user-a').shareEncryptedPassphrase(small);

    expect(h.rows.map((r) => r.id)).not.toContain('stale');
    expect(h.rows.map((r) => r.id)).not.toContain('legacy');
    expect(h.rows.map((r) => r.id)).toContain('fresh');
  });
});
