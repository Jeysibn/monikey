CREATE TYPE "recurring_frequency" AS ENUM ('weekly', 'monthly', 'yearly');
CREATE TYPE "recurring_status" AS ENUM ('active', 'paused');

CREATE TABLE "recurring_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "merchant" TEXT NOT NULL,
    "amount_minor" BIGINT NOT NULL CHECK ("amount_minor" > 0),
    "frequency" "recurring_frequency" NOT NULL,
    "next_due_date" DATE NOT NULL,
    "account_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "autopay" BOOLEAN NOT NULL DEFAULT false,
    "status" "recurring_status" NOT NULL DEFAULT 'active',
    "last_paid_date" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "recurring_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "recurring_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "recurring_items_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "financial_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "recurring_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "recurring_items_user_id_next_due_date_idx" ON "recurring_items"("user_id", "next_due_date");
CREATE INDEX "recurring_items_user_id_status_idx" ON "recurring_items"("user_id", "status");
