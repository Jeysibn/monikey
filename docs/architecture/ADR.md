# MoniKey v1 — Architecture Decision Records (ADRs)

**Version:** 1.8
**Last reviewed:** 2026-11-10
**Status:** ADR-022's installation-wide category model and archive-safe history are implemented in merged PRs #20–#22. This records accepted source architecture; it does not claim migration 007 or the latest images are deployed. Current deployment evidence is summarized in [ROADMAP.md](ROADMAP.md#current-source-and-release-status).
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
- **Decision:** The original implementation began with Overview, Activity, and Accounts plus a Quick Add overlay, using Vite's `react-ts` scaffold, basic hooks, typed API contracts, and mock data. The current app has five in-page views (Overview, Activity, Accounts, Categories, Kakeibo) and still uses local view state rather than a router. **Styling is governed by ADR-015 (Tailwind CSS v4, selective shadcn/ui, Lucide).** The earlier *plain CSS only* constraint is superseded. No Next.js, SSR, Redux, React Query, or frontend microservices.
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

### ADR-008 amendment — Automated, backup-gated GitOps release

- **Status:** Accepted by the owner request on 2026-11-07; implementation is proposed in the deployment-pipeline PRs.
- **Decision:** A successful `main` CI run publishes the existing frontend/API images with the same immutable `sha-<full-git-sha>` tag, then dispatches the matching SHA to `homelab-gitops`. GitOps verifies a logical backup by restoring it to disposable PostgreSQL before promoting image refs. Argo CD's existing automated sync runs a migration Job as a PreSync hook, then rolls out the synchronized application images. A failed backup or migration prevents promotion or app rollout. GitOps Actions waits for Argo health and the private API readiness endpoint.
- **Migration safety:** `database/001_init.sql` remains empty-database initialization only and is never run by the migration runner. Forward migrations are applied in numeric order; a PostgreSQL advisory lock prevents concurrent execution. `monikey_schema_migrations` stores version, SHA-256 checksum, and applied time. Unknown versions, checksum drift, gaps, partial schema markers, or an unrecognized schema stop the run. A separate protected one-time adoption operation verifies a backup and recognizes the complete live schema before recording its baseline; routine releases do not need that approval after adoption.
- **Credentials:** Existing GitOps Tailscale, namespace-scoped kubeconfig, backup-encryption, and Argo CD credentials remain in `homelab-gitops`. MoniKey receives only a fine-grained token that can dispatch the release event to that repository. No Kubernetes or database credential is copied into source control.
- **Rollback:** Restore prior paired frontend/API SHA tags through a reviewed GitOps change. Schema changes remain forward-only; restoring an image does not roll back the database.
- **Alternatives considered:** CI-held cluster credentials; a manually edited GitOps commit per release; registry polling; automatic schema reset; running 001 against an existing database.
- **Consequences:** Releases no longer need a manual manifest edit or homelab command. The first adoption still requires a protected GitHub Environment approval after backup verification. Application images and migrations remain traceable to one MoniKey commit.

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
- **Context:** React has many third-party ecosystem choices; adding state managers, form frameworks, routers and HTTP caches is easy but not necessary for MoniKey's small set of in-page views.
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

## ADR-018 — Edit current account amounts

- **Status:** Accepted by explicit owner request on 2026-10-30 to edit the current amount instead of the opening balance.
- **Decision:** Edit account loads and accepts the current liquid balance or signed card debt. The server computes `new baseline = old baseline + requested current amount - computed current amount`. Existing transactions, card payments, and transfers remain unchanged; no income or expense is created. Account creation retains its existing opening-value contract, and account type stays immutable.
- **Signed amounts:** Negative current liquid balances and negative card debt (card credit) are supported. Baselines may need to be negative even for a nonnegative requested total; migration 003 removes only the two nonnegative baseline constraints. Account-type constraints, NUMERIC(12,2), and positive credit limits remain. Reject corrections if the resulting baseline is outside NUMERIC(12,2).
- **API:** GET/PUT `/api/accounts/{id}` use `current_balance` and `current_debt`, both decimal strings, in place of edit-only opening fields. PUT also accepts name, immutable type, and credit_limit. Frontend/API must be released together after a verified backup and reviewed migration application. No migration or deployment is automatic.
- **Consequences:** The current amount becomes the user's correction target. Future activity changes it normally. Historical records and monthly income/expenses are preserved, but baseline-dependent balances and net position change. This supersedes only the previous opening-value editing behavior; no new table, dependency, or transaction kind is introduced.

