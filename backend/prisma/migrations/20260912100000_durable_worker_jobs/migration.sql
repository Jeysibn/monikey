CREATE TABLE "worker_jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "type" TEXT NOT NULL,
  "run_at" TIMESTAMPTZ(6) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 5,
  "locked_at" TIMESTAMPTZ(6),
  "locked_by" TEXT,
  "last_error" TEXT,
  "dedup_key" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "worker_jobs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "worker_jobs_dedup_key_key" ON "worker_jobs"("dedup_key");
CREATE INDEX "worker_jobs_status_run_at_idx" ON "worker_jobs"("status", "run_at");
