import { Prisma, PrismaClient } from '@prisma/client';
import storage from '../storage';
import { fromPrismaV2 } from './prisma-helper';
const prisma = new PrismaClient();

import {
  BaseError,
  UPLOAD_NOT_CREATED,
  UPLOAD_NOT_FOUND,
  UPLOAD_SIZE_ERROR,
} from '../errors/models';
import {
  ECE_RECORD_SIZE,
  calculateEncryptedSize,
} from '../utils/encryptedSize';

export async function createUpload(
  id: string,
  size: number,
  ownerId: string,
  type: string,
  part?: number,
  fileHash?: string
) {
  // Verify against provider ground truth, not the client's stated number
  // (private #36). `size` is the PLAINTEXT size; storage holds ECE ciphertext,
  // which is deterministically larger. Compare the object actually on disk
  // against the encrypted size the plaintext claim implies, with a small
  // tolerance band:
  //   - lower bound: `calculateEncryptedSize(size)` — an object smaller than the
  //     ciphertext this plaintext size must produce means the claim was
  //     understated (the old `sizeOnDisk < size` check let this through, since a
  //     plaintext number is always below its own ciphertext size).
  //   - upper bound: one extra record. ECE padding can push the last record to
  //     a full record boundary, so the true ciphertext is `expected` or up to
  //     one `ECE_RECORD_SIZE` above it; anything beyond that is a client PUTting
  //     more than it declared.

  let sizeOnDisk = 0;

  try {
    sizeOnDisk = await storage.length(id);
  } catch (error) {
    console.error('ERROR reading storage length:', error);
  }

  const expectedEncrypted = calculateEncryptedSize(size);
  if (
    sizeOnDisk < expectedEncrypted ||
    sizeOnDisk > expectedEncrypted + ECE_RECORD_SIZE
  ) {
    throw new BaseError(UPLOAD_SIZE_ERROR);
  }

  try {
    return await prisma.upload.create({
      data: {
        id,
        size,
        ownerId,
        createdAt: new Date(),
        type,
        part,
        fileHash,
      },
    });
  } catch (error) {
    // Create-entry is retried by the client with the SAME server-minted id
    // (the id is generated once at /uploads/signed and reused across retries).
    // So a retry after the row already committed hits a unique-constraint
    // violation (Prisma P2002). That is not a failure — the row exists exactly
    // as we'd create it — so return it and let item-creation proceed, instead
    // of throwing forever and dooming the whole (multipart) upload. Only treat
    // it as success when the existing row belongs to the SAME owner, so a
    // (vanishingly unlikely) id collision across users can never hand back
    // another user's upload.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const existing = await prisma.upload.findUnique({ where: { id } });
      if (existing && existing.ownerId === ownerId) {
        return existing;
      }
    }
    console.error('ERROR creating upload:', error);
    throw new BaseError(UPLOAD_NOT_CREATED);
  }
}

export async function statUpload(id: string) {
  // Checking the stored size confirms that the file exists
  // and that we can query the storage by its id.
  return await storage.length(id);
}

export async function getUploadSize(id: string) {
  const query = {
    where: {
      id,
    },
    select: {
      size: true,
    },
  };

  const upload = await fromPrismaV2(
    prisma.upload.findUniqueOrThrow,
    query,
    UPLOAD_NOT_FOUND
  );
  return upload.size;
}

export async function getUploadParts(id: string) {
  const upload = await prisma.upload.findUnique({
    where: {
      id,
    },
    select: {
      items: {
        select: {
          wrappedKey: true,
        },
      },
    },
  });

  if (!upload || upload.items.length === 0) {
    throw new BaseError(UPLOAD_NOT_FOUND);
  }

  // Get the first wrappedKey from the upload items (they should)
  // This assumes that all items in the upload share the same wrappedKey.
  const wrappedKey = upload.items[0].wrappedKey;
  const multipartItems = await prisma.item.findMany({
    where: {
      wrappedKey,
    },
    select: {
      upload: {
        select: {
          id: true,
          part: true,
        },
      },
    },
  });
  return multipartItems.map(({ upload }) => upload);
}

export async function getUploadPartsByWrappedKey(wrappedKey: string) {
  const multipartItems = await prisma.item.findMany({
    where: {
      wrappedKey,
    },
    select: {
      upload: {
        select: {
          id: true,
          part: true,
        },
      },
    },
  });
  return multipartItems.map(({ upload }) => upload);
}

export const getItemsByUploadIdandWrappedKey = async (
  id: string,
  wrappedKey: string
) => {
  const items = await prisma.item.findFirst({
    where: {
      upload: {
        id,
      },
      wrappedKey,
    },
  });
  return items;
};

export async function getUploadMetadata(id: string) {
  const query = {
    where: {
      id,
    },
    select: {
      size: true,
      type: true,
    },
  };

  const upload = await fromPrismaV2(
    prisma.upload.findUniqueOrThrow,
    query,
    UPLOAD_NOT_FOUND
  );
  const { size, type } = upload;
  return { size, type };
}

// Report an upload as suspicious by its uploadId
export async function reportSuspiciousFile(uploadId: string) {
  // find all parts of the upload
  const parts = await getUploadParts(uploadId);
  const reportPromises = await Promise.all(
    parts.map(async ({ id }) => {
      // We need to get the fileHash from the uploadId to store it in the suspiciousFile table
      const { fileHash } = await prisma.upload.findUnique({
        where: { id },
        select: { fileHash: true },
      });
      return await prisma.suspiciousFile.create({
        data: { fileHash },
        select: { id: true },
      });
    })
  );
  return reportPromises;
}

// Check if a fileHash is in the suspiciousFile table and return a boolean
export async function checkHashAgainstSuspiciousFiles(fileHash: string) {
  const result = await prisma.suspiciousFile.findUnique({
    where: { fileHash },
    select: { id: true },
  });
  if (result?.id) {
    return true;
  }
  return false;
}

export async function checkIdAgainstSuspiciousFiles(id: string) {
  // Get the fileHash from the uploadId
  const { fileHash } = await prisma.upload.findUnique({
    where: { id },
    select: { fileHash: true },
  });
  if (!fileHash) {
    return false;
  }
  const result = await prisma.suspiciousFile.findUnique({
    where: { fileHash },
    select: { id: true },
  });
  if (result?.id) {
    return true;
  }
  return false;
}
