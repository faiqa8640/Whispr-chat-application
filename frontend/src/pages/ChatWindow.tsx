import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { gql } from "../lib/gqlClient";
import {
  MESSAGES_QUERY,
  SEND_MESSAGE_MUTATION,
  MARK_CONVERSATION_READ_MUTATION,
} from "../lib/mutations";
import { useAuth } from "../context/AuthContext";
import { useMessageSubscription } from "../lib/useMessageSubscription";

interface MessageItem {
  id: string;
  content: string;
  createdAt: string;
  read: boolean;
  sender: { id: string; name: string; avatar: string | null };
  receiver: { id: string; name: string; avatar: string | null };
}

export default function ChatWindow() {
  const { userId } = useParams<{ userId: string }>();
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
    if (!isThisConversation) return;

    setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    if (msg.sender.id === user?.id) return;

    // setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    gql(MARK_CONVERSATION_READ_MUTATION, { withUserId: userId }).catch(() => {});
  });

  async function handleSend() {
    if (!draft.trim() || !userId) return;
    const content = draft.trim();
    setDraft("");
    const data = await gql<{ sendMessage: MessageItem }>(SEND_MESSAGE_MUTATION, {
      receiverId: userId,
      content,
    });
    // setMessages((prev) => [...prev, data.sendMessage]);
    setMessages((prev) =>
    prev.some((m) => m.id === data.sendMessage.id) ? prev : [...prev, data.sendMessage]);
  }

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-88px)] items-center justify-center font-body text-sm text-whispr-mauve">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-88px)] flex-col bg-whispr-snow">
      <div className="border-b border-whispr-rose/30 bg-white px-6 py-4">
        <Link to="/inbox" className="font-body text-xs text-whispr-mauve hover:text-whispr-coral">← Inbox</Link>
        <h1 className="mt-1 font-display text-xl font-semibold text-whispr-noir">{partnerName}</h1>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-6 py-6">
        {messages.map((m) => {
          const mine = m.sender.id === user?.id;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-xs rounded-2xl px-4 py-2.5 font-body text-sm ${
                  mine ? "bg-whispr-coral text-white" : "bg-white text-whispr-noir shadow-sm"
                }`}
              >
                {m.content}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-whispr-rose/30 bg-white px-6 py-4">
        <div className="flex gap-3">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Type a message…"
            className="flex-1 rounded-full border border-whispr-rose/40 bg-white px-4 py-3 font-body text-sm text-whispr-noir focus:border-whispr-coral focus:outline-none focus:ring-2 focus:ring-whispr-coral/25"
          />
          <button
            onClick={handleSend}
            className="rounded-full bg-whispr-coral px-6 py-3 font-body text-sm font-semibold text-white hover:bg-whispr-crimson"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}