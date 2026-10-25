# MoniKey UI/UX Specification

**Status: APPROVED by the owner.** This document specifies *what the screens do and contain*. Visual rules (colour, type, spacing) are in [`DESIGN.md`](../../DESIGN.md). The mock-backed v1 flows, FastAPI, and PostgreSQL are implemented; account editing was added as an owner-requested follow-up on 2026-10-25. See [frontend status](FRONTEND_STATES_4_9.md), [API client plan](API_CLIENT_PLAN.md), and [frontend README](../../frontend/README.md) for current verification evidence.

All people, accounts and amounts are **fictional**. The wireframes are low-fidelity ASCII layouts, not pixel designs; no hi-fi preview tool was available or installed.

**Legend:** `↗` expense · `↙` income · `↔` card payment · `▭` credit-card account · `▓░` debt vs. remaining credit · `[ ]` button/field · `▾` native select · `(!)` error.

---

## 1. Who and why

MoniKey v1 is a private, single-user tracker. The owner opens it a few times a day, mostly **on a phone**, to:

| # | Job | How often | Where it starts |
|---|---|---|---|
| J1 | Record something I just spent or earned | Many times a week | **Add** (bottom bar / header button) |
| J2 | Check what I really have after what I owe | Daily glance | Overview |
| J3 | Pay off part of a credit card | A few times a month | Accounts or Overview → *Pay card* |
| J4 | Find or fix a past entry | Weekly | Activity |
| J5 | Add a new account | Rarely (setup) | Accounts → *Add account* |

J1 is the most frequent, so **Add is reachable from every screen in one tap**.

---

## 2. Sample data used in every wireframe (fictional)

Shown as of **Sunday, Oct 25, 2026**, month **October 2026**. Account names are plain labels — no real institution or account number.

### Accounts (opening values as of Oct 1; no earlier activity)

| Account | Type | Opening | Limit | **Current** | Available credit |
|---|---|---|---|---|---|
| Cash on hand | cash | ₱4,811.75 | — | **₱2,350.00** | — |
| Main Savings | bank | ₱27,224.50 | — | **₱48,725.50** | — |
| GCash | e-wallet | ₱6,311.15 | — | **₱3,120.75** | — |
| Blue Card | credit card | debt ₱11,972.75 | ₱50,000.00 | **owed ₱14,250.00** | ₱35,750.00 |
| Everyday Card | credit card | debt ₱2,601.00 | ₱30,000.00 | **owed ₱6,800.00** | ₱23,200.00 |

### Derived totals (verified by script; the real app gets these from `/api/summary`)

| Figure | Value | How |
|---|---|---|
| Money you have (liquid) | **₱54,196.25** | 2,350.00 + 48,725.50 + 3,120.75 |
| Card debt (outstanding) | **₱21,050.00** | 14,250.00 + 6,800.00 |
| Net position | **₱33,146.25** | 54,196.25 − 21,050.00 |
| October income | **₱36,500.00** | 4,500.00 + 32,000.00 |
| October expenses | **₱27,127.40** | 15 expense entries (incl. 7,277.25 on Blue Card and 4,199.00 on Everyday Card) |
| Card payment (Oct 20) | ₱5,000.00 | Main Savings → Blue Card; **not** in expenses |

### October entries (18, newest first)

| Date | Kind | Title (note) | Category | Account | Amount |
|---|---|---|---|---|---|
| Oct 24 | expense | Lunch with team | Food | GCash | −₱385.00 |
| Oct 23 | expense | Supermarket | Groceries | Blue Card | −₱2,846.50 |
| Oct 21 | expense | Pharmacy | Other | Cash on hand | −₱486.50 |
| Oct 20 | **card payment** | Card payment | — | Main Savings → Blue Card | ₱5,000.00 |
| Oct 19 | expense | Movie night | Other | GCash | −₱640.00 |
| Oct 18 | expense | Gym membership | Bills | Everyday Card | −₱1,800.00 |
| Oct 16 | expense | Mobile load | Bills | GCash | −₱300.00 |
| Oct 15 | income | October salary | Salary | Main Savings | +₱32,000.00 |
| Oct 14 | expense | Supermarket | Groceries | Blue Card | −₱3,180.75 |
| Oct 12 | expense | Online order | Shopping | Everyday Card | −₱2,399.00 |
| Oct 11 | expense | Dinner with family | Food | Blue Card | −₱1,250.00 |
| Oct 9 | expense | Commute | Transportation | Cash on hand | −₱340.00 |
| Oct 8 | income | Logo project | Freelance | Main Savings | +₱4,500.00 |
| Oct 7 | expense | Coffee and pandesal | Food | Cash on hand | −₱215.00 |
| Oct 6 | expense | Internet | Bills | Main Savings | −₱1,499.00 |
| Oct 5 | expense | Electricity bill | Bills | GCash | −₱1,865.40 |
| Oct 3 | expense | Wet market | Groceries | Cash on hand | −₱1,420.25 |
| Oct 2 | expense | Apartment rent | Bills | Main Savings | −₱8,500.00 |

Categories are the TLD's seeded set only — income: Salary, Freelance, Other; expense: Food, Transportation, Groceries, Bills, Shopping, Other.

---

## 3. App shell and navigation

Three views in one page, no router (TLD §4). `App.tsx` holds the selected view and the selected month.

- **Mobile (<768px):** bottom bar — Overview · Activity · Accounts · **+ Add** (filled primary). 64px tall plus safe-area inset; icon over a short label; every item ≥44px wide.
- **Tablet (768–1023px):** 80px left rail — icon over label for the three views. *Add transaction* is in each page header.
- **Desktop (≥1024px):** 224px compact sidebar — key-and-coin mark + "MoniKey", then three labelled items. *Add transaction* is in each page header.
- Switching view moves focus to the new view's `h1` (so keyboard and screen-reader users land at the top).
- The **month** (default: current month) is shared by Overview and Activity. Accounts is "right now" and ignores it. Future months are not offered; the list is the last 12 months.
- Exactly **one filled primary button** is visible per screen: *Add transaction* — except on first run (no accounts), where **Add account** is the only primary and every *Add transaction* control is disabled and unstyled as primary (§4, Overview states).

