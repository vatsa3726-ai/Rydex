import { z } from "zod";
import type { Database } from "./database.js";
export const veyraModelSchema = z
  .object({
    name: z.string().trim().min(2).max(60),
    age: z.number().int().min(21).max(90),
    fictional: z.literal(true),
    tagline: z.string().trim().min(5).max(160),
    bio: z.string().trim().min(10).max(1200),
    personality: z.enum(["warm", "witty", "reflective", "adventurous"]),
    interests: z.string().trim().max(400),
    tier: z.enum(["free", "premium"]),
    published: z.boolean(),
  })
  .strict();
export const veyraCustomization = z
  .object({
    tone: z.enum(["warm", "witty", "reflective", "direct"]).default("warm"),
    language: z.enum(["en", "hi", "kn"]).default("en"),
    preferences: z.string().trim().max(500).default(""),
  })
  .strict();
export const veyraSeeds = [
  {
    id: "aria-vale",
    name: "Aria Vale",
    age: 29,
    tagline: "A little curiosity. A lasting impression.",
    bio: "A fictional creative spirit with an eye for art, independent films and the unexpected beauty in ordinary evenings.",
    personality: "warm",
    interests: "Art, cinema, slow evenings",
    tier: "free",
    portrait: "aria.jpg",
  },
  {
    id: "noor-amani",
    name: "Noor Amani",
    age: 28,
    tagline: "Good stories deserve good company.",
    bio: "A fictional explorer who loves thoughtful questions, travel stories and the kind of humour that makes a conversation feel effortless.",
    personality: "witty",
    interests: "Travel, music, great stories",
    tier: "free",
    portrait: "noor.jpg",
  },
  {
    id: "julian-reed",
    name: "Julian Reed",
    age: 32,
    tagline: "Thoughtful by nature. Unmistakably imagined.",
    bio: "A fictional design enthusiast who brings calm confidence, a dry sense of humour and a fascination with how people see the world.",
    personality: "reflective",
    interests: "Architecture, books, jazz",
    tier: "premium",
    portrait: "julian.jpg",
  },
] as const;
export async function migrateVeyra(db: Database) {
  await db.transaction(async (tx) => {
    for (const sql of [
      `CREATE TABLE IF NOT EXISTS vy_users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),age_verified_until TIMESTAMPTZ,age_method TEXT,age_check_id TEXT,access_blocked BOOLEAN NOT NULL DEFAULT FALSE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
      `CREATE TABLE IF NOT EXISTS vy_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES vy_users(id) ON DELETE CASCADE,expires_at TIMESTAMPTZ NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS vy_age_checks(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES vy_users(id) ON DELETE CASCADE,status TEXT NOT NULL,method TEXT NOT NULL,expires_at TIMESTAMPTZ NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
      `CREATE TABLE IF NOT EXISTS vy_age_events(id TEXT PRIMARY KEY,check_id TEXT NOT NULL REFERENCES vy_age_checks(id) ON DELETE CASCADE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
      `CREATE TABLE IF NOT EXISTS vy_models(id TEXT PRIMARY KEY,name TEXT NOT NULL,age INTEGER NOT NULL CHECK(age>=21),fictional BOOLEAN NOT NULL DEFAULT TRUE CHECK(fictional=TRUE),tagline TEXT NOT NULL,bio TEXT NOT NULL,personality TEXT NOT NULL,interests TEXT NOT NULL,tier TEXT NOT NULL CHECK(tier IN ('free','premium')),published BOOLEAN NOT NULL DEFAULT FALSE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
      `CREATE TABLE IF NOT EXISTS vy_media(id TEXT PRIMARY KEY,model_id TEXT NOT NULL REFERENCES vy_models(id) ON DELETE CASCADE,source TEXT NOT NULL CHECK(source IN ('generated','licensed')),rights_confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected')),tier TEXT NOT NULL CHECK(tier IN ('free','premium')),seed_file TEXT,object_key TEXT,data BYTEA,review_reason TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
      `CREATE TABLE IF NOT EXISTS vy_conversations(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES vy_users(id) ON DELETE CASCADE,model_id TEXT NOT NULL REFERENCES vy_models(id) ON DELETE CASCADE,customization JSONB NOT NULL DEFAULT '{}',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(user_id,model_id))`,
      `CREATE TABLE IF NOT EXISTS vy_messages(id BIGSERIAL PRIMARY KEY,conversation_id TEXT NOT NULL REFERENCES vy_conversations(id) ON DELETE CASCADE,role TEXT NOT NULL CHECK(role IN ('user','assistant')),content TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
      `CREATE INDEX IF NOT EXISTS vy_message_conversation ON vy_messages(conversation_id,id)`,
      `CREATE TABLE IF NOT EXISTS vy_turns(conversation_id TEXT NOT NULL REFERENCES vy_conversations(id) ON DELETE CASCADE,request_id TEXT NOT NULL,content TEXT NOT NULL,PRIMARY KEY(conversation_id,request_id))`,
      `CREATE TABLE IF NOT EXISTS vy_subscriptions(user_id TEXT PRIMARY KEY REFERENCES vy_users(id) ON DELETE CASCADE,plan TEXT NOT NULL DEFAULT 'free' CHECK(plan IN ('free','premium')),status TEXT NOT NULL DEFAULT 'inactive',active_until TIMESTAMPTZ)`,
      `CREATE TABLE IF NOT EXISTS vy_usage(user_id TEXT NOT NULL REFERENCES vy_users(id) ON DELETE CASCADE,day TEXT NOT NULL,count INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,day))`,
      `CREATE TABLE IF NOT EXISTS vy_reports(id TEXT PRIMARY KEY,user_id TEXT REFERENCES vy_users(id) ON DELETE CASCADE,model_id TEXT REFERENCES vy_models(id) ON DELETE SET NULL,category TEXT NOT NULL,details TEXT NOT NULL,excerpt TEXT,status TEXT NOT NULL DEFAULT 'open',resolution TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
      `CREATE TABLE IF NOT EXISTS vy_audit(id BIGSERIAL PRIMARY KEY,actor_id TEXT REFERENCES vy_users(id) ON DELETE SET NULL,action TEXT NOT NULL,target_id TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
      `ALTER TABLE vy_audit ADD COLUMN IF NOT EXISTS reason TEXT`,
      `CREATE TABLE IF NOT EXISTS vy_object_deletions(object_key TEXT PRIMARY KEY,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    ])
      await tx.query(sql);
    for (const m of veyraSeeds) {
      const seeded = await tx.query(
        "INSERT INTO vy_models(id,name,age,tagline,bio,personality,interests,tier,published) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE) ON CONFLICT DO NOTHING RETURNING id",
        [
          m.id,
          m.name,
          m.age,
          m.tagline,
          m.bio,
          m.personality,
          m.interests,
          m.tier,
        ],
      );
      if (!seeded.rows.length) continue;
      await tx.query(
        "INSERT INTO vy_media(id,model_id,source,status,tier,seed_file,review_reason) VALUES ($1,$2,'generated','approved','free',$3,'Generated editorial asset; reviewed as fictional adult and non-explicit') ON CONFLICT DO NOTHING",
        [`${m.id}-portrait`, m.id, m.portrait],
      );
    }
  });
}
