import { useEffect, useRef } from "react";
import { wsClient } from "./wsClient";
import { USER_STATUS_CHANGED_SUBSCRIPTION } from "./mutations";

interface UserStatusData {
  userStatusChanged: {
    userId: string;
    isOnline: boolean;
    lastSeen: string | null;
  };
}

/**
 * Fires whenever any user's online/offline status changes (their first
 * connection opened, or their last connection dropped). The server
 * broadcasts this to every authenticated client — consumers should check
 * `userId` against whoever they care about (a sidebar contact, the person
 * in an open chat) before acting on it, same pattern as
 * useUserUpdatedSubscription.
 */
export function useUserStatusSubscription(onData: (data: UserStatusData) => void) {
  const onDataRef = useRef(onData);
  onDataRef.current = onData;

  useEffect(() => {
    const unsubscribe = wsClient.subscribe(
      { query: USER_STATUS_CHANGED_SUBSCRIPTION },
      {
        next: (result) => {
          if (result.data) onDataRef.current(result.data as unknown as UserStatusData);
        },
        error: (err) => console.error("User status subscription error:", err),
        complete: () => {},
      }
    );
    return () => unsubscribe();
  }, []);
}