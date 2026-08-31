-- Phase 1 initial schema: users, sessions, preferences, categories,
-- financial accounts (assets + credit-card liabilities), credit card
-- details. Money is stored as BIGINT minor units. IDs are UUID.
--
-- Revised after QA Attempt 1 (2026-08-31): closes three invariant holes
-- (Findings 2, 6, 9) that let credit_card_details attach to a non-card
-- account, let a card's owed balance go unbounded when its details row was
-- absent/deleted, and let an asset account open with a negative balance.
-- See Database Schema.md for the authoritative description of every
-- constraint/trigger below — schema.prisma cannot represent any of them.

-- Extensions ---------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enums ----------------------------------------------------------------
CREATE TYPE "account_type" AS ENUM ('checking', 'savings', 'ewallet', 'cash', 'credit_card');
CREATE TYPE "account_classification" AS ENUM ('asset', 'liability');
CREATE TYPE "card_network" AS ENUM ('visa', 'mastercard');

-- users ----------------------------------------------------------------
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Manila',
    "base_currency" CHAR(3) NOT NULL DEFAULT 'PHP',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- user_sessions ----------------------------------------------------------------
CREATE TABLE "user_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "user_agent" TEXT,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_sessions_token_hash_key" ON "user_sessions"("token_hash");
CREATE INDEX "user_sessions_user_id_idx" ON "user_sessions"("user_id");

ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- user_preferences ----------------------------------------------------------------
-- Deliberate Phase-1 pre-provisioning (Phase 2 territory) — see the schema.prisma
-- comment on UserPreferences and the Phase 1 development log for the recorded
-- orchestrator decision to keep it here rather than split it into a later migration.
CREATE TABLE "user_preferences" (
    "user_id" UUID NOT NULL,
    "bill_due_reminders" BOOLEAN NOT NULL DEFAULT true,
    "budget_near_limit_warnings" BOOLEAN NOT NULL DEFAULT true,
    "weekly_summary_email" BOOLEAN NOT NULL DEFAULT false,
    "hide_cents" BOOLEAN NOT NULL DEFAULT false,
    "external_ai_enabled" BOOLEAN NOT NULL DEFAULT false,
    "external_ocr_enabled" BOOLEAN NOT NULL DEFAULT false,
    "detailed_ai_context_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- categories ----------------------------------------------------------------
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "budgetable" BOOLEAN NOT NULL DEFAULT true,
    "allows_income" BOOLEAN NOT NULL DEFAULT false,
    "allows_expense" BOOLEAN NOT NULL DEFAULT true,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "categories_allows_income_or_expense_chk" CHECK ("allows_income" OR "allows_expense")
);

CREATE INDEX "categories_user_id_idx" ON "categories"("user_id");

ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- financial_accounts ----------------------------------------------------------------
CREATE TABLE "financial_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "institution" TEXT,
    "account_type" "account_type" NOT NULL,
    "classification" "account_classification" NOT NULL,
    "currency_code" CHAR(3) NOT NULL DEFAULT 'PHP',
    "opening_balance_minor" BIGINT NOT NULL DEFAULT 0,
    "current_balance_minor" BIGINT NOT NULL DEFAULT 0,
    "last_four" TEXT,
    "sync_status" TEXT NOT NULL DEFAULT 'manual',
    "manual" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "financial_accounts_pkey" PRIMARY KEY ("id"),
    -- Asset accounts must never be allowed to overdraft (no-overdraft invariant),
    -- and must never even *open* negative (QA Attempt 1, Finding 9).
    CONSTRAINT "financial_accounts_asset_non_negative_chk"
        CHECK ("classification" <> 'asset' OR (
            "current_balance_minor" >= 0 AND "opening_balance_minor" >= 0
        )),
    -- account_type='credit_card' must always carry classification='liability' and vice versa.
    CONSTRAINT "financial_accounts_card_liability_chk"
        CHECK (("account_type" = 'credit_card') = ("classification" = 'liability'))
);

CREATE INDEX "financial_accounts_user_id_idx" ON "financial_accounts"("user_id");

ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- credit_card_details ----------------------------------------------------------------
CREATE TABLE "credit_card_details" (
    "account_id" UUID NOT NULL,
    "network" "card_network" NOT NULL,
    "credit_limit_minor" BIGINT NOT NULL,
    "due_day" INTEGER NOT NULL,
    "minimum_payment_minor" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "credit_card_details_pkey" PRIMARY KEY ("account_id"),
    CONSTRAINT "credit_card_details_credit_limit_positive_chk" CHECK ("credit_limit_minor" > 0),
    CONSTRAINT "credit_card_details_min_payment_non_negative_chk" CHECK ("minimum_payment_minor" >= 0),
    CONSTRAINT "credit_card_details_due_day_chk" CHECK ("due_day" BETWEEN 1 AND 31)
);

ALTER TABLE "credit_card_details" ADD CONSTRAINT "credit_card_details_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "financial_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Cross-table invariants (cannot be expressed as single-table CHECK
-- constraints, so they are enforced with triggers). Both of the following
-- are DEFERRABLE INITIALLY DEFERRED CONSTRAINT TRIGGERs so that, within one
-- transaction, an account row and its credit_card_details row can be
-- inserted in either order (or updated together) — the actual check only
-- runs at COMMIT (or an explicit `SET CONSTRAINTS ... IMMEDIATE`), by which
-- point both rows are guaranteed to be in their final state. This closes
-- QA Attempt 1's Finding 6: there is no more permanent "skip if missing"
-- escape hatch — a credit_card/liability account with no details row (ever,
-- not just mid-transaction) is rejected at commit.
-- ---------------------------------------------------------------------------

