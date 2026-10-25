<!--
DRAFT ONLY — NOT WRITTEN TO THE VAULT.
Historical draft for the original design milestone; its progress and next-step statements below are not current project status. See `docs/design/README.md` for the current repository snapshot.
Suggested target: ~/main-brain/Projects/MoniKey/Design Milestone - UI UX Design System.md
Writing outside this repository needs the owner's explicit approval. If approved, copy everything below the line
and rephrase the "What I should learn" section in your own words (OBSIDIAN_GUIDE: agent notes are drafts).
This file lives in the repo only so the draft is reviewable; delete it after the note is saved.
-->

---
title: Design Milestone — UI/UX Design System
tags:
  - project/monikey
  - milestone
  - design
status: draft-awaiting-approval
---

# Design Milestone — UI/UX Design System

Repository docs (canonical): `DESIGN.md`, `docs/design/UI_UX_SPEC.md`, `COMPONENT_INVENTORY.md`, `RESPONSIVE_GUIDELINES.md`, `DESIGN_REVIEW.md`. Related: [[Project Hub]] · [[AI Agent Notes]] · [[Learning Notes]]

## What was designed
- A **design system** (colour tokens, typography, spacing, states) and **screen specs** for Overview, Activity, Accounts, plus **Quick Add** (expense, income, pay card), **Add account** and **delete confirmation**.
- Mobile-first navigation: bottom bar on phones, rail on tablets, compact sidebar on desktop.
- A list of **15 small custom components** on top of the five approved shadcn components.
- Fictional PHP sample data that reconciles (net position ₱33,146.25 = ₱54,196.25 money you have − ₱21,050.00 card debt).
- **Nothing was implemented.** No React code, no dependencies, no commits.

## Why these choices
- **One question per screen.** Overview answers "after what I owe, how much do I really have?"
- **Expenses in ink, income in green with a plus, debt in its own colour with the word "owed".** Spending is normal, so red is kept for errors; meaning never relies on colour alone.
- **Available credit is not cash** — shown in grey and never added to totals.
- **A card payment is not an expense** — the design makes the monthly-expenses and net-position figures stay unchanged after a payment, and shows payments with their own marker.
- **Native selects and date inputs** for the best phone behaviour and the least code.
- **Bottom sheet for Quick Add on phones** so the most frequent job (recording a transaction) is one tap away from every screen.

## AI skills used (accurately)
- **UI UX Pro Max:** ran its local search. Its generated "glassmorphism / dark / handwritten font" recommendation was **rejected** because it contradicts the brief; its UX, typography and shadcn guidance was used.
- **Taste Skill:** read its app-screen rules and ran only its style-dealing script (`pastel-consumer` chosen over `achromatic-ledger`). Its browser inspection tools were **not run** (no browser, no UI yet).
- **Impeccable:** ran a reduced, no-browser critique (a design review by an isolated sub-agent plus its detector, from the already-installed engine; no download). It scored the design 28/40 and led to faster card purchase and payment flows.
- **Playwright (via the installed global CLI's core library):** drove the browser tests. **Not used:** Vercel Web Design Guidelines, Emil Kowalski skills, Awesome DESIGN.md.
- **Verified by script:** colour contrast ratios, sample-data totals, grid arithmetic. **Not verified:** how anything looks in a browser, the Manrope font's tabular figures and ₱ glyph, Lucide icon names.

## Tradeoffs considered
- Bottom bar vs. hamburger vs. floating button → bottom bar.
- One form for add/edit and all three kinds vs. separate forms → one form.
- Red expenses vs. neutral expenses → neutral.
- No pay-card preview and no filtered totals, to avoid doing money arithmetic in the browser.
- A tiny limit-track graphic per credit card vs. no graphics at all.

## What I should learn from this milestone *(write this part in your own words)*
Prompts to answer:
- Why is paying a credit card **not** a new expense? Walk through ₱1,000 grocery on a card, then ₱600 payment from the bank.
- What is the difference between **liquid balance**, **card debt**, **available credit** and **net position**?
- What is a **design token**, and why do components refer to `income` / `debt` instead of hex values?
- Why do colour-only cues fail for some users, and what did the design add instead?
- Why must the **server** calculate money totals, and what is one small thing the browser may still show?
- What does "mobile-first" mean for how the CSS will later be written?

## What requires approval before implementation
- [ ] Owner approves the visual direction and `DESIGN.md` (Q1).
- [ ] Font decision: self-host Manrope / CDN / system fonts, and verify tabular figures + ₱ (Q2).
- [ ] Numbering of milestones (design = Roadmap M1) (Q3).
- [ ] Keep or drop the two display-only browser comparisons (Q4).
- [ ] One form for Quick Add and Pay Card (Q5).
- [ ] Codex review of the docs; answers to backend contract questions B1–B7.
- [ ] Then: Roadmap Milestone 2 (Tailwind + shadcn scaffold), reviewed as its own change.

## Corrections after the independent browser review (conditional approval)
- Fixed: duplicate "Add transaction" on phones; add-account zero values (`0`, `00`, `0.00` … never `NaN`); monthly amounts wrapping at 360/375px; Manrope now **self-hosted** after confirming ₱, the minus sign and tabular figures work.
- Rebuilt the look: a flat deep-blue **net-position hero card**, cleaner rows, compact credit-card tiles.
- **Tested in a real browser** (headless Chromium via Playwright): 274 automated checks at 360/375/768/1280 and the card flows — all passed. See `docs/design/VERIFICATION.md`. Not tested: real phones, other browsers, screen readers.
- Owner decisions recorded: browser arithmetic only for display-only previews; keep "Net position"; category chips without remembering the last category; self-host Manrope; stay under Roadmap Milestone 3.

## Next
Wait for final Milestone 3 approval. After that: scaffold (Roadmap M2 content — Tailwind, shadcn), then Overview with typed mock data.
