/**
 * auditWriter unit tests.
 *
 * Real-DB integration tests for the advisory-lock + insert path land at HK-2
 * (entity API) once a TEST_DATABASE_URL is available. At HK-1 we cover the
 * pure-function surface — canonicalJson + computeEntryHash{V1,V2} — which is
 * what the verifier and any future cross-rail audit chain reader depend on.
 */

import { describe, it, expect } from 'vitest';
import {
  AUDIT_CHAIN_LOCK_KEY,
  CURRENT_AUDIT_HASH_VERSION,
  canonicalJson,
  computeEntryHashV1,
  computeEntryHashV2,
  computeEntryHashForVersion,
} from './auditWriter.js';

describe('AUDIT_CHAIN_LOCK_KEY', () => {
  it("equals Hakken's locked advisory key 73210789", () => {
    // This value is the rail's identity in shared-infra ops. Distinct from
    // Identiti (73210123), KP (73210456), Helpan AI (7268010825743210).
    // Changing it requires a Chamia-signed Reboot Pack addendum.
    expect(AUDIT_CHAIN_LOCK_KEY).toBe(73210789n);
  });
});

describe('CURRENT_AUDIT_HASH_VERSION', () => {
  it('writes at v2 composition', () => {
    expect(CURRENT_AUDIT_HASH_VERSION).toBe(2);
  });
});

describe('canonicalJson', () => {
  it('serialises primitives identically to JSON.stringify', () => {
    expect(canonicalJson(null)).toBe('null');
    expect(canonicalJson(42)).toBe('42');
    expect(canonicalJson('x')).toBe('"x"');
    expect(canonicalJson(true)).toBe('true');
  });

  it('sorts keys deterministically regardless of insertion order', () => {
    const a = canonicalJson({ b: 1, a: 2, c: 3 });
    const b = canonicalJson({ a: 2, c: 3, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":2,"b":1,"c":3}');
  });

  it('recurses into nested objects with stable key order', () => {
    const out = canonicalJson({ outer: { z: 1, a: 2 }, top: 0 });
    expect(out).toBe('{"outer":{"a":2,"z":1},"top":0}');
  });

  it('preserves array element order verbatim', () => {
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
    expect(canonicalJson({ tags: ['c', 'a', 'b'] })).toBe('{"tags":["c","a","b"]}');
  });
});

describe('computeEntryHashV1 (genesis-row composition)', () => {
  it('is deterministic for identical inputs', () => {
    const input = {
      id: '01HZ000000000000000000HK01',
      actorId: 'hakken-rail',
      action: 'audit_log.genesis',
      previousHash: '',
    };
    expect(computeEntryHashV1(input)).toBe(computeEntryHashV1(input));
  });

  it('uses empty string for missing optional fields', () => {
    const a = computeEntryHashV1({
      id: 'x',
      actorId: 'a',
      action: 'act',
      previousHash: 'p',
    });
    const b = computeEntryHashV1({
      id: 'x',
      actorId: 'a',
      action: 'act',
      resourceId: '',
      detail: {},
      previousHash: 'p',
    });
    // Empty resourceId / empty-object detail collapse to the same hash.
    expect(a).toBe(b);
  });

  it('changes when previousHash changes (chain invariant)', () => {
    const h1 = computeEntryHashV1({
      id: 'x',
      actorId: 'a',
      action: 'act',
      previousHash: 'p1',
    });
    const h2 = computeEntryHashV1({
      id: 'x',
      actorId: 'a',
      action: 'act',
      previousHash: 'p2',
    });
    expect(h1).not.toBe(h2);
  });
});

describe('computeEntryHashV2 (current composition)', () => {
  const base = {
    id: '01HZ000000000000000000HK02',
    actorType: 'user',
    actorId: 'acct-1',
    accountUuid: 'acct-1',
    action: 'entity.create',
    resourceType: 'entity',
    resourceId: 'ent-1',
    appId: 'lunch_drop',
    requestId: 'req-1',
    traceparent: '00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01',
    outcome: 'success',
    initiatedBy: 'human',
    agentId: undefined,
    delegatedAuthorityJti: undefined,
    targetRail: undefined,
    targetOperation: undefined,
    businessOpId: 'bop-1',
    detail: { reason: 'happy-path' },
    previousHash: 'prev-hash',
  } as const;

  it('is deterministic', () => {
    expect(computeEntryHashV2(base)).toBe(computeEntryHashV2(base));
  });

  it('embeds the literal "v2" prefix — v1 row cannot collide with v2', () => {
    const v1 = computeEntryHashV1({
      id: base.id,
      actorId: base.actorId,
      action: base.action,
      resourceId: base.resourceId,
      detail: base.detail,
      previousHash: base.previousHash,
    });
    const v2 = computeEntryHashV2(base);
    expect(v1).not.toBe(v2);
  });

  it('differs when any §A.11 cross-rail field changes', () => {
    const baseHash = computeEntryHashV2(base);
    expect(computeEntryHashV2({ ...base, agentId: 'agent-1' })).not.toBe(baseHash);
    expect(
      computeEntryHashV2({ ...base, delegatedAuthorityJti: 'da-jti-1' })
    ).not.toBe(baseHash);
    expect(computeEntryHashV2({ ...base, targetRail: 'kipkiren_pay' })).not.toBe(
      baseHash
    );
    expect(computeEntryHashV2({ ...base, businessOpId: 'bop-2' })).not.toBe(baseHash);
    expect(computeEntryHashV2({ ...base, traceparent: 'other' })).not.toBe(baseHash);
  });

  it('treats null and undefined as the empty string (per stored-NULL semantics)', () => {
    const withNulls = computeEntryHashV2({
      ...base,
      agentId: null,
      delegatedAuthorityJti: null,
      targetRail: null,
      targetOperation: null,
    });
    const withUndefined = computeEntryHashV2({
      ...base,
      agentId: undefined,
      delegatedAuthorityJti: undefined,
      targetRail: undefined,
      targetOperation: undefined,
    });
    expect(withNulls).toBe(withUndefined);
  });

  it('canonicalises detail keys so reorder does not change the hash', () => {
    const a = computeEntryHashV2({ ...base, detail: { b: 2, a: 1 } });
    const b = computeEntryHashV2({ ...base, detail: { a: 1, b: 2 } });
    expect(a).toBe(b);
  });
});

describe('computeEntryHashForVersion', () => {
  const v2Input = {
    id: 'x',
    actorType: 'system',
    actorId: 'a',
    accountUuid: undefined,
    action: 'act',
    resourceType: undefined,
    resourceId: 'r',
    appId: undefined,
    requestId: 'req',
    traceparent: undefined,
    outcome: 'success',
    initiatedBy: undefined,
    agentId: undefined,
    delegatedAuthorityJti: undefined,
    targetRail: undefined,
    targetOperation: undefined,
    businessOpId: undefined,
    detail: { x: 1 },
    previousHash: 'p',
  } as const;

  it('returns the v1 hash when version=1', () => {
    const v1 = computeEntryHashV1({
      id: v2Input.id,
      actorId: v2Input.actorId,
      action: v2Input.action,
      resourceId: v2Input.resourceId,
      detail: v2Input.detail,
      previousHash: v2Input.previousHash,
    });
    expect(computeEntryHashForVersion(1, v2Input)).toBe(v1);
  });

  it('returns the v2 hash when version=2', () => {
    expect(computeEntryHashForVersion(2, v2Input)).toBe(computeEntryHashV2(v2Input));
  });
});
