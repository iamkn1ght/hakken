/**
 * Health-check business logic.
 *
 * HK-1 wires the database probe and the audit-log probe (which doubles as
 * a "migration 0002 ran" check by querying for the genesis row). All other
 * components stay `unavailable` because they are genuinely not yet wired:
 *
 *   - entities, broadcasts:  HK-2 / HK-3 (tables exist but routes don't).
 *   - kafka:                 HK-4 (identiti.consent.events consumer).
 *   - identiti:              HK-5 (JWKS + consent reads).
 *   - kipkiren_pay:          HK-3 (KP-15 analytical consumer).
 *   - todoku:                HK-7 (TD-14 event emission).
 *   - redis:                 HK-3 (cached_signals + ranking cache).
 *
 * Worst component status wins for the rolled-up `status`. `ok` is true iff
 * the rolled-up status is `healthy`.
 */

import type { Sql } from '../../db/client.js';
import type { ComponentStatus, DeepHealthResponse } from './schemas.js';

const PROBE_TIMEOUT_MS = 1500;

async function withTimeout<T>(work: Promise<T>, label: string): Promise<T> {
  return Promise.race<T>([
    work,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} probe timeout`)), PROBE_TIMEOUT_MS);
    }),
  ]);
}

async function probeDatabase(sql: Sql): Promise<ComponentStatus> {
  try {
    await withTimeout(sql`SELECT 1`, 'database');
    return 'healthy';
  } catch {
    return 'unavailable';
  }
}

async function probeAuditLog(sql: Sql): Promise<ComponentStatus> {
  try {
    // Selecting the genesis row also confirms migration 0002 ran successfully.
    const rows = await withTimeout(
      sql`SELECT 1 FROM hakken_audit.audit_log WHERE action = 'audit_log.genesis' LIMIT 1`,
      'audit_log'
    );
    return rows.length > 0 ? 'healthy' : 'degraded';
  } catch {
    return 'unavailable';
  }
}

function rollUp(components: Record<string, ComponentStatus | undefined>): ComponentStatus {
  let worst: ComponentStatus = 'healthy';
  for (const status of Object.values(components)) {
    if (status === 'unavailable') return 'unavailable';
    if (status === 'degraded') worst = 'degraded';
  }
  return worst;
}

export interface DeepHealthDeps {
  readonly sql: Sql;
}

export async function gatherDeepHealth(deps: DeepHealthDeps): Promise<DeepHealthResponse> {
  const [database, auditLogStatus] = await Promise.all([
    probeDatabase(deps.sql),
    probeAuditLog(deps.sql),
  ]);
  const components: DeepHealthResponse['components'] = {
    database,
    audit_log: auditLogStatus,
    entities: 'unavailable',
    broadcasts: 'unavailable',
    kafka: 'unavailable',
    identiti: 'unavailable',
    kipkiren_pay: 'unavailable',
    todoku: 'unavailable',
    redis: 'unavailable',
  };

  const status = rollUp(components);
  return {
    ok: status === 'healthy',
    status,
    components,
  };
}
