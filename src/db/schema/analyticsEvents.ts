/**
 * `analytics_events` — standard analytics events. Spec §3.2.9.
 */

import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  jsonb,
  timestamp,
  uuid,
  index,
  check,
} from 'drizzle-orm/pg-core';

export const analyticsEvents = pgTable(
  'analytics_events',
  {
    eventId: uuid('event_id').primaryKey().default(sql`gen_random_uuid()`),
    appId: uuid('app_id').notNull(),
    vertical: text('vertical').notNull(),
    userUuid: uuid('user_uuid'),
    eventType: text('event_type').notNull(),
    entityId: uuid('entity_id'),
    broadcastId: uuid('broadcast_id'),
    context: jsonb('context').notNull().default(sql`'{}'::jsonb`),
    requestId: text('request_id').notNull(),
    traceparent: text('traceparent'),
    businessOpId: text('business_op_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    appIdx: index('analytics_app_idx').on(t.appId, t.createdAt.desc()),
    entityIdx: index('analytics_entity_idx')
      .on(t.entityId)
      .where(sql`${t.entityId} IS NOT NULL`),
    broadcastIdx: index('analytics_broadcast_idx')
      .on(t.broadcastId)
      .where(sql`${t.broadcastId} IS NOT NULL`),
    eventTypeCheck: check(
      'analytics_events_type_chk',
      sql`${t.eventType} IN ('publish', 'consume', 'click_through', 'conversion', 'dismiss')`
    ),
  })
);

export type AnalyticsEventRow = typeof analyticsEvents.$inferSelect;
export type AnalyticsEventInsert = typeof analyticsEvents.$inferInsert;
