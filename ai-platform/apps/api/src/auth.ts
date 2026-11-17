import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import type { Database } from "./database.js";
const scrypt = promisify(scryptCallback);
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}
export async function passwordMatches(password: string, hash: string) {
  const [salt, encoded] = hash.split(":");
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(encoded, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export async function newSession(db: Database, userId: string) {
  const token = randomBytes(32).toString("hex");
  await db.query("DELETE FROM sn_sessions WHERE expires_at < NOW()");
  await db.query(
    "INSERT INTO sn_sessions(token_hash,user_id,expires_at) VALUES ($1,$2,$3)",
    [hashToken(token), userId, new Date(Date.now() + 7 * 86400000)],
  );
  return token;
}