## ADR-019 — Wallet artwork is presentation-only

- **Status:** Accepted by explicit owner instruction on 2026-11-02; amended by owner instruction the same day to allow and include AI-generated concept artwork.
- **Context:** The proposed wallet-card UI uses a card image, while the approved visual system avoids decorative illustrations and gradients.
- **Decision:** Allow a static artwork image as a visual-only exception for wallet cards. Use an original neutral MoniKey fallback whenever no artwork is selected or a saved selection is no longer valid. Bundle official issuer artwork only after the exact product/source is verified and permission evidence for redistribution is recorded. Catalog entries must be approved, match the account type, and reference a local allowlisted asset path before they can be selected. Candidate, verified-only, rejected, retired, missing, and mismatched entries resolve to the neutral fallback. AI-generated concept artwork is also allowed and included: it is bundled as local files under `/card-art/generated/` (one per catalog card, made from [the card-art brief](../design/CODEX_CARD_ART_BRIEF.md)), labeled in the picker as demo images that are not official issuer artwork, limited to matching account types, and selectable without the official-artwork approval gate. Artwork does not alter account type, balances, API payloads, calculations, or ledger records.
- **Consequences (original, partly superseded by the 2026-11-03 amendment below):** Local images can be rendered without runtime issuer/CDN requests. The initial catalog contains no approved official issuer assets; product-variant verification and licensing/permission evidence remain open for every official issuer design. Nineteen AI-generated demo card images (about 0.75 MB in total) ship with the app, one per card in the catalog; they replaced the first eight concept PNGs on 2026-11-02 and are expected to be replaced or refined. They resemble issuer cards and show issuer and card-network names (for example BDO, GCash, Maya, Visa, Mastercard); the owner accepts this for MoniKey's personal use.

### ADR-019 amendment — Release-safe artwork and Atome exclusion (2026-11-03)

- **Status:** Accepted for the release-safety remediation (draft PR `fix/card-artwork-release-safety`). Supersedes the AI-generated-artwork permission above.
- **Context:** The nineteen generated WebP files imitate issuer card faces and show issuer and card-network names, and no source, license or redistribution approval is recorded for them. The repository is public, so shipping them in a release asserts rights MoniKey cannot show. Separately, `atome-credit-black` was listed as a conventional credit card, but research found a prepaid Mastercard with buy-now-pay-later behaviour that MoniKey's credit-card model does not represent.
- **Decision:** (1) Remove the nineteen files and their manifest from the tree. Every wallet card, in Add/Edit account, the Accounts gallery, the Overview deck and the details dialog, uses the original neutral artwork `/card-art/monikey-default.svg`, which was authored in this repository. (2) Keep the text-based selector: bank or provider, then product name, with ids, account-type validation and server-stored choices unchanged. The name is a label; the UI says it is not the issuer's official design and shows no issuer imagery. (3) Remove Atome from selectable products. A stored `atome-credit-black` (or its old concept id) shows the neutral card with no product name; it is not remapped to another type, and the stored id, account type, balances and debt are never rewritten. No BNPL support is added. (4) `npm run artwork:validate` now fails if any file under `frontend/public/card-art` or a built `dist/card-art` is not the MoniKey default or a catalog-approved asset, or if source references a removed artwork directory.
- **Distinguishing artwork:** *Original MoniKey artwork* is authored for this project and may ship. *Issuer-specific artwork* (official or imitative, including AI-generated lookalikes) may ship only as an approved catalog entry with a recorded source page, verification date and redistribution evidence, and an exact product match. None is approved today.
- **Requirements to reintroduce issuer artwork:** identify the exact product and variant; record redistribution permission or a license naming this use; import it through `npm run artwork:import` so the catalog and validator agree; never regenerate or imitate issuer faces; render with no unverified text, numbers or marks. Atome needs a product-model ADR (prepaid / BNPL semantics) before it can be selectable again.
- **Git history:** the removed files remain in earlier commits of the public repository. Deleting them from the release branch does not erase those commits, and no history rewrite is performed here; whether to purge history is a separate owner decision.
- **Consequences:** Cards look alike apart from the name label; the product name is still saved with the account. Accounting and API payloads are unchanged.

