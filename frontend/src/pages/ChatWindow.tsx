import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { gql } from "../lib/gqlClient";
import {
  MESSAGES_QUERY,
  SEND_MESSAGE_MUTATION,
  MARK_CONVERSATION_READ_MUTATION,
  UNSEND_MESSAGE_MUTATION,
} from "../lib/mutations";
import { useAuth } from "../context/AuthContext";
import { useMessageSubscription } from "../lib/useMessageSubscription";
import { useReadReceiptSubscription } from "../lib/useReadReceiptSubscription";
import { useUserUpdatedSubscription } from "../lib/useUserUpdatedSubscription";
import { useMessageUnsentSubscription } from "../lib/useMessageUnsentSubscription";
import MessageTicks from "../components/chat/MessageTicks";

interface MessageItem {
  id: string;
  content: string;
  createdAt: string;
  read: boolean;
  deleted: boolean;
  sender: { id: string; name: string; avatar: string | null };
  receiver: { id: string; name: string; avatar: string | null };
  replyTo: {
    id: string;
    content: string;
    deleted: boolean;
    sender: { id: string; name: string; avatar: string | null };
  } | null;
}

// Every avatar uses the same dark-purple gradient as sent message bubbles
// (whispr-coral → whispr-crimson) so avatars and "your" bubbles read as
// one consistent brand color instead of a different shade per person.
// Only used as a fallback when the person has no uploaded photo.
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

