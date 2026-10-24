# MoniKey Design System

**Status: APPROVED by the owner (Milestone 3, after an independent browser review).** Canonical for visual rules (`AGENTS.md` / `CLAUDE.md`); behavior and screens live in [`docs/design/UI_UX_SPEC.md`](docs/design/UI_UX_SPEC.md); design-mock test evidence is in [`docs/design/VERIFICATION.md`](docs/design/VERIFICATION.md). Implemented so far: the tokens, fonts and components (Milestone 4.1) and the application shell and Overview page (4.2); Activity, Accounts and Quick Add are not built yet.

Related: [UI/UX spec](docs/design/UI_UX_SPEC.md) · [Component inventory](docs/design/COMPONENT_INVENTORY.md) · [Responsive guidelines](docs/design/RESPONSIVE_GUIDELINES.md) · [Design review](docs/design/DESIGN_REVIEW.md) · [ADR-015](docs/architecture/ADR.md) (Tailwind v4, shadcn/ui, Lucide)

All amounts in this repository's design documents are **fictional** Philippine peso figures.

---

> **Implementation (Milestone 4.1):** these tokens now live in [`frontend/src/index.css`](frontend/src/index.css) as CSS variables (shadcn/ui's names plus MoniKey additions) mapped to Tailwind utilities with `@theme inline`. Change a value there and in this file together; components never use raw hex values. See [`docs/design/FRONTEND_SCAFFOLD_4_1.md`](docs/design/FRONTEND_SCAFFOLD_4_1.md). Milestone 4.2 implements the shell and the Overview page from these tokens: [`docs/design/FRONTEND_OVERVIEW_4_2.md`](docs/design/FRONTEND_OVERVIEW_4_2.md).

## A. Visual identity

### Product personality

MoniKey is a calm, honest notebook for everyday money. It should feel like a friendly person explaining your money in plain words, not like a bank portal or a trading terminal.

| Is | Is not |
|---|---|
| Calm, clear, plain-spoken | Flashy, gamified, motivational |
| Friendly through wording and generous space | Friendly through mascots, emoji or confetti |
| Precise with numbers | Approximate or decorative with numbers |
| Quick on a phone with one thumb | A desktop dashboard shrunk down |

### Design principles

1. **Answer one question per screen first.** Overview: *"After what I owe, how much do I really have?"* Activity: *"What happened to my money, and can I fix an entry?"* Accounts: *"What do I have, and what do I owe, account by account?"*
2. **Say what a number is.** Every figure has a plain label. Debt is *owed*; available credit is *not cash*; a card payment is *not an expense*.
3. **Never rely on colour alone.** Income carries a `+` and an arrow, expenses a `−`, debt the word "owed". Colour reinforces; it never carries meaning alone.
4. **Colour goes on data and the one primary action**, not on chrome. Most of the screen is ink on white and pale grey.
5. **One primary action per screen.** Everything else is secondary or text.
6. **Flat surfaces.** Tone steps and 1px borders separate things. Shadows are for what floats (dialogs, sheets).
7. **No decoration.** No gradients, glass, glow, 3D, illustration, emoji, or icons inside tinted squares.
8. **Motion is feedback only.** No entrance animation, no animation library.
9. **Mobile first.** Design at 360–375px, then add space for tablet and desktop.
10. **Small, explainable parts.** Each piece should be understandable to an entry-level developer.

### Visual direction

**"Pastel consumer, restrained"** — chosen from Taste Skill's app-style library (`pastel-consumer`, light), adapted:

- Off-white cool ground, white cards, one large card radius (20px) stepping down inside.
- One cobalt blue for the primary action, links, focus and selected states.
- Quiet money polarity (from the style): income green with a plus sign; ordinary spending stays in ink — **no red on normal expenses**. Red is reserved for errors and destructive actions.
- One extra hue for credit-card debt (burnt orange), used only on owed amounts, so liabilities are never confused with money you have.
- Pale tints are used only on small chips, selected segments, the active navigation item and callouts — never on whole panels.
- **One flat deep-cobalt hero card** carries the net position (white text, no gradient, no shadow). It is the only large field of colour in the app and gives the product its focal point; everything else is white or pale grey.

**Light theme only** for the initial baseline. Dark mode is deferred; the token structure below is built so a dark set can be added later without renaming anything.

**Product face** (Taste Skill step: "give the product a face"):

- *Typeface*: Manrope (self-hosted, verified); balances carry the personality at 36–44px/600 in the hero and 24px/600 elsewhere, always with tabular figures.
- *Signature element*: the **inline equation in the hero card** on Overview — `Money you have − Card debt` under the net-position figure — which teaches the central MoniKey idea and appears nowhere else.
- *Credit-limit track*: each credit card shows debt as a filled portion of its limit with the remainder labelled "available credit".
- *Mark*: a simple key-and-coin glyph (a ring holding ₱, with a short shaft and two teeth) in cobalt; wordmark "MoniKey" in Manrope 600. To be drawn when implementation begins; no logo asset exists yet.

---

## B. Color system

All colours are **semantic tokens**. Components reference token names, never raw hex. Values below are the proposal; contrast was computed with a WCAG formula script (results in the table).

### Tokens (light)

| Token | Value | Use |
|---|---|---|
| `background` | `#F3F5F7` | Page ground |
| `surface` | `#FFFFFF` | Cards, dialogs, inputs |
| `surface-raised` | `#F2F8FD` | Callouts, the Quick Add amount well and the estimate box |
| `border` | `#E4E7EB` | Card/row edges (decorative) |
| `border-control` | `#858B92` | Input, select, checkbox edges (UI component boundary) |
| `text` | `#1B1D1F` | Primary text, **expense amounts** |
| `text-muted` | `#5C6064` | Labels, captions, secondary text |
| `primary` | `#1D5FD6` | Primary button, links, focus ring, selected state |
| `primary-hover` | `#184FB0` | Primary button hover/pressed |
| `primary-foreground` | `#FFFFFF` | Text on primary |
| `primary-soft` / `primary-ink` | `#DCF1FF` / `#0A3A80` | Selected segment, selected category chip, **active navigation item**, info chips |
| `hero` | `#0B3278` | Net-position card background (flat) |
| `hero-muted` | `#C9D8F4` | Secondary text on the hero |
| `hero-debt` | `#FFC299` | The card-debt figure on the hero (the `debt` colour is too dark on navy) |
| `hero-line` | `rgba(255,255,255,0.20)` | Divider inside the hero |
| `secondary` | `#EEF1F4` | Secondary button fill, neutral chips |
| `secondary-foreground` | `#3A3D40` | Text on secondary |
| `income` | `#247B50` | Income amounts and the Income label (always with `+` and an arrow) |
| `income-soft` / `income-ink` | `#DCFAE5` / `#04250E` | Income chip |
| `expense` | `#1B1D1F` (= `text`) | Expense amounts (always with `−`). Deliberately neutral. |
| `debt` | `#B54708` | Credit-card **owed** amounts and the debt track fill |
| `debt-soft` / `debt-ink` | `#FEF0E6` / `#8A3706` | "Owed" chip |
| `success` | `#247B50` | "Saved" confirmation (always with a check icon and text) |
| `success-soft` | `#DCFAE5` | Success message background |
| `error` | `#C41C29` | Validation errors, failed loads, destructive button |
| `error-soft` / `error-ink` | `#FFEDEA` / `#831C1E` | Error message background / text on it |
| `warning-soft` / `warning-ink` | `#FEF9C3` / `#713F12` | Non-blocking notices (e.g. "more than current debt") |
| `ring` | `#1D5FD6` | Keyboard focus ring (2px, 2px offset) |
| `disabled-bg` / `disabled-fg` | `#E9ECEF` / `#60666C` | Disabled controls (stay readable) |
| `overlay` | `rgba(27,29,31,0.45)` | Dialog backdrop |

Note: `income` and `success` intentionally share a value; `expense` and `text` are the same ink. They remain separate **names** so a future change (for example a different success colour) touches one token.

### Computed contrast (WCAG 2.x)

| Pair | Ratio | Requirement | Result |
|---|---|---|---|
| `text` on `surface` | 16.91 | 4.5 | pass |
| `text` on `background` | 15.47 | 4.5 | pass |
| `text-muted` on `surface` / `background` / `surface-raised` | 6.34 / 5.80 / 5.92 | 4.5 | pass |
| `primary-foreground` on `primary` / `primary-hover` | 5.74 / 7.54 | 4.5 | pass |
| `primary` text on `surface` / `background` | 5.74 / 5.25 | 4.5 | pass |
| `income` on `surface` / `background` | 5.22 / 4.78 | 4.5 | pass |
| `debt` on `surface` / `background` | 5.43 / 4.97 | 4.5 | pass |
| `debt-ink` on `debt-soft` | 7.16 | 4.5 | pass |
| `error` on `surface` | 5.92 | 4.5 | pass |
| `error-ink` on `error-soft` | 8.63 | 4.5 | pass |
| `warning-ink` on `warning-soft` | 8.07 | 4.5 | pass |
| `income-ink` on `income-soft` | 14.77 | 4.5 | pass |
| `primary-ink` on `primary-soft` | 9.36 | 4.5 | pass |
| `secondary-foreground` on `secondary` | 9.64 | 4.5 | pass |
| white on `hero` | 12.06 | 4.5 | pass |
| `hero-muted` on `hero` | 8.39 | 4.5 | pass |
| `hero-debt` on `hero` | 7.71 | 4.5 | pass |
| `disabled-fg` on `disabled-bg` | 4.90 | 4.5 (house rule; WCAG exempts disabled) | pass |
| `border-control` on `surface` / `background` | 3.44 / 3.15 | 3.0 (WCAG 1.4.11) | pass |
| `ring` on `surface` / `background` | 5.74 / 5.25 | 3.0 | pass |
| `border` on `surface` / `background` | 1.24 / 1.14 | decorative only | n/a — never the only cue for a control |

These ratios were computed during design; they have **not** been re-measured in a browser. Re-check after implementation (Milestone 5).

### Colour rules

- Income, expense and debt are distinguished by **sign, icon and label first, colour second**.
- Hues on one screen: neutral ink, cobalt, green, burnt orange (debt) — plus red/yellow only when an error or notice is actually shown.
- `debt` and `warning` are different hues (≈24° vs ≈48°) and different roles: `debt` colours amounts; `warning` only fills a notice box. Distinguishability under colour-vision deficiency has **not** been tested — see the design review.
- A zero is printed as a zero in normal ink. A missing value is a muted `—`.
- Credit-card **available credit** is shown in `text-muted`, never in `income` or any "positive" colour, and is never added to a total.

---

## C. Typography

**Typeface: Manrope**, self-hosted, one family. Weights 400–700 from a single variable file (the design uses 400, 500, 600; 700 only for the wordmark). Fallback stack: `"Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif`. Licence: SIL Open Font License 1.1 (kept beside the files).

**Verified in Chromium** (`docs/design/VERIFICATION.md`, "Font" checks), against the downloaded files:

1. **₱ is drawn by Manrope**, not a fallback face (measured with the browser's platform-font report on the hero amount).
2. **The true minus sign `−` (U+2212) is drawn by Manrope** in row amounts.
3. **Tabular figures work:** with `font-variant-numeric: tabular-nums`, `1111`, `0000` and `8888` are all the same width (79.38px at 32px/600); without it they differ (54.03 / 82.19 / 77 px). Manrope's default digits are **proportional**, so `tabular-nums` is **required** on every amount (it is, via the base style).

**Delivery:** the mock self-hosts the `latin` and `latin-ext` subsets (≈40 KB of WOFF2, from Google Fonts' own files) in `docs/design/preview/fonts/`; `latin-ext` is the subset that contains ₱ (U+20B1). Production will copy the same two files into `frontend/public/fonts/` with `@font-face` and `font-display: swap` at Milestone 2 — no CDN, no runtime third-party request, no npm dependency. If the font ever fails to load, the fallback stack keeps the layout intact (amounts never truncate, widths are checked with the fallback in mind).

| Role | Mobile | ≥768px | Weight | Line height | Notes |
|---|---|---|---|---|---|
| Page title (h1) | 24 | 28 | 600 | 1.2 | A noun: "Overview", "Activity", "Accounts" |
| Section / card title (h2) | 18 | 20 | 600 | 1.3 | "Recent activity", "Money you owe" |
| Body | 16 | 16 | 400 | 1.5 | Never below 16 for inputs (prevents iOS zoom) |
| Label / field label | 14 | 14 | 500 | 1.4 | Always above the field, never a placeholder |
| Caption / helper | 14 | 14 | 400 | 1.4 | `text-muted` |
| Micro (chips, meta) | 12 | 12 | 500 | 1.3 | Sparingly; floor of 12 |
| **Hero amount** (net position) | 36 | 40 (≥768) · 44 (≥1024) | 600 | 1.05 | At least 1.5× any sibling figure (36 ÷ 24); tracking −0.03em. Steps down if longer than 13 characters |
| **Figure** (section totals, month income/expenses) | 24 | 24 | 600 | 1.2 | |
| **Row amount** (lists) | 16 | 16 | 600 | 1.3 | Never smaller than body |
| **Inline amount** (helper text) | 14 | 14 | 600 | 1.4 | |

### Financial amount conventions

- **Format:** `₱` + thousands separators + exactly two decimals: `₱33,146.25`. No space after `₱`. Zero is `₱0.00`.
- **Signs:** Use the true minus `−` (U+2212), placed before the peso sign: `−₱385.00`. Income gets `+₱32,000.00`.
- **Numerals:** `font-variant-numeric: tabular-nums` on **every** amount. Amounts are **right-aligned** in rows and columns and share one right edge per card.
- **Money is a string.** Display formatting never sums or rounds money in the browser; amounts arrive as decimal strings from the API.
- **Never truncate an amount.** Truncate text (names, notes) with an ellipsis instead. If a hero amount exceeds 13 characters, step it down one size.
- **Screen readers:** each amount row includes visually-hidden words ("Income", "Expense", "Card payment"), so meaning does not depend on sign glyphs or colour.
- **Dates:** `Oct 24, 2026` in rows and filters; group headings `Sat, Oct 24`. Stored and exchanged as `YYYY-MM-DD` local calendar dates.

---

## D. Layout and spacing

### Scale

4px base: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64`.

| Property | Mobile (<768) | Tablet (768–1023) | Desktop (≥1024) |
|---|---|---|---|
| Page margin | 16 | 24 | 24 (content max 1032) |
| Grid gap (one value, both directions) | 16 | 24 | 24 |
| Card padding | 20 | 24 | 24 |
| Gap between stacked sections | 24 | 32 | 32 |
| Control height | buttons and nav 44 · text inputs, selects and the date field **48** | same | same (icon-only row actions 36) |

### Shape and surfaces

- **Radius:** cards 20 · controls and inputs 12 · icon-only row buttons 10 · inner elements 8 · small tags 5 · pills/chips 999 · dialogs 24; the phone sheet is 24 on the top corners only. *(Reconciled at Milestone 4.1 with the approved mock, which used 12 and 24; the first draft said 10 and 20.)*
- **Cards:** `surface` fill, 1px `border`, no shadow, radius 20.
- **Shadows:** only on dialogs and the mobile sheet: `0 12px 32px rgba(27,29,31,0.16)`. Nothing at rest.
- **Dividers:** within lists, 1px `rule` (`#EEF0F2` — a third light step used only between rows) or none; no zebra striping; no header bands.

### Page structure (all three screens share it)

1. **Page header:** h1 (noun) on the left; secondary controls (month select, Add account) and the primary **Add transaction** button on the right (≥768px). One line of muted subline allowed.
2. **Content:** a 12-column grid (24px gap) on desktop; a single column on mobile.
3. **Edges:** every block shares the page's left and right edge; cards in one row share a bottom edge.

Desktop arithmetic at 1280px: sidebar 224 + canvas 1056 − 2×24 margins = **1008 content**; 12 columns → column 62, gap 24; span-6 = 492, span-3 = 234; `492 + 234 + 234 + 2×24 = 1008` ✓. Content never exceeds 1032 (centred beyond that).

### Navigation (three views, no router)

| Viewport | Navigation | Add transaction |
|---|---|---|
| <768 | **Bottom bar**, 68px + safe-area inset: Overview · Activity · Accounts · **Add** (the filled item, rightmost for thumb reach). Icon + short label on every item. | Bottom-bar item |
| 768–1023 | **Left rail**, 80px: icon over label, three items; the active item's icon sits in a soft-blue pill. | Page-header button |
| ≥1024 | **Compact sidebar**, 224px: mark + wordmark, then three labelled items. Active item = soft-blue pill (`primary-soft`) with `primary-ink` text and icon (no coloured bar). | Page-header button |

The three destinations are semantic `<button>`s inside `<nav aria-label="Main">`; the active one has `aria-current="page"`. Selecting one swaps the view and moves focus to that view's h1.

---

## E. Components

Full details in [`COMPONENT_INVENTORY.md`](docs/design/COMPONENT_INVENTORY.md). Summary:

- **shadcn/ui source (only the five approved):** `Button`, `Card`, `Input`, `Label`, `Dialog`.
- **Native HTML:** `<select>` (account, category, month, filters), `<input type="date">`, radio inputs for the type switcher.
- **Small custom components (15):** `AppShell` (with private `SideNav` and `BottomNav`), `PageHeader`, `SummaryCard`, `AccountRow` (the account list row), `CreditCardSummary`, `TransactionItem`, `TransactionForm`, `AccountForm`, `SegmentedControl`, `FormField`, `MoneyText`, `EmptyState`, `InlineNotice`, `ConfirmDeleteDialog`, `SkeletonValue`.
- **Not added:** Select, Toast/Sonner, Sheet, Tabs, Tooltip, Skeleton (shadcn), Form libraries, charts, animation libraries.

### Icons

Lucide React, outline, imported by name, 16–20px, `text-muted` by default. Icon-only controls carry an `aria-label`; decorative icons are `aria-hidden`. Icons are plain — never placed inside a coloured box and never repeated as a tile down a list. Planned set (names to be confirmed against the installed `lucide-react` version at implementation): `House`, `List`, `Wallet`, `Plus`, `Banknote`, `Landmark`, `Smartphone`, `CreditCard`, `Pencil`, `Trash2`, `ArrowDownLeft`, `ArrowUpRight`, `ArrowRightLeft`, `CircleCheck`, `CircleAlert`, `TriangleAlert`, `Info`, `LoaderCircle`, `RotateCw`, `X`.

---

## F. Interaction states

| State | Rule |
|---|---|
| **Default** | Surface fill, 1px `border` (cards) or `border-control` (inputs/selects). |
| **Hover** (pointer only) | Buttons: primary → `primary-hover`; secondary → one tone darker; rows: `background` tint. Never the only cue. No hover-only controls — everything works on touch and keyboard. |
| **Focus** | `:focus-visible` shows a 2px `ring` with 2px offset on every interactive element. Never removed. Dialogs move focus to the first field and restore it to the trigger on close. |
| **Pressed** | Primary → `primary-hover`; no scale or bounce. |
| **Disabled** | `disabled-bg` + `disabled-fg` (4.9:1), `cursor: not-allowed`, plus a visible reason when it is not obvious ("Add an account first"). Never reduced-opacity. |
| **Loading** | The final layout with each value replaced by a flat `secondary` bar at the value's real size; labels shown immediately; no shimmer, no layout shift. A refresh keeps old values on screen. Buttons: label changes to "Saving…" with `LoaderCircle`, button disabled, `aria-busy` on the form. |
| **Empty** | Section keeps its frame and heading; one plain sentence plus the next action. No illustration. |
| **Error (load)** | Inside the block that failed: what failed + "Last updated …" + a **Retry** text button. Red only on a small icon / the soft pair. |
| **Error (save)** | Notice at the top of the dialog; user input is **kept**. |
| **Validation** | Inline message directly under the field with `CircleAlert` + text; field gets `aria-invalid="true"` and `aria-describedby`; validated on blur and on submit; after a failed submit an error summary at the top of the form receives focus and links to each invalid field. |
| **Success** | The dialog closes; a dismissible status message ("Expense saved") appears at the top of the screen in a polite live region; values refresh from the server. No optimistic updates. |

### Motion

None beyond feedback: colour/background transitions ≤150ms on hover and focus, and a CSS spin on `LoaderCircle`. `prefers-reduced-motion: reduce` removes the spin transition (a static icon plus the "Saving…" text remains). No animation library. No entrance animation.

---

## References

Studied for **patterns only** — no branding, screenshots, copy or assets were copied. Details, what was and was not readable, and adopt/reject lists are in [`docs/design/REFERENCES.md`](docs/design/REFERENCES.md).

| Reference | What MoniKey took |
|---|---|
| [Monarch Money — tracking](https://www.monarch.com/features/tracking) | Assets and liabilities as two named groups; net = assets − liabilities; one list of all entries |
| [Actual Budget — user interface](https://actualbudget.org/docs/tour/user-interface/) | A few stable destinations always visible; plain account grouping |
| [Cashew](https://cashewapp.web.app/) (README: https://github.com/jameskokoska/Cashew) | Expense is the default add type; account is a first-class field |
| [Lunch Money — transactions](https://lunchmoney.app/features/transactions) | *Page returned HTTP 403 — nothing taken* |
| [YNAB — credit card payments](https://support.ynab.com/en_us/credit-card-payments-a-guide-r1_506Q1j) | *Fetch returned only a one-line description — nothing taken.* MoniKey's card rules come from its TLD/ADRs |
| Two owner-supplied images (a teal desktop dashboard; a green mobile budget app) | Amount-first Add sheet; rejected: icon tiles, gradients, card art, avatars, merchant logos, bills/calendar, custom keypad, large coloured header |

## Out of scope for v1 design

Budgets, goals, recurring bills, due dates or billing cycles, investments, bank sync, charts and analytics, multi-currency, authentication, dark mode, account editing/deletion, category management, export.

---

## Decision log

| # | Decision | Why | Status |
|---|---|---|---|
| D1 | Light theme only | Prompt baseline; fewer states to verify | Proposed |
| D2 | Pastel-consumer style, one cobalt primary | Warm for beginners, phone-first, tints only on small marks | Proposed |
| D3 | Expenses in ink, not red | Spending is normal; red is for errors. Keeps screens calm and avoids "everything is an alarm" | Proposed |
| D4 | Separate `debt` hue | Liabilities must never read like money you have | Proposed |
| D5 | Bottom bar on mobile, rail/sidebar above | Thumb reach, 3 destinations, no router | Proposed |
| D6 | Quick Add = one Dialog (bottom sheet on phones) with a 3-way type switch | Fewest steps; one component for add and edit | Proposed |
| D7 | Native selects/date; no custom Select | ADR-015; best mobile behaviour | Proposed |
| D8 | Rejected UI UX Pro Max's generated "Glassmorphism, dark, Caveat/Quicksand" recommendation | Contradicts the brief (no glass, light baseline, not handwritten) | Recorded |
| D9 | Manrope, self-hosted | Taste Skill's dealt face; ₱, minus and tabular figures verified in Chromium | **Verified and decided** (owner: self-host if verified) |
| D10 | Category chosen from a **tap-to-select chip grid**, not a select | Faster on a phone (no picker); still native radios; 6 expense / 3 income categories fit | Proposed (Impeccable review) |
| D11 | Remember last account and last *Pay from* for the visit; **not** the category | Fewer taps without risking a wrongly pre-selected category | Proposed |
| D12 | "Paying a card bill? Use Pay card" hint under the Expense switch | Prevents the likeliest beginner double-count | Proposed |
| D13 | Pay card: **Pay full** button, before/after estimate, below-zero warning; confirmation states the card's new owed figure and that payments don't change net position | The most money-sensitive moment should teach the rule before and after saving | Proposed — preview/warning depend on Q4 |
| D15 | Net position is a flat deep-cobalt hero card with an inline `Money you have − Card debt` equation | Gives the product one focal point; replaces the pale equation strip (the critique found the strip text-only) | Proposed |
| D16 | Active navigation item = soft-blue pill everywhere (bottom bar, rail, sidebar) | One selected-state language; colour only on a small selected mark | Proposed |
| D14 | No custom numeric keypad or quick-amount chips | Native decimal keyboard keeps paste, accessibility and less code; revisit after real use | Recorded |

## Owner decisions recorded (after the independent browser review)

| Decision | Outcome |
|---|---|
| Label **"Net position"** with its supporting sentence and equation | Kept |
| Browser arithmetic for **display-only** payment previews and warnings | Approved; the backend stays the only source of saved figures and totals |
| Category as explicit chips, **never auto-remembered** (last account and last *Pay from* are remembered) | Approved |
| Amount-first Quick Add; distinct **Pay card** workflow; the current three-page navigation | Preserved |
| Fonts | Self-host Manrope **if** ₱ and tabular figures work — they do (above) |
| Numbering | Work stays under Roadmap Milestone 3 |
| No extra frameworks or UI features | Confirmed |

Remaining open items are in [`DESIGN_REVIEW.md`](docs/design/DESIGN_REVIEW.md#open-decisions-for-the-owner).
