/**
 * HK-1 close-out verification probe.
 *
 * Asserts:
 *   - PostGIS + pgcrypto extensions installed
 *   - All 10 core tables present in `public`
 *   - `hakken_audit.audit_log` exists with the genesis row
 *   - Genesis row's entry_hash matches SHA-256('hakken-genesis')
 *   - RLS is ENABLED and FORCED on hakken_audit.audit_log
 *   - The defence-in-depth trigger blocks UPDATE attempts on the audit log
 *
 * Exits non-zero on any failure so this can gate a Railway deploy step.
 */

import { createHash } from 'node:crypto';
import postgres from 'postgres';
import {
  computeEntryHashForVersion,
  type AuditHashVersion,
} from '../src/lib/auditWriter.js';

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 10 });

const EXPECTED_CORE_TABLES = [
  'apps',
  'verticals',
  'entities',
  'broadcasts',
  'tiers',
  'entity_tiers',
  'plugins',
  'ranking_calls',
  'analytics_events',
  'cached_signals',
];

const failures: string[] = [];
function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.warn(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    console.warn(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
    failures.push(name);
  }
}

try {
  console.warn('[verify] extensions');
  const exts = await sql<{ extname: string }[]>`
    SELECT extname FROM pg_extension WHERE extname IN ('postgis', 'pgcrypto')
  `;
  const extSet = new Set(exts.map((r) => r.extname));
  check('postgis extension installed', extSet.has('postgis'));
  check('pgcrypto extension installed', extSet.has('pgcrypto'));

  console.warn('[verify] core tables (public)');
  const tables = await sql<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `;
  const tableSet = new Set(tables.map((r) => r.tablename));
  for (const t of EXPECTED_CORE_TABLES) {
    check(`public.${t} exists`, tableSet.has(t));
  }

  console.warn('[verify] entities.geo is geography(POINT, 4326)');
  const geoCol = await sql<{ udt_name: string }[]>`
    SELECT udt_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'entities' AND column_name = 'geo'
  `;
  check('entities.geo is geography type', geoCol[0]?.udt_name === 'geography');

  console.warn('[verify] hakken_audit schema');
  const schemas = await sql<{ schema_name: string }[]>`
    SELECT schema_name FROM information_schema.schemata
     WHERE schema_name = 'hakken_audit'
  `;
  check('hakken_audit schema exists', schemas.length === 1);

  const auditTables = await sql<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'hakken_audit'
  `;
  check(
    'hakken_audit.audit_log exists',
    auditTables.some((r) => r.tablename === 'audit_log')
  );

  console.warn('[verify] audit chain genesis row');
  const expectedGenesisHash = createHash('sha256').update('hakken-genesis').digest('hex');
  const genesis = await sql<{ entry_hash: string; action: string; hash_version: number }[]>`
    SELECT entry_hash, action, hash_version
      FROM hakken_audit.audit_log
     WHERE action = 'audit_log.genesis'
  `;
  check('genesis row exists', genesis.length === 1);
  if (genesis[0]) {
    check(
      'genesis entry_hash = SHA-256(hakken-genesis)',
      genesis[0].entry_hash === expectedGenesisHash,
      `${genesis[0].entry_hash.slice(0, 12)}…`
    );
    check('genesis hash_version = 1', genesis[0].hash_version === 1);
  }

  console.warn('[verify] RLS + FORCE on hakken_audit.audit_log');
  const rls = await sql<{ relrowsecurity: boolean; relforcerowsecurity: boolean }[]>`
    SELECT relrowsecurity, relforcerowsecurity
      FROM pg_class
     WHERE oid = 'hakken_audit.audit_log'::regclass
  `;
  check('RLS enabled', rls[0]?.relrowsecurity === true);
  check('FORCE RLS', rls[0]?.relforcerowsecurity === true);

  console.warn('[verify] §3.3 sub-table views');
  const views = await sql<{ viewname: string }[]>`
    SELECT viewname FROM pg_views WHERE schemaname = 'hakken_audit'
  `;
  const viewSet = new Set(views.map((r) => r.viewname));
  for (const v of [
    'audit_admin_actions',
    'audit_consent_reads',
    'audit_broadcast_publishes',
    'audit_rail_calls',
  ]) {
    check(`hakken_audit.${v} view present`, viewSet.has(v));
  }

  console.warn('[verify] append-only trigger blocks UPDATE');
  try {
    await sql`UPDATE hakken_audit.audit_log SET outcome = 'failure' WHERE action = 'audit_log.genesis'`;
    check('UPDATE on audit_log rejected', false, 'UPDATE succeeded — trigger missing');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    check('UPDATE on audit_log rejected', /append-only/i.test(msg), msg.slice(0, 80));
  }

  console.warn('[verify] migrations recorded in _drizzle_migrations');
  const migrations = await sql<{ hash: string }[]>`
    SELECT hash FROM _drizzle_migrations ORDER BY created_at
  `;
  check('3 migrations applied', migrations.length === 3);

  // ---- H2-001 / H2-002 bootstrap ------------------------------------------
  console.warn('[verify] H2 bootstrap — apps + verticals');
  const appRows = await sql<{ app_slug: string; sided: string }[]>`
    SELECT app_slug, sided FROM apps WHERE app_slug IN ('klokd', 'lunch_drop')
  `;
  const appBySlug = new Map(appRows.map((r) => [r.app_slug, r.sided]));
  check('app klokd present (two_sided)', appBySlug.get('klokd') === 'two_sided');
  check('app lunch_drop present (one_sided)', appBySlug.get('lunch_drop') === 'one_sided');

  const vertRows = await sql<
    { vertical: string; sided: string; app_id: string | null; status: string }[]
  >`
    SELECT vertical, sided, app_id, status FROM verticals
     WHERE vertical IN ('klokd', 'lunch_drop')
  `;
  const vertBySlug = new Map(vertRows.map((r) => [r.vertical, r]));
  check(
    'vertical klokd present (two_sided, linked to an app)',
    vertBySlug.get('klokd')?.sided === 'two_sided' && !!vertBySlug.get('klokd')?.app_id
  );
  check(
    'vertical lunch_drop present (one_sided, linked to an app)',
    vertBySlug.get('lunch_drop')?.sided === 'one_sided' && !!vertBySlug.get('lunch_drop')?.app_id
  );

  // Vertical isolation (H2-002 AC#5) at the data layer: each vertical's app_id
  // resolves to the matching app_slug; no cross-linking.
  const klokdVert = vertBySlug.get('klokd');
  const lunchVert = vertBySlug.get('lunch_drop');
  if (klokdVert?.app_id && lunchVert?.app_id) {
    const linkRows = await sql<{ app_id: string; app_slug: string }[]>`
      SELECT app_id::text, app_slug FROM apps
       WHERE app_id IN (${klokdVert.app_id}::uuid, ${lunchVert.app_id}::uuid)
    `;
    const slugByAppId = new Map(linkRows.map((r) => [r.app_id, r.app_slug]));
    check(
      'vertical isolation: klokd vertical links to klokd app',
      slugByAppId.get(klokdVert.app_id) === 'klokd'
    );
    check(
      'vertical isolation: lunch_drop vertical links to lunch_drop app',
      slugByAppId.get(lunchVert.app_id) === 'lunch_drop'
    );
  }

  console.warn('[verify] audit entries for the bootstrap registrations');
  const auditCounts = await sql<{ action: string; n: number }[]>`
    SELECT action, COUNT(*)::int AS n
      FROM hakken_audit.audit_log
     WHERE action IN ('admin.app.register', 'admin.vertical.register')
     GROUP BY action
  `;
  const countByAction = new Map(auditCounts.map((r) => [r.action, r.n]));
  check(
    'audit: >=2 admin.app.register entries',
    (countByAction.get('admin.app.register') ?? 0) >= 2
  );
  check(
    'audit: >=2 admin.vertical.register entries',
    (countByAction.get('admin.vertical.register') ?? 0) >= 2
  );

  // ---- Audit hash-chain integrity walk ------------------------------------
  console.warn('[verify] audit hash-chain integrity (recompute + link check)');
  const chain = await sql<
    {
      id: string;
      app_id: string | null;
      actor_type: string;
      actor_id: string;
      account_uuid: string | null;
      action: string;
      resource_type: string | null;
      resource_id: string | null;
      target_rail: string | null;
      target_operation: string | null;
      request_id: string;
      traceparent: string | null;
      business_op_id: string | null;
      initiated_by: string | null;
      agent_id: string | null;
      delegated_authority_jti: string | null;
      outcome: string;
      detail: Record<string, unknown> | null;
      previous_hash: string | null;
      entry_hash: string;
      hash_version: number;
    }[]
  >`
    SELECT id, app_id, actor_type, actor_id, account_uuid, action, resource_type,
           resource_id, target_rail, target_operation, request_id, traceparent,
           business_op_id, initiated_by, agent_id, delegated_authority_jti,
           outcome, detail, previous_hash, entry_hash, hash_version
      FROM hakken_audit.audit_log
     ORDER BY created_at ASC, id ASC
  `;
  let chainOk = true;
  let prevHash: string | null = null;
  for (const row of chain) {
    // Link check: each row's previous_hash must equal the prior row's entry_hash.
    if (prevHash !== null && row.previous_hash !== prevHash) {
      chainOk = false;
      break;
    }
    // The genesis row's entry_hash is SHA-256('hakken-genesis') — a seed, not
    // a composition hash. Don't recompute it; just anchor the chain on it.
    if (row.action === 'audit_log.genesis') {
      prevHash = row.entry_hash;
      continue;
    }
    // Recompute the entry_hash from the persisted columns.
    const recomputed = computeEntryHashForVersion(row.hash_version as AuditHashVersion, {
      id: row.id,
      actorType: row.actor_type,
      actorId: row.actor_id,
      accountUuid: row.account_uuid,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      appId: row.app_id,
      requestId: row.request_id,
      traceparent: row.traceparent,
      outcome: row.outcome,
      initiatedBy: row.initiated_by,
      agentId: row.agent_id,
      delegatedAuthorityJti: row.delegated_authority_jti,
      targetRail: row.target_rail,
      targetOperation: row.target_operation,
      businessOpId: row.business_op_id,
      detail: row.detail,
      previousHash: row.previous_hash ?? '',
    });
    if (recomputed !== row.entry_hash) {
      chainOk = false;
      break;
    }
    prevHash = row.entry_hash;
  }
  check(`audit chain intact + tamper-evident (${chain.length} rows)`, chainOk);
} catch (err) {
  console.error('[verify] aborted:', err instanceof Error ? err.message : err);
  failures.push('verification aborted');
} finally {
  await sql.end({ timeout: 5 });
}

if (failures.length > 0) {
  console.error(`\n[verify] FAILED: ${failures.length} check(s)`);
  process.exit(1);
}
console.warn('\n[verify] all HK-1 checks passed ✓');
