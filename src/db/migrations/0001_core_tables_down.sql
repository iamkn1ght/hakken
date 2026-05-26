-- =============================================================================
-- Down-migration 0001 — Core tables
-- HK-1 · H1-001 AC#4: "Down-migration written, applied, and confirmed to
--                      cleanly revert all table creation."
--
-- Drop order is the inverse of FK dependency: leaf tables first, FK targets
-- last. Extensions are left in place (PostGIS and pgcrypto are cluster-wide
-- and not owned by this rail's migration cycle).
--
-- This file is NOT executed by drizzle-kit's migrator — drizzle does not
-- support down-migrations natively. It exists for the H1-001 DoD evidence
-- requirement and for operator-driven rollbacks via `psql -f`.
-- =============================================================================

DROP TRIGGER IF EXISTS entities_touch_updated_at ON entities;
DROP TRIGGER IF EXISTS apps_touch_updated_at     ON apps;
DROP FUNCTION IF EXISTS touch_updated_at();

DROP TABLE IF EXISTS cached_signals    CASCADE;
DROP TABLE IF EXISTS analytics_events  CASCADE;
DROP TABLE IF EXISTS ranking_calls     CASCADE;
DROP TABLE IF EXISTS plugins           CASCADE;
DROP TABLE IF EXISTS entity_tiers      CASCADE;
DROP TABLE IF EXISTS tiers             CASCADE;
DROP TABLE IF EXISTS broadcasts        CASCADE;
DROP TABLE IF EXISTS entities          CASCADE;
DROP TABLE IF EXISTS verticals         CASCADE;
DROP TABLE IF EXISTS apps              CASCADE;
