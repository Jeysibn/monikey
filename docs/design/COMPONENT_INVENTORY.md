# MoniKey Component Inventory

**Status: APPROVED by the owner; mock-backed frontend implemented through Milestone 4.9.** This inventory describes the React pieces for the three views and v1 entry flows. Visual rules: [`DESIGN.md`](../../DESIGN.md). Behavior: [`UI_UX_SPEC.md`](UI_UX_SPEC.md). See the current implementation summary below and the [Milestone 4.9 report](FRONTEND_STATES_4_9.md).

**Rule of thumb for an entry-level developer:** a component exists only if it is used in at least two places *or* it hides a tricky accessibility detail. Everything else stays inline in the view.

---

## Current status after Milestone 4.9

Milestone 4.3 ([`FRONTEND_ACCOUNTS_4_3.md`](FRONTEND_ACCOUNTS_4_3.md)) added `AccountRow` and `AccountsView`. Milestones 4.4–4.9 added Activity, entry flows, responsive refinements, the data-source seam, and resilient resource states. The inventory below describes the current frontend:

**Added after 4.9 (API plan S3):** `httpSource.ts` implements the `DataSource` over relative `/api` requests; `wire.ts` validates API payloads and maps exact decimal strings and snake_case fields into the existing view models. `App.tsx` selects mock or HTTP at build time, and Vite proxies `/api` locally. These modules are covered by the synthetic contract tests in `frontend/tests/httpSource.test.ts` and `frontend/tests/wire.test.ts`. The API route was exercised through Vite and Nginx with synthetic data; the interactive browser journey awaits owner review. See [M8–M9 integration evidence](MILESTONE_8_9_INTEGRATION.md).

**Changed in 4.9 (loading, error and slow states):** new `ErrorBlock` (a failed block: one sentence, "Last updated 09:14" when known, Retry) and `UpdatingStamp`; `useResource` now offers `retry()` and `updatedAt`; `useDelayedFlag`; `lib/apiErrors.ts` (write errors in the spec's words, `WriteError`, the "Last updated" text); `lib/time.ts`; the add-transaction boolean became `AddState` (`ready`, `loading`, `no-accounts`) in `PageHeader`, `AppShell` and the views; forms show a refused field and a slow-save notice. **Changed in 4.8 (the data-source seam):** views and forms take a `LedgerSnapshot` (and the Activity/Overview/Accounts views take the figures the source reported) instead of raw mock rows; new non-visual modules `dataSource.ts`, `mockSource.ts`, `useResource.ts`, `lib/snapshot.ts`, `lib/entryText.ts` (the confirmation and delete texts moved out of `lib/ledger.ts`, which is now the mock's reducer only). **Changed in 4.7 (accessibility and responsive pass):** `MoneyText` shrinks very long amounts and has a `wrap` option; `TransactionItem` and `AccountRow` are wrapping rows (the amount drops under the text only when space runs out); `SegmentedControl` stacks at large text sizes; dialog footers wrap; all fixed `px` font sizes are now `rem`. **Added in 4.6:** `AccountForm`, `AddAccountDialog`, `MoneyInput` (now also used by the Quick Add amount); pure rules in `lib/accountForm.ts`. `SegmentedControl` drops its check mark at four options (too narrow at 360px). The stand-in dialog in `App` was removed. **Added in 4.5a:** `TransactionForm` (add and edit mode), `QuickAddDialog` (also hosts the delete confirmation), `DeleteConfirm`, `SegmentedControl`, `FormField`, `InlineNotice`, `StatusMessage`; pure rules in `lib/entryForm.ts` and the reducer in `lib/ledger.ts`. The dialog close button is now 44px. Built so far: the five shadcn components, plus the custom components `AppShell` (with its nav parts and `BrandMark` inside), `PageHeader`, `MonthSelect`, `MoneyText`, `EmptyState`, `TransactionItem`, `CreditCardSummary` and `AccountRow`, and three views (`OverviewView`, `AccountsView`, `ActivityView`; the Activity stand-in `PlaceholderView` was removed in 4.4). `TransactionItem` now also has an Activity mode (Edit and Delete icon buttons from 768px, whole-row Edit button on phones). The hero, *This month* and the loading bars stayed **inside `OverviewView`** because each is used once. **Not built yet:** `SummaryCard` (not needed — the hero and rows are inline), `SkeletonValue` (`ConfirmDeleteDialog` became `DeleteConfirm` in 4.5b) (loading uses a 6-line `Bar` helper in `OverviewView`; promote it only if a second view needs it). Money formatting is `lib/money.ts`; accounting is `lib/finance.ts`.

