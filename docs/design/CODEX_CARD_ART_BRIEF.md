# Image Brief for Codex — demo card artwork (19 cards)

> **Withdrawn (2026-11-03): historical record only.** The 19 images this brief produced were removed from the release tree because their redistribution provenance and rights were never documented, and they imitate issuer card faces. Do **not** regenerate or restore them. MoniKey now draws every card with its original neutral artwork (ADR-019, amended 2026-11-03). The generated files remain in earlier Git history of the public repository; deleting them from the release branch does not erase that history.

**For:** Codex (image generation). **From:** Claude Code (frontend). **Covers:** every card in `frontend/src/wallet/cardProducts.ts`.
**Policy:** These are AI-generated demo images, allowed by ADR-019 (amended 2026-11-02). They are original designs in each issuer's colours, not copies of official card faces.

## What to do

For each card in §3, send **one prompt = the shared prompt in §2 + that card's block**, then post-process and check the result as in §4. Save files only to `frontend/public/card-art/generated/`. Do **not** edit anything under `frontend/src/`, and do not delete the old images in `frontend/public/card-art/concepts/`; Claude wires the new files into the app and retires the old ones.

## 1. Why these rules exist

The current demo images render at different sizes in the app: they have transparent borders of different widths, glowing ragged edges, and drop shadows, and they are 1.2–2.9 MB each. The app also prints the live balance on the bottom-left of every card and puts a menu button in the top-right corner, so those areas must stay clear. Every rule below serves one of those problems.

## 2. Shared prompt (prepend to every card)

```text
Create a flat, front-facing image of a single payment card, filling the entire image edge to edge.

FORMAT
- Landscape, aspect ratio 1.586:1 (an ID-1 bank card). The card face IS the whole image: no background, no table, no hand, no shadow, no reflection, no border, no tilt, no perspective, no 3D mockup.
- Square corners. Do not round the corners and do not leave any transparent or empty margin; the app rounds the corners itself.
- No glow, halo, or soft fade at the edges. Colour must run cleanly to all four edges.

LAYOUT (percentages of width / height, measured from the top-left)
- Issuer wordmark: top-left, inside x 6–50%, y 8–24%.
- Product label (if given): top area, inside x 55–84%, y 8–20%, small and light.
- EMV chip (if given): left side, inside x 7–20%, y 30–48%, realistic metal chip, upright, about 12% of card width.
- Contactless symbol (if given): small, right side, inside x 78–88%, y 32–46%.
- Card network mark: bottom-right, inside x 70–94%, y 70–92%, about 20% of card width.
- KEEP CLEAR ZONE A — x 0–62%, y 54–100% (bottom-left): the app prints the account balance here. Put only calm background there: the card's base colour, a gentle gradient, or very soft large shapes. No text, no logo, no chip, no busy pattern, no sharp contrast lines, no bright highlights. Keep the whole of zone A one consistent tone (all dark or all light) so a single text colour is readable across it.
- KEEP CLEAR ZONE B — x 86–100%, y 0–16% (top-right corner): the app places a menu button here. Background only.
- Keep every mark at least 6% away from every edge so a slight crop cannot cut it.

CONTENT RULES
- The only text on the card is: the issuer wordmark, the product label (if given), and the network mark. Spell them exactly as given. No other words, letters, or numbers.
- No card number, cardholder name, expiry date, CVV, signature strip, magnetic stripe, QR code, hologram text, fine print, website, or phone number.
- No people, faces, mascots, animals, or photographs.
- Style: modern, premium, flat-graphic card design with bold simple shapes and smooth gradients; matte finish; crisp vector-like edges; high contrast between marks and background. It should look like a real issued card, as a design study in the issuer's colours, not a copy of an official card.
```

## 3. Card blocks

Each block lists: **file**, then the text to append to the shared prompt. `faceInk` is not part of the prompt. It is the text colour the app should use on zone A (`light` = white text, so zone A must be dark; `dark` = ink text, so zone A must be light). Report it in the manifest.

### Bank accounts (debit cards)

