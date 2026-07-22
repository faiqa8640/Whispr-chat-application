import { PubSub } from "graphql-subscriptions";
// basically we are importing the pubsub class
// pubsub => is the publish and subscribe 
// pubsub => it announce when something happens 
// it is used to publish the event okay
//publish => is the announcement =>  it annouce when something happens 
// subscribe => i want to listen for that enivernment
// every resolver need the pubsub.publish( to annouce the event) => in mutation
// and pubsub.asyncIterableIterator=> (to listen to the event) => in subscription

export const pubsub = new PubSub(); // we create the object of the pubsub 

export const EVENTS = {//now we create a event object => it contain all the event names
  MESSAGE_RECEIVED: "MESSAGE_RECEIVED",
  MESSAGES_READ: "MESSAGES_READ",
  USER_UPDATED: "USER_UPDATED",
  MESSAGE_UNSENT: "MESSAGE_UNSENT",
  MESSAGE_EDITED: "MESSAGE_EDITED",
  TYPING: "TYPING",
  USER_STATUS_CHANGED: "USER_STATUS_CHANGED",
  MESSAGE_REACTION_UPDATED: "MESSAGE_REACTION_UPDATED",
};