
import { Router } from "express";
import multer from "multer";// get us req.file 
import fs from "fs";
import path from "path";
import { verifyToken } from "../utils/token";
import User from "../models/User";
import Message, { MessageType } from "../models/Message"; 
import { buildMediaKey, uploadBufferToS3, deleteMediaObject } from "../utils/s3";
import { resolveMediaUrl } from "../utils/mediaUrl";
// Formats the message before sending it to frontend.
import { formatMessage } from "../graphql/resolvers/messageResolvers";
import { pubsub, EVENTS } from "../graphql/pubsub";
import {
  VOICE_TEMP_DIR,
  localFilePathFor,
  saveVoiceFileLocally,
  deleteVoiceFileLocally,
  VOICE_EXT_CONTENT_TYPE,
} from "../utils/voiceLocalStore";
import Resource, {ResourceType, ResourceStatus} from "../models/Resource";
import { findOrCreateConversation } from "../utils/conversationHelpers";

// POST /voice-message — 
// receives a voice file, saves it locally, creates the message, sends it to both users, then uploads it to S3 in the background.
//GET /voice-local/:key — 
// temporarily streams a voice file from your backend’s local disk while it is still waiting to move to S3.


//why not graphql => cox GraphQL is excellent for JSON data. but voice messages are files
// a file upload uses multipart/form-data thats why we use the rest 

// flow : 
// Ali records voice => POST /voice-message => Server receives audio => saved locally
// =>Create Message in MongoDB  =>Immediately send to Sara => Upload to S3 (background) 
// =>Delete local file

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
  //It converts MIME type into file extension.
  // MIME TYPE => is a standard way of telling computers what kind of file something is.
  // i.e file name = cat.png => mime type = cat/png =>  it tell that the file is exactly png 
  // not just named png 
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "mp4",
  "audio/wav": "wav",
  "audio/x-m4a": "m4a",
};

const router = Router(); // create  a react router 

// ── Send a voice message (by sender)──────────────────────────────────────────────────
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
    const token = req.cookies?.delina_token; // get the token 
    // if token dont exist then  return  authenticated 
    if (!token) return res.status(401).json({ error: "Not authenticated." });

    let senderId: string;
    try {
      senderId = verifyToken(token).id;// get the sender id 
    } catch {// eslse error 
      return res.status(401).json({ error: "Session expired. Please log in again." });
    }

    // find the sender from the db 
    const sender = await User.findById(senderId); // get the sender from the db 
    if (!sender || sender.deletedAt) {// if sender not exist or is deleteed  then not auethenticated 
      return res.status(401).json({ error: "Not authenticated." });// error 
    }

    const file = req.file;// read uploaded file 
    // if file dont exist 
    if (!file) return res.status(400).json({ error: "No audio file uploaded." });
    //if the file is not uploaded 
    if (!ALLOWED_VOICE_TYPES.has(file.mimetype)) {
      return res.status(400).json({ error: "Unsupported audio type." });
    }

    //get the receiver id 
    const receiverId = req.body.receiverId as string | undefined;// get the reciever id from the body 
    // if no receiver exist 
    if (!receiverId) return res.status(400).json({ error: "receiverId is required." });
    if (receiverId === senderId) { // if sending msg to myself
      return res.status(400).json({ error: "You can't message yourself." });
    }

    const receiver = await User.findById(receiverId); // get the receiver from db 
    if (!receiver) return res.status(404).json({ error: "Recipient not found." });
    // //if not exist then error and if is deleted 
    if (receiver.deletedAt) {
      return res.status(400).json({ error: "This account no longer exists." });
    }

    // This code is used when a user replies to an existing message.
    let replyTo: string | undefined;// a varibale that contain the id of the message we have to reply to 
    const replyToId = req.body.replyToId as string | undefined;//store the id of the msg being replied to
    if (replyToId) {// if reply to exist
      const original = await Message.findById(replyToId);//find that messsage 
      if (
        original &&// if that original msg exist
        // Does this original message belong to THIS conversation?
        // check weather the the original msg sender is equal to sender of convo and receiver is = to receiver of convoo ||
        //cheack weather the original msg receiver is equal to sender of the convo and sender 0f the msg is == to receiver of the convo
        ((original.sender.toString() === senderId && original.receiver.toString() === receiverId) ||
          (original.receiver.toString() === senderId && original.sender.toString() === receiverId))
      ) {
        replyTo = replyToId; // if yrs save the mesage if
      }
    }

    const rawDuration = req.body.mediaDuration as string | undefined;//store duration of msg  => in strings 
    const mediaDuration = rawDuration ? Number(rawDuration) : undefined;// in numbers
    // store media duration in numbders form

    const ext = EXT_FOR_MIME[file.mimetype] || "webm"; //store the ext
    const mediaKey = buildMediaKey(senderId, "voice", ext);// built the media key

    // making or finding the convo 
    const conversation = await findOrCreateConversation(senderId, receiverId);

    // 1) Save to local disk immediately.
    await saveVoiceFileLocally(mediaKey, file.buffer);/// save the file locally in dissk

    //creating the resource document 
    const resource = await Resource.create({
      name : `voice-${Date.now()}.${ext}`,
      s3key : mediaKey,
      type : ResourceType.VOICE,
      mimeType: file.mimetype,
      size: file.size,
      status : ResourceStatus.PENDING,
      uploadedBy: senderId,
      voiceMetadata: mediaDuration != null ? {duration: mediaDuration}: undefined,
    });

    // 2) Create + publish the message right away, pointing at the local file.
    const message = await Message.create({//creat the  msg right way
      conversation : conversation._id,
      sender: senderId,
      receiver: receiverId,
      content: "",
      type: MessageType.VOICE,
      resource: resource._id,
      replyTo,
    });

    // any => means that i dont create about what type it is 
    // populating the sender, receiver etc 
    const populated = await message.populate<{ sender: any; receiver: any; resource: any ;replyTo: any }>([
      "sender",
      "receiver",
      "resource",
      { path: "replyTo",
        populate: [{path:"sender"},{path:"resource"}] }, // fisr populate the replay to then populate the sender of that message 
      "reactions.user", //populate which person give the reaction 
    ]);
    const formatted = await formatMessage(populated); // format the message

    (formatted as any).mediaUrl = await resolveMediaUrl(populated.resource);
    // now publish the messaage 
    pubsub.publish(EVENTS.MESSAGE_RECEIVED, { messageReceived: formatted });
    res.json(formatted); // response in json 

    // 3) Fire-and-forget: push the same bytes up to S3, then flip the
    // message over to permanent storage and clean up the scratch file.
    void (async () => {
      try {// uploading the voice message in the background 
        await uploadBufferToS3({ key: mediaKey, body: file.buffer, contentType: file.mimetype });
      } catch (err) {
        console.error("Background S3 upload for voice message failed:", err);
        // Leave mediaPending true and the local file in place — it's still
        // playable via the local route, just never gets migrated.
        return;
      }

      //finding the current message 
      const current = await Message.findById(message._id);
      if (!current) { // if not founded 
        // The message was unsent while the upload was in flight — the S3
        // object we just uploaded is now orphaned (unsendMessage already
        // cleaned up the local scratch file), so just remove that.
        await deleteMediaObject(mediaKey).catch(() => {});
        return;
      }
      // find the resouce and updated it to uploaded 
      await  Resource.findByIdAndUpdate(resource._id, {status: ResourceStatus.UPLOADED});

      const repopulated = await Message.findById(current._id).populate<{ //repopulte the msg aagain
        sender: any;
        receiver: any;
        resource: any;
        replyTo: any;
      }>(["sender", "receiver","resource", { path: "replyTo", 
        populate: [{path: "sender"}, {path: "resource"}] }, "reactions.user"]);

      if (repopulated) {// why we called this event coz message is changes  
        // previously locally store => now on s3 
        const editedFormatted = await formatMessage(repopulated);//format the msg
        pubsub.publish(EVENTS.MESSAGE_EDITED, { messageEdited: editedFormatted });//publish the msg
      }

      await deleteVoiceFileLocally(mediaKey).catch((err) => {// locally delete the msg
        console.error("Failed to remove local voice scratch file:", err);
      });
    })();
  } catch (err) {
    console.error("Voice message error:", err);
    if (!res.headersSent) {// header dont contain the messgage then error 
      res.status(500).json({ error: "Could not send voice message. Please try again." });
    }
  }
});




