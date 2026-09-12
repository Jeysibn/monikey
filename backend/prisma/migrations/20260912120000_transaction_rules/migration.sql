CREATE TABLE "transaction_rules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "user_id" UUID NOT NULL,
  "name" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT true,
  "priority" INTEGER NOT NULL DEFAULT 100, "conditions" JSONB NOT NULL,
  "actions" JSONB NOT NULL, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "transaction_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "transaction_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX "transaction_rules_user_id_enabled_priority_idx" ON "transaction_rules"("user_id", "enabled", "priority");
