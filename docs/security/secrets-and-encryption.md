# Secrets and encryption

Third-party access tokens are encrypted at rest with AES-256-GCM using a
user-derived key and the server `ENCRYPTION_SECRET`. Newly written ciphertexts
use a `v1.` envelope prefix. Decryption remains backward-compatible with
legacy unprefixed ciphertexts, while unknown envelope versions are rejected.

Never commit provider credentials, encryption secrets, or real tokens to the
repository, documentation, or test fixtures.

## Rotating the server secret

Set the new value as `ENCRYPTION_SECRET` and the old value as
`ENCRYPTION_SECRET_PREVIOUS`. From `backend/`, first run the guarded dry run:

```bash
npm run credentials:rotate-encryption
```

The command decrypts every stored Plaid credential with the previous secret but
does not write anything. After reviewing the count and ensuring the deployment
can reach the database, run the same command with `--apply`:

```bash
npm run credentials:rotate-encryption -- --apply
```

The operation fails on the first undecryptable row and never logs plaintext or
secrets. Keep the previous secret available until all rows are successfully
rewritten and the provider sync path has been verified; then remove it from the
deployment secret store. Take a verified database backup before applying the
rotation. The update is row-by-row and can be safely re-run with the same
secret pair if interrupted.

## Dependency security checks

PR validation audits the frontend production dependency graph at high severity
and the backend graph at critical severity. The backend audit currently reports
the Prisma CLI development chain `@prisma/config` → `deepmerge-ts`; the runtime
image is built with `npm ci --omit=dev`, and release validation scans the actual
OCI image with Trivy at high/critical severity. Do not apply npm's suggested
Prisma downgrade automatically: it would downgrade the pinned Prisma 6.19
toolchain and is not an appropriate production fix without a compatible
upgrade or a confirmed runtime exposure.
