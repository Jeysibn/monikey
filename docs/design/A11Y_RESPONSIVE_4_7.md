# Milestone 4.7 — Accessibility and responsive pass

**Historical milestone status:** implemented and verified; committed as `85a483c`. At the time of the original report, it was awaiting Codex review. Scope: an automated and by-eye audit of every screen and dialog, and the fixes it found. **Not done:** anything that needs a real phone, another browser engine or a screen reader (see [`REAL_DEVICE_CHECKLIST.md`](REAL_DEVICE_CHECKLIST.md)). No backend, database, CI/CD, Kubernetes or GitOps file was touched. **No dependency changed.** The Impeccable engine was **not** run; the project audit script was used instead.

Related: [`RESPONSIVE_GUIDELINES.md`](RESPONSIVE_GUIDELINES.md) · [`UI_UX_SPEC.md`](UI_UX_SPEC.md) · [`CODEX_REVIEW_BRIEF_4_7.md`](CODEX_REVIEW_BRIEF_4_7.md)

## 1. What was audited (`frontend/scripts/audit-a11y.cjs`, 243 checks)
Uses `playwright-core` and the Chromium already on this machine; no network, nothing installed. It reports findings; it changes nothing.

| Area | Checks |
|---|---|
| Structure and names | `lang`, title, pinch zoom not blocked, one `main`, one visible `h1`, heading levels, duplicate ids, named landmarks, every visible control has an accessible name, no positive `tabindex`, nothing focusable inside `aria-hidden`, one `aria-current` |
| Contrast (rendered) | Every visible text run in all three screens and four rare states (over limit, overpaid, below zero): colour against its real background (alpha blended), 4.5:1 (3:1 for large text); field borders 3:1 |
| Width sweep | 320, 360, 375, 414, 768, 1024, 1280, 1920 × three screens (Activity with 58 entries): horizontal scroll, touch targets under 44px (phones) and under 24px (all), clipped text, text under 12px, ordinary amounts breaking across lines |
| Keyboard | Tab through every stop on each screen at 375 and 1280: visible focus indicator, focus not hidden under the fixed bottom bar (WCAG 2.2 2.4.11) |
| Dialogs | Quick Add, Edit, Delete confirmation, Add account at 375×812, 1280×800, 667×375 (landscape phone) and 320×480: role, accessible name, description, one title in the DOM, background hidden from assistive tech, scroll lock, fits in 92% of the height, footer visible, focus trap over 40 Tab presses, Escape |
| Zoom and text size | 320px wide (= 400% zoom): no sideways scroll; root text at 200% on a 375px phone: no sideways scroll, no clipped text; dialog at 200% |
| Motion | `prefers-reduced-motion`: no running animation |
| Colour vision and forced colours | Screenshots under deuteranopia, protanopia, tritanopia and achromatopsia (Chromium emulation) and with forced colours; the selected type option must still be distinguishable |
| Keyboard-only journey | Add an expense with Tab, arrows, Space and Enter only |
| Worst-case content (through the UI) | A 60-character account name, a card name of 56 characters, `₱9,999,999,999.99` as a balance, limit, debt and expense, and a 120-character note, at 320, 375 and 1280, on all three screens |

