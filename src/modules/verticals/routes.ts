/**
 * /v1/verticals routes (H2-002). Operator-only — fastify.requireAdmin.
 *
 *   POST /v1/verticals          — register a vertical linked to an app.
 *                                  404 if the app is unregistered.
 *   GET  /v1/verticals/:vertical — fetch a vertical.
 */

import type { FastifyPluginAsync } from 'fastify';
import { successResponse } from '@kmv/platform-shared/envelope';
import { notFound } from '../../lib/errors.js';
import type { VerticalRow } from '../../db/schema/verticals.js';
import { registerVertical, getVertical } from './service.js';
import {
  registerVerticalRequestSchema,
  registerVerticalResponseSchema,
  getVerticalResponseSchema,
  type RegisterVerticalBody,
} from './schemas.js';

function headerString(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

function present(v: VerticalRow): Record<string, unknown> {
  return {
    vertical: v.vertical,
    display_name: v.displayName,
    sided: v.sided,
    app_id: v.appId,
    status: v.status,
    schema_version: v.schemaVersion,
    broadcast_types: v.broadcastTypes,
    ranking_plugins: v.rankingPlugins,
    ttl_defaults: v.ttlDefaults,
    plugin_config: v.pluginConfig,
    created_at: v.createdAt.toISOString(),
  };
}

export const verticalsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: RegisterVerticalBody }>(
    '/verticals',
    {
      onRequest: fastify.requireAdmin,
      schema: {
        body: registerVerticalRequestSchema,
        response: { 201: registerVerticalResponseSchema },
      },
    },
    async (request, reply) => {
      const body = request.body;
      const traceparent = headerString(request.headers['traceparent']);

      const vertical = await registerVertical(fastify.db, {
        vertical: body.vertical,
        displayName: body.display_name,
        sided: body.sided,
        appSlug: body.app_slug,
        ...(body.broadcast_types !== undefined ? { broadcastTypes: body.broadcast_types } : {}),
        ...(body.ranking_plugins !== undefined ? { rankingPlugins: body.ranking_plugins } : {}),
        ...(body.ttl_defaults !== undefined ? { ttlDefaults: body.ttl_defaults } : {}),
        ...(body.plugin_config !== undefined ? { pluginConfig: body.plugin_config } : {}),
        ...(body.schema_version !== undefined ? { schemaVersion: body.schema_version } : {}),
        requestId: request.requestId,
        ...(traceparent ? { traceparent } : {}),
        actorId: 'admin',
      });

      return reply.code(201).send(successResponse(present(vertical), request.requestId));
    }
  );

  fastify.get<{ Params: { vertical: string } }>(
    '/verticals/:vertical',
    {
      onRequest: fastify.requireAdmin,
      schema: {
        response: { 200: getVerticalResponseSchema },
      },
    },
    async (request) => {
      const vertical = await getVertical(fastify.db, request.params.vertical);
      if (!vertical) {
        throw notFound('VERTICAL_NOT_FOUND', `Vertical "${request.params.vertical}" not found.`);
      }
      return successResponse(present(vertical), request.requestId);
    }
  );
};
