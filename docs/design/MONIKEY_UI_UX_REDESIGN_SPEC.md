# MoniKey — UI/UX Redesign & Functional Specification

**Version:** 1.0 — consolidated design direction  
**Prepared:** 2026-11-11 (Asia/Manila)  
**Suggested repository destination:** `docs/design/MONIKEY_UI_UX_REDESIGN_SPEC.md`  
**Scope:** Frontend experience, page architecture, reporting/date configuration, shared dialogs, supporting API implications, and implementation acceptance criteria.  
**Status:** **User-selected design direction; not yet implemented.** This document records what was agreed in design discussion. It is not a claim that the code, database, charts, or integrations have been updated.

> **How to use this document:** Treat Sections 2–9 and 11–13 as the agreed target design, subject to validation against the live app and existing architecture. Section 10 contains **additional suggestions requiring separate approval**. For conflict resolution, preserve existing ledger invariants and data integrity; change visual presentation and workflow without silently changing financial meaning. `DESIGN.md` and `docs/design/UI_UX_SPEC.md` describe the older implemented baseline and may require a deliberate update when this redesign is developed.

---

## 1. Product objectives and scope boundaries

MoniKey is a private personal finance web application built with React, TypeScript, Vite, FastAPI, PostgreSQL, and homelab deployment. The redesigned app must distinguish these destinations:

| Destination | Primary question | Role |
|---|---|---|
| **Overview** | What do I have and owe, and what should I do next? | Everyday financial snapshot and quick actions |
| **Dashboard** | Where did my money go and what patterns are changing? | Dedicated analytics and reports (separate from Overview) |
| **Activity** | What did I record and what needs correcting? | Transaction history, editing, discovery |
| **Accounts** | What do I have/owe by account? | Card-centered account management |
| **Categories** | How should income/expenses be organized and classified? | CRUD, appearance, and Kakeibo defaults |
| **Kakeibo** | How will I plan and reflect on spending? | Monthly plan/envelopes and reflective practice |
| **Shared Add action** | How can I quickly record an entry? | Access the same transaction dialog across the app |

**Protect these invariants:**

- A cash, bank, or e-wallet balance is liquid money; available credit is **not** cash.
- Net position is liquid balances minus signed card liabilities, including any card credit as applicable. Do not double-count card credit.
- Credit-card **purchases are expenses**; card repayments and transfers between owned accounts are **not expenses** or income.
- The **expense category** says *what the spending was for*; the **Kakeibo envelope** says *how it was classified*. Both are separate recorded properties.
- Planned savings, declared savings, and spending allocations are not automatically verified cash balances.
- All saved financial calculations/aggregates should be authoritative on the backend, in centavos/decimal-safe arithmetic; frontend previews must be clearly labeled estimates.
- Previously saved classifications and transaction amounts must not be silently rewritten by appearance or category-default edits.
- Keep original MoniKey wallet/card artwork and associated product-selection rules. Do not substitute third-party bank/issuer artwork without required approval.
- Avoid duplicating major analytics charts across Overview, Dashboard, and Kakeibo.

### Source files reviewed on the repository's default branch

- `frontend/src/views/{OverviewView,ActivityView,AccountsView,CategoriesView,KakeiboView}.tsx`
- `frontend/src/components/{AppShell,TransactionForm,QuickAddDialog,AccountForm,AddAccountDialog,EditAccountDialog,DeleteConfirm,StatusMessage,MonthSelect}.tsx`
- `frontend/src/components/wallet/{WalletCard,WalletGrid,WalletStack,WalletCardDetailsDialog,WalletViewToggle,CardProductPicker}.tsx`
- `frontend/src/components/kakeibo/{PlanSummary,EnvelopeCard,WeeklyReview,MonthlyReview,KakeiboPlanDialog,KakeiboPlanForm,ClassifyDialog,CategorySuggestions,EnvelopePicker}.tsx`
- `frontend/src/lib/{entryForm,kakeibo,categoryList}.ts`, `frontend/src/types.ts`, `backend/main.py`, `database/007_custom_categories.sql`, and browser tests.

These files are the **current baseline**; the proposed Dashboard does not yet exist as a view in the reviewed frontend.

---

## 2. Navigation and shared application shell

**Desktop:** Continue using the current sidebar/rail visual language, adding Dashboard as an explicit page. Suggested destinations: Overview, Dashboard, Activity, Accounts, Categories, Kakeibo. Keep the Add Transaction action in page headers or an equally discoverable primary action.

**Mobile:** The current shell has five destinations plus a fixed Add action, already using six columns. Adding Dashboard would make seven items too crowded on a 320–390px phone. **Do not simply add another equal-width tab.** Recommended solution: preserve a clearly reachable Add action, put most-used destinations in the mobile bottom bar, and surface Categories and any overflow destinations through a labeled More/menu entry. Exact five-item composition and user navigation testing remain a design detail to finalize before implementation.

