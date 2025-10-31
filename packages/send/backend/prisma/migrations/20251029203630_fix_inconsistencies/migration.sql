/*
  Warnings:

  - The primary key for the `_ContainerToTag` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `_ItemToTag` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - A unique constraint covering the columns `[A,B]` on the table `_ContainerToTag` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[A,B]` on the table `_ItemToTag` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "_ContainerToTag" DROP CONSTRAINT "_ContainerToTag_AB_pkey";

-- AlterTable
ALTER TABLE "_ItemToTag" DROP CONSTRAINT "_ItemToTag_AB_pkey";

-- CreateIndex
CREATE UNIQUE INDEX "_ContainerToTag_AB_unique" ON "_ContainerToTag"("A", "B");

-- CreateIndex
CREATE UNIQUE INDEX "_ItemToTag_AB_unique" ON "_ItemToTag"("A", "B");
