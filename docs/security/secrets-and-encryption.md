# Secrets and encryption

Third-party access tokens are encrypted at rest with AES-256-GCM using a
user-derived key and the server `ENCRYPTION_SECRET`. Newly written ciphertexts
use a `v1.` envelope prefix. Decryption remains backward-compatible with
legacy unprefixed ciphertexts, while unknown envelope versions are rejected.

Never commit provider credentials, encryption secrets, or real tokens to the
repository, documentation, or test fixtures. Rotating the server secret still
requires a planned re-encryption migration; the version prefix provides the
format seam but does not itself rotate keys.
