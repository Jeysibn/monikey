# Transaction tags

Status: Beta

Tags are user-owned, many-to-many labels such as `work`, `vacation`, or
`reimbursable`. They are separate from categories and do not change ledger
amounts. The API supports idempotent tag creation, listing, deletion, replacing
tags assigned to an owned transaction, and filtering transactions by tag ID.
The `/tags` page manages the user’s tag vocabulary.

Rules/import integration persists valid rule-generated tags during commit.
Reports also expose deterministic cleared-expense totals by tag at
`/api/v1/reports/spending-by-tag`.
