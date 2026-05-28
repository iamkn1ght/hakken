-- =============================================================================
-- Migration 0003 — Verticals registration columns
-- HK-1 · H2-002 (Vertical registration endpoint)
-- Source of truth: Build Pack v1.0 H2-002 AC#3 ("Vertical records carry
--                  plugin_config JSONB field, schema_version, and status")
--                  + AC#1 ("links it to a consuming app").
--
-- The Spec §3.2.2 verticals table (created in 0001) has display_name, sided,
-- broadcast_types, ranking_plugins, ttl_defaults. The Build Pack adds three
-- columns the registration endpoint needs (plugin_config, schema_version,
-- status) plus an app linkage so H2-002 AC#4 ("register a vertical for an
-- unregistered app returns 404") has something to reference.
--
-- app_id is NULLABLE: a vertical CAN be platform-wide, but the POST
-- /v1/verticals endpoint requires an app_slug and validates it (404 if the
-- app is unregistered) before linking. apps.vertical is a plain TEXT column
-- (no FK), so the bootstrap order is apps → verticals with no cycle.
-- =============================================================================

ALTER TABLE verticals ADD COLUMN app_id         UUID REFERENCES apps (app_id);
ALTER TABLE verticals ADD COLUMN plugin_config  JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE verticals ADD COLUMN schema_version INT   NOT NULL DEFAULT 1;
ALTER TABLE verticals ADD COLUMN status         TEXT  NOT NULL DEFAULT 'active';

ALTER TABLE verticals ADD CONSTRAINT verticals_status_chk
  CHECK (status IN ('active', 'suspended', 'retired'));
ALTER TABLE verticals ADD CONSTRAINT verticals_schema_version_positive
  CHECK (schema_version > 0);

CREATE INDEX verticals_app_idx ON verticals (app_id) WHERE app_id IS NOT NULL;
