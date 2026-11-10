# Analytics Dashboard

Dashboard is a separate analysis page. Overview remains the default home for current account position, recent activity, and next actions. Dashboard uses bounded server aggregates; it does not derive financial totals from paginated Activity rows.

## Data request

`GET /api/analytics?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&account_id=ID`

Dates are Manila calendar dates, both inclusive to the caller. The API converts the inclusive end to a half-open SQL range (`>= start`, `< end + 1 day`), accepts a maximum of 366 days, and validates an optional account ID. `previous_totals` compares the same number of calendar days immediately before the selected range. It is `null` when the selected range includes today or a future date, because the period is incomplete.

All amount values are emitted as decimal strings from PostgreSQL `NUMERIC`; the frontend parses them to exact integer centavos for display. The mock source uses integer-centavo arithmetic only for synthetic local fixtures.

## Metric definitions

- **Income:** sum of transaction rows whose referenced category type is `income`.
- **Expenses:** sum of transaction rows whose referenced category type is `expense`.
- **Net cash flow:** income minus expenses for the selected period. This is not account-balance growth or net worth.
- **Monthly bars and expense trend:** the same income and expense definitions grouped by transaction calendar month. Every month in the selected range is present, including months with zero activity.
- **Spending by category:** expense transactions grouped by stable category ID. Archived categories remain included and labeled. The current schema requires every transaction to have a category, so an uncategorized transaction cannot exist in this version.
- **Kakeibo actuals:** expense transactions grouped by their saved envelope. Expenses without an envelope are separately identified as unclassified.
- **Kakeibo plan:** only plans explicitly saved for a month are compared. Plan amounts cover all accounts. The UI hides plan comparisons while an account filter is active, while still showing that account's envelope actuals.
- **Partial months:** plan-versus-actual comparisons appear only when the selected date range covers every calendar day of that month. Partial-month spending remains included in the other analytics, but is not labeled over or under a full-month plan.

Transfers and credit-card repayments are separate ledger records and do not enter income or expenses. Card purchases are expense transaction rows and are counted once. The current ledger has no separate signed-refund record; a refund must follow existing category and transaction rules and is not inferred by analytics. Category names/icons are joined by category ID so archived historical references remain recognizable.

The Dashboard does not show historical account balance or net-worth trends. The application does not store dated balance snapshots, and reconstructing past balances needs a separately reviewed opening-balance and correction policy.

## Charts, navigation, and accessibility

The page uses local CSS bars and a small inline SVG line plot; it adds no chart library. Charts have textual values for assistive technology, legends, empty states, and no forecast or smoothing. Dashboard code is lazy-loaded so Overview does not download the view chunk until it is opened. On phones, Overview, Dashboard, and Activity remain in the bottom bar; Accounts, Kakeibo, and Categories are in the accessible More dialog. Tablet and desktop use direct navigation.

To validate with synthetic records, run the frontend browser suite. Screenshots in `docs/design/screenshots/ui-modernization/phase-c-dashboard/` show the mock source, while `phase-c-dashboard-api/` shows the actual Nginx/React/FastAPI/PostgreSQL flow with a disposable database. Neither contains production financial data.
