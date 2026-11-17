import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';

export interface Database {
  query(sql: string, params?: any[]): Promise<{ rows: any[] }>;
  transaction<T>(work: (db: Database) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
export async function createDatabase(url = process.env.DATABASE_URL, local = process.env.SOULNEST_DATA_DIR ?? './.soulnest-data'): Promise<Database> {
  if (process.env.NODE_ENV === 'production' && !url) throw Error('DATABASE_URL is required in production');
  if (url) {
    const pool = new pg.Pool({ connectionString: url, max: 5, connectionTimeoutMillis: 10000 });
    const db: Database = {
      query: (sql, params) => pool.query(sql, params),
      async transaction(work) {
        const client = await pool.connect();
        try { await client.query('BEGIN'); const result = await work({ ...db, query: (sql, params) => client.query(sql, params) }); await client.query('COMMIT'); return result; }
        catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
      },
      close: () => pool.end(),
    };
    return db;
  }
  const localDb = new PGlite(local === ':memory:' ? undefined : local);
  const adapt = (conn: any): Database => ({ query: (sql, params) => conn.query(sql, params), transaction: work => conn.transaction((tx: any) => work(adapt(tx))), close: () => localDb.close() });
  await localDb.waitReady;
  return adapt(localDb);
}

// Additive, namespaced schema; no legacy Rydex tables are read or altered.
export async function migrate(db: Database) {
  await db.transaction(async tx => {
    for (const sql of [
      `CREATE TABLE IF NOT EXISTS sn_users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password_hash TEXT NOT NULL, adult_confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
      `CREATE TABLE IF NOT EXISTS sn_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES sn_users(id) ON DELETE CASCADE, expires_at TIMESTAMPTZ NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS sn_companions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES sn_users(id) ON DELETE CASCADE, name TEXT NOT NULL, relationship TEXT NOT NULL, personality TEXT NOT NULL, tone TEXT NOT NULL, language TEXT NOT NULL, instructions TEXT NOT NULL, interests TEXT NOT NULL, phrases TEXT NOT NULL, custom_label TEXT NOT NULL, memory_enabled BOOLEAN NOT NULL DEFAULT FALSE, consent_updated_at TIMESTAMPTZ, consent_version TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
      `CREATE INDEX IF NOT EXISTS sn_companions_owner ON sn_companions(user_id)`,
      `CREATE TABLE IF NOT EXISTS sn_photos (companion_id TEXT PRIMARY KEY REFERENCES sn_companions(id) ON DELETE CASCADE, data BYTEA NOT NULL, authorized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), consent_version TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS sn_messages (id BIGSERIAL PRIMARY KEY, companion_id TEXT NOT NULL REFERENCES sn_companions(id) ON DELETE CASCADE, role TEXT NOT NULL CHECK (role IN ('user','assistant')), content TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
      `CREATE INDEX IF NOT EXISTS sn_messages_companion ON sn_messages(companion_id,id)`,
      `CREATE TABLE IF NOT EXISTS sn_turns (companion_id TEXT NOT NULL REFERENCES sn_companions(id) ON DELETE CASCADE, request_id TEXT NOT NULL, content TEXT NOT NULL, PRIMARY KEY(companion_id,request_id))`,
      `CREATE TABLE IF NOT EXISTS sn_memories (id TEXT PRIMARY KEY, companion_id TEXT NOT NULL REFERENCES sn_companions(id) ON DELETE CASCADE, text TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
      `CREATE TABLE IF NOT EXISTS sn_subscriptions (user_id TEXT PRIMARY KEY REFERENCES sn_users(id) ON DELETE CASCADE, plan TEXT NOT NULL DEFAULT 'free', status TEXT NOT NULL DEFAULT 'inactive', provider_ref TEXT)`,
      `CREATE TABLE IF NOT EXISTS sn_usage (user_id TEXT NOT NULL REFERENCES sn_users(id) ON DELETE CASCADE, day TEXT NOT NULL, kind TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(user_id,day,kind))`,
    ]) await tx.query(sql);
  });
}