---

## 1. shadcn/ui source components (the five approved by ADR-015 — no others)

| Component | Used for | Notes |
|---|---|---|
| `Button` | Every button | Variants used: `default` (= primary, cobalt), `secondary`, `ghost` (row icon buttons, text actions), `destructive` (Delete confirm). Sizes: default 44px high; `icon` 36px. Add `aria-label` to every icon-only button. |
| `Card` (`Card`, `CardHeader`, `CardTitle`, `CardContent`) | Position card, This month, Credit cards, Recent activity, Money you have, each credit-card summary | Radius 20, 1px border, no shadow. |
| `Input` | Amount, Note, Name, money fields | **48px** high, radius 12, `input` border token (#858B92). *(The first draft said 44px / radius 10; the approved mock and the built component use 48 / 12.)* Amount uses `type="text"` + `inputMode="decimal"` (not `type="number"`: avoids spinner/scroll-wheel edits). |
| `Label` | Every field | Always visible, above the field. Never replaced by placeholder text. |
| `Dialog` (+ `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`) | Quick Add, Edit, Add account, Delete confirm | Radix-based (focus trap, Esc, focus restore). **Customised by classes** to be a bottom sheet below 768px (see §4). |

**Reviewed at Milestone 4.1 (outcome in [`FRONTEND_SCAFFOLD_4_1.md`](FRONTEND_SCAFFOLD_4_1.md)): the CLI added `shadcn`, `tw-animate-css`, a font package and the unified `radix-ui`; the first three were removed and `radix-ui` replaced by three `@radix-ui/react-*` packages; the Dialog animations were stripped. What the checklist said to review:**
- the generated `Dialog` ships open/close animation classes (and may add an animation helper dependency). Our rule is "no animation system": strip zoom/slide effects, keep at most a 150ms fade, respect `prefers-reduced-motion`.
- list every package the CLI adds to `package.json` and every file it writes; commit `components.json`.
- map shadcn's token names to ours (table in §6).

## 2. Native HTML (no component)

| Element | Used for |
|---|---|
| `<select>` | Month, Account filter, Account, Category, Pay from, Pay card — with `<optgroup>` for *Cash & bank / E-wallet / Credit cards*. Native gives the best phone pickers and free accessibility. |
| `<input type="date">` | Transaction date. Value is a local `YYYY-MM-DD` string; never converted through UTC. |
| `<input type="radio">` | The segmented type switch (visually restyled; real radios inside a `<fieldset><legend>`). |
| `<nav>`, `<main>`, `<h1>` | Landmarks and page title. |

## 3. Custom components (15)

Each is small and has one job. File names are proposals; folder layout in §5.

| # | Component | Job | Props (informal) | Used by | shadcn inside |
|---|---|---|---|---|---|
| 1 | `AppShell` | Page frame: sidebar/rail (≥768) or bottom bar (<768), main area, status-message slot. Contains `SideNav` and `BottomNav` as private parts. | `view`, `onNavigate(view)`, `onAdd()`, `status`, `children` | `App` | `Button` (Add) |
| 2 | `PageHeader` | h1 + optional muted subline + actions slot. Moves focus to h1 on view change. | `title`, `subline?`, `children` (actions) | 3 views | — |
| 3 | `SummaryCard` | A labelled headline sum: label, `MoneyText`, optional caption. Used for the position card parts and the month's income / expenses. | `label`, `amount`, `kind`, `size: 'hero' \| 'figure'`, `caption?` | Overview | `Card` |
| 4 | `AccountRow` *(the prompt's "AccountCard")* | One cash/bank/e-wallet account as a row: name, type text, balance. | `account` | Accounts | — (inside a `Card`) |
| 5 | `CreditCardSummary` | One credit card: name, "Owed" chip, owed amount, limit track, available credit, **Pay card** button. | `card`, `compact?`, `onPay(cardId)` | Overview, Accounts | `Card`, `Button` |
| 6 | `TransactionItem` | One Activity row for an expense, income or card payment. | `item: ActivityItem`, `showActions`, `onOpen`, `onEdit`, `onDelete` | Overview (preview), Activity | `Button` (ghost icon) |
| 7 | `TransactionForm` | Add/Edit for expense, income and card payment; validation, error summary, saving state. | `mode: 'add' \| 'edit'`, `initial?`, `accounts`, `categories`, `onSubmit(values): Promise<void>`, `onCancel`, `onDelete?` | `Dialog` | `Input`, `Label`, `Button` |
| 8 | `AccountForm` | Add account (cash/bank/e-wallet/card). | `onSubmit`, `onCancel` | `Dialog` | `Input`, `Label`, `Button` |
| 9 | `SegmentedControl` | 2–4 mutually exclusive options (type switch); the same native-radio component also renders as a wrapping **chip grid** for categories. | `legend`, `name`, `options`, `value`, `onChange`, `disabled?` | both forms | — |
| 10 | `FormField` | Wires label, hint, error and `aria-describedby` / `aria-invalid` for one control. | `id`, `label`, `hint?`, `error?`, `children` | both forms | `Label` |
| 11 | `MoneyText` | **The only place money is formatted.** Takes a decimal string; renders `₱`, separators, two decimals, sign, tabular figures, colour by kind, hidden screen-reader word. | `amount: string`, `kind: 'income' \| 'expense' \| 'payment' \| 'debt' \| 'neutral'`, `size?` | everywhere | — |
| 12 | `EmptyState` | Frame-keeping empty block: one sentence + optional action. Dashed variant for empty account slots. | `message`, `action?`, `dashed?` | all views | `Button` |
| 13 | `InlineNotice` | Error / warning / success / info message with icon and text. `role="alert"` for errors, `role="status"` otherwise. Optional action (Retry, Clear filters). | `tone`, `children`, `action?` | views, forms | `Button` (text) |
| 14 | `ConfirmDeleteDialog` | The delete confirmation content (title, entry summary, effect sentence, Cancel/Delete). Can show standalone in a `Dialog` or as the second view inside the edit sheet. | `item`, `onConfirm(): Promise<void>`, `onCancel` | Activity | `Dialog`, `Button` |
| 15 | `SkeletonValue` | Flat grey bar at an amount's or row's real size for loading. | `width`, `height` | all views | — |

Not separate components (kept inline to avoid wrapper layers): the limit track (inside `CreditCardSummary`), the equation inside the hero card (in the Overview view), the date-group heading (inside Activity), month and account selects (a `FormField` or plain `<select>` in the view).

**Why `FormField` and `SegmentedControl` exist even though ADR-015 warns against wrappers:** both fix repeated accessibility wiring that is easy to get wrong six times in two forms; neither wraps a shadcn component's behaviour. Revisit if they grow beyond ~40 lines.

### Explicitly not added
shadcn `Select`, `Sheet`, `Tabs`, `Toast`/Sonner, `Tooltip`, `Skeleton`, `Field`, `Form`; React Router; any form, state or data-fetching library; chart library; animation library; icon pack other than `lucide-react`.

(UI UX Pro Max's shadcn stack search recommended the newer shadcn `Field` component; it is outside the five approved components, so `FormField` above covers the same need locally. Using `Field` would be a documented exception to ADR-015.)

## 4. How the Dialog becomes a phone sheet (design intent, not code)

One `DialogContent`, responsive classes only:

- below 768px: pinned to the bottom, full width, `max-height` 92% of the dynamic viewport, top corners radius 20, body scrolls, footer (Save / Cancel) stays visible;
- from 768px: centred, 480px wide, radius 20.

No second Sheet component. If real-device testing (Milestone 5) shows keyboard or scroll-lock problems on iOS Safari, record the finding and decide then — adding shadcn `Sheet` would need owner approval.

## 5. Proposed file layout (small and flat)

```
frontend/src/
├── main.tsx
├── App.tsx                 selected view, selected month, dialog state, refresh counter
├── index.css               @import "tailwindcss"; tokens from DESIGN.md
├── types.ts                AccountType, Account, Category, Transaction, CardPayment, ActivityItem, Summary
├── mockData.ts             fictional data from UI_UX_SPEC §2 (typed; money as strings)
├── dataSource.ts           shared typed read/write boundary
├── mockSource.ts           fictional demo implementation
├── httpSource.ts           same-origin fetch implementation (Milestone 8)
├── wire.ts                 API contract validation and decimal-string mapping
├── lib/
│   ├── money.ts            parse/validate an amount string; integer-centavo helpers for display-only checks
│   └── dates.ts            todayLocal(), formatDate(), monthOptions()
├── views/
│   ├── OverviewView.tsx
│   ├── ActivityView.tsx
│   └── AccountsView.tsx
└── components/
    ├── ui/                 shadcn source: button, card, input, label, dialog
    └── AppShell.tsx, PageHeader.tsx, SummaryCard.tsx, AccountRow.tsx, CreditCardSummary.tsx,
        TransactionItem.tsx, TransactionForm.tsx, AccountForm.tsx, SegmentedControl.tsx,
        FormField.tsx, MoneyText.tsx, EmptyState.tsx, InlineNotice.tsx,
        ConfirmDeleteDialog.tsx, SkeletonValue.tsx
```

State stays local: `useState` in `App` for view, month, open dialog (`null | {kind, mode, id?, presetCard?}`) and a `refreshKey` that views include in their fetch effect dependencies. No context, no store. Each view's fetch effect cleans up with an `AbortController` (TLD §4) so a slow earlier response can never overwrite a newer one. `SkeletonValue` stays only while it is reused by at least two views; otherwise inline a `div`.

## 6. Token mapping (semantic name → shadcn variable → Tailwind class)

| DESIGN.md token | shadcn variable | Tailwind utility (v4) |
|---|---|---|
| `background` | `--background` | `bg-background` |
| `text` | `--foreground` | `text-foreground` |
| `surface` | `--card` | `bg-card` |
| `text-muted` | `--muted-foreground` | `text-muted-foreground` |
| `secondary` / `secondary-foreground` | `--secondary` / `--secondary-foreground` | `bg-secondary text-secondary-foreground` |
| `primary` / `primary-foreground` | `--primary` / `--primary-foreground` | `bg-primary text-primary-foreground` |
| `border` | `--border` | `border-border` |
| `border-control` | `--input` | `border-input` |
| `ring` | `--ring` | `ring-ring` |
| `error` | `--destructive` | `bg-destructive` / `text-destructive` |
| `income`, `debt`, `success`, `warning-*`, `*-soft`, `*-ink`, `surface-raised` | **added** custom vars | `text-income`, `text-debt`, `bg-debt-soft`, … via `@theme inline` |

One token source: shadcn's generated block in `src/index.css`, edited to our values; custom tokens are appended to the same block, never a second file.

## 7. Lucide icons (confirm names against the installed version)

`House`, `List`, `Wallet`, `Plus`, `Banknote`, `Landmark`, `Smartphone`, `CreditCard`, `Pencil`, `Trash2`, `ArrowDownLeft`, `ArrowUpRight`, `ArrowRightLeft`, `CircleCheck`, `CircleAlert`, `TriangleAlert`, `Info`, `LoaderCircle`, `RotateCw`, `X`. `lucide-react` is installed (`frontend/package.json`). Names imported by the built components: `House`, `List`, `Wallet`, `Plus`, `Banknote`, `Landmark`, `Smartphone`, `CreditCard`, `TriangleAlert`, `ArrowDownLeft`, `ArrowUpRight`, `ArrowRightLeft` (plus `X`, as `XIcon`, in the Dialog). Still **planned and unchecked** — confirm each exists in the installed version when first used: `Pencil`, `Trash2`, `CircleCheck`, `CircleAlert`, `Info`, `LoaderCircle`, `RotateCw`.

## 8. Understanding map (what an entry-level developer learns from each)

| Piece | Concept it teaches |
|---|---|
| `MoneyText`, `types.ts` | `type` / union types; why money is a string |
| `TransactionItem`, `AccountRow` | Props, lists with `key`, conditional rendering |
| `SegmentedControl`, `FormField` | Controlled inputs, label/`id`, ARIA wiring |
| `TransactionForm` | `useState` form state, validation, async submit, error handling |
| `App.tsx` | Lifting state up, a refresh counter instead of a global store |
| shadcn `Dialog`, `Button` | Reading vendored source, Radix focus trapping |
| `index.css` tokens | Tailwind v4 `@theme`, CSS variables |
