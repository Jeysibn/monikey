# Monikey Frontend — Second Review and Implementation Report

**Reviewed branch:** `feature/frontend-implementation`  
**Reviewed commit:** `c36c5234bbe0ff4c341117bdd816f94285d2ed15`  
**Compared with first-review commit:** `62cb4033f7977476ef8f68ec6e0dacf5bc448724`  
**Review date:** 2026-08-30  
**Scope:** Frontend only; no backend implementation is requested.

## Executive verdict

The first implementation brief was tackled substantially. The branch now has a coherent frontend state/domain layer, working local mutations, PHP currency formatting, responsive layouts, accessibility improvements, the Money Position feature, and a much broader Playwright suite. Do **not** restart the frontend or repeat already completed work.

It does not yet tackle everything. The main remaining risks are no longer cosmetic: several mutations do not preserve financial meaning or period consistency. In particular, adding a budget category increases the total budget instead of consuming unallocated money; “this month” figures include every transaction regardless of date; dashboard expense trends do not react to new expenses; and goal funding creates savings without reducing any source balance. These should be corrected before treating the frontend state model as the contract for a future backend.

## Verification performed

| Check | Result | Notes |
|---|---|---|
| `npm ci` | Pass | Dependencies installed from lockfile. |
| `npm run lint` | Pass | No lint errors. |
| `npm run build` | Pass | Production bundle built successfully. |
| `npm run test:e2e -- --list` | Pass | 41 Playwright tests are discovered. |
| `npm run test:e2e` | Environment-blocked | All tests stopped before app interaction because the Playwright Chromium executable is absent in this review environment. This is not evidence of application test failures. |
| Source and screenshot review | Complete | Desktop/mobile screenshots and the changed frontend source were inspected. |

## Status of the first implementation brief

| Original item | Status | Second-review finding |
|---|---|---|
| FR-001 — State boundary | Mostly complete | Domain types, selectors, provider, hooks, and repository exist. The provider still hardcodes the mock repository, selectors import a mock helper, and captured-state callbacks are vulnerable to stale updates. |
| FR-002 — Add Transaction | Mostly complete | Controlled form, validation, local save, reset, attachment filename, dynamic options, and toast exist. Period handling, category/type filtering, money validation, time formatting, and fee visibility remain incomplete. |
| FR-003 — Dead controls | Mostly complete | Core local workflows work and unsupported actions are generally disabled or labeled. Completed-goal actions only expose “Coming soon” through unreliable hidden/title text. |
| FR-004 — CSS collisions | Complete | Generic collision-prone styles were consolidated or renamed sufficiently. No rewrite to CSS Modules is necessary now. |
| FR-005 — PHP currency | Complete for current UI | PHP formatting is centralized. The module-level configuration will not trigger React rerenders if a future settings screen changes it at runtime. |
| FR-006 — Derived-value consistency | Partial | Many values are now derived, but time periods, budget allocation, goal funding, trend data, and transfer fees still fail reconciliation or labeling rules. |
| FR-007 — Responsive layouts | Mostly complete | Mobile navigation, mobile transaction cards, full-screen modal behavior, and responsive grids exist. Global scrollbar hiding is a new usability regression. |
| FR-008 — Accessibility | Partial | Contrast, progress labels, chart alternatives, and disclosure semantics improved. Some small text, category-tag contrast, hidden scrollbars, and incomplete tab semantics remain. |
| FR-009 — Money Position | Implemented with regression | The feature exists, but it was moved below the dashboard grid and its calculation is incomplete enough that “Safe to spend” sounds more authoritative than the data supports. |
| FR-010 — Tests and docs | Partial | 41 E2E tests and updated docs exist. Requested unit tests are absent, key finance invariants are untested, and committed screenshots predate the last three UI commits. |

## Implementation instructions

### Working rules

- Preserve the current visual direction, routes, component organization, and completed local workflows.
- Keep this frontend-only. Use deterministic local data; do not add an API or authentication.
- Treat all displayed totals as consequences of one state model. Do not patch individual cards with separate constants.
- Put financial rules in pure domain/selectors functions and cover them with unit tests.
- Use one explicit active reporting period everywhere a label says “this month,” “today,” daily, weekly, or monthly.
- A mutation must either reconcile all affected state or be labeled as a non-financial preview/allocation.
- Do not silently convert invalid financial input into a different valid amount.

---

## SR-001 — Make all period-based calculations truthful

**Priority:** P0  
**Primary files:** `src/domain/finance.ts`, `src/state/financeSelectors.ts`, `src/services/mockFinanceRepository.ts`, `src/pages/Transactions.tsx`, `src/pages/Dashboard.tsx`

