# Stage 8A: production read-only infrastructure preflight

Date: 2026-10-15 (Asia/Manila). Scope: read-only inspection only. **Nothing in this file has been executed against production.**
Evidence basis: homelab-gitops `main` at `0c6399b` (read through the GitHub API) and the monikey repo at `4039ba0`. **No live cluster access existed**, so all live state is NOT VERIFIED.

Status vocabulary used throughout: **PRESENT IN GIT** (desired state read), **OBSERVED** (seen live), **VERIFIED BY RESTORE**. Only the first was achievable here.

## 1. Executive summary

- There is no `kubectl`, `argocd` or `helm` binary and no kubeconfig on this machine. Per the rules, I did not look for a way around that. **Every live-state question is NOT VERIFIED**: pod status, replicas, restarts, ages, running image digests, Argo sync/health, PVC and certificate status, CronJobs/Jobs, other namespaces, PostgreSQL minor version, `_prisma_migrations` state, backup evidence and Git-vs-live drift.
- homelab-gitops has not advanced since the 2026-09-13 audit (HEAD `0c6399b`, 2026-09-09). The D11 gaps are therefore **still present in the desired state**:
  - **D11-A (migration Job):** PRESENT IN GIT. The wave-1 hook runs `npx prisma migrate deploy` on `monikey-api:latest`. The repo's `runtime` image deliberately removes npm, npx and the Prisma CLI, so the Job cannot work as written. The correct image, `monikey-migration`, is built and published by CI but is not referenced by GitOps.
  - **D11-B (HTTPS and cookies):** PRESENT IN GIT. ConfigMap has `NODE_ENV=development`, `SESSION_SECURE=false`, `APP_ORIGIN=http://monikey.homelab.local`. The Ingress has no `tls` block. Traefik redirects :80 to :443 globally and has TLS enabled on `websecure`, so live traffic is probably HTTPS with a default or self-signed cert, but this is not verified.
  - **D11-C (backup):** no backup CronJob, script, Longhorn recurring job or off-host target exists in GitOps for MoniKey. Backup is **not configured, not observed, not verified by restore.**
- **Worker risk (the critical item):** the worker, API and migration Job all use the mutable tag `ghcr.io/jeysibn/monikey-api:latest` with the same tag across all three. Whether today's worker is the pre-V3 auto-posting worker depends on the image it started from, which cannot be known without live digests. Argo `automated` + `prune` + `selfHeal` would recreate any scaled-down or deleted worker.
- **Recommendation:** NO-GO for every operational change. GO only to request read-only cluster access (or have the user run the listed read-only commands) and to authorize a GitOps fix proposal.

## 2. Read-only inspection scope and commands actually executed

Executed (all local or read-only GitHub API; nothing against the cluster):

| Command | Result |
|---|---|
| `which kubectl argocd helm` | none installed |
| `ls ~/.kube`, `ls ~` | no kubeconfig; no local gitops checkout |
| `gh auth status`, `gh repo view Jeysibn/homelab-gitops` | logged in as Jeysibn; repo public, default `main` |
| `gh api repos/Jeysibn/homelab-gitops/commits/main` | HEAD `0c6399b` |
| `gh api .../git/trees/0c6399b?recursive=1` | 80 paths listed |
| `gh api .../contents/<path>?ref=0c6399b` (raw) | the 9 `kubernetes/manifests/monikey/*` files, `argocd-apps/values.yaml`, `templates/explicit-applications.yaml`, `bootstrap/root-app.yaml`, `helm/longhorn/values.yaml` (grepped for backup/snapshot terms), `helm/traefik/values.yaml` (grepped), `manifests/cert-manager/cluster-issuer.yaml` |
| local reads and greps in the monikey repo | `backend/Dockerfile`, `.github/workflows/publish.yaml`, `backend/src/config/env.ts`, `app.ts`, `common/auth/cookies.ts`, `docs/operations/*`, Stage 7A/7B/7C docs |

