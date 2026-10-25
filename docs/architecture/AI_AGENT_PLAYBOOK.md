# MoniKey v1.3 — AI Agent & Model Playbook

**Date:** 2026-10-24  
**Purpose:** Assign one AI coding agent per milestone for the approved React + TypeScript + Vite + Tailwind v4 + selective shadcn/ui + Lucide frontend while keeping changes small, comprehensible, testable, and reviewable.  
**Agents available:** Claude Code and OpenAI Codex.

> **Repository status (2026-10-25):** The owner approved Milestone 5 after personally reviewing the mock frontend in a browser and approved account editing. Automated browser tests and physical-device/screen-reader checks remain unverified. M6–9 are complete. M10 checks and SHA-tagged GHCR publication succeeded in [run 40161329474](https://github.com/Jeysibn/monikey/actions/runs/40161329474). Roadmap numbering is authoritative for acceptance gates.

> Model versions and subscriptions change. **Check Claude Code `/model` and Codex `/model` on your own account.** All names below are preferred choices *when available*, not a promise that your account exposes them.

## 1. Strategy

- **Claude Code:** UI/UX and React + TypeScript owner—`DESIGN.md`, TSX components, typed mock data, Tailwind CSS v4 theme/utilities, **selected** shadcn/ui components, Lucide icons, accessible forms, and the frontend fetch adapter.
- **Codex:** API/data/DevOps owner—PostgreSQL, FastAPI, accounting tests, Dockerfiles, Compose, GitHub Actions, Kubernetes, Argo CD; **read-only frontend reviewer**.
- **Human (project owner):** confirms design, runs/test reviews, approves every phase, and owns production secrets/deployment permissions. Uses a **private Obsidian vault as a second brain** to document what was learned and why.
- **Other agent as reviewer:** inspects accepted scope, security, correctness, and diffs **without editing**, until explicitly assigned a fix.

This allocation is a practical experiment, **not** an assertion that one vendor is inherently better at all frontend or backend tasks. Reevaluate based on real MoniKey outcomes.

## 2. Model recommendations (verified vendor docs Oct 2026)

| Situation | Agent / model | Effort guidance |
|---|---|---|
| UI wireframes and React + TypeScript mock-data implementation | Claude Code — **Sonnet 5.5** | Default/medium |
| Hard UX/design tradeoff or complex frontend bug | Claude Code — **Opus 5.5** | Escalation only |
| Short mechanical edits / renames | Claude Code — **Haiku 5.5** | Simple tasks only |
| Database, API, SQL accounting | Codex — **GPT-6.1 Sol** | Medium for routine; High for business logic |
| Docker Compose and CI scripts | Codex — **GPT-6.1 Sol** | Medium |
| Kubernetes, storage, and GitOps changes | Codex — **GPT-6.1 Sol** | High; human reviews manifests |
| Simple review, tests, formatting, docs | Codex — **GPT-6 Luna** or Claude Haiku 5.5 | Only with explicit test checks |
| Deep cross-cutting architectural decisions | Codex — GPT-6.1 Sol High; optionally Claude Opus 5.5 review | Avoid both agents independently rebuilding the plan |

Vendor guidance: Claude recommends Sonnet for most coding, Opus for difficult work, and Haiku for quick mechanical work. Current Codex documentation recommends GPT-6.1 Sol for complex coding and Luna for focused tasks. Availability may vary by plan/client.

## 3. Milestone ownership and design skills

| Milestone | Editing agent / preferred model | Skills / references | Read-only reviewer | Acceptance criterion |
|---|---|---|---|---|
| 1. Design and wireframes | **Claude Sonnet 5.5** | UI UX Pro Max + Awesome DESIGN.md | Codex Sol | Owner approves three views, Quick Add/Pay Card and `DESIGN.md` |
| 2. React/Vite/Tailwind scaffold | **Claude Sonnet (latest available)** | Official Vite, Tailwind v4, shadcn Vite and Lucide docs | Codex read-only | Vite + Tailwind plugin, `@/*` alias, selected shadcn components; npm build/lint succeed |
| 3. Overview mock prototype | **Claude Sonnet (latest available)** | Taste Skill; Tailwind v4; selected shadcn; Lucide | Codex read-only | Overview works with typed mock data and loading/empty states |
| 4. Activity, Accounts and Quick Add | **Claude Sonnet (latest available)** | Taste Skill; frontend tests | Codex read-only | CRUD, account creation, Pay Card and responsive mock flows work |
| 5. Frontend visual/accessibility QA | **Claude Sonnet (latest available)** | Impeccable, Playwright | Codex read-only; owner approval | Owner approved the mock UI; browser/device checks and their evidence are tracked separately |
| 6. PostgreSQL schema, seed, accounting tests | **Codex GPT-6.1 Sol, High** | PostgreSQL docs | Claude Opus 5.5 | Four tables, constraints, repeatable seed, money rules and disposable DB tests |
| 7. FastAPI endpoints | **Codex Sol, Medium/High** | FastAPI and Psycopg docs | Claude Sonnet 5.5 | CRUD, summaries, validation, error envelopes, shared fixtures, API tests |
| 8. Frontend/API integration | **Claude Sonnet for `frontend/`; Codex for API fixes** | Typed fetch adapter + React state | Codex reviews frontend diff | Live local API journeys and persistence verified by owner |
| 9. Docker Compose/Nginx | **Codex Sol, Medium** | Vite build, Nginx, Compose docs | Claude Sonnet 5.5 | Static build, `/api` proxy, Postgres persistence and restore tested |
| 10. CI and GHCR | **Codex Sol, Medium** | GitHub Actions | Claude Sonnet 5.5 | npm checks + API tests; immutable image tags published |
| 11. Kubernetes + GitOps | **Codex Sol, High** | K8s/Argo docs | Claude Opus 5.5 | Reviewed manifests, private ingress, PVC, tagged image updates, Argo sync |
| 12. Portfolio polish | **Claude Sonnet for UI; Codex Sol for operations docs** | Approved DESIGN.md / docs | Other agent | Sample-only screenshots, architecture diagram, setup/rollback explanation |

**Skill selection:** UI UX Pro Max = design guidance, Taste Skill = implementation visual quality, Awesome DESIGN.md = curated references, Impeccable = critique/audit/polish, Emil Kowalski break-ui = stress test if desired, Playwright = browser verification. Read third-party skill instructions before installing; none are production dependencies. **Tailwind CSS v4, selected shadcn/ui component source, and Lucide React icons ARE approved dependencies** under ADR-015; skills must **not** introduce any additional CSS framework, dashboard template, state/form library or icon pack by default.

**Frontend learning order:** (1) JS values/arrays/functions, (2) interfaces/unions, (3) TSX and React props, (4) Tailwind utility classes/responsive prefixes, (5) inspect shadcn `Button`/`Dialog` source files and theme tokens, (6) named Lucide imports, (7) `useState` and form events, (8) `useEffect`/fetch cleanup, (9) API errors. Explain each topic while building the relevant feature. No advanced types, unnecessary hooks or architecture-heavy boilerplate.

## 4. Model selection instructions

Claude Code:

```bash
claude
# Inside Claude Code:
/model
# Confirm with:
/status
```

Codex:

```bash
codex --model gpt-6.1-sol
# Or interactively launch Codex and use:
/model
```

Use a smaller model only for well-defined low-risk changes, never simply because it is cheaper for financial calculations or deployment security.

## 5. Agent workflow for every small feature

1. **One-sentence goal:** e.g. “Build the mobile Quick Add Expense form using mock data; no API or DB work.”
2. **Read existing requirements:** TLD, ADR, DESIGN.md, and agent guidance. Do not guess prior implementation state.
3. **Plan first:** list files to change, behavior, and tests; gain approval if scope grows.
4. **Single writer:** editing agent modifies only those files in its own branch or clean worktree.
5. **Verify locally:** run relevant tests, inspect browser/screenshot, document actual test command and outcome.
6. **Independent review:** other agent reads the diff, identifies issues with file/line references, no drive-by redesign.
7. **Human checkpoint:** inspect resulting UI or backend behavior; accept or request a focused fix.
8. **Commit:** small descriptive commit, e.g. `feat(ui): add expense form with mock data`.
9. **Learn/document:** give the owner a brief Obsidian-ready Markdown recap (goal, agent/model/skills, changed files, why, exact tests/results, lesson, commit link, next action). The owner checks it and writes their own reflections in the private vault.

**Do not** simultaneously let Claude and Codex write to the same worktree. Use separate Git branches/worktrees for comparative experiments. Never permit an AI tool to delete old repos, recreate the cluster, commit real credentials, or deploy public personal finance data without explicit user authorization.

## 6. Copy/paste project guardrails for `AGENTS.md`

```markdown
# MoniKey AI Coding Rules

- Respect docs/TLD.md, docs/ADR.md, and DESIGN.md.
- App has 3 tiers: React + TypeScript + Vite + Tailwind CSS v4 + selected shadcn/ui + lucide-react, Python FastAPI, PostgreSQL.
- Vite is for frontend development and build only; production frontend uses Nginx static dist/ files.
- Use functional React components, useState/useEffect, typed props and fetch('/api/...') in one frontend/src/api.ts module.
- Tailwind v4 via @tailwindcss/vite and @import "tailwindcss"; one small design-token source. Add only approved shadcn components, initially button/card/input/label/dialog; import Lucide icons by name.
- Do not add React Router, Redux, React Query, Axios, Next.js, full component libraries, giant UI templates or global state libraries without new ADR.
- UI has 3 sections (Overview, Activity, Accounts) and shared Quick Add.
- Four tables only: accounts, categories, transactions, credit_card_payments.
- Credit card purchases are expenses; payments reduce liquid cash and debt but are not expenses.
- Do not add more frameworks, message queues, new pages, services, auth, or bank sync without a new ADR.
- Make one small cohesive change per request; explain all newly added files.
- Never run destructive commands, delete databases, or modify the user's existing cluster without approval.
- Never use image tag latest in GitOps manifests; use versioned SHA tags.
- No personal financial data in demos, examples, logs, or screenshots.
- List exact commands/tests actually run. Never claim tests passed when not run.
```

Add to `CLAUDE.md` a short statement: “Follow `AGENTS.md`; use project-approved skills only in matching frontend phases; don't introduce frameworks or scope expansion.” Codex can use the agent-neutral AGENTS.md. Keep both small to prevent conflict or token bloat.

## Obsidian handoff rule (all milestones)

Claude and Codex should **offer** a small Markdown learning-log summary after a verified task, but **not** automatically edit the personal Obsidian vault. The human is the owner/editor of their own notes. Never copy `.env` values, tokens, kubeconfig files, real financial information or personal account details into summaries. Point to repo commits/PRs and accepted docs; do not reproduce or maintain competing canonical TLD/ADR documents in the vault. See [OBSIDIAN_GUIDE.md](OBSIDIAN_GUIDE.md) and ADR-016.

Suggested summary structure:

```markdown
# Milestone XX — Short title (YYYY-MM-DD)
- Goal:
- Coding agent / model / skills:
- Files or components changed:
- What I learned (in my own words):
- Commands/tests actually executed and results:
- What failed / how it was fixed:
- Commit/PR and architecture-doc links:
- Next action:
```

## 7. Example prompts by owner

**Claude Code — design:**

> Read docs/TLD.md, docs/ADR.md, and AGENTS.md. Create DESIGN.md and responsive wireframe specifications for Overview, Activity, Accounts, and Quick Add. Use UI UX Pro Max guidance. Focus on credit card expenses and payments. Do not implement backend, database, or infrastructure. Show the proposed choices and ask for UI approval.

**Claude Code — Tailwind/shadcn bootstrap:**

> Read AGENTS.md, docs/ADR.md (especially ADR-015), docs/TLD.md and approved DESIGN.md. In frontend/ only, configure Tailwind CSS v4 through `@tailwindcss/vite`, add `@import "tailwindcss"` to src/index.css, configure the `@/*` alias per official shadcn Vite instructions, then initialize shadcn/ui and add only button, card, input, label, dialog. Install `lucide-react`. Keep the Vite /api dev proxy. Inspect and explain each generated file/package and changed design token. Run npm build/lint and report exact outcomes. Do not write any backend or Kubernetes code.

**Claude Code — frontend prototype:**

> Implement the approved Overview screen in React + TypeScript using the Vite react-ts scaffold, **Tailwind CSS v4**, a small number of selected **shadcn/ui Card and Button** components, named **Lucide React** icons, typed props and realistic mock data only. Use Taste Skill as design guidance, follow DESIGN.md, and ensure 360px mobile and desktop layouts work. No full dashboard template, giant components, new dependencies or backend changes. Touch frontend files only. Explain the purpose of every new file and how to preview it.

**Codex — frontend reviewer:**

> Read docs/TLD.md, docs/ADR.md, DESIGN.md, and the diff. Review the frontend implementation **without editing files**. Flag inaccessible controls, broken loading/error states, TypeScript `any` abuse, unnecessary libraries, Tailwind v3 syntax, divergent design tokens, unlabeled Lucide icon buttons, incorrect shadcn Dialog focus/escape, missing fetch cleanup, mobile overflow, or unclear credit card semantics. Report findings with paths and fix suggestions.

**Claude Code — frontend API integration:**

> Read docs/TLD.md, docs/ADR.md, DESIGN.md and AGENTS.md. Replace mock data access in `frontend/src/api.ts` with native fetch calls to relative `/api` endpoints. Keep TypeScript money fields as decimal strings and add loading/empty/error states. Use basic React hooks and request cancellation/cleanup; re-fetch financial totals after successful writes. Touch only frontend files; do not add Axios, React Query, Redux or React Router. Run npm build and browser tests, report evidence.

**Codex — backend:**

> Implement only the accounts and categories endpoints against PostgreSQL using FastAPI and parameterized SQL. Read the docs first. Do not touch frontend or Kubernetes. Add focused tests, run them, and report exact commands and failures.

**Codex — GitOps:**

> Inspect homelab-gitops structure and current cluster resource prerequisites read-only first. Propose minimal new MoniKey manifests with SHA-pinned images. Do not apply, sync, prune, delete, or modify live cluster resources without explicit approval. Verify Postgres PVC strategy and secret handling; document rollout/rollback.

## 8. Required human review gates

- **Gate A (UX approved):** user approves responsive React/TypeScript mock-data screens after `npm run build` and browser checks, before DB/API implementation.
- **Gate B (accounting validated):** automated test proves card payment does not inflate monthly expenses.
- **Gate C (local app verified):** typed React API integration works, Vite `dist/` is served by Nginx, data persists across restarts, and `pg_dump` restore is demonstrated.
- **Gate D (cluster changes approved):** manifest diff and storage/secret/access plan reviewed before first sync.
- **Gate E (portfolio demo safe):** sample data and no publicly writable unauthenticated API.

## Vendor documentation

- Claude Code models and selection: https://support.claude.com/en/articles/11940350-claude-code-model-configuration
- Claude Code workload advice: https://support.claude.com/en/articles/14552983-models-usage-and-limits-in-claude-code
- OpenAI Codex model choices: https://developers.openai.com/api/docs/guides/model-selection
- React with TypeScript: https://react.dev/learn/typescript
- Tailwind CSS v4 with Vite: https://tailwindcss.com/docs/installation/using-vite
- shadcn/ui Vite guide: https://ui.shadcn.com/docs/installation/vite
- Lucide React: https://lucide.dev/guide/react/
- Vite React TS template: https://vite.dev/guide/
- Claude Code custom skills: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview


## Revision history

- **v1.1 (2026-10-24):** Updated frontend ownership and prompts for user-selected React + TypeScript + Vite. Backend/DevOps ownership remains Codex-led.

- **v1.2 (2026-10-24):** Claude frontend ownership expanded to Tailwind v4/shadcn UI source/Lucide; new reviewed bootstrap prompt and UI audit criteria. Codex backend/DevOps ownership and model tiers unchanged.

- **v1.3 (2026-10-24):** Obsidian per-milestone learning summaries added; no change to model assignments or single-writer ownership.