**Shared UX:** Clearly label active page; preserve keyboard focus and `aria-current`; show meaningful empty/loading/error states; use predictable route or view transitions. The current app uses React view state rather than a URL router. If deep-linkable chart/account filters are needed, assess routing as an enhancement rather than introducing it implicitly.

**Shared date semantics:** Store calendar transaction dates as `YYYY-MM-DD`; interpret reporting ranges with the **Asia/Manila** calendar. Display date ranges explicitly and inclusively. Avoid timezone-induced one-day shifts. **Transaction time-of-day is not in the current transaction model** and is not part of this redesign.

---

## 3. Overview — approved direction

**Identity:** Simple, everyday money-management screen. Keep distinct from the rich Dashboard page.

### Information hierarchy

1. **Net-position hero** — original flat deep-cobalt design. Explain `Money you have − Card debt (+ card credit where applicable)` and show a clear **current/as-of-today** label.
2. **Current balances/credit context** — liquid assets, debt, and wallet-related figures, without implying available credit is cash.
3. **Monthly income and expense summary** — clearly labeled for the selected calendar month, not mislabeled “This month” when an earlier month is selected.
4. **Existing wallet artwork/deck** — retain original cards and interaction model, with easy account-specific actions.
5. **Recent activity** — brief recent list; View all opens Activity using an appropriate corresponding filter.
6. **Credit-card summary** — owed, limit, available credit, pay-card action, and over-limit status as relevant.

### Filtering and presentation

- Current balances, card debt, and net position are **point-in-time** and should **not** falsely change when a monthly spending selector changes.
- Any period-based income/expense figure must show its selected month; transaction previews should obey the indicated period.
- Keep charts lightweight or absent here. Detailed breakdowns and patterns belong on Dashboard.
- No change to artwork, major visualizations, or accounting rules is implied by Overview polish.

**Technical note:** `OverviewView.tsx` already contains a deep-cobalt net-position hero, monthly totals, wallet deck, credit-card summary, and recent activity. The task is presentation refinement and semantic clarity, not wholesale replacement.

---

## 4. Dashboard — separate analytics destination (approved)

**Identity:** Modern, visually polished reporting workspace with useful charts, comparisons, accurate metrics, clear date boundaries, and drill-downs.

### 4.1 Two independent date configurations — mandatory

**A. Reporting month** (defaults to the current calendar month, month-to-date when incomplete): controls the fixed monthly KPI cards, the monthly income-versus-expense trend, and the **Monthly** view of Kakeibo performance. Selected reporting month determines the anchor/latest month of the multi-month trend. **The separate analysis date range MUST NOT change these monthly cards or this chart.**

**B. Analysis date range** (defaults to this month through today): controls spending by category, daily spending, weekday averages, daily Kakeibo breakdown, and More Insights.

**Recommended analysis presets:** This Month; Last Month; Last 7 Days; Last 30 Days; Last 3 Months; This Year; Custom Range. Define “Last 3 Months” as the current and previous two calendar months, current month only through today; show exact boundaries on the UI. The rolling presets include today. The custom range has an inclusive start/end. Optional All Time can be deferred.

**Validation:** Restrict start to valid calendar date, end >= start, avoid selecting future data by default; provide explicit empty states. Reject invalid ranges before API calls. A user can navigate to older reporting months without changing the independent analysis dates.

### 4.2 First section: fixed monthly financial KPIs

| KPI | Definition | Behavior |
|---|---|---|
| **Total income** | Sum of recorded income transactions for the selected reporting month | Monthly only |
| **Total expenses** | Sum of recorded expense transactions for that month, including card purchases but excluding card repayments/transfers | Monthly only |
| **Period surplus / deficit** | Monthly income minus monthly expenses | Monthly only; may be negative; **not the same as account cash flow** |
| **Expense-to-income ratio** | `(monthly expenses / monthly income) × 100` | Monthly only; if income = 0 show “— / not available,” not infinity |

**Income vs. Expenses chart:** side-by-side **monthly columns**, never daily income-vs-spending bars. Show several consecutive months through the selected reporting month. Current month must be marked **month-to-date**. A day without salary is not necessarily a financially bad day, which is the reason for this decision.

### 4.3 Analysis-driven charts

