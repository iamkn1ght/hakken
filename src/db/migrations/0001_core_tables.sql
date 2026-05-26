-- =============================================================================
-- Migration 0001 — Core tables
-- HK-1 · H1-001 (Apply schema migration v1: core tables)
-- Source of truth: hakken-rail-spec-md.md §3.2 (10 core tables) + Build Pack v1.0
--                  §3.2.1 / H1-001 ACs.
-- Tables created: apps, verticals, entities, broadcasts, tiers, entity_tiers,
--                 plugins, ranking_calls, analytics_events, cached_signals.
--
-- Why this batch first: every authenticated request hits apps, every entity
-- write hits entities + verticals, every ranking call writes ranking_calls.
-- Nothing in 0002 (audit schema) can be exercised without these.
--
-- Region: Supabase eu-west-1 (Reboot Pack v1.3 §13). Never af-south-1.
-- =============================================================================

-- PostGIS provides geography(POINT, 4326); pgcrypto provides gen_random_uuid().
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- apps — registered consuming apps. Bootstrapped via POST /v1/apps (H2-001).
-- -----------------------------------------------------------------------------
CREATE TABLE apps (
  app_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_slug        TEXT UNIQUE NOT NULL,
  app_name        TEXT NOT NULL,
  vertical        TEXT NOT NULL,
  sided           TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'provisioning',
  rate_limit_rpm  INT  NOT NULL DEFAULT 600,
  webhook_url     TEXT,
  hmac_secret     TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT apps_sided_chk
    CHECK (sided IN ('one_sided', 'two_sided')),
  CONSTRAINT apps_status_chk
    CHECK (status IN ('provisioning', 'active', 'suspended', 'retired')),
  CONSTRAINT apps_rate_limit_positive_chk
    CHECK (rate_limit_rpm > 0)
);
CREATE INDEX apps_status_idx ON apps (status) WHERE status = 'active';

-- -----------------------------------------------------------------------------
-- verticals — registered discovery verticals (klokd, lunch_drop, ...).
-- Bootstrapped via POST /v1/verticals (H2-002). FK target for entities,
-- broadcasts, etc.
-- -----------------------------------------------------------------------------
CREATE TABLE verticals (
  vertical         TEXT PRIMARY KEY,
  display_name     TEXT NOT NULL,
  sided            TEXT NOT NULL,
  broadcast_types  JSONB NOT NULL DEFAULT '[]'::jsonb,
  ranking_plugins  JSONB NOT NULL DEFAULT '[]'::jsonb,
  ttl_defaults     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT verticals_sided_chk
    CHECK (sided IN ('one_sided', 'two_sided'))
);

-- -----------------------------------------------------------------------------
-- entities — the geo-indexed entity registry. Multi-tenant by vertical.
-- Spec §3.2.3.
-- -----------------------------------------------------------------------------
CREATE TABLE entities (
  entity_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical         TEXT NOT NULL REFERENCES verticals (vertical),
  app_id           UUID NOT NULL REFERENCES apps (app_id),
  entity_type      TEXT NOT NULL,
  display_name     TEXT NOT NULL,
  role_flags       TEXT[] NOT NULL DEFAULT '{}',
  geo              GEOGRAPHY(POINT, 4326) NOT NULL,
  geo_label        TEXT,
  verification     TEXT NOT NULL DEFAULT 'unverified',
  fulfilment_paths JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
  external_ref     TEXT,
  status           TEXT NOT NULL DEFAULT 'active',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT entities_verification_chk
    CHECK (verification IN ('unverified', 'pending', 'verified', 'rejected')),
  CONSTRAINT entities_status_chk
    CHECK (status IN ('active', 'suspended', 'retired')),
  CONSTRAINT entities_entity_type_chk
    CHECK (entity_type IN (
      'kitchen', 'venue', 'employer', 'worker', 'cooperative', 'fulfilment_provider'
    )),
  CONSTRAINT entities_external_ref_unique UNIQUE (app_id, external_ref)
);
CREATE INDEX entities_vertical_idx     ON entities (vertical);
CREATE INDEX entities_app_idx          ON entities (app_id);
CREATE INDEX entities_geo_gist         ON entities USING GIST (geo);
CREATE INDEX entities_verification_idx ON entities (verification);
CREATE INDEX entities_status_idx       ON entities (status);

