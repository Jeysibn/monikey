# MoniKey — Authentic Wallet Card UI
## Implementation Specification & Delivery Record

**Document status:** PRs 1–4 implemented and committed; visual/device acceptance and issuer-artwork approval remain open<br>
**Version:** 1.1<br>
**Date:** 2026-11-02<br>
**Target repository:** https://github.com/Jeysibn/monikey<br>
**Canonical repository path:** `docs/design/AUTHENTIC_WALLET_UI_SPEC.md`<br>
**Feature:** Authentic issuer card artwork, wallet grid, dashboard wallet stack, and card-design selection<br>
**Scope:** Visual/presentation enhancement; preserve MoniKey v1 accounting behavior

> **Core decision:** A wallet must display the *actual, verified design of a specific issued bank, debit, credit, prepaid, or e-wallet card* when an approved artwork asset exists. AI-generated concept artwork is also allowed as a selectable local option, labeled as a generated design study that is not official issuer artwork (ADR-019). Do **not** imitate bank card designs with arbitrary CSS gradients. The artwork itself is a static image; MoniKey balances and interactions are separately rendered UI. If asset rights or authenticity are unresolved, use a neutral MoniKey fallback.

---

## 1. Goal, context, and decisions

### 1.1 What the reference screenshots mean

The two screenshots show (A) a compact, overlapping card deck on the dashboard and (B) a full wallet grid. Each card has a product-specific appearance (issuer branding, artwork, chip, and sometimes network mark). The desired outcome is not merely “bank-colored cards”: the owner can select the **specific card product / variant** resembling the actual card they own. These screenshots are visual references **only**; they are not evidence that a pictured variant is current, official, or authorized for reuse.

### 1.2 User stories

- **US-01:** As the owner, I can see all my existing MoniKey accounts in a responsive wallet gallery.
- **US-02:** As the owner, I can choose a specific card design, if one is listed in the verified/approved artwork catalog, without modifying the financial account type or balance.
- **US-03:** As the owner, I can use a simple fallback card when my issuer, product, or artwork is unavailable.
- **US-04:** As the owner, I can select a card and access the account's *existing* supported actions.
- **US-05:** As the owner, I can switch between a visual grid and the existing readable account list.
- **US-06:** As the owner, I can see a compact wallet stack on Overview that navigates to or selects an account.
- **US-07 (later):** I can reorder or pin accounts, with equivalent keyboard controls; preferences persist if explicitly implemented.

### 1.3 Explicitly out of scope

No bank API synchronization, scraping banking apps, NFC payments, card issuance, account credential collection, actual card number/PAN entry, expiry dates, CVV/CVC, PIN, OTP, automatic budget features, investment features, extra finance pages, or major design-system rewrite. No independent accounting record is created for a *card design*. Do not turn the existing `credit_card` financial model into an Atome/BNPL model without a separate domain decision.

### 1.4 Non-negotiable constraints

1. Existing ledger semantics, backend monetary computations, transaction routes, transfer flow, card-payment flow, and source adapters remain authoritative.
2. Never treat **available credit** as cash/net assets. Credit cards show `Owed`, `Available credit`, and `Credit limit` using existing backend values.
3. Artwork choice is *presentation metadata only*. An e-wallet account can choose its provider's physical-card art while still being an `ewallet` in the ledger.
4. **Exact artwork** must come from verifiable official issuer/product pages or authorized asset packs; a bank's homepage is not proof of a particular design.
5. A marketing photo is not automatically a redistributable application asset. Track licensing/permission status for each local asset; do not ship `permission_pending` artwork in a public release.
6. The deployed v1 has no login: keep writable MoniKey private. This feature must not introduce public access.
7. Use fictional money figures in screenshots and automated test fixtures; never commit actual balances or private card photos.

---

## 2. Current MoniKey baseline — verified on `feat/account-ui-remake` on 2026-11-02

