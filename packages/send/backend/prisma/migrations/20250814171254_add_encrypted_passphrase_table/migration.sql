-- CreateTable
CREATE TABLE "EncryptedPassphrase" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "passphraseCiphertext" TEXT NOT NULL,
    "wrappedEncryptionKey" TEXT NOT NULL,
    "salt" TEXT NOT NULL,
    "codeSalt" TEXT NOT NULL,

    CONSTRAINT "EncryptedPassphrase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EncryptedPassphrase_id_key" ON "EncryptedPassphrase"("id");
