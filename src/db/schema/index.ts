/**
 * Re-exports the Hakken rail schema. Order matches the migration grouping
 * (0001 core tables, 0002 audit) so the dependency progression is visible
 * here as well.
 */

// 0001 — core tables
export * from './apps.js';
export * from './verticals.js';
export * from './entities.js';
export * from './broadcasts.js';
export * from './tiers.js';
export * from './plugins.js';
export * from './rankingCalls.js';
export * from './analyticsEvents.js';
export * from './cachedSignals.js';

// 0002 — audit schema (hakken_audit.audit_log + views)
export * from './auditLog.js';
