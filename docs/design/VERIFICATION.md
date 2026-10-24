# MoniKey Design Mock — Verification Results

**Result: 274 of 274 automated checks passed, 0 failed.** Run on 2026-10-25 against `docs/design/preview/app.html` (the throwaway design mock — **not** production code).

These are **measured results from a real browser**, produced by `docs/design/preview/verify.cjs` (re-runnable: `node docs/design/preview/verify.cjs`). Each row below is copied from that run's output; nothing is assumed. They show the *design mock* behaves as specified. They do **not** prove the future React app, the backend, a real phone, or assistive-technology behavior — see *Not tested*.

## Environment

| Item | Value |
|---|---|
| Browser | Google Chrome for Testing 156.0.8078.4 (headless, Linux/WSL2, Playwright-cached build) |
| Driver | `playwright-core` 1.64.0-alpha-1790635538000 (already installed with the global Playwright CLI; nothing was installed) |
| Page | `file://…/docs/design/preview/app.html` (self-hosted Manrope from `preview/fonts/`) |
| Viewports | 360, 375, 768, 1280 px wide (layout matrix); flows at 375 (phone) and 1280 (desktop) |
| Console | page/console errors during all runs: none |

## 1. Layout matrix (360 / 375 / 768 / 1280 × Overview / Activity / Accounts)

Each cell is *pass* only if every check in that column passed for that width and screen.

| Width | Screen | No horizontal overflow | Add-transaction button count correct | One primary action | Amounts single-line, inside card | Touch targets ≥44px |
|---|---|---|---|---|---|---|
| 360 | overview | pass | pass | pass | pass | pass |
| 360 | activity | pass | pass | pass | pass | pass |
| 360 | accounts | pass | pass | pass | pass | pass |
| 375 | overview | pass | pass | pass | pass | pass |
| 375 | activity | pass | pass | pass | pass | pass |
| 375 | accounts | pass | pass | pass | pass | pass |
| 768 | overview | pass | pass | pass | pass | pass |
| 768 | activity | pass | pass | pass | pass | pass |
| 768 | accounts | pass | pass | pass | pass | pass |
| 1280 | overview | pass | pass | pass | pass | pass |
| 1280 | activity | pass | pass | pass | pass | pass |
| 1280 | accounts | pass | pass | pass | pass | pass |

