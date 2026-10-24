# Milestone 4.1 — Frontend scaffold and design-system setup

**Status: complete and verified; awaiting review.** Scope: React + TypeScript + Vite scaffold, Tailwind CSS v4, the five approved shadcn/ui components, Lucide, self-hosted Manrope, and the approved design tokens. **No product screens** (Overview, Activity, Accounts and Quick Add start in 4.2+). No backend, database, CI/CD, Kubernetes or GitOps files were touched. Nothing was committed or pushed.

> **Update (Milestone 4.2):** the check page in `App.tsx` and `scripts/verify-design-system.cjs` were retired when `App.tsx` became the real application. The design-system checks (fonts, tokens, dialog, contrast) now run through the real UI in `scripts/verify-overview.cjs` (see [`FRONTEND_OVERVIEW_4_2.md`](FRONTEND_OVERVIEW_4_2.md)). The 74-check result below is the historical record for Milestone 4.1.

Related: [`DESIGN.md`](../../DESIGN.md) · [`COMPONENT_INVENTORY.md`](COMPONENT_INVENTORY.md) · [`VERIFICATION.md`](VERIFICATION.md) (design-mock tests) · ADR-015

---

## 1. What changed

| Area | Change |
|---|---|
| Tailwind v4 | `tailwindcss` + `@tailwindcss/vite`; `src/index.css` starts with `@import "tailwindcss" source("../src")` (scan `src/` only, so scripts and docs never add unused CSS). No v3 `@tailwind` directives, no config file. |
| Alias | `@/*` → `src/*` in `vite.config.ts`, `tsconfig.json` (read by the shadcn CLI) and `tsconfig.app.json` (used by the compiler). |
| shadcn/ui | `components.json` (style `radix-vega`, Lucide, CSS variables) and **only** `button`, `card`, `input`, `label`, `dialog` in `src/components/ui/`, restyled to the approved spec (see §3). |
| Design tokens | All DESIGN.md tokens in `src/index.css`: shadcn's variable names with MoniKey values plus MoniKey additions (income, debt, hero …), mapped to Tailwind utilities (`bg-primary`, `text-debt`, `rounded-card`, `shadow-float` …) with `@theme inline`. Light theme only. |
| Font | Manrope **self-hosted** from `public/fonts/` (latin + latin-ext WOFF2, 40 KB total, OFL licence beside them); system fallback stack kept. No CDN. |
| Icons | `lucide-react`, imported by name. |
| Starter removal | Deleted `App.css`, `src/assets/*`, `public/icons.svg`; replaced `favicon.svg` with the key-and-coin mark; set title, description and theme colour in `index.html`. |
| Lint | `oxlint` override: `react/only-export-components` off for `src/components/ui/**` (shadcn exports variant helpers beside components). |
| Placeholder page | `src/App.tsx` is a **design-system check page** (tokens, money typography, buttons, a form field, a dialog). It is not a product screen and is replaced in 4.2. |
| Verification | `frontend/scripts/verify-design-system.cjs` (74 browser checks, §5). |

## 2. Dependencies (every one reviewed)

`package.json` runtime dependencies after this milestone — **75 packages in the whole tree, `npm audit`: 0 vulnerabilities**:

| Package | Why | Licence |
|---|---|---|
| `react`, `react-dom` | App framework (already in the starter) | MIT |
| `tailwindcss`, `@tailwindcss/vite` | Tailwind v4 via the official Vite plugin (ADR-015) | MIT |
| `lucide-react` | Icons, imported by name (ADR-015) | ISC |
| `@radix-ui/react-dialog`, `@radix-ui/react-label`, `@radix-ui/react-slot` | The three Radix primitives that Dialog, Label and Button actually use (focus trap, Escape, focus restore, `asChild`) | MIT |
| `class-variance-authority` | Button variants (`cva`) | Apache-2.0 |
| `cn` | `cn()` class merger written by the shadcn/ui team (replaces `clsx` + `tailwind-merge`) | MIT |

