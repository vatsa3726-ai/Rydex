import type { FastifyInstance } from "fastify";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  GetPublicAccessBlockCommand,
} from "@aws-sdk/client-s3";
import sharp from "sharp";
import { z } from "zod";
import type { PhotoStorage } from "./photo-storage.js";
import { VeyraError, type VeyraContext } from "./veyra-types.js";
export function configuredVeyraStorage(): PhotoStorage | undefined {
  if (process.env.VEYRA_MEDIA_STORAGE !== "s3") return;
  const bucket = process.env.VEYRA_STORAGE_BUCKET;
  if (!bucket) throw Error("VEYRA_STORAGE_BUCKET is required");
  const client = new S3Client({
    region: process.env.VEYRA_STORAGE_REGION ?? "us-east-1",
    ...(process.env.VEYRA_STORAGE_ENDPOINT
      ? { endpoint: process.env.VEYRA_STORAGE_ENDPOINT }
      : {}),
    ...(process.env.VEYRA_STORAGE_ACCESS_KEY &&
    process.env.VEYRA_STORAGE_SECRET_KEY
      ? {
          credentials: {
            accessKeyId: process.env.VEYRA_STORAGE_ACCESS_KEY,
            secretAccessKey: process.env.VEYRA_STORAGE_SECRET_KEY,
          },
        }
      : {}),
  });
  const send = (command: any) =>
    client.send(command, {
      abortSignal: AbortSignal.timeout(10000),
    }) as Promise<any>;
  return {
    async put(key, data) {
      const b = (
        await send(new GetPublicAccessBlockCommand({ Bucket: bucket }))
      ).PublicAccessBlockConfiguration;
      if (
        !b?.BlockPublicAcls ||
        !b.IgnorePublicAcls ||
        !b.BlockPublicPolicy ||
        !b.RestrictPublicBuckets
      )
        throw Error("Veyra bucket must block all public access");
      await send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: data,
          ContentType: "image/jpeg",
          ServerSideEncryption: "AES256",
          CacheControl: "private, no-store",
        }),
      );
    },
    async get(key) {
      const result = await send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      );
      return Buffer.from(await result.Body.transformToByteArray());
    },
    async delete(key) {
      await send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}
