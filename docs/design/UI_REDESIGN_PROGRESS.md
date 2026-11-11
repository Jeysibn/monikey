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

## Phase 2 verification record (2026-11-12, local, nothing pushed)

| Check | Result |
|---|---|
| `tsc -b` | clean |
| `oxlint` | clean |
| `npm test` (node:test) | 309 tests, 309 pass, 0 fail (includes `tests/accountPicker.test.ts`) |
| `npm run build` | succeeds |
| Playwright on the Compose QA stack (throwaway project and DB, torn down afterwards) | 5/5 pass: `categories.spec.ts` (3), `quick-add-categories.spec.ts` (1, updated), `quick-add-redesign.spec.ts` (1, new, includes an axe WCAG 2.x A/AA scan with the picker open) |
| Manual scripted check, Chromium emulation | No horizontal overflow and dialog within viewport at 320, 360, 390, 768, 1024, 1440 px; footer inside viewport at 390 and 1440 |

Account picker autofocus is intentionally adaptive (owner-approved): the search box takes focus only for keyboard-initiated opens or lists over 6 accounts, so the phone keyboard does not open for every selection.

### Real-device checks still to do (not covered by emulation)

Use synthetic data only. Record device, OS and browser version for each.

**iOS Safari (iPhone, current and one older major version)**
- [ ] Add transaction opens as a near-full-height sheet; header and Save/Cancel footer stay visible.
- [ ] Tap Amount: numeric keypad appears; the sheet shrinks above the keyboard (visual viewport) and the footer is not hidden.
- [ ] Date: native date picker opens fully in view; Today/Yesterday work; the saved date is not shifted a day.
- [ ] Account picker: opens inline, list scrolls inside the sheet, tapping an option selects it, keyboard does not open for a short list, opens for a long one.
- [ ] Rotate to landscape and back; pinch/zoom text size set to large; safe-area padding under the footer on a notch/home-indicator device.
- [ ] Validation errors scroll to and focus the affected field.

**Android Chrome (a small and a large phone)**
- [ ] Same checklist as iOS, plus the back gesture/button closes the dialog or list without losing typed values unexpectedly.
- [ ] Gboard suggestions bar does not cover the account search or Save.
- [ ] Display size and font scale at maximum: no clipped controls, no horizontal scroll.

See also `docs/design/REAL_DEVICE_CHECKLIST.md` for the existing release checklist.
