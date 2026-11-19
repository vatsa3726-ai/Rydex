import type { FastifyInstance, FastifyRequest } from "fastify";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Database } from "./database.js";
import { hashToken, passwordHash, passwordMatches } from "./auth.js";
import type { PhotoStorage } from "./photo-storage.js";
import { migrateVeyra } from "./veyra-data.js";
import {
  VeyraError,
  type VeyraUser,
  type VeyraContext,
} from "./veyra-types.js";
import { registerVeyraAge } from "./veyra-age.js";
import { registerVeyraChat } from "./veyra-chat.js";
import { registerVeyraMedia, configuredVeyraStorage } from "./veyra-media.js";
import { registerVeyraAdmin } from "./veyra-admin-routes.js";
import { type VeyraProvider } from "./veyra-provider.js";
export type VeyraOptions = {
  production?: boolean;
  origin?: string;
  provider?: VeyraProvider;
  storage?: PhotoStorage;
  ageStart?: (ref: string) => Promise<string>;
  ageSecret?: string;
  ageRedirectHosts?: string[];
};
export const veyraPlans = {
  free: {
    name: "Discovery",
    dailyMessages: Number(process.env.VEYRA_FREE_DAILY_MESSAGES ?? 20),
  },
  premium: {
    name: "Private Circle",
    dailyMessages: Number(process.env.VEYRA_PREMIUM_DAILY_MESSAGES ?? 200),
  },
};
for (const plan of Object.values(veyraPlans))
  if (
    !Number.isInteger(plan.dailyMessages) ||
    plan.dailyMessages < 1 ||
    plan.dailyMessages > 5000
  )
    throw Error("Veyra usage limits must be positive integers up to 5000");
