# MoniKey documentation

Start with the [beginner learning guide](LEARNING_GUIDE.md). It walks from the
application's purpose through architecture, local development, tests, delivery,
versioning, and operations.

## Current references

- [Project overview](../README.md) — features, privacy boundary, and current
  release uncertainty.
- [Learning guide](LEARNING_GUIDE.md) — five-stage learning path, transaction
  walkthrough, glossary, commands, and troubleshooting.
- [Architecture index](architecture/README.md) — TLD, accepted decisions,
  roadmap, and diagrams. Some diagrams are explicitly historical snapshots.
- [Backend guide](../backend/README.md) — FastAPI routes, local setup and API
  tests.
- [Database guide](../database/README.md) — tables, migrations, invariants and
  disposable database checks.
- [Frontend guide](../frontend/README.md) — app structure, development and
  frontend/browser tests.
- [Changelog](../CHANGELOG.md) — released and unreleased product changes.
- [MoniKey delivery overview](operations/AUTOMATED_DEPLOYMENT.md) — source
  workflow and current evidence; detailed Kubernetes operations remain in the
  separate GitOps repository.

## How to read older documents

`docs/design/` contains accepted design references and dated implementation
reports. `docs/operations/` and `docs/quality/` include release-specific
assessments and rehearsals. A historical document can accurately describe its
own test or rollout and still be stale as a statement about today's code or
cluster. Check its date and compare it with current source before following an
operational instruction. The GitOps repository is authoritative for Kubernetes
desired state; production status requires current runtime evidence.