## 2. Findings and fixes
| # | Finding | Severity | Fix |
|---|---|---|---|
| 1 | **Accounts at 320px scrolled sideways**: the "Money you owe ₱21,050.00 owed" header could not fit | Critical | Section headers wrap; the titles are no longer `nowrap`; card names truncate |
| 2 | **Focus could be hidden under the fixed bottom bar** when Tab reached a row near the bottom (Overview, Activity, 375px) | Serious | `scroll-padding-bottom` on `html` below 768px |
| 3 | **Large amounts broke layouts.** `₱9,999,999,999.99` (legal in the database), and sums beyond it, pushed Accounts, Overview and Activity sideways and clipped totals | Serious | `MoneyText` shrinks past 12 characters in steps (0.85, 0.72, 0.6, never below 12px) and only then may break between digits; amounts that own a row use `wrap`; long card names truncate; ordinary amounts are untouched |
| 4 | **Fixed `px` font sizes ignore a person's text-size setting** (35 uses such as `text-[15px]`) | Serious | All converted to `rem` |
| 5 | **At 200% text the layout broke**: a row's title was squeezed to 15px by the amount; Pay card squeezed the credit text to 27px; the bottom bar, dialog footer, type switch and page header overflowed | Serious | Transaction and account rows wrap (the amount drops under the text only when space runs out); card tile wraps; header and footer wrap; type switch stacks only when needed (`auto-fit`); bottom bar uses `minmax(0, 1fr)`, truncating labels, with label and Add sizes capped in `px` so the bar stays usable; dialog title padding is `px` (the close button is 44px fixed) |
| 6 | **My own regression**, found by looking at a screenshot: the first fix made the "Money you have / Card debt" figures break mid-number at 320px with ordinary data | Serious | Those two figures are 18px below 360px; the audit now fails if an ordinary amount ever breaks across lines (proved to fire by forcing the regression) |
| 7 | **Codex review: the largest amounts rendered at 9.6px** (0.6 of a 16px row amount), unreadably small | Serious | `MoneyText` never goes below `0.75rem`; past that it wraps. The worst-case audit now fails on any text under 12px (proved: with the floor removed it reports 9 findings, with it restored 0) |
| 8 | **Found by looking at the worst-case screenshot: the Activity month select cut off "October 2026" at 320px** (two selects side by side). My audit never measured select text | Serious | The two selects stack below 360px; the audit now measures the chosen option's text against the select (it fails on the old code, passes on the fix) |
| 9 | Codex review (nice-to-have): the keyboard-only journey chose the account with Playwright's `selectOption`, bypassing the keyboard | Info | It now focuses the select and types "Cash"; the check asserts the choice |
| 10 | Reading order of an Activity row is now *title, category · account, amount* (the amount used to come between). A screen reader says "Expense: Lunch with team, Food · GCash, −₱385.00" | Info | Intentional; harness expectations updated |

**Audit false positives fixed (not product bugs):** screen-reader-only text counted as "clipped"; the hidden second nav counted for `aria-current`; "background still exposed behind a dialog" — Radix hides every control and heading behind a dialog but deliberately leaves the live region that announces saves, so `<main>` itself stays exposed while its contents are hidden. The audit now checks what a reader could actually reach.

## 3. Results (exact)
- Audit after fixes: **0 findings, 243 checks passed.** (First run: 47 findings.)
- `npm test`: **103 tests, 103 pass, 0 fail.** `npx tsc -b --noEmit`: no errors. `npm run lint`: no findings.
- Browser harnesses: **account 47/47, edit 57/57, quickadd 83/83, activity 58/58, accounts 108/108, overview 177/177.**
- Not run: `npm run build`. Screenshots (16) in `docs/design/screenshots/m4-7/`.

## 4. Looked at by eye
- **Colour vision (resolves owner item F2 as far as a simulation can):** under deuteranopia income green and debt orange become similar olive tones, so **meaning must not rely on hue, and it does not**: income has `+`, expenses `−`, debt says "owed", card credit says "card credit", payments have a "Payment" chip and no sign, warnings carry an icon and words. Protanopia, tritanopia and achromatopsia were also captured and read correctly.
- **Forced colours:** the selected option of the three-way type switch keeps its check mark; chips keep theirs; focus rings remain. The four-way type switch (Add account) has no check mark, only a raised pill; in forced colours the audit's check found it still distinguishable, but this deserves a real-device look.
- **Text at 200%:** everything reflows; the hero figure breaks into three lines at 320px (legible, not pretty); bottom-bar labels may truncate at 320px with 200% text.

## 5. Not verified / limitations
- **Real phones** (virtual keyboard and the bottom sheet, `dvh`, safe areas, pinch zoom, Android/iOS font-size settings), **Firefox and WebKit/Safari**, **screen readers** (VoiceOver, TalkBack, NVDA). Use the checklist.
- Contrast was measured on rendered text and field borders, not on every icon or on focus rings against every background.
- Radix's decision to leave the live region (and so `<main>`) exposed behind a dialog is a library behaviour; a screen reader may announce an empty main landmark. Worth confirming with a real screen reader.
- The audit is Chromium only and a first pass; it complements, never replaces, manual testing.

## 6. Next
This historical report's next-step note is superseded. The HTTP client and load/error states are now implemented; complete the real-device checklist and verify the HTTP source against FastAPI when a backend exists.
