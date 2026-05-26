/**
 * Fastify app factory. Exported separately from the entrypoint so tests can
 * build the app via `buildApp(...)` and exercise it with `.inject()` without
 * binding a port.
 *
 * HK-1 plugin registration order:
 *   1. requestId            — every other hook reads request.requestId.
 *   2. errorMapper          — installs setErrorHandler / setNotFoundHandler.
 *   3. db                   — decorates app.db / app.sql (skipped if
 *                              dbOverride supplied).
 *   4. regulatoryContainment — preHandler that rejects payloads with banned
 *                              field names (Spec §10.7 / H13-001).
 *   5. routes (under /v1)   — health only at HK-1; HK-2 adds entities, HK-3
 *                              adds broadcasts + ranking + consent, etc.
 *
 * Customer-JWT, HMAC, idempotency, and RLS context plugins all land at HK-5
 * once the Identiti integration is wired. HK-1 keeps the surface deliberately
 * minimal — foundation only.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';

import type { AppConfig } from './config/env.js';
import type { Db, Sql } from './db/client.js';
import { dbPlugin } from './plugins/db.js';
import { errorMapperPlugin } from './plugins/errorMapper.js';
import { requestIdPlugin } from './plugins/requestId.js';
import { regulatoryContainmentPlugin } from './plugins/regulatoryContainmentPlugin.js';
import { healthRoutes } from './modules/health/routes.js';

export interface BuildAppOverrides {
  /** Skip dbPlugin and use these instead (for integration tests). */
  readonly dbOverride?: { db: Db; sql: Sql };
}

export interface BuildAppOptions {
  readonly config: AppConfig;
  readonly overrides?: BuildAppOverrides;
}

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const { config, overrides } = opts;

  const app = Fastify({
    logger: {
      level: config.logLevel,
      serializers: {
        req(req) {
          return {
            method: req.method,
            url: req.url,
            requestId: (req.raw as unknown as { requestId?: string }).requestId,
          };
        },
      },
    },
    disableRequestLogging: false,
    ajv: {
      customOptions: {
        strict: 'log',
        removeAdditional: 'failing',
        useDefaults: true,
        // Rail-wide pin from Todoku TD-0: coerceTypes is false everywhere so
        // a numeric string in a numeric field never silently becomes a number.
        coerceTypes: false,
      },
    },
  });

  await app.register(sensible);
  await app.register(requestIdPlugin);
  await app.register(errorMapperPlugin);

  if (overrides?.dbOverride) {
    app.decorate('db', overrides.dbOverride.db);
    app.decorate('sql', overrides.dbOverride.sql);
  } else {
    await app.register(dbPlugin, { connectionString: config.databaseUrl });
  }

  // Spec §10.7 / H13-001 — must be in place before any business handler
  // can read request.body. Throws at register-time if enforcement is off.
  await app.register(regulatoryContainmentPlugin, {
    enforced: config.regulatoryContainment.enforced,
  });

  await app.register(
    async (v1) => {
      await v1.register(healthRoutes, { serviceVersion: config.serviceVersion });
    },
    { prefix: '/v1' }
  );

  return app;
}
