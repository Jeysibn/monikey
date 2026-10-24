# MoniKey v1.2 — Frontend Setup (Claude Code implementation checklist)

**Status:** Approved plan, not executed. **Scope:** `frontend/` only. **Stack:** React + TypeScript + Vite + Tailwind CSS v4 + selected shadcn/ui + Lucide React. Refer to `ADR.md` ADR-015 and `DESIGN.md` before choosing theme values.

## Step 0 — Design first

Approve three-page mobile-first wireframes (Overview, Activity, Accounts) plus Quick Add/Pay Card flows. Create `DESIGN.md` with accessible semantic color tokens, typography, 360px mobile behavior and common interaction states. **Do not install all shadcn components or generate a complete dashboard.**

## Step 1 — Vite scaffold

Run from the new application repository root (skip scaffold if `frontend/` already contains an approved scaffold):

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
```

Use a Node LTS release supported by the installed Vite version. Review the `package.json` scripts.

## Step 2 — Tailwind CSS v4 + Lucide

```bash
npm install tailwindcss @tailwindcss/vite
npm install lucide-react
```

In `vite.config.ts`, add `tailwindcss()` alongside `react()` in `plugins`, and **retain** the `/api` dev proxy when it is introduced. In `src/index.css`, start with:

```css
@import "tailwindcss";
```

Vite imports `src/index.css` through `src/main.tsx`. **Do not use v3-only** `@tailwind base`, `@tailwind components`, `@tailwind utilities` or `npx tailwindcss init -p`. Design theme configuration can live in the shadcn-generated CSS with semantic variables; avoid another theme source.

## Step 3 — shadcn/ui in the existing Vite project

Before the CLI, configure the `@/* → ./src/*` import alias in `tsconfig.json`, `tsconfig.app.json`, and `vite.config.ts` per the current shadcn/ui **Existing Project → Vite** documentation. shadcn's guide also shows installing `@types/node` and using `path.resolve` (or a functionally equivalent alias). Example:

```bash
npm install -D @types/node
npx shadcn@latest init
# Review generated src/index.css/theme changes, components.json and package-lock.json.
npx shadcn@latest add button card input label dialog
```

Run `git diff` and inspect every dependency/file the CLI added. Commit the selected source under `src/components/ui/` and shadcn `components.json`. Avoid `add --all`, templates, icon packs, CLI registries, extra form libraries, and additional animation packages. Use a native `<select>` for account/category until there is evidence a custom select is needed.

**Important:** The shadcn initializer may modify `src/index.css` and install dependencies. Preserve its generated styles; integrate the approved `DESIGN.md` tokens into them instead of replacing the whole stylesheet afterward. Choose a consistent configuration once and avoid duplicate CSS conventions.

## Step 4 — Build one feature

Create Overview with typed **mock** balances. Use a shadcn Card and Button only when appropriate, Tailwind classes for spacing/layout and Lucide SVG components imported individually:

```tsx
import { Wallet } from "lucide-react";

export function BalanceHeading() {
  return (
    <h2 className="flex items-center gap-2 text-lg font-semibold">
      <Wallet aria-hidden="true" className="size-5" />
      Total balance
    </h2>
  );
}
```

Use `aria-label` for icon-only interactive controls. Keep JSX readable; create a reusable component only when that abstraction actually reduces duplication.

## Step 5 — Verify and review

```bash
npm run build
npm run lint
npm run dev
```

Run a browser test for 360px mobile and desktop and inspect keyboard labels/focus. Verify Quick Add Dialog opens, traps/restores focus correctly and closes via Escape, and that the frontend has no runtime errors. (Dialog checks happen after it's implemented.) Report executed commands and real results, not expected outcomes.

**Claude Code leads these steps. Codex performs a read-only review of the diff.** No backend/SQL/GitOps changes until a separate milestone.

## Authoritative documentation

- Tailwind CSS v4 with Vite: https://tailwindcss.com/docs/installation/using-vite
- shadcn/ui Vite existing-project setup: https://ui.shadcn.com/docs/installation/vite
- shadcn/ui CLI: https://ui.shadcn.com/docs/cli
- Lucide React: https://lucide.dev/guide/react/
- Vite: https://vite.dev/guide/

---

## Update after Milestone 4.1 (what the real CLI did)

The steps above were executed (see [`docs/design/FRONTEND_SCAFFOLD_4_1.md`](../design/FRONTEND_SCAFFOLD_4_1.md)). Two facts differ from this checklist's expectations:

- The current `shadcn init` asks for a **preset** and, besides the five component files, added runtime dependencies this project does not want: `shadcn` (tree grew from 46 to 417 packages), `tw-animate-css`, `@fontsource-variable/inter` and the unified `radix-ui`. They were removed or replaced by `@radix-ui/react-dialog|label|slot`; `class-variance-authority` and `cn` stay. Final tree: 75 packages, 0 vulnerabilities.
- The generated components were restyled to `DESIGN.md` (no blur, no animation, no dark variants).

Re-check `package.json` and `src/index.css` after any future `shadcn add`.

