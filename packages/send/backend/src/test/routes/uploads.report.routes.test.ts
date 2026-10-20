import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Abuse-report flow (#1008) through the real routers and middleware, backed by
// an in-memory stand-in for the Prisma calls they make: a report needs proof of
// access and is only queued; an admin verdict is what blocks or unblocks.

type Upload = {
  id: string;
  fileHash: string;
  part: number | null;
  reported: boolean;
  reportPending: boolean;
};
type Link = { containerId: string; locked: boolean; expiryDate: Date | null };

const h = vi.hoisted(() => {
  const db = {
    uploads: new Map<string, Upload>(),
    items: [] as {
      uploadId: string;
      containerId: string;
      wrappedKey: string;
    }[],
    links: new Map<string, Link>(),
    members: new Map<string, string[]>(),
    admins: new Set<string>(),
    suspicious: new Set<string>(),
  };

  const itemMatches = (item, where) => {
    if (item.uploadId !== where.uploadId) return false;
    if (where.containerId && item.containerId !== where.containerId)
      return false;
    const linkWhere = where.container?.shares?.some?.accessLinks?.some;
    if (linkWhere) {
      const link = db.links.get(linkWhere.id);
      return (
        !!link &&
        link.containerId === item.containerId &&
        !link.locked &&
        (link.expiryDate === null || link.expiryDate > new Date())
      );
    }
    const userId = where.container?.group?.members?.some?.userId;
    return (db.members.get(item.containerId) ?? []).includes(userId);
  };

  const prisma = {
    item: {
      findFirst: vi.fn(async ({ where }) =>
        db.items.some((i) => itemMatches(i, where)) ? { id: 1 } : null
      ),
      findMany: vi.fn(async ({ where }) =>
        db.items
          .filter((i) => i.wrappedKey === where.wrappedKey)
          .map((i) => ({ upload: db.uploads.get(i.uploadId) }))
      ),
    },
    upload: {
      findUnique: vi.fn(async ({ where }) => {
        const upload = db.uploads.get(where.id);
        if (!upload) return null;
        const items = db.items.filter((i) => i.uploadId === where.id);
        return { ...upload, items };
      }),
      findMany: vi.fn(async ({ where }) =>
        where.id.in.map((id) => db.uploads.get(id)).filter(Boolean)
      ),
      update: vi.fn(async ({ where, data }) => {
        const upload = db.uploads.get(where.id);
        if (!upload) throw new Error('not found');
        Object.assign(upload, data);
        return { id: upload.id };
      }),
      updateMany: vi.fn(async ({ where, data }) => {
        for (const id of where.id.in) Object.assign(db.uploads.get(id), data);
      }),
    },
    suspiciousFile: {
      findUnique: vi.fn(async ({ where }) =>
        db.suspicious.has(where.fileHash) ? { id: 'sf' } : null
      ),
      createMany: vi.fn(async ({ data }) => {
        for (const { fileHash } of data) db.suspicious.add(fileHash);
      }),
      deleteMany: vi.fn(async ({ where }) => {
        for (const hash of where.fileHash.in) db.suspicious.delete(hash);
      }),
    },
    user: {
      findUnique: vi.fn(async ({ where }) => ({
        isAdmin: db.admins.has(where.id),
      })),
    },
    $transaction: vi.fn((ops) => Promise.all(ops)),
  };
  return { db, prisma };
});

vi.mock('@prisma/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@prisma/client')>()),
  PrismaClient: class {
    constructor() {
      return h.prisma;
    }
  },
}));

// Avoid the real storage client (Backblaze token timer + AWS SDK) at import.
vi.mock('@send-backend/storage', () => ({
  default: {
    del: vi.fn(),
    getDownloadBucketUrl: vi.fn(async () => 'https://bucket.example/signed'),
  },
}));

import containersRouter from '../../routes/containers';
import downloadRouter from '../../routes/download';
import uploadsRouter from '../../routes/uploads';
import { errorHandler } from '../../errors/routes';

const app = express();
app.use(express.json());
app.use('/api/uploads', uploadsRouter);
app.use('/api/containers', containersRouter);
app.use('/api/download', downloadRouter);
app.use(errorHandler);

const ACCESS = 'report-test-access-secret';
const REFRESH = 'report-test-refresh-secret';
process.env.ACCESS_TOKEN_SECRET = ACCESS;
process.env.REFRESH_TOKEN_SECRET = REFRESH;

const UPLOAD = '11111111-1111-4111-8111-111111111111';
const CONTAINER = '22222222-2222-4222-8222-222222222222';
const OTHER_CONTAINER = '33333333-3333-4333-8333-333333333333';
const LINK = 'live-link';
const OWNER = 'owner-user';
const ADMIN = 'admin-user';
const STRANGER = 'stranger-user';

function cookieFor(id: string) {
  const user = { id, uniqueHash: 'h', email: `${id}@x`, tier: 'FREE' };
  const access = jwt.sign(user, ACCESS);
  const refresh = jwt.sign(user, REFRESH);
  return `authorization=Bearer%20${access}; refresh_token=Bearer%20${refresh}`;
}

const download = () => request(app).get(`/api/download/${UPLOAD}/signed`);

beforeEach(() => {
  vi.clearAllMocks();
  const { db } = h;
  db.uploads.clear();
  db.uploads.set(UPLOAD, {
    id: UPLOAD,
    fileHash: 'hash-1',
    part: null,
    reported: false,
    reportPending: false,
  });
  db.items = [{ uploadId: UPLOAD, containerId: CONTAINER, wrappedKey: 'wk' }];
  db.links = new Map([
    [LINK, { containerId: CONTAINER, locked: false, expiryDate: null }],
    ['locked-link', { containerId: CONTAINER, locked: true, expiryDate: null }],
    [
      'expired-link',
      { containerId: CONTAINER, locked: false, expiryDate: new Date(0) },
    ],
  ]);
  db.members = new Map([[CONTAINER, [OWNER]]]);
  db.admins = new Set([ADMIN]);
  db.suspicious = new Set();
});

