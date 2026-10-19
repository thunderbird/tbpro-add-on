/*
  Warnings:

  - You are about to drop the `Invitation` table. All the data in the table will be lost.

*/
-- Folder invitations are removed: no code path reads or writes this table,
-- and folder access lives in "Membership", which is unaffected.

-- DropForeignKey
ALTER TABLE "Invitation" DROP CONSTRAINT "Invitation_recipientId_fkey";

-- DropForeignKey
ALTER TABLE "Invitation" DROP CONSTRAINT "Invitation_shareId_fkey";

-- DropTable
DROP TABLE "Invitation";

-- DropEnum
DROP TYPE "InvitationStatus";
