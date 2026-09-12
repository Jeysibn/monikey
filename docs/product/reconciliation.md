# Reconciliation

Reconciliation compares a user-entered statement closing balance with the
account opening balance plus cleared ledger balance effects through the
statement date. The comparison is persisted in PostgreSQL, including the
statement value, calculated value, difference, status, account and date.

The API is available at `POST /api/v1/reconciliations`, with list/detail reads
at `/api/v1/reconciliations`. Monetary API values are decimal integer strings;
no floating-point arithmetic is used for the comparison.

An exact zero difference is `reconciled`; any non-zero difference is
`unreconciled` and should be investigated against missing, duplicate, pending,
or incorrectly dated transactions.

## Related

- [Architecture](../ARCHITECTURE.md)
- [README](../../README.md)
