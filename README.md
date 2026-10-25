# MoniKey

MoniKey is a beginner-friendly, three-tier personal finance tracker. Its responsive React frontend has Overview, Accounts and Activity screens, and Quick Add, Pay card, Edit, Delete and Add account flows. The mock data source and a contract-driven HTTP data source are implemented. The PostgreSQL schema, repeatable category seed, FastAPI endpoints, and isolated database/API checks are in place. Local Compose builds and runs the Nginx frontend, API, and persistent PostgreSQL service.

## Approved stack

- Frontend: React, TypeScript, Vite, Tailwind CSS v4, selective shadcn/ui, and Lucide React
- Backend: Python, FastAPI, and PostgreSQL
- Local development: Docker Compose
- Delivery: GitHub Actions and GHCR
- Deployment: existing Kubernetes cluster managed through Argo CD GitOps

The frontend scaffold and design system are in place. Overview, Accounts, Activity, mock-backed entry flows, account creation and editing, responsive/accessibility refinements, and loading/error/slow states are implemented. Account editing keeps the account type fixed and lets the owner update name, opening amounts, and card limit; the owner approved the flow on 2026-10-25. The production frontend build passes; a local Compose API smoke check confirmed that changing opening debt changes calculated debt and restoring the original value restores the original result. Milestones 6–7 added the PostgreSQL schema/API; Milestone 8 API routing and Milestone 9 Compose, persistence, and restore were verified with synthetic data. The M10 GitHub Actions workflow is present in the worktree and runs frontend checks, PostgreSQL-backed database/API checks, Docker builds, and SHA-tagged GHCR publishing on `main`. GitHub has not run it yet; merge/push to `main` is still required to verify publishing. The local app is at `http://127.0.0.1:8080`. See [integration and Compose evidence](docs/design/MILESTONE_8_9_INTEGRATION.md), [account editing behavior](docs/design/UI_UX_SPEC.md#9-add-account), [backend status](backend/README.md), [frontend status](frontend/README.md), [database guide](database/README.md), and [shared API fixtures](docs/api-fixtures/README.md).

## Workspace layout

```text
frontend/             React + TypeScript + Vite + Tailwind v4 + shadcn/ui app (mock and HTTP data sources)
backend/              FastAPI routes, database connection helper, and API tests
database/             PostgreSQL schema, seed, and isolated accounting checks
docs/architecture/    Architecture documentation
docs/design/           Design documentation
AGENTS.md              Shared development guidance
CLAUDE.md              Claude Code guidance
DESIGN.md              UI/UX decision notes
```

## Frontend development

```sh
cd frontend
npm ci
npm run dev
```

The development server uses the mock by default. Set `VITE_DATA_SOURCE=http` to use the HTTP client with a FastAPI server on `localhost:8000`; production builds use the same setting. The frontend proxy keeps `/api` intact. See [frontend README](frontend/README.md) for details.

Create a production mock build with `npm run build`, or an HTTP build with `VITE_DATA_SOURCE=http npm run build` from `frontend/`.

## Project documentation

The approved v1.3 design baseline and current progress are in [`docs/architecture/`](./docs/architecture/): TLD, ADRs, master plan, roadmap, AI Agent Playbook, frontend setup, and Obsidian guide. Current design and frontend status is indexed in [`docs/design/README.md`](./docs/design/README.md). Milestone reports document evidence for their specific stage; they do not claim that live integration or cluster deployment is verified.

AI setup and ownership are documented in [`docs/AI_AGENT_SETUP.md`](./docs/AI_AGENT_SETUP.md), with pinned skills in [`docs/SKILLS_MANIFEST.md`](./docs/SKILLS_MANIFEST.md) and onboarding evidence in [`docs/AI_AGENT_VERIFICATION.md`](./docs/AI_AGENT_VERIFICATION.md).

## Development coordination

See [`AGENTS.md`](./AGENTS.md) and [`CLAUDE.md`](./CLAUDE.md) for agent roles and repository practices. Obsidian learning notes and the development journal live in `~/main-brain/Projects/MoniKey`; agents ask before writing to the vault.