Not executed: any script from either repo (the bootstrap `install-argocd.sh` and the argocd-apps helm templates were not run; only `values.yaml`, `explicit-applications.yaml` and `root-app.yaml` were read). No secret values were read: the `gh` output was filtered for secret-looking lines and the manifests only contain `secretKeyRef` names. Downloaded manifests were saved only to the session scratchpad.

## 3. Kubernetes architecture inventory

Desired state at `0c6399b`, namespace `monikey`, Application `monikey` (path `kubernetes/manifests/monikey`, `targetRevision: main`). **Live columns (ready replicas, digest, restarts, age, status) are all NOT VERIFIED.**

| Component | Kind | Desired replicas | Image (Git) | Wave | Notes |
|---|---|---|---|---|---|
| postgres | StatefulSet + Service | 1 | `postgres:18-alpine` | 0 | Longhorn 10Gi volumeClaimTemplate; requests 100m/256Mi, limits 1 CPU/1Gi; `pg_isready` probes |
| receipts | PVC `monikey-receipts` | n/a | n/a | 0 | Longhorn 5Gi |
| config | ConfigMap `monikey-config` | n/a | n/a | 0 | see section 6 |
| migrate | Job (Argo `hook: Sync`) | n/a | `monikey-api:latest` | 1 | `npx prisma migrate deploy`; `backoffLimit: 2`; delete policy BeforeHookCreation,HookSucceeded,HookFailed (no Job history survives) |
| api | Deployment | 1 | `monikey-api:latest` | 2 | `node dist/server.js`; ready `/api/v1/health/ready`, live `/api/v1/health/live`; 100m/192Mi req, 500m/512Mi limit |
| worker | Deployment | 1 | `monikey-api:latest` | 2 | `node dist/worker.js`; mounts receipts PVC at `/data` |
| web | Deployment (+ init container `prepare-nginx-config`) | 1 | `monikey-web:latest` | 2 | nginx; resolver `10.43.0.10` (k3s CoreDNS); probes on `/` |
| ingress | Ingress `monikey` | n/a | n/a | 3 | Traefik; host `monikey.homelab.local`, `/` to `web:80`; no `tls` |

Cluster context from the Argo definitions: k3s, Longhorn 1.6.2 (`SkipHooks`), MetalLB, cert-manager v1.14.4 with a single `ClusterIssuer homelab-selfsigned` (selfSigned), Traefik chart 28.0.0, Pi-hole + Unbound, a Prometheus/Loki/Grafana/Alloy monitoring stack. Apps are Helm-sourced from `root-app` (`kubernetes/argocd-apps`), all `automated` with `prune: true` and `selfHeal: true`. The `monikey` Application has sync-wave 4 and `CreateNamespace=true`.

No `imagePullPolicy` is set anywhere, so Kubernetes defaults apply: `latest` implies `Always`, so every pod restart pulls whatever `latest` currently is.

Other namespaces, CronJobs, Jobs, Helm releases and any workload outside this Application: NOT VERIFIED (not visible from Git alone).

## 4. API, frontend and worker versions

| Item | Git desired state | Live | Verdict |
|---|---|---|---|
| API image | `ghcr.io/jeysibn/monikey-api:latest` | unknown digest | NOT VERIFIED |
| Worker image | same tag as API | unknown digest | NOT VERIFIED |
| Web image | `ghcr.io/jeysibn/monikey-web:latest` | unknown digest | NOT VERIFIED |
| Migration image | `monikey-api:latest` (wrong artifact) | n/a | defect D11-A |
| PostgreSQL | `postgres:18-alpine` (floating minor) | unknown | NOT VERIFIED |

`publish.yaml` pushes both `:<sha>` and `:latest` and records the immutable digest only in the job summary ("neither a commit-SHA tag nor `latest` is treated as immutable"). GitOps does not consume those digests. I did not query GHCR package versions; the GitHub package listing would need `read:packages` scope that was not checked, so the tag-to-digest mapping and push dates are NOT VERIFIED.

