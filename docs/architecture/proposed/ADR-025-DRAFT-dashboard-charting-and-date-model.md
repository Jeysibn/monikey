# DRAFT ADR-025 — Dashboard charting library and the two-scope date model

- **Status:** DECIDED 2026-11-12 — the owner chose **native SVG** (no Recharts). The accepted text is ADR-025 in [`ADR.md`](../ADR.md); this file is kept as the proposal record, and its Recharts recommendation (section 3, item 2 and section 4) was **not adopted**. The measurements are in the feasibility record.
- **Date:** 2026-11-12 · **Amends:** ADR-024 (separate Dashboard, only on unmerged PR #25) and the "no charts" boundaries in ADR-015, `DESIGN.md` ("Not added: … charts") and `UI_UX_SPEC.md` ("No charts, no sparklines…").
- **Numbering note:** ADR-023 and ADR-024 exist only on PR #25's branch. If #25 is not merged first, renumber on merge.

## 1. Which rule applies (correction)

ADR-009 is the PostgreSQL/backup decision; it says nothing about charts. The rules that constrain this proposal are:

- **ADR-015 boundaries:** no additional styling library, no dashboard templates or animation frameworks, and "any expansion requires a small documented reason and human sign-off".
- **CLAUDE.md:** no new dependency without an approved ADR.
- **ADR-001–003 scope (three tiers, five tables):** a Dashboard adds read-only queries over the existing tables. It adds no table, service or deployable.
- **DESIGN.md / UI_UX_SPEC.md:** older text says charts are out of scope. This ADR deliberately amends that for the Dashboard only (spec §11).

## 2. Why a Dashboard

Overview answers "what do I have and owe". The approved redesign (spec §4) adds a page for "where did my money go": monthly income vs expenses, category mix, daily and weekday patterns, and Kakeibo plan vs actual. Putting those on Overview would bury balances; Kakeibo is a planning page, not analytics.

## 3. Decision

1. **A Dashboard page with two independent date scopes** (spec §4.1):
   - **Reporting month** drives the four KPI cards, the multi-month income-vs-expenses chart and monthly Kakeibo plan-vs-actual. Always monthly accounting periods; the current month is labelled month-to-date.
   - **Analysis range** drives category spending, daily spending, weekday averages, daily Kakeibo and More Insights. Presets plus an inclusive custom range, validated before any request.
   - Changing one scope must never change the other's output. Enforced by separate state, separate requests and a browser test.
2. **Charting library: Recharts** (recommended, see §4), pinned to an exact version, loaded only in the lazily loaded Dashboard chunk. Every chart gets a text/table fallback and readable labels regardless of library.
3. **Backend-authoritative aggregation** (see §5). The browser never sums paginated Activity rows.
4. No forecasts, AI insights, historical net-position chart or account-balance history (needs dated balance snapshots that do not exist).

## 4. Charting options

| Option | For | Against |
|---|---|---|
| **Recharts 3.x** (MIT; React 19 in peer range) | Declarative React API; donut, bar, line, tooltips, responsive container and keyboard-focusable `accessibilityLayer` built in; widely used, so less code to own | About 10 runtime dependencies (`@reduxjs/toolkit`, `react-redux`, `immer`, `reselect`, `victory-vendor`/d3 pieces, `es-toolkit`, `decimal.js-light`, …); ~7.4 MB unpacked on disk (not what ships). Shipped size must be **measured** after tree-shaking; I have not measured it. Its default screen-reader output is not enough on its own (tables still needed). Supply-chain surface grows |
| Native SVG/CSS (what PR #25's branch does) | Zero dependencies; smallest bundle; full control; already written for bars, a line and a simple legend | We maintain axes, tick thinning, tooltips/tap targets, donut maths and responsiveness ourselves for 6+ chart types; easy to ship an inaccessible or cramped chart |
| visx / D3 directly | Fine-grained control, tree-shakeable | Lower-level than Recharts; more code than Recharts, more dependencies than native SVG |
| Chart.js / ECharts / Nivo | Feature-rich | Canvas (poor accessibility) or much heavier; not React-native |
| shadcn "chart" component | Matches design tokens | It is a styled wrapper **around Recharts**, so it implies Recharts and is a template-style add-on (ADR-015) |

**Recommendation:** the owner prefers Recharts, and for six chart types with tooltips and a donut it is a reasonable choice. Approve it only with these gates: exact-version pin, lazy-loaded chunk, a recorded before/after gzip size of the Dashboard chunk (and no growth in the entry chunk), `npm audit` clean at install, and the table fallbacks. If the measured chunk is unacceptable, the fallback is native SVG (the approach already prototyped), with no ADR change needed beyond this one.

## 5. Data aggregation

Extend, rather than replace, `GET /api/analytics` from PR #25's branch (single inclusive Manila range, ≤ 366 days, optional `account_id`, decimal strings, half-open SQL range). Required additions for the approved design:

- `daily[]`: every calendar date in the range including zero-spend days (`generate_series`), with expense total and per-envelope totals plus an "unclassified" bucket.
- `weekdays[]`: per weekday, total, **occurrence count** of that weekday in the range, and the average (total ÷ occurrences, zero days included). Rounding rule documented and tested (half-up to centavos).
- `insights`: average daily spending, expense-transaction count, highest spending day (deterministic tie-break: earliest date), zero-spend days (elapsed dates only for ranges that include today).
- Reporting-month data is the same endpoint called with a month-aligned multi-month range, so KPIs and the trend share the analysis query code but never the analysis range.
- Income and expenses keep the ledger definitions: expenses include card purchases once; card payments and transfers are excluded; income only from income categories; surplus ≠ account cash flow; expense-to-income ratio is `null` when income is 0 (shown as "not available").
- Kakeibo plan comparison only for complete months and never across an arbitrary custom range; hidden while an account filter is active (existing rule).
- Performance: one bounded query per section, existing indexes on `transaction_date`; 366-day cap keeps result sets small. Add `EXPLAIN` evidence on the QA dataset before release.

## 6. Financial invariants (tested, not assumed)

Card purchase = one expense. Card payment and transfer = neither income nor expense. Available credit is never cash. Saved plan numbers are plans, not savings. Appearance (icon/colour) joins by category ID and never changes amounts. Archived categories stay in historical totals.

## 7. Accessibility and responsiveness

Each chart: title, legend with text labels (never colour alone), tap/keyboard-reachable data points, and an adjacent or collapsible data table. Axis tick thinning at 320–390px; no horizontal page scroll; reduced-motion respected (animations off). Verified with axe and Playwright at 320/360/390/768/1024/1440.

## 8. Consequences

- New runtime dependency tree (Recharts) only after approval; lockfile change reviewed alone.
- The Dashboard page must keep working with the library stubbed out (tables remain).
- Older docs' "no charts" lines must be updated in the same change.
- Production rollout, migrations and deployment are separate authorizations.

## 9. Approval needed

- [ ] Approve Recharts (exact version to be chosen at install time and recorded) **or** choose native SVG.
- [ ] Approve amending the "no charts" boundaries for the Dashboard only.
- [ ] Approve extending `/api/analytics` as in §5 (no new table, no migration).
