# MoniKey original wallet artwork — 19-file release

## Scope

- There are **18 selectable card products** in `frontend/src/wallet/cardProducts.ts`.
- Each supported product receives its own original, self-contained `/card-art/monikey-<product-id>.svg` visual.
- The existing `/card-art/monikey-default.svg` remains the 19th bundled design for cash, Other, unsupported/unknown card IDs, and image-loading failures.
- These are **original abstract MoniKey concepts**. Their file graphics do not reproduce an issuer card face or contain bank names, issuer logos, payment-network marks, remote images, text nodes, or scripts. Product names are rendered by the application's ordinary text UI and are not representations of official cards.
- Atome remains unsupported. No new account type, BNPL semantics, or Atome artwork is introduced.

## Acceptance

1. The Add/Edit Account card picker previews the corresponding original concept for each supported product.
2. Accounts cards, the Overview deck, and details use the selected concept. Account labels and balances stay readable and unchanged.
3. Cash, Other and unsupported/stale product IDs continue to show the neutral fallback.
4. All 19 SVGs ship locally with the Vite/Nginx build. No external image URLs are introduced.
5. `npm run artwork:validate` checks the exact product-derived file allowlist, verifies that each first-party SVG exists and has no text nodes, embedded images, scripts or links, and continues blocking unverified issuer artwork.
6. Unit tests, lint, build, container build, and browser checks must pass on the exact PR head before merge. No database or GitOps manifests are modified by this change.

## Release boundaries

Frontend-only presentation change: no finance API, monetary calculation, account records, card product IDs, database migrations, backup logic or GitOps release workflow changes. Deploy through the existing immutable-SHA CI/GitOps pipeline after review and green checks; require its backup, migration gate, Argo health and smoke-test evidence. The historical 19 issuer-style WebP files removed in PR #11 are **not** restored.

## Follow-up

Official issuer artwork remains a separate, rights-verified process under ADR-019. This release does not authorize it.