## 5. Recurring-worker risk assessment

**What could run recurring-payment logic (from Git):**
1. Deployment `worker` (1 replica, `node dist/worker.js`): the main candidate.
2. Deployment `api`: the API process serves the recurring routes; whether the API also starts any scheduler depends on the image version (NOT VERIFIED; in V3 the worker owns it).
3. No CronJob/Job for recurring appears in `kubernetes/manifests/monikey`. A hook Job only runs migrations. CronJobs elsewhere: NOT VERIFIED.
4. Any pod that started from an older `latest` keeps running the old code until restarted. Because pods only pull on restart, **different pods can legitimately run different code** (for example a worker started weeks ago and an API restarted yesterday).
5. Argo reconciliation: `selfHeal` reverts manual changes to replicas and re-creates deleted objects; `prune` removes anything not in Git. Scaling the worker to 0 with `kubectl` would be undone within the Argo reconcile interval unless auto-sync is paused first.

**Which workloads may still run pre-V3 auto-posting logic:** the worker, and potentially api, if their running image predates Stage 7B. Evidence needed: the running image digest of each pod compared with the digest of the first V3 build. **Cannot be determined here: NOT VERIFIED.** Config evidence: `RECURRING_CONFIRMATIONS_DISABLED` is absent from `monikey-config` (default false), so the V3 manual-only switch is not set; it would not matter for a pre-V3 image anyway, which ignores it.

**Worker shutdown and verification plan (future approval, NOT to be run now):**
1. Pre-check (read-only): record Argo app sync/health, current worker pod, image digest, and `kubectl get deploy,cronjob,job -A` for anything referencing `monikey`.
2. Pause reconciliation for the `monikey` Application only (disable automated sync/selfHeal on that Application), and for `root-app` too, since root-app's `selfHeal` would restore the child's `syncPolicy`. Record the exact change so it can be reverted.
3. Scale `worker` to 0. Confirm no `monikey` worker pod remains and no other pod runs `dist/worker.js` (compare pod commands cluster-wide).
4. Verify no further automatic postings: with the user's approval and on a restored copy only, compare the count of `transactions` with `source='recurring'` over a window longer than the worker's polling interval; this would be a DB query, and **needs its own approval**.
5. Keep the worker at 0 through the whole migration; bring it back only as the V3 image pinned by digest with `RECURRING_CONFIRMATIONS_DISABLED` decided explicitly.
6. Rollback of the shutdown = scale back and re-enable auto-sync (note this restores the pre-V3 worker if the image is still old, which is why the image must be pinned first).

## 6. D11 findings

### D11-A: migration Job and image
- **Evidence (Git):** `migrate-job.yaml`: image `monikey-api:latest`, command `["npx","prisma","migrate","deploy"]`, Argo `hook: Sync`, wave 1, non-root, read-only root filesystem, `/tmp` emptyDir.
- **Evidence (repo):** `backend/Dockerfile` `runtime` stage removes `node_modules/prisma`, `@prisma/config`, `npm`, `npx`. A separate `migration` target (`FROM build`, includes the Prisma CLI, `CMD ["npx","prisma","migrate","deploy"]`) is published by `publish.yaml` as `ghcr.io/<owner>/monikey-migration`. `docs/operations/deployment-contract.md` states GitOps must use the migration image by digest.
- **Conclusion:** with the intended V3 `runtime` image the Job would fail at `npx` (exec not found), the sync would stall at wave 1 and api/worker/web at wave 2 would not be rolled. If instead `latest` still points to an old image that retains npx, the Job would "work" against the wrong artifact. Either way it is unsafe. No test Job was run, as instructed. Whether the live cluster already differs from Git (a hand-edited Job): NOT VERIFIED. No Job history exists because of the delete policy.
- **Additional risk:** the migration is a Sync hook that runs on every sync with automated sync. A routine Git change would re-run `prisma migrate deploy` against production while the old worker is live. Migrations must be moved out of auto-sync into a deliberate, worker-stopped step.

