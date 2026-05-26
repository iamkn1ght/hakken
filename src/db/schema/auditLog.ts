/**
 * `hakken_audit.audit_log` — append-only, hash-chained, 7-year retention.
 * Migration 0002 + Spec §3.3 + Reboot Pack v1.3 §A.11.
 *
 * Tamper-evident: each row's entry_hash composes v2 = SHA-256(
 *   "v2" | id | actor_type | actor_id | account_uuid | action |
 *   resource_type | resource_id | app_id | request_id | traceparent |
 *   outcome | initiated_by | agent_id | delegated_authority_jti |
 *   target_rail | target_operation | business_op_id | detail | previous_hash
 * ).
 *
 * Chain serialised via pg_advisory_xact_lock(73210789) — Hakken's rail-
 * specific advisory lock key. See src/lib/auditWriter.ts.
 *
 * RLS + REVOKE UPDATE/DELETE + a defence-in-depth trigger make this table
 * append-only at the database layer. Spec §10.6.
 */

import { sql } from 'drizzle-orm';
import {
  pgSchema,
  text,
  jsonb,
  timestamp,
  inet,
  smallint,
  index,
  check,
} from 'drizzle-orm/pg-core';

export const hakkenAuditSchema = pgSchema('hakken_audit');

export const auditLog = hakkenAuditSchema.table(
  'audit_log',
  {
    id: text('id').primaryKey(),
    appId: text('app_id'),
    actorType: text('actor_type').notNull(),
    actorId: text('actor_id').notNull(),
    agentId: text('agent_id'),
    delegatedAuthorityJti: text('delegated_authority_jti'),
    initiatedBy: text('initiated_by'),
    accountUuid: text('account_uuid'),
    action: text('action').notNull(),
    resourceType: text('resource_type'),
    resourceId: text('resource_id'),
    targetRail: text('target_rail'),
    targetOperation: text('target_operation'),
    requestId: text('request_id').notNull(),
    traceparent: text('traceparent'),
    businessOpId: text('business_op_id'),
    ipAddress: inet('ip_address'),
    outcome: text('outcome').notNull(),
    detail: jsonb('detail'),
    previousHash: text('previous_hash'),
    entryHash: text('entry_hash').notNull(),
    hashVersion: smallint('hash_version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    appCreatedIdx: index('audit_log_app_id_created_at_idx').on(t.appId, t.createdAt.desc()),
    accountCreatedIdx: index('audit_log_account_uuid_created_at_idx').on(
      t.accountUuid,
      t.createdAt.desc()
    ),
    agentCreatedIdx: index('audit_log_agent_id_created_at_idx')
      .on(t.agentId, t.createdAt.desc())
      .where(sql`${t.agentId} IS NOT NULL`),
    daaCreatedIdx: index('audit_log_daa_jti_created_at_idx')
      .on(t.delegatedAuthorityJti, t.createdAt.desc())
      .where(sql`${t.delegatedAuthorityJti} IS NOT NULL`),
    actionCreatedIdx: index('audit_log_action_created_at_idx').on(
      t.action,
      t.createdAt.desc()
    ),
    railOpCreatedIdx: index('audit_log_rail_op_created_at_idx')
      .on(t.targetRail, t.targetOperation, t.createdAt.desc())
      .where(sql`${t.targetRail} IS NOT NULL`),
    businessOpIdx: index('audit_log_business_op_idx')
      .on(t.businessOpId)
      .where(sql`${t.businessOpId} IS NOT NULL`),
    actorTypeCheck: check(
      'audit_log_actor_type_chk',
      sql`${t.actorType} IN ('user', 'agent', 'operator', 'system')`
    ),
    initiatedByCheck: check(
      'audit_log_initiated_by_chk',
      sql`${t.initiatedBy} IS NULL OR ${t.initiatedBy} IN ('human', 'agent', 'system')`
    ),
    outcomeCheck: check(
      'audit_log_outcome_chk',
      sql`${t.outcome} IN ('success', 'failure')`
    ),
    hashVersionCheck: check(
      'audit_log_hash_version_chk',
      sql`${t.hashVersion} IN (1, 2)`
    ),
    targetRailCheck: check(
      'audit_log_target_rail_chk',
      sql`${t.targetRail} IS NULL OR ${t.targetRail} IN (
        'kipkiren_pay', 'identiti', 'todoku', 'helpan_ai', 'itafika'
      )`
    ),
  })
);

export type AuditLogRow = typeof auditLog.$inferSelect;
export type AuditLogInsert = typeof auditLog.$inferInsert;
