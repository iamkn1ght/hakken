/**
 * Drizzle data-access for the apps registry (H2-001).
 * Functions take a `Tx` so registration + audit commit atomically.
 */

import { eq } from 'drizzle-orm';
import { apps, type AppRow } from '../../db/schema/apps.js';
import type { Tx } from '../../lib/auditWriter.js';

export interface InsertAppInput {
  appSlug: string;
  appName: string;
  vertical: string;
  sided: 'one_sided' | 'two_sided';
  status: string;
  rateLimitRpm: number;
  webhookUrl?: string | null;
  hmacSecret: string;
}

export async function insertApp(tx: Tx, input: InsertAppInput): Promise<AppRow> {
  const rows = (await tx
    .insert(apps)
    .values({
      appSlug: input.appSlug,
      appName: input.appName,
      vertical: input.vertical,
      sided: input.sided,
      status: input.status,
      rateLimitRpm: input.rateLimitRpm,
      webhookUrl: input.webhookUrl ?? null,
      hmacSecret: input.hmacSecret,
    })
    .returning()) as unknown as AppRow[];
  if (rows.length !== 1) throw new Error('insertApp: expected exactly one row');
  return rows[0]!;
}

export async function findAppById(tx: Tx, appId: string): Promise<AppRow | null> {
  const rows = (await tx
    .select()
    .from(apps)
    .where(eq(apps.appId, appId))
    .limit(1)) as unknown as AppRow[];
  return rows[0] ?? null;
}

export async function findAppBySlug(tx: Tx, appSlug: string): Promise<AppRow | null> {
  const rows = (await tx
    .select()
    .from(apps)
    .where(eq(apps.appSlug, appSlug))
    .limit(1)) as unknown as AppRow[];
  return rows[0] ?? null;
}
