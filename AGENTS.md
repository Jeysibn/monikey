# MoniKey v1 AI Coding Rules

## Read the project sources first

Before planning implementation, read the relevant sections of:

- [Technical-Level Design](docs/architecture/TLD.md)
- [Architecture Decision Records](docs/architecture/ADR.md)
- [Master Plan](docs/architecture/MASTER_PLAN.md)
- [Roadmap and acceptance gates](docs/architecture/ROADMAP.md)
- [AI Agent Playbook](docs/architecture/AI_AGENT_PLAYBOOK.md)
- [Frontend setup checklist](docs/architecture/FRONTEND_SETUP.md) for frontend work
- [Obsidian guide](docs/architecture/OBSIDIAN_GUIDE.md) for knowledge-management work
- [DESIGN.md](DESIGN.md) after its design decisions have been approved

These v1.3 documents are an approved design baseline, not evidence that application features, tests, or cluster state are implemented. Follow accepted ADRs; do not silently broaden scope or invent missing decisions.

## Approved product and architecture

- MoniKey is a beginner-friendly, three-tier personal finance tracker.
- Frontend: React, TypeScript, Vite, Tailwind CSS v4, selectively added shadcn/ui source components, and Lucide React.
- Backend: Python, FastAPI, REST endpoints, and readable parameterized SQL.
- Database: PostgreSQL, with exactly four core tables: `accounts`, `categories`, `transactions`, and `credit_card_payments`.
- Local development: Docker Compose. CI builds/tests and publishes immutable SHA-tagged images to GHCR. The separate existing `homelab-gitops` repository holds Kubernetes desired state; Argo CD reconciles it on the existing cluster.
- Vite builds static frontend assets. Production serves them from Nginx; the frontend uses same-origin relative `/api` requests to FastAPI.
- Keep v1 simple. No authentication, banking integrations, recurring bills, investments, regular transfers, microservices, extra tables, state libraries, or new infrastructure without an approved ADR.
- Because v1 has no authentication, a writable deployment must stay on a trusted private network. Never publicly expose personal writable financial data.

## Financial correctness

- Credit-card purchases are categorized expenses and increase card debt.
- Credit-card payments reduce the paying cash/bank/e-wallet balance and the card debt. They are separate `credit_card_payments` records and must not create another expense.
- PostgreSQL/server calculations are authoritative. Use `NUMERIC(12,2)` and decimal strings in JSON; do not use browser floating-point sums as authoritative money totals.
- Never include real account identifiers, personal transactions, credentials, tokens, `.env` contents, kubeconfigs, or database dumps in source, logs, examples, notes, or screenshots.

## Ownership and coordination

- Claude Code leads UI/UX, design-system work, React/TypeScript components, Tailwind, selected shadcn/ui, Lucide, responsive behavior, accessibility, frontend tests, visual refinement, and the frontend API client.
- Codex leads PostgreSQL, FastAPI, backend tests, Docker/Compose, GitHub Actions, GHCR, Kubernetes/Argo CD, infrastructure troubleshooting, and technical reviews. Codex reviews frontend diffs read-only unless explicitly assigned a frontend change.
- Either agent may review the other's work. Only one coding agent edits a feature or working tree at a time; the reviewer starts read-only.
- Work frontend-first, one feature or milestone at a time. Use typed mock data before backend integration.
- Keep components and data flow understandable to an entry-level developer. Explain important files, dependencies, and architectural choices in plain language.

## Skills and dependencies

- Use only skills listed in [the skills manifest](docs/SKILLS_MANIFEST.md), and only for their stated purpose. Skills support the architecture; they never override this file or an ADR.
- Do not introduce frameworks, libraries, skills, plugins, or global tools without a concrete need and appropriate approval. Prefer project-local installations.
- The initial shadcn/ui set is only `button`, `card`, `input`, `label`, and `dialog`; use native selects unless a reviewed UX need justifies more.
- Review skill instructions and scripts before running them. Do not run an installer that writes outside this repository without approval.

## Verification and safety

- Run the relevant build, tests, or browser checks before declaring implementation complete. Report exact commands and outcomes; distinguish unrun checks from passing checks.
- Explain added files and material decisions. Do not claim a test, review, or deployment succeeded without evidence.
- Do not delete data, run destructive database commands, change Kubernetes resources, modify `homelab-gitops`, deploy, push, or commit without explicit approval.
- Ask before writing outside this repository, including the personal Obsidian vault. Offer a concise, evidence-based milestone note; the owner reviews and writes personal learning in their own words.
- Keep the repository as the source of truth for application code and accepted architecture. Keep Kubernetes desired state in `homelab-gitops`; Obsidian is a private learning journal, not a second specification repository.
