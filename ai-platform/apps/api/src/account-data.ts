import type { Database } from "./database.js";
export async function migrateAccountSecurity(db: Database) {
  await db.transaction(async (tx) => {
    for (const sql of [
      "ALTER TABLE sn_users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ",
      "ALTER TABLE sn_subscriptions ADD COLUMN IF NOT EXISTS active_until TIMESTAMPTZ",
      "ALTER TABLE sn_subscriptions ADD COLUMN IF NOT EXISTS grant_reason TEXT",
      `CREATE TABLE IF NOT EXISTS sn_account_tokens(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES sn_users(id) ON DELETE CASCADE,purpose TEXT NOT NULL CHECK(purpose IN ('verify','reset')),expires_at TIMESTAMPTZ NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
      "CREATE INDEX IF NOT EXISTS sn_account_tokens_owner ON sn_account_tokens(user_id,purpose)",
      `CREATE TABLE IF NOT EXISTS sn_email_limits(user_id TEXT NOT NULL REFERENCES sn_users(id) ON DELETE CASCADE,purpose TEXT NOT NULL,hour TEXT NOT NULL,count INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,purpose,hour))`,
      `CREATE TABLE IF NOT EXISTS sn_reports(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES sn_users(id) ON DELETE CASCADE,companion_id TEXT REFERENCES sn_companions(id) ON DELETE SET NULL,category TEXT NOT NULL,details TEXT NOT NULL,excerpt TEXT,status TEXT NOT NULL DEFAULT 'open',resolution TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
      `CREATE TABLE IF NOT EXISTS sn_operator_audit(id BIGSERIAL PRIMARY KEY,action TEXT NOT NULL,target_id TEXT NOT NULL,reason TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    ])
      await tx.query(sql);
  });
}
export type PlanName = "free" | "premium";
export async function activePlan(
  db: Database,
  userId: string,
): Promise<PlanName> {
  const s = (
    await db.query(
      "SELECT plan,status,active_until FROM sn_subscriptions WHERE user_id=$1",
      [userId],
    )
  ).rows[0];
  return s?.plan === "premium" &&
    s.status === "manual" &&
    new Date(s.active_until ?? 0).getTime() > Date.now()
    ? "premium"
    : "free";
}
