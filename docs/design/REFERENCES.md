# MoniKey Design References

**Status: APPROVED by the owner (Milestone 3); implementation in progress (shell and Overview built in 4.1–4.2).** What was studied, what was actually learned, and what MoniKey adopts or rejects. References inform **interaction patterns and information hierarchy only**. No branding, screenshots, copy, icons or layouts are copied. No third-party image was added to the repository.

Related: [`DESIGN.md`](../../DESIGN.md) · [`UI_UX_SPEC.md`](UI_UX_SPEC.md) · [`DESIGN_REVIEW.md`](DESIGN_REVIEW.md)

---

## 1. What was and was not readable

The owner supplied five reference links and two images. Pages were fetched on 2026-10-25 and summarised by the fetch tool; only the facts listed under "Learned" below are sourced from them.

| # | Reference | Link | Result | Usable? |
|---|---|---|---|---|
| 1 | Monarch Money — tracking | https://www.monarch.com/features/tracking | Fetched | **Yes** — dashboard/accounts/net-worth structure |
| 2 | Lunch Money — transactions | https://lunchmoney.app/features/transactions | **HTTP 403** | **No** — nothing learned from this page |
| 3 | Cashew | https://cashewapp.web.app/ | Fetched; landing page with links and screenshot filenames only | **No** — no interaction detail |
| 4 | Actual Budget — user interface | https://actualbudget.org/docs/tour/user-interface/ | Fetched (partial) | **Partly** — sidebar structure; nothing on credit cards or the transaction table |
| 5 | YNAB — credit card payments | https://support.ynab.com/en_us/credit-card-payments-a-guide-r1_506Q1j | Fetched; returned only a one-line description | **No** — body text not retrieved |
| +a | Actual Budget — accounts overview *(extra, same official docs)* | https://actualbudget.org/docs/accounts/overview/ | Fetched | Partly — on/off-budget grouping; says nothing on card handling |
| +b | Cashew README *(extra)* | https://github.com/jameskokoska/Cashew | Fetched | Partly — add-transaction and filter details |
| img | Teal desktop dashboard (owner-supplied) | local image | Viewed | Pattern analysis only |
| img | Green mobile budget app with Add Transaction sheet and numeric keypad (owner-supplied) | local image | Viewed | Pattern analysis only |

Not learned from any fetched page: how YNAB records card purchases vs. payments, how Lunch Money's editing works, how Cashew's mobile navigation is laid out. Anything below about those products is **not** claimed. MoniKey's card rules come from the repository's TLD and ADRs, not from a reference.

The owner's list calls these "verified"; three of five did not yield usable content through the fetch tool. Opening them in a browser may reveal more.

---

## 2. Learned, and what MoniKey does with it

### Monarch Money (read)
*Learned:* the home view is a set of widgets summarising accounts, net worth and transactions; accounts are grouped into **assets and liabilities** and can be viewed separately; net worth = assets − liabilities; all transactions are in **one searchable list across accounts**; the dashboard is customisable; deeper views (recurring, reports, investments) sit below the summary.

| Adopt | Reject for v1 |
|---|---|
| Assets and liabilities as two named groups (→ "Money you have" / "Money you owe") | Customisable/reorderable dashboard widgets |
| Net position = what you have − what you owe, stated plainly | Net-worth trend chart, reports, Sankey, investments |
| One list of all entries across accounts (→ Activity) | Search, swipe triage, recurring calendar, monthly review |

### Actual Budget (read, partly)
*Learned:* every screen = left sidebar + main area + a small top-right utility corner; navigation links at the top of the sidebar, less-used pages at the bottom; accounts listed in the sidebar under two headings (on-budget / off-budget); a privacy control scrambles on-screen numbers.

| Adopt | Reject / defer |
|---|---|
| Few, stable destinations; the primary navigation is always visible | Accounts listed *inside* the sidebar (MoniKey has a dedicated Accounts screen instead — better on phones) |
| Group accounts under plain headings | On-/off-budget concept (budgeting is out of scope) |
| *Idea for later, not v1:* a "hide amounts" privacy toggle — worth an ADR if the owner wants it | Sync/server status, notifications, rules, tags |

