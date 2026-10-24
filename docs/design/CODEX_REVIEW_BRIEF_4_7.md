# Review Brief for Codex — Milestone 4.7 (Accessibility and responsive pass)

**Read-only.** Do not edit files or install anything. **Do not run `npm run build` or `npm ci` in `frontend/` while Claude Code may be editing.** Safe: `git diff HEAD`, `git status`, `npm test`, `npx tsc -b --noEmit`, `npm run lint`. To run the audit you need a dev server (`npx vite --port 4291`) and `BASE_URL=http://localhost:4291/ node scripts/audit-a11y.cjs`; that writes only screenshots if `SHOTS_DIR` is set, so skip it if you prefer.

**Second round:** your first review's two items were fixed (amount floor of 12px, keyboard-typed select) and the audit gained a text-under-12px check and a select-text-cut-off check (which found a real 320px bug). Please re-check those.

**What to review:** `git diff HEAD` (4.6 is committed, `10db430`) plus `scripts/audit-a11y.cjs`. Record: `docs/design/A11Y_RESPONSIVE_4_7.md`. The diff is mostly layout classes, not behaviour.

## Evaluate
1. **Regression risk (most important)** — the layout changes touch shared components: `TransactionItem` and `AccountRow` (grid to wrapping flex), `CreditCardSummary`, `AppShell` bottom bar, `ui/dialog.tsx` (header padding, wrapping footer), `ui/card.tsx` (wrapping header), `SegmentedControl` (`auto-fit`), `PageHeader`, and the `px` to `rem` font conversion. Anything that changes ordinary-size behaviour or the approved design? (The six functional harnesses all pass; they would not catch a purely visual change.)
2. **`MoneyText`** — `fitScale` thresholds (12 / 14 / 16 characters), `wrap` (`overflow-wrap: anywhere`), and the fact that ordinary amounts take the unchanged `nowrap` path. Is nested `font-size: Nem` correct next to `tracking` and `leading` classes? Does any figure rely on `block` and break?
3. **Accessibility claims** — focus not obscured (`scroll-padding-bottom`), dialog behaviour (Radix leaves the live region and `<main>` exposed while hiding their contents), reading order change in Activity rows (title, category · account, amount), bottom-bar label size capped in `px` (`min(0.75rem, 14px)`) so the bar stays usable at large text: a deliberate exception to "text scales"; acceptable?
4. **Four-option type switch without a check mark** (Add account) — is a raised outlined pill enough as a non-colour cue? (Also in the 4.6 review.)
5. **The audit script** — are the checks sound (contrast through a canvas colour parse and alpha blending; target sizes; focus-obscured test; reflow at 320px; text at 200% via root font size)? Any check that cannot fail? (The ordinary-amount-wrap check was proved to fire by forcing the regression.) Anything important it misses?
6. **Scope and honesty** — nothing here claims real-device, other-browser or screen-reader verification; the checklist for those is `docs/design/REAL_DEVICE_CHECKLIST.md`. Anything overstated in the record?

## Known limitations (not discoveries)
Chromium only; no real devices, Firefox/WebKit or screen readers; hero figure wraps over three lines at 320px with 200% text; bottom-bar labels may truncate there; Impeccable was not run (needs approval to download its engine).

## Report format
Most severe first: file + line, what is wrong, why it matters, a concrete fix, blocker / should-fix / nice-to-have. Say what you could not check.
