# Authentication

MoniKey uses Argon2id password hashes and random session tokens whose hashes are
stored in PostgreSQL. Browser sessions use HttpOnly cookies with SameSite=Lax;
production cookies are Secure. State-changing browser requests require the
configured application origin.

Users can change their password and list or revoke other active sessions from
`/security`. Changing a password invalidates every other session. Expired
sessions remain invalid even before cleanup; cleanup is operational maintenance.

## API documentation exposure

Swagger UI and `/openapi.json` are available by default outside production.
Production disables both unless `PUBLIC_API_DOCS=true` is explicitly chosen at
the deployment boundary.

The API adds `X-Content-Type-Options`, `Referrer-Policy`, and restrictive
`Permissions-Policy` headers. HSTS is emitted only for HTTPS production origins;
HTTP local development is not given an HSTS policy.
