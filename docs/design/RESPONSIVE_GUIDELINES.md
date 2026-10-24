# MoniKey Responsive Guidelines

**Status: APPROVED by the owner (Milestone 3); implementation in progress (shell and Overview built in 4.1–4.2).** Mobile-first. Designed at **360–375px**; evaluated at **375, 768 and 1280px** as required, plus 360 (Roadmap acceptance width), 320 (WCAG reflow floor) and 1024 (the breakpoint where the layout changes most). No layout here has been rendered or measured yet; all arithmetic is from the design.

Related: [`DESIGN.md`](../../DESIGN.md) · [`UI_UX_SPEC.md`](UI_UX_SPEC.md) · [`COMPONENT_INVENTORY.md`](COMPONENT_INVENTORY.md)

---

## 1. Breakpoints (Tailwind v4 defaults)

| Name | Min width | Navigation | Grid |
|---|---|---|---|
| base (phone) | 0 | bottom bar | 1 column |
| `md` (tablet) | 768 | 80px rail | 1 column (blocks full width) |
| `lg` (desktop) | 1024 | 224px sidebar | 12 columns |
| `xl` | 1280 | same | content width grows to its 1032 cap |

No other breakpoints. Write styles for the phone first and add `md:` / `lg:` overrides.

## 2. Page frame by width

| Width | Nav | Canvas | Margin | Content width |
|---|---|---|---|---|
| 320 | bottom bar | 320 | 16 | **288** |
| 360 | bottom bar | 360 | 16 | **328** |
| 375 | bottom bar | 375 | 16 | **343** |
| 768 | rail 80 | 688 | 24 | **640** |
| 1024 | sidebar 224 | 800 | 24 | **752** |
| 1280 | sidebar 224 | 1056 | 24 | **1008** |
| 1440 | sidebar 224 | 1216 | centred | **1032** (cap) |

Gaps: 16 on the phone, 24 from 768 up. Card padding: 20 on the phone, 24 from 768 up. **One gap value** per breakpoint, used horizontally and vertically.

Desktop 12-column arithmetic (gap 24):

| Width | Column | span 3 | span 5 | span 6 | span 7 | Check |
|---|---|---|---|---|---|---|
| 1024 | 40.67 | 170 | 299.3 | 364 | 428.7 | 7 + 5 = 428.7 + 24 + 299.3 = **752** ✓ ; 6 + 6 = 364 + 24 + 364 = **752** ✓ |
| 1280 | 62 | 234 | 406 | 492 | 578 | 7 + 5 = 578 + 24 + 406 = **1008** ✓ ; 6 + 6 = 492 + 24 + 492 = **1008** ✓ |
| 1440 | 64 | 240 | 416 | 504 | 592 | 7 + 5 = 592 + 24 + 416 = **1032** ✓ ; 6 + 6 = 504 + 24 + 504 = **1032** ✓ |

(Column = (content − 11 × 24) ÷ 12; span *n* = *n* × column + (*n* − 1) × 24. Verified with a script.)

---

## 3. Navigation

| Viewport | Component | Details |
|---|---|---|
| <768 | **Bottom bar** | 68px + `env(safe-area-inset-bottom)`; four equal items (Overview, Activity, Accounts, **+ Add**); icon over label; items ≥44px tall and wide; labels 12px, never hidden. Main content gets matching bottom padding so nothing sits under it. The bar is part of the page, not a floating button. |
| 768–1023 | **Rail** | 80px; three items, icon over label; the active item's icon sits in a soft-blue pill (`primary-soft`). No Add in the rail — the page header carries it. |
| ≥1024 | **Sidebar** | 224px; mark + wordmark; three labelled items on a 44px pitch; active = soft-blue pill with `primary-ink` text. |

Landscape phones (height <500px): the bottom bar stays (4 items need only 64px), dialogs scroll internally, and the page header scrolls away with the content — it is never sticky.

---

## 4. Screen behavior by width

### Overview
| | 375 / 360 | 768 | 1024 | 1280 |
|---|---|---|---|---|
| Order | Position → This month → Credit cards → Recent activity | same | Position (12) / Recent activity (7) beside a right column (5) of This month + Credit cards | same; at 1280 the split is 578 / 406 (see §2) |
| Position card (hero) | label, hero amount (36), sentence, then the inline equation `Money you have − Card debt` in two columns | hero 40; same layout | hero 44; sentence left, equation right | same |
| Recent rows | 5 | 5 | 6 | 6–7 (balance to the right column; verify in browser) |
| Credit cards | stacked | two side by side (one if only one card) | stacked in right column | stacked in right column |

### Activity
| | Phone | 768+ |
|---|---|---|
| Filters | Two selects in **one row**, each 50% wide minus half the gap (e.g. 164 + 16 + 164 at 344). If labels do not fit at 320, the row stacks. | Two selects inline, 200px each |
| Rows | Whole row is the tap target (≥64px); no inline icons | Trailing Edit/Delete icon buttons (36px) |
| Group heading | `Sat, Oct 24` sticky is **not** used (it would cover rows under keyboard/zoom) | same |
| First row visible | Target: the first row starts in the top 60% of a 667px-tall screen. Estimated stack above it: header ≈56 + filters ≈56 + count line ≈24 + group heading ≈28 ≈ 164px (estimate, to confirm in the browser) | n/a |

