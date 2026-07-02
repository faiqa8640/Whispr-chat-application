import { createClient } from "graphql-ws";

const WS_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL.replace(/^http/, "ws")}/graphql`
  : "ws://localhost:5000/graphql";

export const wsClient = createClient({ url: WS_URL });