## ADR-020 — Store each account's chosen card in the database

- **Status:** Accepted by explicit owner instruction on 2026-11-02. Implemented on 2026-11-02: Codex added migration 004 and the API field ([handoff](../design/CODEX_HANDOFF_ADR_020.md)); Claude wired the frontend. Migration 004 is not yet applied to any database.
- **Context:** ADR-019 kept the wallet card choice in browser storage, so it was lost when site data was cleared and did not follow the owner to other devices. The owner wants the choice saved with the account, settable for existing accounts, and changeable at any time from Edit account.
- **Decision:** Add one nullable column, `accounts.card_product_id VARCHAR(64)`, holding a card ID from the frontend catalog (`frontend/src/wallet/cardProducts.ts`, for example `bdo-visa-classic`). Cash accounts must keep it `NULL`. The API returns it for every account and accepts it on create and update. The server checks only its shape (lowercase words joined by hyphens) and the cash rule, not whether the ID exists in the catalog; the frontend renders an unknown ID as the neutral MoniKey card. The value is presentation only: it never changes account type, balances, debt, limits, calculations, or ledger records.
- **Alternatives:** Keep browser storage only (rejected: lost on clear, no sync); a card-catalog table (rejected: a sixth table and duplicated catalog upkeep for a cosmetic choice).
- **Consequences:** The five-table scope is unchanged and no dependency is added. Migration 004 must be reviewed and applied after a verified backup, like 002 and 003. Until it is deployed, the frontend keeps the choice in browser storage; afterwards it sends any locally saved choice once for accounts whose stored value is `NULL`, then clears the local copy. ADR-019 still governs which artwork may be shown; this ADR replaces only its "artwork does not alter API payloads" clause, because the card ID is now part of the account payload.
- **Supersedes:** The browser-only storage in ADR-019.

## ADR-021 — Integrate Kakeibo as planning and reflection metadata

- **Status:** Accepted for staged implementation on 2026-11-02. PR A defines the architecture and schema; API, UI, and release acceptance remain future work.
- **Context:** The owner wants a private, single-user Kakeibo practice in MoniKey without creating a second accounting system or changing wallet behavior.
- **Decision:** Keep the five financial tables authoritative. Add `kakeibo_envelope` to expense transactions and a nullable suggestion field to expense categories. Add only `kakeibo_month_plans` and `kakeibo_weekly_reviews` as metadata tables. Historical expenses stay unclassified until explicitly reviewed. Monthly plan arithmetic and reflections never create or modify accounts, transactions, card payments, or transfers.
- **Planning and reporting:** Use the four envelopes `needs`, `wants`, `culture`, and `unexpected`. Compute plan availability as planned income plus explicitly allocated starting funds, less savings target and prior-period debt reserve. Compute envelope actuals from expense transactions by calendar month. Purchases on credit cards count once; card payments and liquid transfers are excluded. Preserve negative envelope remainders and show unclassified historical expenses separately while including them in total expenses.
- **Savings and closeout:** Keep the savings target distinct from optional user-declared actual savings. Neither is derived from leftover envelope limits, balances, or transfers. On closeout, preserve a compact decimal-string snapshot of actual income, total expenses, four envelope totals, and unclassified expenses. Later ledger changes may flag the snapshot as stale but must not rewrite it.
- **API compatibility:** Future transaction fields are optional during rollout. Old create requests with no envelope save `NULL`; old update requests that omit the field preserve the existing classification. Explicit `null` clears it. Income transactions must have `NULL`; only expense categories may have defaults. All API money remains decimal strings. PR A adds no endpoint implementation.
- **Migration:** Use forward-only `database/005_kakeibo.sql`, after ADR-020 migration 004. Existing transactions are not backfilled. Existing databases require a verified backup, rehearsal on a prior-schema copy, and a reviewed restore/rollback plan before applying. Compose applies 005 only when initializing a new empty database.
- **Alternatives:** Store envelopes as categories (rejected: multiple expenses with one category may have different intent); derive savings from transfers or budget leftovers (rejected: they do not prove actual saved funds); add a separate budgeting ledger or service (rejected: duplicates financial state and adds unnecessary scope).
- **Consequences:** The schema grows to seven total tables: five financial tables and two Kakeibo metadata tables. Cross-table validation of transaction category type remains an API responsibility; the category-default expense-only rule is enforced as a row constraint. Off-cluster disaster recovery remains a release risk.
- **Boundaries:** No banking integration, automatic expense labeling, notifications, new payment methods, automatic savings transfers, authentication, multiuser support, or public writable access. Wallet/card artwork remains unchanged.

