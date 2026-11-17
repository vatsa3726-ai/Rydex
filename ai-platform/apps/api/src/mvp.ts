import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { migrate, type Database } from "./database.js";
import {
  hashToken,
  newSession,
  passwordHash,
  passwordMatches,
  requestToken,
} from "./auth.js";
import { profileSchema, relationships } from "./profiles.js";
import { registerChat } from "./chat-routes.js";
import { registerPrivacy } from "./privacy-routes.js";
import { registerVoice, voiceReady } from "./voice-routes.js";
import type { CompanionProvider } from "./companion.js";
import {
  configuredPhotoStorage,
  queuePhotoDeletion,
  drainPhotoDeletions,
  type PhotoStorage,
} from "./photo-storage.js";

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
export const plans = {
  free: {
    name: "Free",
    companions: 3,
    dailyMessages: Number(process.env.FREE_DAILY_MESSAGES ?? 30),
    dailyVoice: Number(process.env.FREE_DAILY_VOICE ?? 5),
  },
  premium: {
    name: "Premium — coming soon",
    companions: 10,
    dailyMessages: 300,
    dailyVoice: 50,
  },
};
for (const plan of Object.values(plans)) {
  if (
    ![plan.dailyMessages, plan.dailyVoice].every(
      (value) => Number.isInteger(value) && value > 0 && value <= 10000,
    )
  )
    throw Error("Daily usage limits must be positive integers up to 10000");
}
export interface MvpContext {
  db: Database;
  user(req: FastifyRequest): string;
  owned(req: FastifyRequest, id: string): Promise<any>;
  reserve(userId: string, kind: string, limit: number): Promise<void>;
  photoStorage?: PhotoStorage;
}
export async function registerMvp(
  app: FastifyInstance,
  db: Database,
  provider?: CompanionProvider,
  photoStorage: PhotoStorage | undefined = configuredPhotoStorage(),
) {
  await migrate(db);
  let draining = false;
  const cleanup = async () => {
    if (draining) return;
    draining = true;
    try {
      await drainPhotoDeletions(db, photoStorage);
    } catch {
    } finally {
      draining = false;
    }
  };
  const timer = setInterval(() => void cleanup(), 60000);
  timer.unref();
  app.addHook("onClose", async () => {
    clearInterval(timer);
    await cleanup();
  });
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  const users = new WeakMap<FastifyRequest, string>();
  const production = process.env.NODE_ENV === "production";
  const origin =
    process.env.PUBLIC_ORIGIN ??
    process.env.RENDER_EXTERNAL_URL ??
    "http://localhost:3000";
  if (production && !origin.startsWith("https://"))
    throw Error("PUBLIC_ORIGIN must use HTTPS in production");
  const cookies = {
    path: "/",
    httpOnly: true,
    sameSite: "strict" as const,
    secure: production,
    maxAge: 7 * 86400,
  };
  const context: MvpContext = {
    db,
    photoStorage,
    user: (req) => users.get(req)!,
    async owned(req, id) {
      if (!z.string().uuid().safeParse(id).success)
        throw new HttpError(404, "Companion not found.");
      const result = await db.query(
        "SELECT c.*, EXISTS(SELECT 1 FROM sn_photos p WHERE p.companion_id=c.id) AS has_photo FROM sn_companions c WHERE c.id=$1 AND c.user_id=$2",
        [id, users.get(req)],
      );
      if (!result.rows[0]) throw new HttpError(404, "Companion not found.");
      return result.rows[0];
    },
    async reserve(id, kind, limit) {
      const result = await db.query(
        `INSERT INTO sn_usage(user_id,day,kind,count) VALUES ($1,$2,$3,1) ON CONFLICT(user_id,day,kind) DO UPDATE SET count=sn_usage.count+1 WHERE sn_usage.count < $4 RETURNING count`,
        [id, new Date().toISOString().slice(0, 10), kind, limit],
      );
      if (!result.rows.length)
        throw new HttpError(
          429,
          "Your daily allowance is used. It resets at midnight UTC.",
        );
    },
  };
  await app.register(
    async (routes) => {
      routes.addHook(
        "preHandler",
        routes.rateLimit({
          max: 120,
          timeWindow: "1 minute",
          keyGenerator: (req) => users.get(req) ?? req.ip,
        }),
      );
      routes.setErrorHandler((error, _req, reply) => {
        if (error instanceof z.ZodError)
          return reply.code(400).send({
            error: `Check ${error.issues[0]?.path.join(".") || "your input"}: ${error.issues[0]?.message}`,
          });
        if ((error as any).code === "23505")
          return reply.code(409).send({
            error:
              "Unable to create this record. Try signing in if you already registered.",
          });
        const status = (error as any).statusCode;
        return reply.code(status >= 400 && status < 500 ? status : 503).send({
          error:
            status >= 400 && status < 500
              ? (error as Error).message
              : "The service is unavailable. Please try again.",
        });
      });
      routes.addHook("onRequest", async (req, reply) => {
        reply
          .header("Cache-Control", "no-store")
          .header("X-Content-Type-Options", "nosniff")
          .header("Referrer-Policy", "no-referrer");
        if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
          const nativeEntry = req.url
            .split("?")[0]
            .startsWith("/v2/soulnest/auth/native/");
          const explicitBearer = /^Bearer [a-f0-9]{64}$/.test(
            req.headers.authorization ?? "",
          );
          if (nativeEntry && req.headers.origin)
            throw new HttpError(
              403,
              "Native sign-in does not accept browser origins.",
            );
          if (
            req.headers.origin !== origin &&
            !(!production && req.headers.origin === "http://127.0.0.1:3000") &&
            !(
              req.headers.origin === undefined &&
              (nativeEntry || explicitBearer)
            )
          )
            throw new HttpError(403, "Request origin is not allowed.");
          if (req.headers["content-type"]?.split(";")[0] !== "application/json")
            throw new HttpError(415, "Send JSON requests.");
        }
        const publicPaths = [
          "/v2/soulnest/config",
          "/v2/soulnest/health",
          "/v2/soulnest/auth/login",
          "/v2/soulnest/auth/register",
          "/v2/soulnest/auth/native/register",
          "/v2/soulnest/auth/native/login",
        ];
        if (publicPaths.includes(req.url.split("?")[0])) return;
        const token = requestToken(req);
        const result = token
          ? await db.query(
              "SELECT user_id FROM sn_sessions WHERE token_hash=$1 AND expires_at>NOW()",
              [hashToken(token)],
            )
          : { rows: [] };
        if (!result.rows[0])
          throw new HttpError(401, "Please sign in to continue.");
        users.set(req, result.rows[0].user_id);
      });
      routes.get("/config", async () => ({
        relationships,
        plans,
        paymentsEnabled: false,
        provider: process.env.AI_PROVIDER === "openai" ? "openai" : "preview",
        voiceEnabled: voiceReady(),
      }));
      routes.get("/health", async () => {
        await db.query("SELECT 1");
        return { status: "ok" };
      });
      const credentials = z.object({
        email: z
          .string()
          .trim()
          .email()
          .max(254)
          .transform((v) => v.toLowerCase()),
        password: z.string().min(12).max(128),
      });
      const registerHandler = async (
        req: FastifyRequest,
        reply: FastifyReply,
      ) => {
        const input = credentials
          .extend({
            name: z.string().trim().min(1).max(60),
            adult: z.literal(true),
            terms: z.literal(true),
          })
          .strict()
          .parse(req.body);
        const id = randomUUID(),
          hashed = await passwordHash(input.password);
        const token = await db.transaction(async (tx) => {
          await tx.query(
            "INSERT INTO sn_users(id,email,name,password_hash) VALUES ($1,$2,$3,$4)",
            [id, input.email, input.name, hashed],
          );
          await tx.query("INSERT INTO sn_subscriptions(user_id) VALUES ($1)", [
            id,
          ]);
          return newSession(tx, id);
        });
        const native = req.url.split("?")[0].includes("/auth/native/");
        if (!native) reply.setCookie("sn_session", token, cookies);
        return {
          user: { id, name: input.name, email: input.email },
          ...(native ? { token, expiresIn: 7 * 86400 } : {}),
        };
      };
      for (const path of ["/auth/register", "/auth/native/register"])
        routes.post(
          path,
          { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
          registerHandler,
        );
      const loginHandler = async (req: FastifyRequest, reply: FastifyReply) => {
        const input = credentials.strict().parse(req.body);
        const result = await db.query(
          "SELECT id,email,name,password_hash FROM sn_users WHERE email=$1",
          [input.email],
        );
        const u = result.rows[0];
        const matches = await passwordMatches(
          input.password,
          u?.password_hash ?? `${"0".repeat(32)}:${"0".repeat(128)}`,
        );
        if (!u || !matches)
          throw new HttpError(401, "Email or password is incorrect.");
        const native = req.url.split("?")[0].includes("/auth/native/");
        const token = await newSession(db, u.id);
        if (!native) reply.setCookie("sn_session", token, cookies);
        return {
          user: { id: u.id, name: u.name, email: u.email },
          ...(native ? { token, expiresIn: 7 * 86400 } : {}),
        };
      };
      for (const path of ["/auth/login", "/auth/native/login"])
        routes.post(
          path,
          { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
          loginHandler,
        );
      routes.post("/auth/logout", async (req, reply) => {
        await db.query("DELETE FROM sn_sessions WHERE token_hash=$1", [
          hashToken(requestToken(req)!),
        ]);
        reply.clearCookie("sn_session", cookies);
        return { ok: true };
      });
      routes.get("/account", async (req) => ({
        user: (
          await db.query("SELECT id,name,email FROM sn_users WHERE id=$1", [
            context.user(req),
          ])
        ).rows[0],
        plan: "free",
        usage: (
          await db.query(
            "SELECT day,kind,count FROM sn_usage WHERE user_id=$1 AND day=$2",
            [context.user(req), new Date().toISOString().slice(0, 10)],
          )
        ).rows,
      }));
      routes.put("/account", async (req) => {
        const { name } = z
          .object({ name: z.string().trim().min(1).max(60) })
          .strict()
          .parse(req.body);
        await db.query("UPDATE sn_users SET name=$1 WHERE id=$2", [
          name,
          context.user(req),
        ]);
        return { name };
      });
      routes.delete("/account", async (req, reply) => {
        const { password } = z
          .object({ password: z.string().max(128) })
          .parse(req.body);
        const u = (
          await db.query("SELECT password_hash FROM sn_users WHERE id=$1", [
            context.user(req),
          ])
        ).rows[0];
        if (!u || !(await passwordMatches(password, u.password_hash)))
          throw new HttpError(401, "Password is incorrect.");
        await db.transaction(async (tx) => {
          await queuePhotoDeletion(tx, { userId: context.user(req) });
          await tx.query("DELETE FROM sn_users WHERE id=$1", [
            context.user(req),
          ]);
        });
        await cleanup();
        reply.clearCookie("sn_session", cookies);
        return { deleted: true };
      });
      routes.get("/companions", async (req) => ({
        companions: (
          await db.query(
            "SELECT c.*, EXISTS(SELECT 1 FROM sn_photos p WHERE p.companion_id=c.id) AS has_photo FROM sn_companions c WHERE c.user_id=$1 ORDER BY c.created_at DESC",
            [context.user(req)],
          )
        ).rows,
      }));
      routes.get<{ Params: { id: string } }>(
        "/companions/:id",
        async (req) => ({ companion: await context.owned(req, req.params.id) }),
      );
      routes.post("/companions", async (req) => {
        const input = profileSchema.parse(req.body),
          id = randomUUID();
        await db.transaction(async (tx) => {
          await tx.query("SELECT id FROM sn_users WHERE id=$1 FOR UPDATE", [
            context.user(req),
          ]);
          const count = await tx.query(
            "SELECT COUNT(*) AS count FROM sn_companions WHERE user_id=$1",
            [context.user(req)],
          );
          if (Number(count.rows[0].count) >= plans.free.companions)
            throw new HttpError(
              409,
              "The free plan supports three companions.",
            );
          await tx.query(
            "INSERT INTO sn_companions(id,user_id,name,relationship,personality,tone,language,instructions,interests,phrases,custom_label) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
            [
              id,
              context.user(req),
              input.name,
              input.relationship,
              input.personality,
              input.tone,
              input.language,
              input.instructions,
              input.interests,
              input.phrases,
              input.custom_label,
            ],
          );
        });
        return { companion: await context.owned(req, id) };
      });
      routes.put<{ Params: { id: string } }>("/companions/:id", async (req) => {
        await context.owned(req, req.params.id);
        const p = profileSchema.parse(req.body);
        await db.query(
          "UPDATE sn_companions SET name=$1,relationship=$2,personality=$3,tone=$4,language=$5,instructions=$6,interests=$7,phrases=$8,custom_label=$9 WHERE id=$10 AND user_id=$11",
          [
            p.name,
            p.relationship,
            p.personality,
            p.tone,
            p.language,
            p.instructions,
            p.interests,
            p.phrases,
            p.custom_label,
            req.params.id,
            context.user(req),
          ],
        );
        return { companion: await context.owned(req, req.params.id) };
      });
      routes.delete<{ Params: { id: string } }>(
        "/companions/:id",
        async (req) => {
          await context.owned(req, req.params.id);
          await db.transaction(async (tx) => {
            await queuePhotoDeletion(tx, { companionId: req.params.id });
            await tx.query(
              "DELETE FROM sn_companions WHERE id=$1 AND user_id=$2",
              [req.params.id, context.user(req)],
            );
          });
          await cleanup();
          return { deleted: true };
        },
      );
      await registerChat(routes, context, provider);
      await registerPrivacy(routes, context);
      await registerVoice(routes, context);
    },
    { prefix: "/v2/soulnest" },
  );
  return context;
}