### D11-B: ingress and session security
- **Evidence (Git):** Ingress class `traefik`, no `tls`, no cert-manager annotations, host `monikey.homelab.local` (a `.local` name, so apparently LAN-only; public exposure NOT VERIFIED). Traefik values: port 80 redirects permanently to `websecure`; 443 has `tls.enabled: true`. The only issuer is `homelab-selfsigned`, and no Ingress or Certificate references it for this host, so the served certificate is at best the Traefik default certificate. Certificate status: NOT VERIFIED.
- **Cookies:** `SESSION_SECURE=false` and `NODE_ENV=development`. In code (`cookies.ts`), `secure = SESSION_SECURE || NODE_ENV==='production'`, so sessions are issued **without the Secure flag** in this configuration. If users reach the site over HTTPS (likely, via the redirect) the cookie still travels over any HTTP request to that host, until the redirect. `NODE_ENV=development` also exposes API docs (`app.ts`: docs on when `PUBLIC_API_DOCS` or non-production) and may relax other production-only behaviours.
- **Origin/CORS:** `APP_ORIGIN` is `http://monikey.homelab.local`. If the browser origin is `https://…`, origin checks tied to `APP_ORIGIN` would mismatch; since the app evidently works for the user, either the checks are same-origin through the nginx proxy or users browse over HTTP. Which one is NOT VERIFIED.
- **Proxy trust:** `app.ts` uses `trustProxy: ['loopback','uniquelocal']`. This is correct for in-cluster pod-CIDR/private traffic; no env var is needed. Whether the client IP seen behind Traefik/MetalLB is private is NOT VERIFIED.
- **Implication of leaving it:** session cookies and financial API traffic can cross the LAN in clear text if HTTP is used; a misleading `development` mode in production.

### D11-C: backup infrastructure
- **Configured:** nothing found. No CronJob, no backup script reference, no destination, no encryption, no retention, no monitoring rule for backups in `kubernetes/manifests/monikey/`, and the Longhorn Helm values contain no backup target or recurring job (grep for backup/snapshot/recurring/target returned nothing). I did not search every Helm values file for alert rules.
- **Repo side:** backup scripts and a restore drill exist in the monikey repo (`docs/operations/restore-drill-2026-09-13.md`), but they are synthetic-data rehearsals and are not wired to the cluster.
- **Observed:** nothing (no cluster access). **Verified by restore on production data:** no.
- Longhorn volumes are replicated block storage on the same cluster; they are **not** an independent backup (a PVC deletion, `prune` by Argo, or a cluster loss removes the data and its Longhorn snapshots). Whether Longhorn snapshots or a backup target are configured in the live UI/CRDs is NOT VERIFIED.

## 7. PostgreSQL and storage findings (metadata only)

| Item | Finding |
|---|---|
| Version | `postgres:18-alpine` is a floating major tag; the repo's local tests use PostgreSQL 18. Server minor version: NOT VERIFIED. |
| Mechanism | single-replica StatefulSet, no operator, no standby. Any pod loss means downtime until reschedule. |
| Storage | Longhorn 10Gi RWO; PVC phase, actual usage, replica count and volume health: NOT VERIFIED. |
| Resources | req 100m/256Mi, limit 1 CPU/1Gi |
| Probes | `pg_isready` readiness and liveness |
| HA/recovery | none configured (no WAL archiving, PITR or replica in Git) |
| Backup integration | none (see D11-C) |
| Migration state | `_prisma_migrations` not readable without a DB connection: **NOT VERIFIED**. The production schema may lack all Stage 6B/7B migrations. |
| Secrets | `monikey-secrets` is created out of band (README); its existence and keys are NOT VERIFIED; values not read. Loss of `ENCRYPTION_SECRET` would make encrypted fields unrecoverable even from a good backup, so it needs separate secure custody. |
| Deletion risk | Argo `prune: true` with the StatefulSet's `volumeClaimTemplates`: StatefulSet PVCs are not deleted when the StatefulSet is deleted by default, but the Application has a resources-finalizer (cascade delete of the Application deletes its resources). |

