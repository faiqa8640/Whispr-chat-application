// import { PubSub } from "graphql-subscriptions";
// export const pubsub = new PubSub();

// export const EVENTS = {
//   MESSAGE_RECEIVED: "MESSAGE_RECEIVED",
//   MESSAGES_READ: "MESSAGES_READ",
//   USER_UPDATED: "USER_UPDATED",
//   MESSAGE_UNSENT: "MESSAGE_UNSENT",
//   TYPING: "TYPING",
//   USER_STATUS_CHANGED: "USER_STATUS_CHANGED",
// };



import { PubSub } from "graphql-subscriptions";
export const pubsub = new PubSub();

export const EVENTS = {
  MESSAGE_RECEIVED: "MESSAGE_RECEIVED",
  MESSAGES_READ: "MESSAGES_READ",
  USER_UPDATED: "USER_UPDATED",
  MESSAGE_UNSENT: "MESSAGE_UNSENT",
  MESSAGE_EDITED: "MESSAGE_EDITED",
  TYPING: "TYPING",
  USER_STATUS_CHANGED: "USER_STATUS_CHANGED",
};