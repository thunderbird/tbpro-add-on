-- One row per orphaned-storage sweep: leader bookkeeping, the bucket listing
-- cursor to resume from, and the counters of the run.
-- CreateTable
CREATE TABLE "StorageSweep" (
    "id" SERIAL NOT NULL,
    "instanceId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "cursor" TEXT,
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "capped" BOOLEAN NOT NULL DEFAULT false,
    "rowOrphans" INTEGER NOT NULL DEFAULT 0,
    "bucketOrphans" INTEGER NOT NULL DEFAULT 0,
    "deleted" INTEGER NOT NULL DEFAULT 0,
    "kept" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "StorageSweep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StorageSweep_startedAt_idx" ON "StorageSweep"("startedAt");