**1. `bdo-debit-mastercard.webp`** — faceInk `light`
```text
CARD: BDO debit card.
Issuer wordmark: "BDO" in a heavy geometric sans-serif; the letters B and D in white, the letter O in golden yellow (#FDB913).
Product label: "Debit" in white.
Chip: gold. Contactless symbol: yes, white.
Network mark: Mastercard (two overlapping red and orange-yellow circles).
Colours: royal blue base (#0B4FB3) brightening slightly toward the top-right (#1E88E5).
Motif: one large, soft rounded-rectangle panel in a slightly lighter blue rising from the bottom edge on the right half only. Zone A stays plain royal blue.
```

**2. `bpi-debit-mastercard.webp`** — faceInk `light`
```text
CARD: BPI debit card.
Issuer wordmark: "BPI" in bold white serif-free capitals.
Product label: "Debit" in white.
Chip: gold. Contactless symbol: yes, white.
Network mark: Mastercard.
Colours: deep crimson base (#A50E1C) shading to maroon (#6B0A12) at the bottom-left.
Motif: a broad, soft diagonal light sweep coming from the top-right corner toward the centre, plus two thin darker-red chevron shapes on the right half. Zone A stays plain maroon.
```

**3. `bpi-debit-cirrus-gold.webp`** — faceInk `dark`
```text
CARD: BPI debit card, gold edition.
Issuer wordmark: "BPI" in deep maroon (#6B0A12) bold capitals.
Product label: "Debit" in deep maroon.
Chip: silver. Contactless symbol: no.
Network mark: the word "Cirrus" in a clean italic sans-serif, deep blue (#1A3C8C), bottom-right.
Colours: warm brushed gold (#C9A24A to #E8CF8A), smooth and even.
Motif: very fine horizontal brushed-metal texture and one soft diagonal sheen on the right half. Zone A stays an even, light-to-mid gold with no sheen (dark text will sit on it).
```

**4. `bpi-debit-cirrus-red.webp`** — faceInk `light`
```text
CARD: BPI debit card, red edition.
Issuer wordmark: "BPI" in white bold capitals.
Product label: "Debit" in white.
Chip: gold. Contactless symbol: no.
Network mark: the word "Cirrus" in a clean italic sans-serif, white, bottom-right.
Colours: rich red (#C8102E) to dark red (#7A0A1A) toward the bottom-left.
Motif: fine brushed-metal texture and a few large concentric arcs in a slightly lighter red, centred off the right edge. Zone A stays plain dark red.
```

**5. `gotyme-visa-debit.webp`** — faceInk `light`
```text
CARD: GoTyme debit card.
Issuer wordmark: "GOtyme" in white, a bold rounded geometric sans-serif; the "GO" in capitals.
Product label: "Debit" in white.
Chip: silver. Contactless symbol: yes, white.
Network mark: Visa wordmark in white.
Colours: deep navy base (#0A1F44) with electric cyan accents (#00E5FF).
Motif: a band of thin horizontal cyan stripes across the right half only, getting thicker and denser toward the bottom-right corner. The whole left half, including zone A, stays plain deep navy with no stripes.
```

**6. `maribank-debit.webp`** — faceInk `light`
```text
CARD: MariBank debit card.
Issuer wordmark: "MariBank" in white rounded sans-serif, preceded by a simple white circular emblem containing a capital "M" above two small wave lines.
Product label: "Debit" in white.
Chip: gold. Contactless symbol: yes, white.
Network mark: Mastercard.
Colours: vivid orange base (#FF5A00), with amber (#FF9A1F) and pale peach (#FFD9B8) accents.
Motif: two or three layered, smooth rolling waves in amber and peach, confined to the right half and the lower-right corner. Zone A stays plain vivid orange.
```

### E-wallets

**7. `gcash-visa.webp`** — faceInk `light`
```text
CARD: GCash prepaid card.
Issuer wordmark: "GCash" in white bold rounded sans-serif.
Product label: none.
Chip: gold. Contactless symbol: yes, white.
Network mark: Visa wordmark in white.
Colours: bright GCash blue (#0057E7) deepening to (#0A3FC4).
Motif: a very large stylised letter "G" made of concentric rounded rings in lighter blues (#2E8BFF, #5FB0FF), centred in the right half of the card and partly running off the right edge. Zone A stays plain deep blue.
```