export default function ChatWindow() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [partnerName, setPartnerName] = useState("");
  const [partnerAvatar, setPartnerAvatar] = useState<string | null>(null);
  // The message currently staged as a reply target — shown as a preview
  // above the composer, WhatsApp-style, until sent or cancelled.
  const [replyingTo, setReplyingTo] = useState<MessageItem | null>(null);
  // Briefly highlighted after jumping to a message via its quoted preview,
  // so the person can actually spot which bubble they landed on.
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});

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
      setPartnerName(partner.name);
      setPartnerAvatar(partner.avatar);
    }
    setLoading(false);
    await gql(MARK_CONVERSATION_READ_MUTATION, { withUserId: userId });
  }

  useEffect(() => {
    setLoading(true);
    // If we arrived here via the sidebar / new-message modal, the partner's
    // name (and avatar) was passed in router state — use it immediately
    // instead of waiting on loadMessages(), which can't find a name/avatar
    // from an empty (brand-new) conversation's message list.
    const state = location.state as { partnerName?: string; partnerAvatar?: string | null } | null;
    setPartnerName(state?.partnerName ?? "");
    setPartnerAvatar(state?.partnerAvatar ?? null);
    loadMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useMessageSubscription((data) => {
    const msg = data.messageReceived as MessageItem;
    const isThisConversation =
      (msg.sender.id === userId && msg.receiver.id === user?.id) ||
      (msg.receiver.id === userId && msg.sender.id === user?.id);

    if (isThisConversation) {
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      if (msg.sender.id !== user?.id) {
        gql(MARK_CONVERSATION_READ_MUTATION, { withUserId: userId }).catch(() => {});
      }
    }
  });

  // Real "seen" signal: the partner just opened this conversation and their
  // client told the server it read your messages. Only then do ticks flip.
  useReadReceiptSubscription(({ messagesRead }) => {
    if (messagesRead.readerId !== userId) return; // a read receipt from a different chat
    setMessages((prev) => prev.map((m) => (m.sender.id === user?.id ? { ...m, read: true } : m)));
  });

  // Live profile updates — WhatsApp-style: if the person you're chatting
  // with changes their name or photo mid-conversation, patch the header
  // immediately instead of waiting for a refresh.
  useUserUpdatedSubscription(({ userUpdated }) => {
    if (userUpdated.id !== userId) return;
    setPartnerName(userUpdated.name);
    setPartnerAvatar(userUpdated.avatar);
  });

  // Real-time unsend — Instagram-style: whichever side didn't trigger the
  // unsend (or another tab of the sender) swaps the bubble to the
  // "unsent" placeholder the moment it happens.
  useMessageUnsentSubscription(({ messageUnsent }) => {
    const isThisConversation =
      (messageUnsent.sender.id === userId && messageUnsent.receiver.id === user?.id) ||
      (messageUnsent.receiver.id === userId && messageUnsent.sender.id === user?.id);
    if (!isThisConversation) return;

    setMessages((prev) =>
      prev.map((m) => (m.id === messageUnsent.id ? { ...m, deleted: true, content: "" } : m))
    );
  });

  // Jumps to (and briefly highlights) the original message when its
  // quoted preview is tapped inside a reply bubble — WhatsApp-style.
  function scrollToMessage(id: string) {
    const el = messageRefs.current[id];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedId(id);
    setTimeout(() => setHighlightedId((cur) => (cur === id ? null : cur)), 1200);
  }

  async function handleSend() {
    if (!draft.trim() || !userId) return;
    const content = draft.trim();
    const replyToId = replyingTo?.id;
    setDraft("");
    setReplyingTo(null);
    const data = await gql<{ sendMessage: MessageItem }>(SEND_MESSAGE_MUTATION, {
      receiverId: userId,
      content,
      replyToId,
    });
    setMessages((prev) =>
      prev.some((m) => m.id === data.sendMessage.id) ? prev : [...prev, data.sendMessage]
    );
    // Safety net: if we still don't have a partner name/avatar (e.g. state
    // was lost on a refresh mid-conversation), the send response always
    // carries it.
    setPartnerName((prev) => prev || data.sendMessage.receiver.name);
    setPartnerAvatar((prev) => prev ?? data.sendMessage.receiver.avatar);
  }

  // Unsend one of your own messages. Optimistic: flips the bubble to the
  // placeholder immediately, then confirms with the server. If the
  // server call fails, we roll the bubble back and surface the error
  // instead of silently pretending it worked.
  async function handleUnsend(messageId: string) {
    const previous = messages;
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, deleted: true, content: "" } : m))
    );
    try {
      await gql(UNSEND_MESSAGE_MUTATION, { messageId });
    } catch (err) {
      console.error("Unsend failed:", err);
      // Roll back the optimistic change since it didn't actually persist.
      setMessages(previous);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-whispr-snow font-body text-sm text-whispr-mauve">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-whispr-coral [animation-delay:-0.3s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-whispr-coral [animation-delay:-0.15s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-whispr-coral" />
        </div>
      </div>
    );
  }

  // Group consecutive messages by sender + insert day dividers.
  let lastDay = "";

  return (
    <div className="flex h-full flex-1 flex-col bg-whispr-snow">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-whispr-linen bg-white px-5 py-3">
        <button
          onClick={() => navigate("/inbox")}
          className="flex h-8 w-8 items-center justify-center rounded-full text-whispr-mauve transition hover:bg-whispr-linen hover:text-whispr-noir md:hidden"
          aria-label="Back to chats"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {partnerAvatar ? (
          <img
            src={partnerAvatar}
            alt={partnerName || "?"}
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full font-display text-sm font-semibold text-white"
            style={{ background: auraFor(partnerName || "?") }}
          >
            {partnerName ? initialsFor(partnerName) : "?"}
          </div>
        )}
        <h1 className="font-display text-lg font-semibold text-whispr-noir">{partnerName}</h1>
      </div>

      {/* Messages — subtle dotted texture like a chat backdrop */}
      <div
        className="flex-1 space-y-1 overflow-y-auto px-4 py-6 sm:px-8"
        style={{
          backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)",
          backgroundSize: "22px 22px",
          color: "#EFE1F7",
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
                  <span className="rounded-full bg-white px-3 py-1 font-body text-[11px] font-medium text-whispr-mauve shadow-sm">
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
                        : "rounded-2xl rounded-bl-sm bg-white text-whispr-noir"
                    } ${highlightedId === m.id ? "ring-2 ring-offset-2 ring-whispr-coral" : ""}`}
                  >
                    {m.replyTo && (
                      <button
                        type="button"
                        onClick={() => scrollToMessage(m.replyTo!.id)}
                        className={`mb-1.5 block w-full max-w-full rounded-lg border-l-[3px] px-2.5 py-1.5 text-left ${
                          mine
                            ? "border-white/70 bg-white/15 hover:bg-white/20"
                            : "border-whispr-coral bg-whispr-snow hover:bg-whispr-linen"
                        }`}
                      >
                        <p
                          className={`font-body text-[11px] font-semibold ${
                            mine ? "text-white" : "text-whispr-coral"
                          }`}
                        >
                          {m.replyTo.sender.id === user?.id ? "You" : partnerName}
                        </p>
                        <p
                          className={`truncate font-body text-[11px] ${
                            m.replyTo.deleted ? "italic" : ""
                          } ${mine ? "text-white/80" : "text-whispr-mauve"}`}
                        >
                          {m.replyTo.deleted ? "This message was unsent" : m.replyTo.content}
                        </p>
                      </button>
                    )}
                    {m.deleted ? (
                      <span className={`italic ${mine ? "text-white/70" : "text-whispr-mauve"}`}>
                        This message was unsent
                      </span>
                    ) : (
                      <span className="break-words">{m.content}</span>
                    )}
                    <span
                      className={`ml-2 mt-1 inline-flex translate-y-[3px] items-center gap-1 align-bottom font-body text-[10px] ${
                        mine ? "text-white/75" : "text-whispr-mauve"
                      }`}
                    >
                      {formatTime(m.createdAt)}
                      {mine && !m.deleted && <MessageTicks read={m.read} variant="bubble" />}
                    </span>
                  </div>
                  {/* bubble tail */}
                  <span
                    className={`absolute bottom-0 h-3 w-3 ${mine ? "-right-1 bg-whispr-crimson" : "-left-1 bg-white"}`}
                    style={{
                      clipPath: mine
                        ? "polygon(0 0, 100% 100%, 0 100%)"
                        : "polygon(100% 0, 100% 100%, 0 100%)",
                    }}
                  />
                  {/* Unsend affordance — only for your own, not-yet-deleted messages */}
                  {mine && !m.deleted && (
                    <button
                      onClick={() => handleUnsend(m.id)}
                      aria-label="Unsend message"
                      title="Unsend"
                      className="absolute -top-2 -left-2 hidden h-6 w-6 items-center justify-center rounded-full bg-white text-whispr-mauve shadow-sm transition hover:text-whispr-burgundy group-hover:flex"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </button>
                  )}
                  {/* Reply affordance — available on any not-yet-deleted
                      message, mine or theirs, opposite side from unsend. */}
                  {!m.deleted && (
                    <button
                      onClick={() => setReplyingTo(m)}
                      aria-label="Reply"
                      title="Reply"
                      className={`absolute -top-2 hidden h-6 w-6 items-center justify-center rounded-full bg-white text-whispr-mauve shadow-sm transition hover:text-whispr-coral group-hover:flex ${
                        mine ? "-right-2" : "-left-2"
                      }`}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M9 10L4 15L9 20"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M4 15H15A5 5 0 0020 10V9"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="border-t border-whispr-linen bg-white px-4 py-3.5 sm:px-6">
        {replyingTo && (
          <div className="mb-2.5 flex items-start justify-between gap-3 rounded-lg border-l-4 border-whispr-coral bg-whispr-snow px-3 py-2">
            <div className="min-w-0">
              <p className="font-body text-xs font-semibold text-whispr-coral">
                Replying to {replyingTo.sender.id === user?.id ? "yourself" : partnerName}
              </p>
              <p
                className={`truncate font-body text-xs text-whispr-mauve ${
                  replyingTo.deleted ? "italic" : ""
                }`}
              >
                {replyingTo.deleted ? "This message was unsent" : replyingTo.content}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              aria-label="Cancel reply"
              className="mt-0.5 shrink-0 text-whispr-mauve transition hover:text-whispr-noir"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}
        <div className="flex items-center gap-3">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Type a message…"
            className="flex-1 rounded-full border border-whispr-linen bg-whispr-snow px-4 py-3 font-body text-sm text-whispr-noir placeholder:text-whispr-mauve/70 focus:border-whispr-coral focus:outline-none focus:ring-2 focus:ring-whispr-coral/20"
          />
          <button
            onClick={handleSend}
            disabled={!draft.trim()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-whispr-coral to-whispr-crimson text-white shadow-sm transition hover:brightness-110 disabled:opacity-40 disabled:hover:brightness-100"
            aria-label="Send message"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
              <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}