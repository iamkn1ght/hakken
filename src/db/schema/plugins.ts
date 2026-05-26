/**
 * `plugins` — registered ranking plugins. Spec §3.2.7.
 */

import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  integer,
  timestamp,
  uuid,
  index,
  check,
  unique,
} from 'drizzle-orm/pg-core';

export const plugins = pgTable(
  'plugins',
  {
    pluginId: uuid('plugin_id').primaryKey().default(sql`gen_random_uuid()`),
    vertical: text('vertical').notNull(),
    pluginSlug: text('plugin_slug').notNull(),
    version: integer('version').notNull(),
    artifactUri: text('artifact_uri').notNull(),
    latencyBudgetMs: integer('latency_budget_ms').notNull().default(50),
    status: text('status').notNull().default('staged'),
    registeredAt: timestamp('registered_at', { withTimezone: true }).notNull().defaultNow(),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
  },
  (t) => ({
    statusCheck: check(
      'plugins_status_chk',
      sql`${t.status} IN ('staged', 'active', 'rolled_back', 'retired')`
    ),
    versionPositive: check('plugins_version_positive', sql`${t.version} > 0`),
    latencyBudgetPositive: check(
      'plugins_latency_budget_positive',
      sql`${t.latencyBudgetMs} > 0`
    ),
    versionUnique: unique('plugins_unique_version').on(
      t.vertical,
      t.pluginSlug,
      t.version
    ),
    activeIdx: index('plugins_active_idx')
      .on(t.vertical, t.pluginSlug)
      .where(sql`${t.status} = 'active'`),
  })
);

export type PluginRow = typeof plugins.$inferSelect;
export type PluginInsert = typeof plugins.$inferInsert;
