# Analytics Dashboard

Dashboard is the analysis page, separate from Overview (ADR-024). It is drawn with native SVG and CSS, with no charting library (ADR-025). Overview stays the home for current balances and next actions.

## Two independent date scopes

| Scope | Controls | Never affected by |
|---|---|---|
| **Reporting Month** (a month picker, current month by default) | The four KPI cards, the income-versus-expenses columns (six months ending at the picked month), and the monthly Kakeibo plan versus actual | The analysis range, its account filter, or chart sorting |
| **Analysis range** (presets or a custom inclusive range, plus an account filter) | Spending by category, daily spending, weekday averages, daily Kakeibo spending and the insights | The Reporting Month |

Each scope reads its own report from the server, so one can never move the other's figures. This is tested (unit, backend and browser). The current month is *month to date* and is labelled and hatched as such.

Analysis presets: this month, last month, last 7 days, last 30 days, last 3 months (this month through today plus the two before), this year, custom. The end date may not be after today (Manila). A range must be valid and at most 366 days; invalid ranges are explained on screen and are never sent.

## API

`GET /api/analytics?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD[&account_id=ID][&detail=true]`

Dates are Manila calendar dates and both are inclusive. The end may not be in the future (422), the range may not exceed 366 days, and an unknown account is 400. All amounts are decimal strings from PostgreSQL `NUMERIC`; the browser parses them to exact whole centavos and only formats.

The base response (used by the Reporting Month, which passes no account) has `totals`, `previous_totals`, `months`, `categories`, `kakeibo_totals` and `kakeibo`. Each `months[]` row also has:

- `surplus`: income minus expenses (may be negative; not account cash flow).
- `expense_to_income_percent`: expenses as a share of income, one decimal, half-up, or `null` when income is zero (never infinity or 0).
- `complete`: the requested range covers every day of that calendar month (false means month to date or partial).

`detail=true` (used by the Analysis range) adds:

- `daily[]`: one row for **every** date in the range, including zero-spend days, with `expenses` and the five envelope sums (`needs`, `wants`, `culture`, `unexpected`, `unclassified`) that add up to `expenses`.
- `weekdays[]`: seven rows (ISO 1 Monday to 7 Sunday) with `total`, `occurrences` (how many of that weekday are in the range) and `average` (`total` divided by `occurrences`, zero days included, half-up to the centavo).
- `insights`: `days`, `average_daily_spending`, `expense_transactions` (expense entries only), `highest_day` (earliest date wins a tie, `null` when nothing was spent) and `zero_spend_days`.

## Metric definitions

- **Income / expenses:** transaction rows whose category type is income / expense. Card purchases are expenses once; card payments and transfers are separate records and never enter either; available credit is not cash.
- **Surplus or deficit:** income minus expenses for the month. It is a period figure, not a change in account balances or net worth.
- **Category spending:** expense rows grouped by stable category ID, archived categories included and labelled.
- **Kakeibo actuals:** expense rows by their saved envelope; rows without one are `unclassified`, still part of total spending. **Kakeibo plan versus actual** compares the reporting month's saved limits with that month's actuals (so far, for the current month). A month with no saved plan, or a legacy unconfirmed one, shows actuals without limits and says so. Savings targets are goals, never spending or savings.
- **Daily Kakeibo** is what was actually spent each day, not a daily budget.
- **No history of balances:** there is no dated balance data, so there is no net-worth or balance chart.

## Charts, accessibility and responsiveness

Shared primitives (`components/charts`): `ChartFrame` (title, description, legend, live readout, data table), `ColumnChart` (grouped or stacked columns, partial periods hatched) and `Donut`, with the maths in `lib/chartMath.ts` (nice axes, tick thinning, donut geometry, compact peso labels). Every chart:

- has a visible title and description, and a legend that names each series (partial months are hatched, not only lighter);
- is reachable by keyboard: focus the chart, then Left/Right/Home/End read each column into a polite live readout; pointer and touch read a column the same way;
- has an equivalent data table (always in the accessibility tree; "Show data table" reveals it for everyone) with the same numbers as the picture;
- is drawn in real pixels so labels stay 11 to 12 px and thin out at 320 px, with no horizontal page scroll;
- uses design tokens, Manrope and no animation or gradient.

Each section has its own loading, empty and error states (with Retry). The lazy-loaded Dashboard sits in an error boundary; if its file cannot be downloaded, "Try again" reloads the page, because React caches a failed import.

## Testing

Backend: `backend/tests/test_analytics_detail.py` and `test_api.py` (surplus, ratio rounding, zero days, weekday occurrence maths including a half-up case, tie-breaking, accounting invariants, future and invalid ranges, scope independence). Frontend unit: `tests/chartMath.test.ts`, mock parity in `tests/dataSource.test.ts`, strict parsing in `tests/wire.test.ts` and `tests/httpSource.test.ts`. Browser: `browser-tests/dashboard.spec.ts` (mock data, or the real API with `MONIKEY_DASHBOARD_API_FIXTURE=1` on a fresh database), including axe with the tables open and closed.
