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

export async function storeEncryptedPassphrase(data: EncryptedPassphraseData) {
  return prisma.encryptedPassphrase.create({
    data: {
      ...data,
    },
    select: {
      id: true,
    },
  });
}

export async function getEncryptedPassphrase(id: string) {
  return prisma.encryptedPassphrase.findUnique({
    where: { id },
    select: {
      encryptedPassphrase: true,
      wrappedEncryptionKey: true,
      salt: true,
      codeSalt: true,
    },
  });
}
