# ADR-025 feasibility record: Recharts measurements (local experiment, 2026-11-12)

Companion to [ADR-025-DRAFT](./ADR-025-DRAFT-dashboard-charting-and-date-model.md). **ADR-025 is still not approved. Nothing here adds a dependency to the redesign branch.** The experiment ran in a separate git worktree outside the repository directory (since removed), branched from the Kakeibo tip `d35e5c8`, with `npm install --save-exact --ignore-scripts recharts@3.10.1`. Everything measured is reproducible with the steps at the end.

## What was built

`RechartsPanel`: the three chart kinds the approved spec needs, with `accessibilityLayer`, tooltips, legends and `ResponsiveContainer`: a monthly income-vs-expenses bar chart (real mock report data), a category donut using the persisted category colors, and a 30-point daily line. It was added to the existing lazily loaded Dashboard, once statically (variant A) and once as its own `React.lazy` chunk (variant B). The current native CSS/SVG Dashboard is the baseline.

## Version and dependency tree

- `recharts` **3.10.1** (latest on 2026-11-12; MIT; peer React 16.8–19, so React 19.3 is supported).
- **38 new packages** in the lockfile (all `prod`): Recharts itself, `@reduxjs/toolkit` 2.14.0, `react-redux` 9.3.1, `redux`, `redux-thunk`, `immer`, `reselect`, `es-toolkit`, `decimal.js-light`, `eventemitter3`, `tiny-invariant`, `react-is`, `use-sync-external-store`, `victory-vendor` (bundles d3 modules), 11 `d3-*` packages plus `internmap`, 11 `@types/d3-*`, `@standard-schema/*`.
- Licenses: MIT, ISC, BSD-3-Clause (and `victory-vendor`: MIT AND ISC AND BSD-3-Clause). No copyleft.
- `npm audit`: **0 vulnerabilities** at install (2026-11-12). Install scripts were skipped (`--ignore-scripts`); none were needed to build.
- Side finding, unrelated to Recharts: the committed `frontend/package.json` contains a duplicate `"test:browser"` key (inherited from PR #25's baseline). npm normalizes it on rewrite.

## Bundle size (KiB; gzip level 9 and default brotli; `vite build`)

| Build | Entry JS | Dashboard chunk | Recharts chunk | CSS |
|---|---|---|---|---|
| Baseline (native SVG/CSS) | 521.8 raw / **155.0 gz** / 130.2 br | 13.2 / **3.7 gz** / 3.3 br | n/a | 46.3 / 9.9 gz |
| A: static import inside Dashboard chunk | 522.0 / **155.1 gz** / 130.3 br | 421.9 / **116.9 gz** / 97.4 br | in Dashboard chunk | unchanged |
| B: panel as its own `React.lazy` chunk | 522.0 / **155.1 gz** / 130.3 br | 13.6 / 3.9 gz / 3.5 br | 408.7 / **113.5 gz** / 94.4 br | unchanged |

Reading it: Recharts adds about **+113 KiB gzip (about +91 KiB brotli)** to the Dashboard, roughly **30x** the current Dashboard code, for three chart kinds. Vite's own report (1000-byte kB, default gzip) shows the same shape: Dashboard 3.81 kB gz to 121.02 kB gz, entry 160.47 to 160.54 kB gz. Removing the native chart code in a real adoption would save only about 3 KiB gz.

## Lazy loading (measured in a browser against `vite preview`)

- On Overview only `index-*.js` is fetched; the Recharts chunk is **not** loaded.
- Opening Dashboard fetches `DashboardView-*.js` and `RechartsPanel-*.js`; charts were visible after about 0.84 s on localhost, uncached (includes parsing about 400 KiB of JS). Real network and device cost is larger and was not measured.
- Entry bundle growth is +0.1 KiB gzip: lazy loading works at the route level. Variant B only helps if the charts sit below the fold or behind a control; on this page they are the main content.

## Accessibility and responsiveness

- axe (WCAG 2.0/2.1 A and AA) on the chart section: **no violations** at 320, 390 and 1440 px; no horizontal overflow at any of them.
- `accessibilityLayer` makes each chart a focusable `role="application"` SVG; arrow keys move through data points, a tooltip appears and a polite live region announces it (for example "2026-06 Expenses: 0 Income: 0"). Good, but: the application role has **no accessible name** by default (needs `aria-label` added), it announces raw series values (not formatted pesos), and there is **no table or text alternative**. The spec's table fallback would still have to be built for every chart, exactly as with native SVG.
- Responsive: `ResponsiveContainer` resized correctly at 320 px. Tick thinning (`interval`, `minTickGap`) worked for 30 daily labels; legends wrapped acceptably.
- Visual fit: default text is not Manrope and sizes are not on the design scale, and default grid and legend styling differ from the cards. Needs themeing (fonts via CSS, tick/legend props) before it looks native. The donut and bars rendered correctly with category and token colors.

## Comparison with the existing native SVG implementation

| | Recharts 3.10.1 | Native SVG/CSS (today) |
|---|---|---|
| Added runtime dependencies | 38 packages | 0 |
| Dashboard chunk (gzip) | about +113 KiB | 3.7 KiB |
| Chart types needed by the spec | all supported out of the box | bars and a line exist; donut, tooltips/tap targets, weekday and daily series, tick thinning would be hand-built |
| Keyboard and tooltip behaviour | built in (needs naming and formatting) | text values per point today; no tooltips |
| Fit to design system | needs theming | already matches |
| Maintenance | upgrade and audit a larger tree (Redux, d3) for a display-only feature | we own all chart code |
| Table fallback | still must be built | still must be built (already exists for the monthly bars) |

## Assessment (input for the owner's decision; not an approval)

Recharts is technically feasible with React 19, passes axe, loads lazily and removes the need to hand-build donut, tooltip and axis logic. The cost is real and measured: +113 KiB gzip on the Dashboard, 38 packages including a Redux stack for display-only charts, and theming and accessibility work that remains. If the owner prefers a small footprint, extending the native SVG is the lower-dependency route; if development speed and richer interaction matter more, Recharts 3.10.1 is a sound choice with the gates already listed in ADR-025 §4 (exact pin, lazy chunk, size recorded, audit clean, table fallbacks). Decision pending.

## Reproduce

```sh
git worktree add -b experiment/recharts-feasibility <dir> <redesign-tip>
cd <dir>/frontend && npm ci --ignore-scripts && npm run build        # baseline sizes
npm install --save-exact --ignore-scripts recharts@3.10.1             # add RechartsPanel, import it in DashboardView
npm run build && gzip -9 / brotli each dist/assets/*.js               # variants A and B
npm audit --omit=dev; npm ls recharts --all
```
Remove with `git worktree remove --force <dir> && git branch -D experiment/recharts-feasibility`.
