# MoniKey UI/UX Modernization — Baseline Audit and Delivery Plan

**Status:** Draft for owner review. This records the current source at `origin/main` `3f8a6d0466d34aee0dd65d864f146df5f4232015` and the implementation plan for the separate Dashboard and persistent category icons.

## Repository baseline

- PR #24 is merged. Its changes are included in the base SHA above.
- PR #25 remains open and Draft at `245d8a875341d9fb8ba96dcae216953a4f6af993`. This worktree starts from `main`; it does not use or copy from that branch.
- PR #18 and PR #13 remain open. Neither supplies a dependency for this initiative.
- The source schema ends at migration 007. `categories` has lifecycle and Kakeibo-default metadata, but no icon field.
- The source is a local React/TypeScript/Vite app with five view-state screens. Overview is already the default. It uses a typed `DataSource` seam and fictional mock ledger for local UI.
- The TLD currently lists complex analytics out of scope. The user’s explicit Dashboard request supersedes that scope for this initiative; the analytics contract and calculations will be recorded as a proposed ADR for review.
- The app version remains 1.2.0. No release, deployment, or production schema state is inferred from this repository audit.

## Current UI evidence

All captures in [`screenshots/ui-modernization/baseline/`](screenshots/ui-modernization/baseline/) were taken from the actual React app served from the clean `main` worktree using its deterministic fictional mock data. They contain no production records. Page captures are at 390px and 1440px; Overview was additionally checked at 320, 768, and 1024px. Loading, offline, no-account, no-plan, Quick Add, and Add Account states are included.

The browser measured no document-level horizontal overflow at 320, 390, 768, 1024, or 1440px for the five existing views. That does not mean every control fits: the six-column mobile bar clips navigation labels at 320px and clips “Categories” at 390px.

## Screen-by-screen audit

| Screen | Observed problem | Evidence | Recommended improvement | Priority |
|---|---|---|---|---|
| Overview | Good current-position hierarchy, but no separate route/view for historical analysis. Avoid adding charts to this screen. | `OverviewView.tsx`; `overview-mobile.png`, `overview-desktop.png` | Keep Overview as Home; add a compact link to the new Dashboard after its analytics contract exists. Keep current summary and recent-activity components. | High |
| Navigation | Six equal bottom-bar controls (five views plus Add) are only 49px wide at 320px. “Overview,” “Accounts,” and “Categories” text clips at 320px; “Categories” clips at 390px. | `AppShell.tsx`; `overview-320.png`; 320px browser measurements | Use Overview, Activity, Add, and More in the mobile bar. Put Dashboard, Accounts, Kakeibo, and Categories in an accessible More dialog. Desktop and tablet keep direct destinations. | High |
| Accounts | Existing wallet gallery, summary, and card actions are clear; no evidence supports replacing the wallet cards or changing account behavior. | `AccountsView.tsx`; `accounts-mobile.png`, `accounts-desktop.png` | Preserve cards and actions; apply the shared spacing and type rules only where the component audit finds a mismatch. | Low |
| Activity | Current date grouping and amount alignment are readable. Filtering is limited to month and account; there is no text search. | `ActivityView.tsx`; `activity-mobile.png`, `activity-desktop.png` | Preserve rows and date grouping. Add a concise search control with a clear/reset action when implementing cross-screen polish; do not derive money totals from the paginated list. | Medium |
| Categories | The create form stays inline above the list and occupies most of the first mobile viewport. A zero-row list always says “No categories match these filters,” even when the collection is genuinely empty. | `CategoriesView.tsx`; `categories-mobile.png`, `categories-320.png` | Move create/edit into the existing accessible dialog pattern; distinguish empty collection from filtered no-results. Add the searchable icon picker in the same form. | High |
| Kakeibo | The page is intentionally detailed and vertically long; its budget report already comes from a server-calculated endpoint. | `KakeiboView.tsx`; `kakeibo-mobile.png`, `kakeibo-desktop.png` | Preserve the four-envelope view and report source. Add no duplicate budget math here; link to Dashboard analysis only when it is useful. | Medium |
| Quick Add | The existing bottom-sheet form retains primary actions and separates entry types; there is no category icon yet. | `QuickAddDialog.tsx`; `quick-add-mobile.png`, `quick-add-desktop.png` | Keep the flow. Show each category’s optional icon beside its always-visible name after the icon contract lands. | Medium |
| Add/edit dialogs | Add Account is a mobile bottom sheet with visible cancel/save actions. Category entry is not yet dialog-based. | `account-dialog-mobile.png`, `category-create-mobile.png` | Preserve account dialogs. Use the same dialog primitive for category create/edit and test 320px viewport scrolling and focus restoration. | Medium |
| Loading / empty / error | Existing loading skeletons, offline retry messaging, empty account, and Kakeibo no-plan states are present. | `overview-loading-mobile.png`, `overview-error-mobile.png`, `overview-empty-accounts-mobile.png`, `accounts-empty-mobile.png`, `kakeibo-no-plan-mobile.png` | Preserve semantic distinctions and retry behavior. Dashboard needs matching explicit loading, error, no-data, and no-plan states. | High |

## Information architecture

Overview remains the default home and answers the current-position and recent-activity questions. Dashboard is a separate analytics view and answers trends, category spending, period comparisons, and Kakeibo adherence.

