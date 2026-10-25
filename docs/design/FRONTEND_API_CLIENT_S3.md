# Frontend API client — S3 implementation

**Status:** Implemented and locally verified against synthetic responses. The HTTP client has not been exercised against FastAPI because this repository has no backend yet. S1 (data-source seam) and S2 (loading/error/slow states) are recorded in [Milestones 4.8](FRONTEND_SEAM_4_8.md) and [4.9](FRONTEND_STATES_4_9.md).

## What changed

- `frontend/src/wire.ts` defines the agreed snake_case API payloads, validates their shapes, and converts decimal strings to integer centavos with `BigInt` arithmetic. It rejects malformed or out-of-bound money rather than rounding it. Server-returned balances, debt, `owed`, `credit`, available credit, and summary values are used as supplied and checked for consistency.
- `frontend/src/httpSource.ts` implements the existing `DataSource` methods with same-origin `/api` requests. It merges transactions and card payments using calendar date, timestamp precision through nanoseconds, transaction-before-payment tie order, and descending IDs. Both list requests receive the account filter before the backend applies the limit; the client requests one spare row from each and caps the visible list at 1,000.
- API error envelopes become the existing `ApiError` shape, with backend field names mapped to form fields. Failed and malformed responses use safe generic errors where needed.
- `frontend/src/App.tsx` selects the mock or HTTP source using the public build-time setting `VITE_DATA_SOURCE`. The default is the mock. An HTTP build removes the mock source and `?demo=` hooks through Vite tree-shaking.
- `frontend/vite.config.ts` proxies `/api` to `http://localhost:8000` without removing the prefix. HTTP reads have a 30-second timeout and honor the screen's `AbortSignal`. Writes are not automatically retried or canceled because a lost response cannot establish whether the server committed the request; the existing slow-save notice remains in place.
- The mock activity model now retains `createdAt`, matching the HTTP model and preserving deterministic cross-list ordering.

## Verification run for this change

- `npm ci` — installed from the committed lockfile; 74 packages added, no vulnerabilities reported.
- `npm test` — **171 tests passed, 0 failed**, including 12 new HTTP/wire tests using synthetic responses.
- `npm run lint` — passed with no findings.
- `npm run build` — passed for the default mock build.
- `VITE_DATA_SOURCE=http npm run build` — passed for the HTTP build. Inspection of the generated JS found no `createMockSource`, `load-error`, `save-error`, `failNextWrite`, `invalidNextWrite`, or `demoBehaviour` hooks.

The repository's browser harnesses were not run for this change because their configured `playwright-core` module is absent. The frontend has not been tested against a running API; backend endpoints and the shared `docs/api-fixtures/` promised by the contract plan do not exist yet. Use the existing [real-device checklist](REAL_DEVICE_CHECKLIST.md) after backend integration and when the target devices are available.

## Next

Implement the four-table database schema and accounting tests, then FastAPI endpoints matching the settled contract in [API_CLIENT_PLAN.md](API_CLIENT_PLAN.md). Add shared sanitized API fixtures with the backend work, run the browser journeys against a live local API, and verify persistence before starting Compose.
