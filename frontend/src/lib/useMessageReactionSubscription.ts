import { useEffect, useRef } from "react";
import { wsClient } from "./wsClient";
import { MESSAGE_REACTION_UPDATED_SUBSCRIPTION } from "./mutations";

interface MessageReactionUpdatedData {
  messageReactionUpdated: {
    id: string;
    sender: { id: string; name: string; avatar: string | null };
    receiver: { id: string; name: string; avatar: string | null };
    reactions: { emoji: string; user: { id: string; name: string } }[];
  };
}

/**
 * Fires whenever a message involving this user gets its reactions
 * changed (someone added, swapped, or removed their emoji reaction).
 * Delivered to both participants — including the reactor's other open
 * tabs/devices — same pattern as useMessageUnsentSubscription /
 * useMessageEditedSubscription.
 */
export function useMessageReactionSubscription(
  onData: (data: MessageReactionUpdatedData) => void
) {
  const onDataRef = useRef(onData);
  onDataRef.current = onData;

  useEffect(() => {
    const unsubscribe = wsClient.subscribe(
      { query: MESSAGE_REACTION_UPDATED_SUBSCRIPTION },
      {
        next: (result) => {
          if (result.data) onDataRef.current(result.data as unknown as MessageReactionUpdatedData);
        },
        error: (err) => console.error("Message reaction subscription error:", err),
        complete: () => {},
      }
    );
    return () => unsubscribe();
  }, []);
}