*Touch-target column:* measured only below 768px for buttons, selects and text inputs outside dialogs; at 768 and 1280 it passes trivially because desktop icon-only row actions are 36px by design (above WCAG 2.2's 24px minimum). Targets inside dialogs were not measured.

Labels shortened with an ellipsis (names/notes only, never amounts): 360px activity: 4; 375px activity: 2.

## 2. Font (Manrope self-hosted)

| Check | Result | Measured |
|---|---|---|
| Manrope faces loaded (latin + latin-ext) | pass | Manrope:loaded, Manrope:loaded |
| ₱ glyph is drawn by Manrope (hero amount) | pass | Manrope ExtraLight(10) |
| U+2212 minus and ₱ in a row amount drawn by Manrope | pass | Manrope ExtraLight(8) |
| tabular-nums makes 1111 / 0000 / 8888 equal width (weight 600) | pass | tabular 79.38,79.38,79.38 vs proportional 54.03,82.19,77 |
| tabular-nums equal width at weight 400 | pass | tabular 79.38,79.38,79.38 vs proportional 49.92,78.09,74.31 |
| (info) default digits already tabular? | pass | no — proportional by default (54.03,82.19,77); tabular-nums fixes it |

## 3. Flows — requested scenarios

### Expense entry using a credit card

| Width | Check | Result | Measured |
|---|---|---|---|
| 375px | start: net position | pass | got "₱33,146.25" |
| 375px | start: monthly expenses | pass | got "₱27,127.40" |
| 375px | amount field focused on open | pass | got "f-amt" |
| 375px | helper says it adds to card debt | pass |  |
| 375px | before/after estimate: Blue Card owed ₱14,250.00 → ₱16,750.00 | pass | After saving (estimate) \| Blue Card owed: ₱14,250.00 → ₱16,750.00 |
| 375px | double-count hint visible on Expense | pass |  |
| 375px | confirmation states the card's new owed figure | pass | Expense saved: −₱2,500.00 from Blue Card. Blue Card now owes ₱16,750.00. |
| 375px | monthly expenses +₱2,500.00 | pass | got "₱29,627.40" |
| 375px | net position −₱2,500.00 | pass | got "₱30,646.25" |
| 375px | card debt total | pass | got "₱23,550.00" |
| 375px | Blue Card shows ₱16,750.00 owed | pass | Blue Card \| ₱16,750.00 \| owed \| false |
| 375px | last-used account remembered for next entry | pass | got "Blue Card" |
| 375px | category NOT pre-selected | pass | got 0 |
| 1280px | start: net position | pass | got "₱33,146.25" |
| 1280px | start: monthly expenses | pass | got "₱27,127.40" |
| 1280px | amount field focused on open | pass | got "f-amt" |
| 1280px | helper says it adds to card debt | pass |  |
| 1280px | before/after estimate: Blue Card owed ₱14,250.00 → ₱16,750.00 | pass | After saving (estimate) \| Blue Card owed: ₱14,250.00 → ₱16,750.00 |
| 1280px | double-count hint visible on Expense | pass |  |
| 1280px | confirmation states the card's new owed figure | pass | Expense saved: −₱2,500.00 from Blue Card. Blue Card now owes ₱16,750.00. |
| 1280px | monthly expenses +₱2,500.00 | pass | got "₱29,627.40" |
| 1280px | net position −₱2,500.00 | pass | got "₱30,646.25" |
| 1280px | card debt total | pass | got "₱23,550.00" |
| 1280px | Blue Card shows ₱16,750.00 owed | pass | Blue Card \| ₱16,750.00 \| owed \| false |
| 1280px | last-used account remembered for next entry | pass | got "Blue Card" |
| 1280px | category NOT pre-selected | pass | got 0 |

### Card payment, Pay full, before/after estimates, net position and monthly expenses

| Width | Check | Result | Measured |
|---|---|---|---|
| 375px | opens on Pay card with the card preselected | pass | got "Blue Card" |
| 375px | Pay full button label shows owed amount | pass | got "Pay full ₱14,250.00" |
| 375px | empty submit moves focus to the error summary | pass | got "qaSummary" |
| 375px | error summary lists amount + source | pass | Fix 2 things to save \| Enter an amount. \| Choose the account you're paying from. |
| 375px | amount marked aria-invalid | pass |  |
| 375px | Pay full fills the server's owed figure | pass | got "14250.00" |
| 375px | estimate: Main Savings ₱48,725.50 → ₱34,475.50 | pass | After paying (estimate) \| Main Savings: ₱48,725.50 → ₱34,475.50 \| Blue Card owed: ₱14,250.00 → ₱0.00 \| Expenses: no change |
| 375px | estimate: Blue Card owed ₱14,250.00 → ₱0.00 | pass | After paying (estimate) \| Main Savings: ₱48,725.50 → ₱34,475.50 \| Blue Card owed: ₱14,250.00 → ₱0.00 \| Expenses: no change |
| 375px | estimate says Expenses: no change | pass |  |
| 375px | no category field on Pay card | pass |  |
| 375px | source list contains no credit card | pass |  |
| 375px | confirmation: new owed figure + payments aren't expenses | pass | Card payment saved: ₱14,250.00 from Main Savings to Blue Card. Blue Card now owes ₱0.00. Card payments don't count as expenses and don't change your net position. |
| 375px | NET POSITION unchanged after payment | pass | got "₱33,146.25" |
| 375px | MONTHLY EXPENSES unchanged after payment | pass | got "₱27,127.40" |
| 375px | money you have fell by the payment | pass | got "₱39,946.25" |
| 375px | card debt fell by the payment | pass | got "₱6,800.00" |
| 375px | estimate matched saved result (Main Savings) | pass | Main Savings \| ₱34,475.50 \| Bank account |
| 375px | Pay card disabled when nothing is owed | pass | Blue Card \| ₱0.00 \| nothing owed \| true |
| 375px | payment row shows no sign and is not styled as expense | pass | Card payment: \| Card payment \| ₱14,250.00 \| Main Savings → Blue Card |
| 1280px | opens on Pay card with the card preselected | pass | got "Blue Card" |
| 1280px | Pay full button label shows owed amount | pass | got "Pay full ₱14,250.00" |
| 1280px | empty submit moves focus to the error summary | pass | got "qaSummary" |
| 1280px | error summary lists amount + source | pass | Fix 2 things to save \| Enter an amount. \| Choose the account you're paying from. |
| 1280px | amount marked aria-invalid | pass |  |
| 1280px | Pay full fills the server's owed figure | pass | got "14250.00" |
| 1280px | estimate: Main Savings ₱48,725.50 → ₱34,475.50 | pass | After paying (estimate) \| Main Savings: ₱48,725.50 → ₱34,475.50 \| Blue Card owed: ₱14,250.00 → ₱0.00 \| Expenses: no change |
| 1280px | estimate: Blue Card owed ₱14,250.00 → ₱0.00 | pass | After paying (estimate) \| Main Savings: ₱48,725.50 → ₱34,475.50 \| Blue Card owed: ₱14,250.00 → ₱0.00 \| Expenses: no change |
| 1280px | estimate says Expenses: no change | pass |  |
| 1280px | no category field on Pay card | pass |  |
| 1280px | source list contains no credit card | pass |  |
| 1280px | confirmation: new owed figure + payments aren't expenses | pass | Card payment saved: ₱14,250.00 from Main Savings to Blue Card. Blue Card now owes ₱0.00. Card payments don't count as expenses and don't change your net position. |
| 1280px | NET POSITION unchanged after payment | pass | got "₱33,146.25" |
| 1280px | MONTHLY EXPENSES unchanged after payment | pass | got "₱27,127.40" |
| 1280px | money you have fell by the payment | pass | got "₱39,946.25" |
| 1280px | card debt fell by the payment | pass | got "₱6,800.00" |
| 1280px | estimate matched saved result (Main Savings) | pass | Main Savings \| ₱34,475.50 \| Bank account |
| 1280px | Pay card disabled when nothing is owed | pass | Blue Card \| ₱0.00 \| nothing owed \| true |
| 1280px | payment row shows no sign and is not styled as expense | pass | Card payment: \| Card payment \| ₱14,250.00 \| Main Savings → Blue Card \| Payment |

### Partial payment keeps expenses and net unchanged

| Width | Check | Result | Measured |
|---|---|---|---|
| 375px | estimate: Blue Card owed ₱14,250.00 → ₱9,250.00 | pass | After paying (estimate) \| Main Savings: ₱48,725.50 → ₱43,725.50 \| Blue Card owed: ₱14,250.00 → ₱9,250.00 \| Expenses: no change |
| 375px | net position unchanged | pass | got "₱33,146.25" |
| 375px | expenses unchanged | pass | got "₱27,127.40" |
| 375px | income unchanged | pass | got "+₱36,500.00" |
| 1280px | estimate: Blue Card owed ₱14,250.00 → ₱9,250.00 | pass | After paying (estimate) \| Main Savings: ₱48,725.50 → ₱43,725.50 \| Blue Card owed: ₱14,250.00 → ₱9,250.00 \| Expenses: no change |
| 1280px | net position unchanged | pass | got "₱33,146.25" |
| 1280px | expenses unchanged | pass | got "₱27,127.40" |
| 1280px | income unchanged | pass | got "+₱36,500.00" |

### Editing and deleting transactions (incl. deleting a payment)

| Width | Check | Result | Measured |
|---|---|---|---|
| 375px | edit sheet is titled for the entry kind | pass | got "Edit expense" |
| 375px | type switch hidden while editing; double-count hint hidden | pass |  |
| 375px | amount prefilled | pass | got "385.00" |
| 375px | expenses +₱100.00 after edit | pass | got "₱27,227.40" |
| 375px | GCash −₱100.00 after edit | pass | got "₱3,020.75" |
| 375px | confirmation names the entry and its effect | pass | Lunch with team \| −₱485.00 · Oct 24, 2026 · GCash \|  \| GCash goes up by ₱485.00 and this month's expenses drop by ₱485.00. This can't be undone. |
| 375px | Cancel is focused first in the confirmation | pass | got "cfCancel" |
| 375px | Cancel returns to the edit form on mobile | pass |  |
| 375px | entry still there after Cancel | pass | got "18 entries · October 2026" |
| 375px | status message after delete | pass | got "Expense deleted." |
| 375px | entry count after delete | pass | got "17 entries · October 2026" |
| 375px | expenses after delete (₱27,127.40 − ₱385.00) | pass | got "₱26,742.40" |
| 375px | payment delete copy: both balances move, expenses don't | pass | Card payment \| ₱5,000.00 · Oct 20, 2026 · Main Savings → Blue Card \|  \| Main Savings goes up by ₱5,000.00 and Blue Card owed goes up by ₱5,000.00. Your expenses don't change. This can't be undone. |
| 375px | net unchanged after deleting a payment | pass | got "₱33,531.25" |
| 375px | expenses unchanged after deleting a payment | pass | got "₱26,742.40" |
| 1280px | edit sheet is titled for the entry kind | pass | got "Edit expense" |
| 1280px | type switch hidden while editing; double-count hint hidden | pass |  |
| 1280px | amount prefilled | pass | got "385.00" |
| 1280px | expenses +₱100.00 after edit | pass | got "₱27,227.40" |
| 1280px | GCash −₱100.00 after edit | pass | got "₱3,020.75" |
| 1280px | confirmation names the entry and its effect | pass | Lunch with team \| −₱485.00 · Oct 24, 2026 · GCash \|  \| GCash goes up by ₱485.00 and this month's expenses drop by ₱485.00. This can't be undone. |
| 1280px | Cancel is focused first in the confirmation | pass | got "cfCancel" |
| 1280px | entry still there after Cancel | pass | got "18 entries · October 2026" |
| 1280px | status message after delete | pass | got "Expense deleted." |
| 1280px | entry count after delete | pass | got "17 entries · October 2026" |
| 1280px | expenses after delete (₱27,127.40 − ₱385.00) | pass | got "₱26,742.40" |
| 1280px | payment delete copy: both balances move, expenses don't | pass | Card payment \| ₱5,000.00 · Oct 20, 2026 · Main Savings → Blue Card \|  \| Main Savings goes up by ₱5,000.00 and Blue Card owed goes up by ₱5,000.00. Your expenses don't change. This can't be undone. |
| 1280px | net unchanged after deleting a payment | pass | got "₱33,531.25" |
| 1280px | expenses unchanged after deleting a payment | pass | got "₱26,742.40" |

### Negative account balance warnings; overpaid credit cards

| Width | Check | Result | Measured |
|---|---|---|---|
| 375px | below-zero warning appears (non-blocking) | pass | GCash has ₱3,120.75, less than this payment. Its balance will go below zero. |
| 375px | GCash shown as negative with a 'Below zero' flag | pass | GCash \| −₱879.25 \| E-wallet · Below zero |
| 375px | hero says an account is below zero | pass | An account is below zero. |
| 375px | net unchanged | pass | got "₱33,146.25" |
| 375px | overpay warning appears (non-blocking) | pass | That's more than the ₱6,800.00 currently owed. The extra becomes credit on the card. |
| 375px | estimate shows credit, not a negative debt | pass | After paying (estimate) \| Main Savings: ₱48,725.50 → ₱28,725.50 \| Everyday Card owed: ₱6,800.00 → credit ₱13,200.00 \| Expenses: no change |
| 375px | confirmation says the card has credit | pass | Card payment saved: ₱20,000.00 from Main Savings to Everyday Card. Everyday Card now has ₱13,200.00 credit. Card payments don't count as expenses and don't change your net position. |
| 375px | card shows 'card credit ₱13,200.00' and Pay card is disabled | pass | Everyday Card \| ₱13,200.00 \| card credit \| true |
| 375px | hero shows the card-credit line | pass | Plus ₱13,200.00 card credit (overpaid), included in your net position. |
| 375px | equation label includes card credit | pass | Money you have minus card debt plus card credit equals net position |
| 375px | net unchanged after overpayment | pass | got "₱33,146.25" |
| 1280px | below-zero warning appears (non-blocking) | pass | GCash has ₱3,120.75, less than this payment. Its balance will go below zero. |
| 1280px | GCash shown as negative with a 'Below zero' flag | pass | GCash \| −₱879.25 \| E-wallet · Below zero |
| 1280px | hero says an account is below zero | pass | An account is below zero. |
| 1280px | net unchanged | pass | got "₱33,146.25" |
| 1280px | overpay warning appears (non-blocking) | pass | That's more than the ₱6,800.00 currently owed. The extra becomes credit on the card. |
| 1280px | estimate shows credit, not a negative debt | pass | After paying (estimate) \| Main Savings: ₱48,725.50 → ₱28,725.50 \| Everyday Card owed: ₱6,800.00 → credit ₱13,200.00 \| Expenses: no change |
| 1280px | confirmation says the card has credit | pass | Card payment saved: ₱20,000.00 from Main Savings to Everyday Card. Everyday Card now has ₱13,200.00 credit. Card payments don't count as expenses and don't change your net position. |
| 1280px | card shows 'card credit ₱13,200.00' and Pay card is disabled | pass | Everyday Card \| ₱13,200.00 \| card credit \| true |
| 1280px | hero shows the card-credit line | pass | Plus ₱13,200.00 card credit (overpaid), included in your net position. |
| 1280px | equation label includes card credit | pass | Money you have minus card debt plus card credit equals net position |
| 1280px | net unchanged after overpayment | pass | got "₱33,146.25" |

### Zero opening balances and add-account validation

| Width | Check | Result | Measured |
|---|---|---|---|
| 375px | cash account with opening balance "0" is accepted as ₱0.00 | pass | Zero 1 \| ₱0.00 \| Cash |
| 375px | cash account with opening balance "00" is accepted as ₱0.00 | pass | Zero 2 \| ₱0.00 \| Cash |
| 375px | cash account with opening balance "0.00" is accepted as ₱0.00 | pass | Zero 3 \| ₱0.00 \| Cash |
| 375px | cash account with opening balance "0.0" is accepted as ₱0.00 | pass | Zero 4 \| ₱0.00 \| Cash |
| 375px | cash account with opening balance "0." is accepted as ₱0.00 | pass | Zero 5 \| ₱0.00 \| Cash |
| 375px | cash account with opening balance "000.00" is accepted as ₱0.00 | pass | Zero 6 \| ₱0.00 \| Cash |
| 375px | cash account with opening balance "0,000.00" is accepted as ₱0.00 | pass | Zero 7 \| ₱0.00 \| Cash |
| 375px | card with limit "10000" and owed "0" is accepted | pass | Card 8 \| ₱0.00 \| nothing owed \| true |
| 375px | card with limit "10000" and owed "00" is accepted | pass | Card 9 \| ₱0.00 \| nothing owed \| true |
| 375px | card with limit "10,000.00" and owed "0.00" is accepted | pass | Card 10 \| ₱0.00 \| nothing owed \| true |
| 375px | empty opening balance is rejected with a clear message | pass | Fix 1 thing to save \| Account type \| Cash \| Bank \| E-wallet \| Card \| Name \| Current balance (₱) \| What's in it right now. \| Enter an amount, or 0.00. |
| 375px | negative opening balance rejected | pass | Fix 1 thing to save \| Account type \| Cash \| Bank \| E-wallet \| Card \| Name \| Current balance (₱) \| What's in it right now. \| Use numbers only, like 350 or 350.50 |
| 375px | letters rejected (no NaN) | pass | Fix 1 thing to save \| Account type \| Cash \| Bank \| E-wallet \| Card \| Name \| Current balance (₱) \| What's in it right now. \| Use numbers only, like 350 or 350.50 |
| 375px | 3 decimals rejected | pass | Fix 1 thing to save \| Account type \| Cash \| Bank \| E-wallet \| Card \| Name \| Current balance (₱) \| What's in it right now. \| Use at most 2 decimal places. |
| 375px | credit limit of 0 rejected | pass | Fix 1 thing to save \| Account type \| Cash \| Bank \| E-wallet \| Card \| Name \| Credit limit (₱) \| The most the bank lets you charge. \| Credit limit must be more th |
| 375px | empty 'owe today' rejected | pass | Fix 1 thing to save \| Account type \| Cash \| Bank \| E-wallet \| Card \| Name \| Credit limit (₱) \| The most the bank lets you charge. \| Amount you owe today (₱) \| W |
| 1280px | cash account with opening balance "0" is accepted as ₱0.00 | pass | Zero 1 \| ₱0.00 \| Cash |
| 1280px | cash account with opening balance "00" is accepted as ₱0.00 | pass | Zero 2 \| ₱0.00 \| Cash |
| 1280px | cash account with opening balance "0.00" is accepted as ₱0.00 | pass | Zero 3 \| ₱0.00 \| Cash |
| 1280px | cash account with opening balance "0.0" is accepted as ₱0.00 | pass | Zero 4 \| ₱0.00 \| Cash |
| 1280px | cash account with opening balance "0." is accepted as ₱0.00 | pass | Zero 5 \| ₱0.00 \| Cash |
| 1280px | cash account with opening balance "000.00" is accepted as ₱0.00 | pass | Zero 6 \| ₱0.00 \| Cash |
| 1280px | cash account with opening balance "0,000.00" is accepted as ₱0.00 | pass | Zero 7 \| ₱0.00 \| Cash |
| 1280px | card with limit "10000" and owed "0" is accepted | pass | Card 8 \| ₱0.00 \| nothing owed \| true |
| 1280px | card with limit "10000" and owed "00" is accepted | pass | Card 9 \| ₱0.00 \| nothing owed \| true |
| 1280px | card with limit "10,000.00" and owed "0.00" is accepted | pass | Card 10 \| ₱0.00 \| nothing owed \| true |
| 1280px | empty opening balance is rejected with a clear message | pass | Fix 1 thing to save \| Account type \| Cash \| Bank \| E-wallet \| Card \| Name \| Current balance (₱) \| What's in it right now. \| Enter an amount, or 0.00. |
| 1280px | negative opening balance rejected | pass | Fix 1 thing to save \| Account type \| Cash \| Bank \| E-wallet \| Card \| Name \| Current balance (₱) \| What's in it right now. \| Use numbers only, like 350 or 350.50 |
| 1280px | letters rejected (no NaN) | pass | Fix 1 thing to save \| Account type \| Cash \| Bank \| E-wallet \| Card \| Name \| Current balance (₱) \| What's in it right now. \| Use numbers only, like 350 or 350.50 |
| 1280px | 3 decimals rejected | pass | Fix 1 thing to save \| Account type \| Cash \| Bank \| E-wallet \| Card \| Name \| Current balance (₱) \| What's in it right now. \| Use at most 2 decimal places. |
| 1280px | credit limit of 0 rejected | pass | Fix 1 thing to save \| Account type \| Cash \| Bank \| E-wallet \| Card \| Name \| Credit limit (₱) \| The most the bank lets you charge. \| Credit limit must be more th |
| 1280px | empty 'owe today' rejected | pass | Fix 1 thing to save \| Account type \| Cash \| Bank \| E-wallet \| Card \| Name \| Credit limit (₱) \| The most the bank lets you charge. \| Amount you owe today (₱) \| W |

### Keyboard accessibility and form validation

| Width | Check | Result | Measured |
|---|---|---|---|
| 375px | Enter on the Add control opens the dialog with Amount focused | pass | got "f-amt" |
| 375px | (info) Tab order after Amount | pass | f-acct → cat:Food → f-date → f-date → f-date → f-date → f-note → qaCancel → qaSave |
| 375px | focus stays inside the dialog while tabbing | pass | f-acct → cat:Food → f-date → f-date → f-date → f-date → f-note → qaCancel → qaSave |
| 375px | ArrowRight on the type switch selects Income | pass | got "income" |
| 375px | Income hides the double-count hint and lists no credit cards | pass |  |
| 375px | inline error on blur for 3 decimals | pass | Use at most 2 decimal places. |
| 375px | Enter submits; invalid form → error summary focused | pass | got "qaSummary" |
| 375px | summary names the missing account and category | pass | Fix 2 things to save \| Choose an account. \| Choose a category. |
| 375px | fields carry aria-invalid | pass |  |
| 375px | summary link moves focus to the field | pass | got "f-acct" |
| 375px | Escape closes the dialog | pass |  |
| 375px | focus returns to the control that opened it | pass | opener=bottomAdd |
| 1280px | Enter on the Add control opens the dialog with Amount focused | pass | got "f-amt" |
| 1280px | (info) Tab order after Amount | pass | f-acct → cat:Food → f-date → f-date → f-date → f-date → f-note → qaCancel → qaSave |
| 1280px | focus stays inside the dialog while tabbing | pass | f-acct → cat:Food → f-date → f-date → f-date → f-date → f-note → qaCancel → qaSave |
| 1280px | ArrowRight on the type switch selects Income | pass | got "income" |
| 1280px | Income hides the double-count hint and lists no credit cards | pass |  |
| 1280px | inline error on blur for 3 decimals | pass | Use at most 2 decimal places. |
| 1280px | Enter submits; invalid form → error summary focused | pass | got "qaSummary" |
| 1280px | summary names the missing account and category | pass | Fix 2 things to save \| Choose an account. \| Choose a category. |
| 1280px | fields carry aria-invalid | pass |  |
| 1280px | summary link moves focus to the field | pass | got "f-acct" |
| 1280px | Escape closes the dialog | pass |  |
| 1280px | focus returns to the control that opened it | pass | opener=btn primary btn-add-desktop |

### Double-count guard

| Width | Check | Result | Measured |
|---|---|---|---|
| 375px | 'Use Pay card' switches the type | pass | got "payment" |
| 375px | amount is kept when switching | pass | got "5000" |
| 1280px | 'Use Pay card' switches the type | pass | got "payment" |
| 1280px | amount is kept when switching | pass | got "5000" |
| 1280px | (info) page/console errors during all runs | pass | none |

## 4. Requirement → evidence

| Requirement | Evidence |
|---|---|
| Duplicate Add transaction buttons hidden below 768px | Layout matrix: 'Add-transaction button count correct' for 360 and 375 on all three screens |
| Add-account zero values never produce NaN | §3 'Zero opening balances' — `0`, `00`, `0.00`, `0.0`, `0.`, `000.00`, `0,000.00` accepted as ₱0.00; empty, negative, letters, 3 decimals and limit 0 rejected; page never contains `NaN` |
| Monthly summary amounts do not wrap at 360/375 | Layout matrix: 'Amounts single-line, inside card' |
| Manrope supports ₱ and tabular figures | §2 Font |
| Net position unchanged and expenses not increased by card payments | §3 payment flows (Pay full, partial, overpay, deleting a payment) |

## 5. Not tested / known limitations

- **Real devices:** iOS Safari and Android browsers (virtual keyboard, `dvh`, native date picker, sheet scroll-lock). Only headless Chromium on desktop-sized emulated viewports was used; touch behavior was not emulated beyond viewport size.
- **Other browsers:** Firefox and WebKit were not run.
- **Assistive technology:** no screen reader (NVDA, VoiceOver, TalkBack) was run. What *was* checked is structural: focus order and focus trapping, Esc, focus return, error-summary focus, `aria-invalid`, arrow keys on the type switch, accessible names on row buttons. Contrast is computed from tokens (see `DESIGN.md`), not measured from pixels.
- **Colour-vision simulation** of debt (orange) vs. warning (yellow) has not been done.
- **First-run state** (no accounts) is specified but **not implemented** in the mock, so it is untested.
- **Fonts:** only the Chromium/Linux build was measured; Windows/macOS text rendering of Manrope was not.
- **Scope of the logic:** the mock recomputes balances in the browser to demonstrate behavior. It is **not** the backend; real totals must come from the server, and the production app needs its own tests (Milestone 5 and the API milestones).
- **Visual quality** was judged from screenshots by the design owner (Claude Code) and an independent reviewer; automated checks cannot judge taste.
