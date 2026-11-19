import type { FastifyInstance, FastifyRequest } from "fastify";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { VeyraError, type VeyraContext } from "./veyra-types.js";
export type VeyraAgeOptions = {
  production: boolean;
  mode: "provider" | "development-attestation" | "unavailable";
  secret?: string;
  origin: string;
  redirectHosts: string[];
  start?: (reference: string) => Promise<string>;
};
export async function registerVeyraAge(
  routes: FastifyInstance,
  ctx: VeyraContext,
  options: VeyraAgeOptions,
  raw: WeakMap<FastifyRequest, Buffer>,
) {
  routes.get("/age", async (req) => {
    const u = ctx.user(req);
    return {
      verified: ctx.verified(u),
      mode: options.mode,
      validUntil: u.age_verified_until,
      method: u.age_method,
    };
  });
  routes.post("/age/development-attest", async (req) => {
    if (options.production || options.mode !== "development-attestation")
      throw new VeyraError(403, "Development age attestation is disabled.");
    z.object({ adult: z.literal(true) })
      .strict()
      .parse(req.body);
    const id = randomUUID();
    await ctx.db.transaction(async (tx) => {
      await tx.query(
        "INSERT INTO vy_age_checks(id,user_id,status,method,expires_at) VALUES ($1,$2,'verified','development-attestation',$3)",
        [id, ctx.user(req).id, new Date(Date.now() + 86400000)],
      );
      await tx.query(
        "UPDATE vy_users SET age_verified_until=$1,age_method='development-attestation',age_check_id=$2 WHERE id=$3",
        [new Date(Date.now() + 86400000), id, ctx.user(req).id],
      );
    });
    return {
      verified: true,
      method: "development-attestation",
      notice:
        "Development self-attestation only. This is not independent age verification.",
    };
  });
  routes.post(
    "/age/start",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (req) => {
      if (
        options.mode !== "provider" ||
        !options.start ||
        !options.secret ||
        options.secret.length < 32
      )
        throw new VeyraError(
          503,
          "Independent age verification is not connected. Restricted access stays locked.",
        );
      const id = randomUUID(),
        uid = ctx.user(req).id;
      await ctx.db.transaction(async (tx) => {
        await tx.query(
          "INSERT INTO vy_age_checks(id,user_id,status,method,expires_at) VALUES ($1,$2,'pending','provider',$3)",
          [id, uid, new Date(Date.now() + 15 * 60000)],
        );
        // A pending replacement must not retain a proof whose revocation is now superseded.
        await tx.query(
          "UPDATE vy_users SET age_check_id=$1,age_verified_until=NULL,age_method=NULL WHERE id=$2",
          [id, uid],
        );
      });
      let redirect: string;
      try {
        redirect = await options.start(id);
        const url = new URL(redirect);
        if (
          url.protocol !== "https:" ||
          url.username ||
          url.password ||
          !options.redirectHosts.includes(url.hostname)
        )
          throw Error("Invalid redirect");
      } catch {
        await ctx.db.query(
          "UPDATE vy_age_checks SET status='failed' WHERE id=$1",
          [id],
        );
        throw new VeyraError(
          503,
          "The age-verification provider is unavailable. Please try later.",
        );
      }
      return { verificationId: id, url: redirect };
    },
  );
  routes.post("/age/webhook", async (req, reply) => {
    if (
      options.mode !== "provider" ||
      !options.secret ||
      options.secret.length < 32
    )
      throw new VeyraError(503, "Age webhook is not configured.");
    const timestamp = String(req.headers["x-veyra-timestamp"] ?? ""),
      signature = String(req.headers["x-veyra-signature"] ?? "");
    if (
      !/^\d+$/.test(timestamp) ||
      Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 ||
      !/^sha256=[a-f0-9]{64}$/.test(signature)
    )
      throw new VeyraError(401, "Invalid verification signature.");
    const expected = createHmac("sha256", options.secret)
      .update(timestamp + ".")
      .update(raw.get(req) ?? Buffer.alloc(0))
      .digest();
    const actual = Buffer.from(signature.slice(7), "hex");
    if (!timingSafeEqual(expected, actual))
      throw new VeyraError(401, "Invalid verification signature.");
    const event = z
      .object({
        eventId: z.string().uuid(),
        verificationId: z.string().uuid(),
        status: z.enum(["verified", "failed", "revoked"]),
        over18: z.boolean(),
      })
      .strict()
      .parse(req.body);
    const outcome = await ctx.db.transaction(async (tx) => {
      if (
        (
          await tx.query("SELECT id FROM vy_age_events WHERE id=$1", [
            event.eventId,
          ])
        ).rows.length
      )
        return { ok: true, duplicate: true };
      const check = (
        await tx.query("SELECT * FROM vy_age_checks WHERE id=$1 FOR UPDATE", [
          event.verificationId,
        ])
      ).rows[0];
      if (!check) throw new VeyraError(404, "Verification not found.");
      const user = (
        await tx.query("SELECT * FROM vy_users WHERE id=$1 FOR UPDATE", [
          check.user_id,
        ])
      ).rows[0];
      if (!user || user.age_check_id !== check.id)
        throw new VeyraError(409, "This verification has been superseded.");
      if (
        event.status === "verified" &&
        (!event.over18 ||
          check.status !== "pending" ||
          new Date(check.expires_at).getTime() < Date.now())
      )
        throw new VeyraError(409, "Verification cannot grant access.");
      await tx.query("INSERT INTO vy_age_events(id,check_id) VALUES ($1,$2)", [
        event.eventId,
        check.id,
      ]);
      await tx.query("UPDATE vy_age_checks SET status=$1 WHERE id=$2", [
        event.status,
        check.id,
      ]);
      await tx.query(
        "UPDATE vy_users SET age_verified_until=$1,age_method='provider' WHERE id=$2",
        [
          event.status === "verified"
            ? new Date(Date.now() + 30 * 86400000)
            : null,
          user.id,
        ],
      );
      await tx.query(
        "INSERT INTO vy_audit(actor_id,action,target_id) VALUES (NULL,$1,$2)",
        ["age." + event.status, user.id],
      );
      return { ok: true };
    });
    return reply.send(outcome);
  });
}
