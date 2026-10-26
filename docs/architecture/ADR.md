# MoniKey v1 — Architecture Decision Records (ADRs)

**Version:** 1.4
**Date:** 2026-10-26
**Status:** Adopted as the design baseline. M5 mock UI approval is recorded; M6–7 and M9–11 are implemented, including the private Kubernetes deployment. M8 API routes were exercised, but the full React/API browser journey and owner acceptance remain pending. CI/GHCR delivery and local Compose behavior passed their recorded checks; M11 rollout, HTTPS ingress, PVC persistence, logical restore, and image rollback were verified on the homelab. ADR-017 adds liquid-account transfers by owner request. See [ROADMAP.md](ROADMAP.md#current-progress-and-next-gate) and the [GitOps deployment runbook](https://github.com/Jeysibn/homelab-gitops/blob/main/docs/MoniKey-Runbook.md) for evidence and limits. Off-cluster disaster recovery remains unverified.
**Related documents:** [TLD.md](TLD.md), [ROADMAP.md](ROADMAP.md), [AI_AGENT_PLAYBOOK.md](AI_AGENT_PLAYBOOK.md)

ADRs explain **why** MoniKey uses each technology or pattern. Changing an accepted decision requires a new ADR or a clearly recorded superseding amendment—not quiet expansion of the scope by a coding agent.

## ADR-001 — Three-tier modular monolith

- **Status:** Accepted.
- **Context:** The former MoniKey grew difficult to understand. New project must be beginner-friendly and impressive for cloud/DevOps interviews.
- **Decision:** One static frontend, one FastAPI backend service, one PostgreSQL database. No microservices or event broker.
- **Alternatives considered:** Next.js full-stack app; microservices with separate account/payment services; Firebase/Supabase backend.
- **Consequences:** Simple request tracing, deployment, and explanation; only one backend to maintain. Scalability and independently deployed business domains are not objectives in v1.

## ADR-002 — Frontend-first with React, TypeScript and Vite (styling delegated to ADR-015)

- **Status:** Accepted (revised 2026-10-24; **supersedes the original ADR-002 decision to use vanilla JavaScript**).
- **Context:** The user wants a polished, maintainable mobile-first UI and explicitly selected React + TypeScript + Vite after considering Vue, Svelte and plain JavaScript. The previous MoniKey became overly complicated; choosing a framework must not reintroduce complexity.
- **Decision:** Build three functional React views (Overview, Activity, Accounts) and one Quick Add overlay/sheet, using Vite's official `react-ts` scaffold, basic hooks, typed API contracts and mock data until UX approval. **Styling is now governed by ADR-015 (Tailwind CSS v4, selective shadcn/ui, Lucide).** The earlier *plain CSS only* constraint in ADR-002 is superseded. No Next.js, SSR, Redux, React Query or frontend microservices. No router library while navigation needs only three in-page views.
- **Alternatives considered:** Vanilla HTML/CSS/JS (original decision), React with JavaScript, Vue 3, Svelte, Next.js.
- **Consequences:** Increased initial learning surface (JSX, props, hooks, TypeScript), plus npm build dependencies; in return, clearer reusable UI parts and compile-time checks. The production artifact remains static files. All edits require plain-language explanations and working browser review. TypeScript does not provide runtime validation of JSON responses. ADR-015 adds styling build-time dependencies and selectively copied UI component code, but no additional deployed tier.


## ADR-003 — Simple PostgreSQL financial data model

- **Status:** Accepted; original table count superseded by ADR-017.
- **Context:** Credit cards are frequently used. Paying a card must not double-count expenses.
- **Decision:** At the time, four tables: `accounts`, `categories`, `transactions`, and `credit_card_payments`. Category determines income vs expense; card payments are separate records, not expenses. Credit cards have limit and opening debt; other accounts have opening balance. ADR-017 adds a dedicated table for liquid-account transfers.
- **Alternatives considered:** Ledger/double-entry accounting system; storing mutable calculated balances; treating every card payment as an expense; all transaction kinds in one highly polymorphic table.
- **Consequences:** Simple arithmetic and auditable history without advanced accounting infrastructure. A later version could introduce an immutable ledger or regular transfers, but not by implication in v1.
- **Caveat:** Cross-table account-type rules require backend validation and tests; DB CHECK constraints alone cannot inspect referenced-row types.

## ADR-017 — Dedicated records for liquid-account transfers

- **Status:** Accepted by the project owner on 2026-10-26.
- **Context:** The owner requested moving money between accounts. Categorized transactions represent income or expenses and must not be used to represent internal movement.
- **Decision:** Add an `account_transfers` table with source account, destination account, positive amount, date, note, and creation timestamp. Transfers may move money only among Cash, Bank, and E-wallet accounts. Source and destination must differ. A transfer decreases the source balance and increases the destination balance; it does not change income, expenses, card debt, or net position. Credit-card payments remain in `credit_card_payments`.
- **API and UI:** Provide transfer list/create/update/delete routes under `/api/account-transfers`; show transfers in Activity and allow correction/deletion. Use the existing account Activity filter for either side. Offer transfer entry from Quick Add.
- **Migration:** Add a forward-only migration and include the table in the empty-database schema. Apply the migration to an existing database only after a verified backup. Deploying the app does not automatically run schema migrations.
- **Consequences:** The schema now has five core tables. Balance queries and activity merging include transfers, while monthly income and expenses remain based only on categorized transactions.
- **Alternatives considered:** Treat transfer legs as paired income/expense transactions (would distort income/expense totals); model transfers as credit-card payments (wrong account semantics); use a general ledger (unnecessary scope).

## ADR-004 — Exact money in the DB and server-side calculations

- **Status:** Accepted.
- **Context:** Currency totals cannot rely on floating-point accumulation in browser JavaScript.
- **Decision:** PostgreSQL `NUMERIC(12,2)`; API amounts serialized as decimal strings; all authoritative financial calculations in SQL/backend. The browser only presents formatted results.
- **Alternatives considered:** JS `number` for all money; integer cent values in every API; storing balances as text.
- **Consequences:** Easy to explain and sufficient accuracy for v1. Monetary amount and scale are validated before inserts or edits.

## ADR-005 — One same-origin app and relative `/api` requests

- **Status:** Accepted.
- **Context:** We want identical frontend behavior locally and under Traefik without CORS complexity.
- **Decision:** Built React/Vite static assets at `/`; FastAPI owns `/api/*`; Vite development server proxies `/api` to local backend without rewrite; production-like Compose Nginx proxies `/api` to backend; Kubernetes Traefik routes `/api` to API Service.
- **Alternatives considered:** Independent frontend/backend domains with CORS; direct browser-to-DB communication; ingress rewrites.
- **Consequences:** The frontend uses only `fetch('/api/...')`. Hostname and routing change between local and cluster, but application code does not. Reverse-proxy paths must be verified in integration tests. Frontend images contain static `dist/` assets, not a running Vite/Node server.

## ADR-006 — FastAPI with direct SQL, not a large abstraction stack

- **Status:** Accepted.
- **Context:** Beginner learning requires understandable request handling and query execution.
- **Decision:** Python FastAPI + Pydantic + psycopg (or equivalent single PostgreSQL driver). Small `main.py` / `database.py` initially; organize only when growth justifies it.
- **Alternatives considered:** Prisma, SQLAlchemy ORM, NestJS, multi-layer clean-architecture boilerplate.
- **Consequences:** Less magic, more visible SQL and domain reasoning. Requires careful parameterized queries and explicit connection/transaction handling; automated API tests are mandatory.

## ADR-007 — Docker Compose before Kubernetes

- **Status:** Accepted.
- **Context:** Need isolate application bugs before mixing them with cluster networking and storage problems.
- **Decision:** Get all three services working in Docker Compose with persistent named DB volume; only then port to existing cluster.
- **Alternatives considered:** Develop directly in k3s; deploy a separate cloud stack.
- **Consequences:** Faster feedback, simpler troubleshooting, and repeatable setup. Compose is for local dev, not a substitute for Kubernetes manifests.

## ADR-008 — GitHub Actions for CI, GHCR for images, Argo CD for CD

- **Status:** Accepted.
- **Context:** Existing homelab uses GitOps and Argo CD. Previous `latest` tag deployments made it hard to understand why frontends did not update.
- **Decision:** CI tests and publishes API/frontend images with unique commit-SHA tags. A separate `homelab-gitops` commit updates pinned references; Argo CD syncs desired state. The CI runner does not directly `kubectl apply` to the cluster.
- **Alternatives considered:** `latest` image tag and `rollout restart`; CI with cluster admin kubeconfig; automatic image-registry polling from day one.
- **Consequences:** Reproducible deploys, easy image-level rollback, clear responsibilities. Two intentional steps are required: publish an image, then promote the GitOps manifest to it. Full deployment automation may be added later with a separate approved ADR.

## ADR-009 — Stateful PostgreSQL with backup, not high availability

- **Status:** Accepted with deployment prerequisites.
- **Context:** Homelab is modest; finance records should survive restarts but a pod/PVC is not a disaster-recovery strategy.
- **Decision:** One PostgreSQL StatefulSet replica, internal-only Service, persistent volume via a **verified** StorageClass, and a documented/tested logical backup/restore procedure. Schema bootstrap runs only on an empty DB.
- **Alternatives considered:** Stateless database pod; managed cloud DB; clustered PostgreSQL/high availability; importing the old MoniKey database.
- **Consequences:** Low operational overhead. Single node, storage damage, and operator error can still cause downtime/data loss; backups are essential. Do not claim resilience beyond tested boundaries.

## ADR-010 — Private deployment until authentication exists

- **Status:** Accepted.
- **Context:** MoniKey tracks personal financial records and v1 intentionally excludes authentication.
- **Decision:** Deploy behind trusted private network access (e.g., Tailscale), with PostgreSQL internal-only and application credentials outside source control. A public portfolio demo uses **sample data and a non-writable/mock API** or must wait for a future authenticated version.
- **Alternatives considered:** Public writeable site without sign-in; basic URL obscurity; adding auth immediately.
- **Consequences:** Privacy is protected without scope creep, at the cost of no live public personal tracker. An authenticated public deployment needs a new security ADR.

## ADR-011 — Project-scoped AI skills and single-writer agent workflow

- **Status:** Accepted.
- **Context:** User uses Claude Code and Codex and selected multiple third-party frontend-design skills; previous AI-led app grew overcomplicated.
- **Decision:** Claude Code (typically Sonnet 5.5) owns React/TypeScript UI design and implementation using UI UX Pro Max, Taste Skill, and later Impeccable. Codex (typically GPT-6.1 Sol) owns SQL, API, API tests, Compose, Docker, CI and GitOps; Codex also reviews frontend diffs read-only. Claude owns frontend API adapter and UX integration to minimize cross-agent rewrites. Pair each major phase with an independent reviewer, but allow **one agent to edit files at a time**. Read-only reviews are preferred.
- **Alternatives considered:** Both agents simultaneously change the same directory; installing every available skill globally; unlimited agent autonomy; choosing the most expensive reasoning model for all tasks.
- **Consequences:** Faster convergence and clearer code ownership; explicit checkpoints needed. Third-party skill instructions and scripts must be inspected before installation. All acceptance criteria are verified by tests and human approval, not by AI claims.

## ADR-012 — Scope freeze and simple operations

- **Status:** Accepted.
- **Context:** The project's value comes from usability, correctness, and a defensible end-to-end deployment, not from feature count.
- **Decision:** Freeze v1 features. Defer investments, budgets, recurring payments, automatic feeds, advanced graphs, recurring workflow schedulers, and extra pages. ADR-017 explicitly authorizes liquid-account transfers.
- **Alternatives considered:** Expand functionality during each new design iteration.
- **Consequences:** Clear finish line and smaller maintenance burden. Bugs and accessibility improvements within the accepted scope are still allowed.

## ADR-013 — Small, typed frontend data boundary without state libraries

- **Status:** Accepted (2026-10-24).
- **Context:** React has many third-party ecosystem choices; adding state managers, form frameworks, routers and HTTP caches is easy but not necessary for three views.
- **Decision:** Use `useState` / `useEffect` with cancellation/cleanup for API reads, `fetch` from one `src/api.ts`, TypeScript interfaces/unions in `src/types.ts`, and a swap from typed mock data to real API implementations. Refresh backend-derived totals after successful writes. Keep one page `/` with view state; use component props instead of Redux, Zustand, TanStack Query, Axios or React Router.
- **Alternatives considered:** Redux/Zustand, React Query, React Router, Axios, generated API clients, client-side caching and offline mode.
- **Consequences:** Minimal dependencies and transparent data flow; some refetching and manual loading/error state code. If those become proven pain points, write another ADR with evidence, not speculative abstractions.

## ADR-014 — Vite production build served by Nginx

- **Status:** Accepted (2026-10-24).
- **Context:** Vite is a development/build tool, not a production application server. Kubernetes deployment should remain three tiers, and changes must be reproducible.
- **Decision:** Use a frontend multi-stage Dockerfile: pinned supported Node image builds `npm ci && npm run build` → Nginx stage copies `dist/`. Development uses `npm run dev` and `/api` proxy; Compose uses Nginx proxy; Kubernetes uses Traefik prefix routing. CI checks TypeScript and Vite production build; images are tagged by full commit SHA.
- **Alternatives considered:** Running `vite dev` or `vite preview` in Kubernetes; keeping a Node app server; a complex SSR framework.
- **Consequences:** Lean runtime image and established static-serving model. Nginx config, asset caching and `/api` path behavior must be tested. Build-time `VITE_*` variables are browser-visible and cannot contain secrets.

## ADR-015 — Tailwind CSS v4, selective shadcn/ui and Lucide React

- **Status:** Accepted (2026-10-24); **supersedes the plain CSS-only styling restriction in ADR-002**.
- **Context:** The user explicitly selected Tailwind CSS v4 + selective shadcn/ui + Lucide after reviewing plain CSS, CSS Modules, Mantine and other styling approaches. The UI must be polished and mobile-first without creating an opaque frontend or adding deployed infrastructure.
- **Decision:** Keep **React + TypeScript + Vite**. Install `tailwindcss` plus `@tailwindcss/vite`; import `@import "tailwindcss";` in `src/index.css`; configure a compact semantic color/type/spacing system in the approved `DESIGN.md` and CSS tokens. Initialize shadcn in the **existing** Vite project and initially add **only** `button`, `card`, `input`, `label`, `dialog` component source. Use native `<select>` for account/category dropdowns and only add more components with demonstrated UX need. Use individually imported SVG components from `lucide-react` for icons; accessible names remain required on icon-only controls. Preserve native React hooks and `fetch('/api/...')`, no new global state or form library.
- **Alternatives considered:** Handwritten plain CSS, CSS Modules, Sass, Mantine, complete shadcn dashboard templates, Material UI, Chakra UI, additional icon libraries.
- **Benefits:** Rapid consistent responsive styling, editable local shadcn source files, accessible dialog primitives, repeatable design tokens, typed lightweight icon imports; supports the chosen Claude design skill workflow.
- **Tradeoffs:** Developers must learn utility classes, inspect generated shadcn files/dependencies, and maintain compatible theme variables. Utility-heavy markup can become difficult to read: keep TSX components small, avoid giant class strings and duplicate styling systems. The shadcn initializer adds files and may install component dependencies, so run it in an isolated reviewed change and commit its configuration and lockfile.
- **Boundaries:** No `shadcn add --all`, no dashboard templates or animation frameworks, no additional styling library, no multiple competing token files, and no replacing accessible components with icon-only controls lacking text/ARIA labels. Tailwind v4 uses the official Vite plugin and CSS `@import`, **not** Tailwind v3 init directives. `src/components/ui/` is vendored source code, not a separate service or runtime. All compiled styles bundle with the existing Nginx-served `dist/`. Any expansion requires a small documented reason and human sign-off.
- **Testing:** `npm ci`, template typecheck, `npm run build`, lint; 360px mobile/desktop browser checks, keyboard tab/focus/escape for Dialog, labeled inputs, color contrast, accessible icon buttons and no horizontal overflow.
- **References:** https://tailwindcss.com/docs/installation/using-vite · https://ui.shadcn.com/docs/installation/vite · https://ui.shadcn.com/docs/cli · https://lucide.dev/guide/react/

## ADR-016 — Obsidian is the personal learning vault, not the engineering source of truth

- **Status:** Accepted (2026-10-24).
- **Context:** The project owner wants to use Obsidian as a second brain to learn React/TypeScript, finance-domain rules, debugging, CI/CD and Kubernetes, and to remember why decisions were made. The former MoniKey grew too complicated to understand.
- **Decision:** Keep a **separate personal Obsidian vault** with a minimal Home page, milestone journal, concept notes, troubleshooting notes, open questions, and decision reflections. Use normal Markdown and Obsidian's built-in links. **Canonical and reviewable** technical decisions stay in `monikey-v2/docs/` and `DESIGN.md`; deployable desired state stays in `homelab-gitops`. Vault notes link to committed docs/PRs, never silently supersede them. Each completed milestone includes a short human-verified reflection, actual test evidence, and the next action.
- **Alternatives considered:** No external notes; putting the entire vault inside the application repo; project-management plugins/databases; AI-generated notes automatically committed without review.
- **Consequences:** Better learning continuity, debugging history and interview explanations without adding any application dependency, Kubernetes service, API endpoint, table or frontend package. A small manual documentation habit is required; avoid duplicated authoritative architecture pages.
- **Privacy:** Vault is private by default. Never store account numbers, real transactions, passwords, tokens, kubeconfigs, `.env` contents or database dumps. Vault backups are separate from database backups.
- **Change control:** If an Obsidian note proposes a new stack, feature or deployment decision, raise a change to repo `ADR.md`/`TLD.md` and obtain approval before coding or deploying.

## Change-control template

Use this for future changes:

```markdown
### ADR-0XX — [Concise decision]
- Status: Proposed / Accepted / Superseded
- Context: [What problem exists?]
- Decision: [What will we do?]
- Alternatives: [What else was considered?]
- Consequences: [Benefits, costs, risks]
- Supersedes: [Prior ADR, if any]
```

## Sources

- Argo CD: https://argo-cd.readthedocs.io/en/latest/user-guide/ci_automation/
- Kubernetes persistent StatefulSets: https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/
- Kubernetes Secrets good practices: https://kubernetes.io/docs/concepts/security/secrets-good-practices/
- Claude Code models: https://support.claude.com/en/articles/14552983-models-usage-and-limits-in-claude-code
- Codex models: https://developers.openai.com/api/docs/guides/model-selection
- React TypeScript: https://react.dev/learn/typescript
- Vite react-ts template: https://vite.dev/guide/
- Vite build: https://vite.dev/guide/build
- Tailwind CSS v4 Vite: https://tailwindcss.com/docs/installation/using-vite
- shadcn/ui Vite: https://ui.shadcn.com/docs/installation/vite
- Lucide React: https://lucide.dev/guide/react/


## Revision history

- **v1.0:** ADR-002 specified vanilla frontend.
- **v1.1:** ADR-002 replaced by React + TypeScript + Vite decision; ADR-013 and ADR-014 added. All other v1 functional scope decisions retained.

- **v1.2 (2026-10-24):** ADR-015 accepts Tailwind CSS v4, selective shadcn/ui and Lucide React, overriding only ADR-002’s former plain CSS limitation; all four-table accounting, FastAPI and GitOps decisions stay intact.

- **v1.3 (2026-10-24):** ADR-016 accepts a separate Obsidian second-brain learning workflow; repository and GitOps remain authoritative.
- **v1.4 (2026-10-26):** ADR-017 accepts transfers between liquid accounts, adding a dedicated table and API/UI flow.
