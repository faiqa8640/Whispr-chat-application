import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { gql } from "../lib/gqlClient";
import {
  MESSAGES_QUERY,
  SEND_MESSAGE_MUTATION,
  MARK_CONVERSATION_READ_MUTATION,
  UNSEND_MESSAGE_MUTATION,
  SET_TYPING_MUTATION,
  USER_STATUS_QUERY,
} from "../lib/mutations";
import { uploadMedia, sendVoiceMessage } from "../lib/upload";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useMessageSubscription } from "../lib/useMessageSubscription";
import { useReadReceiptSubscription } from "../lib/useReadReceiptSubscription";
import { useUserUpdatedSubscription } from "../lib/useUserUpdatedSubscription";
import { useMessageUnsentSubscription } from "../lib/useMessageUnsentSubscription";
import { useMessageEditedSubscription } from "../lib/useMessageEditedSubscription";
import { useTypingSubscription } from "../lib/useTypingSubscription";
import { useUserStatusSubscription } from "../lib/useUserStatusSubscription";
import MessageTicks from "../components/chat/MessageTicks";
import VoiceMessagePlayer from "../components/chat/VoiceMessagePlayer";

type MessageKind = "text" | "image" | "voice";

interface MessageItem {
  id: string;
  content: string;
  type: MessageKind;
  mediaUrl: string | null;
  mediaDuration: number | null;
  createdAt: string;
  read: boolean;
  deleted: boolean;
  sender: { id: string; name: string; avatar: string | null; isDeleted?: boolean };
  receiver: { id: string; name: string; avatar: string | null; isDeleted?: boolean };
  replyTo: {
    id: string;
    content: string;
    type: MessageKind;
    mediaUrl: string | null;
    deleted: boolean;
    sender: { id: string; name: string; avatar: string | null };
  } | null;
}

const TYPING_STOP_DELAY_MS = 2000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB

// Base URL of our own backend — used both for GraphQL/upload calls
// elsewhere in the app and here for the download-proxy endpoint below.
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

function auraFor(_name: string) {
  return "linear-gradient(135deg, #A06CD5, #815AC0)";
}

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatDayLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