Not included: top bar, search, notifications, profile, settings, floating buttons.

---

## 4. Screen A — Overview

**Question:** *After what I owe, how much do I really have?* **Biggest block:** the position card. **One finding (plain-language line):** "You have ₱54,196.25 in cash, bank and e-wallets and owe ₱21,050.00 on credit cards." **Main job:** record a transaction (header/bottom bar); **second job:** pay a card (button on each card summary).

### Blocks, in reading order

| # | Block | Answers | Contents |
|---|---|---|---|
| 1 | **Position card** | What is my net position? | A flat **deep-cobalt hero card** (white text, no gradient). Label "Net position" and "As of today"; the hero amount (36 / 40 / 44px, 600); the finding sentence; then the **equation drawn inline** — **Money you have** `−` **Card debt** (debt in a light orange so it reads on navy, with its label) — which is the signature element. A muted line adds "Plus ₱… card credit (overpaid)" or "An account is below zero." when that applies. |
| 2 | **This month** | How is the month going? | Two label-left / value-right rows: **Income** `+₱36,500.00` (green) and **Expenses** `₱27,127.40`; sub-caption "October 2026 · card payments aren't counted as expenses". Rows (not side-by-side columns) so large amounts never wrap at 360px. |
| 3 | **Credit cards** | What do I owe, and how much room is left? | One compact `CreditCardSummary` per card: name, owed amount, limit track, "₱35,750.00 available", **Pay card** button. |
| 4 | **Recent activity** | What just happened? | 5 rows on mobile, 6 on desktop; "View all" opens Activity. Card payments appear here with their own marker. |

No charts, no sparklines, no percentages, no progress rings. The limit track is the only graphic.

### Mobile wireframe (375px)

```
┌───────────────────────────────────────────┐
│ Overview                 [October 2026 ▾] │
│                                           │
│ ┌───────────────────────────────────────┐ │
│ │ Net position              As of today │ │
│ │ ₱33,146.25   (white on deep cobalt)   │ │
│ │ You have ₱54,196.25 in cash, bank and │ │
│ │ e-wallets and owe ₱21,050.00 on       │ │
│ │ credit cards.                         │ │
│ │ ───────────────────────────────────── │ │
│ │ Money you have   −          Card debt │ │
│ │ ₱54,196.25                 ₱21,050.00 │ │
│ └───────────────────────────────────────┘ │
│                                           │
│ ┌───────────────────────────────────────┐ │
│ │ This month                            │ │
│ │ Oct 2026 · payments aren't expenses   │ │
│ │ Income                    +₱36,500.00 │ │
│ │ Expenses                   ₱27,127.40 │ │
│ └───────────────────────────────────────┘ │
│                                           │
│ ┌───────────────────────────────────────┐ │
│ │ Credit cards                          │ │
│ │ Available credit isn't cash.          │ │
│ │ ▭ Blue Card                ₱14,250.00 │ │
│ │                                  owed │ │
│ │ ▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░ │ │
│ │ ₱35,750.00 available       [Pay card] │ │
│ │ Limit ₱50,000.00                      │ │
│ │ ───────────────────────────────────── │ │
│ │ ▭ Everyday Card             ₱6,800.00 │ │
│ │                                  owed │ │
│ │ ▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │ │
│ │ ₱23,200.00 available       [Pay card] │ │
│ │ Limit ₱30,000.00                      │ │
│ └───────────────────────────────────────┘ │
│                                           │
│ ┌───────────────────────────────────────┐ │
│ │ Recent activity              View all │ │
│ │ ↗ Lunch with team            −₱385.00 │ │
│ │   Food · GCash                        │ │
│ │ ↗ Supermarket              −₱2,846.50 │ │
│ │   Groceries · ▭ Blue Card             │ │
│ │   … 3 more                            │ │
│ └───────────────────────────────────────┘ │
│ ───────────────────────────────────────── │
│ ▸Overview Activity Accounts [+ Add]       │
└───────────────────────────────────────────┘
```

### Desktop wireframe (1280px)

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ◎ MoniKey           ┌────────────────────────────────────────────────────────────────────────────┐ │
│                     │ Overview                            [October 2026 ▾] [ + Add transaction ] │ │
│ [▸Overview]         │                                                                            │ │
│   Activity          │ ┌────────────────────────────────────────────────────────────────────────┐ │ │
│   Accounts          │ │ Net position  As of today                 Money you have  −  Card debt │ │ │
│                     │ │ ₱33,146.25                                ₱54,196.25        ₱21,050.00 │ │ │
│                     │ │ You have ₱54,196.25 in cash, bank and                                  │ │ │
│                     │ │ e-wallets and owe ₱21,050.00 on credit cards.                          │ │ │
│                     │ └────────────────────────────────────────────────────────────────────────┘ │ │
│                     │                                                                            │ │
│                     │ ┌──────────────────────────────────────────┐  ┌──────────────────────────┐ │ │
│                     │ │ Recent activity                 View all │  │ This month               │ │ │
│                     │ │ ↗ Lunch with team               −₱385.00 │  │ Income       +₱36,500.00 │ │ │
│                     │ │   Food · GCash                           │  │ Expenses      ₱27,127.40 │ │ │
│                     │ │ ↗ Supermarket                 −₱2,846.50 │  └──────────────────────────┘ │ │
│                     │ │   Groceries · ▭ Blue Card                │  ┌──────────────────────────┐ │ │
│                     │ │ ↗ Pharmacy                      −₱486.50 │  │ Credit cards             │ │ │
│                     │ │   Other · Cash on hand                   │  │ ▭ Blue Card   ₱14,250.00 │ │ │
│                     │ │ ↔ Card payment                 ₱5,000.00 │  │ ▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░ │ │ │
│                     │ │   Main Savings → Blue Card               │  │ ₱35,750.00 available     │ │ │
│                     │ │ ↗ Movie night                   −₱640.00 │  │ [Pay card]               │ │ │
│                     │ │   Other · GCash                          │  │ ▭ Everyday     ₱6,800.00 │ │ │
│                     │ │ ↗ Gym membership              −₱1,800.00 │  │ ▓▓▓▓▓░░░░░░░░░░░░░░░░░░░ │ │ │
│                     │ │   Bills · ▭ Everyday Card                │  │ ₱23,200.00 available     │ │ │
│                     │ └──────────────────────────────────────────┘  │ [Pay card]               │ │ │
│                     │                                               └──────────────────────────┘ │ │
│                     └────────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

