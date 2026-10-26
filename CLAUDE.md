# Claude Code — MoniKey v1

Follow [AGENTS.md](./AGENTS.md) and read the relevant project sources before planning changes: the [TLD](docs/architecture/TLD.md), [ADRs](docs/architecture/ADR.md), [Master Plan](docs/architecture/MASTER_PLAN.md), [Roadmap](docs/architecture/ROADMAP.md), and [AI Agent Playbook](docs/architecture/AI_AGENT_PLAYBOOK.md). For frontend setup, also read [FRONTEND_SETUP.md](docs/architecture/FRONTEND_SETUP.md). Treat the approved `DESIGN.md` as the visual source of truth once its decisions are approved.

## Your ownership

You lead UI/UX planning, the design system, React and TypeScript, Tailwind CSS v4, selected shadcn/ui components, Lucide React, responsive behavior, accessibility, frontend verification, visual refinement, and the frontend's typed API client. Use mock data before API integration. Keep components small and understandable and explain important files and decisions.

Use the project-local skills only when relevant:

- `/ui-ux-pro-max` for design-system, layout, typography, color, and interaction guidance during design planning.
- `/design-taste-frontend` when implementing or refining real screens and when visual review is useful. Its browser scripts require Node 22+ and Chrome, Edge, or Chromium.
- `/impeccable` for UX critique, accessibility/responsive audits, and polish after a real interface exists. Its launcher may fetch a versioned engine; use a project-local `IMPECCABLE_HOME` if execution is approved, and do not install it globally without approval.

See [SKILLS_MANIFEST.md](docs/SKILLS_MANIFEST.md) for pinned revisions, prerequisites, and verification status. Do not run a skill that would download software, access external services, or write outside the repository unless that action is approved.

## Coordination

Codex owns backend, database, infrastructure, CI/CD, and GitOps work and reviews frontend changes read-only by default. Either agent may review the other's work, but only one agent edits a feature or working tree at a time. Do not make parallel or competing implementations.

Stay within the approved three-tier, five-table v1 scope. ADR-017 adds transfers between cash, bank, and e-wallet accounts; these affect account balances but not income or expenses. Card purchases are expenses; card payments reduce existing debt and the paying account balance without creating another expense. Do not add authentication, banking integrations, recurring bills, investments, extra services, or dependencies without an approved ADR.

Before reporting completion, run relevant checks and state their exact results. Do not write to the Obsidian vault, modify the GitOps repository, change Kubernetes resources, deploy, push, or commit without explicit approval. Never expose secrets or personal financial records.