| Area | Existing implementation | Impact on wallet feature |
| --- | --- | --- |
| Frontend | React 19, TypeScript 6, Vite 8, Tailwind CSS v4, Lucide React, small Radix/shadcn set | Reuse; no new package for first milestones |
| Screens | `src/views/OverviewView.tsx`, `src/views/AccountsView.tsx`, `src/views/ActivityView.tsx` | Add wallet views to Overview/Accounts; leave Activity alone |
| Components | `AccountRow.tsx`, `CreditCardSummary.tsx`, `MoneyText.tsx`, `AccountForm.tsx` | Preserve and compose rather than reimplement |
| State/data | `DataSource` in `dataSource.ts`; mock and HTTP implementations; `AccountsSnapshot` | Introduce a read-only visual mapping layer; do not recompute money |
| HTTP | Same-origin `/api/accounts`, `/api/summary`, `PUT /api/accounts/{id}` and existing entries | Visual-only release needs no new API |
| DB | PostgreSQL accounts/transactions/payments/transfers | Visual-only release needs no migration |
| Current visual rules | `DESIGN.md`: calm light theme, flat cards, no gradients/entrance motion | ADR-019 approves static, local wallet artwork as a visual-only exception, gated by provenance and rights |
| Security | Private network; no authentication on writable v1 | Remain private, no external image hotlinks |

**Actual account shapes:** `AccountInfo { id, name, type }`; account types are `cash | bank | ewallet | credit_card`. Liquid accounts expose balances in `AccountsSnapshot.liquid`; credit accounts expose `signedDebt`, `owed`, `credit`, `creditLimit`, `availableCredit` in `AccountsSnapshot.cards`. The Edit Account form now includes the visual appearance picker; Add Account does not, because account creation does not return a reliable created ID. Current financial amounts in the frontend snapshot are centavos; HTTP mapping validates decimal-string payloads. Preserve this boundary.

**Existing implementation links:**
- https://github.com/Jeysibn/monikey/blob/main/frontend/src/types.ts
- https://github.com/Jeysibn/monikey/blob/main/frontend/src/views/AccountsView.tsx
- https://github.com/Jeysibn/monikey/blob/main/frontend/src/views/OverviewView.tsx
- https://github.com/Jeysibn/monikey/blob/main/frontend/src/dataSource.ts
- https://github.com/Jeysibn/monikey/blob/main/frontend/src/components/AccountForm.tsx
- https://github.com/Jeysibn/monikey/blob/main/DESIGN.md

---

## 3. Authentic artwork catalog: requirements and governance

### 3.1 What counts as a valid artwork entry?

Each catalog entry represents **one exact issuer product and variant**, not an issuer alone. Example labels: “BDO Visa Classic”, “BPI Platinum Rewards Mastercard”, “Atome Card — Pink”, “Maya Physical Card — [verified variant]”. Different network, tier, physical/virtual, and edition variants may have different visuals and must not be guessed from the provider name.

For each proposed entry, capture: issuer, product, variant, category, supported MoniKey account types, official source page URL, asset provenance, local asset filename, asset dimensions, artwork rights status, verification date, optional attribution/terms link, and whether it is selectable.

**Artwork approval states:** `candidate` (found), `verified` (official product identity confirmed), `approved` (rights for intended use documented), `rejected` (not usable or not authentic), `retired` (remove from new selection, preserve safe fallback for previously selected accounts). `verified` is **not** equivalent to permission to redistribute.

### 3.2 Source verification starting points

| Issuer/provider | Official starting point | Why included / caution |
| --- | --- | --- |
| BPI | https://www.bpi.com.ph/personal/cards | Different debit/credit/prepaid products; verify exact variant |
| BDO | https://www.bdo.com.ph/personal/cards/credit-cards | Multiple Mastercard, Visa, JCB and other products; exact product needed |
| Maya | https://www.maya.ph/pay-maya-card | Physical and virtual card variants; do not infer the account type |
| GCash | https://help.gcash.com/hc/en-us/articles/30286702730265-How-to-order-GCash-Card | GCash Card is a linked prepaid Visa card; card art must be sourced separately |
| Atome | https://www.atome.ph/atome-card | Provider offers multiple design styles; BNPL semantics differ from MoniKey credit-card model |

