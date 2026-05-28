/**
 * App registration service (H2-001).
 *
 * Registration runs in one transaction:
 *   1. insert the apps row (server-generated hmac_secret)
 *   2. append an audit-log entry (action admin.app.register)
 * If the app_slug already exists, the unique index raises 23505 and we
 * translate it to a 409 APP_SLUG_CONFLICT (Spec §4.10 external_ref_conflict
 * analogue for the app namespace).
 *
 * hmac_secret is generated here and returned to the caller exactly once.
 * It is the per-app shared secret used to sign requests (Spec §10.2). It is
 * never returned by GET — losing it means re-registering.
 */

import { randomBytes } from 'node:crypto';
import type { Db } from '../../db/client.js';
import type { AppRow } from '../../db/schema/apps.js';
import { appendAuditEntry } from '../../lib/auditWriter.js';
import { conflict, isUniqueViolation } from '../../lib/errors.js';
import { insertApp, findAppById } from './repo.js';

const DEFAULT_RATE_LIMIT_RPM = 600;

export interface RegisterAppInput {
  appSlug: string;
  appName: string;
  vertical: string;
  sided: 'one_sided' | 'two_sided';
  rateLimitRpm?: number;
  webhookUrl?: string;
  requestId: string;
  traceparent?: string;
  /** Operator identity from the admin token context (HK-1: literal 'admin'). */
  actorId: string;
}

export interface RegisteredApp {
  appId: string;
  appSlug: string;
  appName: string;
  vertical: string;
  sided: string;
  status: string;
  rateLimitRpm: number;
  hmacSecret: string;
  createdAt: Date;
}

function generateHmacSecret(): string {
  // 32 bytes → 64 hex chars. Matches the per-app shared-secret strength
  // used by the other rails' app_credentials.
  return `hak_sk_${randomBytes(32).toString('hex')}`;
}

export async function registerApp(
  db: Db,
  input: RegisterAppInput
): Promise<RegisteredApp> {
  const hmacSecret = generateHmacSecret();
  const rateLimitRpm = input.rateLimitRpm ?? DEFAULT_RATE_LIMIT_RPM;

  try {
    return await db.transaction(async (tx) => {
      const app = await insertApp(tx, {
        appSlug: input.appSlug,
        appName: input.appName,
        vertical: input.vertical,
        sided: input.sided,
        status: 'provisioning',
        rateLimitRpm,
        webhookUrl: input.webhookUrl ?? null,
        hmacSecret,
      });

      await appendAuditEntry(tx, {
        actorType: 'operator',
        actorId: input.actorId,
        action: 'admin.app.register',
        resourceType: 'app',
        resourceId: app.appId,
        appId: app.appSlug,
        requestId: input.requestId,
        ...(input.traceparent ? { traceparent: input.traceparent } : {}),
        outcome: 'success',
        initiatedBy: 'human',
        businessOpId: app.appId,
        detail: {
          app_slug: app.appSlug,
          vertical: app.vertical,
          sided: app.sided,
        },
      });

      return {
        appId: app.appId,
        appSlug: app.appSlug,
        appName: app.appName,
        vertical: app.vertical,
        sided: app.sided,
        status: app.status,
        rateLimitRpm: app.rateLimitRpm,
        hmacSecret,
        createdAt: app.createdAt,
      };
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw conflict('APP_SLUG_CONFLICT', `App slug "${input.appSlug}" is already registered.`, {
        app_slug: input.appSlug,
      });
    }
    throw err;
  }
}

export async function getApp(db: Db, appId: string): Promise<AppRow | null> {
  return db.transaction((tx) => findAppById(tx, appId));
}
