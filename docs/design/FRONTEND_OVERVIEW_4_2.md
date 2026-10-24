# Milestone 4.2 — Application shell and Overview page

**Status: implemented and verified; reviewed by Codex (read-only, no blocking issues, §12); awaiting the owner's approval.** Scope: the responsive application shell, typed fictional mock data, the financial helper functions, and the Overview page with its loading and empty states. Activity, Accounts and Quick Add are **not** built (see §9). No backend, database, CI/CD, Kubernetes or GitOps file was touched. Nothing was committed or pushed.

Related: [`UI_UX_SPEC.md`](UI_UX_SPEC.md) §3–§4 · [`DESIGN.md`](../../DESIGN.md) · [`FRONTEND_SCAFFOLD_4_1.md`](FRONTEND_SCAFFOLD_4_1.md) · [`CODEX_REVIEW_BRIEF_4_2.md`](CODEX_REVIEW_BRIEF_4_2.md)

---

## 1. What was implemented

- **Shell:** a bottom bar on phones (Overview, Activity, Accounts and a filled **Add**), an 80px rail on tablets, a 224px sidebar on desktop; the page header carries *Add transaction* from 768px up. Navigation is one `useState` in `App.tsx`. No router.
- **Typed mock data** in whole centavos: the same fictional ledger as the approved spec (five accounts, 17 entries, one card payment), balances **calculated** from opening values, never typed in.
- **Financial helpers** (`lib/finance.ts`, `lib/money.ts`): peso formatting, signed amounts, account balance, card signed debt, available credit, net position, monthly income/expenses, and the merged activity list.
- **Overview page:** the flat deep-blue net-position card with the inline `Money you have − Card debt` equation, *This month*, *Credit cards* (limit track, available credit, Pay card), and *Recent activity*; month select; phone, tablet and desktop layouts.
- **States:** loading (flat bars at the real size of each value, labels shown, `aria-busy`), first run (no accounts), empty month, overpaid card, below-zero account. Rare states are reachable with `?demo=loading|overpaid|negative|no-accounts`.
- **Stand-ins:** *Add transaction*, *Pay card* and *Add account* open a clearly labelled stand-in dialog (a bottom sheet on phones) so the real focus behaviour exists before Quick Add does. Activity and Accounts are placeholders with a heading and an explanation.

## 2. Files

**New**
```
frontend/src/types.ts                      Account, Category, Transaction, CreditCardPayment, FinancialSummary, CardStatus, ActivityItem, MockData
frontend/src/mockData.ts                   fictional ledger (centavos) + demo scenarios
frontend/src/lib/money.ts                  formatPeso, formatSigned
frontend/src/lib/finance.ts                accounting rules, month helpers, activity list
frontend/src/components/AppShell.tsx       bottom bar / rail / sidebar, brand mark, main frame
frontend/src/components/PageHeader.tsx     h1 + actions + header Add button (hidden below 768px)
frontend/src/components/MonthSelect.tsx    native month select
frontend/src/components/MoneyText.tsx      amount text with kind colour
frontend/src/components/EmptyState.tsx     dashed frame + one sentence (+ action)
frontend/src/components/TransactionItem.tsx   one activity row
frontend/src/components/CreditCardSummary.tsx one credit card tile
frontend/src/views/OverviewView.tsx        the Overview page
frontend/src/views/PlaceholderView.tsx     Activity / Accounts stand-in
frontend/tests/finance.test.ts             40 unit tests (node:test)
frontend/scripts/verify-overview.cjs       browser verification (177 checks)
docs/design/FRONTEND_OVERVIEW_4_2.md       this file
docs/design/CODEX_REVIEW_BRIEF_4_2.md      read-only review brief
docs/design/screenshots/m4-2/*.png         responsive screenshots (fictional data only)
```
**Modified:** `frontend/src/App.tsx` (design-check page → real app), `frontend/src/index.css` (native `<select>` chevron), `frontend/package.json` (`test` script only), `frontend/tsconfig.node.json` (`tests` type-checked), `frontend/README.md`, `docs/design/FRONTEND_SCAFFOLD_4_1.md` (retirement note).
**Removed:** `frontend/scripts/verify-design-system.cjs` (it tested the 4.1 check page; its checks now run through the real UI).

## 3. Component structure and why

