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