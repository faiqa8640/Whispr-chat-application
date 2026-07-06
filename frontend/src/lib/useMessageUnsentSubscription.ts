import { useEffect, useRef } from "react";
import { wsClient } from "./wsClient";
import { MESSAGE_UNSENT_SUBSCRIPTION } from "./mutations";

interface MessageUnsentData {
  messageUnsent: {
    id: string;
    content: string;
    createdAt: string;
    read: boolean;
    deleted: boolean;
    sender: { id: string; name: string; avatar: string | null };
    receiver: { id: string; name: string; avatar: string | null };
  };
}

/**
 * Fires whenever a message involving this user is unsent (soft-deleted).
 * Delivered to both participants — including the sender's other open
 * tabs/devices — same pattern as useMessageSubscription.
 */
export function useMessageUnsentSubscription(onData: (data: MessageUnsentData) => void) {
  const onDataRef = useRef(onData);
  onDataRef.current = onData;

  useEffect(() => {
    const unsubscribe = wsClient.subscribe(
      { query: MESSAGE_UNSENT_SUBSCRIPTION },
      {
        next: (result) => {
          if (result.data) onDataRef.current(result.data as unknown as MessageUnsentData);
        },
        error: (err) => console.error("Message unsent subscription error:", err),
        complete: () => {},
      }
    );
    return () => unsubscribe();
  }, []);
}