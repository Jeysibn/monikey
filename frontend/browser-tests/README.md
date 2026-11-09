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
