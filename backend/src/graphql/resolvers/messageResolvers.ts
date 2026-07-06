import { withFilter } from "graphql-subscriptions";
import Message from "../../models/Message.js";
import User from "../../models/User.js";
import { AuthContext, requireAuth } from "../../middleware/authContext.js";
import { formatUser } from "./authResolvers.js";
import type { IUser } from "../../models/User.js";
import { pubsub, EVENTS } from "../pubsub.js";

export { pubsub };

function formatMessage(msg: any) {
  return {
    id: msg._id.toString(),
    sender: formatUser(msg.sender),
    receiver: formatUser(msg.receiver),
    // Once a message is unsent, its content is wiped server-side too —
    // this is just a defensive second layer in case a stale doc somehow
    // still has content set.
    content: msg.deleted ? "" : msg.content,
    read: msg.read,
    deleted: !!msg.deleted,
    createdAt: msg.createdAt,
    // replyTo is only populated when the message quotes an earlier one.
    // If the quoted message was itself unsent, blank its content here too
    // so the preview shows "This message was unsent" instead of leaking
    // the original text.
    replyTo: msg.replyTo
      ? {
          id: msg.replyTo._id.toString(),
          sender: formatUser(msg.replyTo.sender),
          content: msg.replyTo.deleted ? "" : msg.replyTo.content,
          deleted: !!msg.replyTo.deleted,
        }
      : null,
  };
}

