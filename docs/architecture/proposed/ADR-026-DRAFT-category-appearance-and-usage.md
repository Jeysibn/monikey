# DRAFT ADR-026 — Category color, wider icon set and usage counts

- **Status:** PROPOSED — needs owner approval before any migration or API code is written. Not applied anywhere. No production migration is authorized by this document.
- **Date:** 2026-11-12 · **Extends:** ADR-022 (category lifecycle) and ADR-023 (optional `icon_key`, only on PR #25's branch).
- **Why an ADR:** it adds a database column, widens a database CHECK, and adds a derived API field. ADR-023 set the precedent that category appearance gets an ADR and a backup-gated migration.

## Decision

1. **Migration `009_category_colors.sql`** (additive; follows 008 from PR #25, so PR #25 must land first or be the base):
   - `ALTER TABLE categories ADD COLUMN color_key TEXT` with `CHECK (color_key IS NULL OR color_key IN (…curated keys…))`. Keys are names (`blue`, `green`, `teal`, `amber`, `orange`, `red`, `pink`, `purple`, `indigo`, `slate`), **not** raw hex, so the database cannot hold arbitrary CSS and the frontend owns the contrast-checked foreground/background pair for each key.
   - Replace `categories_icon_key_allowed` with a **superset** CHECK so the approved picker can offer more icons (mock shows about 14). No existing value becomes invalid.
   - Existing rows stay `NULL` for both fields: no backfill, no inference. The UI shows a deterministic neutral fallback (generic tag icon, slate), exactly as ADR-023 does for icons.
2. **API:** `GET /api/categories[/{id}]` also returns `color_key` and a derived `usage_count` (all-time count of transactions referencing the category; income and expense alike; archived rows included). `POST` and `PATCH` accept `icon_key` and `color_key` (value sets, `null` clears, omitted leaves unchanged), validated against the same allowlists with 422 `invalid_field`. Old clients ignore the new fields; old API builds ignore nothing they did not already ignore.
3. **Frontend contract:** `types.ts` `Category` gains `colorKey?` and `usageCount?`; `wire.ts` parses both, treating an unknown or missing key as the fallback (never an error); `httpSource`, `mockSource` and `mockData` get the same fields so mock and HTTP behave alike; Lucide icons are imported individually (no dynamic component names).
4. **Invariants:** appearance and usage never change category IDs, types, amounts, balances, archive state, default envelopes or saved Kakeibo envelopes. A default-envelope edit still affects future suggestions only (ADR-022).
5. **Deletion safety unchanged:** delete only when unreferenced; `usage_count > 0` disables Delete in the UI and the API/FK remain the final guard.

## Alternatives rejected

Free hex colors (unsafe, unreadable combinations, hard to validate); storing foreground/background pairs in the DB (the pair is presentation and belongs in code); computing usage in the browser (would only see loaded rows); a separate appearance table (splits one lookup for two columns).

## Rollout and rollback

Same checksum and backup-gated runner as 007/008; rehearsed in the disposable QA stack with before/after fixtures (`database/tests/*`), plus a migration test asserting existing rows and transactions are byte-identical. Rolling the API back leaves the extra column harmlessly unused. Production rollout is a separate, explicitly authorized release.

## Approval needed

- [ ] Approve migration 009 with the curated color keys and widened icon allowlist.
- [ ] Approve `usage_count` as an API field.
- [ ] Confirm PR #25 (migration 008) is the base for this work.
