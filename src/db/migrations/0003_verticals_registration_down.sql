-- =============================================================================
-- Down-migration 0003 — Verticals registration columns
-- HK-1 · H2-002. Reverts 0003 cleanly. Not run by drizzle-kit's migrator;
-- exists for the DoD down-migration requirement and operator rollbacks.
-- =============================================================================

DROP INDEX IF EXISTS verticals_app_idx;
ALTER TABLE verticals DROP CONSTRAINT IF EXISTS verticals_schema_version_positive;
ALTER TABLE verticals DROP CONSTRAINT IF EXISTS verticals_status_chk;
ALTER TABLE verticals DROP COLUMN IF EXISTS status;
ALTER TABLE verticals DROP COLUMN IF EXISTS schema_version;
ALTER TABLE verticals DROP COLUMN IF EXISTS plugin_config;
ALTER TABLE verticals DROP COLUMN IF EXISTS app_id;
