import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import Picker from "@emoji-mart/react";
import data from "@emoji-mart/data";
import { gql } from "../lib/gqlClient";
import {
  MESSAGES_QUERY,
  SEND_MESSAGE_MUTATION,
  MARK_CONVERSATION_READ_MUTATION,
  UNSEND_MESSAGE_MUTATION,
  EDIT_MESSAGE_MUTATION,
  SET_TYPING_MUTATION,
  USER_STATUS_QUERY,
  TOGGLE_REACTION_MUTATION,
  START_CONVERSATION_MUTATION,
} from "../lib/mutations";
import { uploadMedia, sendVoiceMessage } from "../lib/upload";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useMessageSubscription } from "../lib/useMessageSubscription";
import { useReadReceiptSubscription } from "../lib/useReadReceiptSubscription";
import { useUserUpdatedSubscription } from "../lib/useUserUpdatedSubscription";
import { useMessageUnsentSubscription } from "../lib/useMessageUnsentSubscription";
import { useMessageEditedSubscription } from "../lib/useMessageEditedSubscription";
import { useMessageReactionSubscription } from "../lib/useMessageReactionSubscription";
import { useTypingSubscription } from "../lib/useTypingSubscription";
import { useUserStatusSubscription } from "../lib/useUserStatusSubscription";
import MessageTicks from "../components/chat/MessageTicks";
import VoiceMessagePlayer from "../components/chat/VoiceMessagePlayer";
import RecordingWaveform from "../components/chat/RecordingWaveform";

type MessageKind = "text" | "image" | "voice";

// A single emoji reaction on a message — mirrors the backend Reaction
// type (see graphql/typeDefs). One reaction per user per message.
interface MessageReaction {
  emoji: string;
  user: { id: string; name: string };
}

interface MessageItem {
  id: string;
  content: string;
  type: MessageKind;
  mediaUrl: string | null;
  mediaDuration: number | null;
  createdAt: string;
  read: boolean;
  deleted: boolean;
  // NEW: WhatsApp/Instagram-style "(edited)" flag — true once the
  // sender has edited this message's text. Defaults to false for
  // messages fetched before this feature existed (see loadMessages()).
  edited: boolean;
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
  // Emoji reactions currently on this message — WhatsApp/Instagram-style.
  // Defaults to [] for messages fetched before this feature existed.
  reactions: MessageReaction[];
}

const TYPING_STOP_DELAY_MS = 2000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB — hard cap on what we'll even attempt to read
const MAX_IMAGE_DIMENSION = 1600; // longest side, px, after compression
const IMAGE_JPEG_QUALITY = 0.82;

// The small, fixed set of quick-react emojis shown in the reaction picker
// popover — same idea as WhatsApp/Instagram's long-press reaction bar.
// Kept short and curated rather than a full picker, since reacting is
// meant to be a single quick tap.
const REACTION_EMOJIS = ["❤️", "😂", "😮", "😢", "🙏", "👍"];

// Base URL of our own backend — used both for GraphQL/upload calls
// elsewhere in the app and here for the download-proxy endpoint below.
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

// Resizes + recompresses a photo before it's uploaded — same idea as the
// avatar cropper in ProfileSettings, but keeps the original aspect ratio
// instead of forcing a square. This is the actual fix for "the skeleton
// sits there forever": an uncompressed phone photo can be several MB, and
// every person in the conversation has to download that full size just to
// see the thumbnail. Shrinking it here, once, before it ever reaches S3,
// means everyone's bubble finishes loading in a fraction of the time —
// the skeleton itself was never the slow part, the multi-MB file was.
function compressImageForUpload(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;
      if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
        const scale = Math.min(MAX_IMAGE_DIMENSION / width, MAX_IMAGE_DIMENSION / height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas not supported."));
        return;
      }
      // White backdrop first — JPEG has no alpha, so a transparent PNG
      // would otherwise turn black.
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Could not process that image."))),
        "image/jpeg",
        IMAGE_JPEG_QUALITY
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read that image."));
    };

    img.src = objectUrl;
  });
}

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

