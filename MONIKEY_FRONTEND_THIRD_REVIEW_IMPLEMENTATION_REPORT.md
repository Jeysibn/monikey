# Monikey Frontend — Third Review Implementation Report

**Reviewed branch:** `feature/frontend-implementation`  
**Reviewed commit:** `f4addf9e21d354fc414332c7f3edd5eeeca3049a`  
**Compared with second-review commit:** `c36c5234bbe0ff4c341117bdd816f94285d2ed15`  
**Review date:** 2026-08-30  
**Scope:** Frontend only. Keep the existing custom CSS; a Tailwind migration is not part of this remediation.

## Executive verdict

The second-review recommendations were implemented substantially and the frontend is now much closer to a trustworthy foundation. The commit adds a real Vitest suite, period-aware selectors, transaction-derived expense trends, corrected budget allocation, funded goal transfers, repository injection, section-aware forms, centralized money parsing, restored Money Position placement, visible scrollbars, refreshed screenshots, and 16 additional E2E scenarios.

Do **not** restart or redesign the frontend. Preserve the current visual direction and completed work.

The branch is not fully finished. The highest remaining risk is an inconsistent clock: reporting calculations are fixed to `2026-08-29`, while Add Transaction defaults to the browser’s real date. Once the calendar moves to another month, a newly saved default transaction will not update figures labeled “this month.” Repository mutations also still rely too heavily on UI validation, goal funding can overdraw its source account, the expense chart’s labels do not match its actual time windows, and the documented E2E command is not reproducible from a clean checkout.

No new P0 blocker was found for a frontend demo. The remaining P1 items should be resolved before using this state model as the basis of a backend contract.

## Verification results

| Check | Result | Evidence |
|---|---|---|
| `npm ci` | Pass | Lockfile installation completed. |
| `npm run lint` | Pass with warnings | Exit code 0, but Oxlint reports two React warnings in `FinanceProvider.tsx`: exporting a non-component from a component module and accessing a ref during render. |
| `npm run build` | Pass | TypeScript and Vite production build completed. JS bundle: 314.54 kB, 92.29 kB gzip. |
| `npm test` | Pass | 6 files, 73 tests passed. |
| `npm run test:e2e -- --list` | Pass | 57 Chromium tests discovered across 5 files. |
| `npm run test:e2e` | Environment-blocked | None reached the application because the Playwright Chromium executable is absent. Browser installation was attempted, but the CDN repeatedly timed out and returned a truncated archive. Do not classify these as application failures or as executed passes. |
| Screenshot review | Pass with polish findings | All six screenshots were refreshed in the current commit and now match the source, including Money Position at the top and the corrected mobile Recent Transactions layout. |
| Working tree | Clean | Review did not modify repository source. |

## Status of the second-review tasks

| Task | Status | Third-review assessment |
|---|---|---|
| SR-001 — Period-aware calculations | Partial | Monthly selectors and budget gating are implemented, but the app uses two different definitions of “today”: fixed demo time for calculations and the browser clock for the transaction form. |
| SR-002 — Budget allocation semantics | Complete | New allocations consume the unallocated pool without increasing the total envelope, with repository and UI validation plus tests. |
| SR-003 — Goal funding and completion | Partial | Funding now debits an account, records a transfer, and completes at target. It does not prevent spending more than the source balance, and seed data violates the declared no-overfunding rule. |
| SR-004 — Transaction-derived expense trends | Partial | Trend values derive from transactions and react to new expenses. Weekly/monthly UI titles do not describe the actual bucket ranges. |
| SR-005 — Repository/state boundary | Partial | Mock coupling was removed, injection and back-to-back mutations are tested, and docs are more honest. The provider now reads/writes a ref during render, which React tooling flags. |
| SR-006 — Category and account context | Complete | Income/expense category applicability and bank/wallet form modes are implemented and tested. |
| SR-007 — Input and date/time handling | Partial | Money parsing is much stronger. Calendar dates and times are still not strictly validated or normalized, and the fixed/real clock mismatch remains. |
| SR-008 — Money Position | Complete | Restored above the grid, renamed “Estimated,” reconciled, and clearly discloses exclusions. |
| SR-009 — Scrolling and accessibility semantics | Complete for requested items | Visible themed scrollbars, `aria-pressed` segmented controls, and visible Coming Soon labels are implemented. Form error associations still need a finishing pass. |
| SR-010 — Transaction reconciliation/display | Complete | Fee explanation, source labels, date/time display, and title/category/account search are implemented. |
| SR-011 — Visual legibility | Partial | Critical tag contrast and several 12 px floors were fixed, but essential metadata remains at 9.5–11 px. |
| SR-012 — Tests and evidence | Partial | 73 unit and 57 E2E tests now exist and screenshots are current. The E2E script does not actually build on a clean checkout, and browser execution could not be independently completed in this environment. |

