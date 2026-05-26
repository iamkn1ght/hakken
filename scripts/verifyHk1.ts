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
  check('2 migrations applied', migrations.length === 2);
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
