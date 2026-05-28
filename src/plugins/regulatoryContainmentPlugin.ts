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

  // preValidation runs after body parsing but BEFORE AJV validation, so we
  // scan the RAW body. This matters because the rail-wide AJV setting
  // `removeAdditional: 'failing'` would otherwise strip a banned top-level
  // field off an additionalProperties:false schema before a preHandler hook
  // could see it — silently dropping it instead of rejecting it. Scanning
  // pre-validation guarantees any banned field anywhere yields a consistent
  // 422 REGULATORY_CONTAINMENT_VIOLATION (Spec §10.7: endpoints must not
  // ACCEPT these fields, not merely strip them).
  fastify.addHook('preValidation', async (request) => {
    const path = request.url.split('?')[0] ?? request.url;
    if (exempt.has(path)) {
      return;
    }
    if (request.body === undefined || request.body === null) {
      return;
    }
    const violations = scanForContainmentViolations(request.body, path);
    if (violations.length > 0) {
      throw new RegulatoryContainmentError(violations);
    }
  });
};

export const regulatoryContainmentPlugin = fp(regulatoryContainmentPluginImpl, {
  name: 'hakken/regulatory-containment',
  fastify: '4.x',
});
