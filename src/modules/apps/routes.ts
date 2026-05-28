/**
 * /v1/apps routes (H2-001). Operator-only — guarded by fastify.requireAdmin.
 *
 *   POST /v1/apps         — register a consuming app. 409 on duplicate slug.
 *   GET  /v1/apps/:app_id — fetch an app (hmac_secret never returned).
 */

import type { FastifyPluginAsync } from 'fastify';
import { successResponse } from '@kmv/platform-shared/envelope';
import { notFound } from '../../lib/errors.js';
import { registerApp, getApp } from './service.js';
import {
  registerAppRequestSchema,
  registerAppResponseSchema,
  getAppResponseSchema,
  type RegisterAppBody,
} from './schemas.js';

function headerString(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

export const appsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: RegisterAppBody }>(
    '/apps',
    {
      onRequest: fastify.requireAdmin,
      schema: {
        body: registerAppRequestSchema,
        response: { 201: registerAppResponseSchema },
      },
    },
    async (request, reply) => {
      const body = request.body;
      const traceparent = headerString(request.headers['traceparent']);

      const app = await registerApp(fastify.db, {
        appSlug: body.app_slug,
        appName: body.app_name,
        vertical: body.vertical,
        sided: body.sided,
        ...(body.rate_limit_rpm !== undefined ? { rateLimitRpm: body.rate_limit_rpm } : {}),
        ...(body.webhook_url !== undefined ? { webhookUrl: body.webhook_url } : {}),
        requestId: request.requestId,
        ...(traceparent ? { traceparent } : {}),
        actorId: 'admin',
      });

      return reply.code(201).send(
        successResponse(
          {
            app_id: app.appId,
            app_slug: app.appSlug,
            app_name: app.appName,
            vertical: app.vertical,
            sided: app.sided,
            status: app.status,
            rate_limit_rpm: app.rateLimitRpm,
            hmac_secret: app.hmacSecret,
            created_at: app.createdAt.toISOString(),
          },
          request.requestId
        )
      );
    }
  );

  fastify.get<{ Params: { app_id: string } }>(
    '/apps/:app_id',
    {
      onRequest: fastify.requireAdmin,
      schema: {
        response: { 200: getAppResponseSchema },
      },
    },
    async (request) => {
      const app = await getApp(fastify.db, request.params.app_id);
      if (!app) {
        throw notFound('APP_NOT_FOUND', `App "${request.params.app_id}" not found.`);
      }
      return successResponse(
        {
          app_id: app.appId,
          app_slug: app.appSlug,
          app_name: app.appName,
          vertical: app.vertical,
          sided: app.sided,
          status: app.status,
          rate_limit_rpm: app.rateLimitRpm,
          webhook_url: app.webhookUrl,
          created_at: app.createdAt.toISOString(),
          updated_at: app.updatedAt.toISOString(),
        },
        request.requestId
      );
    }
  );
};
