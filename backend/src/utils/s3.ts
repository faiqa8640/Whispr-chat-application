import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { ENV } from "../config/env.js";

export const s3 = new S3Client({
  region: ENV.AWS_REGION,
  credentials: {
    accessKeyId: ENV.AWS_ACCESS_KEY_ID,
    secretAccessKey: ENV.AWS_SECRET_ACCESS_KEY,
  },
});

// Everything for this app lives under whispr/ in the shared bucket,
// mirroring the existing categories/exemplar/meezan/posts/products layout.
const APP_FOLDER = "whispr";

export type MediaKind = "image" | "voice";

export function buildMediaKey(userId: string, kind: MediaKind, ext: string): string {
  const sub = kind === "image" ? "images" : "voice";
  const safeExt = ext ? `.${ext.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()}` : "";
  return `${APP_FOLDER}/${sub}/${userId}/${randomUUID()}${safeExt}`;
}

export async function uploadBufferToS3(params: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: ENV.AWS_BUCKET_NAME,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
    })
  );
}

// Bucket stays private; we hand out short-lived signed URLs to view media
// instead of making objects public.
export async function getSignedMediaUrl(key: string, expiresInSeconds = 3600): Promise<string> {
  const command = new GetObjectCommand({ Bucket: ENV.AWS_BUCKET_NAME, Key: key });
  return getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
}