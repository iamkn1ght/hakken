/**
 * `verticals` — registered discovery verticals. Spec §3.2.2.
 * Bootstrapped via POST /v1/verticals (H2-002).
 */

import { sql } from 'drizzle-orm';
import { pgTable, text, jsonb, timestamp, check } from 'drizzle-orm/pg-core';

export const verticals = pgTable(
  'verticals',
  {
    vertical: text('vertical').primaryKey(),
    displayName: text('display_name').notNull(),
    sided: text('sided').notNull(),
    broadcastTypes: jsonb('broadcast_types').notNull().default(sql`'[]'::jsonb`),
    rankingPlugins: jsonb('ranking_plugins').notNull().default(sql`'[]'::jsonb`),
    ttlDefaults: jsonb('ttl_defaults').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sidedCheck: check(
      'verticals_sided_chk',
      sql`${t.sided} IN ('one_sided', 'two_sided')`
    ),
  })
);

export type VerticalRow = typeof verticals.$inferSelect;
export type VerticalInsert = typeof verticals.$inferInsert;
