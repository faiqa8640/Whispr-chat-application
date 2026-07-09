import fs from "fs";
import path from "path";
import { ENV } from "../config/env.js";

// Everything staged here is voice-message audio that's been saved locally
// but hasn't finished its background upload to S3 yet. Once the S3 upload
// completes, the corresponding file is deleted — this directory should
// only ever hold audio for messages currently "in flight".
export const VOICE_TEMP_DIR = path.join(process.cwd(), "tmp", "voice-pending");
fs.mkdirSync(VOICE_TEMP_DIR, { recursive: true });

// mediaKey looks like "whispr/voice/<userId>/<uuid>.<ext>" (see
// buildMediaKey in s3.ts) — flatten it into a single safe filename for the
// local scratch directory. It's the same random, unguessable key we'll use
// on S3 once the upload finishes, so the trust model for this "temporary
// public URL" is the same as a pre-signed S3 URL: knowledge of the link is
// what grants access.
export function localFileNameFor(mediaKey: string): string {
  return mediaKey.replace(/\//g, "__");
}

export function localFilePathFor(mediaKey: string): string {
  return path.join(VOICE_TEMP_DIR, localFileNameFor(mediaKey));
}

export function buildLocalVoiceUrl(mediaKey: string): string {
  return `${ENV.PUBLIC_API_URL}/api/voice-local/${encodeURIComponent(localFileNameFor(mediaKey))}`;
}

export async function saveVoiceFileLocally(mediaKey: string, buffer: Buffer): Promise<void> {
  await fs.promises.writeFile(localFilePathFor(mediaKey), buffer);
}

export async function deleteVoiceFileLocally(mediaKey: string): Promise<void> {
  await fs.promises.unlink(localFilePathFor(mediaKey));
}

export const VOICE_EXT_CONTENT_TYPE: Record<string, string> = {
  webm: "audio/webm",
  ogg: "audio/ogg",
  mp3: "audio/mpeg",
  mp4: "audio/mp4",
  wav: "audio/wav",
  m4a: "audio/x-m4a",
};