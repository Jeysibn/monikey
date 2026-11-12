# MoniKey UI redesign: final integration-readiness report

**Date:** 2026-11-12 · **Audited commit:** `feat/ui-redesign-overview-activity` (the final commit that contains this file's parent; see `git log`) · **Scope:** local verification only.

> **What this document is not.** It is **not** a deployment record. Everything below is *source implementation* and *automated-test verification* on disposable infrastructure with synthetic data. **Nothing has been pushed, opened as a PR, merged, deployed or migrated on a real database.** What production is running, and its schema version, is unknown (see `AUTOMATED_DEPLOYMENT.md`). Real-device iOS Safari and Android Chrome checks are **pending**.

> **Addendum (after owner review of the running build).** The audit table below was measured before these owner-requested changes: Overview quick-action row and "View analytics" button removed; card edges aligned on Overview, Dashboard and Kakeibo; real-artwork wallet faces no longer print name and type; Dashboard data tables open in a window; lighter, self-clearing chart highlight; and category colors that may be a custom `#rrggbb` (ADR-026 amended, migration 009 edited in place because it has never been applied anywhere). Re-run counts after these changes are in the commit log and the summary given with them (unit 399, mock-mode and real-API Playwright re-run, backend 116); treat the numbers in section 2 as the pre-change baseline.

Three levels are kept apart throughout:

| Level | Meaning | Status |
|---|---|---|
| **Source** | The code, SQL and documents exist on the local branch stack | Done |
| **Automated verification** | Tests ran green on disposable Docker databases and a headless browser | Done (matrix below) |
| **Production** | Images built from `main`, backup taken, migrations 008 and 009 applied, GitOps synced | **Not started; needs the owner's approval at each gate** |

## 1. Implementation status by page

| Page | State | Notes |
|---|---|---|
| Overview | Implemented | Net-position hero first; quick actions (Add expense, Add income, Transfer, Pay card); reserved-height welcome slot (no layout shift); wallet deck with original artwork; per-block error isolation |
| Dashboard | Implemented | Two independent date scopes; six native-SVG charts, each with a data table and keyboard readout; error boundary; ADR-025 (no chart library) |
| Activity | Implemented | Month, account, type and category filters, debounced search, Reset filters, honest count, paging, Add/Edit/Delete, account deep links |
| Accounts | Implemented | Search, type filter, sorts that never rank card debt as a balance, saved view, details drawer/sheet, quick actions, original artwork |
| Kakeibo | Implemented | Plan & Progress and Reflections tabs, envelopes, classification, plan details |
| Categories | Implemented | Tabs, icon, color (ADR-026), usage counts, styled archive/delete confirmations |
| Shared dialogs | Implemented | Add/Edit transaction (date after amount, searchable account picker, sticky footer), Pay card, Transfer, Add account, category editor, plan editor, More |

## 2. Test matrix (final commit, fresh disposable infrastructure)

| Check | Result |
|---|---|
| TypeScript (`tsc -b`) | pass, exit 0 |
| Frontend lint (`oxlint`) | pass, exit 0 |
| Frontend production build | pass (`built in ~0.5 s`); main chunk 558 kB (Vite's 500 kB warning, see section 6) |
| Frontend unit tests | **395 pass, 0 fail, 0 skipped** |
| Backend (`backend/test.sh`, disposable PostgreSQL 17.6) | **106 pass** (was 99; +7 this audit) |
| Database fresh install + accounting + migration tests (`database/test.sh`) | pass; 18 Python runner tests OK |
| Fresh install through compose init (001 plus 004 to 009) | pass; `color_key`, `icon_key` present |
| Upgrade 006, 007, 008 and 009 baselines to 009 with the runner | pass at every baseline; adoption without `MONIKEY_MIGRATION_APPLY` refused; re-run without permission is a no-op; a tampered ledger checksum is refused |
| Recovery rehearsal (`database/rehearse_recovery.sh`) | pass: pre-005 backup restored, migrated through 009, API ran against it; balances and totals preserved |
| Artwork validation (`artwork:validate`, `artwork:review`) | pass: 18 owner-curated visuals, 18 abstract backups; card artwork files are unchanged from `origin/main` |
| Container builds (API and frontend images) | pass; images removed afterwards |
| Playwright, **real API**, fresh DB (89 tests) | **70 pass, 19 skipped (mock-only), 0 fail** (Dashboard fixture run: 9 pass, 2 skipped; remaining files: 61 pass, 17 skipped) |
| Playwright, **mock mode** (89 tests) | **70 pass, 19 skipped (need the real API), 0 fail** |
| Accessibility and responsive | Covered by the pass counts above: `release-audit.spec.ts` (new) checks six pages, seven dialogs, More, five mock states and chart tables at 320, 360, 390, 768, 1024 and 1440 px (real API: 16 pass, 5 skipped; mock: 21 pass); plus per-page axe checks in each feature spec |

Console and page errors during a 36-screenshot sweep of every page at every width: **none**.

Tests added or fixed by this audit: `release-audit.spec.ts`, `financial-flows.spec.ts`, `backend/tests/test_financial_integration.py` (4), three more Activity-filter tests, filter checks in `test_fixtures.py`; real-API-only and mock-only specs now **skip** instead of fail on the wrong source; the twelve-scan Accounts check got a longer timeout.

## 3. Financial correctness

Verified by hand-computed figures, through the API (`test_financial_integration.py`) and through the screens (`financial-flows.spec.ts`):

- A **card purchase** is an expense and raises debt. A **card payment** lowers debt and the paying account and adds **no** expense. A **transfer** moves money and is neither income nor expense. Month expenses, income, liquid balance, card debt, net position, the Dashboard analytics totals and the Kakeibo report all agree after each step, after an edit, and after deleting each record in turn.
- Overpaying a card is **credit** (`credit`, `card_credit`), not a negative expense; net position adds it back.
- **Kakeibo** planning, classification and reviews are metadata: balances and the summary are byte-identical before and after. Classified plus unclassified expenses equal the ledger's total.
- **Categories:** icon, color and default envelope persist and come back from every read; archive and restore never change balances or the summary; a used category cannot be deleted; an unused one can.
- **Dashboard:** the monthly KPIs follow only the Reporting Month and are unchanged by the analysis range, account filter and sorting (`dashboard.spec.ts`, real API).
- **Activity:** search, filters and paging checked across page boundaries; account deep links from Accounts and the drawer set the account and clear stale filters.
- **Artwork and quick actions:** original wallet artwork unchanged from `origin/main`; Overview and Accounts quick actions open the right dialog with the right account.

No financial defect was found. Money is exact decimal strings end to end; no frontend arithmetic on floats was introduced.

## 4. API and database compatibility

**Activity API (decision: no ADR required, documented for the owner's confirmation).** Optional `q` on the three Activity reads, plus `category_id` and `kind` on `GET /api/transactions`. Reviewed against `CLAUDE.md`, `AGENTS.md`, `ADR.md` and the playbook: no new endpoint, table, column, migration, service, pattern or dependency, so no ADR. Confirmed: requests without the parameters are unchanged; filters run in SQL before `ORDER BY` and `LIMIT` (a page of `n` is always the first `n` of the full filtered order); search is a bound `ILIKE` with `%`, `_`, `\` literal; validation is strict (422 for `q` over 80, bad `kind`, `category_id` under 1); the three endpoints behave consistently and the rules are written in the TLD (*Activity filter contract*), `API_CLIENT_PLAN.md` (B5), `docs/api-fixtures/README.md` and `ACTIVITY_SEARCH_FILTERS.md`. Parameters an endpoint does not define are ignored (pinned by a test). **No genuine architectural change was found.**

**Migrations.** Registered in order 001 to 009 in `database/migrate.py` with SHA-256 checksums; the runner refuses gaps, unknown versions, tampered checksums, and a ledger that disagrees with the live schema. 008 and 009 are additive, nullable, and leave existing rows untouched. 009 replaces `categories_icon_key_allowed` with a strict superset under the same name. CI already runs the runner tests, `database/test.sh` and `backend/test.sh`.

**ADR log.** ADR-025 (native SVG) was already accepted in `ADR.md`. ADR-026 (category color, icon set, `usage_count`, migration 009) existed only as a proposal; it is now recorded in `ADR.md` as accepted by the owner's 2026-11-12 direction, with the explicit note that no production migration is authorized. **Please confirm that promotion.** ADR-023 to 026 exist only on this stack; renumber on merge if another ADR lands first.

## 5. Accessibility and responsive review

At 320, 360, 390, 768, 1024 and 1440 px on all six pages and the shared dialogs: no horizontal page scroll; no control pushed past the right edge (outside deliberate scrollers); no WCAG 2.0/2.1 A/AA axe violation; the Add transaction date and account fields are reachable without scrolling on a 390 x 700 phone; the primary action of each dialog stays on screen at a 640 px-tall phone; Tab and Shift+Tab never leave an open dialog; Escape closes it and focus returns to a real control (restored on the next frame); the main navigation works from the keyboard; every Dashboard chart has a labelled data table and an arrow-key readout; loading, empty, error and success states behave as specified (mock scenarios `no-accounts`, `no-plan`, `load-error`, `over-limit`, `many` pass axe and overflow checks at 320, 768 and 1440). Visual comparison with the approved mockup (Overview, Dashboard, Accounts, Kakeibo and Categories sampled at 390 and 1440) shows the same structure; differences are the deliberate ones recorded in the redesign docs (real ledger figures, over-limit warnings, no fictional "preview" chrome).

**Still pending (cannot be automated here):** iOS Safari and Android Chrome on real devices (safe areas, on-screen keyboard over the sticky footer, rubber-band scrolling, date picker, drawer/sheet gestures, the wallet swipe). Keep that checklist (`docs/design/UI_REDESIGN_PROGRESS.md`) open.

## 6. Remaining defects

| Severity | Item |
|---|---|
| **Blocker** | none found |
| **High (process, not code)** | Merging **any** PR from this stack to `main` makes CI publish SHA-tagged images and the Deploy workflow request a GitOps release. An API image that expects migration 008 or 009 must not be released without the backup-gated migration step. See the strategy in section 8: merge once, as a single release, or keep intermediate PRs off `main` |
| Medium | CI does **not** run the Playwright suites; they are local only. A reviewer must run them (README *Two environments*) or the owner should accept that gap |
| Medium | PR #25's remote branch (`245d8a8`) holds only 3 Moki commits while its title describes the whole stack; PRs #26 to #29 are closed. The consolidated work exists only locally (see section 7) |
| Low | Real-device checks pending (section 5) |
| Low | Main JS chunk is 558 kB (Vite warns above 500 kB). The Dashboard is already lazy-loaded; further splitting is optional and was not done to stay in scope |
| Low | The real-API Playwright specs create records and are not idempotent; a database full of earlier QA data slows the twelve-scan Accounts check. Run them on a fresh volume |
| Low | Housekeeping: `refs/original/*`, `refs/backup/consolidation/*`, five `/tmp` worktrees whose directories are gone (`prunable`), and two older QA compose projects whose files lived in `/tmp` (left untouched) |

## 7. Git branch and dependency map

Linear history, **0 commits on `origin/main` that the stack lacks** (merge base is `origin/main` itself, `3f8a6d0`); 2 merge commits (`223b83c` joining the #26 to #29 modernization stack, `4378a4f` joining Phase 2). No duplicated commits.

```
origin/main 3f8a6d0
 └─ feat/frontend-moki-integration a3ebf23   +18  (PR #25 content: Moki + #26..#29 stack + fixes; migration 008)
     └─ 4378a4f  Phase 2 Add/Edit Transaction (merge of feat/ui-redesign-transaction-dialog)   +6
         └─ feat/ui-redesign-categories-nav e288810   +4   (migration 009, ADR-026)
             └─ feat/ui-redesign-kakeibo 2358e1e      +3
                 └─ feat/ui-redesign-dashboard 212f5d1    +10
                     └─ feat/ui-redesign-accounts ba97231    +5
                         └─ feat/ui-redesign-overview-activity (HEAD)   +15 and this audit's commits
```

Every listed branch is an ancestor of the next. **Local versus remote PR #25:** local `feat/frontend-moki-integration` is **15 commits ahead and 0 behind** `origin/feat/frontend-moki-integration` (`245d8a8`), so updating it is a plain fast-forward push; **no force-push is needed.** The remote heads of #26 to #29 (`07a7c21`, `e9754af`, `af55143`, `1c4d046`) are ancestors of the local stack, so those closed PRs' commits are not duplicated.

**Refs safe to delete once you authorize it** (nothing was deleted):

- `refs/original/refs/heads/feat/ui-redesign-categories` and `.../feat/ui-redesign-transactio...`: leftovers of the approved filter-branch cleanup; their only unique content (an unpublished commit that accidentally contained your two unrelated files) was deliberately rewritten away. Safe, and in fact preferable to delete, *after* you confirm you do not want to restore it.
- `refs/backup/consolidation/pr25-head ... pr29-head`: safety pins of the pre-consolidation PR heads. Safe only after the stack is pushed and the old heads exist on `origin` (all five remote branches still do). Keep until then.
- The five `prunable` worktree entries: safe to `git worktree prune`; their directories no longer exist.
- Local branches `refactor/*`, `feat/persistent-category-icons`, `feat/financial-analytics-dashboard`, `feat/ui-redesign-*`: do **not** delete before the stack merges; they are the stack's seams.

## 8. Recommended PR sequence (nothing created)

**Goal:** keep every PR reviewable, never duplicate a commit, never rebase, and release **once**.

1. **Do not squash or rebase.** Squashing the bottom PR changes its SHA and forces every PR above it to be rewritten. Use *merge commits*.
2. **Use PR #25's branch as the integration branch** and keep every intermediate PR **off `main`**, so no intermediate merge triggers a deploy request:
   1. Fast-forward `feat/frontend-moki-integration` to `a3ebf23` (updates draft PR #25, base `main`). Reviewers see 18 commits; most of it was already reviewed as #26 to #29.
   2. Open stacked PRs targeting `feat/frontend-moki-integration` (each head is the previous tip plus its own range): Phase 2 transaction dialog (`4378a4f`), Categories + migration 009 (`e288810`), Kakeibo (`2358e1e`), Dashboard (`212f5d1`), Accounts (`ba97231`), Overview + Activity + audit (HEAD). Each is 3 to 15 commits and 16 to 56 files.
   3. Merge them bottom-up into the integration branch with merge commits.
   4. Take PR #25 out of draft and review the *whole* once against `main`, with the checklist below.
3. **Merging #25 into `main` is the release event.** Treat it as such: it publishes images and requests a GitOps release.
4. Keep the two unrelated untracked spec files out of every PR.

The alternative, merging each PR to `main` in turn, is workable only if every intermediate image is safe to deploy against the previous schema; that is **not** the case for 008 and 009, so it is not recommended.

## 9. Release checklist with approval gates

| # | Step | Gate |
|---|---|---|
| 1 | Owner confirms: the Activity API needs no ADR; ADR-026 promotion; refs cleanup plan | **Owner approval** |
| 2 | Push the stack branches (fast-forward only) | **Owner approval** |
| 3 | Open the stacked PRs; CI (frontend checks, artwork, runner tests, `database/test.sh`, `backend/test.sh`, container builds) green on each | **Owner approval** to open |
| 4 | Run the Playwright suites on a fresh Compose stack (CI does not) and complete the real-device checklist | Evidence attached to PR #25 |
| 5 | Review the whole of #25 against `main`; resolve comments | Reviewer sign-off |
| 6 | Verify `homelab-gitops` prerequisites: the backup/restore-verify step, migration hook, image-pair promotion, and that the migration runner permits 008 and 009 (apply-missing is only on in the gated release) | **Owner approval** |
| 7 | Merge #25 to `main` (this requests the release) | **Owner approval; the release starts here** |
| 8 | GitOps: backup restore-verified, migrations 008 then 009 applied by the runner, Argo CD healthy, `/api/health/ready` ok, smoke test | Release owner |
| 9 | Record the real outcome (image SHA, schema version) in `AUTOMATED_DEPLOYMENT.md` | After the fact only |

**Rollback and recovery limits.** Rolling the application back is safe with 008 and 009 applied: both are additive nullable columns and a superset CHECK, and an older API ignores them. Rolling the *schema* back is not automatic: the runner has no down-migrations and refuses a ledger ahead of the code. The recovery path is the verified pre-release backup restore (rehearsed here on disposable databases only; the production backup/restore has not been exercised by this audit). A restore discards anything written after the backup. Migration 007's trigger keeps archived categories unselectable even from an older API.

## 10. Final recommendation

**READY FOR PR REVIEW.** The redesign is complete, behaves correctly, and its automated verification is green on fresh disposable infrastructure; no defect that blocks code review was found. This is a recommendation about *review*, not release: the High item in section 6 (merging to `main` is a release event) and the pending real-device checks must be handled before step 7 of the checklist. Production deployment has not begun and is not authorized by this document.
