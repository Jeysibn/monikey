# UI/UX redesign — implementation progress

Source of truth: [MONIKEY_UI_UX_REDESIGN_SPEC.md](./MONIKEY_UI_UX_REDESIGN_SPEC.md) (agreed design direction, 2026-11-11).
`DESIGN.md` and `UI_UX_SPEC.md` still describe the older baseline until the redesign lands.

## Phase 2 — Add/Edit Transaction (local branch `feat/ui-redesign-transaction-dialog`)

Implemented:

- Field order: Type, Amount, Date, Account(s), Category, Kakeibo envelope, preview and warnings, Note, footer.
- `AccountPicker`: searchable inline combobox (grouped Last used / Cash & bank / E-wallet / Credit cards, balance or amount owed per option, arrow keys, Enter, Escape closes only the list). Eligibility still comes from `accountsFor`.
- `DateShortcuts`: Today / Yesterday beside the native date input; "today" is the data source's Asia/Manila date. No time of day.
- Compact Kakeibo row (`EnvelopePicker`): shows the choice and suggestion, five chips on request; suggestion still never overwrites a manual choice or a stored envelope.
- `DialogContent size="wide"`: 580px desktop dialog, near-full-height phone sheet, capped to the visual viewport while a keyboard is open.
- Pure rules in `src/lib/accountPicker.ts` with tests in `tests/accountPicker.test.ts`.

Not yet done (blocked on later phases): category icons and colors in the form (need backend support: migration, API, `wire.ts`).

No change to ledger rules, validation messages, save/delete flow, or backend.
