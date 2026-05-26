/**
 * One-shot connectivity probe used at HK-1 close to verify the Supabase
 * project + DATABASE_URL combo before running migrations.
 *
 * Removed after HK-1 close — kept here so the verification step is
 * reproducible if someone re-provisions the project.
 */

import postgres from 'postgres';

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 10 });
try {
  const r1 = await sql`
    SELECT
      current_database()                       AS database,
      current_user                             AS usr,
      current_setting('server_version')        AS pg_version,
      current_setting('TimeZone')              AS tz
  `;
  console.warn('[probe] connect OK:', JSON.stringify(r1[0]));

  const r2 = await sql`
    SELECT extname, extversion
      FROM pg_extension
     ORDER BY extname
  `;
  console.warn(
    '[probe] extensions:',
    r2.map((r) => `${r['extname']}@${r['extversion']}`).join(', ')
  );

  const r3 = await sql`SELECT 1 AS one`;
  console.warn('[probe] roundtrip OK:', r3[0]?.['one']);
} catch (err) {
  console.error('[probe] FAILED:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