```
App                                  state: view, month, stand-in dialog (+ the opener, for focus)
└─ AppShell                          navigation frame (no data)
   ├─ PageHeader                     h1 + actions
   └─ OverviewView | PlaceholderView
        ├─ hero card                 (inline: used once)
        ├─ This month card           (inline: used once)
        ├─ CreditCardSummary × n     (list item, reused on Accounts later)
        └─ TransactionItem × n       (list item, reused on Activity later)
   Shared: MoneyText, EmptyState, MonthSelect (Activity will reuse), ui/ (button, card, dialog, input, label)
```
- **A component exists only if it is reused or hides something fiddly.** `TransactionItem` and `CreditCardSummary` are list rows that Activity and Accounts will reuse; `MoneyText` is the one place money gets its colour; `EmptyState` and `MonthSelect` are used more than once. The hero card and *This month* are used once, so they stay inside `OverviewView` instead of becoming files.
- **Data flows one way.** `App` owns the mock data, the month and the view and passes them down as props; `lib/finance.ts` turns data into numbers; components only display. No context, no store.
- **Logic lives in `lib/`, not in components.** That is what lets 40 unit tests run in Node with no browser and no new dependency.
- **`types.ts`, `lib/*.ts` and `mockData.ts` import siblings with `.ts` extensions** so Node can run them directly for the tests; app code uses the `@/` alias.

## 4. Accounting rules and how they are checked

Implemented in `lib/finance.ts` exactly as the TLD defines them:

| Rule | Where it is tested |
|---|---|
| Card purchase is an expense and raises card debt | "credit card purchases" (4 tests) |
| Card payment lowers the paying account and the card debt by the same amount | "credit card payments" |
| A payment never changes monthly expenses or income | payment tests + 200-step random invariant |
| An ordinary payment leaves **net position** unchanged (any amount, partial, full, overpaid) | payment tests + random invariant |
| Available credit = limit − signed debt, is **not cash**, never changes money you have | "available credit is not cash" |
| Overpaid card ⇒ negative signed debt = card credit; `net = have − debt + credit` | overpaid test + random invariant |
| Negative account balance shown, never clamped | "a payment that empties the paying account" |
| Month boundaries (Sep 30 / Oct 1 / Oct 31 / Nov 1), months with no entries | "months" |
| Whole centavos only; `formatPeso` rejects fractions, NaN, Infinity | "formatPeso" |
| Activity order and merge of entries + payments | "activity list" |

**Results:** `npm test` → **40 of 40 pass** (9 groups, including three seeded 200-step random checks). **Mutation check:** six deliberate breaks of the rules (payments counted as expenses; payment not reducing the source; net ignoring card credit; available credit added to money you have; purchases not raising debt; wrong month prefix) were each applied to a temporary copy of `finance.ts`; **all six were caught** (3–10 failing tests each) and the file was restored byte-for-byte.

## 5. Verification

| Check | Result |
|---|---|
| `npx tsc -b` (type-check, TS 6.0.3) | passed |
| `npm run lint` (oxlint) | clean, 0 warnings |
| `npm run build` | passed — CSS 26.12 kB (6.58 kB gzip), JS 317.55 kB (102.73 kB gzip) |
| `npm test` | 40 / 40 passed |
| `npm audit` | 0 vulnerabilities; dependency tree unchanged at 75 packages |
| **Browser checks on the production build** (`node scripts/verify-overview.cjs`, Chromium via `playwright-core`) | **177 / 177 passed** on the final build |

| Group | Passed |
|---|---|
| Financial values on the page (default ledger) | 17/17 |
| Layout 360 / 375 / 768 / 1280 px | 10 + 10 + 11 + 10 |
| Navigation 375 / 768 / 1280 px (+ keyboard only) | 6 + 6 + 6 + 2 |
| Month select, activity rows and View all | 10/10 |
| Stand-in dialogs 375 / 1280 px | 7 + 7 |
| Overpaid credit card · Negative account balance | 9 + 6 |
| First run (375 and 1280) | 12/12 |
| Loading state (375 and 1280) | 14/14 |
| Typography, contrast and semantics | 16/16 |
| Comparison with the approved mock (measured; includes the h1 size assertion) | 18/18 |

Measured highlights: net position ₱33,146.25 = money you have ₱54,196.25 − card debt ₱21,050.00; income +₱36,500.00, expenses ₱27,127.40 (card payment excluded); Blue Card owed ₱14,250.00 / available ₱35,750.00 / limit ₱50,000.00; Everyday Card ₱6,800.00 / ₱23,200.00 / ₱30,000.00. **No horizontal overflow** at 360, 375, 768 and 1280px; **no duplicate Add**: only the bottom-bar Add on phones, exactly one header Add from 768px; exactly one filled primary action per screen; every peso amount on one line and inside its card; hero amount 36 / 40 / 44px; at 1280px recent activity is exactly 7 grid columns (578px) and the right column 5 (406px). ₱ and the true minus are drawn by Manrope; contrast: card debt on the hero 7.71:1, muted text on the hero 8.39:1, income 5.22:1, debt orange 5.43:1. No request left the origin; **no console errors or warnings**.

