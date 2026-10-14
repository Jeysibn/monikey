-- Favorite accounts: additive and nullable. Existing rows keep NULL (= not a favorite) and
-- existing preferences keep favorites_configured = false (= show suggested accounts).
ALTER TABLE "financial_accounts" ADD COLUMN "favorite_rank" SMALLINT;
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_favorite_rank_range" CHECK ("favorite_rank" IS NULL OR ("favorite_rank" BETWEEN 1 AND 4));
CREATE UNIQUE INDEX "financial_accounts_user_favorite_rank_key" ON "financial_accounts" ("user_id", "favorite_rank") WHERE "favorite_rank" IS NOT NULL;
ALTER TABLE "user_preferences" ADD COLUMN "favorites_configured" BOOLEAN NOT NULL DEFAULT false;