export async function registerVeyra(
  app: FastifyInstance,
  db: Database,
  options: VeyraOptions = {},
) {
  await migrateVeyra(db);
  const production =
    options.production ?? process.env.NODE_ENV === "production";
  const origin =
    options.origin ??
    process.env.VEYRA_PUBLIC_ORIGIN ??
    process.env.RENDER_EXTERNAL_URL ??
    "http://localhost:3001";
  if (production && new URL(origin).protocol !== "https:")
    throw Error("Veyra production origin must be HTTPS");
  const storage = options.storage ?? configuredVeyraStorage(),
    users = new WeakMap<FastifyRequest, VeyraUser>(),
    raw = new WeakMap<FastifyRequest, Buffer>();
  const cookies = {
    path: "/",
    httpOnly: true,
    sameSite: "strict" as const,
    secure: production,
    maxAge: 7 * 86400,
  };
  const ctx: VeyraContext = {
    db,
    storage,
    production,
    user: (req) => users.get(req)!,
    verified: (u) =>
      !u.access_blocked &&
      Boolean(u.age_verified_until) &&
      new Date(u.age_verified_until!).getTime() > Date.now() &&
      (!production || u.age_method === "provider"),
    async premium(id) {
      const row = (
        await db.query("SELECT * FROM vy_subscriptions WHERE user_id=$1", [id])
      ).rows[0];
      return Boolean(
        row?.plan === "premium" &&
        row.status === "manual" &&
        row.active_until &&
        new Date(row.active_until).getTime() > Date.now(),
      );
    },
    async model(id, admin = false) {
      const result = (
        await db.query("SELECT * FROM vy_models WHERE id=$1", [id])
      ).rows[0];
      if (!result || (!admin && !result.published))
        throw new VeyraError(404, "Model not found.");
      return result;
    },
    async audit(actor, action, target, tx = db, reason) {
      await tx.query(
        "INSERT INTO vy_audit(actor_id,action,target_id,reason) VALUES ($1,$2,$3,$4)",
        [actor, action, target, reason ?? null],
      );
    },
  };
  const ageSecret = options.ageSecret ?? process.env.VEYRA_AGE_WEBHOOK_SECRET;
  const redirectHosts =
    options.ageRedirectHosts ??
    (process.env.VEYRA_AGE_REDIRECT_HOSTS ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  const ageStart =
    options.ageStart ??
    (process.env.VEYRA_AGE_START_URL && process.env.VEYRA_AGE_API_KEY
      ? async (ref: string) => {
          const url = process.env.VEYRA_AGE_START_URL!;
          if (!url.startsWith("https://")) throw Error("HTTPS required");
          const r = await fetch(url, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.VEYRA_AGE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              reference: ref,
              minimumAge: 18,
              returnUrl: origin + "/verify",
              webhookUrl: process.env.VEYRA_PUBLIC_API_ORIGIN
                ? process.env.VEYRA_PUBLIC_API_ORIGIN + "/v1/veyra/age/webhook"
                : origin + "/api/veyra/age/webhook",
            }),
            signal: AbortSignal.timeout(15000),
          });
          if (!r.ok) throw Error("Age provider unavailable");
          return String((await r.json()).url);
        }
      : undefined);
  const ageMode =
    ageStart && ageSecret && ageSecret.length >= 32 && redirectHosts.length
      ? "provider"
      : !production && process.env.VEYRA_AGE_MODE !== "provider"
        ? "development-attestation"
        : "unavailable";
  const newSession = async (tx: Database, id: string) => {
    const token = randomBytes(32).toString("hex");
    await tx.query("DELETE FROM vy_sessions WHERE expires_at<NOW()");
    await tx.query(
      "INSERT INTO vy_sessions(token_hash,user_id,expires_at) VALUES ($1,$2,$3)",
      [hashToken(token), id, new Date(Date.now() + 7 * 86400000)],
    );
    return token;
  };
  await app.register(
    async (routes) => {
      routes.removeContentTypeParser("application/json");
      const parse = routes.getDefaultJsonParser("error", "error");
      routes.addContentTypeParser(
        "application/json",
        { parseAs: "buffer" },
        (req, body, done) => {
          raw.set(req, body as Buffer);
          parse(req, (body as Buffer).toString("utf8"), done);
        },
      );
      routes.setErrorHandler((error, _req, reply) => {
        if (error instanceof z.ZodError)
          return reply.code(400).send({
            error: `Check ${error.issues[0]?.path.join(".") || "your input"}: ${error.issues[0]?.message}`,
          });
        if ((error as any).code === "23505")
          return reply.code(409).send({
            error:
              "This record already exists. Try signing in if you already registered.",
          });
        const status = (error as any).statusCode;
        return reply.code(status >= 400 && status <= 503 ? status : 503).send({
          error:
            error instanceof VeyraError
              ? error.message
              : status === 429
                ? "Too many requests. Please try later."
                : "Veyra is temporarily unavailable.",
          ...(error instanceof VeyraError && error.code
            ? { code: error.code }
            : {}),
        });
      });
      routes.addHook("onRequest", async (req, reply) => {
        reply
          .header("Cache-Control", "private, no-store")
          .header("X-Content-Type-Options", "nosniff")
          .header("Referrer-Policy", "no-referrer");
        const path = req.url.split("?")[0],
          webhook = path === "/v1/veyra/age/webhook";
        if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
          if (req.headers["content-type"]?.split(";")[0] !== "application/json")
            throw new VeyraError(415, "Send JSON requests.");
          if (
            !webhook &&
            req.headers.origin !== origin &&
            !(!production && req.headers.origin === "http://127.0.0.1:3001")
          )
            throw new VeyraError(403, "Request origin is not allowed.");
        }
        if (
          [
            "/v1/veyra/health",
            "/v1/veyra/config",
            "/v1/veyra/auth/register",
            "/v1/veyra/auth/login",
            "/v1/veyra/age/webhook",
          ].includes(path)
        )
          return;
        const token = req.cookies.vy_session;
        const row = token
          ? (
              await db.query(
                "SELECT u.* FROM vy_users u JOIN vy_sessions s ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>NOW()",
                [hashToken(token)],
              )
            ).rows[0]
          : undefined;
        if (!row) throw new VeyraError(401, "Sign in to your Veyra account.");
        users.set(req, row);
        const self = [
          "/v1/veyra/account",
          "/v1/veyra/export",
          "/v1/veyra/auth/logout",
          "/v1/veyra/age",
          "/v1/veyra/age/start",
          "/v1/veyra/age/development-attest",
        ];
        if (self.includes(path)) return;
        if (!ctx.verified(row))
          throw new VeyraError(
            403,
            row.access_blocked
              ? "Restricted access is suspended. Account privacy controls remain available."
              : "Complete age verification to continue.",
            "AGE_REQUIRED",
          );
        if (path.startsWith("/v1/veyra/admin") && row.role !== "admin")
          throw new VeyraError(403, "Administrator access required.");
      });
      routes.addHook(
        "preHandler",
        routes.rateLimit({
          max: 100,
          timeWindow: "1 minute",
          keyGenerator: (req) => users.get(req)?.id ?? req.ip,
        }),
      );
      routes.get("/health", async () => {
        await db.query("SELECT 1");
        return { status: "ok", service: "veyra-api" };
      });
      routes.get("/config", async () => ({
        brand: "Veyra AI",
        company: "HPSV Infra Tech LLP",
        minimumUserAge: 18,
        minimumCharacterAge: 21,
        ageMode,
        provider:
          process.env.VEYRA_AI_PROVIDER === "openai" ? "openai" : "preview",
        plans: veyraPlans,
        paymentsEnabled: false,
      }));
      const credentials = z.object({
        email: z
          .string()
          .trim()
          .email()
          .max(254)
          .transform((v) => v.toLowerCase()),
        password: z.string().min(12).max(128),
      });
      routes.post(
        "/auth/register",
        { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
        async (req, reply) => {
          const input = credentials
              .extend({
                name: z.string().trim().min(1).max(60),
                adult: z.literal(true),
                terms: z.literal(true),
              })
              .strict()
              .parse(req.body),
            id = randomUUID(),
            hash = await passwordHash(input.password);
          const token = await db.transaction(async (tx) => {
            await tx.query(
              "INSERT INTO vy_users(id,email,name,password_hash) VALUES ($1,$2,$3,$4)",
              [id, input.email, input.name, hash],
            );
            await tx.query(
              "INSERT INTO vy_subscriptions(user_id) VALUES ($1)",
              [id],
            );
            return newSession(tx, id);
          });
          reply.setCookie("vy_session", token, cookies);
          return {
            user: {
              id,
              name: input.name,
              email: input.email,
              role: "user",
              age_verified_until: null,
              age_method: null,
              access_blocked: false,
            },
          };
        },
      );
      routes.post(
        "/auth/login",
        { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
        async (req, reply) => {
          const input = credentials.strict().parse(req.body);
          const u = (
            await db.query("SELECT * FROM vy_users WHERE email=$1", [
              input.email,
            ])
          ).rows[0];
          const valid = await passwordMatches(
            input.password,
            u?.password_hash ?? `${"0".repeat(32)}:${"0".repeat(128)}`,
          );
          if (!u || !valid)
            throw new VeyraError(401, "Email or password is incorrect.");
          reply.setCookie("vy_session", await newSession(db, u.id), cookies);
          return { signedIn: true };
        },
      );
      routes.post("/auth/logout", async (req, reply) => {
        await db.query("DELETE FROM vy_sessions WHERE token_hash=$1", [
          hashToken(req.cookies.vy_session!),
        ]);
        reply.clearCookie("vy_session", cookies);
        return { ok: true };
      });
      routes.get("/account", async (req) => {
        const u = ctx.user(req);
        return {
          user: {
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            age_verified_until: u.age_verified_until,
            age_method: u.age_method,
            access_blocked: u.access_blocked,
          },
          verified: ctx.verified(u),
          premium: await ctx.premium(u.id),
          usage:
            (
              await db.query(
                "SELECT count FROM vy_usage WHERE user_id=$1 AND day=$2",
                [u.id, new Date().toISOString().slice(0, 10)],
              )
            ).rows[0]?.count ?? 0,
        };
      });
      routes.put("/account", async (req) => {
        const { name } = z
          .object({ name: z.string().trim().min(1).max(60) })
          .strict()
          .parse(req.body);
        await db.query("UPDATE vy_users SET name=$1 WHERE id=$2", [
          name,
          ctx.user(req).id,
        ]);
        return { name };
      });
      routes.delete("/account", async (req, reply) => {
        const { password } = z
          .object({ password: z.string().max(128) })
          .strict()
          .parse(req.body);
        const u = (
          await db.query("SELECT password_hash FROM vy_users WHERE id=$1", [
            ctx.user(req).id,
          ])
        ).rows[0];
        if (!u || !(await passwordMatches(password, u.password_hash)))
          throw new VeyraError(401, "Password is incorrect.");
        await db.query("DELETE FROM vy_users WHERE id=$1", [ctx.user(req).id]);
        reply.clearCookie("vy_session", cookies);
        return { deleted: true };
      });
      routes.get("/export", async (req) => {
        const u = ctx.user(req);
        const conversations = (
          await db.query(
            "SELECT id,model_id,customization,created_at FROM vy_conversations WHERE user_id=$1",
            [u.id],
          )
        ).rows;
        for (const c of conversations)
          c.messages = (
            await db.query(
              "SELECT role,content,created_at FROM vy_messages WHERE conversation_id=$1 ORDER BY id",
              [c.id],
            )
          ).rows;
        return {
          user: {
            name: u.name,
            email: u.email,
            ageMethod: u.age_method,
            ageValidUntil: u.age_verified_until,
          },
          conversations,
          reports: (
            await db.query(
              "SELECT category,details,excerpt,status,created_at FROM vy_reports WHERE user_id=$1",
              [u.id],
            )
          ).rows,
          subscription: (
            await db.query(
              "SELECT plan,status,active_until FROM vy_subscriptions WHERE user_id=$1",
              [u.id],
            )
          ).rows[0],
        };
      });
      routes.get("/models", async () => ({
        models: (
          await db.query(
            "SELECT m.*,(SELECT id FROM vy_media p WHERE p.model_id=m.id AND p.status='approved' AND p.tier='free' ORDER BY p.created_at LIMIT 1) AS portrait_id FROM vy_models m WHERE published=TRUE ORDER BY created_at,id",
          )
        ).rows,
      }));
      routes.get<{ Params: { id: string } }>("/models/:id", async (req) => ({
        model: await ctx.model(req.params.id),
        media: (
          await db.query(
            "SELECT id,tier,source FROM vy_media WHERE model_id=$1 AND status='approved' ORDER BY created_at",
            [req.params.id],
          )
        ).rows,
        premium: await ctx.premium(ctx.user(req).id),
      }));
      await registerVeyraAge(
        routes,
        ctx,
        {
          production,
          mode: ageMode,
          secret: ageSecret,
          origin,
          redirectHosts,
          start: ageStart,
        },
        raw,
      );
      await registerVeyraChat(routes, ctx, options.provider);
      await registerVeyraMedia(routes, ctx, production);
      await registerVeyraAdmin(routes, ctx);
    },
    { prefix: "/v1/veyra" },
  );
  return ctx;
}