These are **verification starting points**, not a pre-approved image asset pack. Expand to UnionBank, MariBank, CIMB, Landbank, RCBC, Wise, etc. only as exact product and legal-use evidence is gathered. Avoid scraping and hotlinking card images directly from issuer CDNs.

### 3.3 Artwork preparation checklist

- Choose a clean, front-facing **official product artwork** without a visible real name, PAN, expiry, CVV, QR authentication data, or person-specific card details.
- Confirm exact named product/variant visually against the official issuer page; save page URL and access date in the catalog record.
- Record license/permission evidence **before** copying an issuer image into a distributable build. If not permitted or unclear, show a neutral placeholder and link to the official product page in development documentation only.
- Store only approved packaged images under `frontend/public/card-art/` (e.g., `.webp` / `.png` / licensed `.svg`); no runtime remote image requests.
- Avoid editing, removing, reflowing, or misplacing printed logos and network marks on real card artwork; do not add fake chip/network/PAN overlays when those already appear in the image.
- Keep an unaltered source or verifiable checksum in an internal asset manifest if licensing permits; optimize a copy for display, retaining legibility and intended aspect ratio.
- Include `alt` or programmatic name based on issuer/product; the same meaning should be present in text if the image is decorative.
- Remove an asset quickly if terms change or the owner withdraws approval.

### 3.4 Catalog data contract (proposal)

```ts
export type ArtworkStatus =
  | 'candidate' | 'verified' | 'approved' | 'rejected' | 'retired'

export interface WalletArtwork {
  id: string                      // e.g. 'bdo-visa-classic-2026'
  issuer: string                  // 'BDO'
  product: string                 // 'Visa Classic'
  variant: string                 // documented edition/design, if any
  accountTypes: Array<'cash' | 'bank' | 'ewallet' | 'credit_card'>
  kind: 'physical' | 'virtual' | 'brand' | 'fallback'
  sourcePageUrl: string           // official product page, no image hotlink
  localAssetPath: string | null   // only populated for approved assets
  status: ArtworkStatus
  verifiedOn: string | null       // YYYY-MM-DD
  permissionEvidence: string | null // documentation ref, NOT secrets
}
```

**Catalog selection rule:** `selectable = status === 'approved' && !!localAssetPath && accountTypes.includes(account.type)`. If no item qualifies, show `monikey-default` as the fallback. The `brand` kind is for branded accounts with no physical card; it must not invent a physical product.

### 3.5 Initial catalog strategy

Begin with: one neutral MoniKey fallback for all account types and a **small, reviewed pilot** of approved assets. Do not commit dummy “official” designs for all pictured providers. Suggested issuer priority for *research* (not guaranteed assets): BPI, BDO, Maya, GCash, Atome, UnionBank. Add additional issuers when the exact real product and rights are established.

---

## 4. Interaction and visual UX specification

### 4.1 Accounts / Wallet page (first delivery)

- Preserve the screen navigation and header; label page **Accounts** initially to avoid breaking existing expectations. The primary content becomes the wallet gallery; the existing list remains accessible via `Cards | List` view toggle.
- Preserve the finance summary, but do not copy the reference screenshot's confusing **assets / liabilities** presentation verbatim. Show net position, money you have, and money you owe with existing exact definitions.
- A wallet card uses aspect ratio **1.586:1** (approximate ID-1 card proportion), corner radius ~16–20px, `object-fit: contain` for the whole design by default, and a predictable background behind any letterboxing. Never crop issuer marks merely to fill a box.
- The card art is the dominant image, in a frameless 1–4 column grid of all accounts under a net-position banner (UI_UX_SPEC §6, owner reference design of 2026-11-02). The face prints its figure straight on the art, bottom-left within the left ~58%: Balance for liquid accounts; Available credit, a used-share line and "N% used" for credit cards. White text with a soft shadow by default; cards marked `faceInk: 'dark'` in `cardProducts.ts` (light designs, and MariBank orange for contrast) and the light MoniKey card use dark ink. No caption under the card; the MoniKey card prints the account name. Details open from the face; the upper-right three-dot menu keeps Edit and Pay card.
- Use the existing `MoneyText` formatting; never stringify centavos independently to make a displayed figure.
- Selection highlights one card. The top-right menu exposes actions appropriate to its **MoniKey account type**, not the printed card network; activating the menu must not open the card details dialog.
- A missing/failed image is replaced by the neutral fallback with a readable account label. Never show a broken image icon.
- Keep grid and list headings/ordering logically identical. Zero accounts: reuse existing `EmptyState` and Add account action.