**8. `gcash-mastercard.webp`** — faceInk `light`
```text
CARD: GCash prepaid card, Mastercard edition.
Issuer wordmark: "GCash" in white bold rounded sans-serif.
Product label: none.
Chip: silver. Contactless symbol: yes, white.
Network mark: Mastercard.
Colours: dark navy-blue base (#062A78) with bright blue (#0A6CFF) and sky blue (#58B4FF) accents.
Motif: three smooth flowing ribbons sweeping from the top-right toward the bottom-right, in bright and sky blue. Zone A stays plain dark navy-blue.
```

**9. `maya-visa.webp`** — faceInk `light`
```text
CARD: Maya prepaid card, Visa.
Issuer wordmark: "maya" in white, lowercase, a friendly rounded geometric sans-serif.
Product label: none.
Chip: gold. Contactless symbol: yes, white.
Network mark: Visa wordmark in white.
Colours: near-black base (#0B0F0C) with bright mint green (#3EF08A).
Motif: one bold, glossy mint-green swoosh curving through the upper-right and right side of the card. Zone A stays plain near-black.
```

**10. `maya-mastercard.webp`** — faceInk `light`
```text
CARD: Maya prepaid card, Mastercard.
Issuer wordmark: "maya" in white, lowercase, a friendly rounded geometric sans-serif.
Product label: none.
Chip: silver. Contactless symbol: yes, white.
Network mark: Mastercard.
Colours: deep forest green (#0E3B2A) to emerald (#12704A).
Motif: a very large, soft lowercase "m" shape in a slightly lighter green, filling the right half and running off the right edge. Zone A stays plain deep forest green.
```

**11. `maya-virtual.webp`** — faceInk `dark`
```text
CARD: Maya virtual card (used only in the app, so it has no chip).
Issuer wordmark: "maya" in deep forest green (#0E3B2A), lowercase, a friendly rounded geometric sans-serif.
Product label: "Virtual" in deep forest green.
Chip: none. Contactless symbol: no.
Network mark: none (leave the bottom-right as background).
Colours: light mint (#CFFBE3) to fresh mint (#7CE8B1).
Motif: soft, large overlapping translucent circles in mint and white on the right half. Zone A stays an even light mint (dark text will sit on it).
```

### Credit cards

**12. `atome-credit-black.webp`** — faceInk `light`
```text
CARD: Atome credit card, black edition.
Issuer wordmark: "Atome" in brushed-silver sans-serif.
Product label: "Credit" in light grey.
Chip: silver. Contactless symbol: no.
Network mark: Mastercard.
Colours: matte black (#0B0B0B) with charcoal (#1E1E1E) and graphite (#2C2C2C) planes.
Motif: large faceted geometric planes and one thin silver diagonal line on the right half, like folded paper. Zone A stays plain matte black.
```

**13. `bdo-visa-classic.webp`** — faceInk `light`
```text
CARD: BDO credit card, Classic.
Issuer wordmark: "BDO" in white heavy geometric sans-serif.
Product label: "Classic" in white.
Chip: silver. Contactless symbol: yes, white.
Network mark: Visa wordmark in white.
Colours: strong blue (#1565C0) with lighter translucent blues (#2E86DE, #64B5F6).
Motif: wide, overlapping translucent vertical and horizontal bands with rounded corners on the right half, like stacked glass panels. Zone A stays plain strong blue.
```

**14. `bdo-visa-gold.webp`** — faceInk `dark`
```text
CARD: BDO credit card, Gold.
Issuer wordmark: "BDO" in deep navy (#0B1F4D) heavy geometric sans-serif.
Product label: "Gold" in deep navy.
Chip: gold. Contactless symbol: yes, deep navy.
Network mark: Visa wordmark in deep navy.
Colours: rich gold (#B8862B to #E9C46A).
Motif: smooth metallic gold with one soft diagonal sheen and a faint large rounded panel on the right half. Zone A stays an even mid-light gold with no sheen (dark text will sit on it).
```

**15. `bdo-visa-platinum.webp`** — faceInk `dark`
```text
CARD: BDO credit card, Platinum.
Issuer wordmark: "BDO" in deep navy (#0B1F4D) heavy geometric sans-serif.
Product label: "Platinum" in deep navy.
Chip: silver. Contactless symbol: yes, deep navy.
Network mark: Visa wordmark in deep navy.
Colours: brushed platinum silver (#D7DBE0 to #A9AFB7).
Motif: fine horizontal brushed-metal texture and a thin pale-blue (#9EC3FF) curved line sweeping across the right half. Zone A stays an even light platinum (dark text will sit on it).
```

