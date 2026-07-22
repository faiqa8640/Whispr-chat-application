import { Router } from "express";// Express allows you to create routes.
// router => is kind of mini express app
import multer from "multer";//Multer is responsible for handling uploaded files.
// without multer express can only understand JSON or text  and i cant understnd files (imagws etc)
// multer sits in teh middle 
// images => multer => buffer => express
// Multer converts uploaded files into a format that Express can use.
import { verifyToken } from "../utils/token";// used to verify the token
import User from "../models/User";
import { buildMediaKey, uploadBufferToS3, getSignedMediaUrl } from "../utils/s3";


//flow: 
//User selects image=> Frontend sends POST /api/upload=> Express Router receives request
// =>Multer extracts the file => Read JWT Cookie=> Verify User => Check file type
// =>Generate S3 Key => Upload to AWS S3 => Generate Signed URL => Return URL to Frontend

// This creates a Multer middleware instance/ multer object and
//  stores it in a variable named upload.
const upload = multer({
  storage: multer.memoryStorage(),//Keep uploaded files in RAM/se=erver memory as a Buffer.
  // browser=> images => server memory (buffer) => upload to aws3 
  // This sets a maximum upload size. allowed 
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

const router = Router();// create a empty router



//whenever the browser sends =>/api/upload => this function runs
// Reuses the same httpOnly cookie as the GraphQL context — this is a plain
// REST endpoint only because GraphQL (without extra middleware like
// graphql-upload) doesn't handle multipart file uploads well.
// Normal GraphQL requests are usually JSON AND A file upload uses: multipart/form-data so  we use the rest
router.post("/upload", upload.single("file"), async (req, res) => {
  // upload.single("file") => is the multer middleware with it it create the req.file 
  // multer read the formdata => the file and create req.file containing originalname , buffer etc 
  try {
    const token = req.cookies?.delina_token;//This reads the JWT from the browser cookie.
    if (!token) return res.status(401).json({ error: "Not authenticated." });

    let userId: string;
    try {
      userId = verifyToken(token).id;//it will hold the user ID extracted from the JWT.
    } catch {
      return res.status(401).json({ error: "Session expired. Please log in again." });
    }

    const user = await User.findById(userId);//find the user by id
    if (!user || user.deletedAt) {//if not exist of is delete then error
      return res.status(401).json({ error: "Not authenticated." });
    }

    // get thr kind of voice or images 
    const kind = req.query.kind === "voice" ? "voice" : "image";
    const file = req.file;// read the uploaded file 
    if (!file) return res.status(400).json({ error: "No file uploaded." });

    //mimetype => ext  
    if (kind === "image" && !ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      return res.status(400).json({ error: "Unsupported image type." });
    }
    if (kind === "voice" && !ALLOWED_VOICE_TYPES.has(file.mimetype)) {
      return res.status(400).json({ error: "Unsupported audio type." });
    }

    // make the ext and the key 
    // i.e cat.png => split cat and png => and ext=png
    const ext = file.originalname.includes(".") ? file.originalname.split(".").pop()! : "";
    const key = buildMediaKey(userId, kind, ext); // create the media key 

    //upload the file to s3
    await uploadBufferToS3({ key, body: file.buffer, contentType: file.mimetype });
    const url = await getSignedMediaUrl(key);//get the signed url

    return res.json({ key, url });//return key and url
  } catch (err) {
    console.error("Upload error:", err);
    return res.status(500).json({ error: "Upload failed. Please try again." });
  }
});

export default router;