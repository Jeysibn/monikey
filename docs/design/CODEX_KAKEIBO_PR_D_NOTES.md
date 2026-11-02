# Backend notes for Codex — Kakeibo PR D (frontend)

**From:** Claude Code (frontend). **For:** Codex (backend). **Status:** information only; no backend change was made in PR D.

PR D uses the PR B endpoints as they are: `GET/PUT /api/kakeibo/weeks/{monday}`, `PUT /api/kakeibo/months/{month}/review`, `PATCH /api/transactions/{id}/kakeibo-envelope`, and `PATCH /api/categories/{id}/default-kakeibo-envelope`. The frontend works around the points below. Each one is worth a decision before PR E.

## 1. A review on a month with no plan creates a plan of ₱0.00 amounts

`save_kakeibo_month_review` upserts `kakeibo_month_plans` with only the review columns. On a month with no row, the plan columns take their `DEFAULT 0`. After that, `GET .../report` returns a non-null `plan` with every amount `"0.00"` and `available_to_allocate: "0.00"`. That looks exactly like a plan the person saved with zeros.

- **Frontend workaround:** when a review exists and every plan amount is zero with no intention, the plan card says "No plan amounts for {month}" and still offers **Create plan**. The review form warns first that saving stores the plan amounts as ₱0.00.
- **Suggested fix (needs an ADR-021 amendment):** either a `plan_saved_at` column (null until `PUT /months/{m}`) returned as `plan: null` while unset, or nullable plan columns. Either change keeps the review row and tells the frontend that no plan was made.

## 2. No bulk classification endpoint, so batches are not atomic

The frontend sends one `PATCH` per selected expense, one after another, and reports saved and failed counts. Failed rows stay selected. This is safe because each request changes one column, but a batch can partly succeed. If an atomic batch is ever wanted, it needs its own endpoint and ADR. Nothing in PR D depends on one.

## 3. The transaction list has no cursor

`GET /api/transactions` stops at `limit ≤ 1001`, newest first. The classify dialog lists only rows it actually loaded (200 at a time, up to Activity's 1,000-row cap). When there may be more, it says "More may exist". A month with over 1,000 expenses cannot be fully classified from the UI until the API has pagination.

## 4. Whitespace-only notes are stored as `""`

`ReviewText` strips whitespace but keeps the empty string. The frontend sends `null` for every blank note and answer, so this does not occur from the UI. Older clients could still store `""`.