function formatLastSeen(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `last seen today at ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `last seen yesterday at ${time}`;
  return `last seen ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

function formatDuration(seconds: number | null) {
  if (!seconds && seconds !== 0) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

// ── Image lightbox ──────────────────────────────────────────────────────────
// WhatsApp-style: tapping a photo bubble opens it full-size on a dark
// overlay, with a way to actually save the file (not just view it inline).
function ImageLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  async function handleDownload() {
    setDownloadError("");
    setIsDownloading(true);
    try {
      // We DON'T fetch the S3 signed URL directly from the browser — the
      // bucket is shared across other teams' projects and isn't (and
      // shouldn't be, without going through the team lead) configured
      // with CORS for our origin, so a direct `fetch(url)` here would
      // always fail with a CORS error, even though the <img> tag above
      // can render it fine (plain <img> loads never go through CORS).
      //
      // Instead we route through our own backend: browser -> our server
      // (same-origin, no CORS involved) -> our server fetches the S3
      // bytes itself (server-to-server calls are never subject to CORS,
      // that's a browser-only restriction) -> streams them back to us.
      // The bucket's configuration is never touched.
      const filename = `whispr-photo-${Date.now()}.jpg`;
      const proxyUrl = `${API_BASE}/api/download?url=${encodeURIComponent(
        url
      )}&filename=${encodeURIComponent(filename)}`;

      const res = await fetch(proxyUrl, { credentials: "include" });
      if (!res.ok) throw new Error("Could not fetch the image.");
      const blob = await res.blob();

      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      setDownloadError("Couldn't download the image. Try again.");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 px-4 py-8"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      <img
        src={url}
        alt="Full size"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] max-w-full rounded-lg object-contain shadow-2xl"
      />

      <div
        className="absolute bottom-8 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleDownload}
          disabled={isDownloading}
          className="flex items-center gap-2 rounded-full bg-white px-5 py-2.5 font-body text-sm font-semibold text-whispr-noir shadow-lg transition hover:bg-whispr-linen disabled:opacity-70"
        >
          {isDownloading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-whispr-noir border-t-transparent" />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
          {isDownloading ? "Downloading…" : "Save image"}
        </button>
        {downloadError && (
          <p className="rounded-md bg-white/10 px-3 py-1.5 font-body text-xs text-white">{downloadError}</p>
        )}
      </div>
    </div>
  );
}

export default function ChatWindow() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { theme } = useTheme();
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [partnerName, setPartnerName] = useState("");
  const [partnerAvatar, setPartnerAvatar] = useState<string | null>(null);
  const [partnerOnline, setPartnerOnline] = useState(false);
  const [partnerLastSeen, setPartnerLastSeen] = useState<string | null>(null);
  const [partnerDeleted, setPartnerDeleted] = useState(false);
  const [replyingTo, setReplyingTo] = useState<MessageItem | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [partnerTyping, setPartnerTyping] = useState(false);
  // Holds the mediaUrl of whichever photo is currently open in the
  // full-size lightbox; null means the lightbox is closed.
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // ── Media sharing state ─────────────────────────────────────────────────
  const [mediaError, setMediaError] = useState("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isUploadingVoice, setIsUploadingVoice] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordCancelledRef = useRef(false);

  const isTypingActiveRef = useRef(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function sendTyping(isTyping: boolean) {
    if (!userId || partnerDeleted) return;
    gql(SET_TYPING_MUTATION, { receiverId: userId, isTyping }).catch(() => {});
  }

  function stopTypingNow() {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    if (isTypingActiveRef.current) {
      isTypingActiveRef.current = false;
      sendTyping(false);
    }
  }

  function handleDraftChange(value: string) {
    setDraft(value);
    if (!userId || partnerDeleted) return;

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    if (!value.trim()) {
      stopTypingNow();
      return;
    }

    if (!isTypingActiveRef.current) {
      isTypingActiveRef.current = true;
      sendTyping(true);
    }

    typingTimeoutRef.current = setTimeout(() => {
      isTypingActiveRef.current = false;
      sendTyping(false);
    }, TYPING_STOP_DELAY_MS);
  }

  function lockAsDeleted() {
    setPartnerDeleted(true);
    setPartnerName("Deleted User");
    setPartnerAvatar(null);
    setPartnerOnline(false);
    setPartnerLastSeen(null);
    setPartnerTyping(false);
    stopTypingNow();
  }

  async function loadMessages() {
    if (!userId) return;
    const data = await gql<{ messages: MessageItem[] }>(MESSAGES_QUERY, {
      withUserId: userId,
      limit: 100,
    });
    setMessages(data.messages);
    const withPartner = data.messages.find((m) => m.sender.id === userId || m.receiver.id === userId);
    if (withPartner) {
      const partner = withPartner.sender.id === userId ? withPartner.sender : withPartner.receiver;
      if (partner.isDeleted) {
        lockAsDeleted();
      } else {
        setPartnerName(partner.name);
        setPartnerAvatar(partner.avatar);
      }
    }
    setLoading(false);
    if (!withPartner?.sender.isDeleted && !withPartner?.receiver.isDeleted) {
      await gql(MARK_CONVERSATION_READ_MUTATION, { withUserId: userId }).catch(() => {});
    }
  }

  async function loadPartnerStatus() {
    if (!userId) return;
    try {
      const data = await gql<{
        userStatus: { userId: string; isOnline: boolean; lastSeen: string | null; isDeleted: boolean };
      }>(USER_STATUS_QUERY, { userId });
      if (data.userStatus.isDeleted) {
        lockAsDeleted();
      } else {
        setPartnerOnline(data.userStatus.isOnline);
        setPartnerLastSeen(data.userStatus.lastSeen);
      }
    } catch {
      // Non-critical
    }
  }

  useEffect(() => {
    setLoading(true);
    const state = location.state as { partnerName?: string; partnerAvatar?: string | null } | null;
    setPartnerName(state?.partnerName ?? "");
    setPartnerAvatar(state?.partnerAvatar ?? null);
    setPartnerTyping(false);
    setPartnerOnline(false);
    setPartnerLastSeen(null);
    setPartnerDeleted(false);
    setMediaError("");
    loadMessages();
    loadPartnerStatus();

    return () => {
      stopTypingNow();
      if (isRecording) cancelRecording();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, partnerTyping]);

  useMessageSubscription((data) => {
    const msg = data.messageReceived as MessageItem;
    const isThisConversation =
      (msg.sender.id === userId && msg.receiver.id === user?.id) ||
      (msg.receiver.id === userId && msg.sender.id === user?.id);

    if (isThisConversation) {
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      if (msg.sender.id === userId) setPartnerTyping(false);
      if (msg.sender.id !== user?.id) {
        gql(MARK_CONVERSATION_READ_MUTATION, { withUserId: userId }).catch(() => {});
      }
    }
  });

  useReadReceiptSubscription(({ messagesRead }) => {
    if (messagesRead.readerId !== userId) return;
    setMessages((prev) => prev.map((m) => (m.sender.id === user?.id ? { ...m, read: true } : m)));
  });

  useTypingSubscription(({ typingStatus }) => {
    if (typingStatus.userId !== userId) return;
    setPartnerTyping(typingStatus.isTyping);
  });

  useUserUpdatedSubscription(({ userUpdated }) => {
    if (userUpdated.id !== userId) return;
    if (userUpdated.isDeleted) {
      lockAsDeleted();
      return;
    }
    setPartnerName(userUpdated.name);
    setPartnerAvatar(userUpdated.avatar);
  });

  useUserStatusSubscription(({ userStatusChanged }) => {
    if (userStatusChanged.userId !== userId) return;
    if (partnerDeleted) return;
    setPartnerOnline(userStatusChanged.isOnline);
    setPartnerLastSeen(userStatusChanged.lastSeen);
  });

  useMessageUnsentSubscription(({ messageUnsent }) => {
    const isThisConversation =
      (messageUnsent.sender.id === userId && messageUnsent.receiver.id === user?.id) ||
      (messageUnsent.receiver.id === userId && messageUnsent.sender.id === user?.id);
    if (!isThisConversation) return;

    setMessages((prev) =>
      prev.map((m) => (m.id === messageUnsent.id ? { ...m, deleted: true, content: "", mediaUrl: null } : m))
    );
  });

  // Live media migration — when a voice message we can see finishes its
  // background S3 upload, swap its mediaUrl to the permanent link.
  // VoiceMessagePlayer picks up the new url via its own [url] effect and
  // reloads the <audio> element in place, keeping playback position.
  useMessageEditedSubscription(({ messageEdited }) => {
    const isThisConversation =
      (messageEdited.sender.id === userId && messageEdited.receiver.id === user?.id) ||
      (messageEdited.receiver.id === userId && messageEdited.sender.id === user?.id);
    if (!isThisConversation) return;

    setMessages((prev) =>
      prev.map((m) => (m.id === messageEdited.id ? { ...m, mediaUrl: messageEdited.mediaUrl } : m))
    );
  });

  function scrollToMessage(id: string) {
    const el = messageRefs.current[id];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedId(id);
    setTimeout(() => setHighlightedId((cur) => (cur === id ? null : cur)), 1200);
  }

  async function handleSend() {
    if (!draft.trim() || !userId || partnerDeleted) return;
    const content = draft.trim();
    const replyToId = replyingTo?.id;
    setDraft("");
    setReplyingTo(null);
    stopTypingNow();
    try {
      const data = await gql<{ sendMessage: MessageItem }>(SEND_MESSAGE_MUTATION, {
        receiverId: userId,
        content,
        type: "text",
        replyToId,
      });
      setMessages((prev) =>
        prev.some((m) => m.id === data.sendMessage.id) ? prev : [...prev, data.sendMessage]
      );
      setPartnerName((prev) => prev || data.sendMessage.receiver.name);
      setPartnerAvatar((prev) => prev ?? data.sendMessage.receiver.avatar);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message.toLowerCase().includes("no longer exists")) {
        lockAsDeleted();
      } else {
        setDraft(content);
      }
    }
  }

  async function handleSendMedia(type: "image" | "voice", mediaKey: string, mediaDuration?: number) {
    if (!userId || partnerDeleted) return;
    const replyToId = replyingTo?.id;
    setReplyingTo(null);
    stopTypingNow();
    try {
      const data = await gql<{ sendMessage: MessageItem }>(SEND_MESSAGE_MUTATION, {
        receiverId: userId,
        type,
        mediaKey,
        mediaDuration,
        replyToId,
      });
      setMessages((prev) =>
        prev.some((m) => m.id === data.sendMessage.id) ? prev : [...prev, data.sendMessage]
      );
      setPartnerName((prev) => prev || data.sendMessage.receiver.name);
      setPartnerAvatar((prev) => prev ?? data.sendMessage.receiver.avatar);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message.toLowerCase().includes("no longer exists")) {
        lockAsDeleted();
      } else {
        setMediaError(message || "Could not send. Please try again.");
      }
    }
  }

  // ── Image sharing ────────────────────────────────────────────────────────
  function handlePickImage() {
    if (partnerDeleted) return;
    imageInputRef.current?.click();
  }

  async function handleImageSelected(e: React.ChangeEvent<HTMLInputElement>) {
    setMediaError("");
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !userId || partnerDeleted) return;

    if (!file.type.startsWith("image/")) {
      setMediaError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setMediaError("That image is too large (max 10MB).");
      return;
    }

    setIsUploadingImage(true);
    try {
      const { key } = await uploadMedia(file, "image", file.name);
      await handleSendMedia("image", key);
    } catch (err) {
      setMediaError(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      setIsUploadingImage(false);
    }
  }

  // ── Voice recording ──────────────────────────────────────────────────────
  async function startRecording() {
    setMediaError("");
    if (partnerDeleted) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaError("Voice recording isn't supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordStreamRef.current = stream;
      audioChunksRef.current = [];
      recordCancelledRef.current = false;

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        recordStreamRef.current?.getTracks().forEach((t) => t.stop());
        if (recordTimerRef.current) {
          clearInterval(recordTimerRef.current);
          recordTimerRef.current = null;
        }
        const duration = recordSeconds;
        const wasCancelled = recordCancelledRef.current;
        recordCancelledRef.current = false;
        setRecordSeconds(0);
        if (wasCancelled) return;

        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size === 0) return;
        if (!userId || partnerDeleted) return;

        const replyToId = replyingTo?.id;
        stopTypingNow();

        setIsUploadingVoice(true);
        try {
          const ext = (recorder.mimeType || "audio/webm").includes("ogg") ? "ogg" : "webm";
          // One call does it all: the backend saves the file locally,
          // creates + publishes the message immediately (so the receiver
          // gets a playable bubble right away), and migrates it to S3 in
          // the background — see useMessageEditedSubscription above for
          // how the <audio> source gets swapped over once that finishes.
          const message = await sendVoiceMessage({
            file: blob,
            filename: `voice-${Date.now()}.${ext}`,
            receiverId: userId,
            replyToId,
            mediaDuration: duration,
          });
          setReplyingTo(null);
          setMessages((prev) =>
            prev.some((m) => m.id === message.id) ? prev : [...prev, message as MessageItem]
          );
          setPartnerName((prev) => prev || message.receiver.name);
          setPartnerAvatar((prev) => prev ?? message.receiver.avatar);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "";
          if (msg.toLowerCase().includes("no longer exists")) {
            lockAsDeleted();
          } else {
            setMediaError(msg || "Could not send voice message.");
          }
        } finally {
          setIsUploadingVoice(false);
        }
      };

      recorder.start();
      setIsRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    } catch {
      setMediaError("Microphone access was denied.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }

  function cancelRecording() {
    recordCancelledRef.current = true;
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }

  async function handleUnsend(messageId: string) {
    const previous = messages;
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, deleted: true, content: "", mediaUrl: null } : m))
    );
    try {
      await gql(UNSEND_MESSAGE_MUTATION, { messageId });
    } catch (err) {
      console.error("Unsend failed:", err);
      setMessages(previous);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-whispr-snow font-body text-sm text-whispr-mauve dark:bg-whispr-night dark:text-whispr-fog">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-whispr-coral [animation-delay:-0.3s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-whispr-coral [animation-delay:-0.15s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-whispr-coral" />
        </div>
      </div>
    );
  }

  let lastDay = "";

  return (
    <div className="flex h-full flex-1 flex-col bg-whispr-snow dark:bg-whispr-night">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-whispr-linen bg-white px-5 py-3 dark:border-whispr-ash dark:bg-whispr-charcoal">
        <button
          onClick={() => navigate("/inbox")}
          className="flex h-8 w-8 items-center justify-center rounded-full text-whispr-mauve transition hover:bg-whispr-linen hover:text-whispr-noir md:hidden dark:text-whispr-fog dark:hover:bg-whispr-onyx dark:hover:text-whispr-ivory"
          aria-label="Back to chats"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="relative shrink-0">
          {partnerAvatar ? (
            <img src={partnerAvatar} alt={partnerName || "?"} className="h-10 w-10 rounded-full object-cover" />
          ) : (
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-full font-display text-sm font-semibold text-white ${
                partnerDeleted ? "grayscale" : ""
              }`}
              style={{ background: partnerDeleted ? "#9CA3AF" : auraFor(partnerName || "?") }}
            >
              {partnerDeleted ? "?" : partnerName ? initialsFor(partnerName) : "?"}
            </div>
          )}
          {partnerOnline && !partnerDeleted && (
            <span
              className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-green-500 dark:border-whispr-charcoal"
              aria-label="Online"
            />
          )}
        </div>
        <div className="flex flex-col">
          <h1 className="font-display text-lg font-semibold leading-tight text-whispr-noir dark:text-whispr-ivory">
            {partnerName}
          </h1>
          {partnerDeleted ? (
            <span className="font-body text-xs text-whispr-mauve dark:text-whispr-fog">
              This account no longer exists
            </span>
          ) : partnerTyping ? (
            <span className="font-body text-xs font-medium text-whispr-coral">typing…</span>
          ) : partnerOnline ? (
            <span className="font-body text-xs font-medium text-green-600 dark:text-green-400">Online</span>
          ) : partnerLastSeen ? (
            <span className="font-body text-xs text-whispr-mauve dark:text-whispr-fog">
              {formatLastSeen(partnerLastSeen)}
            </span>
          ) : null}
        </div>
      </div>

      {/* Messages */}
      <div
        className="flex-1 space-y-1 overflow-y-auto px-4 py-6 sm:px-8"
        style={{
          backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)",
          backgroundSize: "22px 22px",
          color: theme === "dark" ? "#241D3B" : "#EFE1F7",
        }}
      >
        {messages.map((m, i) => {
          const mine = m.sender.id === user?.id;
          const prev = messages[i - 1];
          const startsGroup = !prev || prev.sender.id !== m.sender.id;
          const day = formatDayLabel(m.createdAt);
          const showDayDivider = day !== lastDay;
          lastDay = day;

          return (
            <div key={m.id}>
              {showDayDivider && (
                <div className="my-4 flex justify-center">
                  <span className="rounded-full bg-white px-3 py-1 font-body text-[11px] font-medium text-whispr-mauve shadow-sm dark:bg-whispr-charcoal dark:text-whispr-fog">
                    {day}
                  </span>
                </div>
              )}
              <div className={`flex ${mine ? "justify-end" : "justify-start"} ${startsGroup ? "mt-3" : "mt-0.5"}`}>
                <div className="group relative max-w-[75%] sm:max-w-[65%]">
                  <div
                    ref={(el) => { messageRefs.current[m.id] = el; }}
                    className={`px-4 py-2 font-body text-sm leading-relaxed shadow-sm transition-shadow ${
                      mine
                        ? "rounded-2xl rounded-br-sm bg-gradient-to-br from-whispr-coral to-whispr-crimson text-white"
                        : "rounded-2xl rounded-bl-sm bg-white text-whispr-noir dark:bg-whispr-charcoal dark:text-whispr-ivory"
                    } ${highlightedId === m.id ? "ring-2 ring-offset-2 ring-whispr-coral" : ""} ${
                      m.type === "image" && !m.deleted ? "!p-1.5" : ""
                    } ${m.type === "voice" && !m.deleted ? "!py-2" : ""}`}
                  >
                    {m.replyTo && (
                      <button
                        type="button"
                        onClick={() => scrollToMessage(m.replyTo!.id)}
                        className={`mb-1.5 block w-full max-w-full rounded-lg border-l-[3px] px-2.5 py-1.5 text-left ${
                          mine
                            ? "border-white/70 bg-white/15 hover:bg-white/20"
                            : "border-whispr-coral bg-whispr-snow hover:bg-whispr-linen dark:bg-whispr-onyx dark:hover:bg-whispr-ash"
                        }`}
                      >
                        <p className={`font-body text-[11px] font-semibold ${mine ? "text-white" : "text-whispr-coral"}`}>
                          {m.replyTo.sender.id === user?.id ? "You" : partnerName}
                        </p>
                        <p
                          className={`truncate font-body text-[11px] ${
                            m.replyTo.deleted ? "italic" : ""
                          } ${mine ? "text-white/80" : "text-whispr-mauve dark:text-whispr-fog"}`}
                        >
                          {m.replyTo.deleted
                            ? "This message was unsent"
                            : m.replyTo.type === "image"
                            ? "📷 Photo"
                            : m.replyTo.type === "voice"
                            ? "🎤 Voice message"
                            : m.replyTo.content}
                        </p>
                      </button>
                    )}

                    {m.deleted ? (
                      <span className={`italic ${mine ? "text-white/70" : "text-whispr-mauve dark:text-whispr-fog"}`}>
                        This message was unsent
                      </span>
                    ) : m.type === "image" && m.mediaUrl ? (
                      // WhatsApp-style: the thumbnail is a button — tapping it
                      // opens the full-size lightbox (with a save/download
                      // option) instead of just sitting there as a static img.
                      <button
                        type="button"
                        onClick={() => setViewingImage(m.mediaUrl)}
                        className="block"
                        aria-label="Open photo"
                      >
                        <img
                          src={m.mediaUrl}
                          alt="Shared photo"
                          className="max-h-72 max-w-[260px] rounded-xl object-cover"
                          loading="lazy"
                        />
                      </button>
                    ) : m.type === "voice" && m.mediaUrl ? (
                      <VoiceMessagePlayer
                        url={m.mediaUrl}
                        duration={m.mediaDuration}
                        variant={mine ? "mine" : "theirs"}
                        seed={m.id}
                      />
                    ) : (
                      <span className="break-words">{m.content}</span>
                    )}

                    <span
                      className={`ml-2 mt-1 inline-flex translate-y-[3px] items-center gap-1 align-bottom font-body text-[10px] ${
                        mine ? "text-white/75" : "text-whispr-mauve dark:text-whispr-fog"
                      }`}
                    >
                      {formatTime(m.createdAt)}
                      {mine && !m.deleted && <MessageTicks read={m.read} variant="bubble" />}
                    </span>
                  </div>

                  <span
                    className={`absolute bottom-0 h-3 w-3 ${
                      mine ? "-right-1 bg-whispr-crimson" : "-left-1 bg-white dark:bg-whispr-charcoal"
                    }`}
                    style={{
                      clipPath: mine
                        ? "polygon(0 0, 100% 100%, 0 100%)"
                        : "polygon(100% 0, 100% 100%, 0 100%)",
                    }}
                  />

                  {mine && !m.deleted && (
                    <button
                      onClick={() => handleUnsend(m.id)}
                      aria-label="Unsend message"
                      title="Unsend"
                      className="absolute -top-2 -left-2 hidden h-6 w-6 items-center justify-center rounded-full bg-white text-whispr-mauve shadow-sm transition hover:text-whispr-burgundy group-hover:flex dark:bg-whispr-charcoal dark:text-whispr-fog dark:hover:text-whispr-petal"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </button>
                  )}
                  {!m.deleted && !partnerDeleted && (
                    <button
                      onClick={() => setReplyingTo(m)}
                      aria-label="Reply"
                      title="Reply"
                      className={`absolute -top-2 hidden h-6 w-6 items-center justify-center rounded-full bg-white text-whispr-mauve shadow-sm transition hover:text-whispr-coral group-hover:flex dark:bg-whispr-charcoal dark:text-whispr-fog ${
                        mine ? "-right-2" : "-left-2"
                      }`}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                        <path d="M9 10L4 15L9 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M4 15H15A5 5 0 0020 10V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {partnerTyping && !partnerDeleted && (
          <div className="mt-3 flex justify-start">
            <div className="relative max-w-[75%] sm:max-w-[65%]">
              <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm bg-white px-4 py-3 shadow-sm dark:bg-whispr-charcoal">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-whispr-mauve/70 [animation-delay:-0.3s] dark:bg-whispr-fog/70" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-whispr-mauve/70 [animation-delay:-0.15s] dark:bg-whispr-fog/70" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-whispr-mauve/70 dark:bg-whispr-fog/70" />
              </div>
              <span
                className="absolute bottom-0 -left-1 h-3 w-3 bg-white dark:bg-whispr-charcoal"
                style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }}
              />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      {partnerDeleted ? (
        <div className="border-t border-whispr-linen bg-white px-4 py-4 text-center sm:px-6 dark:border-whispr-ash dark:bg-whispr-charcoal">
          <p className="font-body text-sm text-whispr-mauve dark:text-whispr-fog">
            This account no longer exists. You can't send new messages here.
          </p>
        </div>
      ) : (
        <div className="border-t border-whispr-linen bg-white px-4 py-3.5 sm:px-6 dark:border-whispr-ash dark:bg-whispr-charcoal">
          {replyingTo && (
            <div className="mb-2.5 flex items-start justify-between gap-3 rounded-lg border-l-4 border-whispr-coral bg-whispr-snow px-3 py-2 dark:bg-whispr-onyx">
              <div className="min-w-0">
                <p className="font-body text-xs font-semibold text-whispr-coral">
                  Replying to {replyingTo.sender.id === user?.id ? "yourself" : partnerName}
                </p>
                <p className={`truncate font-body text-xs text-whispr-mauve dark:text-whispr-fog ${replyingTo.deleted ? "italic" : ""}`}>
                  {replyingTo.deleted
                    ? "This message was unsent"
                    : replyingTo.type === "image"
                    ? "📷 Photo"
                    : replyingTo.type === "voice"
                    ? "🎤 Voice message"
                    : replyingTo.content}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReplyingTo(null)}
                aria-label="Cancel reply"
                className="mt-0.5 shrink-0 text-whispr-mauve transition hover:text-whispr-noir dark:text-whispr-fog dark:hover:text-whispr-ivory"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          )}

          {mediaError && (
            <p className="mb-2 rounded-md bg-whispr-burgundy/10 px-3 py-2 font-body text-xs text-whispr-burgundy dark:bg-whispr-burgundy/20 dark:text-whispr-petal">
              {mediaError}
            </p>
          )}

          {isRecording ? (
            /* Recording bar replaces the normal composer while active */
            <div className="flex items-center gap-3 rounded-full border border-whispr-coral/40 bg-whispr-snow px-4 py-2.5 dark:bg-whispr-onyx">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-whispr-burgundy" />
              <span className="font-body text-sm text-whispr-noir dark:text-whispr-ivory">
                Recording… {formatDuration(recordSeconds)}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={cancelRecording}
                  className="rounded-full px-3 py-1.5 font-body text-xs font-semibold uppercase tracking-wider text-whispr-mauve hover:bg-whispr-linen dark:text-whispr-fog dark:hover:bg-whispr-ash"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={stopRecording}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-whispr-coral text-white hover:bg-whispr-crimson"
                  aria-label="Send voice message"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelected}
                className="hidden"
              />
              <button
                type="button"
                onClick={handlePickImage}
                disabled={isUploadingImage || isUploadingVoice}
                aria-label="Send a photo"
                title="Send a photo"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-whispr-mauve transition hover:bg-whispr-snow hover:text-whispr-coral disabled:opacity-50 dark:text-whispr-fog dark:hover:bg-whispr-onyx"
              >
                {isUploadingImage ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-whispr-coral border-t-transparent" />
                ) : (
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
                    <circle cx="8.5" cy="10" r="1.5" fill="currentColor" />
                    <path d="M21 16l-5.5-5.5L4 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>

              <input
                value={draft}
                onChange={(e) => handleDraftChange(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="Type a message…"
                disabled={isUploadingVoice}
                className="flex-1 rounded-full border border-whispr-linen bg-whispr-snow px-4 py-3 font-body text-sm text-whispr-noir placeholder:text-whispr-mauve/70 focus:border-whispr-coral focus:outline-none focus:ring-2 focus:ring-whispr-coral/20 disabled:opacity-60 dark:border-whispr-ash dark:bg-whispr-onyx dark:text-whispr-ivory dark:placeholder:text-whispr-fog/70"
              />

              {draft.trim() ? (
                <button
                  onClick={handleSend}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-whispr-coral to-whispr-crimson text-white shadow-sm transition hover:brightness-110"
                  aria-label="Send message"
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              ) : (
                <button
                  onClick={startRecording}
                  disabled={isUploadingVoice || isUploadingImage}
                  aria-label="Record a voice message"
                  title="Record a voice message"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-whispr-coral to-whispr-crimson text-white shadow-sm transition hover:brightness-110 disabled:opacity-50"
                >
                  {isUploadingVoice ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor" />
                      <path d="M5 11a7 7 0 0014 0M12 18v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Full-size photo lightbox — only mounted while a photo is open */}
      {viewingImage && (
        <ImageLightbox url={viewingImage} onClose={() => setViewingImage(null)} />
      )}
    </div>
  );
}