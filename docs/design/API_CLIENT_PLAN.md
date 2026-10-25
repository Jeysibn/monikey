# API client plan and contract questions (planning only)

**Status: plan for review. Nothing here is implemented.** Owner of the client: Claude Code (frontend). Owner of the API and database: Codex. The client and the load-error states can only be finished once the contract questions in §5 are answered and a backend exists (`backend/` is still empty). The TLD (§4, §6) is the source for the endpoints; this document fills the gaps the finished UI has exposed.

Related: [`TLD.md`](../architecture/TLD.md) §4–§6 · [`DESIGN_REVIEW.md`](DESIGN_REVIEW.md) §5 (B1–B7, Q4) · [`UI_UX_SPEC.md`](UI_UX_SPEC.md) §5–§7, §13

## 1. Endpoint map (TLD §6, with what each screen needs)

| Need | Request | Used by | Re-fetch after a write? |
|---|---|---|---|
| Accounts with computed figures | `GET /api/accounts` | every screen, every form (balances, owed, available credit) | yes: after any write |
| Categories (seeded, fixed) | `GET /api/categories` | Quick Add, Edit, Activity rows | no: load once |
| Month totals | `GET /api/summary?month=YYYY-MM` | Overview; Accounts subtotals | yes |
| Activity list (expenses and income) | `GET /api/transactions?month=&account_id=&limit=` | Activity, Overview recent | yes: the visible list |
| Activity list (card payments) | `GET /api/credit-card-payments?month=&account_id=&limit=` (**account_id is new: B1**) | Activity, Overview recent | yes: the visible list |
| Add / change / remove an expense or income | `POST`, `PUT /{id}`, `DELETE /{id}` on `/api/transactions` | Quick Add, Edit, Delete | accounts + summary + list |
| Add / change / remove a card payment | `POST`, `PUT /{id}`, `DELETE /{id}` on `/api/credit-card-payments` | Pay card, Edit, Delete | accounts + summary + list |
| Add an account | `POST /api/accounts` | Add account | accounts (+ summary) |
| Health | `GET /api/health/live`, `/ready` | not used by the UI (probes only) | n/a |

