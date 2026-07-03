import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { gql } from "../../lib/gqlClient";
import { CONVERSATIONS_QUERY } from "../../lib/mutations";
import { useAuth } from "../../context/AuthContext";
import { useMessageSubscription } from "../../lib/useMessageSubscription";
import NewMessageModal from "./NewMessageModal";
import MessageTicks from "./MessageTicks";

interface ConversationItem {
  partner: { id: string; name: string; email: string; avatar: string | null };
  lastMessage: { content: string; createdAt: string; read: boolean; sender: { id: string } } | null;
  unreadCount: number;
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

  async function loadConversations() {
    const data = await gql<{ conversations: ConversationItem[] }>(CONVERSATIONS_QUERY);
    setConversations(data.conversations);
    setLoading(false);
  }

  useEffect(() => {
    loadConversations();
  }, []);

  useMessageSubscription(() => {
    loadConversations();
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.trim().toLowerCase();
    return conversations.filter((c) => c.partner.name.toLowerCase().includes(q));
  }, [conversations, search]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-whispr-linen px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="font-display text-2xl font-semibold tracking-wide text-whispr-noir">
            WHISPR
          </span>
        </div>
        <button
          onClick={() => setShowNewMessage(true)}
          aria-label="New message"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-whispr-noir text-whispr-snow transition hover:bg-whispr-burgundy"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Search */}
      <div className="border-b border-whispr-linen px-4 py-3">
        <div className="flex items-center gap-2 rounded-full bg-whispr-snow px-3.5 py-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0 text-whispr-mauve">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search chats"
            className="w-full bg-transparent font-body text-sm text-whispr-noir placeholder:text-whispr-mauve/60 focus:outline-none"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-1 p-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-[64px] animate-pulse rounded-xl bg-whispr-linen/60" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="font-display text-xl text-whispr-noir">
              {conversations.length === 0 ? "It's quiet in here" : "No matches"}
            </p>
            <p className="mx-auto mt-2 max-w-[220px] font-body text-sm text-whispr-mauve">
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
                        state: { partnerName: c.partner.name },
                      })
                    }
                    className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${
                      isActive ? "bg-whispr-petal/40" : "hover:bg-whispr-snow"
                    }`}
                  >
                    <div className="relative shrink-0">
                      <div
                        className="flex h-12 w-12 items-center justify-center rounded-full font-display text-base font-semibold text-white shadow-sm"
                        style={{ background: auraFor(c.partner.name) }}
                      >
                        {initialsFor(c.partner.name)}
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p
                          className={`truncate font-body text-[15px] leading-tight text-whispr-noir ${
                            c.unreadCount > 0 ? "font-semibold" : "font-medium"
                          }`}
                        >
                          {c.partner.name}
                        </p>
                        {c.lastMessage && (
                          <span
                            className={`shrink-0 font-body text-[11px] ${
                              c.unreadCount > 0 ? "font-semibold text-whispr-coral" : "text-whispr-mauve"
                            }`}
                          >
                            {formatWhen(c.lastMessage.createdAt)}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1">
                        {mine && c.lastMessage && <MessageTicks read={c.lastMessage.read} />}
                        <p
                          className={`truncate font-body text-[13px] ${
                            c.unreadCount > 0 ? "text-whispr-noir/75 font-medium" : "text-whispr-mauve"
                          }`}
                        >
                          {c.lastMessage?.content ?? "No messages yet"}
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