-- -----------------------------------------------------------------------------
-- broadcasts — the broadcast index. Time-bounded discovery signals.
-- Spec §3.2.4.
-- -----------------------------------------------------------------------------
CREATE TABLE broadcasts (
  broadcast_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical         TEXT NOT NULL REFERENCES verticals (vertical),
  app_id           UUID NOT NULL REFERENCES apps (app_id),
  publisher_id     UUID NOT NULL REFERENCES entities (entity_id),
  broadcast_type   TEXT NOT NULL,
  payload          JSONB NOT NULL,
  geo              GEOGRAPHY(POINT, 4326) NOT NULL,
  geo_label        TEXT,
  verification     TEXT NOT NULL DEFAULT 'unverified',
  consent_scope    TEXT NOT NULL DEFAULT 'single_app',
  ttl_at           TIMESTAMPTZ NOT NULL,
  abuse_state      TEXT NOT NULL DEFAULT 'clean',
  status           TEXT NOT NULL DEFAULT 'active',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  indexed_at       TIMESTAMPTZ,
  CONSTRAINT broadcasts_verification_chk
    CHECK (verification IN ('unverified', 'pending', 'verified')),
  CONSTRAINT broadcasts_consent_scope_chk
    CHECK (consent_scope IN ('single_app', 'cross_app_optional', 'cross_app_required')),
  CONSTRAINT broadcasts_abuse_state_chk
    CHECK (abuse_state IN ('clean', 'flagged', 'quarantined')),
  CONSTRAINT broadcasts_status_chk
    CHECK (status IN ('active', 'expired', 'revoked'))
);
CREATE INDEX broadcasts_vertical_idx     ON broadcasts (vertical);
CREATE INDEX broadcasts_publisher_idx    ON broadcasts (publisher_id);
CREATE INDEX broadcasts_ttl_active_idx   ON broadcasts (ttl_at) WHERE status = 'active';
CREATE INDEX broadcasts_geo_gist         ON broadcasts USING GIST (geo);
CREATE INDEX broadcasts_abuse_idx        ON broadcasts (abuse_state) WHERE abuse_state <> 'clean';

-- -----------------------------------------------------------------------------
-- tiers — merchant tier registrations per app. Spec §3.2.5.
-- -----------------------------------------------------------------------------
CREATE TABLE tiers (
  tier_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id          UUID NOT NULL REFERENCES apps (app_id),
  tier_slug       TEXT NOT NULL,
  display_name    TEXT NOT NULL,
  ranking_weight  NUMERIC(6,3) NOT NULL DEFAULT 1.000,
  publish_quota   INT NOT NULL DEFAULT 10,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tiers_slug_unique_per_app UNIQUE (app_id, tier_slug),
  -- Spec §8.4: tier weights capped at 1.500 to prevent tier dominance.
  CONSTRAINT tiers_ranking_weight_bounds
    CHECK (ranking_weight >= 0.000 AND ranking_weight <= 1.500),
  CONSTRAINT tiers_publish_quota_positive
    CHECK (publish_quota >= 0)
);

-- -----------------------------------------------------------------------------
-- entity_tiers — tier assignments to entities. Spec §3.2.6.
-- -----------------------------------------------------------------------------
CREATE TABLE entity_tiers (
  entity_id       UUID NOT NULL REFERENCES entities (entity_id) ON DELETE CASCADE,
  tier_id         UUID NOT NULL REFERENCES tiers (tier_id),
  active_from     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  active_until    TIMESTAMPTZ,
  source_payment  TEXT,
  PRIMARY KEY (entity_id, tier_id, active_from)
);
CREATE INDEX entity_tiers_active_idx ON entity_tiers (entity_id, active_from DESC);

-- -----------------------------------------------------------------------------
-- plugins — registered ranking plugins. One row per plugin version.
-- Spec §3.2.7.
-- -----------------------------------------------------------------------------
CREATE TABLE plugins (
  plugin_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical           TEXT NOT NULL REFERENCES verticals (vertical),
  plugin_slug        TEXT NOT NULL,
  version            INT  NOT NULL,
  artifact_uri       TEXT NOT NULL,
  latency_budget_ms  INT  NOT NULL DEFAULT 50,
  status             TEXT NOT NULL DEFAULT 'staged',
  registered_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_at       TIMESTAMPTZ,
  CONSTRAINT plugins_status_chk
    CHECK (status IN ('staged', 'active', 'rolled_back', 'retired')),
  CONSTRAINT plugins_version_positive
    CHECK (version > 0),
  CONSTRAINT plugins_latency_budget_positive
    CHECK (latency_budget_ms > 0),
  CONSTRAINT plugins_unique_version UNIQUE (vertical, plugin_slug, version)
);
CREATE INDEX plugins_active_idx
  ON plugins (vertical, plugin_slug)
  WHERE status = 'active';