// Groups a message's flat reaction list into one entry per distinct
// emoji, with a count and whether the current user is among the
// reactors — everything the reaction-pill UI needs to render and to know
// whether tapping a pill should toggle the reaction off for "me".
function groupReactions(reactions: MessageReaction[], myUserId?: string) {
  const order: string[] = [];
  const byEmoji = new Map<string, { emoji: string; count: number; mine: boolean }>();

  for (const r of reactions) {
    let entry = byEmoji.get(r.emoji);
    if (!entry) {
      entry = { emoji: r.emoji, count: 0, mine: false };
      byEmoji.set(r.emoji, entry);
      order.push(r.emoji);
    }
    entry.count += 1;
    if (r.user.id === myUserId) entry.mine = true;
  }

  return order.map((emoji) => byEmoji.get(emoji)!);
}

// ── Image bubble w/ skeleton loader ─────────────────────────────────────────
// WhatsApp/Instagram-style: while the S3 signed URL is loading, show a grey
// rounded-rect placeholder (same shimmer sweep as the voice-message
// skeleton) at roughly the size/aspect ratio the real photo bubble will
// take up. Once `onLoad` fires, the skeleton unmounts and the image fades
// in in place — no layout jump, since both occupy the same box. If the
// request fails (`onError`), swap to a small inline error state with a
// Retry button that remounts the <img> (forcing a fresh request) rather
// than silently leaving a broken-image icon.
function ChatImage({ url, onOpen }: { url: string; onOpen: () => void }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // The browser can finish loading an image (e.g. served straight from
  // cache, which is exactly what happens on a page refresh — the signed
  // URL was already fetched once) BEFORE React even attaches the onLoad
  // listener below. In that case the "load" event already fired and is
  // gone forever, so onLoad never runs and the skeleton would be stuck
  // showing indefinitely — even though the image is already sitting in
  // memory (which is why clicking it still opens the lightbox fine).
  // `img.complete` tells us synchronously whether that already happened,
  // so we check it once right after mount and for every url/attempt
  // change, same pattern VoiceMessagePlayer uses with audio.readyState.
  useEffect(() => {
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth > 0) {
      setStatus("loaded");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, attempt]);

  function handleRetry(e: React.MouseEvent) {
    e.stopPropagation();
    setStatus("loading");
    setAttempt((a) => a + 1);
  }

  return (
    <div className="relative h-56 w-56 max-w-[260px]">
      {/* Skeleton / error placeholder — sits behind the <img>, same
          rounded box, same footprint, so nothing shifts when the real
          photo (or the error state) takes over. */}
      {status !== "loaded" && (
        <div className="absolute inset-0 overflow-hidden rounded-xl bg-whispr-linen dark:bg-whispr-onyx">
          {status === "loading" ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/70 to-transparent dark:via-white/15"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                className="text-whispr-mauve dark:text-whispr-fog"
              >
                <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
                <path
                  d="M3 16l5-5 4 4 3-3 6 6"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="8" cy="9" r="1.3" fill="currentColor" />
              </svg>
              <p className="font-body text-[11px] leading-tight text-whispr-mauve dark:text-whispr-fog">
                Couldn't load image
              </p>
              <button
                type="button"
                onClick={handleRetry}
                className="rounded-full bg-whispr-coral px-3 py-1 font-body text-[11px] font-semibold text-white transition hover:bg-whispr-crimson"
              >
                Retry
              </button>
            </div>
          )}
        </div>
      )}

      {/* The real image is always mounted (once `attempt` changes it
          remounts via `key`, forcing a fresh network request on retry)
          so the browser starts fetching immediately — it just stays
          invisible until it's actually ready, then fades in. */}
      <button
        type="button"
        onClick={onOpen}
        aria-label="Open photo"
        className={`block h-full w-full ${status === "error" ? "pointer-events-none" : ""}`}
      >
        <img
          ref={imgRef}
          key={attempt}
          src={url}
          alt="Shared photo"
          loading="lazy"
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
          className={`h-full w-full rounded-xl object-cover transition-opacity duration-300 ${
            status === "loaded" ? "opacity-100" : "opacity-0"
          }`}
        />
      </button>
    </div>
  );
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
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [partnerName, setPartnerName] = useState("");
  const [partnerAvatar, setPartnerAvatar] = useState<string | null>(null);
  const [partnerOnline, setPartnerOnline] = useState(false);
  const [partnerLastSeen, setPartnerLastSeen] = useState<string | null>(null);
  const [partnerDeleted, setPartnerDeleted] = useState(false);
  const [replyingTo, setReplyingTo] = useState<MessageItem | null>(null);
  // NEW: holds the message currently being edited (WhatsApp/Instagram-
  // style "edit message" flow) — reuses the composer input, similar to
  // how replyingTo reuses it for quoting. Mutually exclusive with
  // replyingTo: starting an edit clears any active reply and vice versa.
  const [editingMessage, setEditingMessage] = useState<MessageItem | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [partnerTyping, setPartnerTyping] = useState(false);
  // Holds the mediaUrl of whichever photo is currently open in the
  // full-size lightbox; null means the lightbox is closed.
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  // True once this conversation has painted its messages and done its
  // first scroll-to-bottom. WhatsApp/Instagram both open a chat already
  // sitting at the last message — no visible scroll animation — and only
  // animate the scroll for messages that arrive *after* you're already
  // looking at the chat. Reset whenever you switch conversations.
  const hasScrolledOnceRef = useRef(false);

  // ── Media sharing state ─────────────────────────────────────────────────
  const [mediaError, setMediaError] = useState("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isUploadingVoice, setIsUploadingVoice] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [liveRecordStream, setLiveRecordStream] = useState<MediaStream | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordCancelledRef = useRef(false);

  // ── Emoji picker (composer) ─────────────────────────────────────────────
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);

  // ── Reaction picker (per-message quick-react popover) ───────────────────
  // Holds the id of whichever message currently has its reaction popover
  // open — only one can be open at a time, WhatsApp-style, so a single
  // piece of state (rather than per-message state) is enough.
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);
  const reactionPickerRef = useRef<HTMLDivElement | null>(null);

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

  // Close the emoji popover on any click outside it (or its trigger button),
  // same pattern as the reply/lightbox overlays elsewhere in this file.
  useEffect(() => {
    if (!showEmojiPicker) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        emojiPickerRef.current &&
        !emojiPickerRef.current.contains(target) &&
        emojiButtonRef.current &&
        !emojiButtonRef.current.contains(target)
      ) {
        setShowEmojiPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showEmojiPicker]);

  // Close the per-message reaction popover on any click outside it. Since
  // only one is ever rendered at a time (guarded by reactionPickerFor
  // below), a single ref covers whichever one is currently open.
  useEffect(() => {
    if (!reactionPickerFor) return;
    function handleClickOutsideReactionPicker(e: MouseEvent) {
      const target = e.target as Node;
      if (reactionPickerRef.current && !reactionPickerRef.current.contains(target)) {
        setReactionPickerFor(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutsideReactionPicker);
    return () => document.removeEventListener("mousedown", handleClickOutsideReactionPicker);
  }, [reactionPickerFor]);

  // Inserts the picked emoji at the current cursor position (falls back to
  // appending at the end if we can't read a selection), routes the result
  // through handleDraftChange so the typing indicator still fires normally,
  // then restores focus + cursor to the text input so the person can keep
  // typing right where they left off.
  function insertEmoji(emoji: string) {
    const input = messageInputRef.current;
    const start = input?.selectionStart ?? draft.length;
    const end = input?.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + emoji + draft.slice(end);
    handleDraftChange(next);
    requestAnimationFrame(() => {
      input?.focus();
      const cursor = start + emoji.length;
      input?.setSelectionRange(cursor, cursor);
    });
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

  async function loadMessages(cid: string) {
    const data = await gql<{ messages: MessageItem[] }>(MESSAGES_QUERY, {
      conversationId: cid,
      limit: 100,
    });
    // Backend returns newest-first now — order chronologically for display
    // without mutating the original array.
    const chronological = [...data.messages].reverse();
    const withReactionsDefaulted = chronological.map((m) => ({
      ...m,
      reactions: m.reactions ?? [],
      edited: m.edited ?? false,
    }));
    setMessages(withReactionsDefaulted);
    
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
    const state = location.state as {
      partnerName?: string;
      partnerAvatar?: string | null;
      conversationId?: string;
    } | null;
    setPartnerName(state?.partnerName ?? "");
    setPartnerAvatar(state?.partnerAvatar ?? null);
    setPartnerTyping(false);
    setPartnerOnline(false);
    setPartnerLastSeen(null);
    setPartnerDeleted(false);
    setMediaError("");
    setShowEmojiPicker(false);
    setReactionPickerFor(null);
    setEditingMessage(null);
    hasScrolledOnceRef.current = false;

    (async () => {
      let cid = state?.conversationId ?? null;
      if (!cid && userId) {
        const data = await gql<{ startConversation: string }>(
          START_CONVERSATION_MUTATION,
          { otherUserId: userId }
        );
        cid = data.startConversation;
      }
      setConversationId(cid);
      if (cid) await loadMessages(cid);
      await loadPartnerStatus();
    })();

    return () => {
      stopTypingNow();
      if (isRecording) cancelRecording();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // First paint of a conversation snaps straight to the bottom (no
  // animation, WhatsApp/Instagram-style) — every scroll after that, for
  // messages arriving while you're already looking at the chat, eases in
  // smoothly instead.
  useEffect(() => {
    if (messages.length === 0 && !partnerTyping) return;
    bottomRef.current?.scrollIntoView({ behavior: hasScrolledOnceRef.current ? "smooth" : "auto" });
    hasScrolledOnceRef.current = true;
  }, [messages, partnerTyping]);

  useMessageSubscription((data) => {
    const msg = data.messageReceived as MessageItem;
    const isThisConversation =
      (msg.sender.id === userId && msg.receiver.id === user?.id) ||
      (msg.receiver.id === userId && msg.sender.id === user?.id);

    if (isThisConversation) {
      setMessages((prev) =>
        prev.some((m) => m.id === msg.id) ? prev : [...prev, { ...msg, reactions: msg.reactions ?? [] }]
      );
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
      prev.map((m) =>
        m.id === messageUnsent.id ? { ...m, deleted: true, content: "", mediaUrl: null, reactions: [] } : m
      )
    );
  });

  // Live media migration + live text edits — this event now covers two
  // different underlying changes that both republish the full message:
  // a voice message finishing its S3 migration (mediaUrl changes) and a
  // text message being edited (content + edited change). Patching all
  // three fields here keeps both cases in sync without needing to know
  // which one just happened. VoiceMessagePlayer picks up the new url via
  // its own [url] effect and reloads the <audio> element in place,
  // keeping playback position.
  useMessageEditedSubscription(({ messageEdited }) => {
    const isThisConversation =
      (messageEdited.sender.id === userId && messageEdited.receiver.id === user?.id) ||
      (messageEdited.receiver.id === userId && messageEdited.sender.id === user?.id);
    if (!isThisConversation) return;

    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageEdited.id
          ? { ...m, mediaUrl: messageEdited.mediaUrl, content: messageEdited.content, edited: messageEdited.edited }
          : m
      )
    );
  });

  // Live reactions — whenever either participant adds/changes/removes a
  // reaction on a message in this conversation, patch its reaction list
  // in place so the pills update immediately on both ends, WhatsApp/
  // Instagram-style, without waiting on a refetch.
  useMessageReactionSubscription(({ messageReactionUpdated }) => {
    const isThisConversation =
      (messageReactionUpdated.sender.id === userId && messageReactionUpdated.receiver.id === user?.id) ||
      (messageReactionUpdated.receiver.id === userId && messageReactionUpdated.sender.id === user?.id);
    if (!isThisConversation) return;

    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageReactionUpdated.id ? { ...m, reactions: messageReactionUpdated.reactions } : m
      )
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
    setShowEmojiPicker(false);
    stopTypingNow();
    try {
      const data = await gql<{ sendMessage: MessageItem }>(SEND_MESSAGE_MUTATION, {
        receiverId: userId,
        content,
        type: "text",
        replyToId,
      });
      setMessages((prev) =>
        prev.some((m) => m.id === data.sendMessage.id)
          ? prev
          : [...prev, { ...data.sendMessage, reactions: data.sendMessage.reactions ?? [] }]
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
        prev.some((m) => m.id === data.sendMessage.id)
          ? prev
          : [...prev, { ...data.sendMessage, reactions: data.sendMessage.reactions ?? [] }]
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
      // Skip compression for GIFs — drawing one to a <canvas> would
      // flatten it down to a single static frame, killing the animation.
      const isGif = file.type === "image/gif";
      const toUpload: File | Blob = isGif ? file : await compressImageForUpload(file);
      const filename = isGif ? file.name : file.name.replace(/\.[^.]+$/, "") + ".jpg";
      const { key } = await uploadMedia(toUpload, "image", filename);
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
      // const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      recordStreamRef.current = stream;
      setLiveRecordStream(stream);
      audioChunksRef.current = [];
      recordCancelledRef.current = false;

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        recordStreamRef.current?.getTracks().forEach((t) => t.stop());
        setLiveRecordStream(null);
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
          // setReplyingTo(null);
          // setMessages((prev) =>
          //   prev.some((m) => m.id === message.id)
          //     ? prev
          //     : [...prev, { ...(message as MessageItem), reactions: [] }]
          // );
          setReplyingTo(null);
          setMessages((prev) =>
            prev.some((m) => m.id === message.id)
              ? prev
              : [...prev, { ...message, reactions: message.reactions ?? [] } as MessageItem]
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
    // NEW: if the message being unsent is also the one currently being
    // edited, drop out of edit mode — there's nothing left to save.
    if (editingMessage?.id === messageId) {
      setEditingMessage(null);
      setDraft("");
    }
    const previous = messages;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, deleted: true, content: "", mediaUrl: null, reactions: [] } : m
      )
    );
    try {
      await gql(UNSEND_MESSAGE_MUTATION, { messageId });
    } catch (err) {
      console.error("Unsend failed:", err);
      setMessages(previous);
    }
  }

  // ── Editing ───────────────────────────────────────────────────────────────
  // NEW: WhatsApp/Instagram-style "edit message" flow. Starting an edit
  // populates the composer with the message's current text (same idea
  // as replyingTo reusing the composer for quoting) instead of opening a
  // separate modal, and clears any active reply since you can't do both
  // at once.
  function handleStartEdit(message: MessageItem) {
    if (message.type !== "text" || message.deleted) return;
    setReplyingTo(null);
    setEditingMessage(message);
    setDraft(message.content);
    setReactionPickerFor(null);
    requestAnimationFrame(() => messageInputRef.current?.focus());
  }

  function handleCancelEdit() {
    setEditingMessage(null);
    setDraft("");
  }

  async function handleSaveEdit() {
    if (!editingMessage || !draft.trim()) return;
    const messageId = editingMessage.id;
    const content = draft.trim();
    // Optimistic update — flip the bubble immediately, same pattern as
    // handleUnsend above, then reconcile with the server response.
    const previous = messages;
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, content, edited: true } : m))
    );
    setDraft("");
    setEditingMessage(null);
    stopTypingNow();
    try {
      const data = await gql<{ editMessage: MessageItem }>(EDIT_MESSAGE_MUTATION, {
        messageId,
        content,
      });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, content: data.editMessage.content, edited: data.editMessage.edited }
            : m
        )
      );
    } catch (err) {
      console.error("Edit failed:", err);
      setMessages(previous);
      setMediaError(err instanceof Error ? err.message : "Could not edit message.");
    }
  }

  // ── Reactions ─────────────────────────────────────────────────────────────
  // Adds/changes/removes the current user's reaction on a message. The
  // mutation returns the full updated message, so we patch local state
  // straight from the response — the subscription above then keeps the
  // *other* participant's view (and any of our own other open tabs) in
  // sync without us waiting on it here.
  async function handleToggleReaction(messageId: string, emoji: string) {
    setReactionPickerFor(null);
    try {
      const data = await gql<{ toggleReaction: MessageItem }>(TOGGLE_REACTION_MUTATION, {
        messageId,
        emoji,
      });
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, reactions: data.toggleReaction.reactions } : m))
      );
    } catch (err) {
      console.error("Reaction failed:", err);
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
          const groupedReactions = m.deleted ? [] : groupReactions(m.reactions, user?.id);
          const hasReactions = groupedReactions.length > 0;

          return (
            <div key={m.id}>
              {showDayDivider && (
                <div className="my-4 flex justify-center">
                  <span className="rounded-full bg-white px-3 py-1 font-body text-[11px] font-medium text-whispr-mauve shadow-sm dark:bg-whispr-charcoal dark:text-whispr-fog">
                    {day}
                  </span>
                </div>
              )}
              <div
                className={`flex ${mine ? "justify-end" : "justify-start"} ${startsGroup ? "mt-3" : "mt-0.5"} ${
                  hasReactions ? "pb-3" : ""
                }`}
              >
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
                      <ChatImage url={m.mediaUrl} onOpen={() => setViewingImage(m.mediaUrl)} />
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
                      {/* NEW: WhatsApp/Instagram-style "Edited" label next to the timestamp */}
                      {m.edited && !m.deleted && <span className="italic">Edited</span>}
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

                  {/* Reaction badge — a single cohesive pill (one border,
                      one shadow) tucked into the bottom corner of the
                      bubble, WhatsApp/Instagram-style. Each emoji inside
                      is its own tap target — tapping toggles that emoji
                      for the current user — but the group reads as one
                      small badge rather than a row of separate chips.
                      Anchored with a positive inset (right-1.5/left-1.5)
                      so it always stays within the message column and
                      never spills past the edge of the screen. */}
                  {hasReactions && (
                    <div className={`absolute -bottom-3 z-10 max-w-full ${mine ? "right-1.5" : "left-1.5"}`}>
                      <div className="flex items-center gap-0.5 rounded-full border border-whispr-linen bg-white px-1 py-0.5 shadow-md dark:border-whispr-ash dark:bg-whispr-charcoal">
                        {groupedReactions.map((r) => (
                          <button
                            key={r.emoji}
                            type="button"
                            onClick={() => handleToggleReaction(m.id, r.emoji)}
                            aria-label={`React with ${r.emoji}`}
                            className={`flex shrink-0 items-center gap-0.5 rounded-full px-1 py-0.5 font-body text-xs leading-none transition active:scale-90 ${
                              r.mine
                                ? "bg-whispr-petal/70 dark:bg-whispr-coral/20"
                                : "hover:bg-whispr-snow dark:hover:bg-whispr-onyx"
                            }`}
                          >
                            <span>{r.emoji}</span>
                            {r.count > 1 && (
                              <span className="font-body text-[10px] font-medium text-whispr-mauve dark:text-whispr-fog">
                                {r.count}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Hover toolbar — react / reply / edit / unsend grouped
                      into a single small floating pill above the bubble,
                      instead of separately-positioned buttons. Anchored
                      with a positive inset (right-1/left-1) so it can
                      never be pushed past the edge of the viewport on
                      narrow screens the way individually-offset buttons
                      could. */}
                  {!m.deleted && (
                    <div
                      className={`absolute -top-3 z-10 hidden items-center gap-0.5 rounded-full border border-whispr-linen bg-white p-0.5 shadow-md group-hover:flex dark:border-whispr-ash dark:bg-whispr-charcoal ${
                        mine ? "right-1" : "left-1"
                      }`}
                    >
                      {!partnerDeleted && (
                        <button
                          onClick={() => setReactionPickerFor((cur) => (cur === m.id ? null : m.id))}
                          aria-label="React"
                          title="React"
                          className={`flex h-6 w-6 items-center justify-center rounded-full text-whispr-mauve transition hover:bg-whispr-snow hover:text-whispr-coral dark:text-whispr-fog dark:hover:bg-whispr-onyx ${
                            reactionPickerFor === m.id ? "bg-whispr-snow text-whispr-coral dark:bg-whispr-onyx" : ""
                          }`}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
                            <circle cx="9" cy="10" r="1.1" fill="currentColor" />
                            <circle cx="15" cy="10" r="1.1" fill="currentColor" />
                            <path
                              d="M8 14.5c1 1.3 2.4 2 4 2s3-.7 4-2"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                            />
                          </svg>
                        </button>
                      )}
                      {!partnerDeleted && (
                        <button
                          onClick={() => { setEditingMessage(null); setReplyingTo(m); }}
                          aria-label="Reply"
                          title="Reply"
                          className="flex h-6 w-6 items-center justify-center rounded-full text-whispr-mauve transition hover:bg-whispr-snow hover:text-whispr-coral dark:text-whispr-fog dark:hover:bg-whispr-onyx"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                            <path d="M9 10L4 15L9 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M4 15H15A5 5 0 0020 10V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      )}
                      {/* NEW: Edit — only for your own text messages (no
                          caption to edit on images/voice notes in this
                          app). */}
                      {mine && m.type === "text" && (
                        <button
                          onClick={() => handleStartEdit(m)}
                          aria-label="Edit message"
                          title="Edit"
                          className="flex h-6 w-6 items-center justify-center rounded-full text-whispr-mauve transition hover:bg-whispr-snow hover:text-whispr-coral dark:text-whispr-fog dark:hover:bg-whispr-onyx"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                            <path d="M12 20h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      )}
                      {mine && (
                        <button
                          onClick={() => handleUnsend(m.id)}
                          aria-label="Unsend message"
                          title="Unsend"
                          className="flex h-6 w-6 items-center justify-center rounded-full text-whispr-mauve transition hover:bg-whispr-snow hover:text-whispr-burgundy dark:text-whispr-fog dark:hover:bg-whispr-onyx dark:hover:text-whispr-petal"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                          </svg>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Quick-react popover — a small horizontal strip of the
                      curated emoji set, WhatsApp long-press-style. Sits
                      right above the hover toolbar with a matching inset
                      and a short scale/fade-in, and clamps its own width
                      so it can't overflow the viewport on narrow screens. */}
                  {reactionPickerFor === m.id && (
                    <div
                      ref={reactionPickerRef}
                      className={`absolute -top-14 z-20 flex w-max max-w-[88vw] items-center gap-0.5 rounded-full border border-whispr-linen bg-white px-1.5 py-1.5 shadow-lg transition duration-150 dark:border-whispr-ash dark:bg-whispr-charcoal ${
                        mine ? "right-1" : "left-1"
                      }`}
                    >
                      {REACTION_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => handleToggleReaction(m.id, emoji)}
                          aria-label={`React with ${emoji}`}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg transition hover:scale-125 hover:bg-whispr-snow dark:hover:bg-whispr-onyx"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
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
          {/* NEW: editing banner — WhatsApp/Instagram-style, shown instead
              of the reply banner while editing a message (the two are
              mutually exclusive; starting one clears the other). */}
          {editingMessage && (
            <div className="mb-2.5 flex items-start justify-between gap-3 rounded-lg border-l-4 border-whispr-coral bg-whispr-snow px-3 py-2 dark:bg-whispr-onyx">
              <div className="min-w-0">
                <p className="font-body text-xs font-semibold text-whispr-coral">Editing message</p>
                <p className="truncate font-body text-xs text-whispr-mauve dark:text-whispr-fog">
                  {editingMessage.content}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCancelEdit}
                aria-label="Cancel edit"
                className="mt-0.5 shrink-0 text-whispr-mauve transition hover:text-whispr-noir dark:text-whispr-fog dark:hover:text-whispr-ivory"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          )}

          {replyingTo && !editingMessage && (
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
              <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-whispr-burgundy" />
              <span className="shrink-0 font-body text-sm tabular-nums text-whispr-noir dark:text-whispr-ivory">
                {formatDuration(recordSeconds)}
              </span>
              <RecordingWaveform stream={liveRecordStream} />
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

              <div className="relative shrink-0">
                <button
                  ref={emojiButtonRef}
                  type="button"
                  onClick={() => setShowEmojiPicker((v) => !v)}
                  disabled={isUploadingImage || isUploadingVoice}
                  aria-label="Insert emoji"
                  aria-expanded={showEmojiPicker}
                  title="Insert emoji"
                  className="flex h-11 w-11 items-center justify-center rounded-full text-whispr-mauve transition hover:bg-whispr-snow hover:text-whispr-coral disabled:opacity-50 dark:text-whispr-fog dark:hover:bg-whispr-onyx"
                >
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
                    <circle cx="9" cy="10" r="1.1" fill="currentColor" />
                    <circle cx="15" cy="10" r="1.1" fill="currentColor" />
                    <path
                      d="M8 14.5c1 1.3 2.4 2 4 2s3-.7 4-2"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
                {showEmojiPicker && (
                  <div
                    ref={emojiPickerRef}
                    className="absolute bottom-full left-0 z-20 mb-2 overflow-hidden rounded-2xl shadow-lg"
                  >
                    <Picker
                      data={data}
                      onEmojiSelect={(emoji: { native: string }) => insertEmoji(emoji.native)}
                      theme={theme}
                      previewPosition="none"
                      skinTonePosition="none"
                      maxFrequentRows={1}
                    />
                  </div>
                )}
              </div>

              <input
                ref={messageInputRef}
                value={draft}
                onChange={(e) => handleDraftChange(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (editingMessage ? handleSaveEdit() : handleSend())}
                placeholder={editingMessage ? "Edit message…" : "Type a message…"}
                disabled={isUploadingVoice}
                className="flex-1 rounded-full border border-whispr-linen bg-whispr-snow px-4 py-3 font-body text-sm text-whispr-noir placeholder:text-whispr-mauve/70 focus:border-whispr-coral focus:outline-none focus:ring-2 focus:ring-whispr-coral/20 disabled:opacity-60 dark:border-whispr-ash dark:bg-whispr-onyx dark:text-whispr-ivory dark:placeholder:text-whispr-fog/70"
              />

              {draft.trim() ? (
                <button
                  onClick={editingMessage ? handleSaveEdit : handleSend}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-whispr-coral to-whispr-crimson text-white shadow-sm transition hover:brightness-110"
                  aria-label={editingMessage ? "Save edited message" : "Send message"}
                >
                  {editingMessage ? (
                    // NEW: checkmark icon while editing — "save the edit"
                    // instead of "send a new message".
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              ) : (
                <button
                  onClick={startRecording}
                  disabled={isUploadingVoice || isUploadingImage || !!editingMessage}
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