### Accounts
| | Phone & tablet | ≥1024 |
|---|---|---|
| Layout | One column: *Money you have* then *Money you owe* | Two equal columns (6 + 6), each top-aligned and **not** stretched |
| Add account | Own row under the h1, right-aligned | In the page header, left of *Add transaction* |
| Credit cards | Stacked; **Pay card** full width | Stacked; **Pay card** auto width |

### Dialogs (Quick Add, Add account, Delete)
| | Phone | 768+ |
|---|---|---|
| Form | Bottom sheet, full width, ≤92dvh, internal scroll, sticky footer | Centred 480px, radius 20 |
| Type switch | Full-width segmented control, three equal segments | same |
| Buttons | Footer: **Save** (flex 1) + **Cancel**; Save is primary | Right-aligned: Cancel, Save |
| Keyboard open | `dvh` shrinks the sheet; the focused field is scrolled into view; footer remains reachable | n/a |

---

## 5. Touch targets and spacing

- Minimum **44×44 CSS px** for every phone control (buttons, inputs, selects, nav items, rows used as buttons).
- At least **8px** between adjacent targets. The two buttons in a sheet footer are 12px apart.
- Desktop/tablet icon-only row actions are **36px** (pointer devices; exceeds WCAG 2.2's 24px minimum), always visible.
- Inputs and selects use **16px text minimum** so iOS Safari does not zoom on focus.
- Full-width primary actions inside the phone sheet.

## 6. Forms without horizontal scrolling

- One field per row on every width; field widths are 100% of the form.
- Labels are above fields; error and helper text wrap and never push the layout wider.
- The amount field is 24px type; the longest amount (`₱9,999,999,999.99`, 17 characters) is roughly 220px wide (an estimate from typical digit widths, **not measured**), inside the 288px minimum form width.
- The native date input is full width and 48px high (like every text field; buttons and nav are 44px).
- Segmented control labels: "Expense", "Income", "Pay card" — three short words; at 288px each segment is ≈ 91px, enough at 14px.

## 7. Long text and large amounts

| Case | Rule |
|---|---|
| Account name (≤60 chars) | One line with an ellipsis in rows and selects; full name in the edit/Accounts card where it may wrap to two lines. Never breaks the amount off its right edge. |
| Note | One line with ellipsis in Activity; full note only in the edit form. |
| Category | Seeded names are short; any name that does not fit is ellipsised. |
| **Amounts** | **Never truncated.** The text column gives way first. Maximum `₱9,999,999,999.99` (17 characters): row amount (16/600) ≈ 150px, hero (28px) ≈ 250px — rough estimates, **not measured** — which is too tight beside 288px of content, so **the hero steps down to 24px when its text exceeds 13 characters**. Measure in the browser at Milestone 3 and adjust the threshold. |
| Negative amounts | `−₱1,200.00` — the minus is part of the unbreakable string (`white-space: nowrap`). |
| Long month/account in selects | Native control truncates; fine. |
| Non-Latin or very long words in notes | Allowed; ellipsis, never overflow (`min-width: 0` on flex children). |

## 8. Reflow, zoom and text size

- No horizontal page scroll from **320px** (WCAG 1.4.10) through 1440px+; the page, not any inner block, is the only thing that scrolls vertically, apart from the dialog body.
- At **200% browser zoom** (equivalent to a 640/720px viewport at 1280/1440) the layout takes the tablet or phone arrangement — no content is lost, nothing overlaps.
- Text set by the user to a larger default size must still wrap; no fixed-height text containers (loading bars excepted).
- Use `rem`/Tailwind sizing for type; keep pixel values only for borders and the bottom-bar height.
- `viewport` meta: `width=device-width, initial-scale=1`. **Zoom is never disabled.**

## 9. Safe areas and viewport units

- Bottom bar and sheet footer add `padding-bottom: env(safe-area-inset-bottom)`.
- Full-height surfaces use `dvh`, not `vh` (the phone address bar changes the viewport).
- Side safe areas are respected in landscape (`env(safe-area-inset-left/right)` on the page margin).

## 10. Acceptance matrix (Milestone 5 — to run in a real browser)

Test each cell at **320, 360, 375, 768, 1024, 1280, 1440**; "✔" means "verify", not "verified".

| Check | Overview | Activity | Accounts | Quick Add / Pay card | Delete |
|---|---|---|---|---|---|
| No horizontal scroll | ✔ | ✔ | ✔ | ✔ | ✔ |
| All amounts fully visible (also with `₱9,999,999,999.99`) | ✔ | ✔ | ✔ | ✔ | ✔ |
| Touch targets ≥44px (phone) | ✔ | ✔ | ✔ | ✔ | ✔ |
| Keyboard order = visual order; focus ring visible | ✔ | ✔ | ✔ | ✔ | ✔ |
| Right edges align; columns share bottom edges | ✔ | ✔ | n/a (intentionally unstretched) | n/a | n/a |
| Bottom bar never covers content or the sheet footer | ✔ | ✔ | ✔ | ✔ | ✔ |
| 200% zoom reflows | ✔ | ✔ | ✔ | ✔ | ✔ |
| Worst-case data: 60-char account name, 120-char note, 99 entries, zero entries, negative balance, card over limit | ✔ | ✔ | ✔ | ✔ | — |
| iOS Safari: keyboard + sheet + `dvh` + date picker | — | — | — | ✔ (real device) | ✔ |

Layout assertions from the design to confirm in the browser: the two Overview desktop columns end within ≈40px of each other with 5–7 activity rows; the Accounts columns top-align; the first Activity row starts in the top 60% of a 667px-tall phone.
