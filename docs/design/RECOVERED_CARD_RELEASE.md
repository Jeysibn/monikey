# Recovered real-artwork frontend implementation

**This change does integrate the assets into the production Vite public directory and maps them into wallet display, rather than storing them only in docs.**

- 17 original historical generated WebP faces from `feat/kakeibo-frontend`, each reused by exact Git blob SHA, unchanged bytes.
- 1 newly authored Maya Visa Platinum SVG recreation of the freshly generated Maya artwork style; the old flagged WebP remains **quarantined in docs**, not shipped. The separate high-resolution generated WebP was provided to the user and can replace this in a future commit after importing into Git and validating.
- Atome unsupported; no Atome image shipped. Original MoniKey abstract SVGs retained as safe backups.
- The catalog classifies these as `owner-authorized`, **not issuer-approved**. Third-party marks and trade dress are visible in the user-supplied illustrated concepts. The GitHub repository owner requested their use; this is not proof of trademark licensing or issuer endorsement. Independent release rights review remains required before a public deployment.

## Exact historical assets

| Product | Git blob SHA | Ink |
|---|---|---|
| bdo-debit-mastercard | `7ae05edf14e710d0dac314b2bdf42c78482e1a7e` | light |
| bpi-debit-mastercard | `5b1b14894842de06a6ecb7cd8010ceb28f81fe7a` | light |
| bpi-debit-cirrus-gold | `a75e01155277c589bda18f598dcfba918766bfad` | dark |
| bpi-debit-cirrus-red | `0a30e46ae96c48d89b6b22f2bf6520e071bcc128` | light |
| gotyme-visa-debit | `e2b6f1261c5719b8477f915730309cfecff40fa9` | light |
| maribank-debit | `f5bf74385e5f96911d245aac50569e5bcbd8fcd6` | light |
| gcash-visa | `743e6c99142fa4ce246732f3e392e96ac3d0c9fe` | light |
| gcash-mastercard | `d894bfc84fa6a1f316fa6ea92626ad4efd53f365` | light |
| maya-visa | `5e426497a62760542afdea768dc91e684153c043` | light |
| maya-mastercard | `434b946d7d9b5a46a53945b6d5b887320694be46` | light |
| maya-virtual | `fc5f4478cad2aef87eb002cbb0bedc39d8cbe13b` | dark |
| bdo-visa-classic | `c0986103638dbcf4bab2c53ced20aa3b4070aa57` | light |
| bdo-visa-gold | `53e459c44209245139edb8194cd8f6dc38d12502` | dark |
| bdo-visa-platinum | `ce8c378e9f54995c880efa768b4c5db259e52268` | dark |
| bdo-visa-signature | `486a518d1af33cf5d671e5a04f3ca67e5127e785` | light |
| bpi-platinum-rewards | `2ac5e72bbdefdb379b2f85253bbf96a59b1a4146` | light |
| unionbank-rewards-visa-platinum | `2e4ba4c6272ee50a82f3b09d53f2fe9e7083d062` | light |
| maya-visa-platinum | new independent SVG vector (not the flagged historical WebP) | light |

## Deployment evidence requirements

`npm run artwork:validate` fails if any selected product image is missing from **either** `frontend/public/card-art` or the built `frontend/dist/card-art`, if any historical WebP bytes change, if the strict image header/card-number scan fails, or if a stray unapproved image is present. The standard `frontend/Dockerfile` copies `dist` to Nginx. Tests must prove Add/Edit picker, Accounts and Overview use `recovered-<product-id>` visual paths. CI green does not itself prove live homelab sync. After merge, verify SHA-tagged GHCR frontend publication and GitOps backup, Argo CD Synced/Healthy, and a live asset HTTP request or browser check.

**Financial APIs, balances, Kakeibo, migration gates and GitOps workflow are unchanged.**
