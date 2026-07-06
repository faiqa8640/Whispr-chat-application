import { PubSub } from "graphql-subscriptions";
export const pubsub = new PubSub();

export const EVENTS = {
  MESSAGE_RECEIVED: "MESSAGE_RECEIVED",
  MESSAGES_READ: "MESSAGES_READ",
  USER_UPDATED: "USER_UPDATED",
  MESSAGE_UNSENT: "MESSAGE_UNSENT",
};