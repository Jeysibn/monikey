-- Initialize a new, empty MoniKey database only.
-- Do not rerun this file against a database that contains user data.

CREATE TABLE accounts (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(60) NOT NULL UNIQUE,
  type VARCHAR(20) NOT NULL
    CHECK (type IN ('cash', 'bank', 'ewallet', 'credit_card')),
  opening_balance NUMERIC(12, 2) NOT NULL DEFAULT 0
    CHECK (opening_balance >= 0),
  opening_debt NUMERIC(12, 2) NOT NULL DEFAULT 0
    CHECK (opening_debt >= 0),
  credit_limit NUMERIC(12, 2),
  CHECK (
    (
      type = 'credit_card'
      AND credit_limit IS NOT NULL
      AND credit_limit > 0
      AND opening_balance = 0
    )
    OR
    (
      type <> 'credit_card'
      AND credit_limit IS NULL
      AND opening_debt = 0
    )
  )
);

CREATE TABLE categories (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(60) NOT NULL,
  type VARCHAR(10) NOT NULL CHECK (type IN ('income', 'expense')),
  UNIQUE (name, type)
);

CREATE TABLE transactions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  category_id INTEGER NOT NULL REFERENCES categories(id),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  transaction_date DATE NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE credit_card_payments (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_account_id INTEGER NOT NULL REFERENCES accounts(id),
  card_account_id INTEGER NOT NULL REFERENCES accounts(id),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (source_account_id <> card_account_id)
);

CREATE INDEX idx_transactions_account_date
  ON transactions(account_id, transaction_date DESC);

CREATE INDEX idx_card_payments_card_date
  ON credit_card_payments(card_account_id, payment_date DESC);
