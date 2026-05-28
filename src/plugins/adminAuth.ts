/**
 * Fastify plugin: admin-token guard for the operator-only registration
 * endpoints (POST /v1/apps, POST /v1/verticals) — HK-1 interim auth.
 *
 * Decorates `fastify.requireAdmin`, a preHandler that routes attach
 * explicitly. It checks `Authorization: Bearer <ADMIN_API_TOKEN>` using a
 * constant-time comparison.
 *
 * Fail-closed: if ADMIN_API_TOKEN is empty in config, EVERY admin request
 * is rejected with 401 — the rail still boots and serves health + (future)
 * public endpoints, but no admin operation can run until the token is set.
 *
 * This is replaced at HK-5 by the full mTLS + HMAC signed-request chain
 * (Spec §10.1, §10.2) plus admin-scoped Identiti tokens. Until then this
 * single shared bearer is the minimum that satisfies H2-001 AC#2
 * ("requires admin-scoped token; unauthenticated requests return 401").
 */

import { timingSafeEqual } from 'node:crypto';
import type { FastifyPluginAsync, onRequestHookHandler } from 'fastify';
import fp from 'fastify-plugin';
import { unauthorized } from '../lib/errors.js';

declare module 'fastify' {
  interface FastifyInstance {
    requireAdmin: onRequestHookHandler;
  }
}

export interface AdminAuthPluginConfig {
  readonly adminApiToken: string;
}

/** Constant-time string compare that tolerates length mismatch. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) {
    // Still run a comparison to keep timing uniform, then return false.
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

const adminAuthPluginImpl: FastifyPluginAsync<AdminAuthPluginConfig> = async (
  fastify,
  config
) => {
  const expected = config.adminApiToken;

  // Runs as an onRequest hook (before validation), so an unauthenticated
  // request gets 401 regardless of body validity — H2-001 AC#2.
  const requireAdmin: onRequestHookHandler = async (request) => {
    if (expected.length === 0) {
      throw unauthorized('Admin endpoint disabled: ADMIN_API_TOKEN is not configured.');
    }
    const header = request.headers['authorization'];
    const raw = Array.isArray(header) ? header[0] : header;
    if (!raw || !raw.startsWith('Bearer ')) {
      throw unauthorized('Admin authentication required (Bearer token).');
    }
    const presented = raw.slice('Bearer '.length);
    if (!safeEqual(presented, expected)) {
      throw unauthorized('Invalid admin token.');
    }
  };

  fastify.decorate('requireAdmin', requireAdmin);
};

export const adminAuthPlugin = fp(adminAuthPluginImpl, {
  name: 'hakken/admin-auth',
  fastify: '4.x',
});
