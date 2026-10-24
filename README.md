# MoniKey

MoniKey is a beginner-friendly, three-tier personal finance tracker. This repository is being prepared for its UI/UX design phase; finance-tracking features have not been implemented.

## Approved stack

- Frontend: React, TypeScript, Vite, Tailwind CSS v4, selective shadcn/ui, and Lucide React
- Backend: Python, FastAPI, and PostgreSQL
- Local development: Docker Compose
- Delivery: GitHub Actions and GHCR
- Deployment: existing Kubernetes cluster managed through Argo CD GitOps

The frontend has the Vite React + TypeScript scaffold with Tailwind CSS v4, the five approved shadcn/ui components, Lucide, self-hosted Manrope and the approved design tokens (Milestone 4.1). Application screens and features are not built yet; they follow in later approved milestones.

## Workspace layout

```text
frontend/             React + TypeScript + Vite + Tailwind v4 + shadcn/ui scaffold (design system only)
backend/              Backend workspace (not initialized)
database/             Database workspace (not initialized)
docs/architecture/    Architecture documentation
docs/design/           Design documentation
AGENTS.md              Shared development guidance
CLAUDE.md              Claude Code guidance
DESIGN.md              UI/UX decision notes
```

## Frontend development

```sh
cd frontend
npm install
npm run dev
```

Create a production build with `npm run build` from `frontend/`.

## Project documentation

The approved v1.3 design baseline is in [`docs/architecture/`](./docs/architecture/): TLD, ADRs, master plan, roadmap, AI Agent Playbook, frontend setup, and Obsidian guide. The documents describe intended architecture; they do not claim application implementation or cluster state is verified.

AI setup and ownership are documented in [`docs/AI_AGENT_SETUP.md`](./docs/AI_AGENT_SETUP.md), with pinned skills in [`docs/SKILLS_MANIFEST.md`](./docs/SKILLS_MANIFEST.md) and onboarding evidence in [`docs/AI_AGENT_VERIFICATION.md`](./docs/AI_AGENT_VERIFICATION.md).

## Development coordination

See [`AGENTS.md`](./AGENTS.md) and [`CLAUDE.md`](./CLAUDE.md) for agent roles and repository practices. Obsidian learning notes and the development journal live in `~/main-brain/Projects/MoniKey`; agents ask before writing to the vault.
