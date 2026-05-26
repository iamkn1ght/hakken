/**
 * `tiers` and `entity_tiers` — merchant tier registrations + assignments.
 * Spec §3.2.5 + §3.2.6.
 */

import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  integer,
  numeric,
  jsonb,
  timestamp,
  uuid,
  index,
  check,
  unique,
  primaryKey,
} from 'drizzle-orm/pg-core';

export const tiers = pgTable(
  'tiers',
  {
    tierId: uuid('tier_id').primaryKey().default(sql`gen_random_uuid()`),
    appId: uuid('app_id').notNull(),
    tierSlug: text('tier_slug').notNull(),
    displayName: text('display_name').notNull(),
    rankingWeight: numeric('ranking_weight', { precision: 6, scale: 3 })
      .notNull()
      .default('1.000'),
    publishQuota: integer('publish_quota').notNull().default(10),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugUnique: unique('tiers_slug_unique_per_app').on(t.appId, t.tierSlug),
    rankingBounds: check(
      'tiers_ranking_weight_bounds',
      sql`${t.rankingWeight} >= 0.000 AND ${t.rankingWeight} <= 1.500`
    ),
    quotaPositive: check(
      'tiers_publish_quota_positive',
      sql`${t.publishQuota} >= 0`
    ),
  })
);

export const entityTiers = pgTable(
  'entity_tiers',
  {
    entityId: uuid('entity_id').notNull(),
    tierId: uuid('tier_id').notNull(),
    activeFrom: timestamp('active_from', { withTimezone: true }).notNull().defaultNow(),
    activeUntil: timestamp('active_until', { withTimezone: true }),
    sourcePayment: text('source_payment'),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.entityId, t.tierId, t.activeFrom] }),
    activeIdx: index('entity_tiers_active_idx').on(t.entityId, t.activeFrom.desc()),
  })
);

export type TierRow = typeof tiers.$inferSelect;
export type TierInsert = typeof tiers.$inferInsert;
export type EntityTierRow = typeof entityTiers.$inferSelect;
export type EntityTierInsert = typeof entityTiers.$inferInsert;
