# Review Brief for Codex — MoniKey UI/UX Design

**You are the independent reviewer. Read-only.** Do not edit any file, run installers, change the backend/database/CI/GitOps, or create commits. Report findings only. Claude Code owns these documents; the owner decides what to change.

**Historical:** this brief was written when the design was only a proposal and the frontend was the stock Vite starter. That review is complete and the design has since been approved by the owner. For the current review see `CODEX_REVIEW_BRIEF_4_2.md`.

## Read first (in this order)

1. `AGENTS.md`, `CLAUDE.md`
2. `docs/architecture/ADR.md` (ADR-002, 013, 015), `docs/architecture/TLD.md` §4–§6, `docs/architecture/ROADMAP.md`
3. `DESIGN.md`
4. `docs/design/UI_UX_SPEC.md`
5. `docs/design/COMPONENT_INVENTORY.md`
6. `docs/design/RESPONSIVE_GUIDELINES.md`
7. `docs/design/DESIGN_REVIEW.md` (what was and was not verified; open questions; skills actually used)

## Ground rules to hold the design to

- v1 scope: three views (Overview, Activity, Accounts) + Quick Add / Pay Card; **four tables**; no auth, budgets, recurring bills, investments, bank sync, charts, extra services.
- Card purchases are expenses; **card payments are not expenses** and reduce both a liquid balance and card debt. Available credit is not cash.
- Money is a decimal string; the server is authoritative; the browser must not produce authoritative totals.
- Approved frontend: React, TypeScript, Vite, Tailwind v4, **only** shadcn `button`, `card`, `input`, `label`, `dialog`, Lucide. Native `<select>`.

## What to evaluate

### 1. Architecture alignment
- Does every screen's data need map to an endpoint in TLD §6? (UI_UX_SPEC §13)
- Is anything in the design a hidden new feature, table, service or dependency?
- Does the single `TransactionForm` (expense / income / pay card, add + edit) conflict with Roadmap M4's separate "Quick Add" and "Pay Card"?
- Is "no router, three views in state, a `refreshKey` instead of a store" realistic for these flows?

### 2. Simplicity
- Is the 15-component list (COMPONENT_INVENTORY §3) larger than needed? Which would you delete or inline?
- Are `FormField` and `SegmentedControl` justified given ADR-015's warning about wrappers?
- Anything an entry-level developer would struggle to explain?

### 3. Maintainability
- One token source (shadcn's `index.css` block) with the mapping in COMPONENT_INVENTORY §6 — workable with Tailwind v4 `@theme inline`?
- Is the planned file layout (§5) too flat or too nested?
- Is `MoneyText` as "the only place money is formatted" a good boundary?

### 4. Accessibility
- Focus management (dialog open/close, view change → `h1`), error summary + inline errors, `aria-current`, live-region status messages, accessible names on icon-only buttons.
- Colour is never the only cue — check the sign/arrow/word rules for income, expense, debt, payment.
- Contrast table in `DESIGN.md` §B (computed, not browser-measured) and 44px touch targets, 36px desktop icon buttons.
- Bottom sheet built from `Dialog`: any focus-trap or scroll-lock pitfalls?

### 5. Missing UX states
- Loading, empty, error, first-run, zero, negative balance, card credit (overpayment), card over limit, long text, very large amounts, offline save, concurrent edit/delete, deleting a purchase after a payment (TLD edge cases).
- What did the spec forget?

### 6. Unnecessary dependencies
- Does the spec imply any package beyond Tailwind, `@tailwindcss/vite`, `lucide-react` and what `shadcn init` / `add` generate (e.g. animation helper, Radix)? List what the CLI would add, if you know.

### 7. Consistency with the approved stack
- Anything that fights ADR-013 (typed `fetch`, no data library) or ADR-005 (same-origin `/api`)?
- Fonts: self-hosted files vs. CDN — consistent with TLD's "no CSS CDN" and the private-network posture?

## Backend contract questions (you own these answers)

See `DESIGN_REVIEW.md` §5 B1–B7. In short: (B1) account filter for card payments; (B2) how the two lists merge under `limit`; (B3) a stable same-day ordering; (B4) the non-card balance field name; (B5) account-filtered totals (design omits them); (B6) note length cap; (B7) signed decimal strings for negative balances and card credit.

## Known gaps (do not re-report as discoveries)

- *(As of Codex's review)* no browser rendering or screenshots existed; contrast ratios and grid sums were computed by script. Since then the mock was rebuilt and tested in Chromium — see `VERIFICATION.md`.
- Manrope tabular figures / ₱ glyph and Lucide icon names are unverified.
- Colour-vision simulation not done; iOS Safari sheet behaviour not tested.
- Vercel Web Design Guidelines, Playwright and `break-ui` were not run; Awesome DESIGN.md was not consulted. Impeccable ran in a reduced, no-browser form (`DESIGN_REVIEW.md` §5b). Three of the five owner reference links could not be read (`REFERENCES.md` §1).

## How to report

A short list, most severe first. For each: **file + section**, what is wrong or missing, why it matters, and a concrete suggested change. Mark each *blocker / should-fix / nice-to-have*. Say plainly what you could not check. Do not paste secrets or real financial data (there is none; all figures are fictional).