### 4.2 Dashboard / Overview (second delivery)

- Add a compact deck of wallet cards only after the full wallet grid passes accessibility and responsiveness tests.
- Desktop: show a short overlapping stack, with an obvious selected card and controls to navigate to prior/next card.
- Mobile: prefer a horizontal, scroll-snap card rail to a heavily overlapping deck (avoids obscured information and small targets).
- When zero accounts exist, show the existing onboarding call-to-action. When one account exists, show one normal card. For more accounts, show a count and clear link to `Accounts`.
- Quick actions reuse existing dialog handlers: expense/add transaction, transfer, card payment, and edit as appropriate. Don't invent an “Open” action unless a real navigation target exists.
- Respect reduced-motion preferences. Selection changes should never reorder financial values or trigger writes.

### 4.3 Card design picker (first or second delivery)

- The card is chosen in **Add account** (after the type, pick the bank or provider, then the exact card, for example BDO → BDO Visa Classic, Gold, Platinum or Signature, each with its own design; "Other" uses the MoniKey card) and can be changed anytime in **Edit account**, which preselects the current card. The catalog lives in `wallet/cardProducts.ts`. `DataSource.addAccount()` resolves with the new account ID from the create response, so the choice is saved against that ID; never guess it by list position or name. The choice is browser-local until ADR-020's `card_product_id` API field lands.
- The financial `type` stays fixed on edit; changing only the image must not change account type, credit limit, opening balance, current owed amount, or transaction history.
- Never auto-select a product based solely on account name (`BDO` could correspond to many card variants).
- Show only approved, matching entries for the account type; disable or hide unavailable candidate assets. If none exist, say “Official design unavailable — using MoniKey default.”
- If the user already selected an asset that is later retired or removed, transparently fall back without editing the underlying account.

### 4.4 Responsive & accessibility acceptance

| Viewport / context | Required behavior |
| --- | --- |
| 320–375px phone | One card per row, full artwork visible, caption and actions readable, no horizontal body scroll |
| 768px tablet | Responsive grid when space permits; no cramped action labels |
| 1024px+ desktop | 2–4 columns determined by available content width; maintain card aspect ratio |
| 200% zoom / enlarged text | No clipped money figures; labels wrap; grid collapses |
| Touch | 44×44px targets for selection and menus on phones; avoid competing tap actions |
| Keyboard | Tab to each card/action; Enter/Space selects; visible focus ring; list/grid toggle keyboard-operable |
| Screen reader | Announce account name, type, balance/owed, selection and available actions; decorative artwork not repeated verbatim |
| Reduced motion | No forced stacking/flip animation; no transform dependency for use |
| Loading / error | Existing `useResource` loading/error/retry preserved; asset failure does not mask data |

Follow existing `docs/design/RESPONSIVE_GUIDELINES.md` breakpoints, spacing, and the distinction between financial error and credit availability.

---

## 5. Data model and persistence strategy

### 5.1 MVP: client-only mapping, **no database change**

In the first implementation, map `account.id` → `artworkId` in a tiny visual-preferences adapter. Prefer session/local-only settings during the proof of concept. For stable preferences across refreshes on one browser, store as a versioned `localStorage` object such as:

