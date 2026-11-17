import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  GetPublicAccessBlockCommand,
} from "@aws-sdk/client-s3";
import type { Database } from "./database.js";
export interface PhotoStorage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}
export function configuredPhotoStorage(): PhotoStorage | undefined {
  if (process.env.PHOTO_STORAGE !== "s3") return;
  const bucket = process.env.OBJECT_STORAGE_BUCKET;
  if (!bucket) throw Error("OBJECT_STORAGE_BUCKET is required for S3 photos");
  const client = new S3Client({
    region: process.env.OBJECT_STORAGE_REGION ?? "us-east-1",
    ...(process.env.OBJECT_STORAGE_ENDPOINT
      ? { endpoint: process.env.OBJECT_STORAGE_ENDPOINT }
      : {}),
    ...(process.env.OBJECT_STORAGE_ACCESS_KEY &&
    process.env.OBJECT_STORAGE_SECRET_KEY
      ? {
          credentials: {
            accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY,
            secretAccessKey: process.env.OBJECT_STORAGE_SECRET_KEY,
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
      // Fail closed if the provider cannot verify that public bucket access is blocked.
      const block = (
        await send(new GetPublicAccessBlockCommand({ Bucket: bucket }))
      ).PublicAccessBlockConfiguration;
      if (
        !block?.BlockPublicAcls ||
        !block.IgnorePublicAcls ||
        !block.BlockPublicPolicy ||
        !block.RestrictPublicBuckets
      )
        throw Error("The photo bucket must block all public access");
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
      const object = await send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      );
      return Buffer.from(await object.Body.transformToByteArray());
    },
    async delete(key) {
      await send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}
export async function queuePhotoDeletion(
  db: Database,
  filter: { companionId?: string; userId?: string },
) {
  const rows = filter.companionId
    ? await db.query("SELECT object_key FROM sn_photos WHERE companion_id=$1", [
        filter.companionId,
      ])
    : await db.query(
        "SELECT p.object_key FROM sn_photos p JOIN sn_companions c ON c.id=p.companion_id WHERE c.user_id=$1",
        [filter.userId],
      );
  for (const row of rows.rows)
    if (row.object_key)
      await db.query(
        "INSERT INTO sn_object_deletions(object_key) VALUES ($1) ON CONFLICT DO NOTHING",
        [row.object_key],
      );
}
export async function drainPhotoDeletions(
  db: Database,
  storage?: PhotoStorage,
) {
  if (!storage) return;
  const rows = (
    await db.query(
      "SELECT object_key FROM sn_object_deletions d WHERE created_at < NOW() - INTERVAL '10 minutes' AND NOT EXISTS(SELECT 1 FROM sn_photos p WHERE p.object_key=d.object_key) ORDER BY created_at LIMIT 50",
    )
  ).rows;
  for (const row of rows) {
    try {
      await storage.delete(row.object_key);
      await db.query("DELETE FROM sn_object_deletions WHERE object_key=$1", [
        row.object_key,
      ]);
    } catch {
      /* A durable outbox retries object cleanup without restoring deleted account access. */
    }
  }
}
export async function readPhoto(row: any, storage?: PhotoStorage) {
  if (row.object_key) {
    if (!storage) throw Error("Object storage is unavailable");
    return storage.get(row.object_key);
  }
  return Buffer.from(row.data);
}
