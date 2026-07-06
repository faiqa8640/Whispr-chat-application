/**
 * Thin wrapper around the browser Notification API for WhatsApp-style
 * "new message" push notifications. Kept dependency-free and defensive —
 * every function no-ops safely on browsers/contexts where Notifications
 * aren't available (SSR, unsupported browsers, permission denied, etc).
 */

export function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** Current permission state, or null if the API isn't supported at all. */
export function getNotificationPermission(): NotificationPermission | null {
  if (!isNotificationSupported()) return null;
  return Notification.permission;
}

/**
 * Prompts the browser's permission dialog if we're still in the "default"
 * (not yet asked) state. Safe to call repeatedly — it's a no-op once the
 * person has already granted or denied.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission | null> {
  if (!isNotificationSupported()) return null;
  if (Notification.permission !== "default") return Notification.permission;

  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/**
 * Decides whether an incoming message for `partnerId` should trigger a
 * notification, mirroring WhatsApp's behavior:
 *  - If the tab is hidden/unfocused, always notify (regardless of which
 *    chat is "open" in the background).
 *  - If the tab is visible+focused AND the message is for the conversation
 *    the person is currently looking at, don't notify — they can already
 *    see it arrive in the chat window.
 *  - Otherwise (visible/focused but a *different* conversation), notify.
 */
export function shouldNotify(partnerId: string, activeId?: string): boolean {
  const isLookingAtThisChat =
    partnerId === activeId &&
    typeof document !== "undefined" &&
    document.visibilityState === "visible" &&
    document.hasFocus();

  return !isLookingAtThisChat;
}

interface ShowMessageNotificationOptions {
  /** Used as both the notification title and to group repeats from the same sender. */
  partnerId: string;
  senderName: string;
  senderAvatar?: string | null;
  content: string;
  deleted?: boolean;
  onClick?: () => void;
}

/**
 * Fires an OS-level push notification for an incoming message. Assumes the
 * caller has already checked permission + shouldNotify(); this function
 * just does the actual display + click wiring.
 */
export function showMessageNotification({
  partnerId,
  senderName,
  senderAvatar,
  content,
  deleted,
  onClick,
}: ShowMessageNotificationOptions): void {
  if (!isNotificationSupported()) return;
  if (Notification.permission !== "granted") return;

  const body = deleted ? "This message was unsent" : content;

  const notification = new Notification(senderName, {
    body,
    icon: senderAvatar || "/favicon.svg",
    // Same tag = the OS/browser collapses rapid back-to-back messages from
    // the same person into a single notification instead of stacking a
    // pile of them, same as WhatsApp. (We'd also pass `renotify: true` so
    // each update re-alerts the person, but that option isn't in the DOM
    // lib types this project's TS version bundles — the browser still
    // updates the notification's content either way, it just won't
    // re-trigger the alert sound/vibration on every collapse.)
    tag: `whispr-message-${partnerId}`,
  } as NotificationOptions);

  notification.onclick = () => {
    window.focus();
    onClick?.();
    notification.close();
  };

  // Auto-dismiss after a bit so they don't pile up if left unread.
  setTimeout(() => notification.close(), 6000);
}
