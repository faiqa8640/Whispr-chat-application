import { PubSub } from "graphql-subscriptions";

// Shared across resolver files so both authResolvers (updateProfile) and
// messageResolvers (sendMessage, markConversationRead, unsendMessage) can
// publish/subscribe to the same event bus without a circular import
// between the two files.
export const pubsub = new PubSub();

export const EVENTS = {
  MESSAGE_RECEIVED: "MESSAGE_RECEIVED",
  MESSAGES_READ: "MESSAGES_READ",
  USER_UPDATED: "USER_UPDATED",
  MESSAGE_UNSENT: "MESSAGE_UNSENT",
};