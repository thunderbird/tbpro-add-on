-- Short-lived device-handoff rows: tie each to its creator so it can be
-- rate-limited per user and removed with the account. Existing rows keep a
-- NULL owner and expire via the opportunistic cleanup.

-- AlterTable
ALTER TABLE "EncryptedPassphrase" ADD COLUMN     "ownerId" UUID;

-- CreateIndex
CREATE INDEX "EncryptedPassphrase_ownerId_createdAt_idx" ON "EncryptedPassphrase"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "EncryptedPassphrase_createdAt_idx" ON "EncryptedPassphrase"("createdAt");

-- AddForeignKey
ALTER TABLE "EncryptedPassphrase" ADD CONSTRAINT "EncryptedPassphrase_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

