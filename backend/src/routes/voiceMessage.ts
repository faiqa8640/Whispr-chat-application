import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { verifyToken } from "../utils/token.js";
import User from "../models/User.js";
import Message from "../models/Message.js";
import { buildMediaKey, uploadBufferToS3, deleteMediaObject } from "../utils/s3.js";
import { formatMessage } from "../graphql/resolvers/messageResolvers.js";
import { pubsub, EVENTS } from "../graphql/pubsub.js";
import {
  VOICE_TEMP_DIR,
  localFilePathFor,
  saveVoiceFileLocally,
  deleteVoiceFileLocally,
  VOICE_EXT_CONTENT_TYPE,
} from "../utils/voiceLocalStore.js";

// POST /voice-message — 
// receives a voice file, saves it locally, creates the message, sends it to both users, then uploads it to S3 in the background.
//GET /voice-local/:key — 
// temporarily streams a voice file from your backend’s local disk while it is still waiting to move to S3.

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB hard cap, same as image uploads
});

const ALLOWED_VOICE_TYPES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/x-m4a",
]);

const EXT_FOR_MIME: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "mp4",
  "audio/wav": "wav",
  "audio/x-m4a": "m4a",
};

const router = Router();

// ── Send a voice message ──────────────────────────────────────────────────
// Unlike images, voice messages don't go through the GraphQL sendMessage
// mutation at all. This single REST endpoint does the whole job so the
// receiver can get a playable message immediately instead of waiting on
// an S3 round trip:
//   1. save the audio to local disk
//   2. create the Message doc + publish it (still pointing at the local file)
//   3. respond to the sender right away
//   4. in the background: upload to S3, flip the message over, delete the
//      local scratch file
router.post("/voice-message", upload.single("file"), async (req, res) => {
 // upload.single ->is Multer middleware.
//  It expects exactly one uploaded file whose form-data field name is "file"
  try {
    const token = req.cookies?.delina_token;
    if (!token) return res.status(401).json({ error: "Not authenticated." });

    let senderId: string;
    try {
      senderId = verifyToken(token).id;
    } catch {
      return res.status(401).json({ error: "Session expired. Please log in again." });
    }

    const sender = await User.findById(senderId);
    if (!sender || sender.isDeleted) {
      return res.status(401).json({ error: "Not authenticated." });
    }

    const file = req.file;
    if (!file) return res.status(400).json({ error: "No audio file uploaded." });
    if (!ALLOWED_VOICE_TYPES.has(file.mimetype)) {
      return res.status(400).json({ error: "Unsupported audio type." });
    }

    const receiverId = req.body.receiverId as string | undefined;
    if (!receiverId) return res.status(400).json({ error: "receiverId is required." });
    if (receiverId === senderId) {
      return res.status(400).json({ error: "You can't message yourself." });
    }

    const receiver = await User.findById(receiverId);
    if (!receiver) return res.status(404).json({ error: "Recipient not found." });
    if (receiver.isDeleted) {
      return res.status(400).json({ error: "This account no longer exists." });
    }

    // This code is used when a user replies to an existing message.
    let replyTo: string | undefined;
    const replyToId = req.body.replyToId as string | undefined;//store the id of the msg being replied to
    if (replyToId) {// if reply to exist
      const original = await Message.findById(replyToId);//find that messsage 
      if (
        original &&// if that original msg exist
        // check weather the the original msg sender is equal to sender of convo and receiver is = to receiver of convoo ||
        //cheack weather the original msg receiver is equal to sender of the convo and sender 0f the msg is == to receiver of the convo
        ((original.sender.toString() === senderId && original.receiver.toString() === receiverId) ||
          (original.receiver.toString() === senderId && original.sender.toString() === receiverId))
      ) {
        replyTo = replyToId;
      }
    }

    const rawDuration = req.body.mediaDuration as string | undefined;//store duration of msg 
    const mediaDuration = rawDuration ? Number(rawDuration) : undefined;
    // store media duration in numbders form

    const ext = EXT_FOR_MIME[file.mimetype] || "webm"; //store the ext
    const mediaKey = buildMediaKey(senderId, "voice", ext);// built the media key

    // 1) Save to local disk immediately.
    await saveVoiceFileLocally(mediaKey, file.buffer);/// save the file locally in dissk

    // 2) Create + publish the message right away, pointing at the local file.
    const message = await Message.create({//creat the  msg right way
      sender: senderId,
      receiver: receiverId,
      content: "",
      type: "voice",
      mediaKey,
      mediaDuration,
      mediaPending: true,
      replyTo,
    });

    const populated = await message.populate<{ sender: any; receiver: any; replyTo: any }>([
      "sender",
      "receiver",
      { path: "replyTo", populate: "sender" },
      "reactions.user",
    ]);
    const formatted = await formatMessage(populated);

    pubsub.publish(EVENTS.MESSAGE_RECEIVED, { messageReceived: formatted });
    res.json(formatted);

    // 3) Fire-and-forget: push the same bytes up to S3, then flip the
    // message over to permanent storage and clean up the scratch file.
    void (async () => {
      try {
        await uploadBufferToS3({ key: mediaKey, body: file.buffer, contentType: file.mimetype });
      } catch (err) {
        console.error("Background S3 upload for voice message failed:", err);
        // Leave mediaPending true and the local file in place — it's still
        // playable via the local route, just never gets migrated.
        return;
      }

      const current = await Message.findById(message._id);
      if (!current) {
        // The message was unsent while the upload was in flight — the S3
        // object we just uploaded is now orphaned (unsendMessage already
        // cleaned up the local scratch file), so just remove that.
        await deleteMediaObject(mediaKey).catch(() => {});
        return;
      }

      current.mediaPending = false; //it means that there is no media pending nd the file has been uploaded in bucket
      await current.save();// write this is  db 

      const repopulated = await Message.findById(current._id).populate<{ //repopulte the msg aagain
        sender: any;
        receiver: any;
        replyTo: any;
      }>(["sender", "receiver", { path: "replyTo", populate: "sender" }, "reactions.user"]);

      if (repopulated) {
        const editedFormatted = await formatMessage(repopulated);//format the msg
        pubsub.publish(EVENTS.MESSAGE_EDITED, { messageEdited: editedFormatted });//publish the msg
      }

      await deleteVoiceFileLocally(mediaKey).catch((err) => {// locally delete the msg
        console.error("Failed to remove local voice scratch file:", err);
      });
    })();
  } catch (err) {
    console.error("Voice message error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Could not send voice message. Please try again." });
    }
  }
});

