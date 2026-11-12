# Moki mascot assets and UI guidance

Moki is MoniKey's established chibi monkey mascot. Use the existing approved character to make a real empty or introductory state easier to understand. Moki is decorative support: nearby text and actions must explain the state without relying on the illustration.

## Canonical identity and provenance

- Canonical full-body reference: `frontend/src/assets/mascot/source/full-default.png`.
- Turnaround reference: `origin/feat/moki-mascot-assets` at commit `2092db04eceacc219e204a6683ddd511da955f12`, file `frontend/src/assets/mascot/turnaround-sheet.png`.
- The original asset branch is retained and was not merged. Its single asset commit was authored by the repository owner and adds only the 23 images listed below. The task identifies these as MoniKey's official artwork. The commit does not contain a separate artist license or rights statement.
- A visual index of every source candidate is in [`screenshots/moki/source-contact-sheet.png`](screenshots/moki/source-contact-sheet.png).

Keep Moki's warm brown fur, cream face and ears, large brown eyes, small blush, top hair tuft, cobalt hoodie, white sneakers with blue accents, chibi proportions, clean 2D linework, and one naturally attached tail ending in a gold key. The full-body identity check uses `full-default.png`; compare new artwork against it before any use. Do not edit or overwrite source images.

## Source inventory

All 23 files are 8-bit RGBA PNGs with transparency. The poses were visually checked together; the full-body poses consistently retain Moki's defining design. No exact duplicate files were found. The six selected source files are kept under `frontend/src/assets/mascot/source/`; the other source candidates remain on the preserved asset branch and are represented in the contact sheet.

| Source file | Dimensions | Bytes | Visual description and intended use | Assessment |
|---|---:|---:|---|---|
| `full-checklist-thinking.png` | 1254 × 1254 | 978,193 | Thinking with a checklist; Kakeibo plan introduction | Approved; used |
| `full-confused.png` | 1254 × 1254 | 1,026,274 | Confused question pose with symbols | Consistent character; no current state needs this expression |
| `full-default.png` | 1254 × 1254 | 967,830 | Neutral full-body standing pose | Canonical reference; source retained, not served to the app |
| `full-delete-caution.png` | 1312 × 1199 | 1,113,225 | Caution sign during a delete warning | Consistent character; not used because the existing confirmation should keep the warning and controls prominent |
| `full-empty-wallet.png` | 1254 × 1254 | 1,010,769 | Holding an empty wallet | Approved; used for an empty account collection |
| `full-loading.png` | 1254 × 1254 | 1,125,723 | Holding a loading symbol | Consistent character; not used because existing skeletons communicate loading |
| `full-piggy-bank.png` | 1254 × 1254 | 931,931 | Holding a piggy bank | Consistent character; not used because it could imply savings progress unsupported by data |
| `full-presenting.png` | 1254 × 1254 | 1,030,431 | Open-handed presenting pose | Consistent character; no specific state needs a general presentation pose |
| `full-search.png` | 1254 × 1254 | 1,057,524 | Looking through a magnifying glass | Approved; used for filtered activity with no matches |
| `full-server-error.png` | 1254 × 1254 | 1,165,686 | Holding a device with an error symbol | Consistent character; not used because current retryable errors already explain recovery clearly |
| `full-sleeping.png` | 1254 × 1254 | 868,668 | Resting on a notebook | Approved; used when the selected month has no activity |
| `full-success-card.png` | 1254 × 1254 | 976,593 | Showing a completed card with a check | Consistent character; no dedicated success placement added |
| `full-thumbs-up.png` | 1254 × 1254 | 1,007,750 | Thumbs-up | Approved; currently unused (the first-account success mascot was removed; the app shows a normal text confirmation) |
| `full-wave.png` | 1254 × 1254 | 1,008,898 | Waving hello | Approved; used for first-use Overview guidance |
| `head-calm.png` | 1254 × 1254 | 1,157,071 | Calm hoodie portrait | Consistent head artwork; no full-body tail in frame, so not used |
| `head-determined.png` | 1254 × 1254 | 1,134,400 | Determined hoodie portrait | Consistent head artwork; no full-body tail in frame, so not used |
| `head-excited.png` | 1254 × 1254 | 1,228,693 | Excited hoodie portrait with accent marks | Consistent head artwork; no full-body tail in frame, so not used |
| `head-happy.png` | 1254 × 1254 | 1,229,435 | Happy hoodie portrait | Consistent head artwork; no full-body tail in frame, so not used |
| `head-icon.png` | 1312 × 1199 | 1,196,625 | Close-up face icon without a visible key-tail | Visually related, but not suitable as a full Moki pose |
| `head-thinking.png` | 1254 × 1254 | 1,171,259 | Thinking hoodie portrait | Consistent head artwork; no full-body tail in frame, so not used |
| `head-thumbs-up.png` | 1254 × 1254 | 1,193,898 | Thumbs-up hoodie portrait | Consistent head artwork; no full-body tail in frame, so not used |
| `head-worried.png` | 1254 × 1254 | 1,110,004 | Worried hoodie portrait | Consistent head artwork; no full-body tail in frame, so not used |
| `turnaround-sheet.png` | 1448 × 1086 | 1,067,189 | Front, side, and back identity views | Approved reference; retained on source branch and shown in contact sheet |

