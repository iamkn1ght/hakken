/**
 * Validated environment loader.
 * Throws synchronously at startup when required env vars are missing or
 * malformed — the rail must not boot in a partially-configured state.
 *
 * Loaded once via `loadConfig()`; subsequent calls return the same frozen
 * object. Fastify plugins read from this rather than from process.env
 * directly.
 */

export type SecretsEnvelopeProvider = 'noop' | 'kms' | 'supabase-vault';

export interface AppConfig {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  readonly port: number;
  readonly serviceVersion: string;

  readonly databaseUrl: string;

  readonly auth: {
    /** Literal value sent in the Authorization header: 'Hakken-HMAC-SHA256 ...'. */
    readonly railPrefix: 'Hakken';
    readonly timestampHeaderName: string;
    readonly toleranceSeconds: number;
  };

  readonly idempotency: {
    readonly ttlSeconds: number;
  };

  readonly secrets: {
    readonly envelopeProvider: SecretsEnvelopeProvider;
  };

  /**
   * Identiti integration. Hakken is a relying party for Identiti's customer
   * JWT (BearerCustomer), and reads `GET /v1/consent/:account_uuid` for
   * cross-app consent filtering at HK-3. Phase 2 (`SCOPE_DEGRADED` webhook)
   * lands at HK-4 as the Kafka consent-events consumer.
   */
  readonly identiti: {
    readonly jwksUrl: string;
    readonly issuer: string;
    readonly consentBase: string;
  };

  /** Audience claim Hakken expects on incoming user JWTs. */
  readonly hakken: {
    readonly jwtAudience: string;
  };

  /**
   * Kipkiren Pay analytical surface (KP-15 / SC-1). Empty `hmacSecret`
   * disables the analytical consumer — used in dev/test before KP-15 v1.1
   * mat-views are wired. Required for HK-3 onward.
   */
  readonly kipkirenPay: {
    readonly apiBase: string;
    readonly analyticsHmacSecret: string;
    readonly tenantAppId: string;
  };

  /**
   * Todoku event emission (TD-14). Hakken POSTs hakken.* events as the
   * `hakken_internal` tenant. Empty `hmacSecret` disables emission — the
   * outbox still records events; delivery is deferred until the secret
   * lands.
   */
  readonly todoku: {
    readonly apiBase: string;
    readonly hmacSecret: string;
    readonly tenantAppId: string;
  };

  /**
   * Kafka consumer config for `identiti.consent.events` (HK-4). Empty
   * `brokers` → no consumer; consent cache lives on its 60s TTL only.
   */
  readonly kafka: {
    readonly brokers: readonly string[];
    readonly clientId: string;
  };

  /** Redis URL for ranking cache + cached_signals. Empty → in-memory. */
  readonly redis: {
    readonly url: string;
  };

  /**
   * Regulatory containment toggle (H13-001 / Spec §10.7).
   * True in every environment that ever serves traffic. Setting false makes
   * the app refuse to boot — the assertion-on-init pattern Helpan uses
   * elsewhere.
   */
  readonly regulatoryContainment: {
    readonly enforced: boolean;
  };
}

let cached: AppConfig | undefined;

