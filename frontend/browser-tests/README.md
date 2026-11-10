# Category browser acceptance

The browser suite uses the application's normal frontend, API, and PostgreSQL services with the repository's synthetic seed data. It requires Docker Compose, Chromium, and Playwright. It does not run from CI and does not publish images or deploy.

From the repository root, start it with a unique Compose project name and a throwaway database password:

```sh
MONIKEY_DB_PASSWORD=qa-only docker compose -p monikey-category-qa -f docker-compose.yml -f docker-compose.category-qa.yml up --build --detach
```

Then run the frontend browser tests:

```sh
cd frontend
PLAYWRIGHT_BROWSERS_PATH=0 npm run test:browser
```

Stop only that project and remove its synthetic database volume:

```sh
docker compose -p monikey-category-qa -f docker-compose.yml -f docker-compose.category-qa.yml down --volumes
```

Change the project name if reusing this procedure while another QA run is active. The standard Compose project and its volume are not used.

## Two environments

Not every spec can run against the real API:

- **Mock source** (`?demo=` scenarios such as `no-accounts`, `no-plan`, `load-error`): start `npm run dev -- --host 127.0.0.1 --port 5199` in `frontend/` and run with `MONIKEY_QA_BASE_URL=http://127.0.0.1:5199`. Needed by most of `moki.spec.ts` and the demo tests in `dashboard.spec.ts`. An HTTP-source build ignores `?demo=`, so those tests fail there; that is an environment mismatch, not a product defect.
- **Real API stack** (Compose above): needed by `categories.spec.ts`, `quick-add-categories.spec.ts` and the API-mode Dashboard tests, which run with `MONIKEY_DASHBOARD_API_FIXTURE=1`. That mode seeds its records through the API and is not idempotent, so reset the QA project with `down --volumes` before repeating it.

`navigation.spec.ts` and `overview-dashboard.spec.ts` run in either environment. Several specs rewrite tracked screenshots under `docs/`; review `git status` after a run.
