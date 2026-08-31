CREATE TABLE "goal_contributions" (
    "id" UUID NOT NULL,
    "goal_id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "source_account_id" UUID NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "goal_contributions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "goal_contributions_transaction_id_key" ON "goal_contributions"("transaction_id");
CREATE INDEX "goal_contributions_goal_id_created_at_idx" ON "goal_contributions"("goal_id", "created_at");
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_source_account_id_fkey" FOREIGN KEY ("source_account_id") REFERENCES "financial_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
