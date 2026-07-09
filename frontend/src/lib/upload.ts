const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

export interface UploadResult {
  key: string;
  url: string;
}

export async function uploadMedia(
  file: File | Blob,
  kind: "image" | "voice",
  filename: string
): Promise<UploadResult> {
  const formData = new FormData();
  formData.append("file", file, filename);

  const res = await fetch(`${API_BASE}/api/upload?kind=${kind}`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
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