On desktop the right column ends lower than the activity list here. Implementation should balance the two columns by adjusting the activity row count (5–7) — **to be verified in a real browser**; no pinned-to-bottom filler is added.

### Tablet (768px)
Single column, full-width blocks in the same order. *This month* keeps its two label/value rows inside one card; *Credit cards* shows the cards side by side (2 columns) when there are two, stacked otherwise. Nothing is paired with a block of a different height.

### Behavior
- **Month select** (native `<select>`) reloads blocks 1, 2 and 4. Block 3 and the "Money you have / Card debt" figures are current balances and do **not** change with the month — the position card says "As of today" in its muted caption when a past month is selected.
- **Pay card** opens Quick Add on the *Pay card* type with that card preselected.
- **Recent activity rows are read-only previews.** No edit/delete icons here; tapping a row opens Activity on that entry's month. Editing and deleting live in Activity.

### Overview states
| State | What shows |
|---|---|
| Loading | Final layout; every amount replaced by a flat grey bar of its real height (hero 32px, figures 24px, rows 16px); labels and headings visible; no shimmer. |
| Loaded | As above. |
| Zero everywhere | Every amount prints `₱0.00` normally. |
| Negative liquid balance | Shown as `−₱1,200.00`, not clamped; a muted `TriangleAlert` line "An account is below zero." |
| Card credit (overpaid) | That card shows "Card credit ₱500.00" in `primary-ink` instead of "owed". Net position includes it (TLD: net = liquid − **signed** debt). The position card then adds the line "Includes ₱500.00 card credit (overpaid)." and the hero's equation label reads "Money you have − Card debt **+ Card credit** = Net position" for screen readers, so the figures on screen still add up. |
| No accounts yet (first run) | Frame and h1 stay. Position card is replaced by one sentence — "Start by adding a cash, bank or e-wallet account." — and a primary **Add account** button — on this screen **Add account is the single primary action**. Every *Add transaction* control (page-header button, mobile bottom-bar **Add** item) is **disabled and loses its primary styling** (neutral disabled colours) with the reason "Add an account first". |
| No activity this month | *Recent activity* keeps its frame: "Nothing recorded in October 2026 yet." plus **Add transaction**. |
| Load error | Only the failed block shows: "Couldn't load your summary. Last updated 09:14." + **Retry**. Other blocks stay. |

---

## 5. Screen B — Activity

**Question:** *What happened to my money, and can I fix an entry?* **Biggest block:** the list. **Main job:** find and fix an entry.

### Contents
- h1 "Activity"; primary **Add transaction** (≥768px).
- **Filters:** two native selects in one row — **Month** and **Account** ("All accounts" default). Nothing else (no search, no type filter, no date range).
- A count line: "18 entries · October 2026" (count follows the filtered view). Totals are **not** shown here: the summary endpoint is month-only, not account-filtered, and the browser must not add money.
- **Date-grouped list**, newest first. Group heading `Sat, Oct 24`. Rows below.
- Footer: when the list is capped, "Showing the latest 50. **Load more**" (re-fetches with a higher limit).

### Row anatomy (two lines, 64px)

| Part | Rule |
|---|---|
| Marker | 16px plain icon: `ArrowUpRight` expense · `ArrowDownLeft` income · `ArrowRightLeft` card payment. Muted. A second, non-colour cue next to the sign. |
| Line 1 | The **note** if present, otherwise the **category** name. 16/500, one line, ellipsis. |
| Line 2 | `Category · Account` (14, muted). A `CreditCard` 14px icon precedes card accounts. Card payment: `Main Savings → Blue Card`. |
| Amount (right) | 16/600 tabular. Expense `−₱385.00` in ink; income `+₱32,000.00` in `income`; **card payment `₱5,000.00` in ink, no sign**. Never truncated. |
| Card-payment chip | Neutral chip "Payment" beside line 2; helper in the row's accessible name "not an expense". |
| Desktop/tablet actions | Trailing **Edit** (`Pencil`) and **Delete** (`Trash2`) icon buttons, 36px, always visible (not hover-only), each with a specific `aria-label`, e.g. "Delete Lunch with team, ₱385.00". |
| Mobile actions | None in the row. Tapping the row opens the edit dialog, which contains **Delete**. Keeps the row clean and the target large. |

Visually-hidden prefix in each row's accessible name: "Expense", "Income" or "Card payment".

### Mobile wireframe (375px)

```
┌───────────────────────────────────────────┐
│ Activity                                  │
│                                           │
│ Month: October 2026 ▾                     │
│ Account: All accounts ▾                   │
│ 18 entries · October 2026                 │
│                                           │
│ Sat, Oct 24                               │
│ ↗ Lunch with team                −₱385.00 │
│   Food · GCash                            │
│                                           │
│ Fri, Oct 23                               │
│ ↗ Supermarket                  −₱2,846.50 │
│   Groceries · ▭ Blue Card                 │
│                                           │
│ Tue, Oct 20                               │
│ ↔ Card payment                  ₱5,000.00 │
│   Main Savings → Blue Card                │
│   [Payment · not an expense]              │
│                                           │
│ Thu, Oct 15                               │
│ ↙ October salary              +₱32,000.00 │
│   Salary · Main Savings                   │
│ ───────────────────────────────────────── │
│ Overview ▸Activity Accounts [+ Add]       │
└───────────────────────────────────────────┘
```

