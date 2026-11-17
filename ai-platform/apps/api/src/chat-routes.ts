import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { type MvpContext, HttpError, plans } from "./mvp.js";
import { systemPrompt, profileSchema } from "./profiles.js";
import { OpenAIProvider } from "./ai-provider.js";
import { PreviewProvider, type CompanionProvider } from "./companion.js";
export async function registerChat(
  routes: FastifyInstance,
  ctx: MvpContext,
  injected?: CompanionProvider,
) {
  const { db } = ctx;
  const provider =
    injected ??
    (process.env.AI_PROVIDER === "openai"
      ? new OpenAIProvider()
      : new PreviewProvider());
  routes.get<{ Params: { id: string }; Querystring: { before?: string } }>(
    "/companions/:id/messages",
    async (req) => {
      await ctx.owned(req, req.params.id);
      const before = z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .parse(req.query.before);
      const result = await db.query(
        "SELECT id,role,content,created_at FROM sn_messages WHERE companion_id=$1 AND id<$2 ORDER BY id DESC LIMIT 51",
        [req.params.id, before ?? "9223372036854775807"],
      );
      return {
        messages: result.rows.slice(0, 50).reverse(),
        hasMore: result.rows.length > 50,
        mode: process.env.AI_PROVIDER === "openai" ? "live" : "preview",
      };
    },
  );
  routes.delete<{ Params: { id: string } }>(
    "/companions/:id/messages",
    async (req) => {
      await ctx.owned(req, req.params.id);
      await db.transaction(async (tx) => {
        await tx.query("SELECT id FROM sn_companions WHERE id=$1 FOR UPDATE", [
          req.params.id,
        ]);
        await tx.query("DELETE FROM sn_messages WHERE companion_id=$1", [
          req.params.id,
        ]);
        await tx.query("DELETE FROM sn_turns WHERE companion_id=$1", [
          req.params.id,
        ]);
      });
      return { deleted: true };
    },
  );
  routes.post<{ Params: { id: string } }>(
    "/companions/:id/chat",
    { config: { rateLimit: { max: 12, timeWindow: "1 minute" } } },
    async (req) => {
      const companion = await ctx.owned(req, req.params.id);
      const input = z
        .object({
          content: z.string().trim().min(1).max(2000),
          requestId: z.string().uuid(),
        })
        .strict()
        .parse(req.body);
      // Reserve before provider work, including failed attempts, to bound provider costs.
      await ctx.reserve(ctx.user(req), "chat", plans.free.dailyMessages);
      return db.transaction(async (tx) => {
        const current = (
          await tx.query(
            "SELECT * FROM sn_companions WHERE id=$1 AND user_id=$2 FOR UPDATE",
            [companion.id, ctx.user(req)],
          )
        ).rows[0];
        if (!current) throw new HttpError(404, "Companion not found.");
        const previous = (
          await tx.query(
            "SELECT content FROM sn_turns WHERE companion_id=$1 AND request_id=$2",
            [companion.id, input.requestId],
          )
        ).rows[0];
        if (previous) return { content: previous.content, duplicate: true };
        const history = (
          await tx.query(
            "SELECT role,content FROM sn_messages WHERE companion_id=$1 ORDER BY id DESC LIMIT 30",
            [companion.id],
          )
        ).rows.reverse();
        const memories = current.memory_enabled
          ? (
              await tx.query(
                "SELECT text FROM sn_memories WHERE companion_id=$1 ORDER BY created_at LIMIT 20",
                [companion.id],
              )
            ).rows.map((r) => r.text)
          : [];
        const profile = profileSchema.parse(
          Object.fromEntries(
            Object.keys(profileSchema.shape).map((k) => [k, current[k]]),
          ),
        );
        let content: string;
        try {
          content = await provider.reply({
            system: systemPrompt(profile),
            messages: [...history, { role: "user", content: input.content }],
            memories,
          });
        } catch {
          throw new HttpError(
            503,
            "Your companion could not reply. Your message has not been saved; please retry.",
          );
        }
        await tx.query(
          "INSERT INTO sn_messages(companion_id,role,content) VALUES ($1,$2,$3),($1,$4,$5)",
          [companion.id, "user", input.content, "assistant", content],
        );
        await tx.query(
          "INSERT INTO sn_turns(companion_id,request_id,content) VALUES ($1,$2,$3)",
          [companion.id, input.requestId, content],
        );
        return {
          content,
          mode: process.env.AI_PROVIDER === "openai" ? "live" : "preview",
        };
      });
    },
  );
}