### Problem

`totalIncome`, `totalExpenses`, and `netCashFlow` sum every transaction, although their UI labels say “this month.” An expense dated in a past or future month also increments the current budget category. This makes date selection cosmetic and lets unrelated periods contaminate current figures.

### Required change

1. Add an explicit reporting-period concept, initially fixed to the seeded demo month if necessary. A small `ReportingPeriod` value with `start` and exclusive `end` is sufficient.
2. Add shared local-date helpers. Do not compare ISO date strings in components.
3. Make income, expense, net cash flow, transfer count, budget spending, and expense-trend selectors accept or derive the same period.
4. When saving a transaction, do not imperatively add any dated expense to the current budget. Prefer deriving category spend from period-filtered transactions. If retained in state, update it only when the transaction belongs to the active period and prove consistency with tests.
5. Ensure the words “this month” and “today” refer to the exact periods used by the calculations.

### Acceptance criteria

- A transaction inside the active month immediately changes the matching monthly KPIs.
- A transaction outside the active month is saved and visible in history but does not change active-month KPIs or budget spend.
- Transfers remain excluded from income and expense totals.
- Boundary dates at the start and end of the period behave deterministically in the configured local timezone.
- No component contains its own alternate definition of the active month.

---

## SR-002 — Fix budget allocation semantics

**Priority:** P0  
**Primary files:** `src/services/mockFinanceRepository.ts`, `src/state/financeSelectors.ts`, `src/pages/Budget.tsx`

### Problem

`addBudgetCategory` adds the new category allocation to `totalBudgetAllocated`. As a result, using “+ New category” increases the monthly budget and leaves the unallocated amount unchanged. That contradicts the UI, which presents the new amount as an allocation from the remaining pool.

### Required change

1. Treat `totalBudgetAllocated` as the total monthly envelope, not the sum to expand on every category creation.
2. Adding a category should consume `budgetUnallocated` while leaving the total envelope unchanged.
3. Reject an allocation greater than the currently unallocated amount and show an inline error.
4. If increasing the total monthly envelope is desired later, make it a separate explicit action.
5. Prefer deriving unallocated money as `total envelope - sum(category allocations)` so it cannot drift.

### Acceptance criteria

- Starting with ₱2,000 unallocated, adding a category with ₱500 allocation leaves ₱1,500 unallocated.
- The displayed total monthly budget does not increase during that operation.
- Zero, negative, non-finite, and over-unallocated values cannot be saved.
- The category and its allocation persist after closing/reopening local UI state.

---

## SR-003 — Reconcile goal funding and goal completion

**Priority:** P0  
**Primary files:** `src/domain/finance.ts`, `src/services/financeRepository.ts`, `src/services/mockFinanceRepository.ts`, `src/pages/Goals.tsx`, `src/components/MoneyPosition.tsx`

### Problem

“Add Funds” increases a goal balance without selecting or reducing a source account and without recording a transfer/allocation. A goal can also reach or exceed its target while remaining active and “Behind pace.” The resulting goal total, available cash, and Money Position no longer describe one financial reality.

### Required change

Choose and document one model:

- **Recommended — funded savings:** “Add Funds” requires a source account, reduces that account, records a goal-funding ledger entry or transfer, and increases the goal.
- **Alternative — allocation-only:** the action does not claim money moved; rename it to “Allocate” and ensure Money Position does not count the same cash twice.

Then:

1. Prevent funding above the remaining target unless overfunding is an explicitly supported rule.
2. When `currentAmount >= targetAmount`, set `status: 'goal_reached'`, set `active: false`, and record a normalized completion date.
3. Recompute active-goal contributions and progress from the updated state.
4. Decide how completed goals affect available cash and document the rule in the domain model.

### Acceptance criteria

- Funding cannot create money or double-count the same money as both available cash and reserved savings.
- Reaching a target automatically transitions the goal to completed state.
- A completed goal does not remain in active-goal contribution calculations.
- The completion UI does not continue to display “Behind pace” or allow unrestricted additional funding.

---

## SR-004 — Make expense trends derive from transaction state

**Priority:** P1  
**Primary files:** `src/domain/finance.ts`, `src/state/financeSelectors.ts`, `src/services/mockFinanceRepository.ts`, `src/pages/Dashboard.tsx`

### Problem

`expensesTrend` is seeded static data. Saving a new expense updates transactions and account/budget state but not the dashboard’s “today” value or daily/weekly/monthly chart.

### Required change

