/**
 * AJV schemas for the vertical registration endpoints (H2-002).
 */

const sidedEnum = ['one_sided', 'two_sided'] as const;
const verticalStatusEnum = ['active', 'suspended', 'retired'] as const;

const SLUG_PATTERN = '^[a-z][a-z0-9_]{2,49}$';

export const registerVerticalRequestSchema = {
  $id: 'hakken/RegisterVerticalRequest',
  type: 'object',
  required: ['vertical', 'display_name', 'sided', 'app_slug'],
  additionalProperties: false,
  properties: {
    vertical: { type: 'string', pattern: SLUG_PATTERN },
    display_name: { type: 'string', minLength: 1, maxLength: 200 },
    sided: { type: 'string', enum: sidedEnum },
    // Links the vertical to a registered app (H2-002 AC#1). 404 if absent.
    app_slug: { type: 'string', pattern: SLUG_PATTERN },
    broadcast_types: { type: 'array', items: { type: 'string' } },
    ranking_plugins: { type: 'array', items: { type: 'string' } },
    ttl_defaults: { type: 'object', additionalProperties: true },
    plugin_config: { type: 'object', additionalProperties: true },
    schema_version: { type: 'integer', minimum: 1, maximum: 100000 },
  },
} as const;

const verticalDataSchema = {
  type: 'object',
  required: [
    'vertical',
    'display_name',
    'sided',
    'app_id',
    'status',
    'schema_version',
    'broadcast_types',
    'ranking_plugins',
    'created_at',
  ],
  additionalProperties: false,
  properties: {
    vertical: { type: 'string' },
    display_name: { type: 'string' },
    sided: { type: 'string', enum: sidedEnum },
    app_id: { type: ['string', 'null'], format: 'uuid' },
    status: { type: 'string', enum: verticalStatusEnum },
    schema_version: { type: 'integer' },
    broadcast_types: { type: 'array' },
    ranking_plugins: { type: 'array' },
    ttl_defaults: { type: 'object', additionalProperties: true },
    plugin_config: { type: 'object', additionalProperties: true },
    created_at: { type: 'string' },
  },
} as const;

export const registerVerticalResponseSchema = {
  $id: 'hakken/RegisterVerticalResponse',
  type: 'object',
  required: ['ok', 'data', 'meta'],
  additionalProperties: true,
  properties: {
    ok: { type: 'boolean' },
    data: verticalDataSchema,
    meta: { type: 'object', additionalProperties: true },
  },
} as const;

export const getVerticalResponseSchema = registerVerticalResponseSchema;

export interface RegisterVerticalBody {
  vertical: string;
  display_name: string;
  sided: 'one_sided' | 'two_sided';
  app_slug: string;
  broadcast_types?: string[];
  ranking_plugins?: string[];
  ttl_defaults?: Record<string, unknown>;
  plugin_config?: Record<string, unknown>;
  schema_version?: number;
}
