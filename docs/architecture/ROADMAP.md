# MoniKey v1.3 — Development Roadmap (Frontend First)

**Status:** Approved design baseline. The frontend prototype and contract-driven HTTP client are implemented through API-plan S3; Milestone 6 PostgreSQL schema, category seed, and accounting checks are also implemented. The FastAPI backend, live database integration, and operations milestones remain unimplemented. This is a repository status snapshot, not evidence of a live deployment. **Owner:** user/project owner. **Code agents:** Claude Code and Codex. **Frontend:** React + TypeScript + Vite + Tailwind CSS v4 + selective shadcn/ui + Lucide React. **Backend:** FastAPI. **Database:** PostgreSQL.

## Non-negotiable development principles

1. **One small milestone / one editor:** Claude owns React UI changes, Codex owns API/infra; reviewer comments without modifying that milestone's files.
2. **Design before integration:** Start with actual mobile/desktop screens using typed sample data. Don't block frontend work on PostgreSQL.
3. **Understand what is generated:** Every PR explains added files, props/hooks, Tailwind utilities, shadcn-generated files, Lucide icons, important types, SQL logic and tests. The project owner can reproduce and explain the result.
4. **Scope stays frozen:** Overview, Activity, Accounts and Quick Add; four tables including credit-card payments. Card payments do not count as expenses.
5. **Never claim deployment/test success without evidence.** No unapproved destructive commands or cluster changes.
6. **Obsidian is our second brain, not our source repository.** Capture what you learn after each milestone; canonical TLD/ADR/DESIGN and GitOps changes stay in Git.

## Milestones and acceptance gates

| # | Deliverable | Implementer / recommended model | Reviewer | Definition of done |
|---|---|---|---|---|
| 1 | `DESIGN.md`, mobile-first wireframes and interaction flows | Claude Code, preferred Sonnet model; UI UX Pro Max + Awesome DESIGN.md | Codex read-only; **user approval** | 3 views, Quick Add & Pay Card behavior, semantic Tailwind/shadcn tokens, fonts/colors/spacing and states approved |
| 2 | React + TS + Vite + Tailwind v4 scaffold | Claude Code, preferred Sonnet model | Codex | Create `react-ts` template; install `tailwindcss`, `@tailwindcss/vite`, `lucide-react`; configure `@/*` alias; `shadcn init`, add only button/card/input/label/dialog; `npm run build` works; review diff/lockfile |
| 3 | Overview with typed mock data | Claude Code, preferred Sonnet model; Taste Skill | Codex | Responsive Tailwind layout, small shadcn Cards/Buttons and named Lucide icons; functional mock balances; loading/empty demos |
| 4 | Activity + Accounts + Quick Add, Pay Card | Claude Code, preferred Sonnet model; Taste Skill | Codex | Native account/category selects + selected shadcn inputs/dialog; mock add/edit/delete and card payment UI; small understandable components |
| 5 | Frontend visual/accessibility QA | Claude Code, preferred Sonnet model; Impeccable, Playwright, optional Emil break-ui | Codex; **user approval** | 360px + desktop, no overflow, Tailwind token consistency, Lucide icon labels, dialog keyboard/escape/focus, error/empty/large amounts tested |
| 6 | PostgreSQL schema/seed and accounting tests | Codex GPT-6.1 Sol, High | Claude Opus 5.5 | Four tables, valid constraints, money rules including no payment double count |
| 7 | FastAPI /api endpoints | Codex Sol, Medium/High | Claude | CRUD + summary endpoints, validation, error handling and tests |
| 8 | Frontend/API integration | Claude Sonnet frontend; Codex Sol API fixes only | Codex reviews frontend; **user verification** | Typed fetch replacing mocks, same-origin `/api`, refresh on write, error/loading states |
| 9 | Docker Compose / Nginx production build | Codex Sol, Medium | Claude | Node builder → static Nginx, API, Postgres; data persist after restart, restore works |
| 10 | GitHub Actions + GHCR | Codex Sol, Medium | Claude | npm ci/typecheck/build/lint, backend tests, SHA tags, no cluster credentials in CI |
| 11 | Kubernetes / Argo CD | Codex Sol, High | Claude Opus; **user approval** | Inspect existing GitOps & StorageClass, reviewed manifests, secrets, private ingress, tested rollout/rollback |
| 12 | Portfolio publication | Both, each in owned area | **user approval** | Clean README, sanitized architecture/screenshots, walkthrough and known limitations |

## Obsidian learning deliverable for every milestone

Keep the Obsidian vault **separate from the MoniKey app and GitOps repositories**. It is not part of the React build or any Kubernetes deployment. Use [OBSIDIAN_GUIDE.md](OBSIDIAN_GUIDE.md) and the included vault starter.

