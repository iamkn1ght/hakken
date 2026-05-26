/**
 * Health routes.
 *
 *   GET /v1/health       — unauthenticated liveness; on the regulatory-
 *                          containment plugin's exempt-paths list.
 *   GET /v1/health/deep  — aggregates downstream component probes. HK-1
 *                          reports `healthy` only for `database` and
 *                          `audit_log`; everything else is `unavailable`
 *                          until its build sprint lands (see service.ts).
 *
 * Health endpoints bypass the success-envelope wrapper because load
 * balancers, Railway probes, and Cloudflare health checks need a stable,
 * envelope-free shape.
 */

import type { FastifyPluginAsync } from 'fastify';
import { gatherDeepHealth } from './service.js';
import {
  deepHealthResponseSchema,
  healthResponseSchema,
  type HealthResponse,
} from './schemas.js';

export interface HealthRouteConfig {
  readonly serviceVersion: string;
}

export const healthRoutes: FastifyPluginAsync<HealthRouteConfig> = async (
  fastify,
  config
) => {
  fastify.get(
    '/health',
    {
      schema: {
        response: { 200: healthResponseSchema },
      },
    },
    async (): Promise<HealthResponse> => ({
      ok: true,
      status: 'healthy',
      version: config.serviceVersion,
    })
  );

  fastify.get(
    '/health/deep',
    {
      schema: {
        response: { 200: deepHealthResponseSchema },
      },
    },
    async (request) => {
      return gatherDeepHealth({
        sql: request.server.sql,
      });
    }
  );
};
