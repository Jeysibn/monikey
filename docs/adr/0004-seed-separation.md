# ADR-0004: Separate demo and system seed workflows

## Status

Accepted

## Context

Production schema deployment previously invoked Prisma seeding, and the seed contained demo users and financial records. That made an operational migration command capable of mutating application data unexpectedly.

## Decision

`prisma migrate deploy` performs schema migrations only. Stable built-in data is seeded with `db:seed:system`. Demo data is seeded separately with `db:seed:demo` and requires explicit `MONIKEY_DEMO_MODE=true`; production additionally requires `MONIKEY_ALLOW_DEMO_SEED=true`.

## Alternatives considered

- Keep one combined seed: rejected because production startup must be safe.
- Remove all seed data: rejected because system categories and local demos remain useful.

## Consequences

Deployments need an explicit system-seed step when required. Demo environments are intentional and auditable. Existing production data is not reset or seeded by migration deployment.

## Related documentation

- [Architecture](../ARCHITECTURE.md)
- [README](../../README.md)