// ── Used to play the voice message while it is still uploading to S3 ─────────--------------
//GET /voice-local/:key — 
// temporarily streams a voice file from your backend’s local disk while it is still waiting to move to S3.

// Serve voice messages that are still stored locally while they're uploading to S3.
router.get("/voice-local/:key", async (req, res) => {
  const key = req.params.key;// get the key from the request parameter

  if (!/^[A-Za-z0-9._-]+$/.test(key) || key.includes("..")) {//security check 
    // /^[A-Za-z0-9._-]+$/ => is a regular expression 
    // it means only allowed =>A-Z , a-z , 0-9 , . , _, -
    // .test => return the true and false 
    // and key.includes(..) => this blocks the path traversal attacks ***
    // i.e ../../package.json => without the hacker can try the /voice-local/../../../../config.env
    // so your server might accidently send the secret files  so .. will be blocked 
    // check that weather the key is valid or not 
    // it shouldnot contain any special character anf 
    // and it should not include .. i.e ../../package.json 
    // otherwise the attacker can attack
    return res.status(400).json({ error: "Invalid key." });
  }

  const filePath = path.resolve(path.join(VOICE_TEMP_DIR, key));
  // path.join()=> combine the folder names
  // path.resolve ()=>> convert it into the absolute path => add the d folder project etc before temp
  // i.e D:\Project\backend\tmp\voice-pending\voice.webm
  if (!filePath.startsWith(path.resolve(VOICE_TEMP_DIR) + path.sep)) {//another security check.
    // Every valid voice file should start with  some valid  path such as 
    // D:\backend\tmp\voice-pending\ ..
    // if not this it will show the error
    // it means that the file should remain inside the specfic folder 
    // path.sep => means / or \ depding on windows or linux
    return res.status(400).json({ error: "Invalid key." });
  }

  try {// it basically check that weather the file exist or not?
    await fs.promises.access(filePath, fs.constants.R_OK);
    // access=> can i read this file /  is this file exist?
    // R_OK  means readable => read permission  => node provide the file constants
  } catch {// if not exist then this error 
    return res.status(404).json({
      error: "This voice message has already moved to permanent storage.",
    });
  }

  const ext = path.extname(filePath).slice(1).toLowerCase();// get the ext
  // set content type i.e webm => 
  // application/octet-stream => if extension isnot found then send the  generic binary file
  res.setHeader("Content-Type", VOICE_EXT_CONTENT_TYPE[ext] || "application/octet-stream");
  fs.createReadStream(filePath)//this create the scream => streaming 
  // this open the file and It does not load the whole file into RAM.
  //balke send in chunks
    .on("error", () => { // if error 
      if (!res.headersSent) res.status(500).end();
    })
    // file => readstream=> pipe() => express response => browser
    .pipe(res);
});

export default router;
