-- =============================================================================
-- Migration 0002 — Audit schema (append-only, hash-chained)
-- HK-1 · H1-002 (Apply schema migration v1: audit schema)
-- Source of truth: hakken-rail-spec-md.md §3.3 + §10.6 + Build Pack v1.0
--                  §3.2.2 / H1-002 ACs + Reboot Pack v1.3 §A.11 cross-rail
--                  audit invariant.
--
-- The spec §3.3 lists four logical audit tables (audit_admin_actions,
-- audit_consent_reads, audit_broadcast_publishes, audit_rail_calls). This
-- migration implements them as one canonical hash-chained `audit_log` table
-- in the `hakken_audit` schema, with sub-tables exposed as VIEWs that filter
-- on action prefix. Rationale:
--
--   1. §A.11 requires ONE chain per rail with `traceparent` + `business_op_id`
--      cross-rail forensic join. Four chains break that.
--   2. Helpan AI, Identiti, Kipkiren Pay, Todoku all use one append-only
--      `audit_log` table. Cross-rail tooling (verifyAuditChain.ts) assumes
--      one chain.
--   3. The spec was authored 10 May 2026; the §A.11 invariant landed in the
--      Reboot Pack v1.3 (23 May 2026) and supersedes the spec where they
--      conflict.
--
-- Audit chain integrity:
--   - Hash composition v2: see src/lib/auditWriter.ts → computeEntryHashV2.
--   - Per-row hash_version column lets the chain evolve without breaking
--     verification of older rows.
--   - pg_advisory_xact_lock(73210789) serialises chain appends per rail.
--     This key is Hakken's rail identity in shared-infra ops; do NOT change
--     it (Identiti uses 73210123, KP uses 73210456, Helpan uses
--     7268010825743210).
--
-- Append-only enforcement is two-layered:
--   - REVOKE UPDATE, DELETE on hakken_audit.audit_log from PUBLIC and
--     application roles.
--   - Row-level security with a SELECT-only policy, plus FORCE ROW LEVEL
--     SECURITY (without FORCE the table owner silently bypasses every
--     policy; see Helpan migration 0007).
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS hakken_audit;

-- -----------------------------------------------------------------------------
-- hakken_audit.audit_log — append-only, hash-chained, 7-year retention.
-- Per §A.11: every row carries traceparent + business_op_id for cross-rail
-- forensic join.
-- -----------------------------------------------------------------------------
CREATE TABLE hakken_audit.audit_log (
  id                       TEXT PRIMARY KEY,
  app_id                   TEXT,
  actor_type               TEXT NOT NULL,
  actor_id                 TEXT NOT NULL,
  agent_id                 TEXT,
  delegated_authority_jti  TEXT,
  initiated_by             TEXT,
  account_uuid             TEXT,
  action                   TEXT NOT NULL,
  resource_type            TEXT,
  resource_id              TEXT,
  target_rail              TEXT,
  target_operation         TEXT,
  request_id               TEXT NOT NULL,
  traceparent              TEXT,
  business_op_id           TEXT,
  ip_address               INET,
  outcome                  TEXT NOT NULL,
  detail                   JSONB,
  previous_hash            TEXT,
  entry_hash               TEXT NOT NULL,
  -- 1 = legacy composition (genesis row only — never written by appendAuditEntry).
  -- 2 = current composition covering every persisted column.
  --     See src/lib/auditWriter.ts → computeEntryHashForVersion.
  hash_version             SMALLINT NOT NULL DEFAULT 1,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT audit_log_actor_type_chk
    CHECK (actor_type IN ('user', 'agent', 'operator', 'system')),
  CONSTRAINT audit_log_initiated_by_chk
    CHECK (initiated_by IS NULL OR initiated_by IN ('human', 'agent', 'system')),
  CONSTRAINT audit_log_outcome_chk
    CHECK (outcome IN ('success', 'failure')),
  CONSTRAINT audit_log_hash_version_chk
    CHECK (hash_version IN (1, 2)),
  CONSTRAINT audit_log_target_rail_chk
    CHECK (target_rail IS NULL OR target_rail IN (
      'kipkiren_pay', 'identiti', 'todoku', 'helpan_ai', 'itafika'
    ))
);

CREATE INDEX audit_log_app_id_created_at_idx
  ON hakken_audit.audit_log (app_id, created_at DESC);
CREATE INDEX audit_log_account_uuid_created_at_idx
  ON hakken_audit.audit_log (account_uuid, created_at DESC);
CREATE INDEX audit_log_agent_id_created_at_idx
  ON hakken_audit.audit_log (agent_id, created_at DESC)
  WHERE agent_id IS NOT NULL;
CREATE INDEX audit_log_daa_jti_created_at_idx
  ON hakken_audit.audit_log (delegated_authority_jti, created_at DESC)
  WHERE delegated_authority_jti IS NOT NULL;
