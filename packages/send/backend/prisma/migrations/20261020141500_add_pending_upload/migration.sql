-- Reservation for a presigned upload URL that has not been finalized yet.
-- CreateTable
CREATE TABLE "PendingUpload" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "size" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PendingUpload_ownerId_expiresAt_idx" ON "PendingUpload"("ownerId", "expiresAt");

-- CreateIndex
CREATE INDEX "PendingUpload_expiresAt_idx" ON "PendingUpload"("expiresAt");
