# Transaction rules

Transaction rules are deterministic, user-owned automation applied during
import commit. Rules are evaluated by ascending priority and then creation
order. Conditions can match merchant/title text, amount ranges, account, type,
source, and currency. Actions can normalize the merchant, assign a category,
add tags, set a note, or change transaction type.

Rules do not calculate balances, call AI, or post transactions independently.
Import rows remain individually retryable if a rule or ledger operation fails.

API endpoints are under `/api/v1/rules`; use `/rules/preview` to evaluate a rule
without mutating data.

## Related

- [Imports](imports.md)
- [Financial architecture](../ARCHITECTURE.md)
