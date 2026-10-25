# MoniKey AI Agent Setup

**Purpose:** reproducible, project-local onboarding for Codex and Claude Code. AI tools and skills are development aids; none is an application runtime dependency.

## Authoritative project sources

Read the relevant project documents before work:

- [TLD](architecture/TLD.md) — product, component boundaries, data, API, finance rules, privacy, and deployment design
- [ADRs](architecture/ADR.md) — accepted decisions and change control
- [Master Plan](architecture/MASTER_PLAN.md) — goals and phases
- [Roadmap](architecture/ROADMAP.md) — milestone owners and acceptance gates
- [AI Agent Playbook](architecture/AI_AGENT_PLAYBOOK.md) — model choices, responsibilities, review workflow, and prompts
- [Frontend setup](architecture/FRONTEND_SETUP.md) and [Obsidian guide](architecture/OBSIDIAN_GUIDE.md) as relevant
- Root [AGENTS.md](../AGENTS.md), [CLAUDE.md](../CLAUDE.md), and approved [DESIGN.md](../DESIGN.md)

The architecture documents originated in `MoniKey_v1_3_Architecture_with_Obsidian.zip` and are maintained in [architecture/README.md](architecture/README.md). The design remains the approved baseline. Current repository state: the frontend prototype and contract-driven HTTP client are implemented through API-plan S3; the owner approved Milestone 5 after personally reviewing the mock frontend in a browser; the Milestone 6 PostgreSQL schema, category seed, and accounting checks are implemented. Automated browser tests and physical-device/screen-reader checks were not performed. The FastAPI backend, live API integration, CI/CD, and cluster state are not implemented or verified. See [ROADMAP.md](architecture/ROADMAP.md#current-progress-and-next-gate).

## Agent roles

| Agent | Primary owner | Review role |
|---|---|---|
| Claude Code | UI/UX, design system, React/TypeScript, Tailwind v4, selective shadcn/ui, Lucide, responsive/accessibility work, frontend tests and visual refinement, and the frontend API client | May review backend and infrastructure work |
| OpenAI Codex | PostgreSQL, FastAPI/REST, accounting and backend tests, Docker/Compose, GitHub Actions/GHCR, Kubernetes/Argo CD, infrastructure troubleshooting and technical reviews | Reviews frontend diffs read-only by default |

Either agent can review the other. A single writer edits a feature at a time; the reviewer starts read-only. Claude owns the browser-facing API client while Codex owns the API server, schema, and backend integration tests.

## Model inventory and recommendations

Detected installations: Codex CLI `0.163.0` and Claude Code `2.1.306`.

`codex debug models` reports this local Codex model catalog: `gpt-6.1-sol`, `gpt-6-astra`, `gpt-6-sol`, `gpt-reserve`, `gpt-6-luna`, `gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.6-luna` (plus the Codex auto-review entry). Local Codex configuration currently selects `gpt-6-luna` with high reasoning effort. Catalog presence does not guarantee account entitlement.

Claude Code accepts model aliases such as `sonnet` and `opus`. The local cached catalog lists Sonnet 5.5, Opus 5.5, Haiku 5.5, and Fable 5.1, but that cache was fetched on 2026-10-21 and is stale. Use `/model` to see current account options; do not treat the cache as live entitlement evidence.

A read-only CLI session using `--model sonnet` returned successfully, but the CLI response did not expose the resolved model version. `claude doctor` reported no installation issues.

Recommended defaults, subject to the model picker and account:

- Everyday frontend implementation: Claude Code Sonnet, medium/default effort; this alias returned successfully in a read-only CLI check.
- Complex frontend reasoning: Claude Code Opus, only when needed.
- Everyday backend, API, and infrastructure work: Codex GPT-6.1 Sol, medium effort; use high for accounting, security, and Kubernetes reasoning. A read-only assessment using this model returned successfully.
- Straightforward documentation or mechanical work: Codex GPT-6 Luna (the current configured model), or Claude Haiku when the Claude model picker confirms it, with explicit verification.
- Deep cross-cutting architecture/security review: Codex GPT-6.1 Sol at high effort, with Claude Opus as an independent reviewer when available.

These recommendations match the local Codex catalog and the v1.3 Playbook. Use Claude `/model` and `/status` to confirm exact model availability before relying on a specific version. Do not use a premium model for every task.

## Installed skills

The selected core skills live in the repository under `.claude/skills/`; their exact source commits, scope, dependencies, and verification states are recorded in the [skills manifest](SKILLS_MANIFEST.md). Claude Code discovers project skills there. Codex discovers user skills from `~/.codex/skills`; existing Codex skills are machine-local and are not silently copied or updated by this setup.

Recommended invocation by phase:

1. `/ui-ux-pro-max` during design-system and interaction planning. A Claude Code read-only session invoked it successfully without running its search script or generating a MoniKey design.
2. `/design-taste-frontend` while building or refining actual screens; use its app-screen workflow for MoniKey's working dashboard UI.
3. `/impeccable critique` or `/impeccable audit` after an interface exists; run the engine with a project-local cache setting to avoid global writes.
4. The project currently uses its local browser harness scripts with `playwright-core` and an available Chromium; it does not include `@playwright/test` or browser binaries. Keep the existing approach unless a reviewed need justifies a change.

Do not ask a design skill to invent architecture, add dependencies, generate a full dashboard template, or override a human-approved `DESIGN.md`.

## Integration boundaries

- React uses relative `fetch('/api/...')` requests. Vite proxies `/api` locally; production routing keeps one origin. The browser never connects to PostgreSQL.
- Card purchases increase expenses and card debt. Card payments reduce the payer balance and card debt, without increasing expenses.
- GitHub Actions tests and builds immutable SHA-tagged images, then publishes them to GHCR. It does not apply resources to the cluster.
- The separate `homelab-gitops` repository records Kubernetes desired state. Argo CD observes/reconciles that Git state; image publication alone does not deploy an image.
- Do not alter or inspect private cluster credentials as part of ordinary app work. Read-only discovery precedes any separately approved GitOps work.

## Safety and knowledge management

Follow [AGENTS.md](../AGENTS.md) and [CLAUDE.md](../CLAUDE.md). Do not commit, push, deploy, change Kubernetes, modify the GitOps repository, run destructive data operations, or install tools globally without explicit approval. Never expose credentials, tokens, kubeconfigs, or personal financial records.

The application repository is authoritative for application architecture and code. `homelab-gitops` is authoritative for Kubernetes desired state. The existing Obsidian vault at `~/main-brain` is a private learning workspace; ask before writing to it, do not duplicate authoritative architecture there, and do not store sensitive data. After a validated milestone, offer a short factual draft with actual checks and results.

## Official agent documentation

- [Codex customization, AGENTS.md, and skills](https://learn.chatgpt.com/docs/customization/overview)
- [Codex model selection](https://learn.chatgpt.com/docs/models)
- [Claude Code skills](https://docs.anthropic.com/en/docs/claude-code/skills)
- [Playwright Test installation and usage](https://playwright.dev/docs/intro)

## Current readiness state

The approved design system, mock-backed finance frontend, and contract-driven HTTP client are implemented through API-plan S3. No backend or database exists yet; live integration is the remaining frontend verification. The [AI agent verification](AI_AGENT_VERIFICATION.md) is a historical onboarding record, not current application test evidence. Current gates and frontend evidence are linked from [ROADMAP.md](architecture/ROADMAP.md#current-progress-and-next-gate).
