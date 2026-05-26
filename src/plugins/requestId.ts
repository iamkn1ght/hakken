/**
 * Fastify plugin: ensures every reply carries a request_id ULID.
 *
 * - Reads incoming `x-request-id` if the caller provided one (consuming
 *   apps may propagate a trace-correlation id).
 * - Otherwise generates a fresh ULID via @kmv/platform-shared/ulid.
 * - Echoes it on the response and exposes it on `request.requestId`.
 *
 * Every shared envelope helper expects request_id; auditWriter requires it
 * on every entry. This plugin is registered first so all later hooks have
 * access to it.
 */

import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { generateUlid } from '@kmv/platform-shared/ulid';

declare module 'fastify' {
  interface FastifyRequest {
    requestId: string;
  }
}

const requestIdPluginImpl: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', async (request, reply) => {
    const incoming = request.headers['x-request-id'];
    const id = typeof incoming === 'string' && incoming.length > 0 ? incoming : generateUlid();
    request.requestId = id;
    reply.header('x-request-id', id);
  });
};

export const requestIdPlugin = fp(requestIdPluginImpl, {
  name: 'hakken/request-id',
  fastify: '4.x',
});