### Desktop row (≥768px)

```
┌────────────────────────────────────────────────────────────────┐
│ ↗  Lunch with team                         −₱385.00   [✎] [×]  │
│    Food · GCash                                                │
└────────────────────────────────────────────────────────────────┘
```

### Behavior
- **Data contract (from Codex review; needs backend confirmation):** expense/income rows come from `GET /api/transactions` and card payments from `GET /api/credit-card-payments`. The **account filter is applied on the server, before the limit** — for payments, `account_id` matches either the source or the card side. The UI asks each list for `limit + 1` rows, merges them, sorts, shows `limit`, and uses the extra row to decide whether "Load more" appears. Filtering a capped list in the browser is **not** allowed (it can drop matches). A combined endpoint is not needed.
- **Ordering (both lists, then merged):** `date` newest first → `created_at` newest first → a source-and-ID tie-breaker (e.g. transactions before payments, then `id` descending). The API must expose `created_at` for this. The same order is used everywhere an activity list appears.
- **Account filter** shows entries where the account is the row's account, or either side of a card payment.
- Changing a filter reloads the list; the previous list stays visible with a muted "Updating…" stamp rather than blanking.
- After **Save** the list refreshes. If the saved entry does not match the current filters, the **same** success message gets "It's hidden by your filters." appended, with a **Clear filters** text button.

### Delete confirmation (all entry kinds) — see §10 for copy

### Activity states
| State | What shows |
|---|---|
| Loading | Header, filters and count line visible; 6 rows of grey bars at real row height. |
| Empty (month) | "No activity in October 2026." + **Add transaction**. |
| Empty (filters) | "Nothing matches these filters." + **Clear filters**. |
| Error | In-list: "Couldn't load activity. Last updated 09:14." + **Retry**. Filters stay usable. |
| Capped | "Showing the latest 50." + **Load more**. |

---

## 6. Screen C — Accounts

**Question:** *What do I have, and what do I owe, account by account?* **Main jobs:** check a balance; pay a card; add an account.

### How the page separates assets from liabilities
Two clearly named sections, in this order, always:

1. **Money you have** — cash, bank, e-wallet. Balance in ink. Subtotal in the section header.
2. **Money you owe** — credit cards. Amount in the `debt` colour with the word **owed** and an "Owed" chip. Subtotal in the header: "₱21,050.00 owed". Caption: "Available credit isn't cash and isn't part of your total money."

Separation does **not** rely on colour: different headings, different icons (`Wallet` vs `CreditCard`), the word "owed", and a limit track that only credit cards have. Available credit is always in muted grey.

### Contents
- h1 "Accounts"; secondary **Add account**; primary **Add transaction** (≥768px). On mobile, **Add account** sits on its own row under the title.
- **Money you have:** one card of rows. Each row: account name (16/500) and type text ("Cash", "Bank account", "E-wallet") on line 2; balance right (24/600 in section, 16/600 inside narrow rows). Grouped in the order Cash → Bank → E-wallet; no group headings when a type has no accounts.
- **Money you owe:** one `CreditCardSummary` card per credit card — name, "Owed" chip, owed amount (24/600, `debt`), limit track (filled = owed, remainder = available), "₱35,750.00 available" and "Limit ₱50,000.00", and a **Pay card** secondary button (full width on mobile).
- A dashed **+ Add credit card** slot ends the liabilities section (opens Add account on type *Credit card*).
- No edit or delete for accounts (v1 only creates and lists).

### Mobile wireframe (375px)

```
┌───────────────────────────────────────────┐
│ Accounts                                  │
│                             [Add account] │
│                                           │
│ ┌───────────────────────────────────────┐ │
│ │ Money you have             ₱54,196.25 │ │
│ │ Cash, bank and e-wallet balances      │ │
│ │ ▤ Cash on hand              ₱2,350.00 │ │
│ │   Cash                                │ │
│ │ ▤ Main Savings             ₱48,725.50 │ │
│ │   Bank account                        │ │
│ │ ▤ GCash                     ₱3,120.75 │ │
│ │   E-wallet                            │ │
│ └───────────────────────────────────────┘ │
│                                           │
│ ┌───────────────────────────────────────┐ │
│ │ Money you owe              ₱21,050.00 │ │
│ │ Owed on cards. Available credit       │ │
│ │ isn't cash.                           │ │
│ └───────────────────────────────────────┘ │
│ ┌───────────────────────────────────────┐ │
│ │ ▭ Blue Card                ₱14,250.00 │ │
│ │                                  owed │ │
│ │ ▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░ │ │
│ │ ₱35,750.00 available       [Pay card] │ │
│ │ Limit ₱50,000.00                      │ │
│ └───────────────────────────────────────┘ │
│ ───────────────────────────────────────── │
│ Overview Activity ▸Accounts [+ Add]       │
└───────────────────────────────────────────┘
```

