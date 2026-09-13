# Deployment contract

This repository owns application source, migrations, container builds, and
release metadata. The external GitOps repository owns Kubernetes manifests,
secrets, ingress, backup scheduling, and rollout policy.

## Image identity

The publish workflow emits human-readable SHA and `latest` tags, but the
authoritative deployment identity is the digest recorded in the workflow
summary:

```text
ghcr.io/jeysibn/monikey-api@sha256:<digest>
ghcr.io/jeysibn/monikey-web@sha256:<digest>
```

GitOps should resolve and pin those digests rather than deploying `latest`.
The workflow also requests OCI provenance and SBOM attestations; vulnerability
scanning remains a release gate.

## Handoff

1. A merge to `main` publishes changed images.
2. The workflow verifies the pushed SHA tag and records its immutable digest.
3. GitOps updates the deployment image reference to the digest.
4. GitOps runs migrations using the application release procedure before
   making the new API available.

This repository does not contain Kubernetes manifests and does not assume
access to the deployment cluster.

## Related

- [CI/CD operations](../CI-CD-Operations.md)
- [Configuration](configuration.md)
- [Disaster recovery](../Disaster-Recovery.md)
