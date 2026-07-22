import User from "../models/User";
import { pubsub, EVENTS } from "../graphql/pubsub";

//connectionCounts-----------------------------
const connectionCounts = new Map<string, number>();
// the user could have multiple active connection in diff tabs or diff devices
//so we create a in memory js map to count all the active connectiin
// and also keep that in your mind untill any active connection is opened the user will be shown as online 
// the connection are the web socket connnection


//isUserOnline-----------------------------
// isuseronline -> this check the active connections of the user  => return true or falsse 
export function isUserOnline(userId: string): boolean {
    // if the connectioncount of certain user is null or no then return 0 (no connection count)=> false 
    // if there is atleast one or more active connection then i.e 1>0 -> return true(have connection openn) ,if 0>0 -> return false (have no connection open)
  return (connectionCounts.get(userId) ?? 0) > 0;
}

//markUserOnline-----------------------------
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
  if (current === 0) { // if curr=0 means a connection is establiadh 
    pubsub.publish(EVENTS.USER_STATUS_CHANGED, {// we publish the event 
      userStatusChanged: { userId, isOnline: true, lastSeen: null },
    });
  }
}


// markUserOffline -----------------------------
// this function runs whenever one websocket connection closes 
export async function markUserOffline(userId: string): Promise<void> {
  // connectionCounts.get(userId) =>  get that how many tabs of certain user is opened  currently 
  const current = connectionCounts.get(userId) ?? 0;//get the current connection count 
  // if no connection exist then current  = 0 
  const next = Math.max(0, current - 1);//get the new connection count after the one connection closes
  // i.e curr=2 => max(0,1) => next =1 

  // after closing the current connection => the next ===0 => means no other connection exist 
  if (next === 0) {// if there is no more active connection-> then the user is marked from "online ->offline"
    connectionCounts.delete(userId);// so we delete the user from the connection map as there is no need to save  0 con
    const lastSeen = new Date();// last seen is set to current date 
    // go to the db find the user and update them adn set the last seen 
    // .catch(() => {} => ignore the error and continue 
    await User.findByIdAndUpdate(userId, { lastSeen }).catch(() => {});//set the last seen 
    pubsub.publish(EVENTS.USER_STATUS_CHANGED, {// publish the event
      userStatusChanged: { userId, isOnline: false, lastSeen },
    //   setting is theisonline false and setting the last seen
    });
  } else {//if the user is still online => next = 2 =>  so inthat case set the connection count just 
    connectionCounts.set(userId, next);
  }
}