1. Prefer deriving daily buckets from dated expense transactions.
2. Derive weekly and monthly views from the same source or provide one documented aggregation function.
3. Ensure the expense period control changes both the series and the summary/accessible table.
4. Remove duplicate trend state if it can drift from transactions.

### Acceptance criteria

- Adding an expense dated today changes the today total and relevant chart bucket immediately.
- Adding an income or transfer does not change expense trends.
- Chart, legend, and accessible table expose identical values.

---

## SR-005 — Strengthen the repository/state boundary

**Priority:** P1  
**Primary files:** `src/state/FinanceProvider.tsx`, `src/state/financeSelectors.ts`, `src/services/financeRepository.ts`, `src/services/mockFinanceRepository.ts`

### Problem

Selectors import `accountLabelForId` from the mock repository, so pure domain reads depend on a mock implementation. The provider hardcodes the repository and its callbacks close over the render’s `state`; two mutations issued before rerender can cause the second to operate on stale state. The synchronous full-state repository API is also not a drop-in contract for a future HTTP service despite the README implication.

### Required change

1. Move account-label lookup into selectors/domain utilities.
2. Apply mutations through a reducer or functional state updater so every mutation receives the latest state.
3. Inject the repository into the provider or explicitly name the current layer as a local state adapter.
4. Do not pretend a synchronous state transformer is an HTTP repository. Either document the future adapter boundary honestly or introduce an async command interface with loading/error handling when backend work actually begins.

### Acceptance criteria

- `financeSelectors.ts` has no import from `mockFinanceRepository.ts`.
- Two back-to-back mutations both apply without losing the first result.
- Tests can construct the provider with deterministic initial data or a test adapter.
- README architecture wording matches the real replacement seam.

---

## SR-006 — Enforce category and account-form context

**Priority:** P1  
**Primary files:** `src/domain/finance.ts`, `src/components/AddTransactionModal.tsx`, `src/pages/Accounts.tsx`

### Problem

Income and expense tabs expose the same category list, so an income can be categorized as Housing and an expense as Salary. The Add Account form also defaults to `ewallet` regardless of whether it was opened under Bank Accounts or E-Wallets & Cash, allowing a saved item to appear in a different section from the clicked action.

### Required change

1. Add category applicability such as `transactionKinds: ('income' | 'expense')[]`; do not overload `budgetable` for this purpose.
2. Filter category options by the current transaction type and clear an incompatible selection when the type changes.
3. Pass account-section context into Add Account: bank should default/limit to checking or savings; wallet/cash should default/limit to e-wallet or cash.
4. Keep one reusable form, but give it an explicit mode and correct heading/help text.

### Acceptance criteria

- Salary is not selectable for an expense; Housing is not selectable for income.
- Switching transaction type cannot leave a now-invalid category selected.
- “Add account” in Bank Accounts creates a bank-type account by default.
- “Add account” in E-Wallets & Cash creates an e-wallet/cash account by default.

---

## SR-007 — Centralize financial input and date/time handling

**Priority:** P1  
**Primary files:** all finance forms, plus new shared validation/formatting utilities

### Problem

Forms use inconsistent `Number(...)` checks. Scientific notation and non-finite values can pass ordinary number inputs, whitespace can become zero, and the Add Transaction amount sanitizer silently removes a minus sign so `-5` becomes `5` instead of being rejected. New transaction times render as 24-hour `HH:mm` while seed times use 12-hour strings. New goal dates render raw ISO while seed dates are human-readable.

### Required change

1. Add a shared `parseMoneyInput` that rejects blank, non-finite, signed-negative where prohibited, scientific notation, multiple decimal separators, and more than two decimal places.
2. Preserve the user’s raw input while editing; validate rather than silently rewriting meaning.
3. Validate credit-card balance against the chosen limit according to a documented rule.
4. Normalize stored dates/times and format them only at display boundaries.
5. Reject goal target dates in the past and format all goal targets consistently.

### Acceptance criteria

- `-5`, `Infinity`, `1e6`, blank, malformed decimals, and disallowed over-limit values show specific inline errors.
- Valid amounts such as `0.50`, `1,250.75` if commas are supported, and large finite values follow one documented rule.
- All transaction times use one display format.
- Seeded and newly created goal dates use the same human-readable format.

---

## SR-008 — Restore Money Position as the dashboard thesis and qualify its math

**Priority:** P1  
**Primary files:** `src/pages/Dashboard.tsx`, `src/components/MoneyPosition.tsx`, related CSS and selectors

### Problem