-- 1) credit_card_details must reference a credit_card/liability account
--    (Finding 2), and the account's owed balance must stay within
--    [0, credit_limit_minor].
CREATE OR REPLACE FUNCTION "enforce_credit_card_details_invariants"() RETURNS trigger AS $$
DECLARE
    acct_classification "account_classification";
    acct_type "account_type";
    owed BIGINT;
BEGIN
    SELECT fa."classification", fa."account_type", fa."current_balance_minor"
    INTO acct_classification, acct_type, owed
    FROM "financial_accounts" fa
    WHERE fa."id" = NEW."account_id";

    IF acct_classification IS NULL THEN
        RAISE EXCEPTION 'UNKNOWN_ACCOUNT: credit_card_details.account_id % does not reference an existing financial_accounts row', NEW."account_id";
    END IF;

    IF acct_classification <> 'liability' OR acct_type <> 'credit_card' THEN
        RAISE EXCEPTION 'CATEGORY_NOT_ALLOWED: credit_card_details.account_id % must reference a liability/credit_card account (got classification=%, account_type=%)',
            NEW."account_id", acct_classification, acct_type;
    END IF;

    IF owed < 0 OR owed > NEW."credit_limit_minor" THEN
        RAISE EXCEPTION 'CREDIT_LIMIT_EXCEEDED: card % owed % exceeds bounds [0, %]',
            NEW."account_id", owed, NEW."credit_limit_minor";
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "credit_card_details_invariants"
    AFTER INSERT OR UPDATE ON "credit_card_details"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION "enforce_credit_card_details_invariants"();

-- 2) Every credit_card/liability financial_accounts row must have a matching
--    credit_card_details row (no more "skip if missing"), and its owed
--    balance must stay within [0, credit_limit_minor]. Also (QA Attempt 2,
--    Finding D2): a row can never be UPDATEd *away* from credit_card/liability
--    while a credit_card_details row still references it — the original
--    version only checked the "is a card" branch and unconditionally
--    RETURNed NEW for every other case, so `UPDATE financial_accounts SET
--    account_type='cash', classification='asset'` on a live card sailed
--    through untouched, leaving `credit_card_details` pointing at a
--    now-asset account (the exact state Finding 2 forbids, reached from the
--    other direction). Because this is still a deferred constraint trigger,
--    the legitimate path — reclassify the account AND delete its
--    credit_card_details row in the same transaction, in that order — still
--    works: the immediate BEFORE DELETE guard on credit_card_details only
--    blocks the delete while account_type is *still* 'credit_card' at the
--    time of the delete statement, so reclassifying first makes the
--    follow-up delete succeed, and by COMMIT no orphaned details row remains
--    for this trigger to object to.
CREATE OR REPLACE FUNCTION "enforce_financial_account_card_invariants"() RETURNS trigger AS $$
DECLARE
    card_limit BIGINT;
    orphaned_details_count INTEGER;
BEGIN
    IF NEW."classification" <> 'liability' OR NEW."account_type" <> 'credit_card' THEN
        SELECT COUNT(*) INTO orphaned_details_count
        FROM "credit_card_details" ccd
        WHERE ccd."account_id" = NEW."id";

        IF orphaned_details_count > 0 THEN
            RAISE EXCEPTION 'CATEGORY_NOT_ALLOWED: account % cannot be reclassified away from credit_card/liability while a credit_card_details row still references it; delete the details row in the same transaction first', NEW."id";
        END IF;

        RETURN NEW;
    END IF;

    SELECT ccd."credit_limit_minor" INTO card_limit
    FROM "credit_card_details" ccd
    WHERE ccd."account_id" = NEW."id";

    IF card_limit IS NULL THEN
        RAISE EXCEPTION 'UNKNOWN_ACCOUNT: credit_card/liability account % has no matching credit_card_details row', NEW."id";
    END IF;

    IF NEW."current_balance_minor" < 0 OR NEW."current_balance_minor" > card_limit THEN
        RAISE EXCEPTION 'CREDIT_LIMIT_EXCEEDED: card % owed % exceeds bounds [0, %]',
            NEW."id", NEW."current_balance_minor", card_limit;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "financial_accounts_card_invariants"
    AFTER INSERT OR UPDATE ON "financial_accounts"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION "enforce_financial_account_card_invariants"();

-- 3) A credit_card_details row cannot be deleted on its own while its
--    account is still a live credit_card/liability account (it would
--    otherwise leave the card's owed balance unbounded — Finding 6's
--    "deleted details row" variant). A CASCADE delete from the parent
--    financial_accounts row is still allowed: by the time Postgres's
--    internal ON DELETE CASCADE fires this row's deletion, the parent row
--    is already gone, so the SELECT below finds nothing and the delete
--    proceeds.
CREATE OR REPLACE FUNCTION "prevent_orphaning_live_credit_card"() RETURNS trigger AS $$
DECLARE
    acct_still_card BOOLEAN;
BEGIN
    SELECT (fa."account_type" = 'credit_card') INTO acct_still_card
    FROM "financial_accounts" fa
    WHERE fa."id" = OLD."account_id";

    IF acct_still_card THEN
        RAISE EXCEPTION 'CATEGORY_NOT_ALLOWED: cannot delete credit_card_details for account % while it remains a credit_card account; archive or reclassify the account first', OLD."account_id";
    END IF;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "credit_card_details_prevent_orphan"
    BEFORE DELETE ON "credit_card_details"
    FOR EACH ROW EXECUTE FUNCTION "prevent_orphaning_live_credit_card"();