### Desktop wireframe (1280px)

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ◎ MoniKey           ┌────────────────────────────────────────────────────────────────────────────────────────────┐ │
│                     │ Accounts                                            [ Add account ]  [ + Add transaction ] │ │
│ [▸Overview]         │                                                                                            │ │
│   Activity          │ ┌──────────────────────────────────────────┐  ┌──────────────────────────────────────────┐ │ │
│   Accounts          │ │ Money you have                ₱54,196.25 │  │ Money you owe                 ₱21,050.00 │ │ │
│                     │ │ Cash, bank and e-wallet balances         │  │ Owed on cards. Available credit          │ │ │
│                     │ │ ▤ Cash on hand                 ₱2,350.00 │  │ isn't cash.                              │ │ │
│                     │ │   Cash                                   │  └──────────────────────────────────────────┘ │ │
│                     │ │ ▤ Main Savings                ₱48,725.50 │  ┌──────────────────────────────────────────┐ │ │
│                     │ │   Bank account                           │  │ ▭ Blue Card                   ₱14,250.00 │ │ │
│                     │ │ ▤ GCash                        ₱3,120.75 │  │                                     owed │ │ │
│                     │ │   E-wallet                               │  │ ▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │ │ │
│                     │ └──────────────────────────────────────────┘  │ ₱35,750.00 available          [Pay card] │ │ │
│                     │                                               │ Limit ₱50,000.00                         │ │ │
│                     │                                               └──────────────────────────────────────────┘ │ │
│                     │                                               ┌──────────────────────────────────────────┐ │ │
│                     │                                               │ ▭ Everyday Card                ₱6,800.00 │ │ │
│                     │                                               │                                     owed │ │ │
│                     │                                               │ ▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │ │ │
│                     │                                               │ ₱23,200.00 available          [Pay card] │ │ │
│                     │                                               │ Limit ₱30,000.00                         │ │ │
│                     │                                               └──────────────────────────────────────────┘ │ │
│                     │                                               ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐ │ │
│                     │                                               ┆ + Add credit card                        ┆ │ │
│                     │                                               └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘ │ │
│                     └────────────────────────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Below 1024px the two sections stack in one column (no pairing). From 1024px they sit in two equal columns (6 + 6 of 12); each column starts at the top and keeps its own height — they are intentionally not stretched to match.

### Card states
| Situation | Display |
|---|---|
| Debt ₱0.00 | "Nothing owed" in ink; track empty; **Pay card** disabled — reason "Nothing to pay". |
| Overpaid (negative signed debt) | "Card credit ₱500.00" in `primary-ink`; track empty; **Pay card** disabled — reason "No debt to pay". |
| Debt at or above limit | Track full; the available line reads "No credit available"; muted `TriangleAlert` "Over your limit." The UI treats any `available_credit` ≤ 0 this way, so it works whether the API returns the TLD's signed value (`limit − signed_debt`, negative when over the limit) or clamps it to zero. **Backend to decide and document which.** |
| Negative asset balance | Amount shown as `−₱120.00`; muted warning line "Below zero." |
| No cash/bank/e-wallet accounts | Dashed block "Add your first cash, bank or e-wallet account." + **Add account**. |
| No credit cards | Dashed block "No credit cards yet." + **Add credit card**. |
| Loading | Section headings visible; rows/cards as grey bars at real size. |
| Error | Per section: "Couldn't load accounts. Last updated 09:14." + **Retry**. |

---

## 7. Quick Add

One component, `TransactionForm`, inside a shadcn `Dialog`. It serves **Add** and **Edit**, and all three kinds. On phones the dialog is a **bottom sheet** (full width, anchored to the bottom, ≤92% of the dynamic viewport height, top corners 20px, footer buttons stay visible and the body scrolls). From 768px it is a centred 480px dialog.

### Type switch (first control)
A 3-option segmented control (native radio inputs styled as a segmented control, 44px high):

`● Expense` `○ Income` `○ Pay card`

Default **Expense** (most frequent). Switching type keeps Amount, Date and Note; it clears **Category**, and clears **Account** only if the current choice is invalid for the new type. In edit mode the type is fixed (shown as a label, not a switch).

**Remembered for this visit only (in memory, not stored):** the last account used for expense/income and the last *Pay from* account, so the next entry starts with them selected. The **category is deliberately not remembered** — a pre-selected category is easy to save by mistake.

**Double-count guard (Expense type only):** a one-line muted hint under the switch — "Paying a card bill? **Use Pay card** so it isn't counted twice." The link switches the form to *Pay card* and keeps the amount, date and note. This is the main defence against the beginner mistake of logging a card bill as an expense. (Matching the note against card names was considered and rejected as over-engineering for v1.)

### Fields by type (in this order)

| Field | Expense | Income | Pay card |
|---|---|---|---|
| **Amount** `₱` (required, large 24px, `inputmode="decimal"`, focused first) | ✔ | ✔ | ✔ |
| **Account** | "Account" — all accounts, grouped (*Cash & bank*, *E-wallet*, ***Credit cards — adds to debt***); last-used account preselected | "Deposit to" — cash, bank, e-wallet only | **Pay from** — cash, bank, e-wallet only |
| **Second account** | — | — | **Pay card** — credit cards only, helper "Owed now: ₱14,250.00" |
| **Category** (required) | expense categories as a **tap-to-select chip grid** (radio chips, 44px, 2–3 per row) — no picker to open | income categories as chips | **none** — payments are never categorised or counted as expenses |
| **Date** (required, native date, default today) | ✔ | ✔ | ✔ |
| **Note** (optional, single line) | ✔ | ✔ | ✔ |

Option text shows the balance so users can pick without leaving the form: `GCash — ₱3,120.75`; cards show `Blue Card — ₱35,750.00 available`.

