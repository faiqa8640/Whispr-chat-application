import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { gql } from "../../lib/gqlClient";
import { CONVERSATIONS_QUERY } from "../../lib/mutations";
import { useAuth } from "../../context/AuthContext";
import { useMessageSubscription } from "../../lib/useMessageSubscription";
import { useUserUpdatedSubscription } from "../../lib/useUserUpdatedSubscription";
import { useMessageUnsentSubscription } from "../../lib/useMessageUnsentSubscription";
import { useReadReceiptSubscription } from "../../lib/useReadReceiptSubscription";
import { useUserStatusSubscription } from "../../lib/useUserStatusSubscription";
import NewMessageModal from "./NewMessageModal";
import MessageTicks from "./MessageTicks";
import {
  getNotificationPermission,
  isNotificationsEnabledByUser,
  requestNotificationPermission,
  setNotificationsEnabledByUser,
  shouldNotify,
  showMessageNotification,
} from "../../lib/notifications";

interface ConversationItem {
  partner: {
    id: string;
    name: string;
    email: string;
    avatar: string | null;
    isOnline: boolean;
    lastSeen: string | null;
  };
  lastMessage: {
    id: string;
    content: string;
    createdAt: string;
    read: boolean;
    deleted: boolean;
    sender: { id: string };
  } | null;
  unreadCount: number;
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

function formatWhen(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function ChatSidebar({ activeId }: { activeId?: string }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [search, setSearch] = useState("");

  // Push-notification permission (WhatsApp-style "new message" alerts).
  // Initialized from the browser's current state so we don't show the
  // "enable notifications" banner if the person already granted/denied it
  // in a previous session.
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | null>(
    () => getNotificationPermission()
  );
  const [notifBannerDismissed, setNotifBannerDismissed] = useState(false);

  async function handleEnableNotifications() {
    const result = await requestNotificationPermission();
    setNotifPermission(result);
    // Keep the Profile-settings toggle in sync — granting here should
    // count as "on", same as flipping the switch there would.
    if (result === "granted") setNotificationsEnabledByUser(true);
  }

  async function loadConversations() {
    const data = await gql<{ conversations: ConversationItem[] }>(CONVERSATIONS_QUERY);
    setConversations(data.conversations);
    setLoading(false);
  }

  useEffect(() => {
    loadConversations();
  }, []);

  // WhatsApp-style: the moment a conversation becomes the active one
  // (the user navigated into it), its unread badge clears immediately —
  // don't wait for the mark-as-read network round trip to reflect it here.
  useEffect(() => {
    if (!activeId) return;
    setConversations((prev) =>
      prev.map((c) => (c.partner.id === activeId ? { ...c, unreadCount: 0 } : c))
    );
  }, [activeId]);

  // Update the relevant conversation in place instead of refetching
  // everything on every message. A full refetch here would race against
  // ChatWindow's markConversationRead call and could momentarily show a
  // stale unread count for the conversation you already have open.
  useMessageSubscription((data) => {
    const msg = data.messageReceived as {
      id: string;
      content: string;
      createdAt: string;
      read: boolean;
      deleted: boolean;
      sender: { id: string; name: string; avatar: string | null };
      receiver: { id: string; name: string; avatar: string | null };
    };
    const partnerId = msg.sender.id === user?.id ? msg.receiver.id : msg.sender.id;
    const wasSentByMe = msg.sender.id === user?.id;

    // Push a WhatsApp-style OS notification for incoming messages the
    // person isn't actively looking at right now. Sent-by-me messages
    // never notify, and shouldNotify() handles the "already viewing this
    // exact conversation" and tab-focus cases.
    if (!wasSentByMe && shouldNotify(partnerId, activeId)) {
      showMessageNotification({
        partnerId,
        senderName: msg.sender.name,
        senderAvatar: msg.sender.avatar,
        content: msg.content,
        deleted: msg.deleted,
        onClick: () => {
          navigate(`/chat/${partnerId}`, {
            state: { partnerName: msg.sender.name, partnerAvatar: msg.sender.avatar },
          });
        },
      });
    }

    setConversations((prev) => {
      const idx = prev.findIndex((c) => c.partner.id === partnerId);

      // Brand-new conversation partner we don't have a row for yet —
      // only a full refetch can build that row (needs partner details).
      if (idx === -1) {
        loadConversations();
        return prev;
      }

      const isActive = partnerId === activeId;
      const updated = [...prev];
      const existing = updated[idx];
      updated[idx] = {
        ...existing,
        lastMessage: msg,
        // Stays at 0 if it's the chat you're currently viewing, or if you
        // were the one who sent it. Otherwise increments like normal.
        unreadCount: isActive || wasSentByMe ? 0 : existing.unreadCount + 1,
      };

      // Bump the conversation to the top, WhatsApp-style.
      const [item] = updated.splice(idx, 1);
      updated.unshift(item);
      return updated;
    });
  });

  // Live profile updates — WhatsApp-style: if a person you're chatting with
  // changes their name or photo, patch it into the list in place instead of
  // waiting for a refresh / re-fetch.
  useUserUpdatedSubscription(({ userUpdated }) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.partner.id === userUpdated.id
          ? { ...c, partner: { ...c.partner, name: userUpdated.name, avatar: userUpdated.avatar } }
          : c
      )
    );
  });

  // Live presence — flips the online dot / updates lastSeen for a sidebar
  // contact the moment they connect or disconnect, no refetch needed.
  useUserStatusSubscription(({ userStatusChanged }) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.partner.id === userStatusChanged.userId
          ? {
              ...c,
              partner: {
                ...c.partner,
                isOnline: userStatusChanged.isOnline,
                lastSeen: userStatusChanged.lastSeen,
              },
            }
          : c
      )
    );
  });

  // Real-time unsend — if the unsent message was the conversation's
  // preview line, patch it in place so the sidebar flips to the
  // "unsent" placeholder without needing a refetch.
  useMessageUnsentSubscription(({ messageUnsent }) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.lastMessage?.id === messageUnsent.id
          ? { ...c, lastMessage: { ...c.lastMessage, deleted: true, content: "" } }
          : c
      )
    );
  });

  // Real "seen" signal for the sidebar preview row — mirrors what
  // ChatWindow does for the open conversation. Without this, the
  // sidebar tick only turns blue/violet after a full loadConversations()
  // refetch (e.g. on remount), even though the actual chat already
  // shows it as read.
  useReadReceiptSubscription(({ messagesRead }) => {
    // readerId is the partner who just read your messages (the person
    // whose sidebar row this is); conversationWith is you (the original
    // sender) and isn't useful for matching a row here.
    setConversations((prev) =>
      prev.map((c) =>
        c.partner.id === messagesRead.readerId && c.lastMessage
          ? { ...c, lastMessage: { ...c.lastMessage, read: true } }
          : c
      )
    );
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.trim().toLowerCase();
    return conversations.filter((c) => c.partner.name.toLowerCase().includes(q));
  }, [conversations, search]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-whispr-linen px-5 py-4 dark:border-whispr-ash">
        <div className="flex items-center gap-2.5">
          <span className="font-display text-2xl font-semibold tracking-wide text-whispr-noir dark:text-whispr-ivory">
            WHISPR
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/settings")}
            aria-label="Profile settings"
            className="flex h-9 w-9 items-center justify-center rounded-full text-whispr-mauve transition hover:bg-whispr-linen hover:text-whispr-noir dark:text-whispr-fog dark:hover:bg-whispr-onyx dark:hover:text-whispr-ivory"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
              <path
                d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 008.6 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H2a2 2 0 010-4h.09A1.65 1.65 0 003.6 8.6a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H8a1.65 1.65 0 001-1.51V2a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V8a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            onClick={() => setShowNewMessage(true)}
            aria-label="New message"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-whispr-noir text-whispr-snow transition hover:bg-whispr-burgundy dark:bg-whispr-coral dark:text-white dark:hover:bg-whispr-crimson"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Enable-notifications prompt — only shown when the browser supports
          it and the person hasn't already granted/denied/dismissed it */}
      {notifPermission === "default" && !notifBannerDismissed && isNotificationsEnabledByUser() && (
        <div className="flex items-center justify-between gap-3 border-b border-whispr-linen bg-whispr-petal/30 px-4 py-2.5 dark:border-whispr-ash dark:bg-whispr-onyx/70">
          <p className="font-body text-xs text-whispr-noir dark:text-whispr-ivory">
            Turn on notifications to know when new messages arrive.
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={handleEnableNotifications}
              className="rounded-full bg-whispr-coral px-3 py-1 font-body text-[11px] font-semibold uppercase tracking-wider text-white transition hover:bg-whispr-crimson"
            >
              Enable
            </button>
            <button
              onClick={() => setNotifBannerDismissed(true)}
              aria-label="Dismiss"
              className="flex h-6 w-6 items-center justify-center rounded-full text-whispr-mauve transition hover:bg-white/60 hover:text-whispr-noir dark:text-whispr-fog dark:hover:bg-whispr-onyx dark:hover:text-whispr-ivory"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="border-b border-whispr-linen px-4 py-3 dark:border-whispr-ash">
        <div className="flex items-center gap-2 rounded-full bg-whispr-snow px-3.5 py-2 dark:bg-whispr-onyx">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0 text-whispr-mauve dark:text-whispr-fog">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search chats"
            className="w-full bg-transparent font-body text-sm text-whispr-noir placeholder:text-whispr-mauve/60 focus:outline-none dark:text-whispr-ivory dark:placeholder:text-whispr-fog/60"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-1 p-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-[64px] animate-pulse rounded-xl bg-whispr-linen/60 dark:bg-whispr-ash/30" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="font-display text-xl text-whispr-noir dark:text-whispr-ivory">
              {conversations.length === 0 ? "It's quiet in here" : "No matches"}
            </p>
            <p className="mx-auto mt-2 max-w-[220px] font-body text-sm text-whispr-mauve dark:text-whispr-fog">
              {conversations.length === 0
                ? "Start a new chat to say hello."
                : "Try a different name."}
            </p>
          </div>
        ) : (
          <ul className="px-2 py-1.5">
            {filtered.map((c) => {
              const isActive = c.partner.id === activeId;
              const mine = c.lastMessage?.sender.id === user?.id;
              return (
                <li key={c.partner.id}>
                  <button
                    onClick={() =>
                      navigate(`/chat/${c.partner.id}`, {
                        state: { partnerName: c.partner.name, partnerAvatar: c.partner.avatar },
                      })
                    }
                    className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${
                      isActive
                        ? "bg-whispr-petal/40 dark:bg-whispr-onyx"
                        : "hover:bg-whispr-snow dark:hover:bg-whispr-onyx/60"
                    }`}
                  >
                    <div className="relative shrink-0">
                      {c.partner.avatar ? (
                        <img
                          src={c.partner.avatar}
                          alt={c.partner.name}
                          className="h-12 w-12 rounded-full object-cover shadow-sm"
                        />
                      ) : (
                        <div
                          className="flex h-12 w-12 items-center justify-center rounded-full font-display text-base font-semibold text-white shadow-sm"
                          style={{ background: auraFor(c.partner.name) }}
                        >
                          {initialsFor(c.partner.name)}
                        </div>
                      )}
                      {/* Online presence dot — WhatsApp-style, only shown
                          when the partner currently has a live connection. */}
                      {c.partner.isOnline && (
                        <span
                          className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-green-500 dark:border-whispr-charcoal"
                          aria-label="Online"
                        />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p
                          className={`truncate font-body text-[15px] leading-tight text-whispr-noir dark:text-whispr-ivory ${
                            c.unreadCount > 0 ? "font-semibold" : "font-medium"
                          }`}
                        >
                          {c.partner.name}
                        </p>
                        {c.lastMessage && (
                          <span
                            className={`shrink-0 font-body text-[11px] ${
                              c.unreadCount > 0
                                ? "font-semibold text-whispr-coral"
                                : "text-whispr-mauve dark:text-whispr-fog"
                            }`}
                          >
                            {formatWhen(c.lastMessage.createdAt)}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1">
                        {mine && c.lastMessage && !c.lastMessage.deleted && (
                          <MessageTicks read={c.lastMessage.read} />
                        )}
                        <p
                          className={`truncate font-body text-[13px] ${
                            c.unreadCount > 0
                              ? "text-whispr-noir/75 font-medium dark:text-whispr-ivory/80"
                              : "text-whispr-mauve dark:text-whispr-fog"
                          } ${c.lastMessage?.deleted ? "italic" : ""}`}
                        >
                          {c.lastMessage
                            ? c.lastMessage.deleted
                              ? "This message was unsent"
                              : c.lastMessage.content
                            : "No messages yet"}
                        </p>
                      </div>
                    </div>

                    {c.unreadCount > 0 && (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-whispr-coral px-1.5 font-body text-[11px] font-semibold text-white">
                        {c.unreadCount}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {showNewMessage && (
        <NewMessageModal
          onClose={() => setShowNewMessage(false)}
          onFound={(partnerId, partnerName) => {
            setShowNewMessage(false);
            navigate(`/chat/${partnerId}`, { state: { partnerName } });
          }}
        />
      )}
    </div>
  );
}