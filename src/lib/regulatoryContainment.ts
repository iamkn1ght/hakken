/**
 * Regulatory containment scanner — Spec §10.7 + Build Pack H13-001.
 *
 * Design Law 2 (Spec §1.2): Hakken does not hold funds, does not extend
 * credit, does not aggregate yield, does not net off-ledger, does not run
 * float, does not move money. This module enforces that at the request
 * boundary by scanning incoming JSON payloads for banned field names.
 *
 * Banned field names (case-insensitive, exact match on JSON key):
 *
 *   amount, currency, funds, credit, yield, float, transfer, disburse,
 *   debit, refund, withdraw, deposit, money, balance, settlement,
 *   commission, ledger, kes_amount, usd_amount, monetary_value
 *
 * Allowed exceptions (the spec carves these out explicitly):
 *
 *   - `source_payment` — Spec §4.6 + §8.3. A KP transaction reference
 *     accompanying a tier assignment. Reference identifier only; carries
 *     no money amount.
 *
 * The scanner is RECURSIVE — it walks nested objects and arrays. A banned
 * key at any depth is a violation. Allowlist exceptions are by exact key
 * name regardless of depth.
 *
 * On violation it returns an array of `{ path, key }` records describing
 * every offending location, so the error envelope can name them all in
 * one round-trip. The Fastify plugin (src/plugins/regulatoryContainment.ts)
 * converts the first violation to a `REGULATORY_CONTAINMENT_VIOLATION`
 * 422 response.
 */

/**
 * Banned key names. These are matched case-insensitively against JSON
 * object keys. The list extends Spec §10.7's enumerated set with rail-
 * adjacent synonyms ("yield" implies "yield_rate"; "amount" alone is the
 * primary tell).
 */
export const BANNED_FIELD_NAMES: readonly string[] = Object.freeze([
  // §10.7 explicit set
  'amount',
  'currency',
  'funds',
  'credit',
  'yield',
  // Build Pack H13-001 AC#4 additions
  'float',
  'transfer',
  'disburse',
  // Rail-adjacent synonyms (Hakken Foundations §5.5 non-goals)
  'debit',
  'refund',
  'withdraw',
  'deposit',
  'money',
  'balance',
  'settlement',
  'commission',
  'ledger',
  'kes_amount',
  'usd_amount',
  'monetary_value',
  // Banned-but-carved-out. `source_payment` is a KP transaction reference
  // (Spec §4.6 + §8.3) — never a money amount — but the literal field name
  // reads as money-adjacent, so we ban it by default and grant a route-
  // specific exception via ALLOWED_FIELD_BY_PATH_PREFIX. A typo or copy-
  // paste of this field onto a non-tier route is therefore caught at
  // request time.
  'source_payment',
]);

/**
 * Per-route allowlist. The key is an exact field name; the value is the
 * route path-prefix that may carry it. A field present on a route NOT in
 * its allowlist still triggers a violation.
 *
 * Spec §10.7 carves out `source_payment` for tier assignments only.
 */
export const ALLOWED_FIELD_BY_PATH_PREFIX: Readonly<Record<string, readonly string[]>> =
  Object.freeze({
    source_payment: Object.freeze(['/v1/entities/', '/v1/tiers']),
  });

export interface ContainmentViolation {
  /** JSON-pointer-style path to the offending key, e.g. "items.0.amount". */
  readonly path: string;
  /** The matched key (preserved at original case for the error message). */
  readonly key: string;
}

const BANNED_LOWER = new Set(BANNED_FIELD_NAMES.map((n) => n.toLowerCase()));

function isAllowedOnPath(key: string, requestPath: string | undefined): boolean {
  if (requestPath === undefined) return false;
  const allowed = ALLOWED_FIELD_BY_PATH_PREFIX[key.toLowerCase()];
  if (!allowed) return false;
  return allowed.some((prefix) => requestPath.startsWith(prefix));
}

/**
 * Scan a payload for banned field names. Returns the full violation list
 * (empty array means clean). Walks both objects and arrays; objects' keys
 * are checked, array indices are not (arrays of primitives can never have
 * a banned key).
 *
 * @param value        The decoded JSON payload (typically request.body).
 * @param requestPath  The route path (e.g. `/v1/entities`), used for the
 *                     per-route allowlist. Pass undefined to apply the
 *                     allowlist's PUBLIC default (everything banned).
 */
export function scanForContainmentViolations(
  value: unknown,
  requestPath?: string
): readonly ContainmentViolation[] {
  const out: ContainmentViolation[] = [];

  function walk(v: unknown, path: string): void {
    if (v === null || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) {
        walk(v[i], path === '' ? String(i) : `${path}.${i}`);
      }
      return;
    }
    for (const [key, child] of Object.entries(v as Record<string, unknown>)) {
      if (BANNED_LOWER.has(key.toLowerCase())) {
        if (!isAllowedOnPath(key, requestPath)) {
          out.push({
            path: path === '' ? key : `${path}.${key}`,
            key,
          });
        }
      }
      walk(child, path === '' ? key : `${path}.${key}`);
    }
  }

  walk(value, '');
  return out;
}

/** Error class thrown by the Fastify plugin when scanForContainmentViolations
 *  returns a non-empty list. The errorMapper plugin renders it as the
 *  canonical `REGULATORY_CONTAINMENT_VIOLATION` error envelope. */
export class RegulatoryContainmentError extends Error {
  public readonly code = 'REGULATORY_CONTAINMENT_VIOLATION' as const;
  public readonly statusCode = 422 as const;
  public readonly detail: { violations: readonly ContainmentViolation[] };

  constructor(violations: readonly ContainmentViolation[]) {
    const first = violations[0];
    const msg = first
      ? `Regulatory containment violation: banned field "${first.key}" at "${first.path}" (Spec §10.7).`
      : 'Regulatory containment violation.';
    super(msg);
    this.name = 'RegulatoryContainmentError';
    this.detail = { violations };
  }
}
