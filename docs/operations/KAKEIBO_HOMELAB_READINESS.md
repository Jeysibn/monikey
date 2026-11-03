# MoniKey Kakeibo Homelab Readiness Assessment

**Assessment date:** 2026-11-03
**Assessment type:** Read-only; no live cluster or database operations were performed.
**Verdict:** **BLOCKED** for release approval. The reviewed source and a recent backup workflow are visible, but live cluster state, the live schema, durable recovery, and candidate image availability are not verified.

## Scope and evidence

The application repository's reviewed integration revision is
`ccb318d8559ee7e356e562a0e06cf35908360d9f` ([PR #8](https://github.com/Jeysibn/monikey/pull/8)).
Its [CI run](https://github.com/Jeysibn/monikey/actions/runs/41510685056) passed
the checks job; its image-publish job was skipped because this was a
feature-branch merge. This is source/CI evidence, not evidence that candidate
images were published or deployed.

The inspected GitOps repository is `/home/jeysi/projects/homelab-gitops`, at
`origin/main` commit `d791038c4b728536100c7d9e8c646aa26f005fac`. Its working
tree was clean. The desired Argo CD Application points to that repository's
`main` branch and `kubernetes/platform/monikey/manifests` path. No repository
or GitOps deployment/configuration files were changed during the assessment.

The environment did not provide `kubectl` or `argocd`. No active Kubernetes
context could be checked, so cluster access was stopped at that point. The
live namespace, Argo CD health/sync, running pods and images, live ingress, PVC,
and database catalog are therefore **unknown**. No Secret values or financial
rows were accessed. The schema status below is not inferred from GitOps files.

## Deployment inventory

| Component | Currently deployed | Reviewed candidate / desired state | Action required |
| --- | --- | --- | --- |
| Frontend | Unknown: cluster read-only inspection unavailable | Reviewed source `ccb318d`; GitOps currently desires `ghcr.io/jeysibn/monikey-v2-frontend:sha-e54924985acb220797ba65254d1274f39365cabe`. Candidate `sha-ccb318d8559ee7e356e562a0e06cf35908360d9f` was not verified in GHCR. | Verify runtime image and publish/verify the reviewed candidate image before considering rollout. |
| Backend | Unknown: cluster read-only inspection unavailable | Reviewed source `ccb318d`; GitOps currently desires `ghcr.io/jeysibn/monikey-v2-api:sha-e54924985acb220797ba65254d1274f39365cabe`. Candidate `sha-ccb318d8559ee7e356e562a0e06cf35908360d9f` was not verified in GHCR. | Verify runtime image and publish/verify the reviewed candidate image before considering rollout. |
| Database schema | Unknown: no authorized catalog connection was available | Kakeibo requires schema through migration 006. | Obtain a safe read-only catalog inventory, then determine only the missing migrations. |
| GitOps configuration | Desired state inspected at `d791038c4b728536100c7d9e8c646aa26f005fac`; live applied revision unknown | Desired namespace `monikey`; Argo Application `monikey` in `argocd`; source `main`. Desired services are internal ClusterIP; desired ingress is `monikey.homelab.local` via Traefik TLS. | Confirm applied revision, health, sync and private network path from the authorized cluster context. Add reviewed migration support before a release if absent. |

The desired application uses private ingress and same-origin `/api` routing.
This configuration is evidence of intended privacy, not proof of live network
exposure. No public endpoint check was performed.

## Database migration inventory

Live migration state is **UNKNOWN** for every migration because only catalog
metadata could establish it, and no authorized live database/catalog connection
was available. Do not use this table as evidence that migrations are applied.

| Migration | Live status | Expected evidence / notes |
| --- | --- | --- |
| 002 | UNKNOWN | `account_transfers` and its indexes. GitOps currently has a PreSync migration hook for this legacy migration. |
| 003 | UNKNOWN | Legacy signed current-account amount constraint changes. GitOps currently has a PreSync migration hook. |
| 004 | UNKNOWN | `card_product_id` and its checks. No corresponding migration hook was present in the inspected GitOps manifests. |
| 005 | UNKNOWN | Category default and transaction envelope columns, Kakeibo plan/review tables, constraints and report index. No corresponding migration hook was present in the inspected GitOps manifests. |
| 006 | UNKNOWN | Nullable `plan_presence` state and its constraint. No corresponding migration hook was present in the inspected GitOps manifests. |

The checked-in GitOps PostgreSQL bootstrap configuration reflects an earlier
schema and does not include the Kakeibo schema through 006. It must be reconciled
for fresh installs and a reviewed existing-database migration path must be
provided before release. The application repository's runbook correctly
distinguishes the existing-database `database/002_account_transfers.sql` from
Compose's `002_seed.sql` initialization filename. Never run `001_init.sql`
against an existing database. For an existing database, inspect first and apply
only missing migrations in numeric order, stopping on partial or ambiguous
state.

## Backup and recovery evidence

The latest verifiable successful workflow metadata is [MoniKey database backup
run 41176702096](https://github.com/Jeysibn/homelab-gitops/actions/runs/41176702096),
completed 2026-10-31. The workflow is manually dispatched, not scheduled. Its
successful job records creating a logical dump, restoring that dump into a
disposable PostgreSQL database before encryption, encrypting the artifact, and
uploading it. The artifact metadata reported 4,533 bytes and expiration on
2026-11-07 (seven-day retention). The backup artifact was not downloaded or
opened for this assessment.

The workflow calculates a SHA-256 checksum in the runner, but the inspected
workflow does not retain a checksum manifest alongside the encrypted artifact.
The workflow's disposable restore is useful evidence for the generated dump;
it does not establish that the encrypted artifact can be decrypted and restored
by the owner, or that a recovery target can be cut over safely. No durable
owner-controlled off-cluster copy or long-term retention was verified. The
disposable PR E recovery rehearsal used synthetic data and is not production
backup evidence.

| Recovery requirement | Status | Evidence and gap |
| --- | --- | --- |
| Recent successful backup workflow | PARTIALLY VERIFIED | Successful manual run and artifact metadata are visible; no artifact was accessed. |
| Automated backup schedule | NOT VERIFIED | Workflow is manually dispatched. |
| Restore of generated backup | PARTIALLY VERIFIED | Workflow restored the generated dump into a disposable database before encryption. Encrypted-artifact decryption/restore by the owner is unverified. |
| Off-cluster copy with durable retention | NOT VERIFIED | GitHub artifact is outside the cluster but expires after seven days; no durable copy was evidenced. |
| Retained checksum/integrity manifest | NOT VERIFIED | Checksum is computed but not retained with the artifact. |
| Production recovery exercise/cutover | NOT VERIFIED | No production-data restore or cutover evidence was inspected. |
| Safe live schema inventory | BLOCKED | No authorized read-only database catalog connection was available. |

Do not treat a successful job, artifact existence, or the synthetic PR E
rehearsal as proof of disaster recovery. Unknown recovery capability is a
release blocker because a restore can lose writes made after the backup.

## Compatibility and rollout assessment

- Migration 005/006 add Kakeibo metadata and explicit plan-presence state; the
  documented design keeps financial tables authoritative and does not
  reclassify historical transactions. Historical envelope values remain NULL
  until explicitly classified. This behavior has been exercised with synthetic
  data, but live rows/schema were not inspected.
- Card purchases remain expense transactions counted once. Card payments and
  liquid transfers are separate records and excluded from envelope spending.
  Planning, classification and reflections are metadata operations that must
  not alter balances.
- The Kakeibo frontend needs the Kakeibo backend API. A pre-Kakeibo backend
  paired with the Kakeibo frontend can fail on Kakeibo routes/contracts; promote
  reviewed frontend and backend images as a compatible pair. The current
  frontend's compatibility handling for absent plan status and legacy NULL
  classifications is covered by browser acceptance, not live deployment
  evidence.
- Previously saved card artwork metadata is not modified by Kakeibo. Migration
  004 remains a prerequisite for the wallet/card-artwork schema; its live
  presence is unknown.
- The GitOps desired PostgreSQL StatefulSet has one replica and persistent
  storage. A controlled maintenance window is prudent: database migration
  hooks can block the application sync, and app availability during rollout
  has not been verified.

Recommended future order, after separate deployment authorization:

1. Verify a production backup, an owner-controlled durable off-cluster copy,
   and a successful controlled restore test.
2. Confirm the active context and namespace with the authorized operator;
   verify Argo Application health/sync and deployed immutable images.
3. Inventory the live schema through read-only PostgreSQL catalogs and record
   each migration as applied, missing, partial, or unknown.
4. Review migration and fresh-install GitOps configuration, then apply only
   confirmed missing migrations after approval.
5. Roll out the reviewed compatible backend image, then its compatible
   frontend image, through the approved private GitOps process.
6. Run health, API/UI, and accounting smoke checks; compare balances and card
   debt before and after metadata writes.

No step above was performed in this assessment.

## Rollback readiness

The GitOps desired frontend/backend tags are pinned to full SHA-derived tags,
and unauthenticated Docker manifest inspection found both desired `e549249`
images available. The same check could not verify either candidate `ccb318d`
image; PR #8 reported the publish job as skipped. GitOps can represent a prior
image pair as a reviewed Git change, but the live current pair and live
rollback path remain unverified.

Application rollback means restoring the prior reviewed compatible image pair
while retaining an additive database schema. It is not schema rollback. After
migrations, do not drop tables or columns as part of an application rollback;
first verify the older application can tolerate the added schema. If the
backend fails after migration, stop promotion, inspect health/logs without
exposing personal data, and use the reviewed application rollback only if the
database remains healthy. If the frontend fails while the API is healthy,
restore the prior frontend/backend pair as appropriate. If balances or debt
appear incorrect, stop financial writes and investigate before further
promotion. Database recovery is separate and higher risk: it requires an
explicitly approved, validated backup and a controlled recovery plan. Restoring
can discard all writes made after the backup; decide how to preserve or
reconcile them before any recovery.

## Browser acceptance and manual QA

The browser acceptance report for the reviewed source records passing mock
suites, a 109-check real-API browser journey against disposable PostgreSQL,
responsive layout checks at 320/375/768/1024/1440 pixels, and automated
keyboard/focus/accessibility checks. It records Kakeibo financial invariants:
classification and reflection writes left balances unchanged, card purchases
counted once, and payments/transfers excluded from spending. This is
development evidence only.

Still required before release review:

- iOS Safari and Android Chrome on real devices, including keyboard and safe
  area behavior.
- Firefox and Safari/WebKit where available, including browser zoom.
- Screen-reader checks with VoiceOver and NVDA.
- Review of inherited wallet-card labels below 12px, recorded separately from
  new Kakeibo regressions.
- After separately approved migration, owner review of any `legacy_unknown`
  months and the runbook smoke checks in the homelab.

## Risks, blockers, and approval gates

1. **Live-state blocker:** active context, namespace, Argo health/sync, deployed
   images, ingress exposure, PVC state, and live schema are unknown because
   Kubernetes tooling was unavailable. These must be verified by an authorized
   operator before planning an execution window.
2. **Schema delivery blocker:** inspected GitOps manifests provide migration
   hooks only for 002 and 003; 004–006 and the fresh-install Kakeibo schema are
   not represented in the inspected desired state. Add and review the required
   migration/bootstrap configuration before any release.
3. **Recovery blocker:** durable off-cluster backup retention and encrypted
   artifact restore are unverified. A successful controlled restore using an
   owner-verifiable artifact is required.
4. **Image blocker:** candidate images for reviewed source `ccb318d` were not
   verified as available. CI success alone does not publish feature-branch
   images.
5. **Private-network gate:** verify actual ingress and network reachability
   remain private; no-auth writable MoniKey must not be exposed publicly.
6. **Human QA gate:** real mobile browsers, other engines, and screen readers
   remain outstanding.

Required explicit approval gates are: approval of the live schema inventory;
approval of the verified backup and restore plan; approval of the exact
migrations and compatible image SHAs; and a separate owner authorization for
deployment. This report grants none of those approvals.

**Overall: BLOCKED.** The assessment validates repository-level release
planning and records a recent successful backup workflow, but critical live
state and durable recovery evidence are missing. The safe next action is an
authorized read-only cluster/schema inventory and an owner-verified durable
backup/restore proof, followed by review of GitOps migration and image
availability changes. Do not deploy or migrate based on this report alone.
