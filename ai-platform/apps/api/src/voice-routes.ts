import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { type MvpContext, HttpError, plans } from "./mvp.js";
export const voiceReady = () =>
  Boolean(
    process.env.AI_PROVIDER === "openai" &&
    process.env.AI_PROVIDER_API_KEY &&
    process.env.AI_STT_MODEL &&
    process.env.AI_TTS_MODEL,
  );
export async function speechRequest(
  path: string,
  body: BodyInit,
  contentType?: string,
  request: typeof fetch = fetch,
) {
  const base = process.env.AI_BASE_URL ?? "https://api.openai.com/v1";
  if (!base.startsWith("https://"))
    throw new HttpError(503, "The speech provider is not configured securely.");
  const response = await request(`${base.replace(/\/$/, "")}/audio/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.AI_PROVIDER_API_KEY}`,
      ...(contentType ? { "Content-Type": contentType } : {}),
    },
    body,
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new HttpError(
      503,
      "The speech provider is unavailable. Please try again.",
    );
  return response;
}
export async function registerVoice(routes: FastifyInstance, ctx: MvpContext) {
  routes.post<{ Params: { id: string } }>(
    "/companions/:id/transcribe",
    { config: { rateLimit: { max: 6, timeWindow: "1 minute" } } },
    async (req) => {
      const c = await ctx.owned(req, req.params.id);
      if (!voiceReady())
        throw new HttpError(
          503,
          "Voice needs a configured speech provider. You can keep typing.",
        );
      const input = z
        .object({
          base64: z
            .string()
            .min(1)
            .max(7000000)
            .regex(/^[A-Za-z0-9+/]+={0,2}$/),
          mime: z.enum(["audio/webm", "audio/mp4", "audio/wav", "audio/ogg"]),
        })
        .strict()
        .parse(req.body);
      const audio = Buffer.from(input.base64, "base64");
      if (audio.length > 5 * 1024 * 1024)
        throw new HttpError(413, "Keep your recording under 5 MB.");
      await ctx.reserve(ctx.user(req), "voice", plans.free.dailyVoice);
      const form = new FormData();
      form.append(
        "file",
        new Blob([audio], { type: input.mime }),
        `recording.${input.mime.split("/")[1]}`,
      );
      form.append("model", process.env.AI_STT_MODEL!);
      form.append("language", c.language);
      const result = await (await speechRequest("transcriptions", form)).json();
      return { text: String(result.text ?? "").slice(0, 2000) };
    },
  );
  routes.post<{ Params: { id: string } }>(
    "/companions/:id/speech",
    { config: { rateLimit: { max: 6, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const c = await ctx.owned(req, req.params.id);
      if (!voiceReady())
        throw new HttpError(503, "Voice needs a configured speech provider.");
      const input = z
        .object({
          messageId: z.string().regex(/^\d+$/),
          voice: z.enum(["alloy", "coral", "sage"]).default("alloy"),
        })
        .strict()
        .parse(req.body);
      const message = (
        await ctx.db.query(
          "SELECT content FROM sn_messages WHERE id=$1 AND companion_id=$2 AND role=$3",
          [input.messageId, c.id, "assistant"],
        )
      ).rows[0];
      if (!message) throw new HttpError(404, "Reply not found.");
      await ctx.reserve(ctx.user(req), "voice", plans.free.dailyVoice);
      const audio = await speechRequest(
        "speech",
        JSON.stringify({
          model: process.env.AI_TTS_MODEL,
          voice: input.voice,
          input: message.content.slice(0, 4000),
          response_format: "mp3",
        }),
        "application/json",
      );
      return reply
        .type("audio/mpeg")
        .send(Buffer.from(await audio.arrayBuffer()));
    },
  );
}