Screenshots: `docs/design/screenshots/m4-2/` — `overview-360|375|768|1280.png`, `loading-375.png`, `firstrun-375.png`. (Full-page captures draw the fixed bottom bar mid-page; that is a screenshot artefact, not a layout bug.)

### Bugs found by verification and fixed (honest list)
| Found by | Problem | Fix |
|---|---|---|
| Looking at the 1280px render | The hero card sorted to the **bottom** from 1024px (`order-1` was not reset at `lg`) | `lg:order-none` on the hero and first-run card |
| Strict focus test | **Focus fell to `<body>`** after closing Add/Pay dialogs: Radix only restores focus to a `DialogTrigger` and these open from ordinary buttons | `App` remembers the opener and restores focus in `onCloseAutoFocus` (falls back to the page's h1) |
| Same test | My first focus check was **vacuous** (`<body>`'s text contains "Add") | now compares element identity |
| Reading the output | Income of zero printed as "+₱0.00" (spec: a zero is plain `₱0.00`) | `formatSigned` never signs zero; unit test added |
| Reading the output | "e-wallet" broke across lines ("e-" / "wallet") | `whitespace-nowrap` |
| Test expectations | Three of my own expected values were wrong (card debt in the negative scenario, a strict-mode selector, h1 size) | corrected after confirming the app was right |

## 6. Differences from the approved HTML mock (all intentional)

| Difference | Why |
|---|---|
| Content width at 1280px is **1008px** (24px page margins); the mock had 992px (32px) | DESIGN.md / RESPONSIVE_GUIDELINES specify 24px; arithmetic in the spec (7 + 5 columns = 1008) only closes at 24 |
| Page title (h1) is **24px on phones and 28px from 768px**; the mock used 26px and 30px | DESIGN.md (typography table) says 24 / 28; the written spec wins |
| Card heights differ by 1–10px (e.g. *This month* 222px vs 232px) | Mock used hand-set paragraph margins; Tailwind spacing scale used here |
| A zero amount has **no sign** ("₱0.00", never "+₱0.00") | Spec: "a zero is printed as a zero" |
| *Add*, *Pay card* and *Add account* open a **stand-in dialog**; the mock had working forms | Quick Add is out of scope until 4.2 is reviewed |
| *Activity* and *Accounts* are placeholders | Same reason |
| Loading and first-run states exist in React; the mock had neither | Requested for 4.2 |
| Preview hook is `?demo=` (query string); the mock used `#…` | Normal for a real app; no effect on users |
| Row / card structure uses semantic regions and a hidden word per row (e.g. "Expense: …") | Accessibility requirement the mock only approximated |

Identical to the mock (measured): hero amount sizes, card widths at 375px, content width at 375px, block order at every width, the 5- vs 6-row activity list, tablet two-column credit cards, tile layout, colours and fonts.

## 7. Dependency changes
**None.** Runtime dependencies are identical to Milestone 4.1; `package.json` gained only the `test` script (`node --test "tests/**/*.test.ts"`, Node's built-in runner). `tsconfig.node.json` now includes `tests` so they are type-checked by `tsc -b`.

## 8. AI skills and tools used
- **No design skill was invoked in 4.2** (UI UX Pro Max, Taste Skill and Impeccable were used in the design milestone, whose approved output this implements). Impeccable's engine was not run.
- **Tools:** Node's built-in test runner; `playwright-core` with the Chromium already cached on this machine (nothing installed) for the browser checks; the approved HTML mock as the visual reference.
- **Review:** an independent read-only review by Codex is prepared ([`CODEX_REVIEW_BRIEF_4_2.md`](CODEX_REVIEW_BRIEF_4_2.md)); it has **not** happened yet.

## 9. Known limitations and not verified
- **Not built (by design):** Activity, Accounts, Quick Add, Pay card, Add account, edit/delete; the load-error state (the spec lists it; only loading and empty states were requested); month-dependent *Recent activity → Activity* is only a placeholder.
- **Mock only:** these calculations stand in for the API. FastAPI stays authoritative; at integration `Centavos` numbers become decimal strings and `lib/finance.ts` is replaced by server data.
- **Not tested:** real phones (iOS Safari, Android), Firefox/WebKit, screen readers; contrast was measured from rendered colours on this page only.
- The `?demo=` hook ships in the production bundle (tiny). Remove or gate it if you prefer.
- Two desktop columns end at different heights, as in the approved mock (the right column is taller); no filler was added.
- The first-run *Add account* button opens a stand-in because the Accounts screen does not exist.
- The JS bundle (102.7 kB gzip) has not been analysed for tree-shaking.

## 10. What to learn from this milestone
- **State lives in one place and flows down as props** (`App` → views → components). Try adding a second piece of state and see where it has to live.
- **Keep calculations out of components.** `lib/finance.ts` has no React in it, so it can be tested in milliseconds. Read the tests: each one states an accounting rule in plain words.
- **Why whole centavos?** `0.1 + 0.2 !== 0.3` in JavaScript; whole numbers never drift.
- **Responsive Tailwind:** read `OverviewView` top to bottom and find where `md:` and `lg:` change the layout; `order-*` / `lg:order-none` is how the same blocks reorder between phone and desktop (and how one bug appeared).
- **Accessibility is behaviour, not only markup:** focus must go somewhere sensible after a dialog closes. The library did not do it for us here; the browser test did catch it.
- **Verification can be wrong too:** one of my checks passed for the wrong reason until I made it compare the exact element. A useful test is one you have seen fail (the mutation check).

## 11. Recommendation for the next milestone
**4.3 — Accounts (read-only)**, then **4.4 — Activity**, then **4.5 — Quick Add / Pay card / edit / delete.** Accounts first because it is the smallest screen and reuses `CreditCardSummary` and `MoneyText`; Activity next because it reuses `TransactionItem` and `MonthSelect`; Quick Add last because it is the first feature that **changes** data, which needs one decision: lift `data` into state (`useReducer` in `App`) so saving an entry recalculates every screen. Before 4.5, also decide the first-run *Add account* flow and keep the backend contract items (account filter on payments, `created_at`, balance field name, `available_credit` sign) moving with Codex.

## 12. Codex review outcome (read-only)

Codex ran `npm test` (40/40), the TypeScript check, `npm run lint` (clean) and the Overview browser harness (177/177 at the time of its review); it deliberately did not rebuild so it would not write to `dist` while the frontend owner might be editing. It found the finance helpers correct for signed card debt, card credit and card payments (payments do not raise expenses or change net position) and **no blocking implementation issue**. Follow-ups and how each was handled:

| # | Codex follow-up | Handling |
|---|---|---|
| 1 | Roadmap Milestone 4 is still in progress; Activity, Accounts, Quick Add, Pay card and edit/delete are placeholders | Expected and documented (§9, §11) |
| 2 | `strict` type-checking passes when enabled but `tsconfig.app.json` does not turn it on | **Done.** `"strict": true` added to `tsconfig.app.json` and `tsconfig.node.json`; `tsc -b` still passes, lint clean, 40/40 tests, and the build output is byte-identical (same hashes), so nothing changed except that the check can no longer be dropped silently |
| 3a | The component inventory says 44px inputs; the scaffold uses 48px | **Done (docs).** The approved mock and the built `Input` use 48px, radius 12 and the `input` border token. `COMPONENT_INVENTORY.md`, `DESIGN.md` (control height: buttons/nav 44, text fields 48) and `RESPONSIVE_GUIDELINES.md` now say so |
| 3b | `DESIGN.md` still says final design approval is pending | **Done.** The owner approved Milestone 3; the status lines in `DESIGN.md`, `UI_UX_SPEC.md`, `COMPONENT_INVENTORY.md`, `RESPONSIVE_GUIDELINES.md`, `REFERENCES.md` and `DESIGN_REVIEW.md` now say approved; the first design-review brief is marked historical |
| 4 | Add the local `/api` proxy to Vite (TLD) before API integration | **Deferred on purpose, recorded as a prerequisite for the integration milestone.** Nothing calls `/api` yet, and the proxy target depends on how the backend is run (`localhost:8000` vs the Compose service name), which is decided with the backend owner. Adding it now would be untestable configuration |
| 5 | Repo files are untracked, so Codex could not review a diff or confirm a commit | True: there are no commits in this repository. Committing needs the owner's explicit approval; once there is an initial commit, later milestones can be reviewed as diffs |

Added to the prerequisites for integration (Milestone 8): the `/api` dev proxy; money as decimal strings; the backend contract items already listed in `DESIGN_REVIEW.md` §5 (B1–B4).

