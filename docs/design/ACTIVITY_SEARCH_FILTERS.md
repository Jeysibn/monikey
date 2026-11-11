# Activity search and filters

Approved by the owner (2026-11-12) as the previously optional Activity enhancement. Scope: search, a type filter and a category filter on the existing month-and-account Activity. **No cross-month or date-range search.**

## Behavior

- **Search:** one compact field (`Search activity`) over what a row shows: its note, its category name and its account name (a card payment or transfer: both accounts). Case-insensitive, spaces collapsed, at most 80 characters. It waits 300 ms after typing stops before asking the server; clearing (button or Escape) shows everything at once. Reset also drops text still being typed, so a pending search cannot come back.
- **Type:** All types, Expenses, Income, Card payments, Transfers (the four kinds Activity actually contains).
- **Category:** the categories for the chosen type. An archived category is offered, labelled "(archived)", only if it has history; one with no entries could match nothing. Card payments and transfers have no category, so the control is disabled with a note.
- **Invalid combinations are prevented, not answered with an empty list:** picking a type drops a category that does not fit it; a category is refused for payments and transfers.
- **Month and Account** are unchanged. **Reset filters** clears the account, search, type and category and leaves the month alone. Opening Activity from an account (Accounts, the details drawer) sets that account and clears leftover search, type and category, so the entry point always shows what it promised.
- **Count line:** "18 entries", "3 matching entries", or, when more are waiting, "Latest 50 entries" / "First 50 matching entries" with Load more. It never claims a total it did not count.
- **Paging:** changing any filter starts again at one page. Newest first, grouped by date, unchanged. Edit and Delete work on filtered rows; a saved change that no longer matches says "It's hidden by your filters" with a "Show it" action that clears them.

## Server contract (additive, optional query parameters)

Filters must apply to the whole month **before ordering and the page limit**; otherwise an older match on a later page would be silently missing. The Activity screen merges three server reads, each already filtered by month and account in SQL, so the new filters go in the same place:

| Endpoint | New optional parameters |
|---|---|
| `GET /api/transactions` | `q` (text, max 80), `category_id` (integer ≥ 1), `kind` (`income` or `expense`) |
| `GET /api/credit-card-payments` | `q` |
| `GET /api/account-transfers` | `q` |

- `q` is `ILIKE` with `%` and `_` and `\` matched literally (escaped), over the row's note and the names it shows; blank is ignored. Values are always bound parameters, never concatenated.
- A category or a payment/transfer type rules some reads out, so the client **skips those reads** instead of filtering after the fact. An unknown category, or a category with the wrong type, is an empty result, not an error. Invalid values (`kind=payment`, `category_id=0`, a `q` over 80 characters) are 422.
- Calls without the new parameters behave exactly as before; no existing parameter or response field changed.

### Is an ADR or contract approval needed?

Checked against `AGENTS.md`, the AI agent playbook, the master plan and the existing ADRs: none requires an ADR for this kind of change. It adds optional query parameters to three existing read endpoints, with no new endpoint, table, column, migration, index, service, dependency or change to a response shape, and it is backward compatible. ADR-022, ADR-023 and ADR-026 were needed because they add columns and database constraints; this adds none. The playbook asks to "gain approval if scope grows"; it did not (the owner approved Activity search and filtering, and asked that backend work stay narrow). If the owner reads this differently, the change is isolated to `backend/main.py` and can be reviewed on its own.

Performance: the month bounds every query, as before. Matching adds two inner joins on indexed primary keys and an `ILIKE` over a month's rows; there is no new index and none is needed at this scale.

## Tests

Backend `backend/tests/test_activity_filters.py` (note, category and account matches; literal `%`, `_` and `\`; kind and category combinations; **filtering before the limit**; payments and transfers; old calls unchanged; invalid values; SQL-injection text). Frontend `tests/activityFilters.test.ts` (rules, request shapes, mock parity, the post-save "hidden" check). Browser `browser-tests/activity.spec.ts` (on the real API it builds a month with 58 rows and finds three matches that are beyond the first page).