## Preserve these completed improvements

- React 19 + TypeScript + Vite architecture.
- Plain CSS with the existing Monikey design tokens and dark fintech identity.
- Domain, selector, repository, provider, and `useFinance` separation.
- PHP currency formatting.
- Correct budget-envelope allocation.
- Transaction-derived expense trend data.
- Category applicability and section-aware account forms.
- Money Position placement and “Estimated” disclosure.
- Visible scrollbars and corrected segmented-control semantics.
- Transfer-fee reconciliation and expanded transaction search.
- Vitest and Playwright test foundations.
- Current responsive layouts and refreshed screenshots.

---

## TR-001 — Establish one injectable application clock

**Priority:** P1  
**Primary files:** `src/utils/date.ts`, `src/state/financeSelectors.ts`, `src/services/mockFinanceRepository.ts`, `src/components/AddTransactionModal.tsx`, `src/pages/Goals.tsx`, provider/app wiring

### Finding

`DEMO_TODAY_ISO = '2026-08-29'` controls reporting periods, budget days, goal target validation, goal-funding ledger dates, and completion dates. `AddTransactionModal.tsx` separately calls `new Date()` for its default transaction date. These clocks happen to be in the same month during this review, but will diverge as soon as the real date leaves August 2026.

### Required implementation

1. Add one injectable application clock, such as `AppClock` with `todayIso(): string`.
2. Use it for:
   - active reporting period;
   - transaction default date;
   - “today” trend buckets;
   - budget days remaining;
   - goal target-date minimum and validation;
   - goal-funding transaction dates;
   - goal completion dates.
3. Choose one explicit runtime mode:
   - **Recommended:** system-local date in the app, with a fixed clock injected in tests; seed dates should be produced relative to the injected date.
   - **Acceptable demo mode:** fixed demo clock everywhere, including form defaults, with the visible reporting month labeled as August 2026 rather than an ambiguous “this month.”
4. Do not call `new Date()` directly inside individual forms or selectors.

### Acceptance criteria

- The transaction form’s default date always belongs to the active reporting period.
- Advancing a test clock across a month boundary advances KPI totals, chart buckets, budget days, and goal validation together.
- Funding a goal records the injected current date, not a hardcoded date.
- Tests freeze time explicitly and do not depend on the machine’s current date or timezone.

---

## TR-002 — Enforce finance invariants inside the repository

**Priority:** P1  
**Primary files:** `src/services/mockFinanceRepository.ts`, `src/domain/finance.ts`, repository unit tests

### Finding

The forms validate many inputs, but the repository accepts invalid mutation objects when called through another component or test adapter. Examples include a non-finite transaction amount, an expense using the Salary category, a transaction referencing an unknown account, or a same-account transfer. Missing IDs can create ledger rows without corresponding balance movement.

### Required implementation

1. Add shared domain validators and call them from every repository mutation.
2. `addTransaction` must reject:
   - non-finite or non-positive amounts;
   - invalid calendar dates or times;
   - missing/unknown account IDs;
   - same-account transfers;
   - missing transfer destinations;
   - categories not allowed for the transaction type;
   - categories on transfers;
   - invalid or negative fees.
3. Decide and document balance rules:
   - whether asset transactions may create a negative balance;
   - whether a credit-card transaction may exceed the card limit;
   - whether a credit-card payment may exceed the amount owed.
4. Enforce each chosen rule consistently for initial account/card creation and later transactions.
5. Return structured validation errors or stable error codes if component-specific field placement will be needed later.

### Acceptance criteria

- No accepted ledger transaction can reference an unknown account, credit card, category, or malformed date.
- A rejected mutation returns the original state unchanged.
- UI validation and repository validation agree, but repository tests prove the invariant independently of the UI.
- Same-account transfers and category/type mismatches have regression tests.

