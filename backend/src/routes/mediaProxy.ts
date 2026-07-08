
import { Router } from "express";
import { Readable } from "stream";
import { verifyToken } from "../utils/token.js";
import { ENV } from "../config/env.js";

// we use it to avoid the brosers cors error
// without it the normal flow is:
// Frontend browser → signed S3 URL → S3
// with it -> proxy flow:
// Frontend browser → your Express backend → signed S3 URL → S3

// hence you can say that this file :
// lets the frontend download an image through your own backend instead of downloading it directly from S3.

const router = Router();

// Proxies a signed S3 URL through our own server so the browser's fetch()
// call is same-origin (talks to us, not S3 directly) and never hits a CORS
// wall — regardless of what CORS config the bucket does or doesn't have.
router.get("/download", async (req, res) => {
  try {
    const token = req.cookies?.delina_token;
    if (!token) return res.status(401).json({ error: "Not authenticated." });
    try {
      verifyToken(token);
    } catch {
      return res.status(401).json({ error: "Session expired. Please log in again." });
    }

    const url = req.query.url as string;
    if (!url) return res.status(400).json({ error: "Missing url." });

    // Only allow proxying our own bucket's URLs — otherwise this becomes
    // an open proxy anyone could point at arbitrary sites (SSRF risk).
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return res.status(400).json({ error: "Invalid url." });
    }
    const allowedHost = `${ENV.AWS_BUCKET_NAME}.s3.${ENV.AWS_REGION}.amazonaws.com`;
    if (parsed.hostname !== allowedHost) {
      return res.status(400).json({ error: "URL not allowed." });
    }

    // Server-to-server fetch — no browser, no CORS check involved here at all.
    const upstream = await fetch(url);
    if (!upstream.ok || !upstream.body) {
      return res.status(502).json({ error: "Could not fetch the file." });
    }

    res.setHeader(
      "Content-Type",
      upstream.headers.get("content-type") || "application/octet-stream"
    );
    const filename = (req.query.filename as string) || "download";
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    Readable.fromWeb(upstream.body as any).pipe(res);
  } catch (err) {
    console.error("Media proxy error:", err);
    res.status(500).json({ error: "Download failed." });
  }
});

export default router;