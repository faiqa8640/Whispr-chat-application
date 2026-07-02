

import { useEffect, useRef } from "react";
import { wsClient } from "./wsClient";
import { MESSAGE_RECEIVED_SUBSCRIPTION } from "./mutations";

export function useMessageSubscription(onData: (data: { messageReceived: any }) => void) {
  const onDataRef = useRef(onData);
  onDataRef.current = onData;

    useEffect(() => {
    const unsubscribe = wsClient.subscribe(
        { query: MESSAGE_RECEIVED_SUBSCRIPTION },
        {
        next: (result) => {
            if (result.data) onDataRef.current(result.data as any);
        },
        error: (err) => console.error("Subscription error:", err),
        complete: () => {},
        }
    );
    return () => unsubscribe();
    }, []);
}