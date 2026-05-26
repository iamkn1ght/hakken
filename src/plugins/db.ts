/**
 * Fastify plugin: decorates the app with the rail's Drizzle client.
 *
 * HK-1 attaches `app.db` (Drizzle) and `app.sql` (raw postgres-js handle,
 * for the `SELECT 1` health probe and any future raw-SQL needs).
 * Per-transaction RLS context decorators land at HK-2 (entity writes) and
 * HK-3 (consent-filter cache invalidations).
 */

import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { getOrCreateDbClient, type Db, type Sql } from '../db/client.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    sql: Sql;
  }
}

export interface DbPluginConfig {
  readonly connectionString: string;
}

const dbPluginImpl: FastifyPluginAsync<DbPluginConfig> = async (fastify, config) => {
  const { db, sql } = getOrCreateDbClient({ connectionString: config.connectionString });

  fastify.decorate('db', db);
  fastify.decorate('sql', sql);

  fastify.addHook('onClose', async () => {
    await sql.end({ timeout: 5 });
  });
};

export const dbPlugin = fp(dbPluginImpl, {
  name: 'hakken/db',
  fastify: '4.x',
});
