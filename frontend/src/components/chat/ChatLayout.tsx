import { Outlet, useParams } from "react-router-dom";
import ChatSidebar from "./ChatSidebar";

/**
 * WhatsApp-Web-style shell.
 * Desktop (md+): sidebar and chat pane sit side by side, always both visible.
 * Mobile: only one pane shows at a time — the sidebar when no chat is
 * selected, the chat pane once you tap into a conversation.
 *
 * Uses h-screen (not a `calc(100vh - Npx)`) because there's no navbar
 * rendered above this layout — subtracting a fixed offset for a header
 * that doesn't exist was leaving a dead strip of empty space at the
 * bottom of the viewport.
 */
export default function ChatLayout() {
  const { userId } = useParams<{ userId?: string }>();

  return (
    <div className="flex h-screen overflow-hidden bg-whispr-snow dark:bg-whispr-night">
      <div
        className={`${
          userId ? "hidden md:flex" : "flex"
        } w-full shrink-0 flex-col border-r border-whispr-linen bg-white md:w-[380px] lg:w-[400px] dark:border-whispr-ash dark:bg-whispr-charcoal`}
      >
        <ChatSidebar activeId={userId} />
      </div>

      <div className={`${userId ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}>
        <Outlet />
      </div>
    </div>
  );
}