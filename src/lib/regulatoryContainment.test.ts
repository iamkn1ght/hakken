/**
 * Regulatory containment scanner tests — Spec §10.7 + Build Pack H13-001 AC#4.
 *
 * AC#4 (verbatim): "Tests cover at minimum: any API payload containing
 * `amount`, `credit`, `yield`, `float`, `transfer`, `disburse` triggers a
 * structured rejection with error code REGULATORY_CONTAINMENT_VIOLATION."
 *
 * This suite is the canonical regulatory gate. It runs via:
 *   - `npm test`                  — full Vitest suite
 *   - `npm run test:containment`  — narrow run for CI gating
 *
 * The GitHub Actions workflow at .github/workflows/ci.yml runs
 * `test:containment` on every PR targeting `main` and on every Railway
 * deploy; failure blocks both per AC#2 and AC#3.
 */

import { describe, it, expect } from 'vitest';
import {
  BANNED_FIELD_NAMES,
  RegulatoryContainmentError,
  scanForContainmentViolations,
} from './regulatoryContainment.js';

describe('BANNED_FIELD_NAMES list (Spec §10.7 + H13-001 AC#4)', () => {
  it.each([
    // Spec §10.7 explicit set
    'amount',
    'currency',
    'funds',
    'credit',
    'yield',
    // Build Pack H13-001 AC#4 additions
    'float',
    'transfer',
    'disburse',
  ])('includes the §10.7 / AC#4 banned key "%s"', (key) => {
    expect(BANNED_FIELD_NAMES).toContain(key);
  });
});

describe('scanForContainmentViolations — flat payloads', () => {
  it.each([
    'amount',
    'credit',
    'yield',
    'float',
    'transfer',
    'disburse',
    'currency',
    'funds',
    'debit',
    'refund',
    'withdraw',
    'deposit',
    'money',
    'balance',
    'commission',
    'ledger',
  ])('flags banned top-level field "%s"', (banned) => {
    const violations = scanForContainmentViolations({ [banned]: 100 });
    expect(violations).toHaveLength(1);
    expect(violations[0]?.key).toBe(banned);
    expect(violations[0]?.path).toBe(banned);
  });

  it('flags banned fields case-insensitively', () => {
    const violations = scanForContainmentViolations({ Amount: 100, CREDIT: 'foo' });
    expect(violations).toHaveLength(2);
    expect(violations.map((v) => v.key.toLowerCase()).sort()).toEqual(['amount', 'credit']);
  });

  it('returns empty array for clean payloads', () => {
    const cleanEntity = {
      vertical: 'lunch_drop',
      entity_type: 'kitchen',
      display_name: 'Mama Grace Westlands',
      geo: { lat: -1.2641, lng: 36.8078 },
      external_ref: 'lunchdrop_kitchen_12345',
    };
    expect(scanForContainmentViolations(cleanEntity)).toEqual([]);
  });
});

describe('scanForContainmentViolations — nested payloads', () => {
  it('flags banned fields nested inside objects', () => {
    const violations = scanForContainmentViolations({
      payload: { fee: { amount: 250 } },
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]?.path).toBe('payload.fee.amount');
  });

  it('flags banned fields inside arrays of objects', () => {
    const violations = scanForContainmentViolations({
      items: [{ name: 'lunch' }, { name: 'special', credit: 200 }],
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]?.path).toBe('items.1.credit');
  });

  it('flags MULTIPLE violations in a single scan (all reported)', () => {
    const violations = scanForContainmentViolations({
      total_amount: 1, // not banned (compound key)
      amount: 200,
      breakdown: { credit: 50, yield: 0.05 },
    });
    expect(violations).toHaveLength(3);
    const paths = violations.map((v) => v.path).sort();
    expect(paths).toEqual(['amount', 'breakdown.credit', 'breakdown.yield']);
  });

  it('does not flag compound keys that merely contain banned substrings', () => {
    // Per spec, the ban is on EXACT key names. `total_amount` is not on
    // the list — it has 'amount' as a substring but the key itself is
    // distinct. (Tier marketing copy uses these elsewhere.)
    const violations = scanForContainmentViolations({
      total_amount: 100,
      credit_score: 720,
      yields_per_hour: 12,
    });
    expect(violations).toEqual([]);
  });
});

describe('scanForContainmentViolations — per-route allowlist', () => {
  it("allows 'source_payment' on /v1/entities/:id/tiers (Spec §8.3)", () => {
    const tierAssignment = {
      tier_slug: 'boosted',
      source_payment: 'kpay_tx_a1b2c3d4',
      active_from: '2026-05-10T14:30:00Z',
    };
    expect(
      scanForContainmentViolations(tierAssignment, '/v1/entities/abc-123/tiers')
    ).toEqual([]);
  });

  it("rejects 'source_payment' on any other path", () => {
    const sneaky = { source_payment: 'kpay_tx_xyz' };
    const violations = scanForContainmentViolations(sneaky, '/v1/broadcasts');
    expect(violations).toHaveLength(1);
    expect(violations[0]?.key).toBe('source_payment');
  });

  it("rejects 'source_payment' when no path is provided (apply PUBLIC default)", () => {
    expect(
      scanForContainmentViolations({ source_payment: 'kpay_tx_xyz' })
    ).toHaveLength(1);
  });
});

describe('RegulatoryContainmentError', () => {
  it('exposes code REGULATORY_CONTAINMENT_VIOLATION and statusCode 422', () => {
    const err = new RegulatoryContainmentError([{ path: 'amount', key: 'amount' }]);
    expect(err.code).toBe('REGULATORY_CONTAINMENT_VIOLATION');
    expect(err.statusCode).toBe(422);
  });

  it('mentions the first violation key in the message', () => {
    const err = new RegulatoryContainmentError([
      { path: 'payload.amount', key: 'amount' },
      { path: 'breakdown.credit', key: 'credit' },
    ]);
    expect(err.message).toMatch(/"amount"/);
    expect(err.message).toMatch(/payload\.amount/);
  });

  it('carries all violations in detail.violations', () => {
    const violations = [
      { path: 'amount', key: 'amount' },
      { path: 'credit', key: 'credit' },
    ];
    const err = new RegulatoryContainmentError(violations);
    expect(err.detail.violations).toEqual(violations);
  });
});
