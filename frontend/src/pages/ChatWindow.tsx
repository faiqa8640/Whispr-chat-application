import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { gql } from "../lib/gqlClient";
import {
  MESSAGES_QUERY,
  SEND_MESSAGE_MUTATION,
  MARK_CONVERSATION_READ_MUTATION,
} from "../lib/mutations";
import { useAuth } from "../context/AuthContext";
import { useMessageSubscription } from "../lib/useMessageSubscription";
import { useReadReceiptSubscription } from "../lib/useReadReceiptSubscription";
import MessageTicks from "../components/chat/MessageTicks";

interface MessageItem {
  id: string;
  content: string;
  createdAt: string;
  read: boolean;
  sender: { id: string; name: string; avatar: string | null };
  receiver: { id: string; name: string; avatar: string | null };
}

// Every avatar uses the same dark-purple gradient as sent message bubbles
// (whispr-coral → whispr-crimson) so avatars and "your" bubbles read as
// one consistent brand color instead of a different shade per person.
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
  const bottomRef = useRef<HTMLDivElement>(null);

  async function loadMessages() {
    if (!userId) return;
    const data = await gql<{ messages: MessageItem[] }>(MESSAGES_QUERY, {
      withUserId: userId,
      limit: 100,
    });
    setMessages(data.messages);
    const withPartner = data.messages.find((m) => m.sender.id === userId || m.receiver.id === userId);
    if (withPartner) {
      setPartnerName(withPartner.sender.id === userId ? withPartner.sender.name : withPartner.receiver.name);
    }
    setLoading(false);
    await gql(MARK_CONVERSATION_READ_MUTATION, { withUserId: userId });
  }

  useEffect(() => {
    setLoading(true);
    // If we arrived here via the sidebar / new-message modal, the partner's
    // name was passed in router state — use it immediately instead of
    // waiting on loadMessages(), which can't find a name from an empty
    // (brand-new) conversation's message list.
    const stateName = (location.state as { partnerName?: string } | null)?.partnerName;
    setPartnerName(stateName ?? "");
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

  async function handleSend() {
    if (!draft.trim() || !userId) return;
    const content = draft.trim();
    setDraft("");
    const data = await gql<{ sendMessage: MessageItem }>(SEND_MESSAGE_MUTATION, {
      receiverId: userId,
      content,
    });
    setMessages((prev) =>
      prev.some((m) => m.id === data.sendMessage.id) ? prev : [...prev, data.sendMessage]
    );
    // Safety net: if we still don't have a partner name (e.g. state was lost
    // on a refresh mid-conversation), the send response always carries it.
    setPartnerName((prev) => prev || data.sendMessage.receiver.name);
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
        <div
          className="flex h-10 w-10 items-center justify-center rounded-full font-display text-sm font-semibold text-white"
          style={{ background: auraFor(partnerName || "?") }}
        >
          {partnerName ? initialsFor(partnerName) : "?"}
        </div>
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
                <div className={`relative max-w-[75%] sm:max-w-[65%]`}>
                  <div
                    className={`px-4 py-2 font-body text-sm leading-relaxed shadow-sm ${
                      mine
                        ? "rounded-2xl rounded-br-sm bg-gradient-to-br from-whispr-coral to-whispr-crimson text-white"
                        : "rounded-2xl rounded-bl-sm bg-white text-whispr-noir"
                    }`}
                  >
                    <span className="break-words">{m.content}</span>
                    <span
                      className={`ml-2 mt-1 inline-flex translate-y-[3px] items-center gap-1 align-bottom font-body text-[10px] ${
                        mine ? "text-white/75" : "text-whispr-mauve"
                      }`}
                    >
                      {formatTime(m.createdAt)}
                      {mine && <MessageTicks read={m.read} variant="bubble" />}
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
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="border-t border-whispr-linen bg-white px-4 py-3.5 sm:px-6">
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
