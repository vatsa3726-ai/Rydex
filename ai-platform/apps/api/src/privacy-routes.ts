import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { type MvpContext, HttpError } from "./mvp.js";
import {
  readPhoto,
  queuePhotoDeletion,
  drainPhotoDeletions,
} from "./photo-storage.js";
export async function registerPrivacy(
  routes: FastifyInstance,
  ctx: MvpContext,
) {
  const { db } = ctx;
  routes.get<{ Params: { id: string } }>(
    "/companions/:id/memories",
    async (req) => {
      const c = await ctx.owned(req, req.params.id);
      return {
        enabled: c.memory_enabled,
        consentUpdatedAt: c.consent_updated_at,
        consentVersion: c.consent_version,
        memories: (
          await db.query(
            "SELECT id,text,created_at FROM sn_memories WHERE companion_id=$1 ORDER BY created_at",
            [c.id],
          )
        ).rows,
      };
    },
  );
  routes.put<{ Params: { id: string } }>(
    "/companions/:id/memory-consent",
    async (req) => {
      const c = await ctx.owned(req, req.params.id);
      const { enabled } = z
        .object({ enabled: z.boolean() })
        .strict()
        .parse(req.body);
      await db.transaction(async (tx) => {
        await tx.query(
          "UPDATE sn_companions SET memory_enabled=$1,consent_updated_at=NOW(),consent_version=$2 WHERE id=$3 AND user_id=$4",
          [enabled, "memory-v1", c.id, ctx.user(req)],
        );
        if (!enabled)
          await tx.query("DELETE FROM sn_memories WHERE companion_id=$1", [
            c.id,
          ]);
      });
      return { enabled };
    },
  );
  const note = z.object({ text: z.string().trim().min(1).max(500) }).strict();
  routes.post<{ Params: { id: string } }>(
    "/companions/:id/memories",
    async (req) => {
      const c = await ctx.owned(req, req.params.id),
        { text } = note.parse(req.body),
        id = randomUUID();
      await db.transaction(async (tx) => {
        const current = (
          await tx.query(
            "SELECT memory_enabled FROM sn_companions WHERE id=$1 AND user_id=$2 FOR UPDATE",
            [c.id, ctx.user(req)],
          )
        ).rows[0];
        if (!current?.memory_enabled)
          throw new HttpError(403, "Enable memory before saving a note.");
        const count = (
          await tx.query(
            "SELECT COUNT(*) AS count FROM sn_memories WHERE companion_id=$1",
            [c.id],
          )
        ).rows[0];
        if (Number(count.count) >= 20)
          throw new HttpError(
            409,
            "You can save up to 20 notes per companion.",
          );
        await tx.query(
          "INSERT INTO sn_memories(id,companion_id,text) VALUES ($1,$2,$3)",
          [id, c.id, text],
        );
      });
      return { id, text };
    },
  );
  routes.put<{ Params: { id: string; memoryId: string } }>(
    "/companions/:id/memories/:memoryId",
    async (req) => {
      const c = await ctx.owned(req, req.params.id),
        { text } = note.parse(req.body);
      const result = await db.query(
        "UPDATE sn_memories SET text=$1 WHERE id=$2 AND companion_id=$3 RETURNING id,text",
        [text, req.params.memoryId, c.id],
      );
      if (!result.rows[0]) throw new HttpError(404, "Memory not found.");
      return result.rows[0];
    },
  );
  routes.delete<{ Params: { id: string; memoryId: string } }>(
    "/companions/:id/memories/:memoryId",
    async (req) => {
      const c = await ctx.owned(req, req.params.id);
      await db.query(
        "DELETE FROM sn_memories WHERE id=$1 AND companion_id=$2",
        [req.params.memoryId, c.id],
      );
      return { deleted: true };
    },
  );
  routes.put<{ Params: { id: string } }>(
    "/companions/:id/photo",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req) => {
      const c = await ctx.owned(req, req.params.id);
      const input = z
        .object({
          base64: z
            .string()
            .min(1)
            .max(2800000)
            .regex(/^[A-Za-z0-9+/]+={0,2}$/),
          authorized: z.literal(true),
        })
        .strict()
        .parse(req.body);
      const raw = Buffer.from(input.base64, "base64");
      if (raw.length > 2 * 1024 * 1024)
        throw new HttpError(413, "Choose an image under 2 MB.");
      let image: Buffer;
      try {
        const source = sharp(raw, { limitInputPixels: 20_000_000 });
        const meta = await source.metadata();
        if (!["jpeg", "png", "webp"].includes(meta.format ?? ""))
          throw Error("Unsupported");
        image = await source
          .rotate()
          .resize(512, 512, { fit: "cover" })
          .jpeg({ quality: 85 })
          .toBuffer();
      } catch {
        throw new HttpError(
          400,
          "Choose a valid JPG, PNG or WebP photo under 20 megapixels.",
        );
      }
      if (process.env.NODE_ENV === "production" && !ctx.photoStorage)
        throw new HttpError(
          503,
          "Private photo storage must be configured before uploading.",
        );
      const key = ctx.photoStorage
        ? `soulnest/${ctx.user(req)}/${c.id}/${randomUUID()}.jpg`
        : null;
      // Register cleanup before upload so a process crash cannot leave an untracked object.
      if (key) {
        await db.query(
          "INSERT INTO sn_object_deletions(object_key) VALUES ($1)",
          [key],
        );
        await ctx.photoStorage!.put(key, image);
      }
      await db.transaction(async (tx) => {
        await tx.query(
          "SELECT id FROM sn_companions WHERE id=$1 AND user_id=$2 FOR UPDATE",
          [c.id, ctx.user(req)],
        );
        await queuePhotoDeletion(tx, { companionId: c.id });
        await tx.query(
          "INSERT INTO sn_photos(companion_id,data,object_key,consent_version) VALUES ($1,$2,$3,$4) ON CONFLICT(companion_id) DO UPDATE SET data=$2,object_key=$3,authorized_at=NOW(),consent_version=$4",
          [c.id, key ? null : image, key, "likeness-v1"],
        );
        if (key)
          await tx.query(
            "DELETE FROM sn_object_deletions WHERE object_key=$1",
            [key],
          );
      });
      await drainPhotoDeletions(db, ctx.photoStorage);
      return { saved: true };
    },
  );
  routes.get<{ Params: { id: string } }>(
    "/companions/:id/photo",
    async (req, reply) => {
      const c = await ctx.owned(req, req.params.id);
      const image = (
        await db.query(
          "SELECT data,object_key FROM sn_photos WHERE companion_id=$1",
          [c.id],
        )
      ).rows[0];
      if (!image) throw new HttpError(404, "No photo saved.");
      return reply
        .type("image/jpeg")
        .header("Content-Disposition", 'inline; filename="companion.jpg"')
        .send(await readPhoto(image, ctx.photoStorage));
    },
  );
  routes.delete<{ Params: { id: string } }>(
    "/companions/:id/photo",
    async (req) => {
      const c = await ctx.owned(req, req.params.id);
      await db.transaction(async (tx) => {
        await tx.query("SELECT id FROM sn_companions WHERE id=$1 FOR UPDATE", [
          c.id,
        ]);
        await queuePhotoDeletion(tx, { companionId: c.id });
        await tx.query("DELETE FROM sn_photos WHERE companion_id=$1", [c.id]);
      });
      await drainPhotoDeletions(db, ctx.photoStorage);
      return { deleted: true };
    },
  );
  routes.get("/export", async (req) => {
    const userId = ctx.user(req);
    const user = (
      await db.query(
        "SELECT name,email,created_at,adult_confirmed_at FROM sn_users WHERE id=$1",
        [userId],
      )
    ).rows[0];
    const companions = (
      await db.query("SELECT * FROM sn_companions WHERE user_id=$1", [userId])
    ).rows;
    for (const c of companions) {
      c.messages = (
        await db.query(
          "SELECT role,content,created_at FROM sn_messages WHERE companion_id=$1 ORDER BY id",
          [c.id],
        )
      ).rows;
      c.memories = (
        await db.query(
          "SELECT text,created_at FROM sn_memories WHERE companion_id=$1",
          [c.id],
        )
      ).rows;
      const photo = (
        await db.query(
          "SELECT data,object_key,authorized_at FROM sn_photos WHERE companion_id=$1",
          [c.id],
        )
      ).rows[0];
      if (photo)
        c.photo = {
          base64: (await readPhoto(photo, ctx.photoStorage)).toString("base64"),
          authorized_at: photo.authorized_at,
        };
    }
    return { user, companions };
  });
}
