-- Add Kakeibo planning and reflection metadata without changing financial rows.
-- Verify a backup before applying to an existing database. See database/README.md.
BEGIN;

ALTER TABLE categories
  ADD COLUMN default_kakeibo_envelope VARCHAR(12),
  ADD CONSTRAINT categories_default_kakeibo_envelope_allowed
    CHECK (
      default_kakeibo_envelope IS NULL OR
      default_kakeibo_envelope IN ('needs', 'wants', 'culture', 'unexpected')
    ),
  ADD CONSTRAINT categories_default_kakeibo_envelope_expense_only
    CHECK (default_kakeibo_envelope IS NULL OR type = 'expense');

ALTER TABLE transactions
  ADD COLUMN kakeibo_envelope VARCHAR(12),
  ADD CONSTRAINT transactions_kakeibo_envelope_allowed
    CHECK (
      kakeibo_envelope IS NULL OR
      kakeibo_envelope IN ('needs', 'wants', 'culture', 'unexpected')
    );

CREATE INDEX idx_transactions_kakeibo_date_envelope
  ON transactions (transaction_date, kakeibo_envelope);

CREATE TABLE kakeibo_month_plans (
  month DATE PRIMARY KEY
    CHECK (month = date_trunc('month', month)::date),
  planned_income NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (planned_income >= 0),
  allocated_starting_funds NUMERIC(12, 2) NOT NULL DEFAULT 0
    CHECK (allocated_starting_funds >= 0),
  savings_target NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (savings_target >= 0),
  prior_period_debt_reserve NUMERIC(12, 2) NOT NULL DEFAULT 0
    CHECK (prior_period_debt_reserve >= 0),
  needs_limit NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (needs_limit >= 0),
  wants_limit NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (wants_limit >= 0),
  culture_limit NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (culture_limit >= 0),
  unexpected_limit NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (unexpected_limit >= 0),
  monthly_intention VARCHAR(240)
    CHECK (monthly_intention IS NULL OR length(monthly_intention) <= 240),
  actual_saved_declared NUMERIC(12, 2)
    CHECK (actual_saved_declared IS NULL OR actual_saved_declared >= 0),
  review_available TEXT CHECK (review_available IS NULL OR length(review_available) <= 1000),
  review_savings TEXT CHECK (review_savings IS NULL OR length(review_savings) <= 1000),
  review_change TEXT CHECK (review_change IS NULL OR length(review_change) <= 1000),
  review_appreciated TEXT CHECK (review_appreciated IS NULL OR length(review_appreciated) <= 1000),
  review_surprise TEXT CHECK (review_surprise IS NULL OR length(review_surprise) <= 1000),
  review_lesson TEXT CHECK (review_lesson IS NULL OR length(review_lesson) <= 1000),
  reviewed_at TIMESTAMPTZ,
  review_actuals_snapshot JSONB
    CHECK (
      review_actuals_snapshot IS NULL OR
      (
        jsonb_typeof(review_actuals_snapshot) = 'object'
        AND review_actuals_snapshot ?& ARRAY[
          'actual_income', 'total_expenses', 'unclassified', 'envelopes'
        ]
        AND (review_actuals_snapshot - ARRAY[
          'actual_income', 'total_expenses', 'unclassified', 'envelopes'
        ]) = '{}'::jsonb
        AND jsonb_typeof(review_actuals_snapshot -> 'actual_income') = 'string'
        AND (review_actuals_snapshot ->> 'actual_income') ~ '^[0-9]{1,10}\.[0-9]{2}$'
        AND jsonb_typeof(review_actuals_snapshot -> 'total_expenses') = 'string'
        AND (review_actuals_snapshot ->> 'total_expenses') ~ '^[0-9]{1,10}\.[0-9]{2}$'
        AND jsonb_typeof(review_actuals_snapshot -> 'unclassified') = 'string'
        AND (review_actuals_snapshot ->> 'unclassified') ~ '^[0-9]{1,10}\.[0-9]{2}$'
        AND jsonb_typeof(review_actuals_snapshot -> 'envelopes') = 'object'
        AND (review_actuals_snapshot -> 'envelopes') ?& ARRAY[
          'needs', 'wants', 'culture', 'unexpected'
        ]
        AND ((review_actuals_snapshot -> 'envelopes') - ARRAY[
          'needs', 'wants', 'culture', 'unexpected'
        ]) = '{}'::jsonb
        AND jsonb_typeof(review_actuals_snapshot #> '{envelopes,needs}') = 'string'
        AND (review_actuals_snapshot #>> '{envelopes,needs}') ~ '^[0-9]{1,10}\.[0-9]{2}$'
        AND jsonb_typeof(review_actuals_snapshot #> '{envelopes,wants}') = 'string'
        AND (review_actuals_snapshot #>> '{envelopes,wants}') ~ '^[0-9]{1,10}\.[0-9]{2}$'
        AND jsonb_typeof(review_actuals_snapshot #> '{envelopes,culture}') = 'string'
        AND (review_actuals_snapshot #>> '{envelopes,culture}') ~ '^[0-9]{1,10}\.[0-9]{2}$'
        AND jsonb_typeof(review_actuals_snapshot #> '{envelopes,unexpected}') = 'string'
        AND (review_actuals_snapshot #>> '{envelopes,unexpected}') ~ '^[0-9]{1,10}\.[0-9]{2}$'
      )
    ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE kakeibo_weekly_reviews (
  week_start DATE PRIMARY KEY CHECK (EXTRACT(ISODOW FROM week_start) = 1),
  surprise_note TEXT CHECK (surprise_note IS NULL OR length(surprise_note) <= 1000),
  worthwhile_note TEXT CHECK (worthwhile_note IS NULL OR length(worthwhile_note) <= 1000),
  next_week_intention TEXT CHECK (next_week_intention IS NULL OR length(next_week_intention) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
