/*
  Warnings:

  - You are about to drop the column `passwordHash` on the `AccessLink` table. All the data in the column will be lost.

*/
-- Deploy note: rows holding a `passwordHash` value are deleted directly in the
-- database immediately before this migration runs, so every surviving row is a
-- password-protected link and the plain default below labels them correctly.

-- AlterTable
ALTER TABLE "AccessLink" DROP COLUMN "passwordHash",
ADD COLUMN     "hasPassword" BOOLEAN NOT NULL DEFAULT true;
