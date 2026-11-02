# Backend Handoff for Codex — ADR-020 (account card choice in the database)

**For:** Codex (backend, database). **From:** Claude Code (frontend). **Decision:** [ADR-020](../architecture/ADR.md#adr-020--store-each-accounts-chosen-card-in-the-database), accepted by the owner on 2026-11-02.

Claude will not touch `backend/`, `database/`, or `docs/api-fixtures/` for this change. The frontend keeps working without it (it falls back to browser storage), so this can land on its own schedule. Tell Claude when it is merged so the frontend can switch to the API.

## 1. Migration `database/004_account_card_product.sql`

```sql
-- Verify a backup before applying to an existing database.
-- Presentation only: the card a person picked for an account (ADR-020).
BEGIN;
ALTER TABLE accounts
  ADD COLUMN card_product_id VARCHAR(64) NULL,
  ADD CONSTRAINT accounts_card_product_id_format
    CHECK (card_product_id IS NULL OR card_product_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  ADD CONSTRAINT accounts_card_product_id_not_cash
    CHECK (type <> 'cash' OR card_product_id IS NULL);
COMMIT;
```

Existing rows get `NULL`. No data backfill, no new table, no index needed.

## 2. API contract

The wire name is `card_product_id`: a string, or `null` for "no card chosen".

| Route | Change |
|---|---|
| `GET /api/accounts` | Every item includes `"card_product_id": string \| null`, for all four account types (cash is always `null`). |
| `GET /api/accounts/{id}` | Includes `card_product_id`. |
| `POST /api/accounts` | Accepts optional `card_product_id` (default `null`). The 201 response includes it. |
| `PUT /api/accounts/{id}` | Accepts optional `card_product_id`. **Omitted keeps the stored value; `null` clears it; a string sets it.** Omitted-means-unchanged keeps older clients from wiping the choice. |

**Validation** (same error shape as today, `{"error": {"code", "message", "field"}}`):

- Not a string or `null`, longer than 64 characters, or not matching `^[a-z0-9]+(-[a-z0-9]+)*$` → **422** `invalid_field`, `field: "card_product_id"`, message `Choose a card from the list.`
- A non-null value on a `cash` account → **422** `invalid_field`, `field: "card_product_id"`, message `Cash accounts don't have a card.`
- Do **not** check the ID against a catalog. The catalog lives in `frontend/src/wallet/cardProducts.ts`, and the frontend shows the neutral MoniKey card for an ID it doesn't know.

The field never affects balances, debt, limits, the summary, or any ledger calculation.

## 3. Tests to add (`backend/tests/test_api.py`)

1. Create with and without `card_product_id`; list and detail return it (and `null` when absent).
2. Update sets it, `null` clears it, and omitting it leaves it unchanged.
3. Bad shapes (`"BDO Visa"`, `"bdo--visa"`, 65 characters, a number) → 422 with `field: "card_product_id"`.
4. Cash with a non-null value → 422 on create and on update.
5. Setting or clearing the card leaves `balance`, `owed`, `available_credit`, and the summary unchanged.
6. Database: `database/tests/accounting.sql` (or equivalent) rejects a cash row with a card and a malformed ID.

Also add `"card_product_id"` to `docs/api-fixtures/accounts-list.json` and the account-edit fixtures.

## 4. What Claude does after this lands

- `frontend/src/wire.ts` maps `card_product_id` ↔ `cardProductId` and tolerates the field being absent (older API).
- Add and Edit send the chosen card; the gallery reads it from the snapshot.
- One-time upgrade: for each account whose stored value is `null` but which has a card saved in browser storage, send it once with `PUT`, then remove the local copy.
- Mock source and frontend tests are updated to match.

## 5. Release

Migration 004 is additive and nullable, so the API can deploy first. Apply it after a verified backup, then release the API, then the frontend. No GitOps or Kubernetes change is needed beyond the normal image rollout.