```ts
interface WalletPreferencesV1 {
  version: 1
  byAccountId: Record<string, {
    artworkId: string | null
    pinned?: boolean
    order?: number
  }>
  view: 'grid' | 'list'
}
```

Never store actual financial balances in this preference object. Treat local storage as untrusted: parse, validate, ignore unknown IDs, handle denial/quota errors gracefully, and fall back safely. Accounts still load from `DataSource`. Local storage is device/browser-specific, not synchronized and not a security boundary.

### 5.2 Optional later: server-synchronized preferences

If multiple-device persistence becomes an accepted requirement, create an **additive** migration rather than rewriting the ledger schema:

```sql
-- PROPOSED ONLY; do not run against production without review/backup.
CREATE TABLE account_ui_preferences (
  account_id INTEGER PRIMARY KEY
    REFERENCES accounts(id) ON DELETE CASCADE,
  artwork_id VARCHAR(100),
  display_order INTEGER NOT NULL DEFAULT 0,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE
);
```

Recommended API extension *only if this phase is approved*: `GET /api/account-ui-preferences` and `PUT /api/account-ui-preferences/{accountId}`; validate `artwork_id` against the server's allowlisted catalog or reject unknown IDs. Add a bulk reorder operation only when genuinely needed, preferably one atomic write. Reconcile stale references to retired assets at read/render time. No finance amount fields in these payloads.

### 5.3 Account type vs. artwork kind

| Ledger account type | Examples of suitable appearance | Important invariant |
| --- | --- | --- |
| `cash` | MoniKey fallback | No invented bank card association |
| `bank` | Issuer's *specific debit* card, if approved | Still a liquid account |
| `ewallet` | Provider physical/virtual prepaid artwork, if approved | Still a liquid e-wallet balance |
| `credit_card` | Specific credit product variant, if approved | Show owed and limit, not cash balance |

A card product **does not** imply a unique bank balance. Multiple physical/debit cards linked to one bank account remain one MoniKey ledger account unless a later explicitly approved feature changes that model.

---

## 6. React architecture and file changes

### 6.1 Proposed additive directory structure

```text
frontend/
  public/
    card-art/
      monikey-default.svg       # original unbranded fallback
      [approved issuer files]   # only after authenticity + rights checks
      generated/                # AI-generated demo card per catalog card + manifest.json (ADR-019)
  src/
    wallet/
      artworkCatalog.ts        # verified metadata; no bundled unapproved official imagery
      cardProducts.ts          # card catalog: provider, card, design and text colour
      walletPreferences.ts     # validated browser preference adapter
      walletModel.ts           # map AccountsSnapshot -> render model
    components/wallet/
      WalletCard.tsx           # artwork + financial text + accessible selection
      WalletGrid.tsx           # responsive CSS grid
      WalletStack.tsx          # Overview deck (phase 2)
      CardProductPicker.tsx    # Add account: provider, then exact card
      WalletViewToggle.tsx     # cards/list control
      WalletActions.tsx        # wrappers calling existing handlers
  tests/
    walletModel.test.ts
    artworkCatalog.test.ts
    walletPreferences.test.ts
```

**Modify after inspection:** `AccountsView.tsx` and `OverviewView.tsx`. Wire any new handlers through `App.tsx`. Only extend `AccountForm.tsx`/dialog contracts when the appearance picker is introduced. Preserve `AccountRow`, `CreditCardSummary`, `MoneyText`, `DataSource`, and backend API financial contracts.

### 6.2 Wallet view model

```ts
interface WalletCardVM {
  accountId: number
  accountName: string
  accountType: 'cash' | 'bank' | 'ewallet' | 'credit_card'
  artworkId: string                // validated or fallback
  artUrl: string                   // local approved asset or fallback
  primaryAmountCentavos: number    // existing backend-derived value
  primaryLabel: 'Balance' | 'Owed' | 'Card credit'
  availableCreditCentavos?: number
  creditLimitCentavos?: number
  selected: boolean
}
```

