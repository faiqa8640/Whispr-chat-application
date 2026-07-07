import { Router } from "express";
import multer from "multer";
import { verifyToken } from "../utils/token.js";
import User from "../models/User.js";
import { buildMediaKey, uploadBufferToS3, getSignedMediaUrl } from "../utils/s3.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB hard cap
});

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const ALLOWED_VOICE_TYPES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/x-m4a",
]);

const router = Router();

// Reuses the same httpOnly cookie as the GraphQL context — this is a plain
// REST endpoint only because GraphQL (without extra middleware like
// graphql-upload) doesn't handle multipart file uploads well.
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const token = req.cookies?.delina_token;
    if (!token) return res.status(401).json({ error: "Not authenticated." });

    let userId: string;
    try {
      userId = verifyToken(token).id;
    } catch {
      return res.status(401).json({ error: "Session expired. Please log in again." });
    }

    const user = await User.findById(userId);
    if (!user || user.isDeleted) {
      return res.status(401).json({ error: "Not authenticated." });
    }

    const kind = req.query.kind === "voice" ? "voice" : "image";
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file uploaded." });

    if (kind === "image" && !ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      return res.status(400).json({ error: "Unsupported image type." });
    }
    if (kind === "voice" && !ALLOWED_VOICE_TYPES.has(file.mimetype)) {
      return res.status(400).json({ error: "Unsupported audio type." });
    }

    const ext = file.originalname.includes(".") ? file.originalname.split(".").pop()! : "";
    const key = buildMediaKey(userId, kind, ext);

    await uploadBufferToS3({ key, body: file.buffer, contentType: file.mimetype });
    const url = await getSignedMediaUrl(key);

    return res.json({ key, url });
  } catch (err) {
    console.error("Upload error:", err);
    return res.status(500).json({ error: "Upload failed. Please try again." });
  }
});

export default router;