| When | Write in Obsidian | Minimum content |
|---|---|---|
| Before Milestone 1 | `00 Home.md` and Project Overview note | Purpose, approved scope, links to canonical TLD/ADR, current milestone |
| Design, React, styling (1–5) | One dated build-log note per completed milestone; concept notes as needed | Screenshot/preview reference; JSX/hooks/TypeScript/Tailwind concept; Claude model/skill used; exact test evidence |
| DB, API and integration (6–8) | Money-rules explainer and API request walkthrough | How card expense differs from card payment; request → SQL → response; actual tests |
| Compose, CI, GitOps (9–11) | Deployment flow and troubleshooting/runbook notes | Commands used, pinned image tag/commit reference, error symptoms, resolution and rollback/backup proof |
| Portfolio (12) | Interview-ready learning summary | Explain each tier, tradeoffs, GitOps update, what broke and how it was fixed |

**Done means:** (1) working and verified milestone, (2) appropriate Git commit/PR, **and** (3) a brief personal Obsidian entry covering *what I did, why it works, how I verified it, and what I learned*. Do not hold code delivery hostage to a polished essay—five factual bullets are sufficient.

## Phase ownership boundary

**Claude Code owns:** `frontend/src/**`, `frontend/src/index.css`, `frontend/src/components/ui/**`, `frontend/components.json`, approved `DESIGN.md`, frontend UX testing and typed API client. **Codex owns:** `backend/**`, `database/**`, Dockerfiles/Compose and `.github/workflows/**`, `homelab-gitops` manifests after user approval. Both may review files outside ownership read-only. Shared docs require a declared editing owner per change.

## Frontend learning milestones

- Intro: JSX/TSX, components, props and `type`/`interface`.
- Interaction: state with `useState`, event handlers, conditional rendering and form input validation.
- Loading data: typed `fetch` function, `useEffect` with cleanup, loading/empty/error UI.
- Styling: Tailwind v4 utility classes and responsive prefixes, shadcn/ui semantic CSS tokens, selected Button/Card/Input/Label/Dialog source, Lucide SVG icons, focus/labels.
- Production: `npm ci`, type-check and Vite build, static `dist/` in Nginx.

## Scope guardrails

- **Allowed upfront:** React, TypeScript, Vite, Tailwind CSS v4, `@tailwindcss/vite`, selected shadcn/ui Button/Card/Input/Label/Dialog source, `lucide-react`, native fetch, basic hooks and one small typed API module. Playwright is development-time browser smoke testing.
- **Requires a new ADR:** Next.js/SSR, React Router, Redux/Zustand, TanStack Query, Axios, additional CSS/UI/icon frameworks, large dashboard templates, chart engines, authentication, offline mode, banking integrations, more business tables/services.
- **Private deployment only** until proper auth exists. Use fictional/sample data in portfolio screenshots and any public demo.

## Current progress and next gate

- **Complete in the repository:** design approval and frontend scaffold; Overview, Accounts, Activity, mock-backed add/edit/delete flows, account creation, responsive/accessibility pass, data-source seam, loading/error/slow states, and the contract-driven HTTP source with strict wire mappers, Vite proxy, and source selection (through API-plan S3).
- **Milestone 5 owner approval:** approved on 2026-10-25 after the owner personally reviewed the mock frontend in a browser. The owner sign-off is complete.
- **Verification evidence still limited:** the committed browser harnesses were not run because `playwright-core` is unavailable in this environment; physical-device and screen-reader checks were not performed. The checklist below records these checks as unverified without changing the owner's M5 approval.
- **Complete in the repository:** Milestone 6 schema, repeatable seed, and accounting SQL checks. The tests use a disposable PostgreSQL container and fictional data, then roll back and remove the container.
- **Next implementation phase:** FastAPI endpoints (Milestone 7), followed by live frontend/backend integration and owner verification (8), and only then Compose (9), CI (10), and private GitOps deployment (11).
- **Evidence and limits:** see [Milestone 4.7](../design/A11Y_RESPONSIVE_4_7.md), [Milestone 4.9](../design/FRONTEND_STATES_4_9.md), [API client S3 report](../design/FRONTEND_API_CLIENT_S3.md), and [database guide](../../database/README.md). `bash database/test.sh` passed against the pinned local PostgreSQL 17.6 image. Real phones, Firefox/WebKit, screen readers, and a running FastAPI backend remain unchecked.

## Frontend styling acceptance checklist (Milestones 2–5)

- [ ] Tailwind CSS **v4** runs through `@tailwindcss/vite`; `src/index.css` imports `"tailwindcss"` and uses one approved semantic token system.
- [ ] shadcn/ui initialized for **this** Vite project; `components.json`, `@/*` alias and reviewed generated files are committed.
- [ ] Only `button`, `card`, `input`, `label`, and `dialog` are added initially; other controls stay native unless justified.
- [ ] Icons imported by name from `lucide-react`, with meaningful accessible labels where no text is visible.
- [ ] Overview, Activity, Accounts, Quick Add and Pay Card render correctly on 360px mobile and desktop.
- [ ] Keyboard, visible focus, escape/close, form labels, error messages and contrast work.
- [ ] `npm run build` and lint succeed; Playwright/browser tests actually executed and recorded.
- [ ] All this is frontend build output—**no extra Kubernetes pod, service, backend endpoint or database table**.

**Version note (2026-10-24):** v1.3 adds an Obsidian second-brain learning workflow; v1.2 styling choices and all functional, financial, privacy and GitOps decisions remain unchanged.
