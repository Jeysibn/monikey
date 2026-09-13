# Monikey Release Notes — Financial Correctness and Local-First Hardening

Date: 2026-09-13
Branch: `dev`
Latest commit: `146d220`

## Summary

This release hardens Monikey as a privacy-first personal financial tracker
with an integrated Crypto Portfolio. Core finance remains authoritative for
cash, accounts, transactions, budgets, goals, obligations and reports; crypto
adds wealth, cost-basis and performance context without becoming spendable
cash, ordinary income or an exchange workflow.

## Implemented

- Ledger update invariant validation, deterministic pagination and atomic
  financial mutations.
- Canonical frontend minor-unit strings for API-backed accounts, cards,
  transactions, budgets, goals and recurring items.
- `bigint` aggregation for core selectors and finance invariants, with exact
  minor-unit rendering at API-backed presentation boundaries.
- Deterministic same-time crypto event ordering and explicit P&L semantics.
- Crypto idempotency, atomic cash-linked reversal, provider degradation,
  historical asset handling, missing-FX semantics and sell-fee validation.
- IndexedDB snapshots, offline transaction/crypto/receipt outbox replay,
  explicit Sync Center retry/discard controls and browser Tesseract OCR.
- Per-user timezone-aware API and worker calendar behavior.
- Canonical `/crypto` route and retirement of the shadow generic investment
  implementation.

## Verification

- Frontend unit tests: 26 files / 263 tests passed.
- Frontend typecheck and production build passed.
- Backend Compose regression: 54 files / 382 tests passed.
- Backend-mode Compose E2E: 3/3 passed.
- Offline Compose E2E: 1/1 passed.
- Mock Playwright suite: 95/95 passed.
- Unsafe historical minor-unit load and exact mutation transport regressions
  passed.

## Operational limitations

Production backup scheduling, off-host retention, deployment restore drills,
ingress/TLS verification, production alert wiring and manual screen-reader
review remain deployment or environment-owned checks. Offline edit/delete
merge workflows, traditional securities, live banking connectivity and
private-key/wallet execution remain intentionally unsupported or deferred.

## Documentation

The detailed engineering log is maintained in the Monikey Obsidian project
area under `03 Projects/Monikey/04 Backend/Development Logs/`, alongside the
architecture, testing, operations and release notes.
