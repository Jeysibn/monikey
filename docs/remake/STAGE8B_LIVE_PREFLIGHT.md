# Stage 8B: live infrastructure verification

Date: 2026-10-15 (Asia/Manila). **Result: live evidence NOT AVAILABLE. Stage 8B has NOT passed.** This file contains (a) new evidence found without cluster access, (b) the minimal operator procedure that produces the missing live evidence, and (c) the updated blocker matrix.

Evidence classes used: **[GIT]** desired state read from GitHub; **[CI]** GitHub Actions metadata (read-only); **[INFERRED]** deduced, not observed; **[LIVE]** observed on the cluster (none yet); **NOT VERIFIED**.

## 1. Live evidence collected

None. Access check performed this stage: `which kubectl k3s argocd helm` (none), `KUBECONFIG` unset, no `~/.kube`, no `/etc/rancher/k3s/k3s.yaml`, no `KUBE*`/`ARGOCD*` environment variables. No authorized read-only environment exists on this machine. I did not install tools, look for credentials or use SSH to reach the cluster.

## 2. Commands executed and by whom

All by the assistant, read-only, no cluster contact:
- Access checks above.
- `gh api` reads of homelab-gitops at `0c6399b`: `argocd-apps/templates/helm-applications.yaml`, `docs/Argo-Application-Registry.md`, `docs/Service-Catalog.md` (grep), `helm/longhorn/values.yaml`, `helm/traefik/values.yaml`.
- `gh api /users/Jeysibn/packages/container/<pkg>/versions` for monikey-api, monikey-web, monikey-migration: **HTTP 403, token lacks `read:packages`**. Not retried or escalated. Registry tags and digests: NOT VERIFIED.
- `gh run list/view` on the monikey "Publish images" workflow and `gh api` listing of `backend/prisma/migrations` on `main` (read-only CI and repo metadata).

Operator-run commands: none yet (section 11).

## 3. New evidence that does not need cluster access

1. **Single-node cluster with no storage redundancy [GIT]:** Longhorn values set `defaultReplicaCount: 1` and `defaultClassReplicaCount: 1` ("single-node K3s"). A Longhorn volume has one replica on one disk. Longhorn is therefore not redundancy, and not a backup. `Service-Catalog.md` also describes postgres as "single-node StatefulSet". Longhorn values contain no backup target or recurring job. `defaultSettings` shows no backup target.
2. **Exposure is LAN-only per Git [GIT]:** Traefik is a MetalLB `LoadBalancer` on a private 192.168.x address; the host is `monikey.homelab.local`, resolved by the homelab Pi-hole/Unbound. Nothing in Git publishes it externally. A Cloudflare tunnel, port-forward or other router rule lives outside Git: NOT VERIFIED.
3. **Argo shape [GIT]:** `root-app` renders Helm-chart Applications (`helm-applications.yaml`, all `automated` prune+selfHeal) and explicit Applications; `monikey` is wave 4, `targetRevision: main`. This confirms D15: both levels reconcile. The registry says the monikey README covers Secret bootstrap and "image-promotion steps".
4. **What the `latest` tag can point to [CI]:** the publish workflow runs on pushes to `main`.
   - Last **successful backend (api/worker/migration) publish: 2026-09-14T01:45Z**, commit `a49d294`.
   - The later backend publish on **2026-09-30T04:42Z (`bda6c38`) FAILED**.
   - Runs on 2026-09-15 and 2026-09-30T05:01Z built **web only** (backend skipped).
   - The 2026-10-01 run (`72f45c6`) FAILED at the web build (backend skipped).
   - `origin/main` migrations end at `20260913100000_crypto_activity_sequence`. The V3 migrations (`20261015000000_recurring_occurrences`, `20261016000000_recurring_posting_guard`, `20261017000000_recurring_schedule_guard`) exist only on the feature branch.