-- -----------------------------------------------------------------------------
-- ranking_calls — audit row written for every ranking call. Append-only at
-- the application layer; the cross-rail audit chain in 0002 is the canonical
-- §A.11 record. This table holds ranking-specific fields (geo, plugins_used,
-- latency_ms) that the cross-rail chain does not.
-- Spec §3.2.8.
-- -----------------------------------------------------------------------------
CREATE TABLE ranking_calls (
  call_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id           UUID NOT NULL,
  vertical         TEXT NOT NULL,
  user_uuid        UUID,
  query            JSONB NOT NULL,
  geo              GEOGRAPHY(POINT, 4326),
  plugins_used     TEXT[] NOT NULL DEFAULT '{}',
  results_count    INT  NOT NULL,
  latency_ms       INT  NOT NULL,
  consent_scope    TEXT NOT NULL,
  fallback_active  BOOLEAN NOT NULL DEFAULT FALSE,
  fallback_reason  TEXT,
  -- §A.11 cross-rail audit fields. Always populated by ranking_engine handlers.
  request_id       TEXT NOT NULL,
  traceparent      TEXT,
  business_op_id   TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ranking_calls_consent_scope_chk
    CHECK (consent_scope IN ('single_app', 'cross_app_optional', 'cross_app_required')),
  CONSTRAINT ranking_calls_results_non_negative
    CHECK (results_count >= 0),
  CONSTRAINT ranking_calls_latency_non_negative
    CHECK (latency_ms >= 0)
);
CREATE INDEX ranking_calls_app_idx       ON ranking_calls (app_id, created_at DESC);
CREATE INDEX ranking_calls_user_idx      ON ranking_calls (user_uuid, created_at DESC);
CREATE INDEX ranking_calls_vertical_idx  ON ranking_calls (vertical, created_at DESC);

-- -----------------------------------------------------------------------------
-- analytics_events — standard analytics events emitted by consuming apps.
-- Spec §3.2.9.
-- -----------------------------------------------------------------------------
CREATE TABLE analytics_events (
  event_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id           UUID NOT NULL,
  vertical         TEXT NOT NULL,
  user_uuid        UUID,
  event_type       TEXT NOT NULL,
  entity_id        UUID,
  broadcast_id     UUID,
  context          JSONB NOT NULL DEFAULT '{}'::jsonb,
  request_id       TEXT NOT NULL,
  traceparent      TEXT,
  business_op_id   TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT analytics_events_type_chk
    CHECK (event_type IN ('publish', 'consume', 'click_through', 'conversion', 'dismiss'))
);
CREATE INDEX analytics_app_idx        ON analytics_events (app_id, created_at DESC);
CREATE INDEX analytics_entity_idx     ON analytics_events (entity_id) WHERE entity_id IS NOT NULL;
CREATE INDEX analytics_broadcast_idx  ON analytics_events (broadcast_id) WHERE broadcast_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- cached_signals — cached read-through signals from adjacent rails (KP, Itafika).
-- Refreshed on read with vertical-specific TTL. Pattern 1 fallback substrate
-- from Foundations §5.3. Spec §3.2.10.
-- -----------------------------------------------------------------------------
CREATE TABLE cached_signals (
  signal_key       TEXT PRIMARY KEY,
  source_rail      TEXT NOT NULL,
  value            JSONB NOT NULL,
  fetched_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMPTZ NOT NULL,
  stale_ok_until   TIMESTAMPTZ NOT NULL,
  CONSTRAINT cached_signals_source_rail_chk
    CHECK (source_rail IN ('kipkiren_pay', 'itafika', 'identiti')),
  CONSTRAINT cached_signals_stale_after_expires
    CHECK (stale_ok_until >= expires_at)
);
CREATE INDEX cached_signals_expires_idx ON cached_signals (expires_at);
CREATE INDEX cached_signals_source_idx  ON cached_signals (source_rail, expires_at);

-- =============================================================================
-- Triggers — updated_at touch on apps and entities. Spec §3.2 implies these
-- mutate; broadcasts/ranking_calls/analytics_events are append-only and don't
-- need them.
-- =============================================================================
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER apps_touch_updated_at
  BEFORE UPDATE ON apps
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER entities_touch_updated_at
  BEFORE UPDATE ON entities
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