**Mapping rules:** for `bank/ewallet/cash`, render `AccountBalance.balance`; for `credit_card`, render `CardStatus.owed` when owed > 0, `CardStatus.credit` when overpaid, otherwise zero/“Nothing owed”. Keep available credit and limit separate. Do not sum, clamp, parse or recompute money in `walletModel.ts`; only project existing derived fields. Existing `MoneyText` owns formatting.

### 6.3 Sample catalog entry (metadata only, not a claim of approval)

```ts
const exampleCandidate: WalletArtwork = {
  id: 'example-bdo-visa-classic',
  issuer: 'BDO', product: 'Visa Classic', variant: 'verify-edition',
  accountTypes: ['credit_card'], kind: 'physical',
  sourcePageUrl: 'https://www.bdo.com.ph/personal/cards/credit-cards',
  localAssetPath: null, status: 'candidate',
  verifiedOn: null, permissionEvidence: null,
}
// Must NOT appear as a selectable official image until approved.
```

### 6.4 Minimal dependency plan

| Phase | New dependency | Notes |
| --- | --- | --- |
| Wallet grid, picker, selection, stack | None | React + Tailwind + CSS Grid/Scroll Snap + existing Radix/Lucide |
| Drag reorder (optional later) | `@dnd-kit/react` and optionally `@dnd-kit/helpers` | Use the current API, and supply separate keyboard Move controls |
| Animation | None | Native CSS only if useful, with `prefers-reduced-motion` |
| Money calculation | None | Existing backend + MoneyText |

**Do not** add Swiper, Motion, Zustand, Redux, React Router, a new UI kit, or asset-processing runtime packages for this feature.

---

## 7. Implementation sequence and numbered PR-sized batches

**Terminology:** `Milestone N` refers to a roadmap milestone. `Wallet PR N` below names a numbered implementation batch in this specification; it is not a GitHub PR number and does not by itself indicate that a roadmap milestone was accepted. “Implemented” records that the batch's code checkpoint exists; GitHub review, branch merge, and release status are tracked separately.

### PR 1 — Contract and safe artwork infrastructure — implemented (`97927f6`)

- [x] ADR-019 authorizes the static artwork exception while requiring exact source and redistribution-rights evidence.
- [x] Add original neutral fallback asset and `WalletArtwork` catalog types.
- [x] Implement catalog filtering (approved only; type-matched; handle missing/retired IDs).
- [x] Add metadata-only candidate entries **without** unapproved issuer images.
- [x] Add unit tests for source/status/type gating.
- [x] No DB changes or production finance writes.

**Exit:** no official issuer artwork is distributed unless recorded as approved; labeled AI-generated concepts are allowed (ADR-019); fallback always loads.

### PR 2 — Full Accounts wallet gallery — implemented (`496d03a`)

- [x] Build `WalletCard`, `WalletGrid`, `WalletViewToggle`, and snapshot mapping.
- [x] Keep the old Accounts list view and existing financial summary/credit details.
- [x] Connect card actions to existing handlers where supported.
- [x] Implement responsive layout, keyboard selection, image-error fallback, and long-amount handling.
- [x] Add component/model tests using fictional data and existing mock scenarios.

**Exit:** cards and list show identical balances/debt; accessible UI from 320px to desktop.

### PR 3 — Artwork picker and local preference persistence — implemented (`bd8fc05`)

- [x] Add the design picker to **Edit account** without putting presentation fields into financial `AccountValues` API payloads. *(Superseded on 2026-11-02: the card is chosen in Add account and can be changed in Edit with the same picker; see §4.3.)*
- [x] Store selected `artworkId` in versioned local preferences with robust parsing and fallback.
- [x] Artwork changes do not change `type`, balances, debt, or limits.
- [x] Resolve nonexistent/stale account IDs safely; storage failure produces a non-blocking notice.
- [x] Document that local preferences do not sync between devices.

**Exit:** choice survives refresh on the same browser, and account calculations remain unchanged.

### PR 4 — Overview wallet stack — implemented (`020fe33`)

