# Historical card artwork — recovery review (NOT production assets)

**Status: DRAFT / NOT CLEARED FOR DISTRIBUTION / DO NOT MERGE AS AN ARTWORK RELEASE.**

These are the exact 19 AI-generated WebP card faces from `feat/kakeibo-frontend`, copied by **reusing their original Git blob SHAs** without changing pixels or re-encoding. The original manifest records 1600×1009 WebP graphics and light/dark text-contrast recommendations.

The images were removed from the release in [PR #11](https://github.com/Jeysibn/monikey/pull/11) because the card faces mimic bank/payment-network products and their commercial marks or design rights were unverified. **Their presence in the user's own repository does not establish a license to distribute the issuer-like artwork.**

All files in this PR are under `docs/design/card-artwork-review/generated/` **outside** `frontend/public`, `frontend/dist` and production Docker build content. They are for owner review only, and cannot be loaded by wallet views or served by Nginx. The current production-safe abstract MoniKey SVG variants remain unchanged.

## Exact historical art inventory

| Image | Current product support | Recommended face ink | Reuse permission |
|---|---|---|---|
| [bdo-debit-mastercard](generated/bdo-debit-mastercard.webp) | Supported | light | Pending |
| [bpi-debit-mastercard](generated/bpi-debit-mastercard.webp) | Supported | light | Pending |
| [bpi-debit-cirrus-gold](generated/bpi-debit-cirrus-gold.webp) | Supported | dark | Pending |
| [bpi-debit-cirrus-red](generated/bpi-debit-cirrus-red.webp) | Supported | light | Pending |
| [gotyme-visa-debit](generated/gotyme-visa-debit.webp) | Supported | light | Pending |
| [maribank-debit](generated/maribank-debit.webp) | Supported | light | Pending |
| [gcash-visa](generated/gcash-visa.webp) | Supported | light | Pending |
| [gcash-mastercard](generated/gcash-mastercard.webp) | Supported | light | Pending |
| [maya-visa](generated/maya-visa.webp) | Supported | light | Pending |
| [maya-mastercard](generated/maya-mastercard.webp) | Supported | light | Pending |
| [maya-virtual](generated/maya-virtual.webp) | Supported | dark | Pending |
| [atome-credit-black](generated/atome-credit-black.webp) | Excluded (Atome) | light | Pending |
| [bdo-visa-classic](generated/bdo-visa-classic.webp) | Supported | light | Pending |
| [bdo-visa-gold](generated/bdo-visa-gold.webp) | Supported | dark | Pending |
| [bdo-visa-platinum](generated/bdo-visa-platinum.webp) | Supported | dark | Pending |
| [bdo-visa-signature](generated/bdo-visa-signature.webp) | Supported | light | Pending |
| [bpi-platinum-rewards](generated/bpi-platinum-rewards.webp) | Supported | light | Pending |
| [maya-visa-platinum](generated/maya-visa-platinum.webp) | Supported | light | Pending |
| [unionbank-rewards-visa-platinum](generated/unionbank-rewards-visa-platinum.webp) | Supported | light | Pending |

## Automated safety finding — blocks release

The initial exact-head CI [run #42480697707](https://github.com/Jeysibn/monikey/actions/runs/42480697707) passed all 294 frontend unit tests, TypeScript/Vite build and the existing release-artwork validator. The new `artwork:review` verifier **failed** because `maya-visa-platinum.webp` triggers the existing payment-number-like byte-pattern check in `inspectImageHeader`.

This is a **potential unsafe-content signal, not proof that a real payment number exists**. Do not print, disclose, or copy any matched sequence into issues or logs. Manually inspect the image and its metadata in a controlled environment, then either produce a sanitized reviewed derivative or clearly document a validated false positive without weakening the production importer. Keep the historical blob immutable for provenance and mark it ineligible for release until resolved.

The PR remains draft and CI-blocked, with no change to production or runtime artwork. The container-build stage was not reached after the validation failure.

## Planned replacement after approval (follow-up implementation)

1. Review each image for logos, network insignia, bank identity, misleading official appearance, and any payment-number-like markings. Replace or edit designs lacking rights instead of disabling the validator.
2. Record verifiable permission to redistribute the *exact* supplied artwork, or replace it with distinct, non-issuer-mimicking artwork. Approval **must not** be inferred from AI generation or ownership of the repo.
3. For all **18** supported card products, map the reviewed image to the existing product ID and preserve the historical `faceInk` from this manifest. Atome remains excluded until an explicit product-model/BNPL decision.
4. Only after per-image rights review, use the existing `artwork:import` rights-evidence workflow or a separately reviewed equivalent to place approved assets in `frontend/public/card-art/`, generate approved catalog entries and update `walletModel.ts` / `CardProductPicker.tsx` so the approved product artwork takes precedence over the current safe MoniKey SVG.
5. Update tests for Add/Edit, Overview deck, details dialog, old preference IDs, missing-image fallback and amount/credit invariants; run lint, all tests, build, `artwork:validate` and container builds on exact PR head. CI must remain release-safe.
6. Merge and deploy through existing immutable-SHA + verified backup + GitOps + Argo CD health flow, **only after** artwork approval and independent review.

## Non-goals

- No changes to accounts, ledger, Kakeibo, PostgreSQL, migrations, card-product IDs or Argo CD workflows.
- No Atome selection or BNPL behavior.
- No deployment and no bypass of ADR-019 / PR #11's artwork release gate.
- No claims of endorsement or official card designs.

Run `cd frontend && npm run artwork:review` to verify all 19 stored binary blobs against their historical Git SHA-1, expected dimensions, size, product support and isolation from the shipped `public/card-art` directory.

This is a *preparatory review PR*. It is intentionally not the final artwork-switch PR while permissions remain pending.
