# Changelog

All notable changes to MoniKey are recorded here, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## How versions work

MoniKey uses three numbers, `MAJOR.MINOR.PATCH` (for example `1.2.0`):

- **PATCH** (`1.2.1`): a bug fix. Nothing new to learn.
- **MINOR** (`1.3.0`): a new feature that still works with existing data.
- **MAJOR** (`2.0.0`): a change that breaks something, such as removing a feature.

Each release is a git tag named `v` plus the version (for example `v1.2.0`). The same
number is set in `frontend/package.json` and in the API in `backend/main.py`.
Container images are still tagged by commit (`sha-...`); a release tag tells you
which commit that is.

## [Unreleased]

Nothing yet.

## [1.2.0] - 2026-10-30

### Added
- Edit an account's **current** balance or card debt (ADR-018). The app adjusts the
  account's starting amount, so existing activity and monthly totals do not change.
- Card debt can go below zero, which shows as card credit.

### Database
- Migration `003_current_account_amounts.sql` removes the two "must not be negative"
  checks on starting amounts. **Apply it to an existing database after a verified
  backup**, then deploy this version. The API does not run migrations itself.

## [1.1.0] - 2026-10-26

### Added
- **Transfers** between cash, bank, and e-wallet accounts (ADR-017). Both balances
  change; income, expenses, and card debt do not. Transfers appear in Activity and
  can be edited or deleted.
- API routes under `/api/account-transfers`.

### Database
- New `account_transfers` table. Migration `002_account_transfers.sql` adds it to an
  existing database. **Take and verify a backup before applying it.**

## [1.0.0] - 2026-10-25

First complete version, running in the private homelab.

### Added
- Accounts for cash, bank, e-wallet, and credit cards, with account editing.
- Income and expense entries with categories and notes. Card purchases count as
  expenses.
- Credit-card payments, recorded separately so a payment is not counted as a second
  expense.
- Balances, card debt, available credit, and monthly totals calculated by the
  database.
- React frontend with a mock data source, plus a FastAPI API and PostgreSQL schema.
- Docker Compose for local use. GitHub Actions checks and publishes SHA-tagged images
  to GHCR; Argo CD deploys them from the separate `homelab-gitops` repository.
- Portfolio README with fictional screenshots and an architecture diagram.

### Known limits
- No login. Keep the writable deployment on a trusted private network.
- One-node cluster and one PostgreSQL replica, so it is not highly available.

[Unreleased]: https://github.com/Jeysibn/monikey/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/Jeysibn/monikey/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/Jeysibn/monikey/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Jeysibn/monikey/releases/tag/v1.0.0