| Chart | Type | Date behavior | Interaction |
|---|---|---|---|
| **Spending by category** | Donut/pie with visible category legend and amounts, or coordinated horizontal bars for legibility | Analysis range | Sort **highest first**, **lowest first**, **A–Z**. Drill down to transactions. Show icon/colors from Categories. |
| **Daily spending** | Interactive time-series line or vertical bars | Analysis range, by local calendar date | Every date appears (including zero-expense days); show readable date and pesos on hover/tap. |
| **Spending by weekday** | Seven-column bar chart | Analysis range | Group by weekday using **average expense per occurrence** (including zero-spend days), not raw totals only. |
| **Kakeibo Monthly** | Plan vs. actual, four envelopes | **Reporting month** | Clearly distinguish plan from actual and identify over-limit/unclassified spending. |
| **Kakeibo Daily** | Spending by date, grouped or separated by envelope | **Analysis range** | Four fixed envelopes plus unclassified where appropriate. Daily mode is actual spending, not a daily budget allocation. |

**Kakeibo date behavior:** A monthly plan belongs to one calendar month. Do not divide or silently aggregate monthly plans across an arbitrary multi-month custom range. Daily Kakeibo view may span the analysis range using actual transactions. Monthly mode remains anchored to Reporting Month.

### 4.4 More Insights (analysis-range driven)

- **Average daily spending** = all expense spending in range / number of elapsed/selected calendar days, including zero-expense days.
- **Recorded transaction count**: label exactly whether this is *all recorded ledger entries* or *expense transactions*. Recommended: display **Expense transactions** for spending analysis; add an All Entries count only if differentiated.
- **Highest spending day**: date and total expense amount in the selected range (ties handled consistently).
- **Zero-spend days**: count of calendar days with ₱0 expenses; only include elapsed dates for current-date presets.
- Additional top-category indicator as appropriate; avoid adding unsupported predictions or AI insights to v1.

### 4.5 Useful controls and chart standards

- Optional **account filter** for analytic panels; filter eligibility and totals correctly when a transaction is from a credit-card account.
- Chart tooltip: exact date / category, value in pesos, and relevant percent or comparison.
- Accessible chart legend + tabular fallback for screen readers and easier inspection.
- Visual palette should complement MoniKey's cobalt/neutral design, using category colors only in relevant categories.
- Responsive charts with readable axis labels on phone; avoid overcrowding charts with 30+ tick labels. Keep data points discoverable by tap.
- Dashboard account/category drill-down opens filtered Activity, retaining matched criteria where the backend supports them.
- **Historical net-position chart** is deferred until reliable dated account balances and balance-adjustment history exist. Never relabel current balances as historical amounts.
- Calculate report series and monetary aggregates using backend-authoritative logic; do not summarize only the currently paginated Activity list in React.

**Suggested frontend rendering:** Recharts with shadcn-compatible chart presentation, subject to dependency review and design standards. Backend reports require date-range aggregation support beyond the existing month-based summary.

---

## 5. Categories — separate management page (approved)

### 5.1 Core CRUD and data model

Create, edit/rename, archive, restore, and delete categories. Every category has:

- Stable ID; **income or expense type** (immutable after creation, as in current database design).
- Name (normalized/unique within type, preserving existing database validation).
- **Icon** (a validated Lucide icon identifier chosen from a curated picker).
- **Color** (validated from a curated palette; choose readable background/foreground pair).
- For **expense only**: **default Kakeibo envelope** = Needs, Wants, Culture, Unexpected, or No Default.
- Archive status and optional derived usage count.

Colors and icons are presentation metadata; they must **not** change transaction amounts or accounting classifications. Category appearance and Kakeibo mapping are independent: Food and Transport can have distinct colors while both map to Needs.

### 5.2 Category → transaction → Kakeibo behavior

1. User creates/edits `Food`, type Expense, icon Utensils, color Green, default envelope Needs.
2. User opens Add Expense, selects Food.
3. The form **automatically preselects Needs**, unless the user has explicitly chosen another envelope for that new entry.
4. User can manually override Needs to Wants/Culture/Unexpected/Unclassified for that expense.
5. The saved transaction keeps its own envelope. Later changing Food's default does **not** retroactively reclassify it.
6. Editing an existing expense preserves the saved envelope unless the user deliberately changes it.

**Source review:** The current `TransactionForm.tsx`, `EnvelopePicker.tsx`, and `frontend/src/lib/kakeibo.ts` already implement default suggestions and user override behavior. Preserve and test them.

### 5.3 Page layout

- Header with **Categories** and primary **Add Category** action.
- Tabs or segmented filter: **Expenses / Income / Archived** (with accessible counts if available).
- Search input; filters for type/status/envelope; **sorting** by most-used, alphabetical (at least).
- Rows feature icon, name, category type, default Kakeibo mapping, color accent and an overflow menu.
- Desktop compact rows, mobile touch-friendly list; optional grouping by envelope.
- **Add/Edit** opens a modern dialog / mobile sheet rather than permanently showing an inline form.
- In Add/Edit: Name, fixed/new Type, Icon picker, Color picker, Default Kakeibo Envelope (expense only), mini transaction appearance preview, Save/Cancel.
- Show a backend-derived transaction **usage count** where feasible, with an explicit definition (all-time count).