// ── Stream a still-pending voice message straight off local disk ─────────
//GET /voice-local/:key — 
// temporarily streams a voice file from your backend’s local disk while it is still waiting to move to S3.

// Serve voice messages that are still stored locally while they're uploading to S3.
router.get("/voice-local/:key", async (req, res) => {
  const key = req.params.key;// get the key from the request parameter

  if (!/^[A-Za-z0-9._-]+$/.test(key) || key.includes("..")) {//security check 
    // check that weather the key is valid or not 
    // it shouldnot contain any special character anf 
    // and it should not include .. i.e ../../package.json 
    // otherwise the attacker can attack
    return res.status(400).json({ error: "Invalid key." });
  }

  const filePath = path.resolve(path.join(VOICE_TEMP_DIR, key));
  // path.join()=> combine the folder names
  // path.resolve ()=>> convert it into the absolute path
  // i.e D:\Project\backend\tmp\voice-pending\voice.webm
  if (!filePath.startsWith(path.resolve(VOICE_TEMP_DIR) + path.sep)) {
    // Every valid voice file should start with  some valid  path such as 
    // D:\backend\tmp\voice-pending\ ..
    // if not this it will show the error
    return res.status(400).json({ error: "Invalid key." });
  }

  try {// it basically check that weather the file exist or not?
    await fs.promises.access(filePath, fs.constants.R_OK);
    // access=> can i read this file 
    // R_OK  means readable
  } catch {
    return res.status(404).json({
      error: "This voice message has already moved to permanent storage.",
    });
  }

  const ext = path.extname(filePath).slice(1).toLowerCase();// get the ext
  // set content type i.e webm => 
  res.setHeader("Content-Type", VOICE_EXT_CONTENT_TYPE[ext] || "application/octet-stream");
  fs.createReadStream(filePath)//this create the scream
  // this open the file and It does not load the whole file into RAM.
  //balke send in chunks
    .on("error", () => {
      if (!res.headersSent) res.status(500).end();
    })
    .pipe(res);
});

export default router;