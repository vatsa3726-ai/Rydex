import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { VeyraError, type VeyraContext } from "./veyra-types.js";
import { veyraCustomization } from "./veyra-data.js";
import { veyraPlans } from "./veyra.js";
import {
  type VeyraProvider,
  VeyraOpenAIProvider,
  VeyraPreviewProvider,
  veyraPrompt,
} from "./veyra-provider.js";
export async function registerVeyraChat(
  routes: FastifyInstance,
  ctx: VeyraContext,
  injected?: VeyraProvider,
) {
  const provider =
      injected ??
      (process.env.VEYRA_AI_PROVIDER === "openai"
        ? new VeyraOpenAIProvider()
        : new VeyraPreviewProvider()),
    { db } = ctx;
  const conversation = async (uid: string, modelId: string) => {
    await db.query(
      "INSERT INTO vy_conversations(id,user_id,model_id) VALUES ($1,$2,$3) ON CONFLICT(user_id,model_id) DO NOTHING",
      [randomUUID(), uid, modelId],
    );
    return (
      await db.query(
        "SELECT * FROM vy_conversations WHERE user_id=$1 AND model_id=$2",
        [uid, modelId],
      )
    ).rows[0];
  };
  routes.get("/conversations", async (req) => ({
    conversations: (
      await db.query(
        "SELECT c.id,c.model_id,c.created_at,m.name,(SELECT MAX(created_at) FROM vy_messages s WHERE s.conversation_id=c.id) AS last_message_at FROM vy_conversations c JOIN vy_models m ON m.id=c.model_id WHERE c.user_id=$1 ORDER BY c.created_at DESC",
        [ctx.user(req).id],
      )
    ).rows,
  }));
  routes.get<{ Params: { id: string }; Querystring: { before?: string } }>(
    "/conversations/:id",
    async (req) => {
      const model = await ctx.model(req.params.id);
      const c = (
        await db.query(
          "SELECT * FROM vy_conversations WHERE user_id=$1 AND model_id=$2",
          [ctx.user(req).id, model.id],
        )
      ).rows[0];
      if (!c)
        return {
          messages: [],
          customization: veyraCustomization.parse({}),
          hasMore: false,
          mode: process.env.VEYRA_AI_PROVIDER === "openai" ? "live" : "preview",
        };
      const before = z
        .string()
        .regex(/^\d+$/)
        .optional()
        .parse(req.query.before);
      const rows = (
        await db.query(
          "SELECT id,role,content,created_at FROM vy_messages WHERE conversation_id=$1 AND id<$2 ORDER BY id DESC LIMIT 51",
          [c.id, before ?? "9223372036854775807"],
        )
      ).rows;
      return {
        messages: rows.slice(0, 50).reverse(),
        customization: c.customization,
        hasMore: rows.length > 50,
        mode: process.env.VEYRA_AI_PROVIDER === "openai" ? "live" : "preview",
      };
    },
  );
  routes.put<{ Params: { id: string } }>(
    "/conversations/:id/customization",
    async (req) => {
      const m = await ctx.model(req.params.id);
      const input = veyraCustomization.parse(req.body);
      const c = await conversation(ctx.user(req).id, m.id);
      await db.query(
        "UPDATE vy_conversations SET customization=$1 WHERE id=$2 AND user_id=$3",
        [JSON.stringify(input), c.id, ctx.user(req).id],
      );
      return { customization: input };
    },
  );
  routes.delete<{ Params: { id: string } }>(
    "/conversations/:id",
    async (req) => {
      await db.query(
        "DELETE FROM vy_conversations WHERE user_id=$1 AND model_id=$2",
        [ctx.user(req).id, req.params.id],
      );
      return { deleted: true };
    },
  );
  routes.post<{ Params: { id: string } }>(
    "/models/:id/chat",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req) => {
      const model = await ctx.model(req.params.id),
        user = ctx.user(req),
        premium = await ctx.premium(user.id);
      if (model.tier === "premium" && !premium)
        throw new VeyraError(
          403,
          "Private Circle access is required for this conversation.",
          "PREMIUM_REQUIRED",
        );
      const input = z
        .object({
          content: z.string().trim().min(1).max(2000),
          requestId: z.string().uuid(),
        })
        .strict()
        .parse(req.body);
      const limit = premium
        ? veyraPlans.premium.dailyMessages
        : veyraPlans.free.dailyMessages;
      const quota = await db.query(
        "INSERT INTO vy_usage(user_id,day,count) VALUES ($1,$2,1) ON CONFLICT(user_id,day) DO UPDATE SET count=vy_usage.count+1 WHERE vy_usage.count<$3 RETURNING count",
        [user.id, new Date().toISOString().slice(0, 10), limit],
      );
      if (!quota.rows.length)
        throw new VeyraError(
          429,
          "Your daily conversation allowance is used. It resets at midnight UTC.",
        );
      const c = await conversation(user.id, model.id);
      return db.transaction(async (tx) => {
        const current = (
          await tx.query(
            "SELECT * FROM vy_conversations WHERE id=$1 AND user_id=$2 FOR UPDATE",
            [c.id, user.id],
          )
        ).rows[0];
        if (!current) throw new VeyraError(404, "Conversation not found.");
        const refreshed = (
          await tx.query("SELECT * FROM vy_users WHERE id=$1", [user.id])
        ).rows[0];
        if (!refreshed || !ctx.verified(refreshed))
          throw new VeyraError(
            403,
            "Age verification is required.",
            "AGE_REQUIRED",
          );
        const prior = (
          await tx.query(
            "SELECT content FROM vy_turns WHERE conversation_id=$1 AND request_id=$2",
            [c.id, input.requestId],
          )
        ).rows[0];
        if (prior) return { content: prior.content, duplicate: true };
        const messages = (
          await tx.query(
            "SELECT role,content FROM vy_messages WHERE conversation_id=$1 ORDER BY id DESC LIMIT 30",
            [c.id],
          )
        ).rows.reverse();
        let content: string;
        try {
          content = await provider.reply({
            system: veyraPrompt(
              model,
              veyraCustomization.parse(current.customization),
            ),
            messages: [...messages, { role: "user", content: input.content }],
          });
        } catch {
          throw new VeyraError(
            503,
            "The companion could not reply. Your message was not saved; please retry.",
          );
        }
        await tx.query(
          "INSERT INTO vy_messages(conversation_id,role,content) VALUES ($1,$2,$3),($1,$4,$5)",
          [c.id, "user", input.content, "assistant", content],
        );
        await tx.query(
          "INSERT INTO vy_turns(conversation_id,request_id,content) VALUES ($1,$2,$3)",
          [c.id, input.requestId, content],
        );
        return {
          content,
          mode: process.env.VEYRA_AI_PROVIDER === "openai" ? "live" : "preview",
        };
      });
    },
  );
  routes.post(
    "/reports",
    { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } },
    async (req) => {
      const input = z
        .object({
          modelId: z.string().max(80),
          category: z.enum(["safety", "likeness", "privacy", "other"]),
          details: z.string().trim().min(5).max(1000),
          messageId: z.string().regex(/^\d+$/).optional(),
          includeExcerpt: z.boolean().default(false),
        })
        .strict()
        .parse(req.body);
      await ctx.model(input.modelId);
      let excerpt: string | null = null;
      if (input.messageId) {
        const message = (
          await db.query(
            "SELECT m.content FROM vy_messages m JOIN vy_conversations c ON c.id=m.conversation_id WHERE m.id=$1 AND c.user_id=$2 AND c.model_id=$3",
            [input.messageId, ctx.user(req).id, input.modelId],
          )
        ).rows[0];
        if (!message) throw new VeyraError(404, "Message not found.");
        if (input.includeExcerpt) excerpt = message.content.slice(0, 500);
      }
      const id = randomUUID();
      await db.query(
        "INSERT INTO vy_reports(id,user_id,model_id,category,details,excerpt) VALUES ($1,$2,$3,$4,$5,$6)",
        [
          id,
          ctx.user(req).id,
          input.modelId,
          input.category,
          input.details,
          excerpt,
        ],
      );
      return { id, status: "open" };
    },
  );
}
