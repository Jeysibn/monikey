-- Phase 8: FX rate snapshots for multi-currency support.
-- Persists historical FX rates by (base, quote, date, provider).
-- Never overwrite historical rates — future queries for past dates will use the cached rate from that date.
-- Daily worker refreshes rates only for currencies actually in use by any user.

CREATE TABLE fx_rate_snapshots (
  base_currency CHAR(3) NOT NULL,
  quote_currency CHAR(3) NOT NULL,
  rate DECIMAL(20, 10) NOT NULL,
  provider VARCHAR(50) NOT NULL,
  rate_date DATE NOT NULL,
  fetched_at TIMESTAMPTZ(6) NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  PRIMARY KEY (base_currency, quote_currency, rate_date, provider),
  CONSTRAINT check_currencies_valid CHECK (base_currency ~ '^[A-Z]{3}$' AND quote_currency ~ '^[A-Z]{3}$'),
  CONSTRAINT check_rate_positive CHECK (rate > 0)
);

CREATE INDEX ix_fx_rate_snapshots_date ON fx_rate_snapshots (base_currency, quote_currency, rate_date DESC);
CREATE INDEX ix_fx_rate_snapshots_provider ON fx_rate_snapshots (provider, rate_date DESC);
