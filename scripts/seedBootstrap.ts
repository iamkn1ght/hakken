/**
 * Bootstrap seed — HK-1 H2-002 AC#2.
 *
 * Registers the two v1 pilot apps and their verticals as REAL platform data
 * (not test fixtures):
 *
 *   app klokd       (two_sided)  → vertical klokd       (two_sided)
 *   app lunch_drop  (one_sided)  → vertical lunch_drop  (one_sided)
 *
 * Idempotent: skips an app/vertical that already exists, so it is safe to
 * re-run against a live project. Exercises the real registerApp /
 * registerVertical service paths (insert + hash-chained audit append).
 *
 *   npm run db:seed:bootstrap
 */

import { createDbClient } from '../src/db/client.js';
import { registerApp, getApp } from '../src/modules/apps/service.js';
import { registerVertical, getVertical } from '../src/modules/verticals/service.js';
import { findAppBySlug } from '../src/modules/apps/repo.js';

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) {
  console.error('DATABASE_URL is not set. Source .env or pass it inline.');
  process.exit(1);
}

const { sql, db } = createDbClient({ connectionString: databaseUrl });

interface Plan {
  appSlug: string;
  appName: string;
  sided: 'one_sided' | 'two_sided';
  vertical: string;
  displayName: string;
  broadcastTypes: string[];
}

const PLAN: Plan[] = [
  {
    appSlug: 'klokd',
    appName: 'Klokd',
    sided: 'two_sided',
    vertical: 'klokd',
    displayName: 'Klokd Shifts',
    broadcastTypes: ['shift_open', 'shift_filled', 'availability', 'unavailable'],
  },
  {
    appSlug: 'lunch_drop',
    appName: 'Lunch Drop',
    sided: 'one_sided',
    vertical: 'lunch_drop',
    displayName: 'Lunch Drop',
    broadcastTypes: ['lunch_ready', 'special', 'closed_today'],
  },
];

const requestId = `bootstrap-${Date.now()}`;

try {
  for (const p of PLAN) {
    // App.
    let appId: string;
    const existingApp = await db.transaction((tx) => findAppBySlug(tx, p.appSlug));
    if (existingApp) {
      appId = existingApp.appId;
      console.warn(`[seed] app "${p.appSlug}" already exists (${appId}) — skipping`);
    } else {
      const app = await registerApp(db, {
        appSlug: p.appSlug,
        appName: p.appName,
        vertical: p.vertical,
        sided: p.sided,
        requestId,
        actorId: 'bootstrap',
      });
      appId = app.appId;
      // The hmac_secret is shown once. Print only a prefix so the full
      // secret is not committed to any log the operator might paste around.
      console.warn(
        `[seed] app "${p.appSlug}" registered (${appId}); hmac_secret prefix ${app.hmacSecret.slice(0, 12)}…`
      );
    }

    // Vertical.
    const existingVertical = await getVertical(db, p.vertical);
    if (existingVertical) {
      console.warn(`[seed] vertical "${p.vertical}" already exists — skipping`);
    } else {
      const vertical = await registerVertical(db, {
        vertical: p.vertical,
        displayName: p.displayName,
        sided: p.sided,
        appSlug: p.appSlug,
        broadcastTypes: p.broadcastTypes,
        requestId,
        actorId: 'bootstrap',
      });
      console.warn(
        `[seed] vertical "${vertical.vertical}" registered (sided=${vertical.sided}, app=${appId})`
      );
    }
  }
  console.warn('[seed] bootstrap complete');
} catch (err) {
  console.error('[seed] failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  // Touch getApp so the import is used (it documents the service surface).
  void getApp;
  await sql.end({ timeout: 5 });
}
