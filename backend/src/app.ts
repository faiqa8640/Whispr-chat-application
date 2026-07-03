import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { typeDefs } from "./graphql/typeDefs/index.js";
import { resolvers } from "./graphql/resolvers/index.js";
import { buildContext } from "./middleware/authContext.js";
import { ENV } from "./config/env.js";

export const schema = makeExecutableSchema({ typeDefs, resolvers });

export async function createApp() {
  const app = express();

  app.use(cors({ origin: ENV.CLIENT_URL, credentials: true }));
  app.use(cookieParser());
  // Default Express JSON limit is 100kb, which is too small for base64-encoded
  // avatar images sent via the updateProfile mutation. The frontend already
  // crops/compresses avatars to a small square before sending, but this limit
  // is raised as a safety net (e.g. someone bypassing the client-side crop).
  app.use(express.json({ limit: "3mb" }));

  const apollo = new ApolloServer({
    schema,
    formatError: (formattedError) => {
      if (ENV.NODE_ENV === "production") return { message: formattedError.message };
      return formattedError;
    },
  });

  await apollo.start();

  app.use(
    "/graphql",
    expressMiddleware(apollo, {
      context: async ({ req, res }) => buildContext({ req, res }),
    })
  );

  return app;
}
