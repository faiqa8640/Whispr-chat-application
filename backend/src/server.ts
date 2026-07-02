import http from "http";
import { WebSocketServer } from "ws";
import { useServer } from "graphql-ws/use/ws";
import { createApp, schema } from "./app.js";
import { connectDB } from "./config/db.js";
import { ENV } from "./config/env.js";
import { verifyToken } from "./utils/token.js";
import User from "./models/User.js";

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
      context: async (ctx: any) => {
        const token = getCookie(ctx.extra.request.headers.cookie, "delina_token");
        let user = null;
        if (token) {
          try {
            const decoded = verifyToken(token);
            user = await User.findById(decoded.id);
          } catch {
            // invalid/expired — stay unauthenticated
          }
        }
        return { user };
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