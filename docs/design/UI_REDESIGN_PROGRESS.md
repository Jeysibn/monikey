# UI/UX redesign — implementation progress

Source of truth: [MONIKEY_UI_UX_REDESIGN_SPEC.md](./MONIKEY_UI_UX_REDESIGN_SPEC.md) (agreed design direction, 2026-11-11).
`DESIGN.md` and `UI_UX_SPEC.md` still describe the older baseline until the redesign lands.

## Phase 2 — Add/Edit Transaction (local branch `feat/ui-redesign-transaction-dialog`)

Implemented:

- Field order: Type, Amount, Date, Account(s), Category, Kakeibo envelope, preview and warnings, Note, footer.
- `AccountPicker`: searchable inline combobox (grouped Last used / Cash & bank / E-wallet / Credit cards, balance or amount owed per option, arrow keys, Enter, Escape closes only the list). Eligibility still comes from `accountsFor`.
- `DateShortcuts`: Today / Yesterday beside the native date input; "today" is the data source's Asia/Manila date. No time of day.
- Compact Kakeibo row (`EnvelopePicker`): shows the choice and suggestion, five chips on request; suggestion still never overwrites a manual choice or a stored envelope.
- `DialogContent size="wide"`: 580px desktop dialog, near-full-height phone sheet, capped to the visual viewport while a keyboard is open.
- Pure rules in `src/lib/accountPicker.ts` with tests in `tests/accountPicker.test.ts`.

Not yet done (blocked on later phases): category icons and colors in the form (need backend support: migration, API, `wire.ts`).

No change to ledger rules, validation messages, save/delete flow, or backend.

## Phase 2 verification record (2026-11-12, local, nothing pushed)

| Check | Result |
|---|---|
| `tsc -b` | clean |
| `oxlint` | clean |
| `npm test` (node:test) | 309 tests, 309 pass, 0 fail (includes `tests/accountPicker.test.ts`) |
| `npm run build` | succeeds |
| Playwright on the Compose QA stack (throwaway project and DB, torn down afterwards) | 5/5 pass: `categories.spec.ts` (3), `quick-add-categories.spec.ts` (1, updated), `quick-add-redesign.spec.ts` (1, new, includes an axe WCAG 2.x A/AA scan with the picker open) |
| Manual scripted check, Chromium emulation | No horizontal overflow and dialog within viewport at 320, 360, 390, 768, 1024, 1440 px; footer inside viewport at 390 and 1440 |

Account picker autofocus is intentionally adaptive (owner-approved): the search box takes focus only for keyboard-initiated opens or lists over 6 accounts, so the phone keyboard does not open for every selection.

### Real-device checks still to do (not covered by emulation)

Use synthetic data only. Record device, OS and browser version for each.

**iOS Safari (iPhone, current and one older major version)**
- [ ] Add transaction opens as a near-full-height sheet; header and Save/Cancel footer stay visible.
- [ ] Tap Amount: numeric keypad appears; the sheet shrinks above the keyboard (visual viewport) and the footer is not hidden.
- [ ] Date: native date picker opens fully in view; Today/Yesterday work; the saved date is not shifted a day.
- [ ] Account picker: opens inline, list scrolls inside the sheet, tapping an option selects it, keyboard does not open for a short list, opens for a long one.
- [ ] Rotate to landscape and back; pinch/zoom text size set to large; safe-area padding under the footer on a notch/home-indicator device.
- [ ] Validation errors scroll to and focus the affected field.

**Android Chrome (a small and a large phone)**
- [ ] Same checklist as iOS, plus the back gesture/button closes the dialog or list without losing typed values unexpectedly.
- [ ] Gboard suggestions bar does not cover the account search or Save.
- [ ] Display size and font scale at maximum: no clipped controls, no horizontal scroll.

See also `docs/design/REAL_DEVICE_CHECKLIST.md` for the existing release checklist.

## Phase 3 — Categories, appearance and navigation (local branch `feat/ui-redesign-categories-nav`)