The first brief required Money Position to be the dashboard’s primary thesis. The current source renders it after the full dashboard grid. Its “Safe to spend” formula subtracts credit-card minimums and planned goal contributions but omits other known commitments such as recurring bills; planned contributions may also be double-counted depending on the goal-funding model.

### Required change

1. Move Money Position back above the main dashboard grid, or document an intentional product decision that replaces FR-009.
2. Rename the result to **Estimated safe to spend** until the inputs cover all committed obligations.
3. Add a compact explanation of included/excluded inputs.
4. Align goal deductions with the model chosen in SR-003.
5. Include known recurring commitments when the data supports doing so; otherwise state that they are excluded.

### Acceptance criteria

- The feature is visible before secondary analytics at desktop and mobile widths.
- The label does not imply precision beyond the available data.
- The breakdown reconciles exactly to the displayed result.
- Screen-reader text explains the same calculation shown visually.

---

## SR-009 — Restore visible scrolling and finish accessibility semantics

**Priority:** P1  
**Primary files:** `src/styles/global.css`, `src/components/AddTransactionModal.tsx`, `src/pages/Dashboard.tsx`, `src/pages/Goals.tsx`

### Problem

The latest global CSS hides scrollbar chrome on every element. Scrolling still works, but users lose the visual affordance that a page, modal, or wide table contains more content. The transaction-type and expense-period controls use partial `role="tab"` semantics without tab panels, `aria-controls`, or arrow-key behavior. Disabled completed-goal actions expose “Coming soon” only through `title` and visually hidden text.

### Required change

1. Remove the global `*` scrollbar-hiding rules. Prefer native scrollbars or a visible thin themed scrollbar.
2. If any decorative strip truly needs hidden chrome, scope it to that named component and retain another obvious scroll cue.
3. For segmented controls that only switch values, use ordinary buttons with `aria-pressed`; otherwise implement the complete tabs keyboard pattern.
4. Show a visible “Coming soon” note adjacent to disabled completed-goal actions or include it in the button labels.
5. Verify keyboard focus is never clipped in scroll containers and modals.

### Acceptance criteria

- A mouse user can discover every scrollable region without already knowing it scrolls.
- Keyboard and touch scrolling still work.
- Segmented controls announce current selection without misleading tab semantics.
- Unsupported completed-goal actions communicate their status visibly, not only through hover/title text.

---

## SR-010 — Finish transaction reconciliation and display details

**Priority:** P2  
**Primary files:** `src/components/AddTransactionModal.tsx`, `src/pages/Transactions.tsx`, `src/pages/Dashboard.tsx`, selectors

### Required change

1. Show transfer fees explicitly in transaction history and make the account delta reconcilable from the row/detail. Decide whether a fee is represented as part of the transfer or as a separate expense; apply one rule consistently.
2. In Recent Transactions, display a date and time consistently instead of showing time *instead of* date.
3. Distinguish recurring entries from manual entries; do not map every non-OCR source to “Manual.”
4. Expand search to title, category, and account labels.
5. Remove the duplicated “this month” text in KPI cards.

### Acceptance criteria

- A transfer of ₱100 with a ₱5 fee visibly explains a ₱105 source-account reduction.
- Recent rows remain understandable when transactions span multiple days.
- Source labels reflect `manual`, `ocr`, and `recurring` correctly.
- Search finds a transaction by category and account name.

---

## SR-011 — Complete visual legibility polish

**Priority:** P2  
**Primary files:** design tokens and affected page/component CSS

### Required change

1. Raise essential status, forecast, target, and helper text that is still around 9.5–11 px to a readable minimum appropriate for the UI.
2. Separate accent colors used as fills from text foreground colors. In particular, the Utilities category currently uses `--slate-lt` as text, which is too low contrast on card backgrounds.
3. Keep the current dark fintech identity; this is a token/content-hierarchy correction, not a redesign.
4. Verify long labels at 320 px, 390 px, 768 px, 1024 px, and 1440 px without clipping or collision.

### Acceptance criteria

- Essential UI text is not dependent on sub-12 px sizing.
- Every category tag foreground meets WCAG AA contrast for normal text against its actual tag/card background.
- Zoom at 200% does not hide actions or require two-dimensional page scrolling.

---

## SR-012 — Add invariant tests and refresh evidence

**Priority:** P1 for unit tests; P2 for screenshots/docs  
**Primary files:** test configuration, selector/domain test files, `tests/`, `docs/screenshots/`, `README.md`

### Required unit tests

