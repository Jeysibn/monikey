# Frontend layout normalization — 2026-09-14

## Scope

This pass audited the complete mock frontend route surface at `/`,
`/transactions`, `/accounts`, `/budget`, `/goals`, `/crypto`, `/recurring`,
`/rules`, `/reconciliation`, `/imports`, `/tags`, `/reports`, `/sync`,
`/security`, and `/settings`. The existing dark fintech identity, Manrope and
Space Grotesk typography, palette, card treatment, density, and feature model
remain the source of truth.

## Findings addressed

- Desktop navigation had an ungrouped secondary list and did not show that
  More was the active section on secondary routes.
- The dashboard used an unused named grid area and fixed minimum row geometry,
  leaving a large empty desktop column.
- Recurring-item actions were stacked in a narrow grid column, producing very
  tall rows.
- Transactions exposed only a type filter even though URL state could carry
  more filters. Search, type, category, account, date range, and tag filters
  are now visible and reflected in URL parameters with removable chips and
  clear-all behavior.
- Rules, reconciliation, imports, tags, security, and sync now share the
  page-header and card rhythm instead of having isolated narrow shells or
  fallback-only headers.
- Native browser confirmation and alert paths were replaced with the shared
  native-dialog `ConfirmDialog` primitive and inline status/error messaging.
- Mock crypto values are explicitly marked as demo data, including the
  dashboard summary.
- The canonical `/sync` route is included in structural accessibility coverage.

## Responsive audit

Screenshots were captured before and after at 1440×900, 1280×800, 1024×768,
768×1024, 390×844, and 360×844. The after set is generated in the ignored
`output/playwright/after/` directory so visual artifacts do not enter the
source branch. The 840px breakpoint changes the desktop navigation to the
compact menu before it can wrap at tablet widths.

## Verification

- `npm run typecheck --prefix frontend` — passed.
- `npm run test --prefix frontend -- --run` — 263 unit/component tests passed.
- `npm run test:e2e:mock --prefix frontend -- --workers=1` — 100 mock E2E tests passed.
- Route accessibility invariants cover all 15 routes, including `/sync`.
- Browser geometry audit reported no horizontal overflow or page errors at the
  requested viewports.
- `npm run lint --prefix frontend` — passed with existing warnings in the
  generated Tesseract asset and pre-existing React hook/export warnings.
- `npm run build --prefix frontend` — passed; the production bundle and
  service-worker asset list were generated successfully.
