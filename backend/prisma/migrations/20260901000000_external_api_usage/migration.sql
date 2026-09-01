CREATE TABLE "external_api_usage" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "call_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "external_api_usage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "external_api_usage_provider_period_operation_key" ON "external_api_usage"("provider", "period", "operation");
