import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { gql } from "../lib/gqlClient";
import { CONVERSATIONS_QUERY } from "../lib/mutations";
import NewMessageModal from "../components/chat/NewMessageModal";
import { useMessageSubscription } from "../lib/useMessageSubscription";

interface ConversationItem {
  partner: { id: string; name: string; email: string; avatar: string | null };
  lastMessage: { content: string } | null;
  unreadCount: number;
}

export default function Inbox() {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewMessage, setShowNewMessage] = useState(false);

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

  return (
    <div className="min-h-[calc(100vh-88px)] bg-whispr-snow px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="font-display text-3xl font-semibold text-whispr-noir">Inbox</h1>
          <button
            onClick={() => setShowNewMessage(true)}
            className="rounded-full bg-whispr-coral px-5 py-2.5 font-body text-sm font-semibold uppercase tracking-wider text-white hover:bg-whispr-crimson"
          >
            Send New Message
          </button>
        </div>

        {loading ? (
          <p className="font-body text-sm text-whispr-mauve">Loading conversations…</p>
        ) : conversations.length === 0 ? (
          <p className="font-body text-sm text-whispr-mauve">
            No conversations yet. Send your first message to get started.
          </p>
        ) : (
          <ul className="space-y-2">
            {conversations.map((c) => (
              <li key={c.partner.id}>
                <button
                  onClick={() => navigate(`/chat/${c.partner.id}`)}
                  className="flex w-full items-center justify-between rounded-lg border border-whispr-rose/30 bg-white px-4 py-3.5 text-left shadow-sm transition hover:border-whispr-coral/50"
                >
                  <div>
                    <p className="font-body text-sm font-semibold text-whispr-noir">{c.partner.name}</p>
                    <p className="mt-0.5 line-clamp-1 font-body text-xs text-whispr-mauve">
                      {c.lastMessage?.content ?? "No messages yet"}
                    </p>
                  </div>
                  {c.unreadCount > 0 && (
                    <span className="ml-3 flex h-5 min-w-5 items-center justify-center rounded-full bg-whispr-coral px-1.5 font-body text-[11px] font-semibold text-white">
                      {c.unreadCount}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showNewMessage && (
        <NewMessageModal
          onClose={() => setShowNewMessage(false)}
          onFound={(partnerId) => {
            setShowNewMessage(false);
            navigate(`/chat/${partnerId}`);
          }}
        />
      )}
    </div>
  );
}