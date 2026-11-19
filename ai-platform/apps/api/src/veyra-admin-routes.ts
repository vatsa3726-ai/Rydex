import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { veyraModelSchema } from "./veyra-data.js";
import { VeyraError, type VeyraContext } from "./veyra-types.js";
export async function registerVeyraAdmin(
  routes: FastifyInstance,
  ctx: VeyraContext,
) {
  const { db } = ctx;
  routes.get("/admin/overview", async () => {
    const count = async (sql: string) => (await db.query(sql)).rows[0].count;
    return {
      users: Number(await count("SELECT COUNT(*) AS count FROM vy_users")),
      verifiedUsers: Number(
        await count(
          "SELECT COUNT(*) AS count FROM vy_users WHERE age_verified_until>NOW() AND access_blocked=FALSE" +
            (ctx.production ? " AND age_method='provider'" : ""),
        ),
      ),
      publishedModels: Number(
        await count(
          "SELECT COUNT(*) AS count FROM vy_models WHERE published=TRUE",
        ),
      ),
      messages: Number(
        await count("SELECT COUNT(*) AS count FROM vy_messages"),
      ),
      openReports: Number(
        await count(
          "SELECT COUNT(*) AS count FROM vy_reports WHERE status='open'",
        ),
      ),
      pendingMedia: Number(
        await count(
          "SELECT COUNT(*) AS count FROM vy_media WHERE status='pending'",
        ),
      ),
      paymentsEnabled: false,
    };
  });
  routes.get("/admin/models", async () => ({
    models: (await db.query("SELECT * FROM vy_models ORDER BY created_at"))
      .rows,
  }));
  routes.post("/admin/models", async (req) => {
    const m = veyraModelSchema.parse(req.body),
      id = randomUUID();
    await db.query(
      "INSERT INTO vy_models(id,name,age,fictional,tagline,bio,personality,interests,tier,published) VALUES ($1,$2,$3,TRUE,$4,$5,$6,$7,$8,$9)",
      [
        id,
        m.name,
        m.age,
        m.tagline,
        m.bio,
        m.personality,
        m.interests,
        m.tier,
        m.published,
      ],
    );
    await ctx.audit(ctx.user(req).id, "model.create", id);
    return { id };
  });
  routes.put<{ Params: { id: string } }>("/admin/models/:id", async (req) => {
    const m = veyraModelSchema.parse(req.body);
    await ctx.model(req.params.id, true);
    await db.query(
      "UPDATE vy_models SET name=$1,age=$2,tagline=$3,bio=$4,personality=$5,interests=$6,tier=$7,published=$8 WHERE id=$9",
      [
        m.name,
        m.age,
        m.tagline,
        m.bio,
        m.personality,
        m.interests,
        m.tier,
        m.published,
        req.params.id,
      ],
    );
    await ctx.audit(ctx.user(req).id, "model.update", req.params.id);
    return { saved: true };
  });
  routes.get("/admin/media", async () => ({
    media: (
      await db.query(
        "SELECT p.id,p.model_id,p.source,p.status,p.tier,p.review_reason,p.created_at,m.name FROM vy_media p JOIN vy_models m ON m.id=p.model_id ORDER BY p.created_at DESC LIMIT 100",
      )
    ).rows,
  }));
  routes.get("/admin/reports", async () => ({
    reports: (
      await db.query(
        "SELECT * FROM vy_reports ORDER BY created_at DESC LIMIT 100",
      )
    ).rows,
  }));
  routes.put<{ Params: { id: string } }>("/admin/reports/:id", async (req) => {
    const input = z
      .object({
        status: z.enum(["open", "resolved", "dismissed"]),
        resolution: z.string().trim().min(5).max(500),
      })
      .strict()
      .parse(req.body);
    const result = await db.query(
      "UPDATE vy_reports SET status=$1,resolution=$2 WHERE id=$3 RETURNING id",
      [input.status, input.resolution, req.params.id],
    );
    if (!result.rows.length) throw new VeyraError(404, "Report not found.");
    await ctx.audit(ctx.user(req).id, "report." + input.status, req.params.id);
    return { saved: true };
  });
  routes.get("/admin/users", async () => ({
    users: (
      await db.query(
        "SELECT u.id,u.email,u.name,u.role,u.access_blocked,u.age_verified_until,s.plan,s.status,s.active_until FROM vy_users u JOIN vy_subscriptions s ON s.user_id=u.id ORDER BY u.created_at DESC LIMIT 100",
      )
    ).rows,
  }));
  routes.put<{ Params: { id: string } }>(
    "/admin/users/:id/entitlement",
    async (req) => {
      const input = z
        .object({
          plan: z.enum(["free", "premium"]),
          days: z.number().int().min(1).max(365),
          reason: z.string().trim().min(5).max(200),
        })
        .strict()
        .parse(req.body);
      const result = await db.query(
        "UPDATE vy_subscriptions SET plan=$1,status=$2,active_until=$3 WHERE user_id=$4 RETURNING user_id",
        [
          input.plan,
          input.plan === "premium" ? "manual" : "inactive",
          input.plan === "premium"
            ? new Date(Date.now() + input.days * 86400000)
            : null,
          req.params.id,
        ],
      );
      if (!result.rows.length) throw new VeyraError(404, "Account not found.");
      await ctx.audit(
        ctx.user(req).id,
        "entitlement." + input.plan,
        req.params.id,
        db,
        input.reason,
      );
      return { saved: true, paymentsEnabled: false };
    },
  );
  routes.put<{ Params: { id: string } }>(
    "/admin/users/:id/access",
    async (req) => {
      const input = z
        .object({
          blocked: z.boolean(),
          reason: z.string().trim().min(5).max(200),
        })
        .strict()
        .parse(req.body);
      if (req.params.id === ctx.user(req).id)
        throw new VeyraError(
          409,
          "Use a separate operator to change your own access.",
        );
      const target = (
        await db.query("SELECT role FROM vy_users WHERE id=$1", [req.params.id])
      ).rows[0];
      if (!target) throw new VeyraError(404, "Account not found.");
      if (target.role === "admin")
        throw new VeyraError(
          403,
          "Admin access changes require the operator CLI.",
        );
      await db.query("UPDATE vy_users SET access_blocked=$1 WHERE id=$2", [
        input.blocked,
        req.params.id,
      ]);
      await ctx.audit(
        ctx.user(req).id,
        input.blocked ? "access.suspend" : "access.restore",
        req.params.id,
        db,
        input.reason,
      );
      return { saved: true };
    },
  );
  routes.get("/admin/audit", async () => ({
    events: (
      await db.query(
        "SELECT id,action,target_id,reason,created_at FROM vy_audit ORDER BY id DESC LIMIT 100",
      )
    ).rows,
  }));
}
