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


// we create a react hook and it accept a function callled onData 
// whenever an edited msg would be received this function would be called 
export function useMessageEditedSubscription(onData: (data: MessageEditedData) => void) {
  // create the useRef  that stores the latest onData function  and it survive the rerender 
  // ondata function is a call back
  const onDataRef = useRef(onData);
  onDataRef.current = onData;// updates the ref with the latest version of  callback on every render

  useEffect(() => {// runs this code when the components appear on the screen
    const unsubscribe = wsClient.subscribe(
      // Starts a GraphQL subscription using the WebSocket client.
      // means start listening for message edit event 
      { query: MESSAGE_EDITED_SUBSCRIPTION },
      // tell the server to which subscription listen to 
      // means notify me whenever a message is edited
      {
        next: (result) => {// whenever the server send the new data  next runs 
          // runs everytime the server send the new subscription data
          
          // check if the server actually send the data
          // call the callback function 
          if (result.data) onDataRef.current(result.data as unknown as MessageEditedData);
          // treat the received data as message edited type
        },
        error: (err) => console.error("Message edited subscription error:", err),
        complete: () => {},// runs when the subscription ends 
      }
    );
    return () => unsubscribe();// cleaup function
  }, []);
}