### Cashew (README read; landing page empty)
*Learned:* the add flow lets you choose a default type (expense/income); the home screen can switch the account shown; transactions can be filtered by date, category, amount and tags; long-press multi-select for bulk edit/delete; auto-categorisation by similar titles.

| Adopt | Reject for v1 |
|---|---|
| **Expense is the default type**, switchable in one tap (already in the spec) | Auto-categorise by title, tags, amount filter, multi-select/bulk edit, multi-currency, widgets |
| Account choice is a first-class field in the add flow | Pre-filled links/automation |

### Lunch Money, YNAB
Not readable (403 / metadata only). No patterns taken. The brief names YNAB for "clear separation between expenses, income and credit card payments"; MoniKey already implements that separation from its own rules (card purchase = expense; card payment = neither income nor expense, lowers the paying balance and the card debt). If the owner opens the YNAB guide and finds wording or a flow worth matching, add it here.

---

## 3. The two owner-supplied images (pattern analysis)

### Teal desktop dashboard
**Why it is risky:** it is almost the textbook "generic dashboard" — four KPI tiles each with an icon in a tinted circle and a three-dot menu, a gradient area chart, a gradient credit-card illustration with a card number, a row of avatars, merchant logos, a calendar and a bills list. That is the opposite of the owner's goal (unique, beginner-friendly, not feature-heavy) and of the approved scope (no bills, no banking, no charts).

| Adopt | Reject |
|---|---|
| Rows with a title, a muted subtitle and a right-aligned amount (already specified) | Icon-in-circle KPI tiles, three-dot menus on every card |
| A clear Day / Week / Month segmented control as a *concept* — MoniKey keeps only a month select | Gradient chart and gradient card art; a card-number display (never show account identifiers) |
| A persistent, simple left navigation on desktop | Merchant brand logos; avatars; calendar; bills; Top-up/Transfer/Quick-Transfer (banking features, out of scope) |

### Green mobile budget app with Add Transaction sheet and keypad
| Adopt | Reject / defer |
|---|---|
| **Amount first and very large** in the Add sheet (already specified: 24px amount field, focused on open) | A large coloured header block behind the balance — MoniKey keeps a calm white card |
| Category, date and note as clearly labelled rows below the amount | **Custom numeric keypad and quick-amount chips** — extra component, accessibility and keyboard work; the native decimal keyboard (`inputmode="decimal"`) is enough for v1. Reconsider after real use. |
| A bottom navigation with a single prominent **+** (already specified) | Expense amounts in orange/red (MoniKey keeps expenses in ink; red is for errors) |
| A "Today / Month" quick toggle as a concept | Emoji category icons (not allowed); currency pill ("USD") — MoniKey is ₱ only |

---

## 4. Decisions this study produced

1. **Keep the scope:** Overview, Activity, Accounts, Quick Add / Pay card. No chart, widget, bill, calendar or banking feature is added because a reference has one.
2. **Assets vs. liabilities** as two named sections (Monarch pattern) — already the Accounts design; Overview's position card states the same split in a sentence.
3. **One activity list** across all accounts (Monarch) — already Activity.
4. **Expense is the default add type** (Cashew) — already so.
5. **Native decimal keyboard, no custom keypad** (decision from the mobile reference).
6. **Credit-card purchase and card payment get extra attention** — see `UI_UX_SPEC.md` §7–§8 and the follow-up recorded in `DESIGN_REVIEW.md` §5b.
7. **Possible later ideas, not approved:** privacy "hide amounts" toggle; quick-amount chips.

## 5. How to use these references later
Open them in a browser for flows the fetch tool could not read (YNAB, Lunch Money, Cashew's app). Write only what you observed, in your own words. Do not paste their text, copy their layout, or add their assets.
