-- Key backup format v2: the whole backup lives in one JSON column. Existing
-- rows keep backupVersion = 1 and their legacy backup* columns untouched.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "backup" TEXT,
ADD COLUMN     "backupVersion" INTEGER NOT NULL DEFAULT 1;
