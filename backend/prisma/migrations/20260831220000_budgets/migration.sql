CREATE TABLE "budget_periods" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "period_start" DATE NOT NULL,
  "period_end" DATE NOT NULL,
  "income_pool_minor" BIGINT NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "budget_periods_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "budget_allocations" (
  "id" UUID NOT NULL,
  "budget_period_id" UUID NOT NULL,
  "category_id" UUID NOT NULL,
  "allocated_minor" BIGINT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "budget_allocations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "budget_periods_user_id_period_start_period_end_key" ON "budget_periods"("user_id", "period_start", "period_end");
CREATE UNIQUE INDEX "budget_allocations_budget_period_id_category_id_key" ON "budget_allocations"("budget_period_id", "category_id");
CREATE INDEX "budget_periods_user_id_period_start_idx" ON "budget_periods"("user_id", "period_start");
ALTER TABLE "budget_periods" ADD CONSTRAINT "budget_periods_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "budget_allocations" ADD CONSTRAINT "budget_allocations_budget_period_id_fkey" FOREIGN KEY ("budget_period_id") REFERENCES "budget_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "budget_allocations" ADD CONSTRAINT "budget_allocations_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
