import { useEffect, useRef } from "react";
import { wsClient } from "./wsClient";
import { MESSAGE_EDITED_SUBSCRIPTION } from "./mutations";

interface MessageEditedData {
  messageEdited: {
    id: string;
    content: string;
    type: string;
    mediaUrl: string | null;
    mediaDuration: number | null;
    createdAt: string;
    read: boolean;
    deleted: boolean;
    // NEW: WhatsApp/Instagram-style "(edited)" flag — true once the
    // sender has edited this message's text.
    edited: boolean;
    sender: { id: string; name: string; avatar: string | null };
    receiver: { id: string; name: string; avatar: string | null };
  };
}

/**
 * Fires whenever a message this user is party to has a mutable field
 * change after it was first sent. Covers two cases: (1) a voice message
 * finishing its background S3 upload (mediaUrl changes), and (2) a text
 * message being edited (content + edited change). Same pattern as
 * useMessageUnsentSubscription — delivered to both participants.
 */
export function useMessageEditedSubscription(onData: (data: MessageEditedData) => void) {
  const onDataRef = useRef(onData);
  onDataRef.current = onData;

  useEffect(() => {
    const unsubscribe = wsClient.subscribe(
      { query: MESSAGE_EDITED_SUBSCRIPTION },
      {
        next: (result) => {
          if (result.data) onDataRef.current(result.data as unknown as MessageEditedData);
        },
        error: (err) => console.error("Message edited subscription error:", err),
        complete: () => {},
      }
    );
    return () => unsubscribe();
  }, []);
}