---

## TR-003 — Complete the credit-card frontend workflow

**Priority:** P1  
**Primary files:** `src/pages/Accounts.tsx`, `src/components/AddTransactionModal.tsx`, repository/selectors, tests

### Finding

The Add Card form does not collect a due date or minimum payment, so every newly created card uses `dueDate: 'Not set'` and `minPayment: 0`. That means a new card cannot contribute meaningfully to Money Position’s upcoming commitments. The transfer form also exposes asset accounts only, even though the repository already supports applying a positive transfer delta to a credit card. Users therefore cannot record a normal bank-to-credit-card payment.

### Required implementation

1. Add due date and minimum-payment inputs to Add Card with normalized storage and validation.
2. Allow an asset account as the source and a credit card as the destination for a card-payment transfer.
3. Label this path clearly as a credit-card payment while retaining transfer semantics so it remains excluded from income/expense totals.
4. Reduce both the source asset balance and credit-card amount owed consistently.
5. Define the commitment horizon used by Money Position. Either filter minimums to a documented upcoming range or replace “due soon” with wording that does not imply a date filter.

### Acceptance criteria

- A newly added card can have a valid due date and minimum payment.
- Its minimum payment appears in Money Position according to the documented horizon.
- Paying ₱500 from Checking to a credit card reduces Checking by ₱500 and credit owed by ₱500 without changing income or expenses.
- Unsupported card-to-asset cash advances remain unavailable unless deliberately implemented.

---

## TR-004 — Finish goal-funding integrity and honest terminology

**Priority:** P1  
**Primary files:** `src/services/mockFinanceRepository.ts`, `src/pages/Goals.tsx`, `src/domain/finance.ts`, seed data, tests

### Finding

Goal funding validates the remaining target but not the source account’s available balance. A user can move more money than the account contains, producing a negative balance while the UI says that balance was “available.” The no-overfunding documentation also conflicts with seed goal `home`, which contains ₱3,743 against a ₱3,500 target. Finally, Goals repeatedly says “auto-save” and “auto-saved,” but no automation exists; the value is only a plan used by Money Position.

### Required implementation

1. Reject goal funding above the selected source account’s available balance unless overdraft is an explicit supported rule.
2. Show the maximum fundable amount as the smaller of account balance and goal remaining amount.
3. Resolve the seed/model contradiction:
   - normalize completed seed goals to their target if overfunding is unsupported; or
   - explicitly support overfunding and update repository rules/docs/tests accordingly.
4. Rename UI copy:
   - `Monthly Contribution` → `Planned Monthly Contribution`;
   - `auto-saved` → `planned`;
   - `Auto-save` → `Monthly plan` or equivalent.
5. Do not imply an automated transfer occurs until a recurring automation feature exists.

### Acceptance criteria

- Funding cannot make a source account negative under the chosen rule.
- Seed data satisfies the same overfunding invariant as user-created data.
- Goal cards, KPI copy, creation form, and Money Position use consistent “planned” terminology.
- Unit and E2E tests cover insufficient source balance and exact completion.

---

## TR-005 — Make expense-chart labels match their data windows

**Priority:** P1  
**Primary files:** `src/pages/Dashboard.tsx`, `src/state/financeSelectors.ts`, tests

### Finding

The Dashboard title map says:

- Daily → “this week,” backed by 7 calendar days — acceptable.
- Weekly → “this month,” backed by four rolling 7-day windows — not necessarily the calendar month.
- Monthly → “this year,” backed by six calendar months — only half a year.

This reintroduces the label/calculation mismatch SR-001 was meant to remove.

### Required implementation

Choose one of these approaches:

- Keep the current buckets and label them **Last 7 days**, **Last 4 weeks**, and **Last 6 months**; or
- Change aggregation to true calendar week/month/year windows matching the existing titles.

Add accessible range context so `W1`–`W4` does not require guessing which dates each bucket contains.

### Acceptance criteria

- Every chart title exactly describes the time range used by its selector.
- Weekly buckets expose date ranges to assistive technology and tooltips/text.
- Unit tests use data near month/year boundaries and prove that titles and ranges stay aligned.

---

