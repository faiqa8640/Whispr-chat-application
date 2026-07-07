import { useEffect, useRef } from "react";
import { wsClient } from "./wsClient";
import { USER_UPDATED_SUBSCRIPTION } from "./mutations";

interface UserUpdatedData {
  userUpdated: {
    id: string;
    name: string;
    email: string;
    provider: "local" | "google";
    avatar: string | null;
    isVerified: boolean;
    isDeleted: boolean;
    createdAt: string;
    updatedAt: string;
  };
}

/**
 * Fires whenever any user updates their profile (name/avatar). Consumers
 * should check `userUpdated.id` against whoever they care about (a sidebar
 * contact, the partner in an open chat) before acting on it — the server
 * broadcasts this to every connected client except the one who made the
 * change, same pattern as useMessageSubscription / useReadReceiptSubscription.
 */
export function useUserUpdatedSubscription(onData: (data: UserUpdatedData) => void) {
  const onDataRef = useRef(onData);
  onDataRef.current = onData;

  useEffect(() => {
    const unsubscribe = wsClient.subscribe(
      { query: USER_UPDATED_SUBSCRIPTION },
      {
        next: (result) => {
          if (result.data) onDataRef.current(result.data as unknown as UserUpdatedData);
        },
        error: (err) => console.error("User updated subscription error:", err),
        complete: () => {},
      }
    );
    return () => unsubscribe();
  }, []);
}
