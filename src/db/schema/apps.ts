/**
 * `apps` — registered consuming apps. Spec §3.2.1.
 * Bootstrapped via POST /v1/apps (H2-001).
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
} from 'drizzle-orm/pg-core';

export const apps = pgTable(
  'apps',
  {
    appId: uuid('app_id').primaryKey().default(sql`gen_random_uuid()`),
    appSlug: text('app_slug').notNull().unique(),
    appName: text('app_name').notNull(),
    vertical: text('vertical').notNull(),
    sided: text('sided').notNull(),
    status: text('status').notNull().default('provisioning'),
    rateLimitRpm: integer('rate_limit_rpm').notNull().default(600),
    webhookUrl: text('webhook_url'),
    hmacSecret: text('hmac_secret').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusActiveIdx: index('apps_status_idx')
      .on(t.status)
      .where(sql`${t.status} = 'active'`),
    sidedCheck: check(
      'apps_sided_chk',
      sql`${t.sided} IN ('one_sided', 'two_sided')`
    ),
    statusCheck: check(
      'apps_status_chk',
      sql`${t.status} IN ('provisioning', 'active', 'suspended', 'retired')`
    ),
    rateLimitCheck: check(
      'apps_rate_limit_positive_chk',
      sql`${t.rateLimitRpm} > 0`
    ),
  })
);

export type AppRow = typeof apps.$inferSelect;
export type AppInsert = typeof apps.$inferInsert;