Baseline: the local integrated branch `feat/frontend-moki-integration` (verified to contain PRs #26–#29's `1c4d046` plus the Moki work, migration 008, `/api/analytics`, Dashboard and the five-column mobile navigation), with the Phase 2 branch merged in. The remote copy of that branch is behind by 15 local commits; nothing here is pushed.

Implemented:

- **Migration 009** (`database/009_category_colors.sql`): nullable `color_key` with a curated-key CHECK, and a strict-superset icon CHECK (24 Lucide keys). Additive, no backfill, no ledger change. Registered in `migrate.py`, compose, test scripts and the recovery rehearsal.
- **API:** `color_key` on create/update/read, `usage_count` on every category response (one grouped aggregate for lists), `color_key` in analytics category rows.
- **Contract:** `types.ts`, `wire.ts`, `httpSource`, `mockSource`/`mockData` carry colorKey and usageCount; unknown or missing keys fall back to the neutral color; wrong types are contract errors.
- **Registries:** `lib/categoryColors.ts` (10 curated colors, contrast-checked in tests), 12 more icons, `CategoryBadge` (tinted icon square).
- **Categories page:** Expenses / Income / Archived tabs with counts, search, envelope filter, sort (most used, A–Z), rows with icon, color, default envelope and usage; Add/Edit dialog with icon picker, color picker, default envelope (expense only), live preview; styled Archive confirmation; Delete only from the editor and only while unused (in-place confirmation); Restore immediate.
- **Shared components:** `ConfirmPanel` / `ConfirmDialog` (compact destructive confirmation, replaces `window.confirm`).
- **Appearance consumers:** Quick Add category chips and Activity rows show the persisted badge; Dashboard category list uses it too.
- **Navigation:** the existing five-column bar (Overview, Dashboard, Activity, More, Add; Accounts, Kakeibo and Categories under More) was verified at 320/360/390 and on desktop; unchanged.

Not done (by decision or later phases): Recharts and the Dashboard rebuild (ADR-025 not approved), Overview/Kakeibo/Accounts/Activity redesign phases, deployment of anything.

### Phase 3 verification record (2026-11-12, local)

| Check | Result |
|---|---|
| `tsc -b` | clean |
| `oxlint` | clean |
| `npm test` | 324 tests, 324 pass |
| `npm run build` | succeeds |
| `database/test.sh` (fresh install and 008→009 upgrade on disposable Postgres 17.6, plus 18 migration-runner unit tests) | passes |
| `database/rehearse_recovery.sh` (pre-005 backup restored, migrated 005–009, API checked, financial snapshot unchanged) | passes |
| `backend/test.sh` | 69 passed |
| Playwright on the Compose QA stack: `categories*`, `quick-add*`, `navigation`, `overview-dashboard` | 16 of 17 pass in one ordered run on a fresh database; the failing one (`overview-dashboard.spec.ts:5`) passes alone and depends on accounts already existing, which is not something this work changed |
| Playwright in mock mode (the harness `dashboard`/`moki` specs are written for) | 18 pass, 1 skipped by design |
| Playwright `dashboard` with `MONIKEY_DASHBOARD_API_FIXTURE=1` against the real API | analytics, axe and 320px specs pass; the 2 mock-only scenario specs do not apply to API mode |
| Manual scripted check, Chromium emulation | no horizontal overflow and no console errors at 320, 360, 390, 768, 1024, 1440 px; editors fit the viewport |

Real-device checks for Categories (iOS Safari, Android Chrome) are still open: tabs on one row, icon grid scrolling inside the sheet, color swatch tap targets, keyboard behaviour with the editor open.

## Phase 4 — Kakeibo (local branch `feat/ui-redesign-kakeibo`, from the cleaned Phase 3 tip)

Implemented (frontend only; no backend, calculation or migration change):

- **Two ARIA tabs** (`components/Tabs.tsx`: arrows, Home, End, roving tabindex, linked panels): Plan & Progress and Reflections. Tabs only switch what is shown; the month stays shared with Overview and Activity.
- **Plan & Progress:** cobalt plan summary (`PlanHero`: set aside for the four envelopes, spent in envelopes, left or over, one progress bar, an over-limit count); four envelope cards with a subtle accent per envelope (`ENVELOPE_ACCENT`, separate from category colors, contrast-checked); the Not-yet-classified card with the Classify action; folded Monthly plan details (`PlanDetails`: planned income, starting funds, savings target, debt reserve, available to allocate, unallocated or over-allocated, intention, Recorded so far, Edit/Confirm plan); no-plan state keeps the Moki pose, the "No plan for … yet" heading and a Create plan action.
- **Reflections:** the existing weekly check-in and month-end reflection cards and dialogs, unchanged in behaviour, including saved snapshots and the "activity changed since this reflection" warning (reworded to point at the Plan & Progress tab).
- **Accessibility fix:** the header plan button's accessible name now starts with its visible text ("Create/Edit/Confirm plan for October 2026"). The old label failed WCAG 2.5.3 (label in name) and was found by axe.
- **Display arithmetic only:** `planProgress` sums the server's four per-envelope figures in whole centavos (unit-tested, including agreement with `available − unallocated`). Savings targets are labelled goals, never savings, and unclassified expenses stay inside total expenses with the screen saying so.

### Category Suggestions removed — functional equivalence confirmed first

| Category Suggestions (removed from Kakeibo) | Where it lives now |
|---|---|
| Set the default envelope of an active expense category | Categories → Edit → "Default Kakeibo envelope" (also for archived ones) |
| See every category's default at a glance | Category rows show "Default: Needs" etc.; the envelope filter (Any, each envelope, No default) lists them |
| Income categories have no default | Editor hides the field for income; API and database refuse it |
| A default only suggests for new expenses; saved ones are unchanged | Stated in the editor; covered by `quick-add-categories.spec.ts` (suggestion, manual override wins, history unchanged) and backend tests |
| Bulk save with partial-failure handling | Not carried over: each category saves on its own, so there is no partial failure to report |

Kakeibo now links to Categories ("Manage category defaults"). The DataSource `setCategoryEnvelope` method and its API route remain; nothing in the UI calls them any more.

### Phase 4 verification record (2026-11-12, local)

| Check | Result |
|---|---|
| `tsc -b` / `oxlint` / `npm run build` | clean |
| `npm test` | 332 tests, 332 pass (8 new: plan-progress sums, over-limit counts, no-plan, unclassified excluded, envelope accent contrast) |
| Playwright, real stack on a fresh DB: `kakeibo`, `categories*`, `navigation`, `overview-dashboard`, `quick-add*` | 22 of 22 pass |
| `kakeibo.spec.ts` + `overview-dashboard.spec.ts` repeated 8 times on the real stack | 48 of 48 pass |
| Playwright, mock mode: `dashboard`, `moki`, `navigation`, `overview-dashboard`, `kakeibo` | all pass (API-only tests skip by design) |
| Manual scripted check, Chromium emulation: plan, no-plan and reviewed states, both tabs | no horizontal overflow and no console errors at 320, 360, 390, 768, 1024, 1440 px |

Test stabilisation done in this phase: `overview-dashboard.spec.ts` no longer depends on accounts left by earlier specs (`browser-tests/fixtures.ts` seeds its own), and specs that run axe on a freshly loaded page ask for reduced motion, because axe sometimes sampled the header Add button halfway through its 150 ms colour fade (a measurement artifact, reproduced at 2 in 30 loads before and 0 in 60 after).

Real-device checks for Kakeibo (iOS Safari, Android Chrome) are still open: tab keyboard and touch behaviour, the folded plan details, the reflection dialogs with the on-screen keyboard.

## Phase 5 — Dashboard (local branch `feat/ui-redesign-dashboard`, from the Kakeibo tip)

Decision recorded first: **ADR-025 accepted with native SVG** (no Recharts or any charting library); see `docs/architecture/ADR.md` and the measurements in `docs/architecture/proposed/ADR-025-FEASIBILITY-recharts-measurements.md`. Audit and gap list: `docs/design/DASHBOARD_GAP_ANALYSIS.md`. Behavior and API reference: `docs/design/ANALYTICS_DASHBOARD.md`.

Implemented:

- **Two independent scopes.** Reporting Month (KPIs, six-month columns, Kakeibo plan versus actual) and Analysis range (category, daily, weekday, daily Kakeibo, insights) have separate state and separate requests; the account filter belongs to the analysis only.
- **Monthly section:** four KPI cards (total income, total expenses, surplus or deficit, expense-to-income ratio, "Not available" without income), income-versus-expenses columns with the current month hatched and labelled month to date, Kakeibo plan versus actual with limit ticks and "Over by" in words, unclassified shown apart, savings targets stated as goals.
- **Analysis section:** presets (this month, last month, 7 days, 30 days, 3 months, this year, custom) validated before any request; spending by category (donut, sortable highest, lowest, A to Z, archived labelled); daily spending including zero-spend days; weekday averages by occurrence count; daily Kakeibo spending (stacked, unclassified included); insights (average daily, expense transactions, highest day, zero-spend days, top category).
- **Backend** (`/api/analytics`, no migration): per-month `surplus`, `expense_to_income_percent`, `complete`; opt-in `detail=true` adding `daily`, `weekdays`, `insights`; future end dates rejected.
- **Frontend:** native SVG primitives and tested chart maths; a data table, keyboard readout and legend for every chart; per-section loading, empty and error states; an error boundary around the lazy Dashboard.
- **Bundle:** the Dashboard chunk is 28.07 kB (9.12 kB gzip) for all six charts and their tables, against 13.49 kB (3.81 kB gzip) before; the entry bundle grew from 160.47 to 161.41 kB gzip.
- **Bugs found by the new tests and fixed:** a scrollable data table that a keyboard could not reach (now only scrolls, labelled and focusable, while visible); the lazy-chunk retry (a cached failed import needs a reload).

### Phase 5 verification record (2026-11-12, local)

| Check | Result |
|---|---|
| `tsc -b` / `oxlint` / `npm run build` | clean |
| `npm test` | 358 tests, all pass (26 more than the 332 before this phase) |
| `backend/test.sh` | 85 passed (16 new analytics tests; 69 before) |
| Playwright, real API on a fresh DB, `MONIKEY_DASHBOARD_API_FIXTURE=1`: `dashboard`, `overview-dashboard` | 11 pass, 2 skipped (mock-only scenarios) |
| Playwright, real stack: `kakeibo`, `categories*`, `navigation`, `quick-add*` | 20 of 20 pass |
| Playwright, mock mode: `dashboard`, `moki`, `navigation`, `overview-dashboard`, `kakeibo` | 27 pass, 2 skipped by design |
| Accessibility: axe WCAG 2.0 and 2.1 A and AA at 320, 390 and 1440 px, data tables closed and open | no violations |
| Manual scripted check, Chromium emulation, 320, 360, 390, 768, 1024, 1440 px | no horizontal overflow, no console errors |

Real-device checks for the Dashboard (iOS Safari, Android Chrome) are still open: chart touch reading, the custom date inputs, the data tables with the on-screen keyboard.

## Phase 6 — Accounts (local branch `feat/ui-redesign-accounts`, from the Dashboard tip)

First, one decision recorded: the Dashboard's **account filter stays analysis-only**. The monthly KPIs, monthly columns and monthly Kakeibo plan versus actual always cover all accounts, and the monthly section now says "All accounts"; the analysis states when it is filtered. Documented in `ANALYTICS_DASHBOARD.md` and pinned by the browser test.

Implemented (frontend only; no backend, API or migration change):

- **Toolbar** (`AccountsToolbar`): search by name (case and extra spaces ignored), type filter (All, Cash & bank, E-wallets, Credit cards), sort (Default order, Name A–Z, Highest balance, Lowest balance, Most owed), the existing Cards/List toggle, and a live count ("2 of 5 accounts"). Placed after the net-position summary, as in the spec.
- **Sorting never ranks a debt as a balance:** balance sorts order only cash, bank and e-wallet accounts and list cards after them A–Z; "Most owed" orders cards and lists the other accounts after them; the toolbar says what each sort compares.
- **Saved presentation choices:** display mode, type and sort persist in this browser (`monikey.accountsView`, validated field by field; corrupt or blocked storage falls back to defaults). The search is not saved. No figure is ever stored.
- **Summary:** "Net position as of today" with Money you have, Money you owe, and "money you have minus what you owe; available credit isn't cash".
- **Account details** (`AccountDetailsContent`): a right-hand drawer from 768 px and a near-full-height bottom sheet below; original card artwork; for money accounts the current balance, for cards the amount owed (or card credit), limit, limit in use, a progress bar and **available credit labelled "(not cash)"**; Over-limit and below-zero warnings; recent activity (the account's latest five entries); Edit account in the footer. Opened from the card face (grid and Overview deck) and from a new Details button in the list.
- **Quick actions, existing flows only:** money accounts get Add expense, Add income and Transfer (money moves from this account); cards get Add expense (a purchase, adds to debt) and Pay card (disabled, with the reason, when nothing is owed). Edit account and View all in Activity (this month, filtered to the account) for all.
- **No new API:** recent activity reuses the Activity read, which already filters by account; it takes the current month and tops up from the previous month only when fewer than five entries exist.
- **Shared dialog:** `DialogContent size="drawer"`.
- **Unchanged by design:** card artwork and faces, the three-dot menu, tap/click and keyboard gestures on cards, the Overview deck, account deletion (none), banking, billing cycles and charts (none added).

Bugs found by the new tests and fixed: the artwork collapsed to a line inside the drawer (an `overflow-hidden` wrapper in a fixed-height grid); two buttons were both named "Close" (the footer is now "Done").

### Phase 6 verification record (2026-11-12, local)

| Check | Result |
|---|---|
| `tsc -b` / `oxlint` / `npm run build` | clean |
| `npm test` | 375 tests, all pass (17 new: filter, search, sorts, saved preferences incl. blocked or corrupt storage, recent-activity read) |
| Backend / database suites | not run: nothing in them changed in this phase |
| Playwright, real API on a fresh DB: `dashboard` (fixture), then `accounts`, `kakeibo`, `categories*`, `navigation`, `overview-dashboard`, `quick-add*` | 11 pass and 2 skipped (mock-only), then 29 of 29 |
| Playwright, mock mode: `accounts`, `dashboard`, `moki`, `navigation`, `overview-dashboard`, `kakeibo` | all pass (API-only tests skip by design) |
| Accessibility: axe WCAG 2.0 and 2.1 A and AA, Accounts in Cards and List at 320 to 1440 px, and the details drawer | no violations |
| Layout: drawer geometry at 320, 360, 390, 768, 1024, 1440 px; no horizontal overflow, no console errors | right-hand 440 px full-height panel from 768 px; bottom sheet below |

Real-device checks for Accounts (iOS Safari, Android Chrome) are still open: the bottom sheet with the on-screen keyboard (search), card swipe and tap on the Overview deck, and drawer scrolling.

## Phase 7 — Overview and Activity polish (local branch `feat/ui-redesign-overview-activity`, from the Accounts tip)

Reference: [ACTIVITY_SEARCH_FILTERS.md](./ACTIVITY_SEARCH_FILTERS.md) (behavior, server contract, and the check that no ADR is required).

**Overview** (every calculation, the hero, the wallet deck and swipe, card artwork and the Moki rules are unchanged):

- **Hero first.** The "Welcome back!" panel moved from above the hero to below it, in a slot reserved at the panel's measured height at every width, so it appearing or disappearing during a refresh moves nothing (it still hides while data is loading, stale or failed, as the Moki rule requires). The "Updating…" stamp no longer reflows the header.
- **Quick actions** directly under the hero: Add expense, Add income, Transfer, Pay card (opens on the card that owes the most; off with a reason when none owes). They open the existing Quick Add flow and wait for the accounts to load.
- **Two balanced desktop columns:** Wallets with This month, and Recent activity with Credit cards (no more gap under a shorter card). Below 1024 px the order is unchanged.
- Navigation unchanged and tested: View analytics, View all (Activity), View all accounts, and Open (the account details drawer). No Dashboard analytics were added to Overview.

**Activity:** search (debounced, clear button, Escape), type and category filters with consistent combinations, archived categories with history, Reset filters, honest count labels, paging that restarts on any filter change, and filters applied by the server before the page limit. Backend: three read endpoints gained optional `q`, `category_id` and `kind` parameters (no migration).

**Test isolation:** the Moki browser spec wrote three tracked reference screenshots every run. It now writes to `test-results/` unless run with `MONIKEY_UPDATE_BASELINES=1`. The approved baselines are unchanged.

Bugs found by the new tests and fixed: a typed-then-Reset race that re-applied a pending search after the reset; the reserved welcome slot being shorter than the panel; and a paging test that only passed once earlier runs had piled up rows (it now seeds 111 rows itself).

### Phase 7 verification record (2026-11-12, local)

| Check | Result |
|---|---|
| `tsc -b` / `oxlint` / `npm run build` | clean |
| `npm test` | 395 tests, all pass (20 new for Activity filters) |
| `backend/test.sh` | 99 passed (14 new for the filters; 85 before) |
| `database/test.sh` | passes (no schema or migration change in this phase) |
| Playwright, real API on a fresh DB: `dashboard` (fixture) first | 11 pass, 2 skipped (mock-only) |
| Playwright, real API, same DB: `activity`, `overview`, `accounts`, `kakeibo`, `categories*`, `navigation`, `overview-dashboard`, `quick-add*` | 44 pass, 0 fail, 2 skipped (mock-only) |
| Playwright, mock mode: `accounts`, `activity`, `overview`, `dashboard`, `moki`, `navigation`, `overview-dashboard`, `kakeibo` | 48 pass, 0 fail, 5 skipped (API-only) |
| Tracked files changed by running the suites | none (the Moki spec now writes to `test-results/`) |
| axe WCAG 2.0 and 2.1 A and AA: Activity with filters and Overview, 320 to 1440 px | no violations |

Real-device checks (iOS Safari, Android Chrome) stay open, now including the Activity search field with the on-screen keyboard and the Overview quick-action row.
