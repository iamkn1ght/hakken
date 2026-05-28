/**
 * Drizzle data-access for the verticals registry (H2-002).
 */

import { eq } from 'drizzle-orm';
import { verticals, type VerticalRow } from '../../db/schema/verticals.js';
import type { Tx } from '../../lib/auditWriter.js';

export interface InsertVerticalInput {
  vertical: string;
  displayName: string;
  sided: 'one_sided' | 'two_sided';
  appId: string;
  broadcastTypes: string[];
  rankingPlugins: string[];
  ttlDefaults: Record<string, unknown>;
  pluginConfig: Record<string, unknown>;
  schemaVersion: number;
}

export async function insertVertical(
  tx: Tx,
  input: InsertVerticalInput
): Promise<VerticalRow> {
  const rows = (await tx
    .insert(verticals)
    .values({
      vertical: input.vertical,
      displayName: input.displayName,
      sided: input.sided,
      appId: input.appId,
      broadcastTypes: input.broadcastTypes,
      rankingPlugins: input.rankingPlugins,
      ttlDefaults: input.ttlDefaults,
      pluginConfig: input.pluginConfig,
      schemaVersion: input.schemaVersion,
      status: 'active',
    })
    .returning()) as unknown as VerticalRow[];
  if (rows.length !== 1) throw new Error('insertVertical: expected exactly one row');
  return rows[0]!;
}

export async function findVertical(
  tx: Tx,
  vertical: string
): Promise<VerticalRow | null> {
  const rows = (await tx
    .select()
    .from(verticals)
    .where(eq(verticals.vertical, vertical))
    .limit(1)) as unknown as VerticalRow[];
  return rows[0] ?? null;
}
