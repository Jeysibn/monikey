# Design and frontend status

## Current state

The owner-approved design is implemented as a mock-backed React frontend through Milestone 4.9. The HTTP data source, exact wire mappers, Vite `/api` proxy, and build-time mock/HTTP selection are also implemented and locally verified against synthetic responses.

The owner approved Milestone 5 on 2026-10-25 after personally reviewing the mock frontend in a browser. Automated browser tests and physical-device/screen-reader checks were not performed and remain unverified. The real API and live database do not exist in this repository, so persistent writes and end-to-end journeys against FastAPI remain unverified. Current machine-check evidence and its limits are listed in the [S3 report](FRONTEND_API_CLIENT_S3.md) and [Milestone 4.7 report](A11Y_RESPONSIVE_4_7.md).

## Current references

- [UI/UX behavior specification](UI_UX_SPEC.md)
- [Design system](../../DESIGN.md)
- [Component inventory](COMPONENT_INVENTORY.md)
- [API client plan and settled contract](API_CLIENT_PLAN.md)
- [Frontend HTTP client implementation](FRONTEND_API_CLIENT_S3.md)
- [Responsive guidelines](RESPONSIVE_GUIDELINES.md)
- [Real-device checklist](REAL_DEVICE_CHECKLIST.md)

Milestone reports and Codex review briefs are historical records of what was implemented or requested at that point in the project. Their old `HEAD`, “not built,” and “awaiting review” statements should not be read as the current repository status.

