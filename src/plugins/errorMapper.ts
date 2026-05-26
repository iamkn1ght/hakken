/**
 * Fastify plugin: maps thrown errors to the canonical ErrorEnvelope.
 * Per Reboot Pack §9.4 and Spec §4.10 standard codes list.
 *
 * Mapping rules:
 *   - Fastify validation errors (statusCode 400 + validation array) →
 *     REQ_INVALID with the first AJV failure surfaced as `field`.
 *   - RegulatoryContainmentError (Spec §10.7 / H13-001) →
 *     REGULATORY_CONTAINMENT_VIOLATION (422) with the full violations list.
 *   - Errors carrying a `.code` and `.statusCode` (RailError shape) →
 *     pass through as-is.
 *   - Anything else → INTERNAL_ERROR (500), no internal detail leaked.
 */

import type { FastifyError, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { errorResponse } from '@kmv/platform-shared/envelope';
import { generateUlid } from '@kmv/platform-shared/ulid';
import { RegulatoryContainmentError } from '../lib/regulatoryContainment.js';

interface RailError extends Error {
  code?: string;
  statusCode?: number;
  field?: string;
  detail?: Record<string, unknown>;
}

function isFastifyValidationError(err: FastifyError): boolean {
  return Array.isArray(err.validation) && err.validation.length > 0;
}

const errorMapperPluginImpl: FastifyPluginAsync = async (fastify) => {
  fastify.setErrorHandler((rawErr, request, reply) => {
    const requestId = request.requestId ?? generateUlid();

    if (rawErr instanceof RegulatoryContainmentError) {
      reply.code(rawErr.statusCode);
      return reply.send(
        errorResponse(rawErr.code, rawErr.message, requestId, {
          detail: rawErr.detail,
        })
      );
    }

    const err = rawErr as RailError & FastifyError;

    if (isFastifyValidationError(err)) {
      const first = err.validation?.[0];
      const fieldRaw =
        typeof first?.instancePath === 'string' && first.instancePath.length > 0
          ? first.instancePath.replace(/^\//, '').replace(/\//g, '.')
          : undefined;
      reply.code(400);
      return reply.send(
        errorResponse('REQ_INVALID', err.message ?? 'Request failed validation', requestId, {
          ...(fieldRaw !== undefined ? { field: fieldRaw } : {}),
          detail: { validation: err.validation },
        })
      );
    }

    if (typeof err.code === 'string' && typeof err.statusCode === 'number') {
      reply.code(err.statusCode);
      return reply.send(
        errorResponse(err.code, err.message, requestId, {
          ...(err.field !== undefined ? { field: err.field } : {}),
          ...(err.detail !== undefined ? { detail: err.detail } : {}),
        })
      );
    }

    request.log.error({ err }, 'unhandled error');
    reply.code(500);
    return reply.send(errorResponse('INTERNAL_ERROR', 'Internal server error', requestId));
  });

  fastify.setNotFoundHandler((request, reply) => {
    const requestId = request.requestId ?? generateUlid();
    reply.code(404);
    return reply.send(errorResponse('NOT_FOUND', 'Resource not found', requestId));
  });
};

export const errorMapperPlugin = fp(errorMapperPluginImpl, {
  name: 'hakken/error-mapper',
  fastify: '4.x',
});
