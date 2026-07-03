import { useEffect, useRef } from "react";
import { wsClient } from "./wsClient";
import { MESSAGES_READ_SUBSCRIPTION } from "./mutations";

interface ReadReceiptData {
  messagesRead: { readerId: string; conversationWith: string };
}

/**
 * Fires whenever someone marks a conversation with you as read —
 * i.e. the real "seen" event, not a guess based on your own actions.
 */
export function useReadReceiptSubscription(onData: (data: ReadReceiptData) => void) {
  const onDataRef = useRef(onData);
  onDataRef.current = onData;

  useEffect(() => {
    const unsubscribe = wsClient.subscribe(
      { query: MESSAGES_READ_SUBSCRIPTION },
      {
        next: (result) => {
          if (result.data) onDataRef.current(result.data as unknown as ReadReceiptData);
        },
        error: (err) => console.error("Read receipt subscription error:", err),
        complete: () => {},
      }
    );
    return () => unsubscribe();
  }, []);
}
