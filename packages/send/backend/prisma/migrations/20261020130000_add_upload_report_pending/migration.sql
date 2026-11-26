-- A user report now waits for admin review instead of blocking the file at once.
ALTER TABLE "Upload" ADD COLUMN     "reportPending" BOOLEAN NOT NULL DEFAULT false;
