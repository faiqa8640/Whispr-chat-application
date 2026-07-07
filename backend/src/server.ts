import http from "http";
import { WebSocketServer } from "ws";
import { useServer } from "graphql-ws/use/ws";
import { createApp, schema } from "./app.js";
import { connectDB } from "./config/db.js";
import { ENV } from "./config/env.js";
import { verifyToken } from "./utils/token.js";
import User from "./models/User.js";
import { markUserOnline, markUserOffline } from "./utils/onlineStatus.js";

// ─── Small helper: extract one cookie value from a raw Cookie header ─────────
function getCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}

async function main() {
  await connectDB();
  const app = await createApp();
  const httpServer = http.createServer(app);

  const wsServer = new WebSocketServer({
    server: httpServer,
    path: "/graphql",
  });

  useServer(
    {
      schema,
      // Per-operation context — reuses the user resolved once in onConnect
      // (stashed on ctx.extra) instead of re-verifying the token every time.
      context: async (ctx: any) => {
        return { user: ctx.extra?.user ?? null };
      },
      // Runs once when a client's WebSocket connection is established.
      // Resolves the user from their cookie, stashes it on the connection,
      // and marks them online (bumping their connection count).
      onConnect: async (ctx: any) => {
        const token = getCookie(ctx.extra?.request?.headers?.cookie, "delina_token");
        let user = null;
        if (token) {
          try {
            const decoded = verifyToken(token);
            user = await User.findById(decoded.id);
            // Same rule as the HTTP context: a deleted account's cookie
            // doesn't grant a live socket identity even if unexpired.
            if (user?.isDeleted) {
              user = null;
            }
          } catch {
            // invalid/expired — stay unauthenticated
          }
        }
        ctx.extra.user = user;
        if (user) {
          await markUserOnline(user._id.toString());
        }
      },
      // Runs once when the socket closes (tab closed, refresh, network
      // drop, etc). Flips the person to offline — with a recorded
      // lastSeen — only once their *last* open tab/device disconnects.
      onDisconnect: async (ctx: any) => {
        const user = ctx.extra?.user;
        if (user) {
          await markUserOffline(user._id.toString());
        }
      },
    },
    wsServer
  );

  httpServer.listen(ENV.PORT, () => {
    console.log(`GraphQL ready at http://localhost:${ENV.PORT}/graphql`);
    console.log(`WebSocket ready at ws://localhost:${ENV.PORT}/graphql`);
  });
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});