## Production variants

The app serves only eight optimized, transparent WebP files from `frontend/public/moki/`. Each was resized to 480 pixels on its longest edge and encoded in Chromium at WebP quality 0.92. The selected source PNGs remain unchanged. The canonical `full-default.png` is retained for future visual comparisons and is not imported or copied to the production bundle.

| Pose | Source PNG bytes | App WebP | WebP bytes | Placement |
|---|---:|---|---:|---|
| Welcome | 1,008,898 | `moki-wave.webp` | 42,364 | Overview with no accounts |
| Empty wallet | 1,010,769 | `moki-empty-wallet.webp` | 45,938 | Accounts when the account list is empty |
| Resting | 868,668 | `moki-sleeping.webp` | 39,574 | Activity when the month has no entries |
| Searching | 1,057,524 | `moki-search.webp` | 47,316 | Activity filter returns no matches |
| Planning | 978,193 | `moki-checklist-thinking.webp` | 44,176 | Kakeibo month has no plan |
| Thumbs-up | 1,007,750 | `moki-thumbs-up.webp` | 42,382 | Currently unused; kept as an approved pose |
| Server error | 1,165,686 | `moki-server-error.webp` | 50,008 | A whole page or large section that could not load (`ErrorBlock` with `mascot`) |
| Presenting | 1,030,431 | `moki-presenting.webp` | 43,078 | Dashboard tips; Dashboard analysis range with no spending; Categories tip |

The six variants total 261,750 bytes, 95.6% smaller than their 5,931,802 source bytes. WebP preserves alpha. `width` and `height` are set to 480 in the shared component to reserve a square before loading. The images load lazily by default; the first-use Overview pose uses eager loading because it is in the initial viewport. Browser coverage confirms a populated screen requests no Moki image and the no-account Overview-to-Accounts sequence requests only the welcome and empty-wallet poses. The thumbs-up is currently unused and is never requested. There is no preload for other poses and no runtime image dependency.

MoniKey currently uses its approved light theme only; dark mode is deferred in `DESIGN.md`. Transparent-alpha images were checked against the actual light surfaces, with no white box or halo.

## Shared component and pose selection

`frontend/src/components/Moki.tsx` owns the pose-to-URL registry and typed `MokiPose` and `MokiSize` choices. It provides intrinsic dimensions, responsive size classes, decorative or informative alt text, loading priority, async decoding, and hides an image that fails to load. Use `decorative` for artwork beside complete state copy; informative instances must have a useful alt description.

`EmptyState` accepts an optional illustration, so state copy and the existing action remain present if artwork fails. The welcome pose appears in two distinct Overview states: introductory guidance when the account collection is genuinely empty, and a compact “Welcome back!” panel after existing accounts have loaded. The populated panel is hidden while account data is unresolved or failed, and it does not displace the net-position summary. Account creation is a supported flow in the current API and mock data source, but the welcome pose no longer depends on a user creating their first account.

The empty-wallet pose remains limited to a genuinely empty Accounts collection; ordinary wallet cards do not gain decorative artwork. Resting Moki appears only for a month with no activity, while searching Moki appears when the selected filters produce no matches. Kakeibo planning Moki appears only in the existing no-plan state. The thumbs-up asset remains in the approved asset set but is currently unused: first-account saves retain the existing text confirmation, and no transaction success is embellished. No illustration is shown alongside loading skeletons, balance figures, transaction rows, generic success notices, or recoverable error blocks.

