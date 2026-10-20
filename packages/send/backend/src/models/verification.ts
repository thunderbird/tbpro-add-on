import { PrismaClient } from '@prisma/client';
import { randomInt } from 'crypto';
const prisma = new PrismaClient();

export function getVerificationByCode(code: string) {
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000); // 1 minute ago

  return prisma.verification.findFirst({
    where: {
      code,
      createdAt: {
        gte: oneMinuteAgo, // Only return codes created within the last minute
      },
    },
    select: {
      id: true,
      createdAt: true,
    },
  });
}

function generateSixDigitOTP(): string {
  // Generate a random number between 100000 and 999999 (inclusive)
  const otp = randomInt(100000, 1000000);
  return otp.toString();
}

export function generateVerificationCode() {
  const code = generateSixDigitOTP();
  return prisma.verification.create({
    data: { code },
    select: {
      id: true,
      code: true,
      createdAt: true,
    },
  });
}

export function cleanupExpiredVerificationCodes() {
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000);

  return prisma.verification.deleteMany({
    where: {
      createdAt: {
        lt: oneMinuteAgo,
      },
    },
  });
}

export type EncryptedPassphraseData = {
  encryptedPassphrase: string;
  wrappedEncryptionKey: string;
  salt: string;
  codeSalt: string;
};

// Device-handoff rows are read within seconds of being stored.
export const ENCRYPTED_PASSPHRASE_READ_TTL_MS = 5 * 60 * 1000;
export const ENCRYPTED_PASSPHRASE_TTL_MS = 60 * 60 * 1000;
export const ENCRYPTED_PASSPHRASE_RATE_WINDOW_MS = 10 * 60 * 1000;
export const MAX_ENCRYPTED_PASSPHRASES_PER_WINDOW = 10;

export function cleanupExpiredEncryptedPassphrases() {
  const cutoff = new Date(Date.now() - ENCRYPTED_PASSPHRASE_TTL_MS);

  return prisma.encryptedPassphrase.deleteMany({
    where: {
      createdAt: {
        lt: cutoff,
      },
    },
  });
}

export function countRecentEncryptedPassphrases(ownerId: string) {
  const since = new Date(Date.now() - ENCRYPTED_PASSPHRASE_RATE_WINDOW_MS);

  return prisma.encryptedPassphrase.count({
    where: { ownerId, createdAt: { gte: since } },
  });
}

export function storeEncryptedPassphrase(
  data: EncryptedPassphraseData,
  ownerId: string
) {
  return prisma.encryptedPassphrase.create({
    data: {
      ...data,
      ownerId,
    },
    select: {
      id: true,
    },
  });
}

// Only the creator can read a row, and only while it is fresh. Rows are not
// deleted on read: every same-account client with a live onPassphraseShared
// subscription fetches it, so the first reader could starve the new device.
export function getEncryptedPassphrase(id: string, ownerId: string) {
  const since = new Date(Date.now() - ENCRYPTED_PASSPHRASE_READ_TTL_MS);

  return prisma.encryptedPassphrase.findFirst({
    where: { id, ownerId, createdAt: { gte: since } },
    select: {
      encryptedPassphrase: true,
      wrappedEncryptionKey: true,
      salt: true,
      codeSalt: true,
    },
  });
}