### 5.4 Safety and lifecycle

- Archive is preferred if a category already has historical transactions; archival must not break history.
- Permanent delete allowed **only when unreferenced**, consistent with current API.
- Replace browser `window.confirm()` for Archive/Delete with accessible styled confirmations describing their effects.
- Archived categories must not be offered to **new** transactions; an existing transaction being edited may retain its archived category.
- Prevent duplicate normalized names, including conflicts with archived entries, per existing DB rules.
- Put permanent category-to-envelope mapping in **Categories**, not a duplicate Kakeibo editor.

### 5.5 Shared appearance consumers

Display category icon/name/color consistently in Categories, the transaction form, Activity rows, and Dashboard category legends. Maintain readable contrast and never convey meaning by color alone. A migration and API/wire typing change are needed for persistent icon/color properties.

---

## 6. Kakeibo — monthly planning and reflections (approved)

**Identity:** Modern, calm, focused *planning workspace*, not a second analytics dashboard. Preserve fixed envelopes: **Needs / Wants / Culture / Unexpected**.

### 6.1 Two in-page tabs

- **Plan & Progress** (default): Monthly progress, envelope cards, unclassified expenses, and access to monthly plan editing.
- **Reflections**: Weekly check-in and month-end reflection, retaining existing saved snapshots and notes.

Tabs change the visible section but **do not** create separate primary sidebar pages.

### 6.2 Plan & Progress hierarchy

1. Header: Kakeibo title, selected **calendar month**, Create/Edit/Confirm Plan action.
2. Focal monthly spending-plan summary: Total envelope allocation, *classified* spend, remaining envelope balances (signed as needed), and clear progress indicator; avoid treating savings targets as actual money saved.
3. **Four envelope cards** (responsive 2×2 or single column where narrow): semantic icons, subtle individualized accent colors, planned limit, spent, remaining, accessible progress bar, explicit over-limit text. A zero-limit/unplanned envelope should not pretend to have a meaningful percentage.
4. **Unclassified expenses** card, with clear amount and **Classify expenses** action. Its expenses remain included in monthly total expenses, even if not counted in classified-progress totals.
5. **Monthly plan details** (secondary/collapsible): planned income, starting funds, savings target, prior-period debt reserve, available to allocate, unallocated/over-allocated, and optional monthly intention.

Plan details should be authoritative from Kakeibo's server report, not recomputed from displayed card figures.

### 6.3 Reflections hierarchy

- **Weekly check-in:** Show Monday–Sunday period, relevant envelope spending, and three optional prompts: surprised by, worthwhile, and next week differently. Use guided, short-form dialog/sheet.
- **Monthly reflection:** Current recorded totals, self-reported savings, optional questions about savings, what changed, appreciated spending, surprises, and lessons; preserve recorded snapshot and **actuals-changed-since-review** notice.
- Reflection is never forced by a reminder and never changes ledger/account balances.

### 6.4 Category integration

Remove the **duplicate Category Suggestions editor** from Kakeibo after the Categories replacement is functional. Provide a link to **Manage category defaults** on Categories. Continue classifying previously unclassified expenses from Kakeibo using the existing protected flow.

### 6.5 UI details

- Keep Kakeibo's accent treatments subtle and consistent with MoniKey's primary palette.
- Preserve monthly-plan validation, lack-of-plan states, legacy plan confirmation, over-allocation notices, and careful failed-save handling.
- Keep detailed daily/weekday spending trends in **Dashboard**, not duplicated here.

---

## 7. Accounts — preserve card-centered design (approved)

**Core instruction:** **Keep the current original artwork, card-face layout, and Cards/List modes.** Accounts remains primarily an account-management page, not a new analytics dashboard.

### 7.1 Screen hierarchy

1. Page title and **Add Account**, **Transfer** actions.
2. Compact current **Net Position** summary: liquid money, card debt, signed net position, as of today. Avoid competing visually with Overview's large hero.
3. **Account gallery** as the dominant element, preserving the responsive existing wallet/card grid, original artwork, tap-to-open details, and credit limit visualization.
4. Compact toolbar: **Search**, type filter (All; Cash & Bank; E-wallets; Credit Cards), **Sort**, and **Cards/List** view toggle.
5. Empty state for no accounts/no filter results; keep Add Account easy to find.

### 7.2 Sorting and preferences

- Sorting: Name A–Z, amount high-to-low/low-to-high with clear type-specific semantics. Do not compare an *amount owed* as though it were a positive liquid balance; label or constrain mixed-type sorts to avoid confusion.
- Prefer keeping the selected Cards/List mode and other presentation preferences across sessions. If persisted, use validated presentation-only storage, separate from financial source of truth.

### 7.3 Account Details redesign