- Period boundaries for income, expense, transfers, budgets, and trends.
- Budget allocation consumes unallocated money without increasing the total envelope.
- Goal funding reconciliation and automatic completion transition.
- Money Position arithmetic and excluded-input labeling.
- Two sequential state mutations cannot lose data.
- Category applicability and account-form modes.
- Money parser rejects non-finite, scientific, negative, malformed, and excessive-precision inputs.
- Transfer fee/account-balance reconciliation.

### Required E2E additions

- Save past- and future-dated transactions and verify active-month totals remain unchanged.
- Add a budget category and verify unallocated amount decreases.
- Fund a goal to its target and verify completion state.
- Add an expense dated today and verify the dashboard trend changes.
- Verify bank and wallet Add Account entry points select the correct modes.
- Verify scrolling affordance and keyboard reachability in the full-screen mobile modal.
- Add a visual or DOM geometry assertion for Recent Transactions at mobile width.

### Documentation and screenshot requirements

The committed screenshots are stale: the screenshot update commit predates the later Money Position reorder, Recent Transactions overlap fix, and global scrollbar change. Regenerate screenshots from the final current code after SR-001 through SR-011. Update README architecture claims to match the actual repository/provider seam and document the chosen reporting period and goal-funding model.

### Acceptance criteria

- Unit tests run in the standard test command and pass in CI.
- Playwright browsers are installed in CI and all defined E2E tests execute, not merely list.
- Desktop and mobile screenshots visibly match final source behavior and layout.
- README does not claim a backend adapter can be swapped without changes unless that is proven by the interface and a test adapter.

---

## Recommended implementation order

1. **SR-001** period model and selectors.
2. **SR-002** budget envelope invariant.
3. **SR-003** goal-funding model and completion transition.
4. **SR-004** transaction-derived expense trends.
5. **SR-005** reducer/provider/repository cleanup.
6. **SR-006** category and account-form constraints.
7. **SR-007** shared money/date/time utilities.
8. **SR-008** Money Position placement and wording.
9. **SR-009** scrollbar and semantic accessibility fixes.
10. **SR-010** transaction reconciliation/display polish.
11. **SR-011** text and contrast polish.
12. **SR-012** complete tests, then regenerate docs/screenshots.

SR-001 through SR-004 establish the financial rules. Avoid writing screenshots or broad E2E assertions against values that will change before those rules are stable.

## Definition of done

- `npm run lint` passes.
- `npm run build` passes.
- Unit tests cover all listed finance invariants and pass.
- All 41 existing E2E tests plus the new scenarios execute and pass with installed Playwright browsers.
- No UI label claims a time period different from the selector used to calculate it.
- Budget, account, transaction, goal, and Money Position totals reconcile after every supported mutation.
- No global rule hides scrollbars.
- Required UI actions are keyboard reachable and unsupported actions have visible explanations.
- Responsive verification is complete at 320, 390, 768, 1024, and 1440 px.
- Final screenshots are regenerated from the same commit being handed off.

## Files with highest implementation relevance

| File | Why it matters |
|---|---|
| `src/services/mockFinanceRepository.ts` | Current mutation logic contains the budget, period, trend, and goal reconciliation gaps. |
| `src/state/financeSelectors.ts` | Central home for period-aware and invariant calculations; currently coupled to the mock repository. |
| `src/state/FinanceProvider.tsx` | Mutation callbacks and repository injection/stale-state boundary. |
| `src/domain/finance.ts` | Reporting period, category applicability, goal-funding, and normalized date/time types. |
| `src/components/AddTransactionModal.tsx` | Category rules, money parsing, date/time normalization, fee behavior, and segmented-control semantics. |
| `src/components/MoneyPosition.tsx` | Product thesis, calculation disclosure, and goal/commitment reconciliation. |
| `src/pages/Budget.tsx` | Allocation limit/error behavior and forecast readability. |
| `src/pages/Goals.tsx` | Funding source/model, completion transition, date validation, and visible coming-soon state. |
| `src/pages/Accounts.tsx` | Section-aware account form and card validation. |
| `src/pages/Dashboard.tsx` | Money Position placement, transaction-derived trends, recent transaction display. |
| `src/styles/global.css` | Global hidden-scrollbar regression. |
| `tests/` | Good E2E foundation, but missing financial-invariant scenarios. |

## Final reviewer note

The branch is meaningfully better than the first-reviewed version and should be iterated, not replaced. The next pass should prioritize trustworthy finance behavior over adding more dashboard surface area. Once the four P0/P1 state invariants are fixed and unit-tested, the remaining work is bounded accessibility, validation, display consistency, and evidence refresh.
