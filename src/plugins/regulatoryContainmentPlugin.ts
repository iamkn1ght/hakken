/**
 * Fastify plugin: runs the §10.7 / H13-001 regulatory containment scanner
 * on every request body BEFORE route handlers see it.
 *
 * Scope: protected paths only. /v1/health and /v1/health/deep are exempt
 * (they have no body). All other routes under /v1 are scanned.
 *
 * Boot-time guard: when the rail loads with
 * `REGULATORY_CONTAINMENT_ENFORCED=false`, the plugin refuses to register
 * and throws — this is the spec-mandated "test runs on every deploy;
 * failure blocks deploy" gate at the process-init layer. Local dev can opt
 * out by setting the env var explicitly to `false`, but production env
 * builds always start at `true` (default in src/config/env.ts).
 */

import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import {
  RegulatoryContainmentError,
  scanForContainmentViolations,
} from '../lib/regulatoryContainment.js';

export interface RegulatoryContainmentPluginConfig {
  readonly enforced: boolean;
  /** Paths that bypass the scanner. Defaults exempt health endpoints. */
  readonly exemptPaths?: readonly string[];
}

const DEFAULT_EXEMPT_PATHS = ['/v1/health', '/v1/health/deep'] as const;

const regulatoryContainmentPluginImpl: FastifyPluginAsync<
  RegulatoryContainmentPluginConfig
> = async (fastify, config) => {
  if (!config.enforced) {
    throw new Error(
      'REGULATORY_CONTAINMENT_ENFORCED=false at boot — Spec §10.7 / H13-001 ' +
        'requires this gate to be on in every environment that serves traffic.'
    );
  }

  const exempt = new Set(config.exemptPaths ?? DEFAULT_EXEMPT_PATHS);

  fastify.addHook('preHandler', async (request) => {
    if (exempt.has(request.url) || exempt.has(request.routerPath ?? request.url)) {
      return;
    }
    if (request.body === undefined || request.body === null) {
      return;
    }
    const violations = scanForContainmentViolations(request.body, request.url);
    if (violations.length > 0) {
      throw new RegulatoryContainmentError(violations);
    }
  });
};

export const regulatoryContainmentPlugin = fp(regulatoryContainmentPluginImpl, {
  name: 'hakken/regulatory-containment',
  fastify: '4.x',
});
