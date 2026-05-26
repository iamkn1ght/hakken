/**
 * AJV schemas for the Hakken health endpoints. Kept inline (not generated)
 * so the wire contract is reviewable in TypeScript at the edit site.
 */

const componentStatusEnum = ['healthy', 'degraded', 'unavailable'] as const;
export type ComponentStatus = (typeof componentStatusEnum)[number];

export const healthResponseSchema = {
  $id: 'hakken/HealthResponse',
  type: 'object',
  required: ['ok', 'status', 'version'],
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean' },
    status: { type: 'string', enum: componentStatusEnum },
    version: { type: 'string' },
  },
} as const;

export const deepHealthResponseSchema = {
  $id: 'hakken/DeepHealthResponse',
  type: 'object',
  required: ['ok', 'status', 'components'],
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean' },
    status: { type: 'string', enum: componentStatusEnum },
    components: {
      type: 'object',
      additionalProperties: false,
      properties: {
        database: { type: 'string', enum: componentStatusEnum },
        audit_log: { type: 'string', enum: componentStatusEnum },
        entities: { type: 'string', enum: componentStatusEnum },
        broadcasts: { type: 'string', enum: componentStatusEnum },
        kafka: { type: 'string', enum: componentStatusEnum },
        identiti: { type: 'string', enum: componentStatusEnum },
        kipkiren_pay: { type: 'string', enum: componentStatusEnum },
        todoku: { type: 'string', enum: componentStatusEnum },
        redis: { type: 'string', enum: componentStatusEnum },
      },
    },
  },
} as const;

export interface HealthResponse {
  ok: boolean;
  status: ComponentStatus;
  version: string;
}

export interface DeepHealthResponse {
  ok: boolean;
  status: ComponentStatus;
  components: {
    database?: ComponentStatus;
    audit_log?: ComponentStatus;
    entities?: ComponentStatus;
    broadcasts?: ComponentStatus;
    kafka?: ComponentStatus;
    identiti?: ComponentStatus;
    kipkiren_pay?: ComponentStatus;
    todoku?: ComponentStatus;
    redis?: ComponentStatus;
  };
}
