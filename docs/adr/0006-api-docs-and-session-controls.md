# ADR-0006: Explicit API documentation and session controls

## Status
Accepted

## Context

Interactive API documentation is useful locally but can disclose an attack
surface when exposed unintentionally. Users also need practical account-session
controls before stronger authentication factors are introduced.

## Decision

Serve Swagger UI and the OpenAPI document outside production by default. In
production, require the explicit `PUBLIC_API_DOCS=true` setting. Provide password
change and other-session revocation while retaining the current cookie/session
authentication model.

## Alternatives considered

- Expose documentation everywhere: rejected because public production exposure
  should be intentional.
- Add MFA immediately: deferred until the session controls and recovery model are
  well understood.

## Consequences

Local API exploration remains convenient, production defaults are safer, and
users can recover control of active sessions without a new identity system.

## Related documentation

- [Authentication](../security/authentication.md)
- [Configuration](../operations/configuration.md)
