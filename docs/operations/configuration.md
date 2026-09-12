# Configuration

Configuration is validated at API and worker startup. Development and test
defaults use local HTTP origins and stub providers. Production requires an HTTPS
`APP_ORIGIN`, rejects demo mode, and validates credentials for selected Resend,
OCR.Space, live quote, and non-stub bank providers.

Production migration startup runs `prisma migrate deploy` only. System seed data
is an explicit idempotent operation; demo data requires both
`MONIKEY_DEMO_MODE=true` and the non-production safety policy (or an explicit
override for controlled environments). Never store real secrets in this file,
the repository, or the project knowledge base.