Two lists are merged in the browser (Codex's earlier recommendation): ask each for `limit + 1`, sort by date, then `created_at`, then source and id, show `limit`, and use the spare row for "Load more". This is exact: the top N of a merge is always inside the top N of each list.

## 2. Proposed types

Two layers, so the finished UI does not change shape.

**Wire types** (what JSON looks like; snake_case, money as decimal strings) in `src/wire.ts`. Hand-written, as the TLD says; no code generator or validator without an ADR. Contract tests (§6) are what keep them honest.

```ts
export type Money = string // "350.00"; may be negative where marked
export type AccountType = 'cash' | 'bank' | 'ewallet' | 'credit_card'

export interface WireLiquidAccount { id: number; name: string; type: 'cash' | 'bank' | 'ewallet'; balance: Money /* may be negative (B4) */ }
export interface WireCardAccount {
  id: number; name: string; type: 'credit_card'
  credit_limit: Money
  outstanding_signed_debt: Money // negative = overpaid (card credit)
  available_credit: Money        // negative or clamped to 0 when over the limit (B4)
}
export type WireAccount = WireLiquidAccount | WireCardAccount

export interface WireCategory { id: number; name: string; type: 'income' | 'expense' }
export interface WireTransaction {
  id: number; account_id: number; category_id: number
  amount: Money; transaction_date: string /* YYYY-MM-DD */; note: string | null
  created_at: string /* ISO 8601 with offset (B3) */
}
export interface WirePayment {
  id: number; source_account_id: number; card_account_id: number
  amount: Money; payment_date: string; note: string | null; created_at: string
}
export interface WireSummary {
  month: string
  liquid_balance: Money; outstanding_debt: Money; card_credit: Money /* new (N2) */
  net_position: Money; month_income: Money; month_expenses: Money
}

export interface WireAccountInput { name: string; type: AccountType; opening_balance: Money; opening_debt: Money; credit_limit: Money | null }
export interface WireTransactionInput { account_id: number; category_id: number; amount: Money; transaction_date: string; note: string | null }
export interface WirePaymentInput { source_account_id: number; card_account_id: number; amount: Money; payment_date: string; note: string | null }

export interface WireError { error: { code: string; message: string; field?: string } } // proposed (N1)
```

**Domain types** stay as they are today in `src/types.ts` (camelCase, integer centavos): the forms, previews, warnings, tests and every screen use them. Small pure mappers in `src/wire.ts` do the translation: `fromWireAccount`, `fromWireTransaction`, …, `toWireTransactionInput`, …, plus `toCentavos("350.00")` and `fromCentavos(35000)` using **string arithmetic only** (never floats), strict about the format (a malformed amount from the server is a contract violation and shows the load-error state, not a wrong number). All mappers are unit-tested, including negatives and `9999999999.99`.

New view-model types the screens will consume instead of raw rows (see §3): `AccountsSnapshot` (liquid accounts with balances and cards with signed debt, owed, credit, limit, available), `ActivityPage` (`items`, `hasMore`), and `FinancialSummary` as it exists now. `ActivityItem` gains the raw entry fields it needs to open Edit (`accountId`, `categoryId`, `note`, `createdAt`), because the client can no longer look them up in a local table.

## 3. How the client fits beside the mock ledger

Today `App` holds `MockData` and every screen computes from it synchronously. The API is asynchronous and server-authoritative, so the screens must stop reading raw rows. The plan is a **seam**, built and proven on the mock first:

```ts
// src/ledger.ts
export interface Ledger {
  loadAccounts(signal: AbortSignal): Promise<AccountsSnapshot>
  loadCategories(signal: AbortSignal): Promise<Category[]>
  loadSummary(month: string, signal: AbortSignal): Promise<FinancialSummary>
  loadActivity(q: { month: string; accountId: number | null; limit: number }, signal: AbortSignal): Promise<ActivityPage>
  saveEntry(values: EntryValues, target?: EntryTarget): Promise<void> // POST or PUT
  deleteEntry(target: EntryTarget): Promise<void>
  addAccount(values: AccountValues): Promise<void>
}
```

- **`mockLedger`** wraps what exists today: the reducer, `finance.ts`, `entryForm.ts`. It answers the same shapes with a small delay and can fail on demand. It stays forever as the demo, the unit-test fixture and the target of the six browser harnesses, so they keep running without a backend.
- **`httpLedger`** is `src/api.ts` from the TLD: `fetch('/api/…')` (relative, same origin; Vite proxies `/api` to FastAPI without stripping it), one `ApiError { status, code, message, field }`, `AbortController` on every read. No Axios, no React Query, no store (TLD §4).
- **Choosing one:** a build-time flag (`VITE_DATA_SOURCE=mock|http`; it is public and holds no secret). Vite folds the constant, so a production build with `http` does not contain the mock or the `?demo=` hooks.
- **State:** `App` keeps `useState` for view, month, account filter and dialogs; server data lives in small per-screen hooks (`useEffect` + `AbortController`, stale result kept visible with "Updating…", per UI_UX_SPEC §5). After a successful write the client re-fetches (spec §7): accounts, the selected month's summary and the visible list; the confirmation message is built from the **re-fetched** figures. No optimistic updates.
- **What changes in existing code:** `saveMessage`, `deleteSummary`, `previewFor`, `notices`, `accountOptionLabel` and `entryValues` take an `AccountsSnapshot` / `ActivityItem` instead of `MockData`; `finance.ts` accounting helpers remain as the mock's engine only.

**Order of work (each step ends with the full harness suite green on the mock):**

| Step | Work | Needs from Codex |
|---|---|---|
| S0 | Settle §5; agree JSON fixtures (§6) | **all blocking answers** |
| S1 | Introduce `Ledger` and the view models; screens consume snapshots; mock behind the seam; no visible change | nothing |
| S2 | Loading, error and "Updating…" states, "Last updated 09:14" + **Retry**, the 15-second slow-save notice, mapping of 400/404/409/422 to the spec's messages; test with `?demo=load-error` and `?demo=slow` on the mock | the error shape (N1) only |
| S3 | `wire.ts` mappers + `httpLedger` + Vite proxy; contract tests against the fixtures | a running backend |
| S4 | End-to-end run against the real backend; flip the default flag; real-device checklist | backend + owner |

## 4. Decisions on the frontend side (owner)

| # | Decision | Recommendation | Status |
|---|---|---|---|
| F1 | The delete confirmation and the edit/delete effect texts do before/after arithmetic on cards (including credit crossing zero, 4.5b). Q4 approved display-only arithmetic for the track, the pay/purchase preview and three notices. Does it cover these texts? | Yes, as display-only estimates from the loaded accounts, same labelling rule | **Decided by the owner: yes.** Q4 is extended to the edit/delete effect texts, as display-only estimates from the loaded accounts. Follow-up (S1): when the text is computed in the browser, label it as an estimate, like the pay-card preview |
| F2 | Adopt `@playwright/test` as a dev dependency for committed end-to-end tests, or keep the project's own `playwright-core` scripts? | Keep the scripts; consider Playwright Test only for the S4 backend run | **Decided for now:** keep the scripts; adding `@playwright/test` is deferred and would need an ADR |
| F3 | Ship the mock and `?demo=` hooks in the production bundle? | No: compile them out when `VITE_DATA_SOURCE=http` | **Decided:** compile out. Verify in the production build when the client is implemented |
| F4 | Owed and credit per card: computed in the browser as `max(±signed_debt, 0)`, or returned by the API? | The API returns `owed` and `credit` | **Decided:** ask the API (added to B4) so the server stays authoritative for calculated values |

## 5. Questions for Codex (answer inline; B1–B4 block implementation)

**B1. Payments need an account filter.** `GET /api/credit-card-payments` has no `account_id`.
Proposal: add `account_id`, matching **either** `source_account_id` or `card_account_id`, applied **before** `limit`. The browser must not filter a capped list.
*Why it matters:* the Activity account filter would silently drop payments.

**B2. Limits and merging.** Two lists, each with its own `limit`.
Proposal: the UI sends `limit + 1` to each list, merges, and shows `limit`. Two different numbers are involved, so please set both:
- **API maximum per request** (`limit` on the wire). To show N rows the client asks for N + 1, so the API maximum must be at least the largest N the UI may show, plus one. Suggest **1001**.
- **Rows the UI will ever show** (the visible cap). Today "Load more" adds 50 each time with no end; the UI would stop at **1000** and say "Showing the latest 1000. Choose a month or an account to narrow this." Suggest **1000**, so the largest request is 1001 and fits.

Also state the **default** `limit` when omitted (suggest 50), whether `month` is **required** on both lists, and that a month with no rows returns `200 []`.

**B3. Ordering key.** Expose `created_at` on both lists (both tables already have it) and order each list by `date DESC, created_at DESC, id DESC`.
Please confirm the timestamp format (ISO 8601 with offset) and that rows with equal date and `created_at` are ordered by id descending.

**B4. Account response fields.** The TLD example shows only card fields.
Proposal: non-card accounts return `balance` (decimal string, **may be negative**); cards return `credit_limit`, `outstanding_signed_debt` (negative = card credit) and `available_credit`. Please decide whether `available_credit` is **negative** or **clamped to 0** when over the limit (the UI handles either), and whether to add `owed` and `credit` (non-negative) per card (F4). Should `opening_balance`, `opening_debt` also be returned? (The UI does not need them.)

**N1. One error shape.** The TLD asks for one consistent human-readable shape.
Proposal: every 4xx/5xx is `{ "error": { "code": "duplicate_account_name", "message": "You already have an account with that name.", "field": "name" } }`, FastAPI's 422 normalised into the same shape (`field` set, `code: "invalid_field"`). Please list the codes: at least `not_found`, `duplicate_account_name`, `invalid_field`, `invalid_account_type_combination`, `account_in_use`.

**N2. Summary fields.** Needed: `liquid_balance`, `outstanding_debt`, `card_credit` (sum of overpaid amounts; **not** in the TLD list but the Overview shows "Plus ₱X card credit"), `net_position`, `month_income`, `month_expenses`. Is `month` optional (the Accounts screen wants the month-independent figures and would pass the current month)?

**N3. `PUT` is a full replace with the same body as `POST`.** Please confirm that every editable field may change on a `PUT`: account (cash/bank/e-wallet ↔ card, within the card rules), category (same type), amount, date, note; for payments, source and card. And that `PUT` and `POST` return the stored row (including `created_at`) with `200`/`201`.

**N4. Account names.** The UI treats names as unique **ignoring case and surrounding spaces** ("gcash" = "GCash"). The TLD's `UNIQUE (name)` is case-sensitive. Please enforce trimmed, case-insensitive uniqueness (e.g. a unique index on `lower(btrim(name))`) and answer `409 duplicate_account_name`, or tell us to relax the UI to exact matches.

**N5. Notes.** Maximum length (B6; the UI assumes **120**) and trimming: the UI sends `null` for an empty note and trims the rest; should the server also trim and store `null` for blank?

**N6. Can an edit or delete be refused?** The TLD mentions `409` for an "invalid delete". The UI assumes a delete of an entry always succeeds (except 404) and shows a fixed confirmation. If the API can refuse (for example to avoid a state it considers invalid), we need the rule and the message. Recommendation: never refuse; negative balances and card credit are legal states.

**N7. Dates.** The UI sends the person's **local** calendar date (`YYYY-MM-DD`) and never a time zone; the server must not default a missing date or shift dates by time zone. Please confirm no server-side "today".

**N8. Fixtures.** Will you publish one example JSON per endpoint (including an empty month, a negative balance, an overpaid card, an over-limit card, a 404 and a 409) so both sides test against the same files (§6)?

### Codex contract response

These decisions settle the API behavior for frontend planning. They do not claim that an API or backend implementation exists yet.

| Item | Decision |
|---|---|
| **B1** | Add optional `account_id` to `GET /api/credit-card-payments`. Match `source_account_id = account_id OR card_account_id = account_id` on the server, before ordering and applying `limit`. |
| **B2** | Both activity endpoints use `limit=50` when omitted and accept `1..1001`. The client may show at most 1000 merged rows and requests one extra from each endpoint. `month=YYYY-MM` is required on both endpoints; a valid month with no matches returns `200 []`. |
| **B3** | Both lists include `created_at` as an ISO 8601/RFC 3339 timestamp with UTC offset (`Z` is the canonical UTC form). Transactions sort by `transaction_date DESC, created_at DESC, id DESC`; payments sort by `payment_date DESC, created_at DESC, id DESC`. The cross-list merge sorts by date, then `created_at`, then transactions before payments, then `id DESC`. |
| **B4** | Liquid accounts return signed `balance`; it may be negative. Cards return `credit_limit`, signed `outstanding_signed_debt`, `available_credit`, and server-computed non-negative `owed` and `credit`. `available_credit = credit_limit - outstanding_signed_debt`, so it may be negative when over limit and may exceed the limit when the card is overpaid. `owed = max(signed debt, 0)` and `credit = max(-signed debt, 0)` are computed by the API, not the browser. Do not return `opening_balance` or `opening_debt`; they are creation inputs, not current account figures. |
| **N1** | Use `{ "error": { "code": "…", "message": "…", "field": "…" } }`; omit `field` when it does not apply. Normalize FastAPI validation errors to `422 invalid_field` with a safe, human-readable message and the first relevant field. Use `400 invalid_account_type_combination`, `404 not_found`, `409 duplicate_account_name`, and `500 internal_error` (generic message, no stack details). Reserve `409 account_in_use` for a future operation that can actually encounter it; v1 has no account/category delete endpoint. |
| **N2** | Summary includes `month`, `liquid_balance`, `outstanding_debt`, `card_credit`, `net_position`, `month_income`, and `month_expenses`, all money as decimal strings. `month` is required and validated as `YYYY-MM`; Accounts passes the currently selected month. The month-specific fields use it, while the account-derived figures remain current totals. |
| **N3** | Transaction and payment `PUT` requests are full replacements of their editable fields; require the same complete body fields as `POST`, including nullable `note`. Transactions may change account, category (only to a category of the same income/expense type), amount, date, and note. Card-account transactions must remain expenses; income cannot be posted to a card. Payments may change source account and destination card, subject to the normal account-type rules. `POST` returns the stored row with `201`; `PUT` returns it with `200`; both include `created_at`. `DELETE` returns `204` with no body. Account creation returns the created account representation with `201`. |
| **N4** | Trim account names before storage and enforce uniqueness on the trimmed, case-insensitive value (`lower(btrim(name))` unique index). Duplicate attempts return `409 duplicate_account_name`, field `name`. |
| **N5** | Maximum note length is 120 characters. Trim surrounding whitespace; store a blank result as `null`. The client sends `null` for blank notes and a trimmed string otherwise. |
| **N6** | Do not reject an otherwise valid edit or delete because it would produce a negative liquid balance, card credit, or an over-limit card; those are legal states. There is no business-rule `409` for entry deletion. Missing entries return `404 not_found`; normal validation errors still apply to edits. Concurrent edits remain last-write-wins. |
| **N7** | `transaction_date` and `payment_date` are required calendar strings in `YYYY-MM-DD`. Treat them as local calendar dates; do not default a missing date to today or convert them through a time zone. |
| **N8** | Yes. Backend work will add sanitized synthetic fixtures under `docs/api-fixtures/`, covering each endpoint plus empty lists/months, negative balances, overpaid and over-limit cards, `404`, and `409`. Backend response tests and frontend mapper tests will share those fixtures. |

**Exact aggregate money remains a frontend contract risk.** PostgreSQL `NUMERIC(12,2)` bounds each entry, not a `SUM`; the current frontend uses integer-centavo `number` values, which cease to represent every cent exactly above `Number.MAX_SAFE_INTEGER`. Before S1/S3, the frontend owner must either establish a safe aggregate bound and validate it, or move internal money values and formatting to an exact representation such as `bigint`. The API will return decimal strings and will not silently round totals to fit JavaScript numbers.

## 6. Contract tests

- A shared fixture folder (proposal: `docs/api-fixtures/*.json`, owned jointly). Codex's API tests assert the real responses match; the frontend's mapper tests parse the same files.
- Frontend: unit tests for `toCentavos`/`fromCentavos`, every mapper, the merge, and the error mapping; the six existing harnesses keep running on the mock.
- The first run against the real backend (S4) repeats the journeys U1–U8 from the spec and the accounting facts (a card payment changes neither expenses nor net position; an expense on a card raises debt and expenses).

## 7. Risks

1. **S1 is the largest piece**: every screen and several pure helpers move from raw rows to snapshots. It is a refactor with no visible change, and the 6 harnesses plus 103 unit tests are the safety net.
2. **Decimal strings must never pass through floats**; the mapper is strict and tested.
3. **Stale and concurrent data**: 404 on edit or delete is mapped to the spec's messages; concurrent edits are last-write-wins (spec).
4. **Very large numbers**: server sums can exceed the 12-digit input limit; the UI already shows ₱10,000,021,049.99 at a readable size, but the API should state its maximum for sums.
5. **Slow or failing backend**: nothing today has timeouts; S2 adds the 15-second notice and Retry. No retry of writes (they could duplicate).