export const messageResolvers = {

    // _QUERY____________________________________________________________

  Query: {

    // _findUserByEmail____________________________________________
    // This lets a logged-in user search for another user by email.
    // parent->unknown or unused, arg->email(by frontend), ctx->authenticated request context 
    findUserByEmail: async (_: unknown, { email }: { email: string }, ctx: AuthContext) => {
      requireAuth(ctx);//This prevents anonymous users from searching your user database.
      const user = await User.findOne({ email: email.toLowerCase() });
      return user ? formatUser(user) : null;
    },

    // _getCoversationsHistory____________________________________________
    // this gets the chat history  on the side bar
    conversations: async (_: unknown, __: unknown, ctx: AuthContext) => {
      const me = requireAuth(ctx);
      //This checks whether the current request has an authenticated user.
      const userId = me._id; // gets the current logined user id

      // uses the aggregation pipeline-> coz complex as can do the work with simple find
      // the result return the parter ids
      const results = await Message.aggregate([
        // Step 1: Find all messages involving the logged-in user
        // check every msg where the user is either sender or recevier
        { $match: { $or: [{ sender: userId }, { receiver: userId }] } },
        // Step 2:sort the newest msgs first -> -1 means desending order
        { $sort: { createdAt: -1 } },
        {

          // so the group return the partner id and last msg of that convo and the unreadmsg count of all the partners
          $group: {
            // Step 3: Group messages by chat partner
            // if userid=sender then return  (true) receiver and else return sender
            // if faiqa send msg to zain .. and userid=faiqa then faiqa =faiqa ->_id=zain
            // if zain send msg to faiqa .. and faiqa !=zainn then _id = zain.. 
            // so all the message is grouped as zain convo
            _id: { $cond: [{ $eq: ["$sender", userId] }, "$receiver", "$sender"] },
            // Latest message for each conversation
            lastMessage: { $first: "$$ROOT" },//store the last message of the convo

            // this run for every message in the conversation
            unreadCount: {
              $sum: {
                $cond: [
                  // if current user is receiver and msg is unread -> 1 elese ->0
                  { $and: [{ $eq: ["$receiver", userId] }, { $eq: ["$read", false] }] },
                  1,
                  0,
                ],
              },
            },
          },
        },
        // Sort conversations by latest message
        { $sort: { "lastMessage.createdAt": -1 } },
      ]);

      // The aggregation above returns raw Message documents for `lastMessage`
      // (via $first: "$$ROOT"), so sender/receiver/replyTo are still plain
      // ObjectIds -- aggregate() does NOT run Mongoose .populate(). Since
      // formatMessage() expects those fields to already be populated user
      // (and replyTo.sender) documents, we populate them here before
      // formatting, otherwise formatUser(undefined) blows up with
      // "Cannot read properties of undefined (reading '_id')".
      // Guard against a null/undefined lastMessage (shouldn't normally
      // happen since $group only runs over existing messages, but
      // Message.populate() throws on null entries, so filter defensively).
      const messagesToPopulate = results.map((r) => r.lastMessage).filter(Boolean);
      if (messagesToPopulate.length > 0) {
        await Message.populate(messagesToPopulate, [
          { path: "sender" },
          { path: "receiver" },
          { path: "replyTo", populate: { path: "sender" } },
        ]);
      }

      // This fetches all chat partners in one query.-> hence partners contain all the partner jinsy chat hoi hoi
      // r._id -> is the chat partener id 
      const partners = await User.find({ _id: { $in: results.map((r) => r._id) } });
      // Create a quick lookup map
      // map stores the data as key value pair
      // key id the id of the partners and p is the partner object (the name , email etc)
      const partnerMap = new Map(partners.map((p) => [p._id.toString(), p]));

      // Return formatted conversations
      return results
        // filter->This removes any conversation where the partner user no longer exists.
        .filter((r) => partnerMap.has(r._id.toString()))
        .map((r) => ({
          // hence return the partner and the last msg and the unreadcount of msg
          partner: formatUser(partnerMap.get(r._id.toString())!),
          lastMessage: formatMessage(r.lastMessage),
          unreadCount: r.unreadCount,
        }));
    },


    // _get message history (the inbox)____________________________________________
    // This fetches the message history between the logged-in user and another user.
    messages: async (
      _: unknown,
      // LOAD ONLY  50 MSGS
      // This fetches the message history between the logged-in user and another user.
      // me._id (is the current user) and withuserid -> is the other partner
      { withUserId, limit = 50 }: { withUserId: string; limit?: number },
      ctx: AuthContext
    ) => {
      const me = requireAuth(ctx);// ensure user is logined
      const docs = await Message.find({
        $or: [//get the msgs in both direction
          { sender: me._id, receiver: withUserId },
          { sender: withUserId, receiver: me._id },
        ],
      })
      // sort the msg -> newest first
        .sort({ createdAt: -1 }) // in descenting order
        .limit(limit)// apply limit
        .populate("sender")//  the db only contain the ids so we populate the document  with the sender info
        .populate("receiver")
        .populate({ path: "replyTo", populate: { path: "sender" } });

      return docs.reverse().map(formatMessage);// reverse it so that 50 msg come first tehn 49 etc
      // hence the newest msg will come at the bottom and the oldest msg will come at the top
      // .reverse() changes them into chronological order.
    },
  },


  // _MUTATION____________________________________________________________

  Mutation: {

    // _SEND MESSAGE____________________________________________________
    // This creates and sends a new message.
    sendMessage: async (
      _: unknown,
      { receiverId, content, replyToId }: { receiverId: string; content: string; replyToId?: string },//frontned argument
      ctx: AuthContext
    ) => {
      const me = requireAuth(ctx);//Only logged-in users can send messages.
      if (!content.trim()) throw new Error("Message cannot be empty.");
      // if the message is empty


      // cant sent the message yourself so check
      if (receiverId === me._id.toString()) throw new Error("You can't message yourself.");

      const receiver = await User.findById(receiverId);//find the reciever 
      if (!receiver) throw new Error("Recipient not found.");// if not present in the db then throw erro

      // If replying, make sure the quoted message actually belongs to this
      // same conversation -- otherwise silently drop the quote rather than
      // let a client attach an arbitrary/unrelated message as a reply.
      let replyTo: string | undefined;
      if (replyToId) {
        const original = await Message.findById(replyToId);
        if (
          original &&
          ((original.sender.toString() === me._id.toString() &&
            original.receiver.toString() === receiverId) ||
            (original.receiver.toString() === me._id.toString() &&
              original.sender.toString() === receiverId))
        ) {
          replyTo = replyToId;
        }
      }

      const message = await Message.create({//creating the msg
        sender: me._id,
        receiver: receiverId,
        content: content.trim(),
        replyTo,
      });


      //populate the sender and reciever and get their info, plus the quoted
      // message (and its sender) if this is a reply
      const populated = await message.populate<{ sender: any; receiver: any; replyTo: any }>([
        "sender",
        "receiver",
        { path: "replyTo", populate: "sender" },
      ]);
      const formatted = formatMessage(populated);//format the msg

      pubsub.publish(EVENTS.MESSAGE_RECEIVED, { messageReceived: formatted });
      // publish the message to  the subscribetd user
      return formatted;// it return the message to the sender
    },

    // _MARK CONVERSATION READ____________________________________________________
    // This marks unread messages from one user as read.
    markConversationRead: async (
      _: unknown,
      { withUserId }: { withUserId: string },
      ctx: AuthContext
    ) => {
      const me = requireAuth(ctx);
      //Find every document matching the first object, then update all of them using the second object.
      const result = await Message.updateMany(
        //Mongoose returns an update result object. It can look like: acknowledege :true, matechedcount=2 nd modifiedcount=2
        // This updates only messages and read= true
        { sender: withUserId, receiver: me._id, read: false }, // find the messages that matches all three condition
        { $set: { read: true } }// set the read as true
      );

      // Only notify the sender if something actually just became "read" —
      // avoids firing an event every time a conversation is simply opened.
      if (result.modifiedCount > 0) { // if any msg is updated -> publish the event 
        // this checks whether any message actually changed.
        pubsub.publish(EVENTS.MESSAGES_READ, {// event -> read msg
          messagesRead: {//payload
            readerId: me._id.toString(),
            conversationWith: withUserId,
          },
        });
      }

      return true;
    },

    // _UNSEND MESSAGE____________________________________________________
    // Unsend (soft-delete) a message you sent — Instagram-style.
    unsendMessage: async (
      _: unknown,
      { messageId }: { messageId: string },
      ctx: AuthContext
    ) => {
      const me = requireAuth(ctx);

      //populate the sender and receivers
      const message = await Message.findById(messageId).populate<{ sender: any; receiver: any }>([
        "sender",
        "receiver",
      ]);
      if (!message) throw new Error("Message not found."); // no msg found

      // check if  the logined in user is the sender -> only then can unsend the message 
      if (message.sender._id.toString() !== me._id.toString()) {
        throw new Error("You can only unsend messages you sent.");
      }

      // Already unsent — return as-is instead of erroring, so double
      // clicks / race conditions don't surface an error to the user.
      if (message.deleted) { // check for the message is alreayd unsend 
        return formatMessage(message);
      }

      message.deleted = true; // message is marted as deleted
      message.content = ""; // wipe server-side so it's actually gone
      await message.save(); //save the message

      const formatted = formatMessage(message);// format the mesage
      pubsub.publish(EVENTS.MESSAGE_UNSENT, { messageUnsent: formatted });//publish the event 
      return formatted;
    },
  },


    // _SUBSCRIPTION____________________________________________________________
  Subscription: {

    // _MESSAGE RECEIVED____________________________________________________________
    // It decides who should receive each MESSAGE_RECEIVED event.
    messageReceived: {
      subscribe: withFilter(//his checks whether any message actually changed.


        // this create a listener for the message received event
        () => pubsub.asyncIterableIterator([EVENTS.MESSAGE_RECEIVED]),
        // this listens to the MESSAGE_RECEIVED event.
        (// this msg runs for the each msg
          // payload->the published data or in simple word the new message that was just send
          payload: { messageReceived: ReturnType<typeof formatMessage> } | undefined,// get the payload ->contain the message
          _args: unknown,
          context: { user: IUser | null } | undefined //is the currently logined user
        ) => {
          if (!payload) return false;// if no payload the return false
          if (!context) return false;// if no context then false

          // Ensures the subscriber is authenticated.
          const userId = context.user?._id?.toString(); //get the user id
          if (!userId) return false;// if no id then return false

          // This means a user receives a message event only if they are sender or receiver
          return (//now check that payload mein jo sender id that is equal to current user id or receiver id is equal to the current user id -> if any true then that user will receive the message
            payload.messageReceived.sender.id === userId ||
            payload.messageReceived.receiver.id === userId
          );
        }
      ),
    },


      // _MESSAGE READ____________________________________________________________
    messagesRead: {
      subscribe: withFilter(//This listens for read receipt events.
        () => pubsub.asyncIterableIterator([EVENTS.MESSAGES_READ]),// listener of the event
        (
          payload://payoad ->message read 
            | { messagesRead: { readerId: string; conversationWith: string } }
            | undefined,
          _args: unknown,
          context: { user: IUser | null } | undefined
        ) => {
          if (!payload) return false;
          if (!context) return false;

          const userId = context.user?._id?.toString();
          if (!userId) return false;


          // decide with event will recieve the message
          // Only the original sender (whose messages were just read) needs this.
          return payload.messagesRead.conversationWith === userId; 
        }
      ),
    },


      // _USERUPDATED____________________________________________________________

    // Fires whenever any user updates their profile (name/avatar). Broadcast
    // to every other connected client — mirrors the simplicity of the
    // messageReceived/messagesRead pattern above. The client only acts on
    // this if the updated user happens to be someone they're currently
    // looking at (sidebar row or open chat), so there's no correctness
    // issue with broadcasting more broadly than strictly necessary.
    userUpdated: {
      subscribe: withFilter(
        () => pubsub.asyncIterableIterator([EVENTS.USER_UPDATED]), // listen to the user updated
        (
          payload: { userUpdated: ReturnType<typeof formatUser> } | undefined,// payload
          _args: unknown,
          context: { user: IUser | null } | undefined
        ) => {
          if (!payload) return false;
          if (!context?.user) return false;// if no logined user then false 
          // This prevents the user who updated their own profile from receiving their own subscription event.
          // as they have received the updation from the mutation .. this is only for the other user 
          return payload.userUpdated.id !== context.user._id.toString();
          // if the user who updated its profile !== userid (continously listening to event)
          // it means all reaming user will received the profile update expect him
        }
      ),
    },


      // _MESSAGE UNSENT ____________________________________________________________
    // Fires whenever a message is unsent — delivered to both participants
    // (including the sender's other open tabs/devices), same pattern as
    // messageReceived.
    messageUnsent: {
      subscribe: withFilter(
        () => pubsub.asyncIterableIterator([EVENTS.MESSAGE_UNSENT]),
        (
          payload: { messageUnsent: ReturnType<typeof formatMessage> } | undefined,
          _args: unknown,
          context: { user: IUser | null } | undefined
        ) => {
          if (!payload) return false;
          if (!context) return false;

          const userId = context.user?._id?.toString();
          if (!userId) return false;

          return (
            payload.messageUnsent.sender.id === userId ||
            payload.messageUnsent.receiver.id === userId
          );
        }
      ),
    },
  },
};