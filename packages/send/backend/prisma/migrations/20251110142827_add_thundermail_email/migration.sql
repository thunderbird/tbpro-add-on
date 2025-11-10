/*
  Warnings:

  - A unique constraint covering the columns `[thundermailEmail]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "thundermailEmail" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_thundermailEmail_key" ON "User"("thundermailEmail");