## ADR-022 — Manage categories without rewriting ledger history

- **Status:** Accepted; implemented in MoniKey PRs #20–#22. Deployment remains a separate release decision.
- **Context:** The category catalog currently contains seeded income/expense rows only. Transactions reference `categories.id`, and Kakeibo stores a nullable envelope on each transaction plus a separate suggested envelope on expense categories. Renaming, changing a suggestion, or removing a category must not recategorize past activity or change balances.
- **Decision:** Continue using `categories` as the only category table. Existing seeded rows remain in place with their current integer IDs; custom categories are rows in the same table. Because v1 has one private installation and no authentication or user table, the catalog is installation-wide, like accounts and transactions. Do not add a user/owner column or claim per-user authorization. A category's `type` is immutable. Names are trimmed and whitespace-collapsed by the API and unique case-insensitively per type, including archived rows.
- **History and lifecycle:** Add `is_archived` with a false default. Archiving hides a category from new-transaction choices but does not change transactions or their stored envelopes. Historical reads continue to resolve the category ID and current name, and an existing transaction may be edited while retaining an archived category ID. Restore re-enables future selection. A database trigger rejects assigning an archived category to a new transaction, including from an older API build after rollback; updates that retain an existing archived category are allowed. Permanent deletion is allowed only when no transaction references the category; the API locks the category before checking references, and the foreign key remains the final concurrency guard. All transaction references count, including any retained rows.
- **Kakeibo:** `default_kakeibo_envelope` remains a suggestion for future entry only. The four fixed values are unchanged. Updating a default never updates transaction envelopes. Income categories cannot carry a default.
- **Migration and rollout:** Migration 007 is additive, leaves category IDs, defaults, transaction rows, amounts, and envelope classifications unchanged, and runs through the existing checksum and backup-gated migration runner. Older API code can ignore the added column; the new API requires migration 007. The feature PRs are stacked so the category screen and transaction-form support can be reviewed before the UI exposes archive actions. No GitOps workflow or deployment trigger changes are part of this ADR.
- **Alternatives:** Add a separate custom-category table (rejected: it splits lookups and requires transactions to distinguish two category sources); add owner IDs (rejected: multiuser/authentication is explicitly out of scope); rewrite past envelopes when defaults change (rejected: it would alter financial history); delete referenced rows (rejected: it breaks stable references).
- **Consequences:** Renaming a category changes its displayed label in historical activity because transactions store the stable category ID, not a category-name snapshot. Amounts, income/expense type, balances, and stored Kakeibo envelopes remain unchanged. The unauthenticated single-user boundary remains the trusted private network.

### ADR-021 amendment — Track explicit plan presence