**16. `bdo-visa-signature.webp`** — faceInk `light`
```text
CARD: BDO credit card, Signature.
Issuer wordmark: "BDO" in white heavy geometric sans-serif.
Product label: "Signature" in warm gold (#D4AF37).
Chip: gold. Contactless symbol: yes, white.
Network mark: Visa wordmark in white.
Colours: midnight navy (#0B1530) fading to black (#05070D).
Motif: a few thin gold pinstripe arcs sweeping across the right half. Zone A stays plain midnight navy.
```

**17. `bpi-platinum-rewards.webp`** — faceInk `light`
```text
CARD: BPI credit card, Platinum Rewards.
Issuer wordmark: "BPI" in white bold capitals.
Product label: "Platinum Rewards" in light grey.
Chip: silver. Contactless symbol: yes, white.
Network mark: Mastercard.
Colours: dark graphite (#1C1F24) with a crimson accent (#C8102E).
Motif: fine brushed-metal texture and one bold crimson diagonal stripe crossing the upper-right area, with a thinner parallel stripe beside it. Zone A stays plain dark graphite.
```

**18. `maya-visa-platinum.webp`** — faceInk `light`
```text
CARD: Maya credit card, Visa Platinum.
Issuer wordmark: "maya" in white, lowercase, a friendly rounded geometric sans-serif, top-left.
Product label: "Platinum" in light grey, placed just under the network mark (bottom-right).
Chip: silver. Contactless symbol: no.
Network mark: Visa wordmark in silver.
Colours: deep black (#050505) with grey and silver dots.
Motif: a flowing wave of fine halftone dots in grey and silver across the upper-right half, fading out before it reaches zone A. Zone A stays plain deep black.
```

**19. `unionbank-rewards-visa-platinum.webp`** — faceInk `light`
```text
CARD: UnionBank credit card, Rewards Visa Platinum.
Issuer wordmark: "UnionBank" in white bold sans-serif.
Product label: "REWARDS" in white, widely letter-spaced capitals.
Chip: silver. Contactless symbol: no.
Network mark: Visa wordmark in white, with the word "Platinum" in small white text directly under it.
Colours: deep navy (#0B2A6B) with a slightly lighter navy (#173E91).
Motif: a very large tonal "UB" monogram in the lighter navy, placed in the right half and running off the right and bottom edges, plus a faint vertical metallic sheen in the centre-right. Zone A stays plain deep navy.
```

## 4. Post-process and check every image

1. **Size:** if the generator cannot output 1.586:1 directly (for example it gives 1536×1024), centre-crop to 1.586:1 first, then resize to exactly **1600×1009 px**. The 6% edge margin in §2 keeps the marks safe.
2. **No transparency:** flatten onto the card's own base colour; the result must have no alpha channel.
3. **Format:** WebP, quality about 85, **under 200 KB** each. Name each file exactly as given in §3.
4. **Look at every image** and regenerate it if any of these fail:
   - Colour runs to all four edges, with no border, shadow, halo, rounded corners or background.
   - Zone A (bottom-left) is calm and one tone; zone B (top-right corner) is empty.
   - Wordmark, product label and network mark are spelled exactly and sit in their zones.
   - No numbers, names, dates or extra text anywhere.
   - If a wordmark keeps coming out misspelled after three tries, deliver the image **without** that wordmark and note it in the manifest; Claude can add the text in the app.
5. **Manifest:** write `frontend/public/card-art/generated/manifest.json`:

```json
[
  {
    "id": "bdo-debit-mastercard",
    "file": "/card-art/generated/bdo-debit-mastercard.webp",
    "width": 1600,
    "height": 1009,
    "bytes": 123456,
    "faceInk": "light",
    "zoneAColor": "#0B4FB3",
    "notes": ""
  }
]
```

One entry per card, all 19, in the order of §3. `zoneAColor` is the average colour of zone A; Claude uses it to double-check text contrast.

## 5. Hand back

Report the 19 files, any card that needed the wordmark left out, the total size of the folder, and the image tool and settings used, so the set can be regenerated consistently later. Claude then points `cardProducts.ts` at the new files, rounds the corners in CSS, applies `faceInk`, checks every card in the browser, and removes the old concept images.
