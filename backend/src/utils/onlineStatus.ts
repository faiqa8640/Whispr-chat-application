import User from "../models/User.js";
import { pubsub, EVENTS } from "../graphql/pubsub.js";

/**
 * Tracks how many live WebSocket connections each user currently has open
 * (multiple browser tabs/devices count separately). A user is "online" as
 * long as this count is above zero, and only flips to "offline" — with a
 * recorded lastSeen — once their very last connection drops.
 */
const connectionCounts = new Map<string, number>();

export function isUserOnline(userId: string): boolean {
  return (connectionCounts.get(userId) ?? 0) > 0;
}

export async function markUserOnline(userId: string): Promise<void> {
  const current = connectionCounts.get(userId) ?? 0;
  connectionCounts.set(userId, current + 1);

  // Only the *first* connection is a real transition from offline -> online.
  if (current === 0) {
    pubsub.publish(EVENTS.USER_STATUS_CHANGED, {
      userStatusChanged: { userId, isOnline: true, lastSeen: null },
    });
  }
}

export async function markUserOffline(userId: string): Promise<void> {
  const current = connectionCounts.get(userId) ?? 0;
  const next = Math.max(0, current - 1);

  if (next === 0) {
    connectionCounts.delete(userId);
    const lastSeen = new Date();
    // Best-effort — even if the DB write fails, the in-memory state and
    // the live subscription event below still reflect the disconnect.
    await User.findByIdAndUpdate(userId, { lastSeen }).catch(() => {});
    pubsub.publish(EVENTS.USER_STATUS_CHANGED, {
      userStatusChanged: { userId, isOnline: false, lastSeen },
    });
  } else {
    connectionCounts.set(userId, next);
  }
}