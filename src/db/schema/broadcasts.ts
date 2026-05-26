/**
 * `broadcasts` — time-bounded discovery signals. Spec §3.2.4.
 */

import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
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

export const broadcasts = pgTable(
  'broadcasts',
  {
    broadcastId: uuid('broadcast_id').primaryKey().default(sql`gen_random_uuid()`),
    vertical: text('vertical').notNull(),
    appId: uuid('app_id').notNull(),
    publisherId: uuid('publisher_id').notNull(),
    broadcastType: text('broadcast_type').notNull(),
    payload: jsonb('payload').notNull(),
    geo: geography('geo').notNull(),
    geoLabel: text('geo_label'),
    verification: text('verification').notNull().default('unverified'),
    consentScope: text('consent_scope').notNull().default('single_app'),
    ttlAt: timestamp('ttl_at', { withTimezone: true }).notNull(),
    abuseState: text('abuse_state').notNull().default('clean'),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    indexedAt: timestamp('indexed_at', { withTimezone: true }),
  },
  (t) => ({
    verticalIdx: index('broadcasts_vertical_idx').on(t.vertical),
    publisherIdx: index('broadcasts_publisher_idx').on(t.publisherId),
    ttlActiveIdx: index('broadcasts_ttl_active_idx')
      .on(t.ttlAt)
      .where(sql`${t.status} = 'active'`),
    abuseIdx: index('broadcasts_abuse_idx')
      .on(t.abuseState)
      .where(sql`${t.abuseState} <> 'clean'`),
    verificationCheck: check(
      'broadcasts_verification_chk',
      sql`${t.verification} IN ('unverified', 'pending', 'verified')`
    ),
    consentScopeCheck: check(
      'broadcasts_consent_scope_chk',
      sql`${t.consentScope} IN ('single_app', 'cross_app_optional', 'cross_app_required')`
    ),
    abuseStateCheck: check(
      'broadcasts_abuse_state_chk',
      sql`${t.abuseState} IN ('clean', 'flagged', 'quarantined')`
    ),
    statusCheck: check(
      'broadcasts_status_chk',
      sql`${t.status} IN ('active', 'expired', 'revoked')`
    ),
  })
);

export type BroadcastRow = typeof broadcasts.$inferSelect;
export type BroadcastInsert = typeof broadcasts.$inferInsert;
