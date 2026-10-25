# Design and frontend status

## Current state

The owner-approved design is implemented as a mock-backed React frontend through Milestone 4.9. The HTTP data source, exact wire mappers, Vite `/api` proxy, and build-time mock/HTTP selection are also implemented and locally verified against synthetic responses.

The owner approved Milestone 5 on 2026-10-25 after personally reviewing the mock frontend in a browser. Automated browser tests and physical-device/screen-reader checks were not performed and remain unverified. M8 API calls were exercised through the Vite proxy and, with the M9 Compose stack, through Nginx; the full interactive React/API browser journey remains unchecked. M9 Compose images, health, persistence across database restart, and restore into a fresh database were verified with synthetic data. Account editing is implemented and owner-approved: name, opening values, and card limit can change while account type stays fixed. M10 checks and SHA-tagged GHCR publication passed in [GitHub Actions run 40161913794](https://github.com/Jeysibn/monikey/actions/runs/40161913794). M11 deployed the app to the private homelab; HTTPS, API readiness, PVC persistence, logical restore, and image rollback were verified. M12 portfolio screenshots use only the fictional mock ledger. Details are in the [M8–M9 integration report](MILESTONE_8_9_INTEGRATION.md), [account edit UI spec](UI_UX_SPEC.md#9-add-account), [portfolio overview](../portfolio/README.md), and [backend README](../../backend/README.md).

## Current references

- [UI/UX behavior specification](UI_UX_SPEC.md)
- [Design system](../../DESIGN.md)
- [Component inventory](COMPONENT_INVENTORY.md)
- [API client plan and settled contract](API_CLIENT_PLAN.md)
- [Frontend HTTP client implementation](FRONTEND_API_CLIENT_S3.md)
- [Responsive guidelines](RESPONSIVE_GUIDELINES.md)
- [Real-device checklist](REAL_DEVICE_CHECKLIST.md)

Milestone reports and Codex review briefs are historical records of what was implemented or requested at that point in the project. Their old `HEAD`, “not built,” and “awaiting review” statements should not be read as the current repository status.

