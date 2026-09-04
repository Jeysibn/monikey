-- Phase 2 (Authentication): index supporting session resolution's expiry
-- check and the future scheduled cleanup job (plan §5.13's "cleanup expired
-- sessions" — not built here, see auth guard TODO). `token_hash` already has
-- a unique index from Phase 1; this adds the second lookup path every
-- authenticated request and the (not-yet-built) cleanup worker will need.
CREATE INDEX "user_sessions_expires_at_idx" ON "user_sessions"("expires_at");
