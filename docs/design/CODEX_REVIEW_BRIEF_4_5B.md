# Review Brief for Codex — Milestone 4.5b (Edit and Delete)

**Read-only.** Do not edit files or install anything. **Do not run `npm run build` or `npm ci` in `frontend/` while Claude Code may be editing.** Safe: `git diff HEAD`, `git status`, `npm test`, `npx tsc -b --noEmit`, `npm run lint`.

**What to review:** `git diff HEAD` plus new files (`DeleteConfirm.tsx`, `verify-edit.cjs`). 4.5a is committed (`2a0d6a0`). Record: `docs/design/FRONTEND_EDITDELETE_4_5B.md`. Spec: `UI_UX_SPEC.md` §10.

## Evaluate
1. **Financial correctness (most important)** — the update and delete reducer cases in `lib/ledger.ts`: an edit keeps id and `createdAt`; changing an entry's account or amount re-derives balances/debt/expenses; deleting a card payment never touches expenses; "add then delete" restores the starting figures. Can an edit ever turn an expense into income or a payment into an expense (the kind is fixed in edit mode; is it enforced in `toUpdateAction`/`entryValues`)?
2. **Delete wording** — `deleteSummary`: each text matches the spec and is financially true (expense on cash "goes up", on a card "owed goes down", income "goes down", payment both). The monthly clause only for the month being viewed. Is "owed goes down" correct when a card is already in credit?
3. **Stale entries** — `entryExists`, the 404-style errors in `App.saveEntry` / `deleteEntry`. Does this map onto real 404 handling later? Is the reducer returning the same object for a missing id a sound signal?
4. **Dialog flow** — one dialog; the form stays mounted but hidden behind the confirmation (so Cancel keeps edits). Any duplicate ids, stale focus targets, or screen-reader problems from a hidden mounted form? Focus: Amount first (edit), Cancel first (delete), back to the form's Delete button, back to the row or icon, page heading when the row is gone.
5. **Edit-mode decisions** — hiding preview/warnings/Pay full and showing account names without figures: agree?
6. **Closing and saving rules** — Escape/outside click while saving or deleting, `?demo=save-error` failing the first write; delete failure keeps the dialog open.
7. **Simplicity** — `EntrySession` shape, `Body` inside `QuickAddDialog`, the dialog `key`. Anything over-built or fragile?
8. **Contract** — does this map onto `PUT` and `DELETE` for `/api/transactions/{id}` and `/api/credit-card-payments/{id}` followed by a re-fetch? B1–B4 are still unconfirmed with the backend.

## Known limitations (not discoveries)
Add account is not built; 404 paths cannot be produced in the browser; no real-device, Firefox/WebKit or screen-reader testing; no persistence; no undo.

## Report format
Most severe first: file + line, what is wrong, why it matters, a concrete fix, blocker / should-fix / nice-to-have. Say what you could not check.