Preserve entry point (click/open card). Evolve existing read-only dialog to a richer **details drawer/panel**: on desktop a right-hand drawer is recommended; on mobile a full-height scrollable sheet.

- Original card image and account name/type.
- Liquid account: Current balance, account-specific **Add Expense**, **Add Income**, **Transfer** actions.
- Credit card: Amount owed or card credit, limit, available credit, utilization, **Pay Card** action. No misleading Add Income/Transfer-from-credit actions.
- **Recent activity** for this account and **View all in Activity**, filtered to the account.
- **Edit Account** action and existing form/selection rules.

If recent account activity needs a new API or expanded data source, implement an exact filter and pagination without inventing balances/history.

**Do not add in this redesign:** Bank sync, card due-date scheduling, payment reminders, balance-history chart, account deletion, or statement-cycle modeling.

---

## 8. Shared pop-up/dialog framework — approved

### 8.1 Current modal inventory (repository review)

| Current component/flow | Access | Treatment |
|---|---|---|
| `QuickAddDialog` + `TransactionForm` | All pages; Activity edit | **Highest priority redesign**; shared entry flow |
| `DeleteConfirm` (within Quick Add) | Activity | Retain as same-dialog confirmation state |
| `AddAccountDialog` | Overview/Accounts | Standard form dialog |
| `EditAccountDialog` | Overview/Accounts | Standard form dialog |
| `WalletCardDetailsDialog` | Overview/Accounts | Upgrade to account details drawer/sheet |
| `KakeiboPlanDialog` | Kakeibo | More organized plan form |
| `ClassifyDialog` | Kakeibo | Preserve staged classification and partial failure handling |
| Weekly check-in dialog (`WeeklyReview.tsx`) | Kakeibo | Guided reflection dialog |
| Monthly reflection dialog (`MonthlyReview.tsx`) | Kakeibo | Organized reflection dialog |
| Category Suggestions dialog (`CategorySuggestions.tsx`) | Kakeibo | Deprecate when Categories handles defaults |

Other *non-modal* pop-ups: wallet three-dot action menu (`<details>`), native month/account dropdowns, native category archive/delete `window.confirm()` prompts, and nested card-product picker *inside* Add/Edit Account.

**New dialogs/overlays planned:** Create/Edit Category, archive/delete category confirmations, Dashboard chart-to-transaction drill-down, and enhanced account details.

### 8.2 Three presentation classes

1. **Standard form dialog** / mobile bottom sheet: Add/Edit Transaction, Add/Edit Account, Add/Edit Category.
2. **Confirmation dialog**: Delete Transaction, Archive/Delete Category and other destructive actions.
3. **Large detail/form surface**: Account Details, long Kakeibo plan/reflections, Dashboard drill-downs. Use right-side drawers on desktop where materially better; don't force this on every dialog.

Shared expectations: consistent header/title, dismiss/close action, scrollable body, safe fixed/persistent footer, visible validation, success/error states, focus trap and focus return, keyboard support, 44px+ touch targets, reduced-motion behavior, stable unsaved form state, and no save while pending.

### 8.3 Current base

`frontend/src/components/ui/dialog.tsx` currently uses Radix; on phones it renders a bottom sheet (max 92dvh) and on desktop a centered 500px dialog. Its scrollable body and persistent footer should be preserved, with more appropriate dimensions and positioning for long forms.

---

## 9. Add/Edit Transaction — P0 design (approved)

This is the most frequently used interaction. **Keep one reusable entry form** for Expense, Income, Pay Card, and Transfer; Add and Edit share the same components, with mode-specific fields and validation.

### 9.1 New primary order

1. **Type**: Expense, Income, Pay Card, Transfer; an existing saved type remains fixed while editing (as currently implemented).
2. **Amount**: prominent peso amount input, mobile numeric keyboard, existing decimal-safe validation.
3. **Date**: move directly below Amount, **above Account/Category/Kakeibo**, accessible without scrolling on a typical phone. Today/Yesterday shortcuts plus a clearly labeled date-picker control. New entries default to today's Manila calendar date; editing preserves the saved date. Do **not** add time-of-day in this phase.
4. **Account selection**: replace basic select with an accessible, **searchable visual account picker**. Each option shows name, account type, relevant balance or owed amount. Group by Cash & Bank / E-wallets / Credit Cards as appropriate; allow recently used/frequent account near top. Preserve the existing session-level last-account preference and account-specific preselection from wallets.
5. **Category** (Income/Expense only): touch-friendly options with curated saved icon/color; remain unselected by default unless explicitly chosen by the user for this entry. Do not automatically remember last category.
6. **Kakeibo** (Expense only): compact row showing category-suggested envelope; tap to expand the four envelopes and Unclassified; preserve explicit manual overrides. Show a concise explanation when a category suggestion differs from a saved/manual choice.
7. **Note**: optional, visually secondary.
8. **Footer**: Cancel/Save fixed, with destructive Delete action in Edit mode and in-place deletion confirmation state.