### What the shadcn CLI added that was **removed**, and why

The current shadcn CLI (v4.22) generated more than ADR-015 anticipated. Tried first in a throw-away copy outside the repo, then applied here:

| Added by the CLI | Decision | Reason |
|---|---|---|
| `shadcn` (as a *runtime* dependency, only for `@import "shadcn/tailwind.css"`) | **Removed** | Took the tree from 46 to **417** packages for a CSS import. Not needed. |
| `tw-animate-css` | **Removed** | DESIGN.md: motion is feedback only; no animation library. Dialog now has no enter/exit animation. |
| `@fontsource-variable/inter` | **Removed** | The approved typeface is self-hosted Manrope; no second font. |
| `radix-ui` (unified bundle, ≈1.1 MB) | **Replaced** by the three `@radix-ui/react-*` packages above | Same code the components import; much smaller install. |
| `"use client"` directives, `backdrop-blur`, zoom/fade animation, `dark:` variants, `CardAction`, `outline`/`xs`/`icon-xs…` variants | **Removed** | Not in the design: glass is banned, dark mode is deferred, variants the spec doesn't name add decisions nobody made. |

**Maintenance note:** `components.json` is kept so `shadcn add` still works, but the CLI may try to re-add `radix-ui` / `shadcn`. Review `package.json` and `src/index.css` after any future `shadcn add` (ADR-015 already requires an isolated, reviewed change per component).

## 3. How the five components follow the approved design

