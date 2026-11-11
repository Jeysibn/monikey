# Dashboard audit and gap list (2026-11-12)

Compared: the Dashboard on the integrated branch (`DashboardView`, `GET /api/analytics`, `mockAnalytics`) against spec section 4, the interactive mockup and the owner's Dashboard brief. ADR-025 fixes the approach: native SVG, extend `/api/analytics`, two independent date scopes.

## What exists and is reused

| Piece | Verdict |
|---|---|
| `GET /api/analytics`: inclusive Manila range, 366-day cap, account filter, decimal strings, half-open SQL, `months` (zero-filled), `categories` (archived kept, icon and color), `kakeibo_totals`, per-month `kakeibo` plan vs actual (complete months only), `previous_totals` | Sound and tested; **extended**, not replaced |
| `mockAnalytics`, `wire` parsing, `httpSource`, `useResource`, account filter, error block, lazy chunk, sr-only monthly table | Reused |
| Money rules: transfers and card payments excluded, card purchases once, no balance history | Kept (tests extended) |

## Gaps (what the approved design needs and the code does not do)

| # | Requirement | Today | Work |
|---|---|---|---|
| 1 | Two independent date scopes | One range selector drives everything | Separate Reporting Month and Analysis Range state and requests |
| 2 | Four monthly KPIs: income, expenses, surplus or deficit, expense-to-income ratio (`n/a` when income is 0) | Income, expenses, net for the whole range | Server `surplus` and `expense_to_income_percent` per month; month-to-date label |
| 3 | Monthly income vs expenses as side-by-side **columns**, several months ending at the reporting month, current month marked month-to-date | Horizontal bars for the range | New grouped-columns chart; `complete` flag per month |
| 4 | Category distribution with highest, lowest, A to Z sorting, legend and amounts | Top 8 bars, fixed order | Donut + sortable list + table |
| 5 | Daily spending including zero-spend days | Missing | Server `daily` series (every date) |
| 6 | Weekday averages by occurrence count | Missing | Server `weekdays` (total, occurrences, average) |
| 7 | Monthly Kakeibo plan vs actual (reporting month, four envelopes, over-limit, unclassified) | Text rows | Plan-vs-actual chart; reuse `kakeibo` rows |
| 8 | Daily Kakeibo actual breakdown | Missing | Server envelope sums inside `daily`; stacked columns |
| 9 | More insights: average daily spending, expense-transaction count, highest day, zero-spend days, top category | Missing | Server `insights` |
| 10 | Presets: this month, last month, 7 days, 30 days, 3 months, this year, custom (inclusive); invalid ranges rejected before any request; no future end | 1/3/6/12 months + custom; future end accepted | New presets; API rejects a future end date |
| 11 | Equivalent data table for every chart; titles and descriptions; legends not by color alone | One sr-only table | Shared chart frame with a data table for each chart |
| 12 | Readable at 320 px, tick thinning | Fixed layouts | Shared scale and tick helpers |
| 13 | Graceful error boundary around the lazy Dashboard | Suspense only | Error boundary with retry |
| 14 | Per-section loading, empty and error states | One block | Per section |

## Backend design (no migration, no new service)

`GET /api/analytics` gains `detail=true` (default false, so existing callers are unchanged). With it the response adds `daily[]`, `weekdays[]` and `insights`. Month rows gain `surplus`, `expense_to_income_percent` and `complete`. A range that ends in the future is rejected (422): every day in a range has therefore elapsed, so zero-spend days, averages and weekday occurrence counts are well defined. All sums are PostgreSQL `NUMERIC`; averages and ratios use `Decimal` with half-up rounding; the browser only formats.

The Reporting Month request is a month-aligned multi-month range (`detail` off); the Analysis request is the chosen range (`detail` on). Neither reads the other's range.
