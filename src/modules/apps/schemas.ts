/**
 * AJV schemas for the app registration endpoints (H2-001).
 * Kept inline so the wire contract is reviewable at the edit site.
 */

const sidedEnum = ['one_sided', 'two_sided'] as const;
const appStatusEnum = ['provisioning', 'active', 'suspended', 'retired'] as const;

/** Slug pattern: lowercase, starts with a letter, 3–50 chars. */
export const SLUG_PATTERN = '^[a-z][a-z0-9_]{2,49}$';

export const registerAppRequestSchema = {
  $id: 'hakken/RegisterAppRequest',
  type: 'object',
  required: ['app_slug', 'app_name', 'vertical', 'sided'],
  additionalProperties: false,
  properties: {
    app_slug: { type: 'string', pattern: SLUG_PATTERN },
    app_name: { type: 'string', minLength: 1, maxLength: 200 },
    vertical: { type: 'string', pattern: SLUG_PATTERN },
    sided: { type: 'string', enum: sidedEnum },
    rate_limit_rpm: { type: 'integer', minimum: 1, maximum: 100000 },
    webhook_url: { type: 'string', format: 'uri', maxLength: 2048 },
  },
} as const;

export const registerAppResponseSchema = {
  $id: 'hakken/RegisterAppResponse',
  type: 'object',
  required: ['ok', 'data', 'meta'],
  additionalProperties: true,
  properties: {
    ok: { type: 'boolean' },
    data: {
      type: 'object',
      required: [
        'app_id',
        'app_slug',
        'app_name',
        'vertical',
        'sided',
        'status',
        'rate_limit_rpm',
        'hmac_secret',
        'created_at',
      ],
      additionalProperties: false,
      properties: {
        app_id: { type: 'string', format: 'uuid' },
        app_slug: { type: 'string' },
        app_name: { type: 'string' },
        vertical: { type: 'string' },
        sided: { type: 'string', enum: sidedEnum },
        status: { type: 'string', enum: appStatusEnum },
        rate_limit_rpm: { type: 'integer' },
        // Returned ONCE at registration; never surfaced again (not in GET).
        hmac_secret: { type: 'string' },
        created_at: { type: 'string' },
      },
    },
    meta: { type: 'object', additionalProperties: true },
  },
} as const;

export const getAppResponseSchema = {
  $id: 'hakken/GetAppResponse',
  type: 'object',
  required: ['ok', 'data', 'meta'],
  additionalProperties: true,
  properties: {
    ok: { type: 'boolean' },
    data: {
      type: 'object',
      required: [
        'app_id',
        'app_slug',
        'app_name',
        'vertical',
        'sided',
        'status',
        'rate_limit_rpm',
        'created_at',
      ],
      additionalProperties: false,
      properties: {
        app_id: { type: 'string', format: 'uuid' },
        app_slug: { type: 'string' },
        app_name: { type: 'string' },
        vertical: { type: 'string' },
        sided: { type: 'string', enum: sidedEnum },
        status: { type: 'string', enum: appStatusEnum },
        rate_limit_rpm: { type: 'integer' },
        webhook_url: { type: ['string', 'null'] },
        created_at: { type: 'string' },
        updated_at: { type: 'string' },
      },
    },
    meta: { type: 'object', additionalProperties: true },
  },
} as const;

export interface RegisterAppBody {
  app_slug: string;
  app_name: string;
  vertical: string;
  sided: 'one_sided' | 'two_sided';
  rate_limit_rpm?: number;
  webhook_url?: string;
}