**Conditional grouping:** Transfer has Source Account + Destination Account; Pay Card has Paying From + Target Card and Pay Full if applicable. Their controls must remain near each other and have transaction-kind-specific eligibility rules.

### 9.2 Account-picker behavior

- Expense can use a cash/bank/e-wallet **or credit card**; credit-card expense adds debt.
- Income, transfers, and payment funding sources use liquid accounts only, per current ledger rules. Pay Card target uses a credit card.
- Prevent transfer source = destination; do not present impossible options.
- A category/amount/date selection should survive picker opening/closing. Search, select, keyboard navigation, Escape/close, and no-result states required.
- Avoid nested focus traps or awkward portal layering if picker is itself a popover inside a modal. Test in Safari/mobile browsers.
- If a native picker is more accessible on particular devices, a progressively enhanced interface is acceptable; the goal is reliable, easy account selection.

### 9.3 Date picker placement and ergonomics

- Date is *near the top*, immediately after Amount, and remains visible before lengthy category/Kakeibo controls.
- Today/Yesterday shortcuts update the same date value; custom choice persists.
- Open the platform/native calendar or an accessible custom calendar positioned **inside the viewport**, not obscured by sheet footer or keyboard.
- Prevent accidental midnight UTC conversions and preserve existing edit values.
- On validation error, scroll the affected field into the visible sheet body and move focus there.

### 9.4 Size, scroll, preview and feedback

- Mobile: near-full-height bottom sheet where appropriate, fixed header/footer, only content region scrolls, safe-area and on-screen keyboard support.
- Desktop: consider ~560–600px dialog rather than current 500px, subject to testing.
- Balance/debt preview and warnings remain; optional explanatory content like “Pause before buying?” can be collapsed. **Never hide critical financial warnings.**
- Keep focus in Amount on opening a new entry; keyboard and screen reader flows must accommodate the new field order.
- Reuse existing backend mutation, validation, field errors, frozen save state, and explicit success/error messages.

---

## 10. Additional observations — recommendations NOT YET approved

These are high-value opportunities discovered during the final code review; they **do not silently expand the committed redesign**.

### A. Activity discovery and filtering (highest-value extra)

Current `ActivityView.tsx` exposes **month + account** filters, groups transactions by date, and loads more records. It lacks a first-class search or type/category filter. Recommend adding:

- Search by note/category/account (server-supported for pagination correctness).
- Filters for transaction kind (expense/income/payment/transfer) and category, with a clear Reset button.
- Filter inheritance when opening Activity from a Dashboard category/date, or Accounts account details. Ensure backend filters are applied **before pagination**, never only to already-loaded rows.
- Clear date-range labels and a safe custom range option if Activity should support Dashboard drill-downs. Keep existing month picker for simple use.

### B. Account balance-adjustment clarity

`AccountForm.tsx` permits editing an account's present balance or present debt without creating ordinary income/expense activity. This is valid as a balance correction, but users should be able to distinguish **Set current balance** from a normal financial transaction. Recommend explicit wording/warnings and, in a later backend feature, auditable adjustment history (without falsifying transaction totals). This also blocks misleading historical net-position charts.

### C. Navigation scalability and deep-link experience

Current mobile bar has six cells; adding Dashboard creates an overcrowding risk. Finalize a mobile overflow navigation design before adding pages, and consider deep-linkable URLs for `/dashboard`, account drill-downs, and Activity filters as a separate technical decision.

### D. Contextual post-save feedback and onboarding

Existing `StatusMessage.tsx` shows successful saves near the top of the page. On a long scrolled screen, ensure save feedback is *actually noticed* without jerking scroll to the top. Consider a short accessible toast/status region in a predictable viewport position (not blocking bottom navigation), preserving current live-region announcements. Also provide helpful empty states when no accounts, categories, plans, or matching transactions exist.

### E. Date semantic consistency and data testing

The baseline shares a month value between Overview, Activity and Kakeibo. The new Dashboard intentionally requires **two independent date controls**. Document and test which values are synchronized vs independent, and ensure only the applicable summaries update. Consider a shared `DateRange` utility with tests around month transitions, February, New Year, and local-date handling.

---

## 11. Visual design system and accessibility

### Existing baseline worth preserving

- Modern, restrained light interface with cool off-white background, white cards, Manrope typography, cobalt primary `#1D5FD6`, deep-cobalt hero `#0B3278`, and orange liability treatment.
- Rounded cards and controls (baseline: 20px cards, 12px inputs, 24px dialogs), consistent semantic tokens, readable labels, tabular numeric typography.
- Existing original MoniKey wallet artwork; no unauthorized real issuer assets.
- Accessible focus indicators, reduced-motion preferences, clear loading/error/empty/success states, meaningful label text.

