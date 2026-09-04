# Test fixtures

Reserved per the plan's §11 backend layout (`backend/test/{integration,contract,fixtures}`).

Phase 1 has no seeded business data beyond the category stub in
`prisma/seed.ts`, so there are no fixture files yet. Phase 2/3 should drop
reusable fixture data here (e.g. demo user/account/transaction payloads used
by both integration and contract tests) rather than duplicating literals
across test files.
