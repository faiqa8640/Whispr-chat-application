//media API service of your application.
// we have 2 different flow 
// 1) image upload and  2) voice upload 

//this stores the backend url
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

export interface UploadResult {// it describe the shape of the data => backend return thres 2 
  key: string;// key is the media key and 
  url: string;// 
}

export async function uploadMedia(// this function upload one media file 
  file: File | Blob,// can accept image file or audio blob
  // audio blob is just and object in the browser that contain the file like data 
  kind: "image" | "voice", // only 2 values are allowed 
  filename: string// get the file name 
): Promise<UploadResult> { // return the promise and return the key and url after uploading 
  const formData = new FormData(); // store the form data 
  formData.append("file", file, filename);// add one field 
  // file=image.png => backend receives the req.file through the multer 

  const res = await fetch(`${API_BASE}/api/upload?kind=${kind}`, {
    method: "POST",// uploading chnage the server data so post 
    credentials: "include",//added the cookies 
    body: formData,// added the body
  });

  if (!res.ok) { // is reposnse is not okay then return the error 
    const body = await res.json().catch(() => ({})); // 
    throw new Error(body.error || "Upload failed. Please try again.");
  }

  return res.json();
}

// The shape returned by POST /api/voice-message — matches the GraphQL
// Message type, since the backend builds it with the same formatMessage().
export interface VoiceMessageResult {
  id: string;
  content: string;
  type: "voice";
  mediaUrl: string | null;
  mediaDuration: number | null;
  createdAt: string;
  read: boolean;
  deleted: boolean;
  // NEW: formatMessage() on the backend now always includes this field
  // (WhatsApp/Instagram-style "(edited)" flag) — voice messages have no
  // caption to edit in this app, so it's always false in practice here,
  // but the field must exist on this type or `message as MessageItem`
  // casts in ChatWindow.tsx fail to type-check (MessageItem requires it).
  edited: boolean;
  sender: {
    id: string;
    name: string;
    avatar: string | null;
    isOnline: boolean;
    lastSeen: string | null;
    isDeleted?: boolean;
  };
  receiver: {
    id: string;
    name: string;
    avatar: string | null;
    isOnline: boolean;
    lastSeen: string | null;
    isDeleted?: boolean;
  };
  replyTo: {
    id: string;
    content: string;
    type: string;
    mediaUrl: string | null;
    deleted: boolean;
    sender: { id: string; name: string; avatar: string | null };
  } | null;
  // Backend's formatMessage() now always includes this — empty on a
  // fresh voice message, but keep the shape consistent with MessageItem.
  reactions: { emoji: string; user: { id: string; name: string } }[];
}

/**
 * Sends a voice message in one shot: uploads the audio AND creates the
 * message server-side (unlike images, which upload first then call the
 * sendMessage GraphQL mutation separately). The backend saves the file
 * locally, publishes the message immediately, and migrates it to S3 in
 * the background — this call returns as soon as that first, local-backed
 * message exists.
 */
export async function sendVoiceMessage(params: {
  file: Blob;
  filename: string;
  receiverId: string;
  replyToId?: string;
  mediaDuration?: number;
}): Promise<VoiceMessageResult> {
  const formData = new FormData();
  formData.append("file", params.file, params.filename);
  formData.append("receiverId", params.receiverId);
  if (params.replyToId) formData.append("replyToId", params.replyToId);
  if (params.mediaDuration != null) {
    formData.append("mediaDuration", String(params.mediaDuration));
  }

  const res = await fetch(`${API_BASE}/api/voice-message`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not send voice message. Please try again.");
  }

  return res.json();
}