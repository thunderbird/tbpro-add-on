-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "multipart" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "totalSize" INTEGER;

-- AlterTable
ALTER TABLE "Login" ADD COLUMN     "createdAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Upload" ADD COLUMN     "part" INTEGER;