CREATE INDEX audit_log_action_created_at_idx
  ON hakken_audit.audit_log (action, created_at DESC);
CREATE INDEX audit_log_rail_op_created_at_idx
  ON hakken_audit.audit_log (target_rail, target_operation, created_at DESC)
  WHERE target_rail IS NOT NULL;
CREATE INDEX audit_log_business_op_idx
  ON hakken_audit.audit_log (business_op_id)
  WHERE business_op_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Genesis row — seeds the hash chain with a well-formed previous_hash so the
-- first real entry has something to chain off. entry_hash for the genesis is
-- SHA-256 of the constant 'hakken-genesis'. hash_version stays at 1 forever
-- for this row; the verifier knows to use the v1 composition for it.
-- -----------------------------------------------------------------------------
INSERT INTO hakken_audit.audit_log (
  id,
  app_id,
  actor_type,
  actor_id,
  account_uuid,
  action,
  resource_type,
  resource_id,
  request_id,
  outcome,
  detail,
  previous_hash,
  entry_hash,
  hash_version
) VALUES (
  '00000000000000000000000000',
  NULL,
  'system',
  'hakken-rail',
  NULL,
  'audit_log.genesis',
  'audit_log',
  NULL,
  '00000000000000000000000001',
  'success',
  jsonb_build_object(
    'note', 'Hash chain genesis row inserted by migration 0002.',
    'rail', 'hakken',
    'lock_key', 73210789,
    'spec', 'hakken-rail-spec-md.md §3.3 + Reboot Pack v1.3 §A.11'
  ),
  NULL,
  encode(digest('hakken-genesis', 'sha256'), 'hex'),
  1
);

-- -----------------------------------------------------------------------------
-- §3.3 sub-table views — exposed as VIEWs over the single canonical chain
-- so consumers that expect the spec's four logical tables can read them
-- without writing duplicate chains. Inserts to these views are not allowed;
-- writers must use appendAuditEntry which targets hakken_audit.audit_log.
-- -----------------------------------------------------------------------------
CREATE VIEW hakken_audit.audit_admin_actions AS
  SELECT * FROM hakken_audit.audit_log
   WHERE action LIKE 'admin.%';

CREATE VIEW hakken_audit.audit_consent_reads AS
  SELECT * FROM hakken_audit.audit_log
   WHERE action LIKE 'consent.%';

CREATE VIEW hakken_audit.audit_broadcast_publishes AS
  SELECT * FROM hakken_audit.audit_log
   WHERE action LIKE 'broadcast.%';

CREATE VIEW hakken_audit.audit_rail_calls AS
  SELECT * FROM hakken_audit.audit_log
   WHERE action LIKE 'rail.%' OR target_rail IS NOT NULL;

-- =============================================================================
-- Append-only enforcement (Spec §10.6, H1-002 AC#5).
-- Three layers:
--   1. REVOKE UPDATE, DELETE on the table.
--   2. RLS policy that permits SELECT and INSERT only.
--   3. A trigger that raises EXCEPTION on UPDATE/DELETE even from the
--      table owner (defence in depth — RLS + FORCE RLS would normally suffice,
--      but the trigger provides an unambiguous error surface for ops tooling
--      that probes "is this table actually append-only?").
-- =============================================================================

REVOKE UPDATE, DELETE, TRUNCATE ON hakken_audit.audit_log FROM PUBLIC;

ALTER TABLE hakken_audit.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE hakken_audit.audit_log FORCE ROW LEVEL SECURITY;

-- Anyone authenticated may SELECT (operator console will further filter).
CREATE POLICY audit_log_select_all
  ON hakken_audit.audit_log
  FOR SELECT
  USING (true);

-- INSERT permitted (the auditWriter writes via the app's connection role).
CREATE POLICY audit_log_insert_chain
  ON hakken_audit.audit_log
  FOR INSERT
  WITH CHECK (true);

-- Defence-in-depth trigger: blocks UPDATE/DELETE at the table level.
CREATE OR REPLACE FUNCTION hakken_audit.block_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'hakken_audit.audit_log is append-only — % rejected (op: %, row id: %)',
    TG_OP, TG_OP, COALESCE(OLD.id, NEW.id)
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_block_update
  BEFORE UPDATE ON hakken_audit.audit_log
  FOR EACH ROW EXECUTE FUNCTION hakken_audit.block_audit_log_mutation();

CREATE TRIGGER audit_log_block_delete
  BEFORE DELETE ON hakken_audit.audit_log
  FOR EACH ROW EXECUTE FUNCTION hakken_audit.block_audit_log_mutation();

-- =============================================================================
-- Down-migration note (Spec §3.4): audit schema additions are exempted from
-- the down-migration requirement per Build Pack §1.5 standing rule:
--   "Every schema migration has a tested down-migration (except audit-schema
--    additions)."
-- Dropping audit history would destroy 7-year-retention evidence; the
-- migration is intentionally one-way.
-- =============================================================================
