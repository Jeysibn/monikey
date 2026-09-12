# Transaction imports

CSV imports use the existing staging workflow: upload and parse, review staged
rows, then explicitly commit eligible rows to a selected account. Required CSV
columns are `date`, `amount`, and `description`; an optional `merchant` column
is retained for deterministic transaction rules. Common aliases used by
Philippine exports are accepted, including transaction date/details/particulars
and debit/credit columns. Header-based profiles may identify BPI, BDO,
UnionBank, GCash, or Maya; these are parser templates, not live bank
connections, and rows still require review before ledger commit.

Duplicate rows are skipped using a provider/content deduplication key. Rules run
during commit, and partial batches retain row-level errors and can be retried.
Rule-generated tag names are upserted as user-owned tags and assigned to the
resulting ledger transaction when valid. See [Transaction tags](tags.md).
The current UI targets CSV; OFX, QFX, and CAMT.053 remain future adapters.

Receipt OCR totals are parsed into exact integer minor-unit strings. The review
form may display a major-unit value for editing, but receipt commit sends the
validated minor-unit string to the ledger.

## Related

- [Transaction rules](transaction-rules.md)
- [Ledger architecture](../ARCHITECTURE.md)
