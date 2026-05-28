/**
 * `verticals` — registered discovery verticals. Spec §3.2.2.
 * Bootstrapped via POST /v1/verticals (H2-002).
 */

import { sql } from 'drizzle-orm';
import { pgTable, text, integer, jsonb, timestamp, uuid, index, check } from 'drizzle-orm/pg-core';

export const verticals = pgTable(
  'verticals',
  {
    vertical: text('vertical').primaryKey(),
    displayName: text('display_name').notNull(),
    sided: text('sided').notNull(),
    broadcastTypes: jsonb('broadcast_types').notNull().default(sql`'[]'::jsonb`),
    rankingPlugins: jsonb('ranking_plugins').notNull().default(sql`'[]'::jsonb`),
    ttlDefaults: jsonb('ttl_defaults').notNull().default(sql`'{}'::jsonb`),
    // Added by migration 0003 (H2-002).
    appId: uuid('app_id'),
    pluginConfig: jsonb('plugin_config').notNull().default(sql`'{}'::jsonb`),
    schemaVersion: integer('schema_version').notNull().default(1),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    appIdx: index('verticals_app_idx')
      .on(t.appId)
      .where(sql`${t.appId} IS NOT NULL`),
    sidedCheck: check(
      'verticals_sided_chk',
      sql`${t.sided} IN ('one_sided', 'two_sided')`
    ),
    statusCheck: check(
      'verticals_status_chk',
      sql`${t.status} IN ('active', 'suspended', 'retired')`
    ),
    schemaVersionPositive: check(
      'verticals_schema_version_positive',
      sql`${t.schemaVersion} > 0`
    ),
  })
);

export type VerticalRow = typeof verticals.$inferSelect;
export type VerticalInsert = typeof verticals.$inferInsert;
