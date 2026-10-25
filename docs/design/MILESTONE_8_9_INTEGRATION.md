# Milestones 8–9: local API integration and Compose

**Status (2026-10-25):** Same-origin API routing and Compose operations were checked locally with synthetic data. The browser-based React journey and owner review for Milestone 8 are still pending: browser access to the local origin was declined by the origin approval gate, so no alternate browser route was attempted. Milestone 9's image build, service health, persistence across a PostgreSQL restart, and logical backup restore into a fresh database were verified.

## Milestone 8 evidence and limits

- Started PostgreSQL 17.6 with the repository schema and fictional category seed, then ran FastAPI and Vite with `VITE_DATA_SOURCE=http`.
- `GET /api/health/ready`, accounts, categories, and monthly summary responded through Vite's `/api` proxy.
- A synthetic credit-card purchase of `50.00` raised card debt and monthly expenses by `50.00`. A separate card payment of `20.00` lowered cash and debt while monthly expenses stayed at `50.00`.
- This checks the running API and development proxy. It does **not** prove React rendered the returned values or that users can complete the flow in the UI. Automated browser, device, and screen-reader checks remain unverified.
- The owner should review the integrated UI at `http://127.0.0.1:8080` and confirm the M8 gate before the integration milestone is considered accepted.

## Milestone 9 evidence

- `docker compose config --quiet` passed.
- `docker compose build` built the FastAPI image and the Vite production build served by Nginx. TypeScript and Vite build completed successfully inside the frontend image.
- `docker compose up -d` brought up healthy PostgreSQL, API, and frontend services. The only published port is `127.0.0.1:8080`; PostgreSQL and FastAPI have no host port mappings.
- Nginx served `/healthz` and proxied `/api/health/ready` and `/api/categories` to FastAPI on the private Compose network.
- A synthetic account, card purchase, and card payment were created through Nginx. After `docker compose restart db`, the accounts and summary remained intact.
- A custom-format `pg_dump` stream was restored into a fresh `monikey_restore_check` database. The restored database contained 2 accounts, 9 categories, 1 transaction, and 1 card payment. The dump was streamed directly between commands and was not written to disk.
- The local Compose volume and restore-check database are left in place with fictional data only, so the owner can inspect the app. `docker compose down` stops the app but keeps the database volume. Do not use `docker compose down -v` if you want to keep it.

## Files added for Milestone 9

- `docker-compose.yml` defines the three local services, readiness checks, loopback-only web port, and persistent PostgreSQL volume. Schema and seed scripts are mounted as first-volume initialization files.
- `backend/Dockerfile` installs the pinned API requirements and runs Uvicorn.
- `frontend/Dockerfile` builds HTTP-mode Vite assets and copies them into Nginx.
- `frontend/nginx.conf` serves static assets, provides `/healthz`, and proxies same-origin `/api` requests.
- `.env.example` documents the local PostgreSQL password variable; the actual `.env` is ignored by Git.

The PostgreSQL image needs `PGDATA` set to a subdirectory inside the volume because the volume root may contain filesystem metadata such as `lost+found`. This was observed on the first Compose start and corrected before successful initialization; no database volume was deleted.
