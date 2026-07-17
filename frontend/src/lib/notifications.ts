export function isNotificationSupported(): boolean {
  // this check that weather the window exist  in the browser
  // and the broweser have notification api in the window
  // if both condition is true then the notifications are supported
  return typeof window !== "undefined" && "Notification" in window;
}

// This is the key used to store the user’s in-app preference in localStorage.
// Your browser storage may contain "whispr:notificationsEnabled": "true"
const NOTIFICATIONS_PREF_KEY = "whispr:notificationsEnabled";



// our app have two notification decisions
// 1)In-app preference->controlled by  user ->notification on and off
// 2)Browser permission ->controlled by the browser or the operating system 


// This function checks whether the user enabled notifications in your Profile settings.
export function isNotificationsEnabledByUser(): boolean {
  // If this code runs outside the browser(such as on server), return true.
  // Why true? Because the default app preference is “notifications enabled.”
  if (typeof window === "undefined") return true;
  try {
    // This reads the saved setting. -> true/false/null
    const stored = window.localStorage.getItem(NOTIFICATIONS_PREF_KEY);
    return stored === null ? true : stored === "true";
    // if stored=null -> return true(notifications are enabled)
  } catch {
    // If reading localStorage fails, treat notifications as enabled by default.
    return true;
  }
}

//This function saves the user’s Profile-settings choice.
// enabled -> true or false 
export function setNotificationsEnabledByUser(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    // This saves the boolean as a string because localStorage only stores strings.
    window.localStorage.setItem(NOTIFICATIONS_PREF_KEY, String(enabled));
  } catch {
    // Ignore — worst case the choice doesn't persist across reloads.
  }
}

//This returns the browser’s current notification permission state.
export function getNotificationPermission(): NotificationPermission | null {
  //NotificationPermission have the values  default, granted, denied 
  // If notifications are unsupported, return null.
  if (!isNotificationSupported()) return null;
  //If supported, return the browser’s current permission. -> i.e default
  return Notification.permission;
  // default ->The user has not been asked yet.
  // granted ->The user allowed notifications.
  // denied -> The user blocked notifications.
}

//This function asks the browser to show its notification-permission popup.
export async function requestNotificationPermission(): Promise<NotificationPermission | null> {
  if (!isNotificationSupported()) return null;
  if (Notification.permission !== "default") return Notification.permission;// return thr perimission

  try {
    // This opens the browser permission dialog. -> the user may choose granted or denied
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

//This decides whether an incoming message should create a notification.
export function shouldNotify(partnerId: string, activeId?: string): boolean {
  // Respect the in-app toggle first — if the person turned notifications
  // off in Profile settings, nothing below matters.
  if (!isNotificationsEnabledByUser()) return false;


  // ilookingatthischat become true only if:
  // ->the incoming messages are from the currently open chat
  // means that zain chat is currently open and he is sending me the notification
  // partnerid=zain(sending the msg) and activid=zain(chatopen) so zain ===zain   
  // ->the browser tab is visible 
  // -> the browser tab is focused 


  const isLookingAtThisChat =
  // This checks whether the user is actively looking at the exact conversation where the message arrived.
    partnerId === activeId &&//is the ID of the person who sent the incoming message.
    typeof document !== "undefined" &&//The code is running in a browser where document exists.
    // if running in the browser then return true else return false
    document.visibilityState === "visible" &&//The browser tab is visible, not hidden in the background.
    // means browser tab is open so return true else false 
    document.hasFocus();//The browser window is actively focused.
    // means you are using chrome => return true  if using vs code return false 

  return !isLookingAtThisChat;// if true -> see notification
  //  if false -> No notification is shown because the user can already see the message in the open chat. 
}

//This creates a TypeScript shape for the object passed into showMessageNotification.
interface ShowMessageNotificationOptions {
  /** Used as both the notification title and to group repeats from the same sender. */
  partnerId: string; // the person who send the notification 
  senderName: string;// name of sender 
  senderAvatar?: string | null;
  content: string;
  deleted?: boolean;
  onClick?: () => void;
}

//This function creates and displays the actual browser/OS notification.
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
