# Category icon guide

Category icons are optional visual hints. Category names remain visible in every
screen, so the icon never becomes the only way to identify a financial record.

## Where icons are defined

- `frontend/src/lib/categoryIconRegistry.ts` is the stable frontend registry and
  contains the icon keys, human-readable labels and Lucide components.
- `frontend/src/lib/categoryIcons.tsx` renders a chosen icon or a generic tag
  fallback for an unset or unknown key.
- `frontend/src/components/CategoryIconPicker.tsx` provides search, a selected
  preview, clearing, visible keyboard focus and arrow-key movement.
- The same key list is validated by `CategoryIconKey` in `backend/main.py` and
  by the `categories_icon_key_allowed` database constraint in
  `database/008_category_icons.sql`. Keep these three lists aligned.

The current curated keys are `shopping-basket`, `utensils`, `car-front`,
`house`, `briefcase-business`, `graduation-cap`, `heart-pulse`, `gamepad-2`,
`book-open`, `shopping-bag`, `gift`, and `piggy-bank`.

## API and persistence

`categories.icon_key` is nullable. `POST /api/categories` accepts an optional
`icon_key`; `PATCH /api/categories/{id}` accepts a key, `null` to clear it, or
omits the field to leave it unchanged. Responses include the field. Requests
with unknown keys, URLs, or executable names fail validation. Older clients can
continue omitting the field; older responses that do not include it are read as
unset. Unknown response values use the generic icon fallback rather than
preventing category data from loading.

Migration 008 adds the nullable column and allowlist constraint. It does not
backfill icons or change category identity, type, archive state, Kakeibo
defaults, transaction references, transaction amounts, account balances or
saved Kakeibo classifications. The migration is source code only until it is
separately authorized and applied through the existing backup-gated process.

## Choosing and adding a key

Choose an icon that helps distinguish a category at a glance; keep the label as
the primary identifier. Prefer the existing registry over adding similar icons
or deriving an icon from editable category names. To add an icon:

1. Add its key, accessible label and imported Lucide icon to the frontend
   registry.
2. Add the exact key to the backend validation literal and the migration's
   database constraint. Add a forward migration if a database already has 008.
3. Add wire/API tests for persistence, invalid values, clearing and unknown
   historical values.
4. Verify the icon in Categories, Quick Add and Activity at narrow and desktop
   widths. Keep decorative icon SVGs hidden from screen readers; adjacent text
   remains available.

The picker uses native buttons with `aria-pressed`, a labelled search input,
roving tab focus and arrow-key movement. Keep every item keyboard-operable and
retain the visible name next to icons in category and transaction displays.

## Verification

Frontend contract and component tests live under `frontend/tests/` and
`frontend/browser-tests/`. API tests are in `backend/tests/test_categories.py`;
offline migration-order tests are in `database/tests/test_migrate_runner.py`.
`bash database/test.sh` and `bash database/rehearse_recovery.sh` use disposable
PostgreSQL data and test preservation; neither script targets production.
