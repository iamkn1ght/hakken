/**
 * `ranking_calls` — append-only audit row per ranking call. Spec §3.2.8.
 *
 * Holds ranking-specific fields (geo, plugins_used, latency_ms, fallback)
 * that the cross-rail hash chain (hakken_audit.audit_log) does not. Every
 * row also carries the §A.11 forensic-join fields (request_id, traceparent,
 * business_op_id) so it can be joined to the audit chain.
 */

import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  uuid,
  customType,
  index,
  check,
} from 'drizzle-orm/pg-core';

const geography = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'geography(POINT, 4326)';
  },
});

const textArray = customType<{ data: string[]; driverData: string }>({
  dataType() {
    return 'text[]';
  },
});

export const rankingCalls = pgTable(
  'ranking_calls',
  {
    callId: uuid('call_id').primaryKey().default(sql`gen_random_uuid()`),
    appId: uuid('app_id').notNull(),
    vertical: text('vertical').notNull(),
    userUuid: uuid('user_uuid'),
    query: jsonb('query').notNull(),
    geo: geography('geo'),
    pluginsUsed: textArray('plugins_used').notNull().default(sql`'{}'`),
    resultsCount: integer('results_count').notNull(),
    latencyMs: integer('latency_ms').notNull(),
    consentScope: text('consent_scope').notNull(),
    fallbackActive: boolean('fallback_active').notNull().default(false),
    fallbackReason: text('fallback_reason'),
    requestId: text('request_id').notNull(),
    traceparent: text('traceparent'),
    businessOpId: text('business_op_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    appIdx: index('ranking_calls_app_idx').on(t.appId, t.createdAt.desc()),
    userIdx: index('ranking_calls_user_idx').on(t.userUuid, t.createdAt.desc()),
    verticalIdx: index('ranking_calls_vertical_idx').on(t.vertical, t.createdAt.desc()),
    consentScopeCheck: check(
      'ranking_calls_consent_scope_chk',
      sql`${t.consentScope} IN ('single_app', 'cross_app_optional', 'cross_app_required')`
    ),
    resultsNonNeg: check(
      'ranking_calls_results_non_negative',
      sql`${t.resultsCount} >= 0`
    ),
    latencyNonNeg: check(
      'ranking_calls_latency_non_negative',
      sql`${t.latencyMs} >= 0`
    ),
  })
);

export type RankingCallRow = typeof rankingCalls.$inferSelect;
export type RankingCallInsert = typeof rankingCalls.$inferInsert;
