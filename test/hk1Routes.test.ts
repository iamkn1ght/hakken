/**
 * HK-1 route-level tests via Fastify .inject() — no real database.
 *
 * Covers the paths that resolve before any DB access:
 *   - GET /v1/health is open (no auth).
 *   - POST /v1/apps + POST /v1/verticals reject unauthenticated / bad-token
 *     requests with 401 at the onRequest hook (H2-001 AC#2).
 *   - Schema validation returns 400 REQ_INVALID for malformed bodies.
 *   - The regulatory-containment gate returns 422
 *     REGULATORY_CONTAINMENT_VIOLATION over HTTP when a banned field is
 *     smuggled inside an additionalProperties:true object (Spec §10.7 /
 *     H13-001) — proving the gate live, not just in the unit scanner test.
 *
 * Happy-path POSTs (which write to the DB + audit chain) are proven by the
 * bootstrap seed + scripts/verifyHk1.ts against the live Supabase project,
 * not here — there is no throwaway test database and the audit chain is
 * append-only.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type { AppConfig } from '../src/config/env.js';

const ADMIN_TOKEN = 'test_admin_token_value';

function testConfig(): AppConfig {
  return {
    nodeEnv: 'test',
    logLevel: 'fatal',
    port: 0,
    serviceVersion: 'test',
    databaseUrl: 'postgres://stub',
    auth: { railPrefix: 'Hakken', timestampHeaderName: 'x-hakken-timestamp', toleranceSeconds: 300 },
    idempotency: { ttlSeconds: 86400 },
    admin: { apiToken: ADMIN_TOKEN },
    secrets: { envelopeProvider: 'noop' },
    identiti: {
      jwksUrl: 'https://identiti.co.ke/.well-known/jwks.json',
      issuer: 'https://identiti.co.ke',
      consentBase: 'https://identiti.co.ke',
    },
    hakken: { jwtAudience: 'https://hakken.co.ke' },
    kipkirenPay: { apiBase: '', analyticsHmacSecret: '', tenantAppId: 'hakken_internal' },
    todoku: { apiBase: '', hmacSecret: '', tenantAppId: 'hakken_internal' },
    kafka: { brokers: [], clientId: 'hakken-rail' },
    redis: { url: '' },
    regulatoryContainment: { enforced: true },
  };
}

// A stub DB/SQL — never invoked by the paths under test, but buildApp needs
// the decorations present when dbPlugin is skipped.
const stubDb = {} as never;
const stubSql = {} as never;

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp({
    config: testConfig(),
    overrides: { dbOverride: { db: stubDb, sql: stubSql } },
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('GET /v1/health', () => {
  it('is open and returns healthy', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, status: 'healthy' });
  });
});

describe('admin guard (H2-001 AC#2)', () => {
  const validAppBody = {
    app_slug: 'klokd',
    app_name: 'Klokd',
    vertical: 'klokd',
    sided: 'two_sided',
  };

  it('POST /v1/apps without Authorization → 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/apps', payload: validAppBody });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
  });

  it('POST /v1/apps with wrong token → 401 (even with a valid body)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/apps',
      headers: { authorization: 'Bearer wrong' },
      payload: validAppBody,
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /v1/apps with malformed Authorization → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/apps',
      headers: { authorization: ADMIN_TOKEN }, // missing "Bearer "
      payload: validAppBody,
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /v1/verticals without Authorization → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/verticals',
      payload: { vertical: 'klokd', display_name: 'Klokd', sided: 'two_sided', app_slug: 'klokd' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('schema validation (400 REQ_INVALID)', () => {
  it('rejects an app body missing required fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/apps',
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      payload: { app_slug: 'klokd' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('REQ_INVALID');
  });

  it('rejects an invalid slug pattern', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/apps',
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      payload: { app_slug: 'Bad Slug!', app_name: 'x', vertical: 'klokd', sided: 'two_sided' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an invalid enum value for a known field', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/apps',
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      payload: { app_slug: 'klokd', app_name: 'x', vertical: 'klokd', sided: 'three_sided' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('REQ_INVALID');
  });
});

describe('regulatory containment over HTTP (Spec §10.7 / H13-001)', () => {
  it('returns 422 when a banned field hides in plugin_config (additionalProperties:true)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/verticals',
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      payload: {
        vertical: 'klokd',
        display_name: 'Klokd',
        sided: 'two_sided',
        app_slug: 'klokd',
        plugin_config: { weights: { amount: 100 } },
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('REGULATORY_CONTAINMENT_VIOLATION');
    expect(res.json().error.detail.violations[0].path).toBe('plugin_config.weights.amount');
  });

  it('returns 422 for a banned top-level field (scanned pre-validation, before AJV strips it)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/apps',
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      payload: { app_slug: 'klokd', app_name: 'x', vertical: 'klokd', sided: 'two_sided', credit: 5 },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('REGULATORY_CONTAINMENT_VIOLATION');
  });
});