Helper lines (muted, under the field):
- Expense on a card: "Counts as an expense and adds to the card's debt."
- Expense on cash/bank/e-wallet: none.
- Pay card: "Owed now: ₱14,250.00. No category — payments aren't expenses." ("Owed now" comes from the server's account data.)

**Shortcuts and previews** (hidden in edit mode, where "owed now" would include the entry being edited and mislead):
- **Pay full ₱14,250.00** — a button under the Amount on *Pay card*; fills the amount with the server's owed figure (no browser arithmetic). Shown only while the selected card owes something.
- **Before/after preview**, shown once the amount is valid: on *Pay card* — "After paying (estimate): Main Savings ₱48,725.50 → ₱43,725.50 · Blue Card owed ₱14,250.00 → ₱9,250.00 · Expenses: no change"; on an Expense charged to a card — "Blue Card owed ₱14,250.00 → ₱16,750.00". It is a display-only estimate in whole centavos, labelled "estimate", never saved. **Depends on owner decision Q4**; if refused, drop the preview and keep the result sentence after saving (§7 Success), which uses server figures.

The **Save** button label changes with the type: *Save expense* · *Save income* · *Pay credit card*. Cancel is a text/secondary button.

### Wireframes (mobile sheet, 375px)

Expense:
```
┌────────────────────────────────────────────┐
│ Add transaction                        [X] │
│ [● Expense][○ Income][○ Pay card]          │
│ Paying a card bill? Use Pay card           │
│ so it isn't counted twice.                 │
│                                            │
│ Amount                                     │
│ [ ₱  385.00                              ] │
│ Account                                    │
│ [ GCash — ₱3,120.75                    ▾ ] │
│ Category                                   │
│ [● Food] [○ Groceries] [○ Bills]           │
│ [○ Transportation] [○ Shopping]            │
│ [○ Other]                                  │
│ Date                                       │
│ [ Oct 25, 2026                         ▾ ] │
│ Note (optional)                            │
│ [ Lunch with team                        ] │
│ ────────────────────────────────────────── │
│ [ Cancel ]   [      Save expense      ]    │
└────────────────────────────────────────────┘
```

Pay card:
```
┌────────────────────────────────────────────┐
│ Pay credit card                        [X] │
│ [○ Expense][○ Income][● Pay card]          │
│                                            │
│ Amount                                     │
│ [ ₱  5,000.00                            ] │
│ [ Pay full ₱14,250.00 ]                    │
│ Pay from                                   │
│ [ Main Savings — ₱48,725.50            ▾ ] │
│ Pay card                                   │
│ [ Blue Card                            ▾ ] │
│ Owed now: ₱14,250.00. No category —        │
│ payments aren't expenses.                  │
│ ┌────────────────────────────────────────┐ │
│ │ After paying (estimate)                │ │
│ │ Main Savings: ₱48,725.50 → ₱43,725.50  │ │
│ │ Blue Card owed: ₱14,250.00 → ₱9,250.00 │ │
│ │ Expenses: no change                    │ │
│ └────────────────────────────────────────┘ │
│ Date                                       │
│ [ Oct 25, 2026                         ▾ ] │
│ Note (optional)                            │
│ [                                        ] │
│ ────────────────────────────────────────── │
│ [ Cancel ]   [     Pay credit card      ]  │
└────────────────────────────────────────────┘
```

### Validation

Validate on **blur** and on **submit**. After a failed submit show the **error summary** at the top of the form, move focus to it, and link each item to its field. Inline messages stay under each field (`CircleAlert` + text; `aria-invalid`, `aria-describedby`). Colour is never the only signal.

| Field | Rule | Message |
|---|---|---|
| Amount | required | "Enter an amount." |
| Amount | digits, optional comma separators, one `.` | "Use numbers only, like 350 or 350.50." |
| Amount | > 0 | "Amount must be more than ₱0.00." |
| Amount | ≤ 2 decimals | "Use at most 2 decimal places." |
| Amount | ≤ 9,999,999,999.99 (`NUMERIC(12,2)`) | "That amount is too large." |
| Account (expense/income) | required | "Choose an account." |
| Pay from | required | "Choose the account you're paying from." |
| Pay card | required | "Choose the card you're paying." |
| Category | required | "Choose a category." |
| Date | valid calendar date | "Enter a valid date." |
| Note | ≤ 120 characters *(limit to be aligned with the backend)* | "Keep the note under 120 characters." |

**Non-blocking notices** (warning box, never prevent saving; display-only comparison, not authoritative):
- Pay card amount > owed: "That's more than the ₱14,250.00 currently owed. The extra becomes credit on the card."
- Pay from balance < amount: "Main Savings has ₱3,000.00, less than this payment. Its balance will go below zero."
- Card expense > available credit: "That's more than the ₱35,750.00 credit available on Blue Card."

```
┌──────────────────────────────────────┐
│ Add transaction                  [X] │
│ (!) Fix 2 things to save             │
│     · Enter an amount.               │
│     · Choose a category.             │
│ [● Expense][○ Income][○ Pay card]    │
│                                      │
│ Amount                               │
│ [ ₱  0.00                         ]  │
│ (!) Enter an amount.                 │
│ Account                              │
│ [ GCash — ₱3,120.75             ▾ ]  │
│ Category                             │
│ [ Choose a category             ▾ ]  │
│ (!) Choose a category.               │
│ …                                    │
└──────────────────────────────────────┘
```

### Submission lifecycle

| Step | UI |
|---|---|
| Idle | Save enabled. |
| **Saving** | Save shows `LoaderCircle` + "Saving…" and is disabled; fields disabled; `aria-busy="true"`; Esc and overlay-click ignored; Cancel disabled. After 15s the notice "This is taking longer than usual…" appears. |
| **Success** | Dialog closes; focus returns to the control that opened it; a dismissible polite status message appears at the top of the screen — built from the **re-fetched server figures** — e.g. "Expense saved: −₱385.00 from GCash.", "Expense saved: −₱2,500.00 from Blue Card. Blue Card now owes ₱16,750.00.", or "Card payment saved: ₱5,000.00 from Main Savings to Blue Card. Blue Card now owes ₱9,250.00. Card payments don't count as expenses and don't change your net position." One message only: extra clauses (such as "It's hidden by your filters.") are appended to it, never shown as a second message that replaces it. It auto-clears after 8 seconds; the visible screen **re-fetches** (see below). No optimistic updates. |
| **Server error** | A notice at the top of the dialog; all input kept; Save re-enabled. Messages: network/500 — "Couldn't save. Check your connection and try again. Your entry is still here."; 400 — the server's message; 404 on **add** — "That account or category no longer exists. Reload and try again."; 404 on **edit** — "This entry was removed, maybe in another tab. Your changes are still here." (draft kept; saving is not retried); 404 on **delete** — "It was already deleted." then the list refreshes and the dialog closes; 422 — "Some details aren't valid. Check the highlighted fields." |

**What updates after a successful write** (decimal strings from the server are the only source of totals):

| Written | Re-fetch |
|---|---|
| Expense / income | accounts, summary (selected month), the current view's list |
| Card payment | accounts, summary, the current view's list |
| New account | accounts (and summary if opening values changed totals) |
| Edit / delete | same as the kind being changed |

Where the sheet closes into: Activity or Overview or Accounts — whichever opened it — staying on that screen.

### Keyboard and focus
Opening focuses **Amount** (Add) or the first field (Edit). Tab order = visual order. Esc closes (except while saving). Focus returns to the opener; **if the opener no longer exists** (for example its row was just deleted or the view re-rendered), focus moves to the current view's `h1`. Concurrent edits (another tab or device) are **last write wins** in v1 — no version field — unless the owner asks otherwise. Clicking the overlay closes only when nothing has been typed. Enter in a single-line field submits.

---

## 8. Pay credit card — flow

Three entry points, one form (`TransactionForm` on the *Pay card* type):

1. **Accounts → card → Pay card** — card preselected.
2. **Overview → Credit cards → Pay card** — card preselected.
3. **+ Add → Pay card** — nothing preselected.

```
Tap "Pay card" (card preselected; "Pay from" = last-used source, if any)
  → sheet opens on "Pay card"; Amount focused
  → tap "Pay full ₱14,250.00"   — or type another amount   (blank → "Enter an amount.")
  → check "Pay from"            (only cash / bank / e-wallet listed)
  → read the preview: Main Savings ₱48,725.50 → ₱43,725.50 · Blue Card owed ₱14,250.00 → ₱9,250.00 · Expenses: no change
  → date defaults to today; note optional
  → "Pay credit card"
       ├─ success → sheet closes → ONE message built from server figures:
       │            "Card payment saved: ₱5,000.00 from Main Savings to Blue Card. Blue Card now owes ₱9,250.00.
       │             Card payments don't count as expenses and don't change your net position."
       │            Accounts re-fetched: Main Savings −₱5,000.00, Blue Card owed −₱5,000.00
       │            Summary re-fetched: net position unchanged; October expenses unchanged
       └─ error   → notice in sheet; input kept
```

**Why the extra steps:** paying a card is the most money-sensitive moment in the app and the easiest place to teach the core rule. The preview says it *before* saving, the message says it *after*, and the Activity row ("Payment", no sign) keeps saying it later.

**Recording a card purchase** (the other half of the card story) uses the same form on the *Expense* type: choose the card in "Account" (group label "Credit cards — adds to debt"; helper "Counts as an expense and adds to the card's debt."; preview "Blue Card owed ₱14,250.00 → ₱16,750.00"); the confirmation says "…Blue Card now owes ₱16,750.00." Target: **3 interactions when the account is remembered** (amount, category chip, Save) and **4 otherwise** (amount, account, category chip, Save).

Facts the UI must make true, and the tests (Milestone 5) must check:
- After a payment the **monthly expenses figure does not change**.
- **Net position does not change** for a payment (cash falls by the same amount as debt).
- The payment appears in Activity as a card-payment row (`↔`, "Payment", no sign), never as an expense.
- *Pay from* never lists a card; *Pay card* never lists a non-card.

---

## 9. Add account

A small dialog (same `Dialog`, same sheet-on-phone behavior), opened from **Accounts → Add account**, the dashed **+ Add credit card** slot, or the first-run prompt.

Type switch: `Cash` `Bank` `E-wallet` `Card`. Fields by type:

| Type | Fields |
|---|---|
| Cash / Bank / E-wallet | **Name** (required, ≤60, unique) · **Current balance (₱)** (required, ≥ 0) |
| Credit card | **Name** · **Credit limit (₱)** (required, > 0) · **Amount you owe today (₱)** (required, ≥ 0) |

Helper text explains the money fields in plain words: balance — "What's in it right now."; limit — "The most the bank lets you charge."; owe — "What you still owe on this card today. Use 0.00 if nothing."

```
┌──────────────────────────────────────┐
│ Add account                      [X] │
│ [●Cash][○Bank][○E-wallet][○Card]     │
│                                      │
│ Name                                 │
│ [ Cash on hand                    ]  │
│ Current balance (₱)                  │
│ [ 4,811.75                        ]  │
│ ──────────────────────────────────── │
│ [ Cancel ]    [  Add account   ]     │
└──────────────────────────────────────┘
```
```
┌──────────────────────────────────────┐
│ Add account                      [X] │
│ [○Cash][○Bank][○E-wallet][●Card]     │
│                                      │
│ Name                                 │
│ [ Blue Card                       ]  │
│ Credit limit (₱)                     │
│ [ 50,000.00                       ]  │
│ Amount you owe today (₱)             │
│ [ 11,972.75                       ]  │
│ ──────────────────────────────────── │
│ [ Cancel ]    [  Add account   ]     │
└──────────────────────────────────────┘
```

Validation messages: Name — "Give the account a name." / "Keep the name under 60 characters." / (409) "You already have an account with that name." Balance/limit/owed reuse the Amount messages; limit also "Credit limit must be more than ₱0.00."; balance/owed also "Use 0.00 or more." The UI fields map to the API's `opening_balance` / `opening_debt` / `credit_limit`; the plain labels are for people.

Success: "Account added: GCash." and Accounts re-fetches.

**Edit account (owner-requested v1 follow-up, 2026-10-25).** From Accounts, each liquid-account row and credit-card card has an **Edit account** action. The dialog uses the same responsive sheet pattern and account validation as Add account. The account type is displayed and stays fixed. The person can edit its name, opening balance (liquid accounts), or opening debt and credit limit (cards). An unchanged name is allowed; names remain unique ignoring case and surrounding spaces.

Opening amounts are the starting baseline before tracked activity. In Edit account, label the fields **Opening balance (₱)** and **Opening debt (₱)** and explain: changing one recalculates today's balance/debt while keeping saved transactions and card payments unchanged. Card credit-limit changes may leave a card over its limit; that remains a valid state and is shown by the existing warning. Save success re-fetches accounts and totals; failure keeps the typed values. Account type cannot be changed, and account deletion remains out of scope.

---

## 10. Edit and delete

**Edit.** Same sheet, title "Edit expense" / "Edit income" / "Edit card payment", fields pre-filled, type fixed. Footer: **Save changes** (primary) · **Cancel** · **Delete** (text button in the negative colour, separated from the others). Desktop rows also have a direct **Edit** icon.

**Delete.** Always confirmed, always names the object, never undoable in v1.

```
┌──────────────────────────────────────┐
│ Delete this expense?                 │
│                                      │
│ Lunch with team                      │
│ −₱385.00 · Oct 24, 2026 · GCash      │
│                                      │
│ GCash goes up by ₱385.00 and this    │
│ month's expenses drop by ₱385.00.    │
│ This can't be undone.                │
│                                      │
│ [ Cancel ]   [ Delete expense ]      │
└──────────────────────────────────────┘
```

| Kind | Title | Body |
|---|---|---|
| Expense (cash/bank/e-wallet) | Delete this expense? | "{note} · −{amount} · {date} · {account}" — "{account} goes up by {amount} and this month's expenses drop by {amount}. This can't be undone." |
| Expense (card) | Delete this expense? | "…{card} owed goes down by {amount} and this month's expenses drop by {amount}. …" |
| Income | Delete this income? | "…{account} goes down by {amount} and this month's income drops by {amount}. …" |
| Card payment | Delete this card payment? | "…{source} goes up by {amount} and {card} owed goes up by {amount}. Your expenses don't change. This can't be undone." |

(`{month}` effects are correct for entries in the *currently viewed* month; if the entry is from another month the monthly clause is omitted.)

- Buttons: **Cancel** (receives initial focus) and **Delete expense** / **Delete income** / **Delete payment** (error-coloured fill, white text).
- Deleting: button shows "Deleting…" and is disabled. Failure: notice inside the dialog — "Couldn't delete. Nothing was changed. Try again." Success: closes, status "Expense deleted.", list re-fetched; focus moves to the list heading.
- From the edit sheet, **Delete** swaps the sheet's content to this confirmation (no second dialog on top), and **Cancel** returns to the edit form.

---

## 11. Copy rules (plain words for beginners)

| Use | Not |
|---|---|
| Money you have · Card debt · Net position | Assets · Liabilities · Liquid balance |
| owed · available credit | outstanding balance · remaining limit |
| Pay card / Pay credit card | Repayment · settle |
| "Card payments aren't counted as expenses." | (nothing — leave the concept unexplained) |
| "Couldn't save. Your entry is still here." | "Error 500" |
| Sentence case everywhere; no uppercase tracked labels | Title Case Buttons |

No emoji. No exclamation marks. No greetings ("Welcome back"). No jargon without a one-line explanation beside it.

---

## 12. User journeys (acceptance walk-throughs)

| # | Journey | Steps | Done when |
|---|---|---|---|
| U1 | Log a coffee on a phone | Open → **+ Add** → Amount `120` → Account *Cash on hand* → Category *Food* → Save | ≤4 interactions after opening (≤3 when the account is remembered); Overview "Expenses" up by ₱120.00, Cash down by ₱120.00 |
| U2 | Log a card purchase | **+ Add** → `2,500` → *Blue Card* → *Shopping* → Save | Blue Card owed +₱2,500.00; Expenses +₱2,500.00; Net position −₱2,500.00 |
| U3 | Pay a card | Accounts → Blue Card → **Pay card** → **Pay full** (or `5,000`) → check *Main Savings* → Pay | Main Savings −₱5,000.00; Blue Card owed −₱5,000.00; **Expenses unchanged**; **Net position unchanged** |
| U8 | Beginner logs a card bill as an expense | **+ Add** → Expense → reads "Paying a card bill? Use Pay card…" → taps it | Form switches to *Pay card* keeping amount/date/note; saved as a payment, expenses unchanged. **Test first with a real beginner.** |
| U4 | Fix a mistake | Activity → tap row → change amount → Save changes | Row, balances, summary all refresh; message "Expense saved…" |
| U5 | Delete a wrong entry | Activity → row → Delete → confirm | Names the entry and its effect; list and balances refresh |
| U6 | Recover from a bad save | Offline → Save | Notice in sheet; typed values still present; works on retry |
| U7 | First run | Open with no accounts | Overview prompts to add an account; Add transaction disabled with reason; adding a cash account unlocks it |

---

## 13. Data each screen needs (for the typed API client later)

| Screen | Requests (TLD §4/§6) |
|---|---|
| Overview | `GET /api/summary?month=`, `GET /api/accounts`, recent `GET /api/transactions?month=&limit=` and `GET /api/credit-card-payments?month=&limit=` (merged) |
| Activity | `GET /api/transactions?month=&account_id=&limit=`, `GET /api/credit-card-payments?month=&limit=`, `GET /api/accounts`, `GET /api/categories` |
| Accounts | `GET /api/accounts` |
| Quick Add | accounts and categories already loaded; `POST /api/transactions` or `POST /api/credit-card-payments`; edits `PUT`; deletes `DELETE` |
| Add account | `POST /api/accounts` |
| Edit account | `GET /api/accounts/{id}` for stored opening values, then `PUT /api/accounts/{id}` |

The UI supports both typed mock data and the same-origin API. In the live API path, money arrives as decimal strings and server-calculated totals remain authoritative.