## Browser visual review

[`screenshots/moki/`](screenshots/moki/) contains before-and-after captures from synthetic mock data. Before captures use `origin/main` at `3f8a6d0`; after captures use this integration branch. The `correction/` subfolder compares the populated Overview before and after the normal-use welcome panel and includes populated Accounts mobile and desktop views. Other captures cover empty Activity, filtered Activity, and the Kakeibo no-plan state. The older first-account success screenshot is retained as history; the thumbs-up interaction it shows was removed because mascot feedback should not depend on account setup.

Before selecting a pose, confirm the UI condition is real and resolved (not loading or failed). Prefer artwork whose prop/expression describes that specific state. Keep the primary action and copy visually clear. Don't add an achievement pose unless the application already has a verified achievement state. Keep a full-body pose visible with `object-contain`; never crop the key-tail to fill a box.

## Adding or changing artwork

1. Reuse an approved source pose when it fits. If the set does not fit, use `full-default.png` as a visual reference for any proposed new pose; do not use text-only generation when the canonical reference is available.
2. Save a candidate separately and compare it side-by-side with `full-default.png` and the source contact sheet. Check face, colors, hoodie, sneakers, proportions, one attached key-tail, clean linework, transparency, and complete silhouette. New artwork stays pending owner visual acceptance until reviewed.
3. Keep the highest-quality source under `frontend/src/assets/mascot/source/` and create a transparent production variant under `frontend/public/moki/` at a size appropriate for its rendered dimensions and high-density screens.
4. Update the typed registry, source inventory, optimized-size table, and this pose guidance. Do not import unused artwork into the frontend or add image-processing dependencies to the runtime.
5. Check the state on narrow and desktop viewports, verify the whole character is visible, and ensure adjacent text and controls work without the image.


## Where Moki appears (revision after the owner's review, 2026-11-12)

Moki is present in **empty, first-use and error states and in short dismissible tips**, and stays off money figures and controls. Concretely:

| Moment | Component | Pose |
|---|---|---|
| First use, no accounts (Overview) | `Moki` with `float` (a slow 4 px bob; off under reduced motion) | welcome |
| A whole page or large section failed to load (Activity, Accounts, Categories, Kakeibo, Dashboard sections) | `ErrorBlock mascot` | server error |
| Empty collections: Accounts, Activity, Categories (and archived) | `EmptyState` with an illustration, Moki beside the words from 640 px | empty wallet, resting |
| A search or filter with no results (Activity, Accounts, Categories) | `EmptyState` | searching |
| Kakeibo month with no plan | `NoPlanCard` | planning |
| Dashboard analysis range with no spending | `EmptyState` | presenting |
| Tips: Dashboard (two date scopes), Activity (search and filters), Categories (icon and color) | `MokiTip` | presenting, searching |

Rules: small inline blocks that fail (credit cards, recent activity, a weekly summary) stay plain text with Retry; Overview and Accounts carry **no tips**; a tip is a labelled `<aside>`, dismissed with a 44 px button, remembered in this browser only (`lib/mokiTips.ts`, a closed list of ids, tolerant of blocked storage), and moves focus to the page heading when dismissed. Moki is decorative: the words and the Retry or action always carry the meaning. Never place Moki over a figure, a control or the net-position hero. The first-account success mascot stays removed.

## New poses

New artwork is generated from `full-default.png` as the required reference; the prompts for the next poses are in [`MOKI_CODEX_PROMPTS.md`](MOKI_CODEX_PROMPTS.md). Follow *Adding or changing artwork* above, then add the pose to `frontend/src/lib/mokiAssets.ts`.

## Added placements

- **Page headers:** a decorative Moki beside the title on Dashboard (presenting), Activity (planning) and Categories (resting). Never on Overview, Accounts or Kakeibo.
- **Saves:** a small thumbs-up beside the status message after a save that worked (not for "already gone" notices).
- **Kakeibo plan:** a calm line under the plan summary: thumbs-up while every envelope is within its limit, presenting pose with plain wording when some are over. Outside the figures; hidden until something is spent.
