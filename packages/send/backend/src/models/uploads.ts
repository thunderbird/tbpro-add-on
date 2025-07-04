import { PrismaClient } from '@prisma/client';
import storage from '../storage';
import { fromPrismaV2 } from './prisma-helper';
const prisma = new PrismaClient();

import {
  BaseError,
  UPLOAD_NOT_CREATED,
  UPLOAD_NOT_FOUND,
  UPLOAD_SIZE_ERROR,
} from '../errors/models';

export async function createUpload(
  id: string,
  size: number,
  ownerId: string,
  type: string,
  part?: number
) {
  // Confirm that file `id` exists and what's on disk
  // is at least as large as the stated size.
  // (Encrypted files are larger than the decrypted contents)

  let sizeOnDisk = 0;

  try {
    sizeOnDisk = await storage.length(id);
  } catch (error) {
    console.error('ERROR reading storage length:', error);
  }

  if (sizeOnDisk < size) {
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
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
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
