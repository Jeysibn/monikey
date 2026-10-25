# MoniKey v1 — Master Plan (architecture baseline 1.3)

**Status:** Approved plan. The repository contains a working frontend and HTTP client, Milestones 6–7 database/API, and Milestone 9 Compose/Nginx stack. Local API routing, service health, persistence after DB restart, backup restore, and account-edit debt recalculation were verified with synthetic data. The owner approved account editing on 2026-10-25. The M10 GitHub Actions workflow is in the worktree; GitHub execution and GHCR publication await pushing/merging it to `main`. See [current progress](ROADMAP.md#current-progress-and-next-gate); planned architecture is not proof of production readiness.
**Approach:** Frontend-first, small increments, one AI editor at a time, owner verifies and learns.
**Second brain:** Personal Obsidian vault (ADR-016), **separate** from the code repository and GitOps desired-state repository.

## North star

Build a simple, accessible personal finance tracker that the project owner can **use, maintain, explain, and deploy** as a beginner-friendly DevOps/Cloud Engineer portfolio project. Features: cash, bank, e-wallet and credit-card accounts; income/expense entries and categories; transaction history CRUD; card purchases/payments and debt/available credit; balances and monthly summaries. **No card-payment double counting.**

## Chosen architecture

- Frontend: **React + TypeScript + Vite**, **Tailwind CSS v4**, five selective **shadcn/ui** primitives to start, **Lucide React** icons; three views (Overview, Activity, Accounts) and Quick Add / Pay Card dialogs. Typed mock data first.
- Backend: **FastAPI + parameterized SQL / PostgreSQL driver**, simple REST routes under `/api`.
- Database: **PostgreSQL**, four tables (`accounts`, `categories`, `transactions`, `credit_card_payments`); monetary values in `NUMERIC(12,2)`; private persistent storage and tested backup/restore.
- Local: **Docker Compose**. Production frontend: Vite `dist/` served by **Nginx**; same-origin `/api` routing.
- Delivery: **GitHub Actions → GHCR SHA-tagged images → reviewed update in `homelab-gitops` → Argo CD → Kubernetes**, on the existing private homelab. No unauthenticated public deployment with live finance data.

Full implementation detail: [TLD](TLD.md). Decisions/trade-offs: [ADRs](ADR.md). Agent assignments: [AI Agent Playbook](AI_AGENT_PLAYBOOK.md).

## Development cycles

| Phase | Milestones | Lead | Acceptance before proceeding | Obsidian output |
|---|---|---|---|---|
| Design | 1 | Claude Code | Owner approves DESIGN.md, mobile wireframes, transaction/card flows | Design intent + open questions |
| React/UI | 2–5 | Claude Code | Vite build, UI flows, browser/mobile accessibility tests | React/TS/Tailwind learnings and screenshots references |
| Financial logic | 6–7 | Codex | Schema and API tests prove correct credit-card accounting | Data model and API explanation |
| App integration | 8 | Claude frontend / Codex backend, separate change sets | Typed `fetch` with working forms and persistence | Request-to-database walkthrough |
| Containers and delivery | 9–11 | Codex | Compose persistence, image build, approved GitOps rollout, recovery/rollback tests | Runbooks and debugging notes |
| Portfolio | 12 | Both, with owner approval | Safe sample-data demo, readable README and technical walkthrough | Interview explanation and lessons learned |

All milestones and detailed gates: [ROADMAP](ROADMAP.md).

## One shared workflow (repeat every milestone)

1. Review the current issue, accepted docs, and existing implementation. Set one small objective.
2. Assigned agent explains intended files and approach; coding changes are limited to that milestone.
3. Run relevant checks and collect **actual evidence** (not just AI assurances).
4. Second agent reviews without editing; project owner accepts or requests a small correction.
5. Commit a working change and reference the commit/PR in the **private Obsidian milestone note**.
6. In Obsidian, record **what changed, why, what I tested, what I learned, what is next** (5–10 minutes).

## Source of truth (no duplication)

| Information | Canonical location | Obsidian role |
|---|---|---|
| App code, tests, UI spec, accepted design/ADRs | MoniKey application Git repo | Personal explanations and links |
| Actual Kubernetes desired state and image versions | `homelab-gitops` Git repo | Deployment diary and troubleshooting |
| Personal progress, learning gaps, fixes encountered | **Private Obsidian vault** | Canonical personal learning history |
| Financial transactions | PostgreSQL | Never store actual financial records or credentials |

## Boundaries

No new feature, table, service, web framework or infrastructure component without a reviewed reason and new ADR. AI skills are development aids, **not** runtime dependencies. Obsidian is a second brain, **not** a hosted database, CI/CD system, documentation auto-sync dependency, or Kubernetes workload. Avoid storing real financial data, secrets, tokens, kubeconfig, database dumps and other sensitive content in notes.

**Current action:** Milestone 5 owner approval was recorded on 2026-10-25 after personal browser review of the mock frontend. Automated browser and physical-device/screen-reader checks remain unverified. M8 API routing has been exercised; the full interactive browser journey remains unchecked. M9 Compose build, health, DB restart persistence, and restore were verified locally with fictional data. The owner approved account editing after its production build and API recalculation smoke check. M10 workflow configuration is in the worktree; its GitHub run and GHCR publication await pushing/merging it to `main`.
