import User from "../models/User.js";
import { pubsub, EVENTS } from "../graphql/pubsub.js";

/**
 * Tracks how many live WebSocket connections each user currently has open
 * (multiple browser tabs/devices count separately). A user is "online" as
 * long as this count is above zero, and only flips to "offline" — with a
 * recorded lastSeen — once their very last connection drops.
 */
const connectionCounts = new Map<string, number>();
// the user could have multiple active connection in diff tabs or diff devices
//so we create a in memory js map to count all the active connectiin
// and also keep that in your mind untill any active connection is opened the user will be shown as online 
// the connection are the web socket connnection


// isuseronline -> this check the active connections of the user 
export function isUserOnline(userId: string): boolean {
    // if the connectioncount of certain user is null or no then return 0 (no connection count)=> false 
    // if there is atleast one or more active connection then i.e 1>0 -> return true(have connection openn) ,if 0>0 -> return false (have no connection open)
  return (connectionCounts.get(userId) ?? 0) > 0;
}


// this fucntion runs whenever a websocket connection opens
// the function is asgn but dont return anything

export async function markUserOnline(userId: string): Promise<void> {
  const current = connectionCounts.get(userId) ?? 0; // get the user connection 
//   if no connection then zero 
  connectionCounts.set(userId, current + 1);//set the connection count -> if first time then 0+1
//  if second time then 1+1
// keep one thing is mind -> the user is marked as online as soon as the  atleast one connection opens
// with every  new connection we dont mark the user login again and agaim so keep that in your mind 

  // Only the *first* connection is a real transition from offline -> online.
  if (current === 0) {
    pubsub.publish(EVENTS.USER_STATUS_CHANGED, {
      userStatusChanged: { userId, isOnline: true, lastSeen: null },
    });
  }
}

// this function runs whenever one websocket connection closes
export async function markUserOffline(userId: string): Promise<void> {
  const current = connectionCounts.get(userId) ?? 0;//get the current connection count 
  const next = Math.max(0, current - 1);//get the new connection count after the one connection closes

  if (next === 0) {// if there is no more active connection-> then the user is marked from "online ->offline"
    connectionCounts.delete(userId);// delete the connection count
    const lastSeen = new Date();// last seen is et 
    // Best-effort — even if the DB write fails, the in-memory state and
    // the live subscription event below still reflect the disconnect.
    await User.findByIdAndUpdate(userId, { lastSeen }).catch(() => {});//set the last seen 
    pubsub.publish(EVENTS.USER_STATUS_CHANGED, {// publish the event
      userStatusChanged: { userId, isOnline: false, lastSeen },
    //   setting is theisonline false and setting the last seen
    });
  } else {
    connectionCounts.set(userId, next);
  }
}