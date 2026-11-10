# Consolidated UI evidence (Draft PR #25)

Captured from the combined branch (Moki integration + UI foundation, category icons, Analytics Dashboard and cross-screen polish), not from the individual source PRs. All data is synthetic.

| Evidence | Files | Environment |
|---|---|---|
| Overview with Moki, mobile | `overview-moki-390.png` (viewport), `overview-moki-390-full.png`, 320 and 768 variants | Vite mock source |
| Overview with Moki, desktop | `overview-moki-1440.png`, `overview-moki-1024.png` | Vite mock source |
| Dashboard, mobile / desktop | `dashboard-390.png`, `dashboard-1440.png` (also 320, 768, 1024) | Vite mock source |
| Category icon picker | `category-icon-picker-390.png` | Real FastAPI + PostgreSQL |
| Category create / edit dialog | `category-dialog-create-390.png`, `category-dialog-edit-390.png` | Real FastAPI + PostgreSQL |
| Quick Add with category icons | `quick-add-category-icons-390.png` | Real FastAPI + PostgreSQL |
| Activity with category icons | `activity-category-icons-390.png` | Real FastAPI + PostgreSQL |
| Categories list with icons | `categories-list-icons-390.png`, `categories-list-icons-1440.png` | Real FastAPI + PostgreSQL |
| Activity empty (sleeping Moki) / filtered (searching Moki) | `activity-empty-moki-*.png`, `activity-filtered-moki-390.png` | Vite mock source |
| Kakeibo no-plan (planning Moki) | `kakeibo-no-plan-moki-390.png`, `-1440.png` | Vite mock source |
| Mobile More navigation | `more-navigation-390.png` | Vite mock source |

Mobile files without `-full` are viewport captures. The `-full` versions are full-page stitches, in which the fixed bottom navigation appears mid-page; that is a capture artifact, not a layout bug.

Horizontal overflow measured at 320, 390, 768, 1024 and 1440 px for Overview and Dashboard (and at 390/1440 for the empty Activity and Kakeibo no-plan states): 0 px at every width.
