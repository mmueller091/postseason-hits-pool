import { env } from 'cloudflare:workers';
import { emptyPool, PoolError, type Pool } from './domain';
export function database(): D1Database {
  const db = (env as unknown as { DB: D1Database }).DB;
  if (!db) throw new Error('The shared database is not configured.');
  return db;
}
export async function initialize() {
  const db = database();
  await db.batch([
    db.prepare(
      'CREATE TABLE IF NOT EXISTS pool_state (id INTEGER PRIMARY KEY, revision INTEGER NOT NULL, state TEXT NOT NULL)',
    ),
    db.prepare(
      'CREATE TABLE IF NOT EXISTS throttle (key TEXT PRIMARY KEY, until INTEGER NOT NULL, count INTEGER NOT NULL DEFAULT 0)',
    ),
    db
      .prepare(
        'INSERT OR IGNORE INTO pool_state (id,revision,state) VALUES (1,0,?)',
      )
      .bind(JSON.stringify(emptyPool())),
    // Rename only the original default; preserve participants, picks and custom titles.
    db
      .prepare(
        "UPDATE pool_state SET state=json_set(state,'$.title',?),revision=revision+1 WHERE id=1 AND lower(json_extract(state,'$.title'))=?",
      )
      .bind('Postseason Hits Pool', 'family playoff pool'),
  ]);
}
export async function readPool(): Promise<{ pool: Pool; revision: number }> {
  await initialize();
  const row = await database()
    .prepare('SELECT revision,state FROM pool_state WHERE id=1')
    .first<{ revision: number; state: string }>();
  if (!row) throw new Error('The pool could not be loaded.');
  return { pool: JSON.parse(row.state), revision: row.revision };
}
export async function savePool(pool: Pool, revision: number) {
  const result = await database()
    .prepare(
      'UPDATE pool_state SET state=?,revision=revision+1 WHERE id=1 AND revision=?',
    )
    .bind(JSON.stringify(pool), revision)
    .run();
  if (result.meta.changes !== 1)
    throw new PoolError(
      'The pool changed while you were working. Refresh and try again.',
      409,
    );
}
export async function claimRefresh(
  key: string,
  seconds: number,
): Promise<boolean> {
  const now = Date.now();
  const result = await database()
    .prepare(
      'INSERT INTO throttle(key,until,count) VALUES(?,?,0) ON CONFLICT(key) DO UPDATE SET until=excluded.until WHERE throttle.until < ?',
    )
    .bind(key, now + seconds * 1000, now)
    .run();
  return result.meta.changes === 1;
}
export async function loginLimit(key: string) {
  const now = Date.now();
  const row = await database()
    .prepare(
      'INSERT INTO throttle(key,until,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN throttle.until<? THEN 1 ELSE throttle.count+1 END, until=CASE WHEN throttle.until<? THEN excluded.until ELSE throttle.until END RETURNING count',
    )
    .bind(key, now + 15 * 60 * 1000, now, now)
    .first<{ count: number }>();
  if (row && row.count > 15)
    throw new PoolError(
      'Too many attempts. Wait 15 minutes before trying again.',
      429,
    );
}