## 8. GitOps / Argo CD findings

- G1. All Applications `automated` + `prune` + `selfHeal`, including `root-app`. Manual scaling or hotfixes are reverted; stopping the worker needs Application-level pause on both `monikey` and `root-app`.
- G2. `targetRevision: main` for the monikey Application: any merge to `main` deploys. Together with `latest`, a monikey image push can change production on the next pod restart with no Git change at all.
- G3. Wave order is config/db (0), migrate (1), api/worker/web (2), ingress (3), but the worker is deployed in the same wave as the API. There is no ordering that guarantees the old worker is down before migration. Hook Jobs run at wave 1 while the old worker pod (already running) keeps working.
- G4. No digest pinning; `imagePullPolicy` unset (`Always` for `latest`).
- G5. Secrets created out-of-band, not reconciled, not backed up by GitOps.
- G6. Live-vs-Git drift (Argo `OutOfSync` status, ignoreDifferences, manual edits): NOT VERIFIED.
- G7. The migration Job and the monikey repo's `deployment-contract.md` disagree; the contract is the correct one.

## 9. Backup readiness assessment (planning only)

Nothing exists to rely on. Required, all unverified or absent:

| Need | Status |
|---|---|
| Which DB | the `monikey` database in the `postgres` StatefulSet; data size unknown (determine later from PVC capacity metadata and, only with approval, a size query on a copy) |
| Tooling | `pg_dump` custom format of a consistent snapshot, run from a pinned image matching the server major (18); not run |
| Storage capacity | needs a scratch location outside the cluster; size unknown; plan for at least 2x DB size |
| Independent off-host destination | none configured; must be a different failure domain than Longhorn and the homelab host |
| Encryption and key handling | e.g. age/GPG, key held outside the cluster, separate from `ENCRYPTION_SECRET` custody; not set up |
| Transfer verification | checksum on both ends, size and `pg_restore --list` check; not set up |
| Restore environment | isolated disposable PostgreSQL 18 with no network route to production; the Stage 7B restore drill is the template (synthetic only) |
| Access restrictions | operator-only, no copying real financial data to a developer laptop without explicit approval |
| Retention | undefined; propose at least one pre-migration dump kept until the post-release soak ends |
| RPO / RTO | unknown today. Effective RPO is "since last unverified snapshot, possibly never", RTO unmeasured. |
| Recovery validation | restore, run `legacy-dry-run.ts` (READ ONLY transaction) and the reconciliation oracle on the copy |

## 10. Updated P0-P3 defect register (carried from 7C; Stage 8A evidence added)

No item is marked fixed from documentation or an unverified manifest.

