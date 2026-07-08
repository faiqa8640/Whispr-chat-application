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
import uploadRouter from "./routes/upload.js"; // NEW
import mediaProxyRouter from "./routes/mediaProxy.js";// FOR THE MEDIA AS THE THING IS THAT THE 
// WE NEED TO CHNAGE THE CORS OF THE BUCKET SO AS WE CANT DO IT SO WE DID THIS 

export const schema = makeExecutableSchema({ typeDefs, resolvers });

export async function createApp() {
  const app = express();

  app.use(cors({ origin: ENV.CLIENT_URL, credentials: true }));
  app.use(cookieParser());
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

  // NEW — REST endpoint for image/voice uploads
  app.use("/api", uploadRouter);
  app.use("/api", mediaProxyRouter);

  return app;
}