import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { type MvpContext, HttpError } from "./mvp.js";
export async function registerReports(
  routes: FastifyInstance,
  ctx: MvpContext,
) {
  routes.post(
    "/reports",
    { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } },
    async (req) => {
      const input = z
        .object({
          companionId: z.string().uuid(),
          category: z.enum(["safety", "privacy", "likeness", "other"]),
          details: z.string().trim().min(5).max(1000),
          messageId: z.string().regex(/^\d+$/).optional(),
          includeExcerpt: z.boolean().default(false),
        })
        .strict()
        .parse(req.body);
      const c = await ctx.owned(req, input.companionId);
      let excerpt: string | null = null;
      if (input.messageId) {
        const m = (
          await ctx.db.query(
            "SELECT content FROM sn_messages WHERE id=$1 AND companion_id=$2",
            [input.messageId, c.id],
          )
        ).rows[0];
        if (!m) throw new HttpError(404, "Message not found.");
        if (input.includeExcerpt) excerpt = m.content.slice(0, 500);
      }
      const id = randomUUID();
      await ctx.db.query(
        "INSERT INTO sn_reports(id,user_id,companion_id,category,details,excerpt) VALUES ($1,$2,$3,$4,$5,$6)",
        [id, ctx.user(req), c.id, input.category, input.details, excerpt],
      );
      return {
        id,
        status: "open",
        notice:
          "Your report is saved for review. This is not an emergency service.",
      };
    },
  );
  routes.get("/reports", async (req) => ({
    reports: (
      await ctx.db.query(
        "SELECT id,category,details,excerpt,status,resolution,created_at FROM sn_reports WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
        [ctx.user(req)],
      )
    ).rows,
  }));
}
