# MoniKey — Obsidian Second-Brain Guide

**Goal:** Keep a small personal Obsidian vault that makes MoniKey easier to learn, remember, debug and explain in interviews. **No extra plugins or automation are required.**

## Setup

1. Create a separate folder called `MoniKey-Second-Brain` outside `monikey-v2` and `homelab-gitops`.
2. In Obsidian, open that folder as a vault (or extract the starter included with this package and open the starter folder as a vault).
3. Use Obsidian's built-in Markdown files, links `[[like this]]`, search and backlinks. Keep third-party plugins disabled unless they solve a real problem later.
4. In `01 Project/Repository Links.md`, put links to the **actual** source code repo, `homelab-gitops` repo, and accepted docs/PRs once those addresses are known. Do not invent or copy entire authoritative engineering documents into the vault.
5. Decide how you'll **privately back up** the vault. Vault backup is independent of the PostgreSQL data backup.

## Minimal structure

```text
MoniKey-Second-Brain/
├── 00 Home.md
├── 01 Project/
│   ├── Project Overview.md
│   ├── Open Questions.md
│   └── Repository Links.md
├── 02 Learning/
│   └── Learning Index.md
├── 03 Build Log/
│   └── Build Log Index.md
├── 04 Troubleshooting/
│   └── Troubleshooting Index.md
├── 05 Decisions/
│   └── Personal Decisions.md
└── Templates/
    ├── Milestone Note.md
    ├── Concept Note.md
    └── Troubleshooting Note.md
```

Use one note per milestone and one note per difficult technical idea or recurring failure. More folders, tags, plugins and databases are **not** necessary for v1.

## What to write at each milestone

- **Before:** Goal, questions, what I think will happen.
- **During:** Commands attempted, actual result, encountered errors; avoid copying sensitive values.
- **After:** What changed and why, exactly which tests passed/failed, what I understand now, commit/PR link, and next action.
- **If debugging:** Symptom → hypothesis → evidence → fix → verification → prevention.

**Example questions worth answering in your own words:** Why does React use components and hooks? What does TypeScript catch? Where does `/api` route locally versus in Kubernetes? Why is paying a credit card not a new expense? Why doesn't a new `latest` image trigger GitOps rollout? How is a PVC different from a backup?

## Rules for AI coding agents

Ask Claude Code or Codex for a concise Markdown summary after finishing a **verified** milestone, not a wall of auto-generated notes. Use the summary as a **draft** and rephrase the learning section in your own words. The agent should mention the actual model/skills used only when known and must clearly say when tests were not executed. Agents don't access/edit the vault unless you explicitly allow it.

## Information boundaries

**Canonical in Git:** application source, CI/CD workflow, accepted TLD/ADR/DESIGN, `homelab-gitops` Kubernetes desired state.  
**Personal in Obsidian:** learning notes, questions, annotated concepts, bugs, troubleshooting, self-assessments, interview explanations.  
**Canonical financial data:** private PostgreSQL instance.  
**Never in Obsidian:** API keys, `.env`, kubeconfigs, DB dumps, actual financial account identifiers, sensitive transactions, recovery codes or passwords.

If a note captures a proposed architecture change, submit it to the project's ADR/TLD for review. A vault entry alone is not approved implementation scope.
