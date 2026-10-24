# Real-device and screen-reader checklist (for the owner)

Things the automated audit cannot see. Run the app on your computer (`cd frontend && npm run dev`, then open the address it prints) and open the same address on your phone (same Wi-Fi: `npm run dev -- --host`, then use your computer's IP). Mark each line; note the device and browser. Nothing here needs code changes unless something fails.

## 1. Phone, as a user (iPhone Safari, Android Chrome)
- [ ] Open Overview, Activity, Accounts. Nothing scrolls sideways; the bottom bar stays at the bottom and clears the home indicator.
- [ ] **Add** (bottom bar): the sheet opens from the bottom; Amount is focused and the number keypad appears; the **Save** button stays visible above the keyboard; you can scroll the form with the keyboard open.
- [ ] Tap the first field right after the sheet opens: the tap is not lost (a layout shift once did this).
- [ ] Type a wrong amount ("abc"), tap another field: the message appears and nothing jumps away from under your finger.
- [ ] Choose a category chip, a date, save: the message appears at the top; focus/scroll position is sensible.
- [ ] Pay card from Accounts: card preselected, **Pay full** works, the preview reads clearly.
- [ ] Edit by tapping an Activity row; Delete: the confirmation is readable and **Cancel** is the first, safest button.
- [ ] Rotate to landscape with a form open: the Save button is still reachable.
- [ ] Pinch-zoom works on every screen.
- [ ] Add account: all four type buttons are readable at your phone's width (E-wallet especially).

## 2. Phone text-size settings
- [ ] Set the system font size to **largest** (iOS: Settings > Display > Text Size / Accessibility; Android: Display > Font size). Reopen the app: nothing is cut off, rows wrap, buttons are reachable, the forms scroll.
- [ ] Turn on **Reduce Motion**: nothing animates oddly.
- [ ] Turn on **Increase Contrast** / dark mode (the app has no dark mode: confirm it still looks fine).

## 3. Screen readers (10 minutes each)
- [ ] **iPhone VoiceOver** (triple-click the side button): swipe through Overview: it reads "Net position" with its amount; the bottom-bar items say "Overview, current page"; rows read "Expense: Lunch with team, Food · GCash, −₱385.00".
- [ ] Open **Add**: it announces "Add transaction, dialog"; swiping does not reach the page behind; the type switch reads as three options with the chosen one stated.
- [ ] Submit an empty form: the error summary is read out; each message links to its field.
- [ ] Save an entry: the confirmation is announced without moving focus.
- [ ] Delete: the confirmation reads the entry and its effect.
- [ ] **Android TalkBack**: repeat the Add and the Delete flows.
- [ ] **Desktop NVDA (Windows) or VoiceOver (Mac)**: Tab through a screen; landmarks list shows Main navigation, Main (and the sidebar). **Check whether an empty "main" is announced while a dialog is open** (a Radix behaviour noted in the audit).

## 4. Keyboard on a computer
- [ ] Without the mouse: add an expense, pay a card, edit an entry, delete an entry, add an account. Focus is always visible and never trapped outside a dialog.
- [ ] Browser zoom to **400%** on a 1280-wide window: no sideways scrolling, nothing overlapped.

## 5. Other browsers
- [ ] **Firefox** and **Safari (Mac)**: the native date field, select lists and number formatting look acceptable; the type switch (radio buttons) works with arrow keys.

Report anything odd with the device, browser and a screenshot.
