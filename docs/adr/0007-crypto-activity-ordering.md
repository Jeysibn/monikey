# ADR-0007: Shared ordering for same-time crypto activity

- Status: Accepted
- Date: 2026-09-13
- Scope: Crypto Portfolio accounting

## Context

Crypto activities accept a user-entered date and optional time. A buy, sell and
transfer can therefore share the same financial timestamp. UUID ordering is
incorrect because UUIDs are random and can change whether buy-then-transfer or
buy-then-sell validation succeeds. `created_at` is not a sufficient
cross-table financial sequence because trades and transfers are separate tables
and timestamp precision can tie.

## Decision

Use one PostgreSQL sequence, `crypto_activity_sequence`, for both
`investment_trades.event_sequence` and `crypto_transfers.event_sequence`.
Accounting sorts by entered event time first and the shared persisted sequence
second. Existing rows are backfilled deterministically by `created_at, id` in
the migration. New requests reserve a unique sequence value before validation
and persist it on success; rejected requests may leave gaps. The sequence is
internal and is not user-editable or exposed in API response contracts.

Unit-only callers may omit the field and use a compatibility fallback, but all
database-backed accounting paths provide it.

## Consequences

- Same-timestamp accounting is deterministic across validation, reload,
  portfolio reconstruction and history calculations.
- The migration must be applied before a generated Prisma client expecting the
  new columns is used.
- Historical backfill preserves a deterministic order but cannot recover an
  undocumented intent that was never persisted.
- One global sequence keeps cross-table trade/transfer ordering unambiguous.

## Verification

- `backend/test/unit/cryptoPortfolioAccounting.test.ts` proves sequence order
  wins when UUID and `createdAt` order disagree.
- The Compose PostgreSQL regression applies the migration and passes all backend
  tests.
