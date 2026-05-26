/**
 * `cached_signals` — read-through signal cache for adjacent rails (KP,
 * Itafika, Identiti consent). Spec §3.2.10.
 *
 * Pattern 1 (Foundations §5.3) fallback substrate: on a live-call timeout
 * the ranking engine falls back to `cached_signals` and flags
 * `fallback_active = true` on the ranking_calls audit row.
 */

import { sql } from 'drizzle-orm';
import { pgTable, text, jsonb, timestamp, index, check } from 'drizzle-orm/pg-core';

export const cachedSignals = pgTable(
  'cached_signals',
  {
    signalKey: text('signal_key').primaryKey(),
    sourceRail: text('source_rail').notNull(),
    value: jsonb('value').notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    staleOkUntil: timestamp('stale_ok_until', { withTimezone: true }).notNull(),
  },
  (t) => ({
    expiresIdx: index('cached_signals_expires_idx').on(t.expiresAt),
    sourceIdx: index('cached_signals_source_idx').on(t.sourceRail, t.expiresAt),
    sourceRailCheck: check(
      'cached_signals_source_rail_chk',
      sql`${t.sourceRail} IN ('kipkiren_pay', 'itafika', 'identiti')`
    ),
    staleAfterExpires: check(
      'cached_signals_stale_after_expires',
      sql`${t.staleOkUntil} >= ${t.expiresAt}`
    ),
  })
);

export type CachedSignalRow = typeof cachedSignals.$inferSelect;
export type CachedSignalInsert = typeof cachedSignals.$inferInsert;