- **Status:** Accepted and implemented in the merged Kakeibo source. Its dated deployment and recovery notes remain evidence for the PR E rehearsal only.
- **Context:** Monthly plans and reflections share one metadata row. In PR B, saving a reflection without a plan created that row, and its numeric defaults made it look like a deliberately saved all-zero budget.
- **Decision:** Migration 006 adds nullable `plan_presence` with `saved` and `not_saved` values. A plan PUT sets `saved`; a reflection-only insert sets `not_saved`. The API returns `plan_status` and puts a saved reflection in a separate top-level `review` field. A deliberate all-zero plan remains a plan.
- **Legacy compatibility:** Existing rows retain `plan_presence = NULL`, reported as `legacy_unknown`. The migration does not infer intent from zero values, dates, or review fields. The existing plan values and reflection remain readable. A later explicit plan PUT confirms the plan as saved; unresolved rows require owner review before any manual backfill.
- **Write behavior:** Review writes preserve plan fields and presence on existing rows; plan writes preserve review answers and snapshots. Only an explicit monthly review save refreshes its financial snapshot. Ledger edits never rewrite it.
- **Alternatives:** Nullable plan amounts (would spread null handling across each plan field); infer absence from zero values or review timestamps (ambiguous and unsafe).
- **Consequences:** Fresh databases apply migration 006 after 005. Existing databases apply it once after verifying migrations and rehearsing backup/restore. The added nullable field is tolerated by older code, but an older API writing a new plan cannot set its presence; on re-upgrade that row remains explicitly `legacy_unknown` until confirmed. A frontend receiving a non-null plan from an older API without `plan_status` treats it as `legacy_unknown` rather than assuming it was deliberate.

### ADR-023 — Optional persistent category icons

- **Status:** Accepted by the owner's UI modernization mission; implementation originated in PR #27, is consolidated into Draft PR #25, and is not a deployment record.
- **Context:** Category names appear in management, transaction entry and historical Activity. Optional visuals can make scanning easier, but arbitrary uploads or executable component names create asset, safety and maintenance costs.
- **Decision:** Store an optional nullable `categories.icon_key` string from one curated Lucide registry. The frontend uses stable keys and a safe generic category fallback; the API validates keys against a closed allowlist, and migration 008 adds a matching database check. Users can set, edit and clear the selection. Category names remain visible everywhere.
- **Compatibility and history:** Existing categories remain `NULL`. Omitted icon fields continue to work for old clients; a missing or unknown response key resolves to the fallback. Icon changes never alter category IDs/types, transactions, amounts, account positions, archive state, defaults or saved Kakeibo envelopes. Do not backfill or infer icons as data migration behavior.
- **Alternatives:** Arbitrary image upload (deferred: storage, sanitization, rights and lifecycle requirements); arbitrary Lucide component names or URLs (rejected: not a stable safe contract); deriving icon from category text (rejected: labels are user-editable and inference would change unpredictably).
- **Consequences:** Frontend, API and migration allowlists must stay in sync; adding or removing keys needs a coordinated code/schema update. The migration uses the existing checksum and backup-gated release runner; production rollout remains a separately authorized operation.

### ADR-024 — Separate analytics Dashboard from Overview

- **Status:** Accepted by the owner's UI modernization mission; implementation originated in PR #28 after category icons, is consolidated into Draft PR #25, and is not a deployment record.
- **Context:** Overview is the daily position and action-oriented home, while users also need trend and category analysis. A large chart page would bury balances and recent activity.
- **Decision:** Keep Overview as the default landing view and add a separate Dashboard for period-based analysis. The Dashboard must use server-aggregated decimal-string data from bounded date/account filters; the browser does not sum paginated transactions as authoritative financial data. Transfers and credit-card repayments are excluded from income/expense cashflow; card purchases remain expenses exactly once. Kakeibo planned-versus-actual uses saved plans and stored transaction envelopes. No historical balance/net-worth chart is shown without a reliable ledger reconstruction model.
- **Consequences:** A bounded analytics API and explicit metric definitions require backend queries/tests. The interface will show data periods and no-plan/no-data states, and provide text alternatives for charts. No production deployment or migration is authorized by this ADR.

### ADR-025 — Dashboard charts are native SVG; two independent date scopes