- [x] Reuse `WalletCard` for a scroll-snap rail/selected-card stack; no second financial renderer.
- [x] Add selection controls and an Accounts link; preserve the other Overview sections.
- [x] Implement empty, loading, single/multiple-account, reduced-motion and keyboard states.
- [x] Stack previews use decorative images only; no PAN or private card photos are used.

**Exit:** first reference's wallet-selection experience is available while data is unchanged.

### Optional PR 5 — Sorting/synchronization

- [ ] Get separate approval for persistent order or pinning, and for DB/API changes if multi-device sync is required.
- [ ] If reordering is approved, always provide explicit Move Left/Right / Move Up/Down controls. Add drag-and-drop only if it materially improves usability.
- [ ] Add database migration, API contract tests, rollback notes, and backup/restore review if preferences become server-side.

**Owner note (2026-11-02):** Keep PR 5 deferred until reordering solves a demonstrated usability need. If it becomes useful, prefer the explicit move controls; drag-and-drop is optional and should be added only when it provides a clear usability benefit. Persistent order or pinning still needs separate approval.

---

## 8. Verification & release gates

### 8.1 Automated correctness tests

- [x] Automated frontend suite and build passed for PR4: `npm test` (191 tests), `npm run lint`, `npm run build`. Backend tests were not rerun for these frontend-only PRs.
- [ ] `AccountBalance` and `CardStatus` projection yields correct labels/amounts for zero, negative liquid balance, positive debt, paid-off card, overpaid card, and over-limit card.
- [ ] `availableCredit` never included in total assets/net position.
- [ ] Selecting, changing artwork, changing view, or reordering cannot call financial write APIs.
- [ ] Editing financial amounts via existing forms still refreshes snapshot from backend; no stale displayed data after a successful write.
- [ ] Unknown/unapproved/retired artwork IDs always render the neutral fallback and do not trigger external requests.
- [ ] Card list honors exact account identity even when multiple accounts share issuer name.
- [ ] Correctly handles empty accounts, large numbers, long names, and slow/offline/failed account loads.
- [ ] Local preference corruption, private-browser/denied storage, and missing assets fail gracefully.

### 8.2 Visual and accessibility QA

- [ ] Complete review at widths 320, 360, 375, 768, 1024, 1280, 1440 and at 200% zoom. Chromium harnesses now run locally; full visual/device acceptance is still open.
- [ ] Verify keyboard-only path: open page → change grid/list → select account → open/close menu/dialog → return focus to trigger.
- [ ] Verify selected state not based on color alone; minimum 44×44 CSS px touch targets on phone.
- [ ] Verify decorative image `alt` strategy avoids double-reading names and does not hide account amount semantics.
- [ ] Verify screen-reader announcements for card payment, balance, debt, and selection.
- [ ] Verify iOS Safari and Android Chrome; portrait/landscape; light theme; reduced motion.
- [ ] Check that image art is uncut (logos, chip, payment network mark) and that artwork legibility survives responsive scaling.
- [ ] Use fictional amounts and no real payment data in screenshots, PR images, and CI artifacts.

**Browser run (2026-11-02, local Vite mock, Chromium):** `BASE_URL=http://127.0.0.1:5173/ node scripts/verify-overview.cjs` passed 187/187 checks; `BASE_URL=http://127.0.0.1:5173/ node scripts/verify-accounts.cjs` passed 143/143. The Overview loading demo now replaces wallet balances with its skeleton, and shared-button focus indicators appear in cobalt immediately. The harness now normalizes line breaks in text assertions and checks scroll-rail amounts against their own cards, avoiding false failures for multiline text and off-screen rail cards. Automated viewport, interaction, loading, accessible-name, target-size, no-overflow, and keyboard-focus checks passed. Real-device, screen-reader, 200% zoom, and remaining manual visual checks are still open.

### 8.3 Security and deployment checks

