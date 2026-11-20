import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { type MvpContext, HttpError } from "./mvp.js";
import { hashToken, passwordHash, passwordMatches } from "./auth.js";
import type { AccountMailer } from "./account-mail.js";
export type SoulNestOptions = {
  production?: boolean;
  origin?: string;
  mailer?: AccountMailer;
  requireVerifiedEmail?: boolean;
  trustProxyHops?: number;
  logging?: boolean;
};
export async function registerAccountSecurity(
  routes: FastifyInstance,
  ctx: MvpContext,
  options: { origin: string; mailer?: AccountMailer },
) {
  const { db } = ctx;
  const email = z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    token = z.string().regex(/^[a-f0-9]{64}$/),
    password = z.string().min(12).max(128);
  const notice = {
    accepted: true,
    notice:
      "If the address is eligible, an account email will arrive. Check your inbox and spam folder.",
  };
  for (const purpose of ["verify", "reset"] as const) {
    routes.post(
      `/auth/${purpose === "verify" ? "request-verification" : "forgot-password"}`,
      { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
      async (req) => {
        const input = z.object({ email }).strict().parse(req.body);
        if (!options.mailer)
          throw new HttpError(
            503,
            "Account email delivery is not connected yet. Your existing password still works.",
          );
        const user = (
          await db.query(
            "SELECT id,email_verified_at FROM sn_users WHERE email=$1",
            [input.email],
          )
        ).rows[0];
        if (!user || (purpose === "verify" && user.email_verified_at))
          return notice;
        const raw = randomBytes(32).toString("hex"),
          hash = hashToken(raw);
        const allowed = await db.transaction(async (tx) => {
          await tx.query("SELECT id FROM sn_users WHERE id=$1 FOR UPDATE", [
            user.id,
          ]);
          await tx.query(
            "DELETE FROM sn_account_tokens WHERE expires_at<NOW()",
          );
          const limit = await tx.query(
            "INSERT INTO sn_email_limits(user_id,purpose,hour,count) VALUES ($1,$2,$3,1) ON CONFLICT(user_id,purpose,hour) DO UPDATE SET count=sn_email_limits.count+1 WHERE sn_email_limits.count<3 RETURNING count",
            [user.id, purpose, new Date().toISOString().slice(0, 13)],
          );
          if (!limit.rows.length) return false;
          await tx.query(
            "DELETE FROM sn_account_tokens WHERE user_id=$1 AND purpose=$2",
            [user.id, purpose],
          );
          await tx.query(
            "INSERT INTO sn_account_tokens(token_hash,user_id,purpose,expires_at) VALUES ($1,$2,$3,$4)",
            [
              hash,
              user.id,
              purpose,
              new Date(
                Date.now() + (purpose === "verify" ? 86400000 : 1800000),
              ),
            ],
          );
          return true;
        });
        if (!allowed) return notice;
        try {
          const fragment = new URLSearchParams({
            purpose,
            token: raw,
            email: input.email,
          });
          await options.mailer.send({
            to: input.email,
            purpose,
            token: raw,
            link: options.origin + "/account-security#" + fragment.toString(),
          });
        } catch {
          await db.query("DELETE FROM sn_account_tokens WHERE token_hash=$1", [
            hash,
          ]); /* Do not reveal account existence through delivery failures. */
          routes.log.warn(
            "Account email delivery failed; the unused token was revoked.",
          );
        }
        return notice;
      },
    );
  }
  routes.post(
    "/auth/verify-email",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (req) => {
      const input = z.object({ email, token }).strict().parse(req.body);
      await db.transaction(async (tx) => {
        const owner = (
          await tx.query("SELECT id FROM sn_users WHERE email=$1 FOR UPDATE", [
            input.email,
          ])
        ).rows[0];
        const row = (
          await tx.query(
            "SELECT user_id FROM sn_account_tokens WHERE token_hash=$1 AND purpose='verify' AND expires_at>NOW() AND user_id=$2 FOR UPDATE",
            [hashToken(input.token), owner?.id ?? ""],
          )
        ).rows[0];
        if (!row)
          throw new HttpError(
            400,
            "This verification token is invalid or expired. Request a new email.",
          );
        await tx.query(
          "UPDATE sn_users SET email_verified_at=NOW() WHERE id=$1",
          [row.user_id],
        );
        await tx.query(
          "DELETE FROM sn_account_tokens WHERE user_id=$1 AND purpose='verify'",
          [row.user_id],
        );
      });
      return { verified: true };
    },
  );
  routes.post(
    "/auth/reset-password",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (req) => {
      const input = z
          .object({ email, token, password })
          .strict()
          .parse(req.body),
        hash = await passwordHash(input.password);
      await db.transaction(async (tx) => {
        const owner = (
          await tx.query("SELECT id FROM sn_users WHERE email=$1 FOR UPDATE", [
            input.email,
          ])
        ).rows[0];
        const row = (
          await tx.query(
            "SELECT user_id FROM sn_account_tokens WHERE token_hash=$1 AND purpose='reset' AND expires_at>NOW() AND user_id=$2 FOR UPDATE",
            [hashToken(input.token), owner?.id ?? ""],
          )
        ).rows[0];
        if (!row)
          throw new HttpError(
            400,
            "This recovery token is invalid or expired. Request a new email.",
          );
        await tx.query(
          "UPDATE sn_users SET password_hash=$1,email_verified_at=COALESCE(email_verified_at,NOW()) WHERE id=$2",
          [hash, row.user_id],
        );
        await tx.query("DELETE FROM sn_account_tokens WHERE user_id=$1", [
          row.user_id,
        ]);
        await tx.query("DELETE FROM sn_sessions WHERE user_id=$1", [
          row.user_id,
        ]);
      });
      return { reset: true, signInRequired: true };
    },
  );
  routes.put(
    "/account/password",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "15 minutes",
          keyGenerator: (req) => ctx.user(req) ?? req.ip,
        },
      },
    },
    async (req) => {
      const input = z
          .object({
            currentPassword: z.string().max(128),
            newPassword: password,
          })
          .strict()
          .parse(req.body),
        uid = ctx.user(req);
      const u = (
        await db.query("SELECT password_hash FROM sn_users WHERE id=$1", [uid])
      ).rows[0];
      if (
        !u ||
        !(await passwordMatches(input.currentPassword, u.password_hash))
      )
        throw new HttpError(403, "Your current password is incorrect.");
      const hash = await passwordHash(input.newPassword);
      await db.transaction(async (tx) => {
        const changed = await tx.query(
          "UPDATE sn_users SET password_hash=$1 WHERE id=$2 AND password_hash=$3 RETURNING id",
          [hash, uid, u.password_hash],
        );
        if (!changed.rows.length)
          throw new HttpError(
            409,
            "Your password changed during this request. Sign in again.",
          );
        await tx.query("DELETE FROM sn_sessions WHERE user_id=$1", [uid]);
        await tx.query("DELETE FROM sn_account_tokens WHERE user_id=$1", [uid]);
      });
      return { changed: true, signInRequired: true };
    },
  );
  routes.post(
    "/auth/logout-all",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "15 minutes",
          keyGenerator: (req) => ctx.user(req) ?? req.ip,
        },
      },
    },
    async (req) => {
      const input = z
          .object({ password: z.string().max(128) })
          .strict()
          .parse(req.body),
        uid = ctx.user(req),
        u = (
          await db.query("SELECT password_hash FROM sn_users WHERE id=$1", [
            uid,
          ])
        ).rows[0];
      if (!u || !(await passwordMatches(input.password, u.password_hash)))
        throw new HttpError(403, "Your current password is incorrect.");
      await db.query("DELETE FROM sn_sessions WHERE user_id=$1", [uid]);
      return { signedOut: true };
    },
  );
}
