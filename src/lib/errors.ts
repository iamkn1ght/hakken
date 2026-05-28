/**
 * RailError — a coded, HTTP-status-carrying error the errorMapper plugin
 * renders through the canonical KMV error envelope.
 *
 * errorMapper passes through any thrown value with a string `.code` and a
 * numeric `.statusCode` (see src/plugins/errorMapper.ts). RailError is the
 * structured way to raise those from service/repo code.
 *
 * Codes are SCREAMING_SNAKE_CASE, matching the rail-wide convention
 * (REQ_INVALID, INTERNAL_ERROR, NOT_FOUND already used by errorMapper).
 * Hakken's Spec §4.10 lists snake_case codes for the eventual public API;
 * those are surfaced as the `message`/`detail`, while `code` stays
 * SCREAMING_SNAKE for cross-rail tooling consistency.
 */

export class RailError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly field?: string;
  public readonly detail?: Record<string, unknown>;

  constructor(
    code: string,
    statusCode: number,
    message: string,
    opts: { field?: string; detail?: Record<string, unknown> } = {}
  ) {
    super(message);
    this.name = 'RailError';
    this.code = code;
    this.statusCode = statusCode;
    if (opts.field !== undefined) this.field = opts.field;
    if (opts.detail !== undefined) this.detail = opts.detail;
  }
}

export function unauthorized(message = 'Authentication required'): RailError {
  return new RailError('UNAUTHORIZED', 401, message);
}

export function notFound(
  code: string,
  message: string,
  detail?: Record<string, unknown>
): RailError {
  return new RailError(code, 404, message, detail ? { detail } : {});
}

export function conflict(
  code: string,
  message: string,
  detail?: Record<string, unknown>
): RailError {
  return new RailError(code, 409, message, detail ? { detail } : {});
}

export function badRequest(
  code: string,
  message: string,
  opts: { field?: string; detail?: Record<string, unknown> } = {}
): RailError {
  return new RailError(code, 400, message, opts);
}

/**
 * Postgres unique-violation SQLSTATE. postgres-js surfaces it on the thrown
 * error's `.code`. Repos use this to translate a duplicate-key insert into a
 * 409 RailError rather than leaking a 500.
 */
export const PG_UNIQUE_VIOLATION = '23505';

export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === PG_UNIQUE_VIOLATION
  );
}