| ID | Pri | Component | Observed evidence | Expected | Risk | Remediation | Needs prod authorization | Release-blocking |
|---|---|---|---|---|---|---|---|---|
| D11-A | P1 | migrate-job.yaml | `npx` on `monikey-api:latest` (runtime image strips npx/Prisma) | pinned `monikey-migration@sha256` | migration fails or runs wrong artifact, sync stalls | GitOps fix (separate repo, not made) | change needs GitOps approval; no prod access to fix | **Yes** |
| D11-B | P1 | configmap, ingress | `NODE_ENV=development`, `SESSION_SECURE=false`, `APP_ORIGIN=http://…`, no Ingress TLS | production mode, secure cookies, HTTPS origin, trusted cert | cookie/traffic exposure, docs exposed | GitOps config + TLS | yes (config change = deployment) | **Yes** until verified live or fixed |
| D11-C/D12 | P1 | backup | none found in Git; live NOT VERIFIED | encrypted, off-host, restore-tested backup | unrecoverable data loss during migration | build and test backup path | yes (reads production data) | **Yes** |
| D14 (new) | P1 | worker/image | api, worker, migrate share mutable `latest`; running digest unknown | pinned digests, known worker version | pre-V3 auto-posting worker may be running or re-created; V3 guards bypassed by version skew | pin digests; stop worker before migration | yes | **Yes** |
| D15 (new) | P1 | Argo sync policy | `automated`+`prune`+`selfHeal` on root and monikey; migration is a Sync hook | migrations only via a deliberate step | any Git push re-runs migration against live data; worker cannot be held at 0 | pause policy or move the Job to a manual operation | yes | **Yes** |
| D16 (new) | P2 | postgres | single replica, floating `18-alpine`, no WAL/PITR | pinned version, recovery path | downtime, uncontrolled minor upgrade on restart | pin `postgres:18.x`, add recovery | yes | No (but affects RTO) |
| D17 (new) | P2 | secrets custody | `monikey-secrets` out of band | documented, backed up separately | `ENCRYPTION_SECRET` loss makes restored data unreadable | document custody (never in the report) | yes | No, but required before backup |
| D18 (new) | P3 | docs exposure | `NODE_ENV=development` enables API docs | docs off in production | information disclosure | follows D11-B | yes | No |
| D3 | P2 | recurring | same-cycle repay after reversal unsupported | n/a | documented limitation | design ready | no | No |
| D4 | P2 | old worker | pauses due bills incl. non-autopay | n/a | stops by item 5 of section 5 | stop before migration | yes | No (handled by procedure) |
| D5 | P2 | old API | mark-paid/due-date edits fail at DB after guard | n/a | old API breakage | deploy API at the same time as the migration | yes | No |
| D6 | P2 | idempotency | unknown binary with a different key | n/a | duplicate possible | accepted | no | No |
| D7-D10, D13 | P2/P3 | various | unchanged from 7C | n/a | n/a | per 7C | n/a | No |

P0: none known. Open P1s are now **5**: D11-A, D11-B, D11-C/D12, D14 and D15. The release gate "no unresolved P0/P1" remains **FAIL**.

## 11. Proposed remediation and refined release sequence (proposals; none implemented)

**Remediation proposals (all for separate approval, GitOps repo and production):**
1. Replace the migrate Job image with `ghcr.io/jeysibn/monikey-migration@sha256:<digest>`, set `activeDeadlineSeconds`, and make it a manually triggered operation (a `Job` not under the auto-sync path, or a PreSync hook only after the worker is held at 0).
2. Pin api, worker, web and migration to digests recorded from the publish summary; stop using `latest` in manifests.
3. ConfigMap: `NODE_ENV=production`, `SESSION_SECURE=true`, `APP_ORIGIN=https://<real host>`; add Ingress `tls` with a certificate that browsers will trust (the only issuer is self-signed), and decide public vs LAN exposure explicitly.
4. Add `RECURRING_CONFIRMATIONS_DISABLED` explicitly to the config (V3 = manual only) and keep the worker as a separate, independently scalable Deployment.
5. Backup: an encrypted off-host logical backup job plus Longhorn backup target; monitoring/alert on backup age; retention policy; a documented, tested restore.
6. Pin the PostgreSQL image to a minor version, add resource and storage monitoring.
7. Release gates in CI: a manifest lint that rejects `:latest`, `npx` on a runtime image, and `SESSION_SECURE=false` with a non-dev environment.

