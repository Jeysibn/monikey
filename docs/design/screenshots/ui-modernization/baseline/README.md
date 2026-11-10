# UI modernization baseline screenshots

Captured from the actual React app on `origin/main` `3f8a6d0466d34aee0dd65d864f146df5f4232015`, using the built-in fictional mock ledger and no API backend. Phone captures use a 390×844 viewport (plus 320px Overview/Categories); desktop captures use 1440×960. Full-page captures are used on desktop only.

| Screen/state | Mobile | Desktop |
|---|---|---|
| Overview | [390px](overview-mobile.png) · [320px](overview-320.png) | [1440px](overview-desktop.png) |
| Accounts | [390px](accounts-mobile.png) · [empty](accounts-empty-mobile.png) | [1440px](accounts-desktop.png) |
| Activity | [390px](activity-mobile.png) | [1440px](activity-desktop.png) |
| Categories | [390px](categories-mobile.png) · [320px](categories-320.png) | [1440px](categories-desktop.png) |
| Kakeibo | [390px](kakeibo-mobile.png) · [no plan](kakeibo-no-plan-mobile.png) | [1440px](kakeibo-desktop.png) |
| Quick Add | [390px](quick-add-mobile.png) | [1440px](quick-add-desktop.png) |
| Add Account | [390px](account-dialog-mobile.png) | — |
| Category create validation | [390px](category-create-mobile.png) | — |
| Overview states | [loading](overview-loading-mobile.png) · [offline error](overview-error-mobile.png) · [no accounts](overview-empty-accounts-mobile.png) | — |

The original 6-item bottom bar is not full-width overflowing, but its labels visibly clip on narrow screens: “Overview”, “Accounts”, and “Categories” at 320px, and “Categories” at 390px. A browser measurement checked all five current views at 320, 390, 768, 1024, and 1440px; no document-width overflow occurred at those widths.