### Carefully approved enhancements to reconcile with old style guidelines

- **Category icon + color palette**: use small tinted icon treatments and category-associated swatches where helpful, instead of applying many large saturated panels across the app. Existing `DESIGN.md` previously disallowed tinted icon squares; update that rule **intentionally and narrowly** for Categories, not accidentally across all components.
- **Charts**: visuals are allowed on **Dashboard**, despite older docs marking charts as out of scope. This is an intentional product-scope change; use readable axes, legend semantics and fallback tables.
- **Kakeibo envelopes**: four subtle accent colors are acceptable for scanability, with each envelope named in text. Do not mistake envelope color for custom category color.
- **Responsive dialogs**: standard and large variants can coexist; avoid animation for decoration or unnecessary visual effects.
- Maintain WCAG-aligned contrast for text/icons on category colors, data series distinguishable without color alone, 44px touch areas, keyboard interaction, and screen-reader status updates.

### Responsive QA widths

At minimum test **320, 360/390, 768, 1024 and 1440px**, including mobile landscape, virtual keyboard, short viewport height, large font settings, scrollbar behavior, and reduced motion. Previous Playwright/axe checks are a baseline; new surfaces need fresh tests.

---

## 12. Data contracts, migration plan, and cross-feature dependencies

| Change | Existing state | Needed implementation |
|---|---|---|
| Dashboard view | Not present in reviewed `AppShell`/`App.tsx` | Add route/view, nav, date state, APIs, charts and tests |
| Monthly KPIs | `GET /api/summary?month=YYYY-MM` supports month totals | Reuse month totals; add multi-month trend endpoint or date-safe monthly-series query |
| Analysis ranges | Current Activity and summary are month-centered | Add server-backed inclusive start/end filters and groupings (example **proposed** `/api/reports/spending?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD`) |
| Kakeibo planning | Monthly plans/reports, week reports/reflections exist | Reorganize UI; derive daily actual breakdown via safe reporting endpoint while leaving plans monthly |
| Category CRUD | `GET/POST/PATCH/DELETE /api/categories`; archive endpoint; migration 007 | Redesign page and confirmations; preserve lifecycle semantics |
| Category appearance | Icon/color not yet in reviewed `Category` shape/API | New additive DB migration, backend request/response validation, `wire.ts`, `httpSource.ts`, mock parity |
| Transaction category suggestion | Existing UI selects Kakeibo default for new expense unless overridden | Preserve behavior with compact picker and icon/color chips |
| Wallet details | Read-only dialog with account/card figures | Richer details drawer; account activity query/filter and quick actions |
| Account preferences | Card-view state local to Accounts page; wallet prefs mechanism exists | Persist display mode/filter/sort safely, as presentation-only preferences |
| Navigation | Overview, Activity, Accounts, Kakeibo, Categories plus Add | Add Dashboard and rebalance mobile navigation |
| Category Suggestions editor | Still present inside Kakeibo | Remove redundant editor *after* Categories handles defaults; link to Categories |

**Migration and release safeguards:**

- Migration files must be additive, idempotent where feasible, and versioned after `007_custom_categories.sql` without overwriting historical accounting data.
- Preserve current GitHub Actions → homelab GitOps migration/deployment workflow, including backup/approval protections already required by the deployment pipeline. Do not silently introduce a manual migration step or bypass safeguards.
- Backfill existing categories with safe deterministic fallback icons and neutral accent colors, or serve defaults when fields are null until migration finishes.
- Validate icon IDs against a curated allowlist and color values against an approved token/hex palette to avoid invalid or unsafe rendering.
- Align mock source, HTTP source, serialization (`wire.ts`), API schema, and browser tests. Use server-authoritative totals and fully qualified date filters.
- New analytics endpoints must handle category changes, archived categories, zero rows, and card payments/transfers consistently.

---

## 13. Implementation order and acceptance criteria

**P0 — Most-used flow and foundations**

1. Agree and update the design-spec baseline (this document; avoid prematurely overwriting existing current-state specs).
2. Redesign **Quick Add/Edit Transaction**: date near top, searchable account picker, compact Kakeibo, mobile scroll/footer, maintain validation and existing edit/delete behavior.
3. Implement Categories icon/color persistence and redesign Categories page/dialogs. Ensure new category appearance flows into Quick Add and Activity.
4. Add Dashboard navigation shell and robust **two-scope date state**, without creating an unusable mobile tab bar.

**P1 — Analytics and content layout**