## TR-006 — Make FinanceProvider React-safe and lint-clean

**Priority:** P1  
**Primary files:** `src/state/FinanceProvider.tsx`, reducer/store module, provider tests

### Finding

Oxlint reports:

- `react(only-export-components)` because `createReducer` is exported from a component module.
- `react(refs)` because `stateRef.current` is read and written during render.

The current implementation passes its back-to-back mutation tests, but render-phase ref access is unsafe under React concurrent rendering and should not be accepted as the permanent fix for stale closures.

### Required implementation

1. Move reducer/store helpers to a non-component module.
2. Replace render-phase ref synchronization with a React-safe state/store pattern.
3. Preserve both required behaviors:
   - validation errors are synchronously catchable by the calling form;
   - two mutations issued before rerender cannot lose the first result.
4. Keep repository injection for deterministic tests.
5. Memoize the context value if necessary to avoid unnecessary consumer rerenders.

### Acceptance criteria

- `npm run lint` produces zero warnings.
- Existing provider wiring tests continue to pass.
- Add a test covering the chosen pattern under React Strict Mode.
- No ref is accessed during render to synchronize financial state.

---

## TR-007 — Make E2E testing reproducible from a clean checkout

**Priority:** P1  
**Primary files:** `package.json`, `playwright.config.ts`, README, CI configuration if present

### Finding

README states that `npm run test:e2e` builds and serves the app automatically. In reality:

- `test:e2e` runs only `playwright test`;
- Playwright starts `npm run preview`;
- `vite preview` serves an existing `dist` directory but does not build it;
- `dist` is gitignored.

The command therefore depends on a previous local build and can fail or test stale output on a clean machine.

### Required implementation

1. Make the test command self-contained, for example:
   - `npm run build && playwright test`; or
   - a Playwright `webServer.command` that builds before previewing.
2. Ensure one build occurs, not one per worker.
3. Add a documented browser setup command such as `npx playwright install --with-deps chromium` for CI/Linux.
4. Keep browser-download failures distinguishable from application test failures.

### Acceptance criteria

- Delete/omit `dist` in a clean checkout, run `npm run test:e2e`, and observe a fresh production build before tests start.
- CI installs the pinned Playwright browser and executes all 57 tests.
- README describes the actual command behavior.

---

## TR-008 — Strictly validate and normalize calendar/time values

**Priority:** P2  
**Primary files:** `src/utils/date.ts`, domain seed data, date tests

### Finding

`localDateFromIso` checks only whether year/month/day coerce to non-zero numbers. JavaScript then normalizes impossible dates:

- `2026-02-31` becomes `2026-03-03`.
- `2026-13-01` becomes `2027-01-01`.

`monthPeriodContaining` silently falls back to the real clock when parsing fails. `formatTimeLabel('99:99')` returns `3:99 PM`. Seed transaction times remain mixed 12-hour strings while new input is `HH:mm`, and seed goal targets remain presentation strings such as `Mar 2027` while new goals store ISO dates.

### Required implementation

1. Require strict `YYYY-MM-DD` syntax and round-trip year/month/day validation.
2. Return an explicit failure for invalid period anchors; never silently fall back to `new Date()`.
3. Require valid `HH:mm` storage with hours `00–23` and minutes `00–59`.
4. Normalize seed transaction times and goal dates to the same storage formats as newly created records.
5. Keep human-readable formatting only at rendering boundaries.

### Acceptance criteria

- Impossible dates and times are rejected, not rolled over or reformatted.
- Seed and new records use identical storage formats.
- Tests cover leap years, month 13, day overflow, `24:00`, and minute 60.

---

## TR-009 — Finish text legibility and form-error accessibility

**Priority:** P2  
**Primary files:** affected TSX/CSS across Dashboard, Transactions, Budget, Goals, AppShell, and local forms

### Finding

Tag contrast, eyebrows, Money Position hints, and status badges improved. Essential information still appears below 12 px, including:

- Budget forecast at 9.5 px.
- Goal funding help and target/completion dates at 10 px.
- Transaction source, time, fee reconciliation, and account metadata at 10.5–11 px.
- Several dashboard and shell labels at 10–11 px.

Local Account, Card, Budget, Goal, and Add Funds forms also show a general error paragraph without consistently setting `aria-invalid` and `aria-describedby` on the failing field.

