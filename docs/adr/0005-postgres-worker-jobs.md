# ADR-0005: PostgreSQL-backed worker jobs

## Status

Accepted

## Context

The worker previously relied on an in-process interval. A process restart could lose scheduled work, and multiple workers could run the same maintenance cycle.

## Decision

Use a small `worker_jobs` table in PostgreSQL. Workers claim due rows with `FOR UPDATE SKIP LOCKED`; stale running jobs can be reclaimed, failed jobs use exponential backoff, and exhausted jobs become `dead`. Deduplication keys make daily scheduling idempotent.

## Alternatives considered

- Redis or a message broker: unnecessary while PostgreSQL is the system of record.
- Keep `setInterval`: loses durable scheduling and multi-worker safety.

## Consequences

The worker requires the new migration. Operators should monitor dead jobs and stale backlog.

## Related documentation

- [Architecture](../ARCHITECTURE.md)
- [Disaster Recovery](../Disaster-Recovery.md)
