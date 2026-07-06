import { useEffect, useRef } from "react";
import { wsClient } from "./wsClient";
import { MESSAGE_RECEIVED_SUBSCRIPTION } from "./mutations";

// Start listening for real-time messageReceived events when a component opens, pass each new message to your component, and stop listening when the component closes.

export function useMessageSubscription(onData: (data: { messageReceived: any }) => void) {
    // onData is a callback function. The hook calls it whenever a real-time message arrives.
  const onDataRef = useRef(onData); //create an object
//Without useRef, the subscription could keep using the first old callback forever. That old callback may contain old state values.
  onDataRef.current = onData;// every render updates it

    useEffect(() => {
    const unsubscribe = wsClient.subscribe(//wsClient.subscribe() starts the GraphQL subscription through WebSocket.
        { query: MESSAGE_RECEIVED_SUBSCRIPTION },// tell  the server to start the  received message subscription
        {
        next: (result) => {//Runs every time the backend sends a new subscription event.
            if (result.data) onDataRef.current(result.data as any);
        },
        error: (err) => console.error("Subscription error:", err),
        complete: () => {},
        }
    );
    return () => unsubscribe();
    }, []);
}