5. Build backend report APIs and Dashboard KPI/monthly chart/category/daily/weekday/Kakeibo/More Insights panels.
6. Refine Overview with clear current-versus-period labels, preserving original hero/cards.
7. Reorganize Kakeibo into Plan & Progress / Reflections; remove duplicate defaults editor only after Categories replacement.
8. Polish Accounts toolbar, preferences, Account Details drawer, and per-account actions/activity.

**P2 — Cross-page polish and optional work (approval needed where noted)**

9. Add chart drill-down navigation and enhance Activity filtering/search if approved.
10. Complete dialog sizing, unified confirmation styling, save feedback, documentation updates, and full responsive/accessibility QA.
11. Defer account balance-history charts, due dates, bank sync, AI advice, and account deletion as separate scopes.

### Acceptance checks by area

- **Quick Add:** On a typical phone, Amount and Date are reachable above the long-form scroll; account search works; picker is accessible; type-based account eligibility is correct; editing retains original date and Kakeibo override; save and delete remain safe.
- **Categories:** Create/edit/archive/restore/delete works; icons and colors persist after reload; no referenced category can be deleted; Food → Needs defaults only on new expenses unless manually overridden; old expenses remain unchanged.
- **Dashboard:** Changing Analysis Range never changes monthly KPIs or the monthly income-vs-expenses chart. Selecting Reporting Month changes those monthly components, not unrelated analysis range. Daily charts include zero-spend dates; weekday averages use occurrence counts. Custom invalid ranges show validation and do not query. Currency figures match backend reports.
- **Kakeibo:** Envelopes show correct spent/limit/remaining and over-limit wording; unclassified amount is visible; plan savings not reported as actual; weekly/monthly reflections and saved snapshots are preserved; category defaults are managed in Categories.
- **Accounts:** Original artwork remains intact and responsive; Cards/List works; credit availability is never totaled as cash; account details and quick actions route to valid transaction workflows; preferences behave predictably.
- **Overview:** Current balances remain current even when reporting month changes; selected monthly labels are accurate; wallet and Activity handoff work.
- **Activity (if enhancements approved):** Filtering/search occurs before pagination; drill-down parameters produce matching transaction lists and a clear path back.
- **Shared:** No horizontal overflow at tested sizes; visible focus and announcements; error recovery; no duplicate financial counting; existing browser/contract/unit tests remain passing and are extended for new behavior.

---

## 14. Decision log and exclusions

### Agreed / selected by user in this design conversation

- Keep **Overview** and **Dashboard** separate with different purposes.
- Dashboard: four monthly KPIs and income-vs-expense **fixed at monthly granularity**; independent date-controlled category analysis, daily spending/weekday patterns, Kakeibo daily detail, and More Insights.
- Categories: standalone page; create/edit/archive/restore/delete, icon and color customization, Kakeibo defaults, search/filter/sort, usage count and preview.
- Kakeibo: polished monthly plan + envelope progress and dedicated reflections tab; remove redundant category mapping editor in favor of Categories.
- Accounts: preserve the existing cards and artwork; improve surrounding controls, account details and actions, not redesign the card faces.
- Shared pop-ups: adopt consistent responsive visual framework.
- **Add/Edit Transaction** is top priority. Put Date directly after Amount and improve account selection, responsive behavior, and compact Kakeibo interaction.

### Additional suggestions pending separate approval

- Activity search/type/category/date filters and deeper navigation.
- Auditable account-balance adjustment history.
- Deep-linkable routing and final choice of mobile bottom-bar items.
- Revised viewport-aware status feedback beyond current message system.

### Explicitly excluded / deferred

- Chart redesign on Overview and Accounts; Dashboard is the principal analytics surface.
- Forecasts, advanced AI guidance, subscriptions/recurring transactions, card billing reminders, due dates, bank sync, investments.
- Adding transaction **time-of-day** (current field is calendar date only).
- Retroactive Kakeibo relabeling when a category default changes.
- New account/debt accounting algorithms in the frontend.
- Replacing original wallet artwork or inventing unsupported real issuer graphics.

---

## 15. Existing project references

- Repository: <https://github.com/Jeysibn/monikey>
- Visual baseline: `DESIGN.md`
- Earlier approved screen baseline: `docs/design/UI_UX_SPEC.md`
- Current component inventory: `docs/design/COMPONENT_INVENTORY.md`
- Financial/data architecture: `docs/architecture/TLD.md`
- Kakeibo data contract: `frontend/src/types.ts`, `frontend/src/lib/kakeibo.ts`, `backend/main.py`
- Current category lifecycle migration: `database/007_custom_categories.sql`
- Current UI automated checks: `frontend/browser-tests/categories.spec.ts`, `frontend/browser-tests/quick-add-categories.spec.ts`

**Final note:** All amounts used in prior visual examples were illustrative, not the user's actual financial data. This specification is a design handoff, not evidence that the proposed UI or backend endpoints already exist. 