export async function registerVeyraMedia(
  routes: FastifyInstance,
  ctx: VeyraContext,
  production: boolean,
) {
  let draining = false;
  const cleanup = async () => {
    if (!ctx.storage || draining) return;
    draining = true;
    try {
      const rows = (
        await ctx.db.query(
          "SELECT object_key FROM vy_object_deletions d WHERE created_at<NOW()-INTERVAL '10 minutes' AND NOT EXISTS(SELECT 1 FROM vy_media m WHERE m.object_key=d.object_key) LIMIT 30",
        )
      ).rows;
      for (const row of rows) {
        try {
          await ctx.storage.delete(row.object_key);
          await ctx.db.query(
            "DELETE FROM vy_object_deletions WHERE object_key=$1",
            [row.object_key],
          );
        } catch {}
      }
    } finally {
      draining = false;
    }
  };
  const timer = setInterval(() => void cleanup().catch(() => {}), 60000);
  timer.unref();
  routes.addHook("onClose", async () => {
    clearInterval(timer);
    await cleanup();
  });
  routes.get<{ Params: { id: string } }>("/media/:id", async (req, reply) => {
    const media = (
        await ctx.db.query(
          "SELECT p.*,m.published FROM vy_media p JOIN vy_models m ON m.id=p.model_id WHERE p.id=$1",
          [req.params.id],
        )
      ).rows[0],
      admin = ctx.user(req).role === "admin";
    if (!media || (!admin && (!media.published || media.status !== "approved")))
      throw new VeyraError(404, "Media not found.");
    if (
      !admin &&
      media.tier === "premium" &&
      !(await ctx.premium(ctx.user(req).id))
    )
      throw new VeyraError(
        403,
        "Private Circle access is required.",
        "PREMIUM_REQUIRED",
      );
    let bytes: Buffer;
    if (media.seed_file) {
      if (!["aria.jpg", "noor.jpg", "julian.jpg"].includes(media.seed_file))
        throw new VeyraError(404, "Media not found.");
      bytes = await readFile(
        new URL("../assets/veyra/" + media.seed_file, import.meta.url),
      );
    } else if (media.object_key) {
      if (!ctx.storage)
        throw new VeyraError(503, "Media storage is not configured.");
      bytes = await ctx.storage.get(media.object_key);
    } else bytes = Buffer.from(media.data);
    return reply
      .type("image/jpeg")
      .header(
        "Content-Disposition",
        'inline; filename="fictional-ai-portrait.jpg"',
      )
      .send(bytes);
  });
  routes.post(
    "/admin/media",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req) => {
      const input = z
        .object({
          modelId: z.string().max(80),
          base64: z
            .string()
            .min(1)
            .max(2800000)
            .regex(/^[A-Za-z0-9+/]+={0,2}$/),
          source: z.enum(["generated", "licensed"]),
          rightsConfirmed: z.literal(true),
          fictionalAdultConfirmed: z.literal(true),
          nonExplicitConfirmed: z.literal(true),
          tier: z.enum(["free", "premium"]),
        })
        .strict()
        .parse(req.body);
      await ctx.model(input.modelId, true);
      if (production && !ctx.storage)
        throw new VeyraError(
          503,
          "Private object storage is required for production media uploads.",
        );
      const bytes = Buffer.from(input.base64, "base64");
      if (bytes.length > 2 * 1024 * 1024)
        throw new VeyraError(413, "Use an image under 2 MB.");
      let image: Buffer;
      try {
        const source = sharp(bytes, { limitInputPixels: 20000000 });
        const info = await source.metadata();
        if (!["jpeg", "png", "webp"].includes(info.format ?? ""))
          throw Error("Unsupported");
        image = await source
          .rotate()
          .resize(1200, 1600, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 88 })
          .toBuffer();
      } catch {
        throw new VeyraError(
          400,
          "Use a valid non-explicit JPG, PNG or WebP under 20 megapixels.",
        );
      }
      const id = randomUUID(),
        key = ctx.storage ? `veyra/media/${input.modelId}/${id}.jpg` : null;
      if (key) {
        await ctx.db.query(
          "INSERT INTO vy_object_deletions(object_key) VALUES ($1)",
          [key],
        );
        await ctx.storage!.put(key, image);
      }
      await ctx.db.transaction(async (tx) => {
        await tx.query(
          "INSERT INTO vy_media(id,model_id,source,status,tier,object_key,data) VALUES ($1,$2,$3,'pending',$4,$5,$6)",
          [
            id,
            input.modelId,
            input.source,
            input.tier,
            key,
            key ? null : image,
          ],
        );
        if (key)
          await tx.query(
            "DELETE FROM vy_object_deletions WHERE object_key=$1",
            [key],
          );
        await ctx.audit(ctx.user(req).id, "media.upload", id, tx);
      });
      return {
        id,
        status: "pending",
        notice:
          "A manual adult/non-explicit/rights review is required before publication.",
      };
    },
  );
  routes.post<{ Params: { id: string } }>(
    "/admin/media/:id/review",
    async (req) => {
      const input = z
        .object({
          decision: z.enum(["approved", "rejected"]),
          reason: z.string().trim().min(5).max(500),
          rightsConfirmed: z.boolean().default(false),
          fictionalAdultConfirmed: z.boolean().default(false),
          nonExplicitConfirmed: z.boolean().default(false),
        })
        .strict()
        .refine(
          (v) =>
            v.decision === "rejected" ||
            (v.rightsConfirmed &&
              v.fictionalAdultConfirmed &&
              v.nonExplicitConfirmed),
          {
            message:
              "Approval requires rights, fictional-adult and non-explicit confirmation.",
          },
        )
        .parse(req.body);
      const result = await ctx.db.query(
        "UPDATE vy_media SET status=$1,review_reason=$2 WHERE id=$3 RETURNING id",
        [input.decision, input.reason, req.params.id],
      );
      if (!result.rows.length) throw new VeyraError(404, "Media not found.");
      await ctx.audit(
        ctx.user(req).id,
        "media." + input.decision,
        req.params.id,
        ctx.db,
        input.reason,
      );
      return { status: input.decision };
    },
  );
  routes.delete<{ Params: { id: string } }>("/admin/media/:id", async (req) => {
    await ctx.db.transaction(async (tx) => {
      const row = (
        await tx.query(
          "SELECT object_key FROM vy_media WHERE id=$1 FOR UPDATE",
          [req.params.id],
        )
      ).rows[0];
      if (!row) throw new VeyraError(404, "Media not found.");
      if (row.object_key)
        await tx.query(
          "INSERT INTO vy_object_deletions(object_key) VALUES ($1) ON CONFLICT DO NOTHING",
          [row.object_key],
        );
      await tx.query("DELETE FROM vy_media WHERE id=$1", [req.params.id]);
      await ctx.audit(ctx.user(req).id, "media.delete", req.params.id, tx);
    });
    return { deleted: true };
  });
}
