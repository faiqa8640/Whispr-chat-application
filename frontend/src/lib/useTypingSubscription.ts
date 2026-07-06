import { useEffect, useRef } from "react";
import { wsClient } from "./wsClient";
import { TYPING_STATUS_SUBSCRIPTION } from "./mutations";

interface TypingStatusData {
  typingStatus: {
    userId: string;
    receiverId: string;
    isTyping: boolean;
  };
}

/**
 * Fires whenever someone you're chatting with starts/stops typing.
 * Only events addressed to you (receiverId === your id) arrive here —
 * filtering by which conversation it belongs to (userId === partner)
 * is left to the consumer, same pattern as the other subscriptions.
 */
export function useTypingSubscription(onData: (data: TypingStatusData) => void) {
  const onDataRef = useRef(onData);
  onDataRef.current = onData;

  useEffect(() => {
    const unsubscribe = wsClient.subscribe(
      { query: TYPING_STATUS_SUBSCRIPTION },
      {
        next: (result) => {
          if (result.data) onDataRef.current(result.data as unknown as TypingStatusData);
        },
        error: (err) => console.error("Typing status subscription error:", err),
        complete: () => {},
      }
    );
    return () => unsubscribe();
  }, []);
}