| Component | Spec implemented |
|---|---|
| `Button` | Variants `default` (primary), `secondary`, `ghost`, `destructive` (error fill, white text), `link`; sizes `default`/`sm` 44px, `icon` 36px; disabled uses `disabled-bg`/`disabled-fg` (4.9:1), no opacity, `not-allowed`; hover colour change only (150 ms, off for reduced motion); no press animation. |
| `Card` | White surface, 1px `border`, radius 20, **no shadow or ring**; padding 20 → 24 from 768px; `CardTitle` 18 → 20px, 600. |
| `Input` | 48px, 16px text (no iOS zoom), radius 12, border `input` (#858B92, ≥3:1), `aria-invalid` → error border + ring, disabled readable. |
| `Label` | 14px / 600, always visible above the field. |
| `Dialog` | **Bottom sheet on phones** (full width, flush bottom, ≤92dvh, top radius 24), **centred 500px from 768px** (radius 24); flat 45 % ink overlay, no blur; float shadow only here; Radix focus trap, Escape, focus return; `DialogHeader` / `DialogBody` (scrolls) / `DialogFooter` (sticky, safe-area padding); close button has an accessible name. |

### Reconciliation recorded
The first DESIGN.md draft said control radius 10 and dialog radius 20; the mock the owner approved used **12** and **24**, so DESIGN.md was updated to match (also `border` `#E4E7EB`, `rule` `#EEF0F2`). The code follows the approved mock.

## 4. Files created or changed (all under `frontend/` except docs)

```
frontend/
├── components.json                      shadcn config (style radix-vega, Lucide)
├── index.html                           title, description, theme colour, favicon
├── package.json / package-lock.json     see §2
├── tsconfig.json, tsconfig.app.json     "@/*" path alias
├── vite.config.ts                       react() + tailwindcss(), "@" alias
├── .oxlintrc.json                       override for src/components/ui/**
├── public/favicon.svg                   key-and-coin mark
├── public/fonts/                        Manrope latin + latin-ext WOFF2, OFL.txt
├── scripts/verify-design-system.cjs     browser verification (not part of the build)
└── src/
    ├── index.css                        tokens, @font-face, @theme inline, base layer
    ├── main.tsx                         (unchanged)
    ├── App.tsx                          design-system check page (placeholder)
    ├── lib/utils.ts                     export { cn } from "cn"  (generated)
    └── components/ui/                   button, card, dialog, input, label
```
Docs: `DESIGN.md` (implementation pointer, reconciled values), this file, `frontend/README.md`, root `README.md`.

## 5. Verification (actual results)

| Check | Result |
|---|---|
| Baseline: untouched Vite starter | `npm run build` passed, `npm run lint` clean |
| `npm ci` from the lockfile in an empty `node_modules` | passed; 75 packages; **0 vulnerabilities** |
| `npm run build` (`tsc -b && vite build`) | passed — CSS 17.81 kB (4.90 kB gzip), JS 299.77 kB (97.54 kB gzip) |
| `npm run lint` (oxlint) | clean, 0 warnings |
| `npm run dev` | serves `/`, `/src/main.tsx`, `/src/index.css` and `/fonts/*` with HTTP 200 |
| `npm audit` | 0 vulnerabilities |
| **Browser checks on the production build** (`node scripts/verify-design-system.cjs`, Chromium via `playwright-core`) | **74 of 74 passed**, run on the final build |

Breakdown of the 74 (Chrome-for-Testing, headless, Linux/WSL2):

| Group | Passed | Highlights (measured) |
|---|---|---|
| Font | 6/6 | Manrope loaded from `/fonts` (2 faces); ₱ and the true minus drawn by Manrope; digits equal width by default (686.00 = 686.00); fallback stack keeps the page usable with font files blocked |
| Tokens and component specs (rendered values) | 27/27 | page `#f3f5f7`, text `#1b1d1f`; swatch colours for primary, primary-soft, income, debt, error, warning, hero; card 20px / 1px `#e4e7eb` / no shadow; primary button 44px, radius 12, hover `#184fb0`; disabled 4.9:1 with no opacity; destructive 5.92:1; icon button 36×36; input 48px, 16px, border `#858b92` (3.44 / 3.15:1); invalid state sets `aria-invalid` and the error border; focus ring 2px solid `#1d5fd6`, 2px offset; no gradients, glass or resting shadows; hero white-on-navy 12.06:1 |
| Dialog at 375 / 768 / 1280 (10 each) | 30/30 | phone: full width, flush to the bottom, 24px top / 0 bottom radius; ≥768: 500px, centred, 24px radius; no animation, no backdrop blur, 45 % flat scrim; focus enters the dialog and Tab stays trapped; footer inside the viewport; title and Close have accessible names; Escape closes; focus returns to the opener |
| Layout 360 / 375 / 768 / 1280 | 8/8 | no horizontal overflow; h1 on one line |
| Motion and network | 3/3 | reduced motion turns the button transition off; **no request left the origin** (no CDN, no analytics); no console or page errors |

## 6. Not verified / limitations

- Only headless Chromium (desktop-emulated viewports) was used: no real iOS/Android phone, Firefox or WebKit, and no screen reader.
- The check page is a scaffold. **No product behaviour exists yet** (navigation, mock data, forms); product-level tests start with 4.2 and Roadmap Milestone 5.
- Contrast ratios for token pairs are measured from rendered colours on this page; pairs that appear only in future screens (e.g. debt on the hero) were computed in DESIGN.md, not re-measured.
- The JS bundle (97.5 kB gzip) has not been analysed for tree-shaking of Lucide; check when real screens exist.
- `shadcn add` behaviour with the pruned dependency set will be reviewed when a sixth component is ever proposed (none is planned).

## 7. How to run

```sh
cd frontend
npm ci            # exact install from the lockfile
npm run dev       # http://localhost:5173
npm run build && npm run lint
npx vite preview --port 4173 &   # then, in another shell:
node scripts/verify-design-system.cjs   # needs a local Chromium + playwright-core (see the script header)
```

## 8. Next (Milestone 4.2, after approval)
Types and typed mock data (`types.ts`, `mockData.ts`, `lib/money.ts`, `lib/dates.ts`), the app shell (`AppShell`, `PageHeader`, bottom bar / rail / sidebar), `MoneyText`, and the Overview view — built from the approved spec, one view at a time.
