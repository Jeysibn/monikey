# Future Feature: Receipt Itemization

## Current behavior

Receipt OCR treats a multi-item receipt as one transaction. Tesseract/OCR.Space
may return the individual item lines, but the parser currently extracts only:

- merchant
- receipt date
- final receipt total
- a heuristic category

The user reviews those values before saving. Individual line items are not stored
or posted separately.

## Proposed feature

Add an optional itemized draft to the OCR result:

```ts
items: [
  { description: 'Coffee', amountMinor: 15000 },
  { description: 'Croissant', amountMinor: 8000 },
]
```

Each item may later support:

- quantity
- unit price
- discount
- tax allocation
- suggested category
- user-edited category
- confidence score

## Review flow

1. OCR extracts the merchant, date, total, and candidate items.
2. The transaction form displays the candidate items for review.
3. The user can edit, remove, or add items.
4. The UI shows whether the item total agrees with the receipt total.
5. The user chooses between one combined transaction and itemized transactions.

## Posting policy

The default should remain one combined expense transaction. Itemized posting
should be opt-in because OCR cannot reliably determine categories for every
line, and splitting a receipt can alter account and budget totals unexpectedly.

## Implementation notes

- Extend `ReceiptDraft` and the persisted `parsedPayload` with `items`.
- Keep the raw OCR text for troubleshooting and user correction.
- Add parser tests for item lines, quantities, discounts, tax, and subtotal/total
  reconciliation.
- Add an explicit tolerance for rounding differences when comparing item sums
  with the receipt total.
- Preserve the existing commit flow until the user confirms the itemization.