| Viewport | Primary navigation | Secondary destinations |
|---|---|---|
| Phone (<768px), current screens | Overview, Activity, Accounts, More, Add | More opens Kakeibo and Categories with full labels and active-page indication. |
| Phone after Dashboard ships | Overview, Dashboard, Activity, Add, More | More opens Accounts, Kakeibo, and Categories. This gives Dashboard a primary slot without overcrowding the bar. |
| Tablet (768–1023px) | Icon-and-label rail for all current destinations | Dashboard joins the rail when its view ships; Add transaction remains in the page header. |
| Desktop (>=1024px) | Sidebar for all current destinations | Dashboard joins the sidebar when its view ships; Add transaction remains in the page header. |

Navigation stays in the existing local React view state; no router or navigation dependency is proposed. More will use the existing Dialog primitive for focus management and keyboard dismissal.

## Design direction

- Keep the approved light theme and existing semantic tokens in `frontend/src/index.css`; do not replace the palette with the illustrative colors from the request.
- Keep self-hosted Manrope, current title/section/metadata scale, flat white cards, 1px borders, and 20px card radius. Use tabular numerals for analytics values where that improves column scanning.
- Keep the navy net-position surface and cobalt primary action. Income, expense, and debt continue to use text labels/signs as well as color.
- Icons are small Lucide line icons beside names, never colored tiles or name replacements. Charts use restrained colors, no gradients, no decorative animation, and always provide readable text/data values.
- Reuse `PageHeader`, `Card`, `MoneyText`, `EmptyState`, `ErrorBlock`, `MonthSelect`, `Dialog`, and the existing semantic tokens. Avoid a competing design system or new chart library unless the SVG implementation proves insufficient.

## Component reuse plan

- `AppShell` keeps local view-state navigation and focus-to-heading behavior; extend its existing destinations and add the responsive More dialog.
- Reuse `Card`, `Button`, `Input`, `Label`, and `Dialog`; use native selects for date, account, and category filters unless a specific usability test justifies otherwise.
- Add one typed, centralized category-icon registry and one icon-picker component; category list, Quick Add, Activity, and Dashboard all read the same `iconKey` with a safe fallback.
- Build compact analytics components from SVG and HTML: summary tiles, grouped monthly bars, monthly spending trend, category bars, and envelope comparisons. All charts include an accessible title, legend, and textual values/table.
- Add one API response type and one source method for analytics rather than loading the Activity page cap and summing it in the browser.

## Backend and financial impact

The existing API returns account summaries, paginated transactions, and Kakeibo reports. It has no category-spend or bounded-range analytics endpoint. A Dashboard must not sum the `limit=1001` Activity response or JavaScript floating-point amounts.

The proposed analytics endpoint will aggregate `transactions.amount NUMERIC(12,2)` on the server and return decimal strings. It will use date-only boundaries with an explicit inclusive user-facing end date converted to an exclusive SQL upper bound. Income and expenses come from transaction category type. Credit-card payments and account transfers are excluded from income/expense and cash-flow series. Kakeibo actuals use the stored transaction `kakeibo_envelope`; category defaults are only suggestions and do not reclassify past records. No historical account balance or net-worth series will be shown because the app has current positions and opening amounts, not a validated historical balance snapshot model.

Category icons are optional presentation metadata. Proposed storage is nullable `categories.icon_key` on migration 008, with a backend allowlist of stable icon keys and the same allowlist mirrored in TypeScript. Missing and unknown values fall back to the default category icon. Migration and API changes must preserve IDs, types, archive state, default envelopes, transaction references, amounts, and Kakeibo classifications. A category rename already changes the joined current label for historical records; icons do not alter record identity or ledger values.

## Proposed financial definitions for review

- **Income:** sum of income-category transactions in the selected date range/account filter.
- **Expenses:** sum of expense-category transactions in the selected date range/account filter. This includes categorized card purchases exactly once.
- **Net cash flow:** income minus expenses in the selected range. This is not account-balance growth.
- **Category spending:** expense transaction totals grouped by stable category ID; include archived category IDs and a visible “Uncategorized” bucket only if the schema permits an absent category (current transactions require a category ID, so no synthetic bucket is expected).
- **Envelope actuals:** expense amounts grouped by the stored transaction envelope; categories’ current defaults are not consulted.
- **Planned versus actual:** include only months whose persisted plan is explicitly saved; if no saved plan exists in the range, show “No saved Kakeibo plan” instead of inventing a target.
- **Period comparison:** compare complete selected ranges when both ranges have data and equal calendar-day counts; partial current periods compare only the same elapsed day span. Suppress percentage change when the prior value is zero and show the raw values instead.

These definitions will be captured in a proposed ADR and API contract before analytics code is considered complete.

## PR dependency plan

| PR | Base / dependency | Scope |
|---|---|---|
| A — UI foundation and navigation | `main` | Baseline audit, responsive More navigation, shared component consistency and documented IA. Frontend only. |
| B — Persistent category icons | A | Proposed ADR; migration 008; strict API contracts; searchable accessible picker; category, Quick Add, and Activity icon display; backward-compatible tests. |
| C — Analytics Dashboard | B | Proposed analytics ADR/API; server aggregations; date/account filters; charts and Kakeibo analysis; Dashboard as separate view; Overview link. |
| D — Cross-screen polish | C | Evidence-based Overview, Accounts, Activity, Categories, Kakeibo and dialog refinements; final viewport/accessibility pass. |

All PRs will be Draft and remain unmerged. No PR depends on PR #25. Production deployment, release tags, and production migrations are outside this mission.

## Phase A implemented change

The current phone bar has been changed to Overview, Activity, Accounts, More, and Add. Kakeibo and Categories are reachable through a focus-managed More dialog. Selecting a destination moves focus to its heading; Escape restores focus to More. Playwright checks verify targets and overflow at 320px and 390px. Rendered evidence is in [`screenshots/ui-modernization/phase-a/`](screenshots/ui-modernization/phase-a/).
