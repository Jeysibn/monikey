# Split transactions

Split transactions divide one parent ledger amount across multiple categories.
The parent transaction remains the balance-affecting record; split rows only
provide reporting allocation. The API replaces a parent’s splits atomically.

Every split amount is an integer minor-unit string, and the exact sum must equal
the parent amount. Categories are checked for ownership or protected system
scope before writes. A split cannot be saved with fewer than two lines.

## Related

- [Ledger architecture](../ARCHITECTURE.md)
- [Reports](reports.md)
