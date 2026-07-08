import { useEffect, useRef } from "react";
import { wsClient } from "./wsClient";
import { MESSAGE_RECEIVED_SUBSCRIPTION } from "./mutations";

// Start listening for real-time messageReceived events when a component opens, pass each new message to your component, and stop listening when the component closes.

export function useMessageSubscription(onData: (data: { messageReceived: any }) => void) {
    //onData must be a function that receives subscription data:
    // data is an object it contains messageReceived and the callback returns nothing (void)

    // useRef() creates an object that survives across renders and 
    // Why use a ref here? Because your subscription is created only once due to this dependency array:
  const onDataRef = useRef(onData); 
  onDataRef.current = onData;// every render updates it
// Without the ref, the WebSocket subscription could keep using the callback from the first render. That callback may contain stale state.
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