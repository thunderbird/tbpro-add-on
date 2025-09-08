-- AlterTable
ALTER TABLE "Upload" ADD COLUMN     "fileHash" TEXT;

-- CreateTable
CREATE TABLE "SuspiciousFile" (
    "id" UUID NOT NULL,
    "fileHash" TEXT NOT NULL,

    CONSTRAINT "SuspiciousFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SuspiciousFile_id_key" ON "SuspiciousFile"("id");

-- CreateIndex
CREATE UNIQUE INDEX "SuspiciousFile_fileHash_key" ON "SuspiciousFile"("fileHash");
