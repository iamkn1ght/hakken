/**
 * hakken_audit.audit_log writer — appends a hash-chained entry to the rail's
 * audit log.
 *
 * Hash chain invariant (Spec §10.6 + Reboot Pack v1.3 §A.11):
 *
 *     entry_hash[N]    = SHA-256( <fields per hash_version> )
 *     previous_hash[N] = entry_hash[N-1]
 *
 * Composition v1 (legacy — genesis row only):
 *   id | actor_id | action | resource_id | detail | previous_hash
 *
 * Composition v2 (current — written by every appendAuditEntry call):
 *   "v2" | id | actor_type | actor_id | account_uuid | action |
 *   resource_type | resource_id | app_id | request_id | traceparent |
 *   outcome | initiated_by | agent_id | delegated_authority_jti |
 *   target_rail | target_operation | business_op_id | detail | previous_hash
 *
 * The "v2" prefix is in the hash itself — a v2 row cannot be misinterpreted
 * as v1 even if `hash_version` is tampered. Migration 0002 seeds the chain
 * with a v1 genesis row; every later row is v2.
 *
 * Concurrency: chain integrity requires serialisation of the
 * read-latest + insert-new pair. `pg_advisory_xact_lock(AUDIT_CHAIN_LOCK_KEY)`
 * is taken inside the same transaction, so concurrent appenders queue per-
 * rail at the Postgres level. Cost is microseconds; scope is the chain only.
 *
 * AUDIT_CHAIN_LOCK_KEY is Hakken's rail identity:
 *   Identiti     : 73210123
 *   Kipkiren Pay : 73210456
 *   Helpan AI    : 7268010825743210
 *   Hakken       : 73210789  ← this rail
 */

import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { generateUlid } from '@kmv/platform-shared/ulid';
import type { Db } from '../db/client.js';

/** Postgres advisory lock key, scoped to the Hakken audit chain. */
export const AUDIT_CHAIN_LOCK_KEY = 73210789n;

export type AuditActorType = 'user' | 'agent' | 'operator' | 'system';
export type AuditOutcome = 'success' | 'failure';
export type AuditTargetRail =
  | 'kipkiren_pay'
  | 'identiti'
  | 'todoku'
  | 'helpan_ai'
  | 'itafika';

export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface AppendAuditEntryInput {
  readonly actorType: AuditActorType;
  /** Account UUID for `user` actors; agent_id for `agent`; literal for system/operator. */
  readonly actorId: string;
  readonly accountUuid?: string | undefined;
  readonly action: string;
  readonly resourceType?: string | undefined;
  readonly resourceId?: string | undefined;
  readonly appId?: string | undefined;
  readonly requestId: string;
  readonly traceparent?: string | undefined;
  readonly outcome: AuditOutcome;
  readonly detail?: Record<string, unknown> | undefined;
  readonly initiatedBy?: 'human' | 'agent' | 'system' | undefined;
  // §A.11 cross-rail audit fields. Populated where the operation is
  // agent-initiated and/or cross-rail; NULL otherwise.
  readonly agentId?: string | undefined;
  readonly delegatedAuthorityJti?: string | undefined;
  readonly targetRail?: AuditTargetRail | undefined;
  readonly targetOperation?: string | undefined;
  /** Shared cross-rail business-operation id — the §A.11 forensic join key. */
  readonly businessOpId?: string | undefined;
}

export interface AppendedAuditEntry {
  readonly id: string;
  readonly entryHash: string;
  readonly previousHash: string;
}

/**
 * Stable, sorted-keys JSON encoding. Preserves chain hashability across runs
 * even when the caller serialises detail keys in different orders.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return JSON.stringify(value);
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts: string[] = [];
  for (const k of keys) {
    parts.push(`${JSON.stringify(k)}:${canonicalJson(obj[k])}`);
  }
  return `{${parts.join(',')}}`;
}

/**
 * Hash version actively written by `appendAuditEntry`. The verifier reads
 * `hash_version` per row, so future bumps to v3 leave v2 rows verifying
 * under v2.
 */
export const CURRENT_AUDIT_HASH_VERSION = 2 as const;

export type AuditHashVersion = 1 | 2;