**Refined 16-step sequence** (reconciled with Argo auto-sync and the wave order; do not execute):
1. Agree a maintenance window, and announce it; decide read-only/write-freeze handling and session policy (sessions are cookie-based; expect re-login after a `SESSION_SECURE`/origin change).
2. Read-only inventory (section 5, step 1) with real digests, other namespaces and CronJobs.
3. Verify the off-host backup destination, encryption key custody and a restore environment *before* touching anything.
4. Land and review the GitOps fix as a PR (D11-A/B, digest pins); no sync yet.
5. Pause Argo auto-sync for `root-app` and `monikey`.
6. Stop the old worker (scale 0) and verify no recurring-capable pod remains.
7. Quiesce writes (scale API to 0 or maintenance page) to get a consistent backup.
8. Take the approved encrypted backup, copy it off-host and verify the checksum.
9. Restore into an isolated PostgreSQL 18 and verify it opens.
10. Run the real-data read-only dry-run (`legacy-dry-run.ts`) and the reconciliation on the restored copy only; review before continuing.
11. Compatibility check: compare `_prisma_migrations` on the copy with the repo migrations; confirm the Stage 7B schedule guard migration applies cleanly on the copy.
12. Run the pinned migration image once against production (worker still 0, API quiesced).
13. Deploy the pinned V3 API and a worker with recurring confirmations manual-only; verify readiness.
14. Deploy the V3 frontend (the legacy UI stays the default; V3 stays opt-in).
15. Validate: reconciliation oracle totals, smoke (`smoke.ts` plus the chosen e2e), logs, no automatic recurring postings.
16. Restore user access; re-enable Argo auto-sync only after Git matches live; keep the backup until the soak ends.

Rolling deploys are unsafe: the old worker and old API conflict with the new DB guards (409 `RECURRING_SETTLED_CYCLE`, `RECURRING_PAYMENT_REVERSED`, DB-level schedule guard), and the new API against the old schema is untested.

## 12. NOT VERIFIED items

Each needs read-only kubectl/Argo access (a ServiceAccount with get/list on `monikey`, `argocd` and cluster-scoped workloads, no `secrets` access) or the user running commands themselves:

1. Pod status, restarts, ages, ready/desired replicas of api, worker, web, postgres.
2. Running image digests and the `latest` digest history (and whether any pod predates V3).
3. Argo `monikey` and `root-app` sync/health, `OutOfSync` resources, live policy.
4. Any other namespace, CronJob, Job or Helm release that runs recurring logic.
5. PVC phase, capacity, usage, Longhorn volume health and replica count, any Longhorn snapshot/backup target.
6. Ingress live state, certificate status and which cert is served, public vs LAN exposure.
7. Live ConfigMap values (confirm `SESSION_SECURE`, `NODE_ENV`, `APP_ORIGIN`).
8. PostgreSQL minor version and `_prisma_migrations` state (needs a DB connection, which is prohibited without separate approval).
9. Backup evidence of any kind, off-host destination, restore history.
10. GHCR tag-to-digest mapping and package push dates.
11. Whether `monikey-secrets` exists with the expected keys.
12. Live monitoring/alerting rules.

## 13. Required separate production approvals

| Action | Approval needed |
|---|---|
| Read-only cluster inventory with a read-only kubeconfig | A1 (read-only access grant) |
| GHCR package version read | A1 (token scope) |
| Pause Argo, scale worker/API to 0 | A3 (change) |
| Production backup, off-host copy | A2 (reads financial data; destination and key custody approved) |
| Isolated restore and real-data dry-run | A2 |
| GitOps changes (D11 fixes) | A3 on the homelab-gitops repo |
| Image publish / digest pinning | A3 |
| Migration, deployment, frontend rollout | A3, only after all of the above and a go decision |

## 14. GO / NO-GO

- **NO-GO** for: worker shutdown, backup, restore, migration, deployment, any GitOps change, any production change.
- **GO** only for: (a) the user granting read-only cluster access, or running the read-only commands in `STAGE7C_RELEASE_PLAN.md` section 2 and returning the output (with secrets excluded); (b) the user approving a GitOps fix proposal as a separate task.
- Release gate: "no unresolved P0/P1" = **FAIL** (P1: D11-A, D11-B, D11-C/D12, D14, D15).

## Limitations of the evidence

No cluster access; GitOps read through the GitHub API at `0c6399b` (reads of `argocd-apps` templates were limited to `explicit-applications.yaml`, `values.yaml` and `root-app.yaml`; `helm-applications.yaml`, the Pi-hole/monitoring values and the `docs/` files in homelab-gitops were not read); no registry access; no live DB. Findings from Git describe the desired state and could differ from what is running.
