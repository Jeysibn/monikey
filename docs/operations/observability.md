# Observability

The API exposes Prometheus text metrics at `/api/v1/metrics`. Counters cover
HTTP requests/errors and durable worker outcomes. Database-backed gauges cover
pending and dead worker jobs, pending notification deliveries, and partially
committed import batches.

Metrics intentionally avoid raw user IDs and other high-cardinality labels.
`/health/live` checks process liveness; `/health/ready` checks PostgreSQL
readiness.

## Related

- [Architecture](../ARCHITECTURE.md)
- [Disaster recovery](../Disaster-Recovery.md)
