import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { ENV } from "../config/env";

// S3Client → the object that connects your Node backend to AWS S3.
// PutObjectCommand → command used to upload a file into S3.
// GetObjectCommand → command used to read/download a file from S3.
// DeleteObjectCommand → command used to permanently remove a file from S3.
// signedurl->your backend generates a URL with permission embedded inside it for a limited time, such as one hour.
// using signedurl as the bucket is private
// randomuuid-> create a unique id for each upload
export const s3 = new S3Client({//making s3 client
  region: ENV.AWS_REGION,
  credentials: {
    accessKeyId: ENV.AWS_ACCESS_KEY_ID,
    secretAccessKey: ENV.AWS_SECRET_ACCESS_KEY,
  },
});

// Everything for this app lives under whispr/ in the shared bucket,
const APP_FOLDER = "whispr";

// It means any variable of this type can only be one of these values:
// mediakind is the tyepscript type
export type MediaKind = "image" | "voice";

// buildMediaKey--------------------------------
// this file create a s3  storage key or path for a media file
// userId → ID of the user uploading the media.
// kind → either "image" or "voice".
// ext → file extension, such as "png", "jpg", "webm", or "mp3".
// It returns a string, which will become the S3 object key.
export function buildMediaKey(userId: string, kind: MediaKind, ext: string): string {
  const sub = kind === "image" ? "images" : "voice";
  // if kind== image then sub contain images otherwise voice
  // This cleans the extension before adding it to the filename.
  // if ext exists, clean it and add a dot before it
  // if it does not exist, use an empty string
  // then removes every character that is not a letter or number.
  // then makes the extension lowercase
  const safeExt = ext ? `.${ext.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()}` : "";
  // if ext=JPG --> safeExt=".jpg"
  return `${APP_FOLDER}/${sub}/${userId}/${randomUUID()}${safeExt}`;
  // This builds the final S3 key.
  // something like whispr/images/6873ab123/4c1f8d6b-8d24-4d75-8e5d-95e1b7d9f7f2.jpg
}


// uploadBufferToS3--------------------------------
// This starts an async function that uploads a file to S3.
// why Buffer => basically when we upload the image the computer dont understand pic.png 
// and computer only understand the bytes  
// so we convert the images/voice => into buffer 
// **** A Buffer is simply a container that stores those bytes in memory.
// SO BUFFER => is teh actual file 
// It receives one object(or pakage) called params. => that contain key , body and contentType 
export async function uploadBufferToS3(params: {
  key: string;//The exact path of the path inside the s3
  body: Buffer;//The actual file data in memory.
  // When you upload using Multer memory storage, uploaded files are usually available as file.buffer
  contentType: string;// what type of file it is it  =? i.e audio or image etc 
}): Promise<void> {
  await s3.send(//This is the AWS SDK.
    // Think of s3 as your connection to AWS.
    // backend => s3client=>aws 
    // .send => means plz perform this operation =>putobjectcommand operation 
    new PutObjectCommand({//upload the object to s3
      Bucket: ENV.AWS_BUCKET_NAME, //name of the bucket 
      // set the params 
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
    })
  );
} 


// getSignedMediaUrl--------------------------------

// Bucket stays private; we hand out short-lived signed URLs to view media
// instead of making objects public.
// this function creates a temporary URL for one private S3 object.
// key → the S3 key stored in MongoDB. and url expires in the 1 hr

//key: string => is the path of the file in s3 
//expiresInSeconds => expires in 1 hr 
// return the signed url =>> that help the frontned to show the pic 
export async function getSignedMediaUrl(key: string, expiresInSeconds = 3600): Promise<string> {
  // This creates a command for reading one object from S3.
  // it means Get the object from this bucket using this key.
  const command = new GetObjectCommand({ Bucket: ENV.AWS_BUCKET_NAME, Key: key });
  return getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
  // This generates and returns a signed URL
  // s3 → your authenticated AWS S3 client
  // command → the request to get a specific file/ get this file 
  // expiresIn → how long the URL stays valid/ how long the permission last 

  // the getsignedurl => return a long string / url that contain permission , expires time , didgital signature 
}


// deleteMediaObject--------------------------------

// Permanently removes one object from the bucket. Used when a message
// (image/voice) is unsent — since this app has no soft-delete/restore
// feature for messages anymore, there's no reason to keep the orphaned
// file sitting in S3 racking up storage. Caller decides how to handle
// failures (we treat this as best-effort at the call site).
export async function deleteMediaObject(key: string): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: ENV.AWS_BUCKET_NAME,
      Key: key,
    })
  );
}