describe.each([
  ['POST /api/uploads/report', '/api/uploads/report'],
  ['POST /api/containers/:id/report', `/api/containers/${CONTAINER}/report`],
])('%s', (_name, path) => {
  const report = (body: object, cookie?: string) => {
    const req = request(app).post(path).send(body);
    return cookie ? req.set('Cookie', cookie) : req;
  };

  it('rejects an anonymous report without proof of access', async () => {
    const response = await report({ uploadId: UPLOAD });

    expect(response.status).toBe(403);
    expect(h.db.uploads.get(UPLOAD).reportPending).toBe(false);
  });

  it.each(['unknown-link', 'locked-link', 'expired-link'])(
    'rejects a report carrying %s',
    async (linkId) => {
      const response = await report({ uploadId: UPLOAD, linkId });
      expect(response.status).toBe(403);
    }
  );

  it('rejects a signed-in caller who is not a member', async () => {
    const response = await report({ uploadId: UPLOAD }, cookieFor(STRANGER));
    expect(response.status).toBe(403);
  });

  it('answers 400 for a uploadId that is not a uuid', async () => {
    const response = await report({ uploadId: 'not-a-uuid', linkId: LINK });
    expect(response.status).toBe(400);
  });

  it('queues a link recipient report without blocking the download', async () => {
    const response = await report({ uploadId: UPLOAD, linkId: LINK });

    expect(response.status).toBe(200);
    expect(h.db.uploads.get(UPLOAD)).toMatchObject({
      reportPending: true,
      reported: false,
    });
    expect(h.db.suspicious.size).toBe(0);
    expect((await download()).status).toBe(200);
  });

  it('accepts a report from a signed-in member', async () => {
    const response = await report({ uploadId: UPLOAD }, cookieFor(OWNER));

    expect(response.status).toBe(200);
    expect(h.db.uploads.get(UPLOAD).reportPending).toBe(true);
  });
});

describe('POST /api/containers/:containerId/report', () => {
  it('rejects an upload that is not in the path container', async () => {
    h.db.links.set('other', {
      containerId: OTHER_CONTAINER,
      locked: false,
      expiryDate: null,
    });
    h.db.items.push({
      uploadId: '44444444-4444-4444-8444-444444444444',
      containerId: OTHER_CONTAINER,
      wrappedKey: 'wk2',
    });

    const response = await request(app)
      .post(`/api/containers/${OTHER_CONTAINER}/report`)
      .send({ uploadId: UPLOAD, linkId: 'other' });

    expect(response.status).toBe(403);
    expect(h.db.uploads.get(UPLOAD).reportPending).toBe(false);
  });

  it('answers 400 for a containerId that is not a uuid', async () => {
    const response = await request(app)
      .post('/api/containers/not-a-uuid/report')
      .send({ uploadId: UPLOAD, linkId: LINK });
    expect(response.status).toBe(400);
  });
});

describe('POST /api/uploads/:uploadId/report/:verdict', () => {
  const verdict = (v: string, cookie?: string) => {
    const req = request(app).post(`/api/uploads/${UPLOAD}/report/${v}`);
    return cookie ? req.set('Cookie', cookie) : req;
  };

  it.each([
    ['anonymous', undefined],
    ['a non-admin member', cookieFor(OWNER)],
  ])('refuses %s caller', async (_who, cookie) => {
    const response = await verdict('confirm', cookie);

    expect(response.status).toBe(403);
    expect(h.db.suspicious.size).toBe(0);
  });

  it('confirm blocks the download; clear unblocks it', async () => {
    await request(app)
      .post('/api/uploads/report')
      .send({ uploadId: UPLOAD, linkId: LINK })
      .expect(200);

    const confirmed = await verdict('confirm', cookieFor(ADMIN));
    expect(confirmed.status).toBe(200);
    expect(h.db.uploads.get(UPLOAD)).toMatchObject({
      reported: true,
      reportPending: false,
    });
    expect(h.db.suspicious.has('hash-1')).toBe(true);
    expect((await download()).status).toBe(401);

    const cleared = await verdict('clear', cookieFor(ADMIN));
    expect(cleared.status).toBe(200);
    expect(h.db.uploads.get(UPLOAD)).toMatchObject({
      reported: false,
      reportPending: false,
    });
    expect(h.db.suspicious.size).toBe(0);
    expect((await download()).status).toBe(200);
  });

  it('applies the verdict to every part of a multipart upload', async () => {
    const PART2 = '55555555-5555-4555-8555-555555555555';
    h.db.uploads.set(PART2, {
      id: PART2,
      fileHash: 'hash-2',
      part: 2,
      reported: false,
      reportPending: false,
    });
    h.db.items.push({
      uploadId: PART2,
      containerId: CONTAINER,
      wrappedKey: 'wk',
    });

    await verdict('confirm', cookieFor(ADMIN)).expect(200);

    expect([...h.db.suspicious].sort()).toEqual(['hash-1', 'hash-2']);
    expect(h.db.uploads.get(PART2).reported).toBe(true);
  });

  it('404s (does not crash) for an unknown upload', async () => {
    const response = await request(app)
      .post('/api/uploads/66666666-6666-4666-8666-666666666666/report/clear')
      .set('Cookie', cookieFor(ADMIN));
    expect(response.status).toBe(404);
  });

  it('404s an unknown verdict', async () => {
    const response = await verdict('delete', cookieFor(ADMIN));
    expect(response.status).toBe(404);
  });
});