function required(name: string): string {
  const v = process.env[name];
  if (v === undefined || v === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

function optional(name: string): string | undefined {
  const v = process.env[name];
  return v === undefined || v === '' ? undefined : v;
}

function intInRange(name: string, raw: string, min: number, max: number): number {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new Error(`${name} must be an integer in [${min}, ${max}]; got "${raw}"`);
  }
  return n;
}

function asNodeEnv(raw: string): AppConfig['nodeEnv'] {
  if (raw === 'development' || raw === 'test' || raw === 'production') return raw;
  throw new Error(`NODE_ENV must be one of development|test|production; got "${raw}"`);
}

function asLogLevel(raw: string | undefined): AppConfig['logLevel'] {
  const v = raw ?? 'info';
  if (
    v === 'fatal' ||
    v === 'error' ||
    v === 'warn' ||
    v === 'info' ||
    v === 'debug' ||
    v === 'trace'
  ) {
    return v;
  }
  throw new Error(`LOG_LEVEL must be one of fatal|error|warn|info|debug|trace; got "${v}"`);
}

function asEnvelopeProvider(raw: string | undefined): SecretsEnvelopeProvider {
  const v = raw ?? 'noop';
  if (v === 'noop' || v === 'kms' || v === 'supabase-vault') return v;
  throw new Error(
    `SECRETS_ENVELOPE_PROVIDER must be one of noop|kms|supabase-vault; got "${v}"`
  );
}

function parseBrokerList(raw: string | undefined): readonly string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function asHttpsUrl(name: string, raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${name} must be a valid URL; got "${raw}"`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`${name} must be an http(s) URL; got "${raw}"`);
  }
  return raw;
}

function asBool(name: string, raw: string | undefined, defaultVal: boolean): boolean {
  if (raw === undefined || raw === '') return defaultVal;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  throw new Error(`${name} must be one of true|false|1|0; got "${raw}"`);
}

export function loadConfig(): AppConfig {
  if (cached) return cached;

  const railPrefix = required('AUTH_RAIL_PREFIX');
  if (railPrefix !== 'Hakken') {
    throw new Error(`AUTH_RAIL_PREFIX must be 'Hakken' for this rail; got "${railPrefix}"`);
  }

  const cfg: AppConfig = {
    nodeEnv: asNodeEnv(required('NODE_ENV')),
    logLevel: asLogLevel(optional('LOG_LEVEL')),
    port: intInRange('PORT', required('PORT'), 1, 65535),
    serviceVersion: required('SERVICE_VERSION'),

    databaseUrl: required('DATABASE_URL'),

    auth: {
      railPrefix: 'Hakken',
      timestampHeaderName: required('AUTH_TIMESTAMP_HEADER'),
      toleranceSeconds: intInRange(
        'AUTH_TIMESTAMP_TOLERANCE_SECONDS',
        required('AUTH_TIMESTAMP_TOLERANCE_SECONDS'),
        1,
        3600
      ),
    },

    idempotency: {
      ttlSeconds: intInRange(
        'IDEMPOTENCY_TTL_SECONDS',
        required('IDEMPOTENCY_TTL_SECONDS'),
        60,
        7 * 24 * 3600
      ),
    },

    secrets: {
      envelopeProvider: asEnvelopeProvider(optional('SECRETS_ENVELOPE_PROVIDER')),
    },

    identiti: {
      jwksUrl: asHttpsUrl('IDENTITI_JWKS_URL', required('IDENTITI_JWKS_URL')),
      issuer: required('IDENTITI_JWT_ISSUER'),
      consentBase: asHttpsUrl('IDENTITI_CONSENT_BASE', required('IDENTITI_CONSENT_BASE')),
    },

    hakken: {
      jwtAudience: required('HAKKEN_JWT_AUDIENCE'),
    },

    kipkirenPay: {
      apiBase: optional('KP_API_BASE') ?? '',
      analyticsHmacSecret: optional('KP_ANALYTICS_HMAC_SECRET') ?? '',
      tenantAppId: optional('KP_TENANT_APP_ID') ?? 'hakken_internal',
    },

    todoku: {
      apiBase: optional('TODOKU_API_BASE') ?? '',
      hmacSecret: optional('TODOKU_HMAC_SECRET') ?? '',
      tenantAppId: optional('TODOKU_TENANT_APP_ID') ?? 'hakken_internal',
    },

    kafka: {
      brokers: parseBrokerList(optional('KAFKA_BROKERS')),
      clientId: optional('KAFKA_CLIENT_ID') ?? 'hakken-rail',
    },

    redis: {
      url: optional('REDIS_URL') ?? '',
    },

    regulatoryContainment: {
      enforced: asBool(
        'REGULATORY_CONTAINMENT_ENFORCED',
        optional('REGULATORY_CONTAINMENT_ENFORCED'),
        true
      ),
    },
  };

  cached = Object.freeze(cfg);
  return cached;
}

export function resetConfigForTests(): void {
  cached = undefined;
}
