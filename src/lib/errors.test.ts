/**
 * RailError + helper unit tests.
 */

import { describe, it, expect } from 'vitest';
import {
  RailError,
  unauthorized,
  notFound,
  conflict,
  badRequest,
  isUniqueViolation,
  PG_UNIQUE_VIOLATION,
} from './errors.js';

describe('RailError', () => {
  it('carries code, statusCode, and message', () => {
    const e = new RailError('SOME_CODE', 418, 'teapot');
    expect(e.code).toBe('SOME_CODE');
    expect(e.statusCode).toBe(418);
    expect(e.message).toBe('teapot');
    expect(e).toBeInstanceOf(Error);
  });

  it('attaches field and detail when provided', () => {
    const e = new RailError('X', 400, 'm', { field: 'foo', detail: { a: 1 } });
    expect(e.field).toBe('foo');
    expect(e.detail).toEqual({ a: 1 });
  });
});

describe('error helpers', () => {
  it('unauthorized → 401 UNAUTHORIZED', () => {
    const e = unauthorized();
    expect(e.statusCode).toBe(401);
    expect(e.code).toBe('UNAUTHORIZED');
  });

  it('notFound → 404 with detail', () => {
    const e = notFound('APP_NOT_FOUND', 'nope', { app_slug: 'x' });
    expect(e.statusCode).toBe(404);
    expect(e.code).toBe('APP_NOT_FOUND');
    expect(e.detail).toEqual({ app_slug: 'x' });
  });

  it('conflict → 409', () => {
    const e = conflict('APP_SLUG_CONFLICT', 'dup');
    expect(e.statusCode).toBe(409);
    expect(e.code).toBe('APP_SLUG_CONFLICT');
  });

  it('badRequest → 400 with field', () => {
    const e = badRequest('REQ_INVALID', 'bad', { field: 'vertical' });
    expect(e.statusCode).toBe(400);
    expect(e.field).toBe('vertical');
  });
});

describe('isUniqueViolation', () => {
  it('detects the Postgres 23505 SQLSTATE', () => {
    expect(PG_UNIQUE_VIOLATION).toBe('23505');
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
  });

  it('returns false for other shapes', () => {
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
    expect(isUniqueViolation(new Error('boom'))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation('23505')).toBe(false);
  });
});