/** v1 composition — preserved for backward verification of the genesis row. */
export function computeEntryHashV1(parts: {
  readonly id: string;
  readonly actorId: string;
  readonly action: string;
  readonly resourceId?: string | undefined;
  readonly detail?: Record<string, unknown> | undefined;
  readonly previousHash: string;
}): string {
  const detailCanonical = canonicalJson(parts.detail ?? {});
  const input = [
    parts.id,
    parts.actorId,
    parts.action,
    parts.resourceId ?? '',
    detailCanonical,
    parts.previousHash,
  ].join('|');
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export interface V2HashInput {
  readonly id: string;
  readonly actorType: string;
  readonly actorId: string;
  readonly accountUuid?: string | null | undefined;
  readonly action: string;
  readonly resourceType?: string | null | undefined;
  readonly resourceId?: string | null | undefined;
  readonly appId?: string | null | undefined;
  readonly requestId: string;
  readonly traceparent?: string | null | undefined;
  readonly outcome: string;
  readonly initiatedBy?: string | null | undefined;
  readonly agentId?: string | null | undefined;
  readonly delegatedAuthorityJti?: string | null | undefined;
  readonly targetRail?: string | null | undefined;
  readonly targetOperation?: string | null | undefined;
  readonly businessOpId?: string | null | undefined;
  readonly detail?: Record<string, unknown> | null | undefined;
  readonly previousHash: string;
}

export function computeEntryHashV2(parts: V2HashInput): string {
  const detailCanonical = canonicalJson(parts.detail ?? {});
  const input = [
    'v2',
    parts.id,
    parts.actorType,
    parts.actorId,
    parts.accountUuid ?? '',
    parts.action,
    parts.resourceType ?? '',
    parts.resourceId ?? '',
    parts.appId ?? '',
    parts.requestId,
    parts.traceparent ?? '',
    parts.outcome,
    parts.initiatedBy ?? '',
    parts.agentId ?? '',
    parts.delegatedAuthorityJti ?? '',
    parts.targetRail ?? '',
    parts.targetOperation ?? '',
    parts.businessOpId ?? '',
    detailCanonical,
    parts.previousHash,
  ].join('|');
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export function computeEntryHashForVersion(
  version: AuditHashVersion,
  parts: V2HashInput
): string {
  if (version === 1) {
    return computeEntryHashV1({
      id: parts.id,
      actorId: parts.actorId,
      action: parts.action,
      ...(parts.resourceId !== null && parts.resourceId !== undefined
        ? { resourceId: parts.resourceId }
        : {}),
      ...(parts.detail !== null && parts.detail !== undefined
        ? { detail: parts.detail }
        : {}),
      previousHash: parts.previousHash,
    });
  }
  return computeEntryHashV2(parts);
}

interface LatestHashRow {
  readonly entry_hash: string;
}

/**
 * Append a row to `hakken_audit.audit_log`. Must be called inside a Drizzle
 * transaction (`db.transaction(async (tx) => { ... })`) so the advisory
 * lock is xact-scoped.
 */
export async function appendAuditEntry(
  tx: Tx,
  input: AppendAuditEntryInput
): Promise<AppendedAuditEntry> {
  // Serialise per-chain. Released on COMMIT/ROLLBACK.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK_KEY})`);

  const latest = (await tx.execute(
    sql`SELECT entry_hash FROM hakken_audit.audit_log ORDER BY created_at DESC, id DESC LIMIT 1`
  )) as unknown as readonly LatestHashRow[];
  if (latest.length === 0) {
    throw new Error(
      'hakken_audit.audit_log empty — genesis row missing (migration 0002 must run first)'
    );
  }
  const previousHash = latest[0]!.entry_hash;

  const id = generateUlid();
  const entryHash = computeEntryHashV2({
    id,
    actorType: input.actorType,
    actorId: input.actorId,
    accountUuid: input.accountUuid,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    appId: input.appId,
    requestId: input.requestId,
    traceparent: input.traceparent,
    outcome: input.outcome,
    initiatedBy: input.initiatedBy,
    agentId: input.agentId,
    delegatedAuthorityJti: input.delegatedAuthorityJti,
    targetRail: input.targetRail,
    targetOperation: input.targetOperation,
    businessOpId: input.businessOpId,
    detail: input.detail,
    previousHash,
  });

  const detailJson = JSON.stringify(input.detail ?? {});

  await tx.execute(sql`
    INSERT INTO hakken_audit.audit_log (
      id, app_id, actor_type, actor_id, account_uuid, action,
      resource_type, resource_id,
      agent_id, delegated_authority_jti, target_rail, target_operation,
      business_op_id,
      request_id, traceparent, outcome, detail,
      previous_hash, entry_hash, hash_version, initiated_by
    ) VALUES (
      ${id},
      ${input.appId ?? null},
      ${input.actorType},
      ${input.actorId},
      ${input.accountUuid ?? null},
      ${input.action},
      ${input.resourceType ?? null},
      ${input.resourceId ?? null},
      ${input.agentId ?? null},
      ${input.delegatedAuthorityJti ?? null},
      ${input.targetRail ?? null},
      ${input.targetOperation ?? null},
      ${input.businessOpId ?? null},
      ${input.requestId},
      ${input.traceparent ?? null},
      ${input.outcome},
      ${detailJson}::jsonb,
      ${previousHash},
      ${entryHash},
      ${CURRENT_AUDIT_HASH_VERSION},
      ${input.initiatedBy ?? null}
    )
  `);

  return { id, entryHash, previousHash };
}
