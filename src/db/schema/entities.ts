/**
 * `entities` — geo-indexed entity registry. Spec §3.2.3.
 *
 * The `geo` column is GEOGRAPHY(POINT, 4326). Drizzle doesn't ship a native
 * PostGIS column type, so we declare it as `customType` over raw SQL — reads
 * return the WKB hex string, writes accept either WKT (ST_GeogFromText) or
 * raw lat/lng tuples constructed via ST_MakePoint(lng, lat). Repos consuming
 * `entities` are expected to bracket reads/writes with the appropriate
 * PostGIS expression.
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
  unique,
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

export const entities = pgTable(
  'entities',
  {
    entityId: uuid('entity_id').primaryKey().default(sql`gen_random_uuid()`),
    vertical: text('vertical').notNull(),
    appId: uuid('app_id').notNull(),
    entityType: text('entity_type').notNull(),
    displayName: text('display_name').notNull(),
    roleFlags: textArray('role_flags').notNull().default(sql`'{}'`),
    geo: geography('geo').notNull(),
    geoLabel: text('geo_label'),
    verification: text('verification').notNull().default('unverified'),
    fulfilmentPaths: jsonb('fulfilment_paths').notNull().default(sql`'[]'::jsonb`),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    externalRef: text('external_ref'),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    verticalIdx: index('entities_vertical_idx').on(t.vertical),
    appIdx: index('entities_app_idx').on(t.appId),
    verificationIdx: index('entities_verification_idx').on(t.verification),
    statusIdx: index('entities_status_idx').on(t.status),
    externalRefUnique: unique('entities_external_ref_unique').on(t.appId, t.externalRef),
    verificationCheck: check(
      'entities_verification_chk',
      sql`${t.verification} IN ('unverified', 'pending', 'verified', 'rejected')`
    ),
    statusCheck: check(
      'entities_status_chk',
      sql`${t.status} IN ('active', 'suspended', 'retired')`
    ),
    entityTypeCheck: check(
      'entities_entity_type_chk',
      sql`${t.entityType} IN ('kitchen', 'venue', 'employer', 'worker', 'cooperative', 'fulfilment_provider')`
    ),
  })
);

export type EntityRow = typeof entities.$inferSelect;
export type EntityInsert = typeof entities.$inferInsert;
