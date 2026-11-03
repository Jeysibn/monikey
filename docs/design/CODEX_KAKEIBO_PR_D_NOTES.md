# Backend notes for Codex — Kakeibo PR D (frontend)

**From:** Claude Code (frontend). **For:** Codex (backend). **Status:** historical PR D handoff. The no-plan ambiguity described below is addressed by the PR E amendment to ADR-021 and migration 006; the remaining notes are tracked as limitations, not new PR E scope.

PR D uses the PR B endpoints as they are: `GET/PUT /api/kakeibo/weeks/{monday}`, `PUT /api/kakeibo/months/{month}/review`, `PATCH /api/transactions/{id}/kakeibo-envelope`, and `PATCH /api/categories/{id}/default-kakeibo-envelope`. This is a historical handoff; remaining points below are known limitations for future scope.

## 1. Resolved in PR E: a review on a month with no plan creates a plan of ₱0.00 amounts

`save_kakeibo_month_review` upserts `kakeibo_month_plans` with only the review columns. On a month with no row, the plan columns take their `DEFAULT 0`. After that, `GET .../report` returns a non-null `plan` with every amount `"0.00"` and `available_to_allocate: "0.00"`. That looks exactly like a plan the person saved with zeros.

- **Prior frontend workaround (removed in PR E):** when a review existed and every plan amount was zero with no intention, the plan card said "No plan amounts for {month}" and offered **Create plan**. The review form warned that saving stored plan amounts as ₱0.00.
- **Resolution:** migration 006 adds nullable `plan_presence`; explicit plan saves use `saved`, review-only inserts use `not_saved`, and pre-migration rows remain NULL/`legacy_unknown`. The API returns `plan: null` for `not_saved` and exposes reflection data independently. No historical intent is guessed.

## 2. No bulk classification endpoint, so batches are not atomic

The frontend sends one `PATCH` per selected expense, one after another, and reports saved and failed counts. Failed rows stay selected. This is safe because each request changes one column, but a batch can partly succeed. If an atomic batch is ever wanted, it needs its own endpoint and ADR. Nothing in PR D depends on one.

## 3. The transaction list has no cursor

`GET /api/transactions` stops at `limit ≤ 1001`, newest first. The classify dialog lists only rows it actually loaded (200 at a time, up to Activity's 1,000-row cap). When there may be more, it says "More may exist". A month with over 1,000 expenses cannot be fully classified from the UI until the API has pagination.

## 4. Whitespace-only notes are stored as `""`

`ReviewText` strips whitespace but keeps the empty string. The frontend sends `null` for every blank note and answer, so this does not occur from the UI. Older clients could still store `""`.