- **Status:** Accepted (owner decision, 2026-11-12). Amends the "no charts" boundaries of ADR-015, `DESIGN.md` and ADR-024 for the Dashboard only. Overview, Accounts and Kakeibo stay chart-free. Implementation is local and unreleased.
- **Context:** The approved redesign adds analytics for "where did my money go": monthly income versus expenses, spending by category, daily and weekday spending, and Kakeibo plan versus actual, with a Reporting Month and a separate Analysis Date Range. A charting library was evaluated in an isolated experiment ([measurements](proposed/ADR-025-FEASIBILITY-recharts-measurements.md)): Recharts 3.10.1 is MIT-licensed, adds 38 packages (including a Redux stack and d3 modules), has no known vulnerabilities, and adds about **113 KiB gzip (about 91 KiB brotli)** to a Dashboard that is 3.7 KiB gzip today, roughly 30 times its size, while the entry bundle stays unchanged because the Dashboard is lazy-loaded. It would still need an accessible name per chart, formatted values, table fallbacks and theming to match Manrope and the design tokens.
- **Decision:** Keep the existing hand-written **native SVG/CSS** charts and extend them. **No charting dependency is authorized** (including Recharts, visx, d3 packages, Chart.js and the shadcn chart wrapper). Concretely:
  1. **Two independent date scopes.** *Reporting Month* drives the four monthly KPIs, the multi-month income-versus-expenses chart and the monthly Kakeibo plan-versus-actual. *Analysis Date Range* drives category spending, daily spending, weekday averages, daily Kakeibo and the insights. They are separate state and separate requests, and changing one never changes the other's output.
  2. **Backend-authoritative data.** The existing `GET /api/analytics` is extended (no new service, table or migration) with the additional aggregates the charts need; the browser never sums paginated transactions. Ledger rules are unchanged: card purchases are expenses once, card payments and transfers are neither income nor expenses, available credit is not cash, and a savings target is a goal and not savings.
  3. **Reusable primitives, not copied chart code.** Small shared SVG components (scales and tick thinning, bar series, line series, donut, legend, chart frame, data table) take already-formatted data; each chart is a thin composition of them.
  4. **Accessibility is part of the component.** Every chart has a visible title, a short description, a legend that does not rely on color alone, tap or keyboard-reachable data points where values matter, and an equivalent data table (collapsible, in the accessibility tree) with the same numbers.
  5. **Responsive and restrained.** Charts are readable at 320 px (tick thinning, no horizontal page scroll), use the design tokens and Manrope, and use no animation or gradient.
  6. **Resilience.** The lazy-loaded Dashboard sits inside an error boundary that offers a retry, and each section has its own loading, empty and error state.
- **Alternatives considered:** Recharts (rejected for now: size and dependency cost outweigh the benefit at current scope, and the accessibility and theming work remains either way); visx or d3 directly (more code than native for no accessibility gain); Chart.js, ECharts and Nivo (canvas-based or heavier); the shadcn chart component (a wrapper around Recharts, so the same dependency).
- **Consequences:** Smaller bundle and no new supply-chain surface; full control of accessibility and visuals. The cost is that we write and maintain chart primitives ourselves: axis and tick logic, tooltips or tap targets, and donut geometry need tests, and each new chart kind costs more than it would with a library. Mitigation: shared primitives with unit tests for geometry and formatting, a data table for every chart, and browser tests at 320 to 1440 px.
- **Revisit condition:** reconsider a charting library only if requirements become substantially more complex, for example zoom or brush selection, pan, many simultaneous series, stacked or area combinations, real-time updates, or more than roughly eight chart kinds. Re-measure size, dependency tree and audit at that time and record a new ADR. Until then, no dependency is added.
- **Boundaries:** No historical net-worth or balance chart (there is no dated balance history), no forecasts or AI insight text, and no production deployment or migration is authorized by this ADR.

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
- **v1.5 (2026-11-02):** ADR-019 accepts a gated, visual-only wallet-artwork exception; no official issuer art is approved by this decision. Labeled AI-generated concept artwork is allowed and included.
- **v1.6 (2026-11-02):** ADR-020 stores each account's chosen card (`accounts.card_product_id`) in the database; Codex implements migration 004 and the API.
- **v1.7 (2026-11-02):** ADR-021 accepts Kakeibo planning/reflection metadata, nullable transaction envelopes and category suggestions, and two metadata tables; migration 005 and API/UI follow-up are staged separately.
- **v1.8 (2026-11-10):** ADR-022 records the merged installation-wide category model, archive-safe transaction references, immutable type, and migration 007. This is a source/design record, not deployment evidence.
- **v1.9 (2026-11-11):** ADR-023 and ADR-024 record the owner-approved category-icon and separate-Dashboard scope for staged Draft PRs; neither indicates a production rollout.
- **v1.10 (2026-11-12):** ADR-025 accepts native SVG for the Dashboard (no charting library) and the two-scope date model; it implies no deployment.
