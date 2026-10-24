# Review Brief for Codex — Milestone 4.4 (Activity screen)

**Read-only.** Do not edit files or install anything. **Do not run `npm run build` or `npm ci` in `frontend/` while Claude Code may be editing.** Safe: `git diff HEAD`, `git status`, `npm test`, `npx tsc -b --noEmit`, `npm run lint`.

**What to review:** `git diff HEAD` plus the new files (`ActivityView.tsx`, `verify-activity.cjs`). 4.3 is committed (`651d732`). Record: `docs/design/FRONTEND_ACTIVITY_4_4.md`. Spec: `UI_UX_SPEC.md` §5 and §10.

## Evaluate
1. **Contract fit (B1–B3)** — does `activityPage()` / `buildActivity(accountId)` in `src/lib/finance.ts` model the proposed API faithfully (filter before limit, payments match either side, `limit + 1`, date → created_at → entries-before-payments → id)? Is the mock a safe stand-in for the real client later?
2. **Correctness** — count line, hasMore boundaries (exactly one full page is not "more"), page size reset on filter change (`filterKey` in `ActivityView`), `dayHeading` independent of time zone.
3. **Accessibility** — one control per action (phone row button vs desktop icon buttons, one hidden with CSS), icon-button names, `h2` per day, `role="status"` count line, focus to first new row after Load more, focus return after the stand-in dialogs.
4. **Simplicity** — anything over-built? Is the `focusAfterMore` effect worth its weight? Duplicate row content in two containers acceptable?
5. **Scope and architecture** — no router/store/dependency; stand-ins only; no money added in the browser.
6. **Design consistency** — empty-month button is secondary (one primary per screen). Agree?

## Known limitations (not discoveries)
Load-error and "Updating…" states not built; Edit/Delete are stand-ins; no real-device, Firefox/WebKit or screen-reader testing; `?demo=many` in the bundle; Overview's desktop empty state still has two primaries.

## Report format
Most severe first: file + line, what is wrong, why it matters, a concrete fix, blocker / should-fix / nice-to-have. Say what you could not check.
