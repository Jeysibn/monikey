# AI Agent Onboarding Verification

**Historical scope:** configuration, documentation, and skill readiness only. At the time of this report, no application screen, API, database schema, or Kubernetes resource had been implemented. The frontend has since been built through Milestone 4.9; this file records the onboarding checks below, not current application readiness. See [ROADMAP.md](architecture/ROADMAP.md#current-progress-and-next-gate).

## Status definitions

- **Verified:** directly checked with an observed command or agent result.
- **Not verified:** evidence is absent or stale; do not infer success.
- **Blocked:** verification cannot proceed until a prerequisite or access issue changes.
- **Deferred:** intentionally postponed because the feature or need does not exist yet.

## Environment and source checks

| Check | Status | Evidence |
|---|---|---|
| Codex and Claude Code installed | Verified | `codex --version` → `codex-cli 0.163.0`; `claude --version` → `2.1.306`. |
| Codex model catalog | Verified | `codex debug models` lists GPT-6.1 Sol, GPT-6 Astra, GPT-6 Sol, GPT-Reserve, GPT-6 Luna, GPT-5.6 Sol/Terra/Luna, and auto-review. Account entitlement can differ. |
| Codex selected model route | Verified | Read-only `codex exec --model gpt-6.1-sol --sandbox read-only --ephemeral ...` returned the assessment. |
| Claude model route | Verified, alias only | Read-only CLI session with `--model sonnet` returned an assessment. The CLI did not reveal the resolved model version. |
| Claude exact model catalog | Not verified live | Local cached catalog (fetched 2026-10-21, now stale) lists Sonnet 5.5, Opus 5.5, Haiku 5.5, Fable 5.1, and older options. Use `/model` and `/status` to verify exact account options. |
| Claude Code installation health | Verified | `claude doctor` reported no installation issues on version 2.1.306. |
| Architecture sources | Verified | Read the TLD, ADR, roadmap, master plan, AI Agent Playbook, frontend setup, and Obsidian guide from the supplied v1.3 ZIP; exact source copies are in `docs/architecture/`. |
| Source status | Verified | The imported documents say “approved design baseline” and explicitly do not claim implementation or cluster state is verified. |
| Git baseline | Verified | Local `main` branch; no commits or remote. Existing workspace changes are uncommitted. |
| Existing frontend production build | Verified | `cd frontend && npm run build` completed successfully (`tsc -b && vite build`, Vite 8.3.5). This only validates the existing starter; no frontend source was changed. |
| Plugins | Verified | Codex lists OpenAI templates, Pages, Sites, plugin management, and Work Pets; none are MoniKey design plugins. Claude reports no installed plugins. No plugin was installed or changed. |
| Existing Codex skills | Verified by filesystem inventory | Includes `impeccable`, `design-taste-frontend`, `emil-design-eng`, `break-ui`, and `playwright-cli` under user-level `~/.codex/skills`. These are not pinned project copies. |

## Skill checks

| Skill | Status | Evidence / remaining action |
|---|---|---|
| UI UX Pro Max | Verified for Claude discovery/invocation and local script | Claude invoked `/ui-ux-pro-max` read-only and reported its role; `search.py --help` ran. No design query or persistence was performed. |
| Taste Skill | Verified for local script only; Claude invocation deferred | `draw.mjs --app --list kinds` returned the bundled style list without generating design output. Browser inspection is deferred until screens exist; no Chrome/Edge/Chromium executable was found. |
| Impeccable | Skill installed; invocation deferred | Launcher was reviewed but not executed. It downloads a version-pinned, checksum-verified engine to `~/.impeccable` by default. No engine or UI audit was run. |
| Awesome DESIGN.md | Reference only | Reviewed repository and pinned source revision; no runtime files copied. |
| Emil Kowalski | Verified for Codex availability only | Existing Codex skill files are present. Not installed for Claude; motion and worst-case UI runs are deferred until relevant screens exist. |
| Vercel Web Design Guidelines | Deferred | Its skill fetches live checklist content and overlaps with Impeccable. Reconsider for an actual UI audit. |
| Playwright Test | Deferred | Official Playwright Test is the selected project integration. Add and pin it when real browser flows exist; do not install browsers into the empty starter just for onboarding. |

## Knowledge assessment

Both agents completed a read-only assessment. Codex read the architecture sources and answered all ten questions. Claude invoked UI UX Pro Max and answered all ten from `AGENTS.md` and `AI_AGENT_SETUP.md`; for question 2 it pointed to the ADR as the formal rationale and identified the part it had not read as general knowledge.

| Question | Expected answer | Codex | Claude Code |
|---|---|---|---|
| 1. Approved stack? | React + TypeScript + Vite + Tailwind v4 + selected shadcn/ui + Lucide; FastAPI REST; PostgreSQL; Compose; Actions/GHCR; existing Kubernetes + Argo CD. | Verified | Verified |
| 2. Why React + TS + Vite? | Reusable typed UI, quick frontend-first feedback, a simple static build, and an interview-explainable setup without SSR or a long-running frontend service. | Verified | Verified with grounding caveat; Claude pointed to the ADR for the formal rationale |
| 3. Tailwind vs shadcn/ui? | Tailwind is a CSS utility framework; shadcn/ui provides selectable, locally owned React component source that can be styled with Tailwind. | Verified | Verified |
| 4. Frontend → FastAPI data path? | React calls relative `/api/...` with `fetch`; Vite proxies locally; same-origin reverse proxy/ingress routes production requests to FastAPI; FastAPI validates/queries PostgreSQL. | Verified | Verified |
| 5. Why are card payments not expenses? | The purchase was the expense. Repayment reduces the payer's cash-like balance and the card liability; counting repayment again would double-count spending. | Verified | Verified |
| 6. Actions vs Argo CD? | GitHub Actions runs checks/builds and publishes SHA-tagged images to GHCR; Argo CD reconciles Kubernetes desired state from Git. | Verified | Verified |
| 7. Why separate app and GitOps repos? | App repo owns source/tests/architecture; `homelab-gitops` owns desired cluster state and image references, separating delivery from deployment credentials and making changes reviewable. | Verified | Verified |
| 8. Skills for design/refinement/testing? | UI UX Pro Max for planning, Taste for screen implementation/visual direction, Impeccable for audit/refinement, Playwright Test for committed browser tests; use only when appropriate. | Verified | Verified |
| 9. What needs approval? | Destructive data actions, global installs, vault writes, GitOps/Kubernetes changes, deploys, pushes, and commits; never expose secrets or personal finance data. | Verified | Verified |
| 10. Where do learning notes go? | Existing private Obsidian vault `~/main-brain/Projects/MoniKey`, only after explicit approval; repo docs and GitOps remain authoritative for their respective domains. | Verified | Verified |

## Capability and blockers

- Claude successfully invoked UI UX Pro Max; Codex read the v1 architecture and named its existing user-level skills. Taste and Impeccable were not invoked by Claude because their full UI workflows do not apply to an empty starter, and Impeccable can download an engine.
- Claude's first broad knowledge-check run stopped at its configured USD 0.25 per-run cap. A focused read-only rerun completed all ten questions; its question 2 response cited the ADR as the formal rationale, rather than claiming to have read it in that focused run.
- A completed design-system skill query is not approval of a visual direction. Do not persist output or edit `DESIGN.md` during onboarding.
- Browser behavior is deferred because the starter has no MoniKey screens or interactions. Playwright tests should be introduced with the first real flows, not as empty boilerplate.
- Obsidian writes are pending owner approval for this milestone. No new vault note has been created or changed by this onboarding yet.
- No backend/database code, application feature, Kubernetes resource, GitOps file, or deployment was changed.

## Re-run commands

```sh
codex debug models
codex plugin list --json
claude --version
claude plugin list
```

For account-specific model choices, use `/model` and `/status` in Claude Code and `/model` in Codex. Do not copy secrets or account details into this document.
