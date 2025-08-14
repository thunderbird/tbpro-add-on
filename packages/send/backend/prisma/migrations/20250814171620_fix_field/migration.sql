/*
  Warnings:

  - You are about to drop the column `passphraseCiphertext` on the `EncryptedPassphrase` table. All the data in the column will be lost.
  - Added the required column `encryptedPassphrase` to the `EncryptedPassphrase` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "EncryptedPassphrase" DROP COLUMN "passphraseCiphertext",
ADD COLUMN     "encryptedPassphrase" TEXT NOT NULL;