- [ ] No PAN, expiry, CVV, PIN, OTP, or personal card photos in git or telemetry.
- [ ] No uncontrolled user-uploaded SVG/HTML files; artwork paths are allowlisted catalog IDs, not arbitrary URLs.
- [ ] No external issuer/CDN fetch at runtime; all approved assets are local, and fallback is reliable.
- [ ] No new public ingress or unauthenticated access to private financial writes.
- [ ] Ship frontend-only updates through established CI/GitOps flow; review PR and rollback instructions.
- [ ] Manual approval of every newly packaged issuer image, including source and rights documentation.

### 8.4 Definition of Done

The feature is done when: the Accounts view can render authentic **approved** card art and a neutral fallback; a user can select an appearance safely for an existing account (and after adding an account if a reliable new ID is available); existing balance/debt data and actions remain correct; the grid/list and Overview selection are accessible on phone and desktop; all tests pass; no unapproved brand artwork ships; and release evidence contains no personal financial data.

---

## 9. Ownership, branch and rollout guidance

- **Suggested frontend implementer:** Claude Code (React/UI), using existing project guidance in `AGENTS.md`, `CLAUDE.md`, and `DESIGN.md`.
- **Suggested reviewer:** Codex for correctness/API boundary review; backend/DB work only if the optional persistent preference phase is approved. **One writer at a time.**
- **Suggested feature branch:** `feat/authentic-wallet-ui` or smaller per-PR branches.
- **Initial mode:** use `VITE_DATA_SOURCE=mock` and fictional data for screenshots. Only after review validate against the private HTTP-backed homelab deployment.
- **Release strategy:** additive and reversible. Preserve old list, retain fallback, avoid changing the schema in the first releases; enable wallet UI progressively after acceptance.
- **Document update:** canonical `DESIGN.md`, `docs/design/UI_UX_SPEC.md`, `docs/design/RESPONSIVE_GUIDELINES.md`, and `docs/design/COMPONENT_INVENTORY.md` now record the implemented wallet UI. Keep this document as the implementation decision log; update it as acceptance and licensing decisions are resolved.

---

## 10. Current checkpoint and future handoff

Wallet implementation batches 1–4 are present on `feat/account-ui-remake`; do not repeat them. Their completion does not mean the wallet remake has passed acceptance. Before treating it as accepted, complete the outstanding visual/accessibility/device checks in §8 and obtain owner review. Do not add issuer artwork until exact product identity and redistribution rights are documented. Batch 5 remains deferred; if reconsidered, use explicit Move controls and add drag-and-drop only if it materially improves usability. No deployment is authorized by this record.

---

## 11. Research references and uncertainty register

**Official product and category sources (reviewed on 2026-11-02):**

1. BPI cards: https://www.bpi.com.ph/personal/cards
2. BDO credit-card catalog: https://www.bdo.com.ph/personal/cards/credit-cards
3. Maya physical/virtual cards: https://www.maya.ph/pay-maya-card
4. GCash card help: https://help.gcash.com/hc/en-us/articles/30286702730265-How-to-order-GCash-Card
5. Atome card/design variants: https://www.atome.ph/atome-card
6. dnd-kit React quickstart (future optional): https://dndkit.com/react/quickstart/
7. dnd-kit migration notes: https://dndkit.com/react/guides/migration/
8. MoniKey repo: https://github.com/Jeysibn/monikey

**Unresolved decisions — do not assume:**

- Whether external issuer artwork can legally be redistributed with MoniKey, particularly in a public portfolio or source repository; seek provider permission or documented license where needed.
- Which exact card variants the owner wants to use first; issuer name alone is insufficient to select a truthful image.
- Whether per-browser selection is enough or a later PostgreSQL-backed synchronization is desired.
- Whether artwork should be visible with balance inside the art; recommended starting behavior is separate caption to prevent blocking authentic graphics.

**Risk policy:** unresolved authenticity or legal-use status for official issuer artwork means **fallback art** (or a labeled AI-generated concept the user picks), never copied official imagery. Product identity research and permission clearance are separate gates.

---

**End of implementation specification.** This document is an implementation plan and does not assert that any bank artwork has already been downloaded, licensed, or integrated.