5. **[INFERRED] consequence:** the current `monikey-api:latest` (and `monikey-migration:latest`) was almost certainly built on 2026-09-14 from `main` and contains **no V3 code**: the pre-V3 recurring worker with auto-posting. Therefore any worker pod now running is very probably the legacy auto-posting worker, and a `latest` pull gives the same legacy code. The probability is high but this is **not verified**: it needs the live pod digest compared with the 2026-09-14 publish digest (the digest is only in that run's job summary, readable by the repo owner with `gh run view 34796926134 --log`, not retrieved here to stay within the scope; optional operator step).
   - Consequence for the web image: `monikey-web:latest` may be newer than the API (web built 09-30), so a web/API version skew could exist live. NOT VERIFIED.

## 4. Kubernetes workload inventory

All **[GIT]** only; see `STAGE8A_PRODUCTION_PREFLIGHT.md` section 3 for the table. Every live column (ready replicas, pods, restarts, age, node) is **NOT VERIFIED** pending section 11.

## 5. Running image digests

NOT VERIFIED (no live access; no registry read scope). Procedure in section 11 (commands B and B2). Provenance comparison: operator digest vs the `Record immutable image digest` lines in the publish run summaries, newest backend success `34796926134`.

## 6. Recurring-worker assessment

Priority-1 question, answer is **INFERRED, not verified**:

| Question | Status |
|---|---|
| Running worker image and digest | NOT VERIFIED |
| Replicas | Git says 1; live NOT VERIFIED |
| Legacy auto-posting present | **Very probably yes** [INFERRED from CI: no backend image containing V3 has ever been published from `main`] |
| API initiating recurring processing | NOT VERIFIED (legacy API image not inspected; `dist/server.js` vs `dist/worker.js` split suggests the worker owns it) |
| Other CronJobs/namespaces | NOT VERIFIED (command A, A2) |
| Old worker pods/Jobs remaining | NOT VERIFIED |
| Argo could recreate a stopped worker | **Yes per Git** (selfHeal on both levels); live policy NOT VERIFIED |
| Multiple versions simultaneously | possible by design (pods pull `latest` only on restart); NOT VERIFIED |

No workload was stopped, restarted or scaled.

## 7. D11-A migration Job

- **[GIT]** Job image `monikey-api:latest`, command `npx prisma migrate deploy`, Sync hook wave 1, delete policy removes the Job on success or failure, so there is **no Job history** to examine [LIVE: confirm no leftover Job via command A].
- **[CI + Dockerfile]** the `runtime` target removes npm/npx/Prisma, so a runtime-image Job cannot run `npx`. Because the current `latest` is a 2026-09-14 build (inferred), it was built with the same hardened Dockerfile family (hardening report dated 2026-09-13), so the live Job would also fail, unless the live Job differs from Git. Whether live differs: NOT VERIFIED.
- `monikey-migration` is built by the same workflow from the same commit; the last successful one is also from 2026-09-14 and contains **only pre-V3 migrations**. It would apply nothing from V3. A V3 migration image must be built from the V3 commit and pinned by digest.
- Permissions: Job runs non-root with a read-only root filesystem and `/tmp` emptyDir; Prisma needs a writable engine/cache location, which is a possible secondary problem for the migration image (rehearsal used a plain container, not this securityContext). Verify in a disposable cluster/namespace before release.
- Verdict: **FAIL [GIT+CI]; live NOT VERIFIED.** Not safe for a release.

## 8. D11-B HTTPS and session security

- **[GIT]** Ingress has no `tls`; Traefik redirects 80 to 443 and has `websecure` TLS enabled; only issuer is `homelab-selfsigned`, not referenced by any monikey object. Expected live behavior: port 443 serves Traefik's default (self-signed) certificate, which browsers reject unless the user trusts it. [INFERRED]
- **[GIT]** `NODE_ENV=development`, `SESSION_SECURE=false`, `APP_ORIGIN=http://monikey.homelab.local`. Per `cookies.ts` the cookie is **not Secure**. Combined with the global HTTP-to-HTTPS redirect, the cookie is still sent on the initial plain-HTTP request before the redirect, and the origin value disagrees with the HTTPS URL.
- Exposure: LAN-only per Git [GIT]; external exposure outside Git NOT VERIFIED.
- Verdict: **FAIL [GIT]; live NOT VERIFIED.**
- **Proposed (not applied) production-safe configuration:**
  1. Decide the trust model: LAN-only with a homelab CA (a cert-manager `ClusterIssuer` of type CA, root distributed to devices) or a public name with ACME. Do not leave the self-signed default cert.
  2. Ingress: add `spec.tls` with `secretName` and `hosts`, and cert-manager `cluster-issuer` annotation; Traefik `websecure` entrypoint annotation.
  3. ConfigMap: `NODE_ENV=production`, `SESSION_SECURE=true`, `APP_ORIGIN=https://<host>`, keep `PUBLIC_API_DOCS` unset. (Check that the API works with `NODE_ENV=production` in staging first; it changes docs exposure and cookie defaults.)
  4. Optionally HSTS and security-header middleware in Traefik after the cert is trusted.
  5. Expect all current sessions to be invalidated or re-issued.

## 9. D11-C / D12 backups

Classified independently, per evidence level:

| Level | PostgreSQL logical backup | Longhorn snapshot/backup | Host-managed (Proxmox/VM) | Off-host |
|---|---|---|---|---|
| Configured | none in Git | none in Git (no target, no recurring job; replicas = 1) | unknown | unknown |
| Observed | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Artifact verified | no | no | no | no |
| Restore tested | **Not on production data**; only the synthetic 2026-09-13 drill and the Stage 7B drill | no | no | no |

`docs/Proxmox-Environment.md` exists in homelab-gitops and may describe VM-level backups; I did not read it and so cannot say. Reading it is cheap and safe; it is listed as an optional next step. Retention, encryption, monitoring and recovery docs: NOT VERIFIED. Verdict: **FAIL (nothing configured in Git) / NOT VERIFIED live.**

## 10. D14, D15, PostgreSQL

- **D14:** Git references `:latest` for api, worker, migration job and web; `imagePullPolicy` unset, which means `Always` for `latest`. Restarting any pod pulls the current `latest`. Current evidence suggests API/worker `latest` (2026-09-14) and web `latest` (2026-09-30) are different builds, so a restart of web alone changes the frontend. A V3 publish to `main` would silently change all three at the next restart. Verdict: **FAIL [GIT+CI]**.
- **D15:** Git: `automated: {prune: true, selfHeal: true}` on `root-app`, the monikey Application and all platform apps. Manual `kubectl scale` would be reverted. The migration Job is a `Sync` hook (wave 1) with a delete-on-completion policy, so it re-runs on every sync of the Application including a no-op resync triggered by drift. Live Application spec, sync status and last sync result: NOT VERIFIED. Verdict: **FAIL [GIT]**.
- **Safe maintenance-window procedure (future, requires approval):** (1) suspend `root-app` automated sync first (otherwise it restores the child's policy), (2) suspend `monikey` automated sync, (3) record the existing policy, (4) scale worker to 0 and verify, (5) perform the quiesced backup and migration as in the 16-step sequence from Stage 8A section 11, with the migration run as a one-off Job outside the sync, (6) restore sync only after Git == live. Not executed.
- **PostgreSQL [GIT]:** `postgres:18-alpine` (floating tag, digest unknown), StatefulSet 1 replica, Longhorn 10Gi with a single replica, requests 100m/256Mi, limits 1 CPU/1Gi, `pg_isready` probes. Live status, PVC phase/capacity/usage, node placement, digest: NOT VERIFIED. No direct DB access was used.

## 11. Operator evidence-collection procedure

Run from an existing authorized K3s management session. All commands are `get`/`list`. **Do not** run `describe`, `get -o yaml` on pods or secrets, `logs`, `exec`, or anything that prints environment variables. Do not paste Secret data. Redact node/LB IPs (replace with `<ip>`), hostnames you consider private, and any token-like string before sharing. If a command is forbidden by RBAC or a CRD is missing, record "unavailable" and move on.

```bash
# A. workloads
kubectl get deployments,statefulsets,daemonsets -n monikey
kubectl get pods -n monikey -o wide
kubectl get cronjobs,jobs -n monikey
kubectl get services,ingresses,pvc -n monikey
# A2. anything recurring-capable elsewhere (names only)
kubectl get cronjobs,jobs -A
kubectl get deployments,statefulsets -A -o custom-columns='NS:.metadata.namespace,NAME:.metadata.name,IMAGE:.spec.template.spec.containers[*].image'

# B. running versions
kubectl get pods -n monikey -o custom-columns='NAME:.metadata.name,IMAGE:.spec.containers[*].image,IMAGE_ID:.status.containerStatuses[*].imageID,READY:.status.containerStatuses[*].ready,RESTARTS:.status.containerStatuses[*].restartCount,STARTED:.status.startTime'
# B2. init containers (web's nginx init container)
kubectl get pods -n monikey -o custom-columns='NAME:.metadata.name,INIT_IMAGE_ID:.status.initContainerStatuses[*].imageID'
# B3. worker command and replicas only
kubectl get deploy worker api web -n monikey -o custom-columns='NAME:.metadata.name,REPLICAS:.spec.replicas,READY:.status.readyReplicas,CMD:.spec.template.spec.containers[0].command,PULL:.spec.template.spec.containers[0].imagePullPolicy'

# C. Argo
kubectl get applications.argoproj.io -A
kubectl get applications.argoproj.io monikey root-app -n argocd -o custom-columns='NAME:.metadata.name,SYNC:.status.sync.status,HEALTH:.status.health.status,REV:.status.sync.revision,AUTO:.spec.syncPolicy.automated,OPERATION:.status.operationState.phase,FINISHED:.status.operationState.finishedAt'

# D. TLS
kubectl get certificates -A
kubectl get ingress -n monikey
kubectl get ingress monikey -n monikey -o custom-columns='NAME:.metadata.name,TLS:.spec.tls,ANNOTATIONS:.metadata.annotations'

# E. config (non-secret ConfigMap only; review before sharing)
kubectl get configmap monikey-config -n monikey -o jsonpath='{.data}'

# F. storage and backup metadata (names/status only)
kubectl get pvc -A
kubectl get storageclass
kubectl get volumes.longhorn.io -n longhorn-system -o custom-columns='NAME:.metadata.name,SIZE:.spec.size,REPLICAS:.spec.numberOfReplicas,STATE:.status.state,ROBUST:.status.robustness'
kubectl get recurringjobs.longhorn.io,backuptargets.longhorn.io,backups.longhorn.io,snapshots.longhorn.io -n longhorn-system
kubectl get events -n monikey --sort-by=.lastTimestamp | tail -20
```

Notes: `kubectl get configmap ... -o jsonpath='{.data}'` is acceptable only because Git shows this ConfigMap holds no credentials; if anything unexpected appears, redact it. Command E must not be replaced by `get secret`. Optional (repo owner, no cluster): `gh run view 34796926134 -R Jeysibn/monikey --log | grep -E "API_IMAGE=|MIGRATION_IMAGE="` to obtain the digest of the last successful backend publish; `gh auth refresh -s read:packages` is a token-scope change and needs the owner's decision.

**Pass/fail interpretation** (after outputs are returned): worker `IMAGE_ID` digest equal to the 2026-09-14 digest confirms legacy auto-posting [still requires the build provenance]; `AUTO` empty on Applications would invalidate D15; non-empty `TLS`/Certificate with a trusted issuer would downgrade D11-B; any Longhorn `RecurringJob`/`BackupTarget` with recent `Backup` objects would move D12 from "not configured" to "configured/observed", still not "restore tested".

## 12. Release-blocker matrix

No item is closed. Every "live" cell is NOT VERIFIED because no live evidence exists.

| ID | Sev | GitOps / CI evidence | Live evidence | Root cause | Risk | Remediation (proposal only) | Verify after remediation | Status | Blocks release |
|---|---|---|---|---|---|---|---|---|---|
| D11-A | P1 | Job uses `npx` on `monikey-api:latest`; runtime strips npx/Prisma; published migration image is pre-V3 | NOT VERIFIED | GitOps never adopted the `monikey-migration` artifact | migration fails mid-release or partial state with workers running | one-off Job on a V3-built `monikey-migration@sha256`, outside sync; set `activeDeadlineSeconds`; test under the same securityContext in a disposable namespace | Job completes against a restored copy; `_prisma_migrations` matches | FAIL (Git/CI), live NOT VERIFIED | Yes |
| D11-B | P1 | no Ingress TLS, self-signed issuer unreferenced, dev env, non-Secure cookie, http origin | NOT VERIFIED | config never promoted to production semantics | session theft on LAN, browser warnings, wrong origin checks | CA or ACME cert + `tls`, `NODE_ENV=production`, `SESSION_SECURE=true`, https `APP_ORIGIN` | browser check of cert chain, `Set-Cookie` has Secure, login works | FAIL (Git), live NOT VERIFIED | Yes |
| D11-C/D12 | P1 | no backup of any kind in Git; Longhorn replicas=1 on single node | NOT VERIFIED | backups never designed | permanent loss of all financial data on disk/node failure or failed migration | encrypted off-host dump + Longhorn backup target + monitoring | restore from the off-host copy to an isolated DB, row/total reconciliation | FAIL (not configured in Git), live NOT VERIFIED | Yes |
| D14 | P1 | `:latest` everywhere, pull `Always`; last backend publish 2026-09-14 (V3 never published); web newer than API | NOT VERIFIED | mutable tags, no digest promotion | silent version change or skew on pod restart; legacy worker may run indefinitely | digest pins for api/worker/web/migration from a V3 publish; CI guard against `:latest` | live digests equal the pinned digests | FAIL (Git/CI) | Yes |
| D15 | P1 | automated+prune+selfHeal at root and child; Sync-hook migration | NOT VERIFIED | GitOps tuned for convenience, not stateful releases | worker cannot be held at 0; migration re-run on drift; unplanned rollout during window | maintenance-window procedure (section 10), migration outside sync | sync paused observed, worker stays at 0 for the window | FAIL (Git) | Yes |
| New W | P1 (inferred, under D14) | no V3-capable backend image was ever published from `main` | NOT VERIFIED | n/a | live worker very probably pre-V3 auto-poster | worker shutdown procedure (Stage 8A section 5) | no worker pod, verified cluster-wide | NOT VERIFIED | Yes (via D14) |
| D16 | P2 | floating `postgres:18-alpine`, 1 replica, 1 Longhorn replica, no recovery path | NOT VERIFIED | single-node homelab design | restart can upgrade the minor version; node loss = outage + loss | pin version/digest; add backups; document RTO | pinned digest running | NOT VERIFIED | No (backups are covered by D12) |
| D17 | P2 | `monikey-secrets` out of band, no custody doc | NOT VERIFIED | bootstrap by hand | losing `ENCRYPTION_SECRET` makes encrypted data unreadable | escrow plan separate from backups | restore test with the escrowed key | NOT VERIFIED | No, but gate to backup |
| D18 | P3 | dev env enables API docs | NOT VERIFIED | follows D11-B | information exposure on LAN | `NODE_ENV=production` | docs route 404 | NOT VERIFIED | No |

Release gate "no unresolved P0/P1" stays **FAIL**.

## 13. Unverified items

Everything under [LIVE]: pods, replicas, digests, restarts, ages, worker commands, other namespaces/CronJobs, Argo Application spec and status, certificate and served-cert identity, live ConfigMap values, external exposure, PVC/volume status and usage, Longhorn backup/snapshot objects, host-level backups (Proxmox doc unread), registry tags/digests (403 on package API), the digest of the last backend publish, PostgreSQL minor version and migration state (needs DB access, still prohibited), monitoring/alerting for backups.

## 14. Recommended remediation order (dependency-ordered; nothing implemented)

1. **Obtain live evidence** (section 11) and review it. This reclassifies every NOT VERIFIED row.
2. Read `docs/Proxmox-Environment.md` and the monikey README promotion steps (cheap, Git-only) to find host-level backups.
3. **Backup first** (D12): destination, encryption, key custody (with D17), monitored schedule; restore-test on synthetic then real data under separate approval. This unblocks everything else.
4. **Image provenance (D14):** publish V3 images from the reviewed commit; pin digests; fix the failing publish workflow first (the 2026-09-30 backend and 2026-10-01 web runs failed).
5. **Migration artifact (D11-A):** switch the Job to the pinned migration image, one-off, outside sync; test under its securityContext in a disposable namespace.
6. **HTTPS and sessions (D11-B):** certificate, `tls`, production env, secure cookie; verify in a browser before the V3 window.
7. **Argo window procedure (D15):** rehearse the pause/scale/verify steps; keep root-app and monikey paused for the whole window.
8. Production dry-run on a restored copy, then the maintenance-window release (Stage 8A 16 steps).

Steps 3 to 7 each need separate authorization; 4 and 5 and 6 require changes to the GitOps repo, a separate repo.

## 15. GO / NO-GO

- **Stage 8B: NOT PASSED** (no live verification).
- **NO-GO** for any operational step, remediation, backup, worker shutdown or migration.
- **GO** for exactly one thing: the operator running the section-11 read-only commands (or granting a read-only ServiceAccount without Secret access) and returning sanitized output for a Stage 8B completion pass. No further Git-only audit is useful beyond the optional Proxmox-doc read.

## Limitations

No cluster access; no registry scope (403); CI metadata only shows publish times and results, not the contents or digests of images; the pre-V3 conclusion for `latest` is an inference from CI history and the `main` migration list. No run summaries or logs were read.

## Addendum: locally built V3 images (user direction: no environment access needed; build a working image)

Built locally from the V3 branch at `700b3bd` using the repo Dockerfiles and the same build arguments as `publish.yaml` (`VITE_FINANCE_BACKEND=true` for web). **Not pushed, not published, not deployed.** Local image IDs (not registry digests; those exist only after a publish):

| Image | Local ID |
|---|---|
| `monikey-api:v3-700b3bd` (runtime; api and worker) | `sha256:b6b3b0be9987…` |
| `monikey-migration:v3-700b3bd` (migration target) | `sha256:53da66b646d2…` |
| `monikey-web:v3-700b3bd` | `sha256:f300265522c3…` |

Verified on a disposable PostgreSQL 18 with synthetic credentials (containers and network removed afterwards; images kept):
- Migration image under Kubernetes-like hardening (uid 1000, read-only root filesystem, tmpfs `/tmp`, all caps dropped, no-new-privileges): "All migrations have been successfully applied", 30 migrations, last `20261017000000_recurring_schedule_guard`. This answers the Prisma-in-image and securityContext questions for D11-A **for the migration image**; the GitOps Job still points at the wrong image.
- Runtime image has no `npx`, confirming the current Job spec cannot work with it.
- API (production mode, secure cookies, `RECURRING_CONFIRMATIONS_DISABLED=true`): healthy, `/api/v1/health/ready` returns `{"status":"ok","db":"ok"}`. Worker (`node dist/worker.js`): running, connected to the database.
- Web: nginx serves the SPA and proxies `/api` to the API (resolver override; note busybox `localhost` resolves to IPv6 and nginx listens on IPv4 only, so probes should use 127.0.0.1).

Remaining for D14: these images need a reviewed publish and digest pin; this build is evidence that the artifacts are buildable and work, not provenance.
