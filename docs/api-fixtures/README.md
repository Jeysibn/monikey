# API response fixtures

These files are fictional examples shared by the FastAPI and frontend contract
tests. Money is represented as JSON decimal strings. No account identifiers or
personal data are used.

| Endpoint | Fixture |
|---|---|
| `GET /api/health/live` | `health-live.json` |
| `GET /api/health/ready` | `health-ready.json` |
| `GET /api/accounts` | `accounts-list.json`, `accounts-empty.json` |
| `POST /api/accounts` | `account-created.json` |
| `GET /api/accounts/{id}` | `account-edit-liquid.json`, `account-edit-card.json` |
| `PUT /api/accounts/{id}` | `account-updated.json` |
| `GET /api/categories` | `categories-list.json` |
| `GET /api/transactions` | `transactions-list.json`, `transactions-empty-month.json` |
| `POST /api/transactions`, `PUT /api/transactions/{id}` | `transaction-created.json`, `transaction-updated.json` |
| `DELETE /api/transactions/{id}` | `delete-success.json` (204, empty body) |
| `GET /api/credit-card-payments` | `payments-list.json`, `payments-empty-month.json` |
| `POST /api/credit-card-payments`, `PUT /api/credit-card-payments/{id}` | `payment-created.json`, `payment-updated.json` |
| `DELETE /api/credit-card-payments/{id}` | `delete-success.json` (204, empty body) |
| `GET /api/summary` | `summary-month.json`, `summary-empty-month.json` |
| Error responses | `error-invalid-field.json`, `error-invalid-account-type.json`, `error-not-found.json`, `error-duplicate-account-name.json` |

`accounts-list.json` and `summary-month.json` also cover a negative liquid
balance, an overpaid card, and an over-limit card. API tests compare response
data with these fixtures; frontend mapper tests can read the same JSON files.
Timestamps in examples are stable samples; runtime API responses use the actual
UTC `created_at` values from PostgreSQL.
