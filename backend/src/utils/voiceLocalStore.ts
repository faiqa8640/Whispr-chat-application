import fs from "fs";// fs stands for File System.
// It is a built-in Node.js module that lets you work with files and folders.
import path from "path";
// The path module helps build file paths correctly on different operating systems.
import { ENV } from "../config/env";


// _____________________________________________________

//Create temporary folder 
export const VOICE_TEMP_DIR = path.join(process.cwd(), "tmp", "voice-pending");
// process.cwd -> means curr working directory
//  now path.join => join the curr diretory +temp (folder)+  voice pendinhg
// i.e D:\EKEL\WHISPR-CHAT APPLICATION\backend\tmp\voice-pending
// hence This is where temporary voice files will be stored.
fs.mkdirSync(VOICE_TEMP_DIR, { recursive: true });
// this create the folder 
// mkdirsync means create  a directory 
// recursive: true => means without it that if there is no tempfolder =>  then node will thorugh an error 
// with it =>  the will create the folder itself automatically


// localFileNameFor_____________________________________________________

// This function converts an S3 key into a safe filename.
// take the media key as input  and return the string
// basically original the key is whispr/voice/123/file.webm 
// so / => is for the folder and it will create the folders 
// so we replace the / with __
// so the name of the file will become whispr__voice__123__file.webm
export function localFileNameFor(mediaKey: string): string {
  // \/ => means find / and 
  // g => means global => replace every slash  not only one 
  return mediaKey.replace(/\//g, "__"); 
  // replace means replace the text 
  // /\//=>this is the regular expresssion 
  // g means golbal so replace all of them with __
  // i.e
  // whispr/voice/123/file.webm (original)
  // whispr__voice__123__file.webm (after replacement)
}

// localFilePathFor_____________________________________________________

// Build the complete local path. => voice_temp_dir+file name 
//  it become something like // backend/tmp/voice-pending/whispr__voice__123__file.webm
export function localFilePathFor(mediaKey: string): string {
  // get the key of the object and return the string
  // suppose voice_temp_dir = backend/tmp/voice-pending and localfile name is whispr/voice/123/file.webm
  // so we join them together i,e:
  // backend/tmp/voice-pending/whispr__voice__123__file.webm
  return path.join(VOICE_TEMP_DIR, localFileNameFor(mediaKey));
}


// buildLocalVoiceUrl_____________________________________________________

// Create a URL that the browser can open. 
// input the media key and retur the url 
export function buildLocalVoiceUrl(mediaKey: string): string {
  // {ENV.PUBLIC_API_URL =>This is the base URL that browsers use to reach your backend.
  return `${ENV.PUBLIC_API_URL}/api/voice-local/${encodeURIComponent(localFileNameFor(mediaKey))}`;
  // i.e http://localhost:5000/api/voice-local/whispr__voice__123__abc.webm
  // encodeURIComponent(...) =>Some filenames may contain special characters.
  // i.e spaces are not save inside the url so we make the url safe
  //i.e hello world.mp3 to hello$world.mp3
}


// saveVoiceFileLocally_____________________________________________________

//this function save the voice file locally  to disk or computer
export async function saveVoiceFileLocally(mediaKey: string, buffer: Buffer): Promise<void> {
  // input the key and the buffer =>  buffer => is the actual file 

  // it means that go to the path where the file need to be store and 
  // and create the file and  write all teh bytes from the buffer 
  // before => voice-pending empty , after => voice=pending   whispr__voice__123__file.webm
  await fs.promises.writeFile(localFilePathFor(mediaKey), buffer);
  // it means that to the path  of the folder save that file 
  // writeFile -=> is used to write on the file
}


// _____________________________________________________

//this function  delete the voice file locally  from disk
export async function deleteVoiceFileLocally(mediaKey: string): Promise<void> {
  // return a promise => before it there was a version = where we use the callback
  await fs.promises.unlink(localFilePathFor(mediaKey)); //after it the media-pending folder become emptyy
  // unlink is used for deleting the file 
}


// _____________________________________________________
// this is just the content type table / lookup table => if the expt is out of them it is voice msg

export const VOICE_EXT_CONTENT_TYPE: Record<string, string> = {
  webm: "audio/webm",
  ogg: "audio/ogg",
  mp3: "audio/mpeg",
  mp4: "audio/mp4",
  wav: "audio/wav",
  m4a: "audio/x-m4a",
};