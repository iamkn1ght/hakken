/**
 * Vertical registration service (H2-002).
 *
 * Flow (one transaction):
 *   1. resolve app_slug → app row; 404 VERTICAL_APP_NOT_FOUND if absent
 *      (H2-002 AC#4).
 *   2. insert the verticals row linked to that app (H2-002 AC#1, AC#3).
 *   3. append an audit-log entry (action admin.vertical.register).
 * Duplicate vertical PK → 409 VERTICAL_CONFLICT.
 */

import type { Db } from '../../db/client.js';
import type { VerticalRow } from '../../db/schema/verticals.js';
import { appendAuditEntry } from '../../lib/auditWriter.js';
import { conflict, notFound, isUniqueViolation } from '../../lib/errors.js';
import { findAppBySlug } from '../apps/repo.js';
import { insertVertical, findVertical } from './repo.js';

export interface RegisterVerticalInput {
  vertical: string;
  displayName: string;
  sided: 'one_sided' | 'two_sided';
  appSlug: string;
  broadcastTypes?: string[];
  rankingPlugins?: string[];
  ttlDefaults?: Record<string, unknown>;
  pluginConfig?: Record<string, unknown>;
  schemaVersion?: number;
  requestId: string;
  traceparent?: string;
  actorId: string;
}

export async function registerVertical(
  db: Db,
  input: RegisterVerticalInput
): Promise<VerticalRow> {
  try {
    return await db.transaction(async (tx) => {
      const app = await findAppBySlug(tx, input.appSlug);
      if (!app) {
        throw notFound(
          'VERTICAL_APP_NOT_FOUND',
          `Cannot register vertical "${input.vertical}": app "${input.appSlug}" is not registered.`,
          { app_slug: input.appSlug }
        );
      }

      const vertical = await insertVertical(tx, {
        vertical: input.vertical,
        displayName: input.displayName,
        sided: input.sided,
        appId: app.appId,
        broadcastTypes: input.broadcastTypes ?? [],
        rankingPlugins: input.rankingPlugins ?? [],
        ttlDefaults: input.ttlDefaults ?? {},
        pluginConfig: input.pluginConfig ?? {},
        schemaVersion: input.schemaVersion ?? 1,
      });

      await appendAuditEntry(tx, {
        actorType: 'operator',
        actorId: input.actorId,
        action: 'admin.vertical.register',
        resourceType: 'vertical',
        resourceId: vertical.vertical,
        appId: app.appSlug,
        requestId: input.requestId,
        ...(input.traceparent ? { traceparent: input.traceparent } : {}),
        outcome: 'success',
        initiatedBy: 'human',
        businessOpId: vertical.vertical,
        detail: {
          vertical: vertical.vertical,
          sided: vertical.sided,
          app_slug: app.appSlug,
          schema_version: vertical.schemaVersion,
        },
      });

      return vertical;
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw conflict(
        'VERTICAL_CONFLICT',
        `Vertical "${input.vertical}" is already registered.`,
        { vertical: input.vertical }
      );
    }
    throw err;
  }
}

export async function getVertical(db: Db, vertical: string): Promise<VerticalRow | null> {
  return db.transaction((tx) => findVertical(tx, vertical));
}