### Required implementation

1. Raise essential metadata and financial explanations to at least 12 px.
2. Keep decorative labels compact only when they do not carry required meaning.
3. Give each form field its own stable ID and error ID.
4. Apply `aria-invalid` and `aria-describedby` to the specific invalid control.
5. On failed submission, focus the first invalid control.
6. Verify layout at 320, 390, 768, 1024, and 1440 px plus 200% zoom.

### Acceptance criteria

- Essential finance information is not rendered below 12 px.
- Screen readers associate each error with the field that caused it.
- Keyboard users land on the first invalid field after submission.
- No text collisions or clipped actions appear at target widths or 200% zoom.

---

## TR-010 — Correct remaining documentation and configuration claims

**Priority:** P2  
**Primary files:** README, `docs/ARCHITECTURE.md`, `src/utils/currency.ts`, committed report metadata

### Required implementation

1. In Architecture, replace the documented `reachedDate` field with the actual `completedDate` name.
2. Clarify that currency configuration is module-level and non-reactive. Do not claim a future settings page can call `setCurrencyConfig` and automatically update the UI unless currency lives in React state/context and triggers rerenders.
3. Update E2E documentation after TR-007.
4. Change the committed Markdown review brief from executable mode `100755` to normal document mode `100644`.
5. Add the new known limitations only when deliberately deferred; do not describe unresolved correctness bugs as intended behavior.

### Acceptance criteria

- README and Architecture match source behavior and field names.
- Runtime currency changes either rerender every amount or are explicitly unsupported until Settings is implemented.
- Documentation files have ordinary non-executable permissions.

---

## Required test additions

### Unit tests

- Clock rollover across month and year boundaries.
- Default transaction date and active reporting period use the same clock.
- Strict rejection of impossible dates/times.
- Repository rejects unknown IDs, mismatched categories, same-account transfers, non-finite amounts, and invalid fees.
- Goal funding rejects insufficient source balance.
- Seed goals satisfy the selected overfunding rule.
- Credit-card payment reconciliation.
- Expense chart range labels near month/year boundaries.
- FinanceProvider behavior under Strict Mode with zero lint warnings.

### E2E tests

- Clean-checkout E2E command builds before preview.
- Frozen-clock month rollover updates form defaults and all “this month” figures together.
- Goal funding cannot exceed the selected account balance.
- Add Card captures due date and minimum payment.
- Bank-to-credit-card payment reduces cash and credit owed without changing cash-flow totals.
- Expense period titles match the selected data window.
- Invalid form submission focuses the first invalid field and exposes associated error text.
- 200% zoom smoke test for the changed workflows.

## Recommended implementation order

1. TR-001 — single application clock.
2. TR-008 — strict normalized dates/times, while the clock seam is open.
3. TR-002 — repository invariants.
4. TR-004 — goal funding and terminology.
5. TR-003 — credit-card metadata and payment flow.
6. TR-005 — chart labels/ranges.
7. TR-006 — React-safe provider.
8. TR-007 — reproducible E2E command.
9. TR-009 — legibility and field-level accessibility.
10. TR-010 — documentation/configuration cleanup.
11. Run the entire unit and browser suite, then regenerate screenshots only if visible UI changed.

## Definition of done

- `npm run lint` exits successfully with zero warnings.
- `npm run build` passes.
- `npm test` passes with the new invariant coverage.
- `npm run test:e2e` builds from a clean checkout and all browser tests execute and pass.
- One clock controls all displayed/current dates and period calculations.
- Repository mutations cannot create invalid or unreconciled finance state.
- Goal funding cannot create a negative source balance unless explicitly supported and disclosed.
- Credit-card minimums and payments participate correctly in Money Position and account totals.
- Expense-chart titles match their exact data ranges.
- Essential text is at least 12 px and form errors are programmatically associated.
- README and Architecture match actual code behavior.
- Screenshots are regenerated from the final verified commit.

## Final reviewer note

The remediation commit solved most issues identified in the second review and should be treated as a strong base. The next coding pass should be a focused correctness and test-reproducibility pass, not another broad visual rewrite. The custom CSS is working well and preserves Monikey’s identity; introducing Tailwind now would add migration churn without addressing any remaining high-priority finding.
