# Milestone 4.3 — Accounts screen (read-only)

**Status: implemented and verified; awaiting review. Left uncommitted on purpose**, so it can be reviewed as `git diff HEAD` (the Milestone 4.1–4.2 state is committed). Scope: the Accounts screen from `UI_UX_SPEC.md` §6, with its loading, empty and card-state variants. **Not built:** Activity, Quick Add, Pay card, Add account, edit/delete (the Pay and Add buttons open the same stand-in dialogs as on Overview). No backend, database, CI/CD, Kubernetes or GitOps file was touched. **No dependency changed.**

Related: [`UI_UX_SPEC.md`](UI_UX_SPEC.md) §6 · [`FRONTEND_OVERVIEW_4_2.md`](FRONTEND_OVERVIEW_4_2.md) · [`CODEX_REVIEW_BRIEF_4_3.md`](CODEX_REVIEW_BRIEF_4_3.md)

---

## 1. What was implemented
- **Two always-named sections:** *Money you have* (cash → bank → e-wallet rows, subtotal in the header) and *Money you owe* (subtotal "₱21,050.00 owed", the caption that available credit isn't cash, one card per credit card, and a dashed **+ Add credit card** slot).
- **Separation without relying on colour:** different headings, a different icon set, the word "owed", and a limit track that only cards have; available credit is plain ink text and never part of "money you have".
- **Layout:** below 1024px the sections stack; from 1024px they sit in two equal 492px columns at 1280px, both top-aligned and deliberately **not** stretched to equal height. Phones show **Add account on its own right-aligned row under the title** (spec); from 768px it sits in the page header beside *Add transaction*.
- **Card states:** nothing owed (Pay card disabled, "Nothing to pay"), overpaid ("card credit", Pay disabled, "No debt to pay"), over the limit (full track, "No credit available · Over your limit"), debt (normal). **Account state:** a balance below zero shows as negative with a "Below zero" flag (icon + words).
- **Empty and loading:** no accounts → dashed "Add your first cash, bank or e-wallet account." with Add account, and "No credit cards yet." with Add credit card; on first run **Add account is the one filled primary** and Add transaction is disabled. Loading → headings and captions at once, flat bars at the size of the amounts, `aria-busy` and a status line.
- **Demo hook** extended: `?demo=over-limit` and `?demo=paid-off` join `loading`, `overpaid`, `negative`, `no-accounts`.

## 2. Files (see `git diff HEAD` and `git status`)
| | File | Change |
|---|---|---|
| new | `src/views/AccountsView.tsx` | the page (one view file, like `OverviewView`) |
| new | `src/components/AccountRow.tsx` | one cash/bank/e-wallet row (icon, name, type, balance, "Below zero" flag) |
| new | `scripts/verify-accounts.cjs` | 108 browser checks |
| edit | `src/lib/finance.ts` | `liquidAccounts()` — non-card accounts with balances, ordered Cash → Bank → E-wallet (stable by id) |
| edit | `src/types.ts` | `AccountBalance` |
| edit | `src/mockData.ts` | two demo scenarios (`over-limit`, `paid-off`) |
| edit | `src/App.tsx` | renders `AccountsView`; Add account / Add credit card stand-ins |
| edit | `tests/finance.test.ts` | +8 tests (40 → 48) |

`CreditCardSummary`, `MoneyText`, `EmptyState`, `PageHeader` and the dialog stand-ins were **reused unchanged**. That is the payoff of the 4.2 structure: one new row component and one view.

## 3. Verification (final build)
| Check | Result |
|---|---|
| `npx tsc -b` (strict) · `npm run lint` · `npm run build` | passed · clean · CSS 26.95 kB (6.70 gzip), JS 323.53 kB (103.86 gzip) |
| `npm test` | **48 / 48** (the 8 new: ordering, balances add up to "money you have", unsorted input, negative balance, first run, cards never listed, over-limit and paid-off scenarios) |
| Mutation check (4 deliberate breaks of the new code) | **all 4 caught** (cards included in the list; wrong order; negatives clamped; available credit sign wrong); file restored byte-for-byte |
| **Accounts browser checks** (`node scripts/verify-accounts.cjs`) | **108 / 108** |
| **Regression: Overview browser checks** (`node scripts/verify-overview.cjs`) | **177 / 177** (re-run on this build) |
| `npm audit` · dependencies | 0 vulnerabilities · `package.json` / lockfile byte-identical to the commit |

| Group | Passed |
|---|---|
| Values (default ledger): subtotals, row order and balances, owed/available/limit, caption, slot, separation, consistency with Overview | 16/16 |
| Layout 360 / 375 / 768 / 1280 px | 8 + 8 + 8 + 9 |
| Card and account states (paid-off, overpaid, over-limit, negative) | 13/13 |
| First run and loading (375 and 1280) | 10 + 10 |
| Stand-in dialogs and keyboard (exact-element focus return, focus ring, Enter on nav → h1) | 11/11 |
| Semantics (one h1, labelled regions, text equivalents for the tracks, real list, no gradients) | 7/7 |
| Comparison with the approved mock (measured) | 8/8 |

Measured highlights: *Money you have* ₱54,196.25 = ₱2,350.00 + ₱48,725.50 + ₱3,120.75; *Money you owe* ₱21,050.00 owed; both subtotals equal the Overview hero's "Money you have" and "Card debt". Overpaid → "₱13,200.00 card credit", the owed subtotal drops to ₱14,250.00 and "money you have" is ₱34,196.25. Paid-off → ₱0.00 nothing owed, ₱50,000.00 available, subtotal ₱6,800.00. Over-limit → ₱36,800.00 owed, track at 100%, Pay card still enabled. Below zero → "−₱879.25" with the flag, only that row. At 1280px the columns are 492 + 24 + 492 = 1008 and start at the same top (316px vs 590px tall). No horizontal overflow at 360/375/768/1280; exactly one visible *Add account* and one filled primary at every width; no request left the origin; no console errors.

Screenshots: `docs/design/screenshots/m4-3/` — `accounts-360|375|768|1280.png`, `accounts-firstrun-375.png`, `accounts-loading-375.png` (full-page captures draw the fixed bottom bar mid-page; that is a screenshot artefact).

### Found and fixed by the checks
| Problem | Fix |
|---|---|
| First run showed **two** filled primary buttons (header Add account and the one in the empty block) | The empty-block button is secondary; the header one is the primary |
| Amount and the word "owed" were adjacent with only a CSS margin, so a screen reader would read "₱21,050.00owed" | A real space character between them |
| My test read `textContent` (no spaces between blocks) and an `eval` helper tripped lint | Tests read visible `innerText`; `eval` removed |

## 4. Differences from the approved mock (intentional)
| Difference | Why |
|---|---|
| Phones: **Add account on its own row under the title**; the mock had it beside the title | The written spec and its wireframe say so |
| Credit-card tile is compact (161px tall at 375px vs the mock's 183px): the limit moves into the same row as **Pay card** | Same tile as Overview (one component); the mock's Accounts tile had extra spacing |
| Account balance 18px; subtotals 22px phone / 24px from 768px | Matches the mock's balance size; subtotals follow DESIGN.md's 24px figure on larger screens |
| On first run, Add account is the filled primary | One primary action per screen (spec §3) |
| Header "Add account" is secondary normally | Spec: secondary Add account, primary Add transaction |
| Over-limit and paid-off states exist in React; the mock did not show them | Spec §6 "Card states" |

## 5. Not verified / limitations
- Real phones, Firefox/WebKit and screen readers were not tested; contrast was not re-measured here (same tokens as Overview, which were).
- The **load-error** state (spec: "Couldn't load accounts… Retry") is not built; only loading and empty states were in scope.
- Add account, Add credit card and Pay card are **stand-ins**: nothing is created or saved, and there is no account editing or deletion (v1 has none by design).
- Calculations are the frontend mock; FastAPI stays authoritative (the API may return `available_credit` negative or clamped; the UI treats any value ≤ 0 as "No credit available").
- The `?demo=` hook ships in the production bundle (tiny).

## 6. AI skills and tools
No design skill was invoked (the design was approved earlier). Used: Node's built-in test runner, `playwright-core` with the Chromium already on this machine, and the approved HTML mock as the visual reference. Codex review is prepared, not yet run.

## 7. What to learn
- **Reuse is the test of a good split.** Accounts needed one new row and one view because `CreditCardSummary`, `MoneyText` and `EmptyState` were already right-sized in 4.2.
- **Read what a screen reader would read.** A margin makes "₱21,050.00" and "owed" look separate; only a real space makes them separate for assistive technology.
- **One primary action per screen** is a rule you can test: count the filled buttons.
- **`git diff HEAD`** now shows exactly what this milestone changed. Try `git diff HEAD --stat`.

## 8. Next
**4.4 — Activity** (list by date with month and account filters, edit/delete entry points as stand-ins), then **4.5 — Quick Add / Pay card / edit / delete**, the first work that changes data. Before 4.5, decide to lift `data` into `useReducer` in `App`. Backend contract items from `DESIGN_REVIEW.md` §5 (B1–B4) should be settled with Codex before Activity ships, because Activity is where payment filtering and ordering matter.
