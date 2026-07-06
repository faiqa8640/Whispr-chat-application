import { withFilter } from "graphql-subscriptions";
import Message from "../../models/Message.js";
import User from "../../models/User.js";
import { AuthContext, requireAuth } from "../../middleware/authContext.js";
import { formatUser } from "./authResolvers.js";
import type { IUser } from "../../models/User.js";
import { pubsub, EVENTS } from "../pubsub.js";

// Re-exported so anything that previously imported `pubsub` from this file
// (e.g. tests) keeps working — it's now just the shared instance.
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
  };
}

export const messageResolvers = {
  Query: {
    // This lets a logged-in user search for another user by email.
    // parent->unknown or unused, arg->email(by frontend), ctx->authenticated request context 
    findUserByEmail: async (_: unknown, { email }: { email: string }, ctx: AuthContext) => {
      requireAuth(ctx);//This prevents anonymous users from searching your user database.
      const user = await User.findOne({ email: email.toLowerCase() });
      return user ? formatUser(user) : null;
    },

    // this gets the chat history  on the side bar
    conversations: async (_: unknown, __: unknown, ctx: AuthContext) => {
      const me = requireAuth(ctx);
      const userId = me._id;
      // gets the currentky logined user

      // uses the aggregation pipeline-> coz complex
      // the result return the parter ids
      const results = await Message.aggregate([
        // Step 1: Find all messages involving the logged-in user
        // check every msg where the user is either sender or recevier
        { $match: { $or: [{ sender: userId }, { receiver: userId }] } },
        // Step 2:sort the newest msgs first -> -1 means desending order
        { $sort: { createdAt: -1 } },
        {
          $group: {
            // Step 3: Group messages by chat partner
            _id: { $cond: [{ $eq: ["$sender", userId] }, "$receiver", "$sender"] },
            // Latest message for each conversation
            lastMessage: { $first: "$$ROOT" },
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

      // This fetches all chat partners in one query.
      const partners = await User.find({ _id: { $in: results.map((r) => r._id) } });
      // Create a quick lookup map
      const partnerMap = new Map(partners.map((p) => [p._id.toString(), p]));

      // Return formatted conversations
      return results
        // This removes any conversation where the partner user no longer exists.
        .filter((r) => partnerMap.has(r._id.toString()))
        .map((r) => ({
          partner: formatUser(partnerMap.get(r._id.toString())!),
          lastMessage: formatMessage(r.lastMessage),
          unreadCount: r.unreadCount,
        }));
    },

    // This fetches the message history between the logged-in user and another user.
    messages: async (
      _: unknown,
      // LOAD ONLY  50 MSGS
      // This fetches the message history between the logged-in user and another user.
      { withUserId, limit = 50 }: { withUserId: string; limit?: number },
      ctx: AuthContext
    ) => {
      const me = requireAuth(ctx);// ensure user is logined
      const docs = await Message.find({
        $or: [//get the msgs
          { sender: me._id, receiver: withUserId },
          { sender: withUserId, receiver: me._id },
        ],
      })
      // sort the msg -> newest first
        .sort({ createdAt: -1 })
        .limit(limit)// apply limit
        .populate("sender")// populate the id with the converation
        .populate("receiver");

      return docs.reverse().map(formatMessage);// reverse it so that 50 msg come first tehn 49 etc
      // .reverse() changes them into chronological order.
    },
  },

  Mutation: {
    // This creates and sends a new message.
    sendMessage: async (
      _: unknown,
      { receiverId, content }: { receiverId: string; content: string },
      ctx: AuthContext
    ) => {
      const me = requireAuth(ctx);//Only logged-in users can send messages.
      if (!content.trim()) throw new Error("Message cannot be empty.");
      if (receiverId === me._id.toString()) throw new Error("You can't message yourself.");

      const receiver = await User.findById(receiverId);
      if (!receiver) throw new Error("Recipient not found.");

      const message = await Message.create({
        sender: me._id,
        receiver: receiverId,
        content: content.trim(),
      });

      const populated = await message.populate<{ sender: any; receiver: any }>(["sender", "receiver"]);
      const formatted = formatMessage(populated);

      pubsub.publish(EVENTS.MESSAGE_RECEIVED, { messageReceived: formatted });
      return formatted;
    },

    // This marks unread messages from one user as read.
    markConversationRead: async (
      _: unknown,
      { withUserId }: { withUserId: string },
      ctx: AuthContext
    ) => {
      const me = requireAuth(ctx);
      const result = await Message.updateMany(
        // This updates only messages and read= true
        { sender: withUserId, receiver: me._id, read: false },
        { $set: { read: true } }
      );

      // Only notify the sender if something actually just became "read" —
      // avoids firing an event every time a conversation is simply opened.
      if (result.modifiedCount > 0) {
        // this checks whether any message actually changed.
        pubsub.publish(EVENTS.MESSAGES_READ, {// event -> read msg
          messagesRead: {
            readerId: me._id.toString(),
            conversationWith: withUserId,
          },
        });
      }

      return true;
    },

    // Unsend (soft-delete) a message you sent — Instagram-style.
    unsendMessage: async (
      _: unknown,
      { messageId }: { messageId: string },
      ctx: AuthContext
    ) => {
      const me = requireAuth(ctx);

      const message = await Message.findById(messageId).populate<{ sender: any; receiver: any }>([
        "sender",
        "receiver",
      ]);
      if (!message) throw new Error("Message not found.");

      // Only the original sender can unsend their own message.
      if (message.sender._id.toString() !== me._id.toString()) {
        throw new Error("You can only unsend messages you sent.");
      }

      // Already unsent — return as-is instead of erroring, so double
      // clicks / race conditions don't surface an error to the user.
      if (message.deleted) {
        return formatMessage(message);
      }

      message.deleted = true;
      message.content = ""; // wipe server-side so it's actually gone
      await message.save();

      const formatted = formatMessage(message);
      pubsub.publish(EVENTS.MESSAGE_UNSENT, { messageUnsent: formatted });
      return formatted;
    },
  },

  Subscription: {
    messageReceived: {
      subscribe: withFilter(//his checks whether any message actually changed.
        () => pubsub.asyncIterableIterator([EVENTS.MESSAGE_RECEIVED]),
        // this listens to the MESSAGE_RECEIVED event.
        (//filter received the 
          payload: { messageReceived: ReturnType<typeof formatMessage> } | undefined,
          // published event data
          _args: unknown,
          context: { user: IUser | null } | undefined //current subscribed user's authentication context
        ) => {
          if (!payload) return false;
          if (!context) return false;

          // Ensures the subscriber is authenticated.
          const userId = context.user?._id?.toString();
          if (!userId) return false;

          // This means a user receives a message event only if they are sender or receiver
          return (
            payload.messageReceived.sender.id === userId ||
            payload.messageReceived.receiver.id === userId
          );
        }
      ),
    },

    messagesRead: {
      subscribe: withFilter(//This listens for read receipt events.
        () => pubsub.asyncIterableIterator([EVENTS.MESSAGES_READ]),
        (
          payload:
            | { messagesRead: { readerId: string; conversationWith: string } }
            | undefined,
          _args: unknown,
          context: { user: IUser | null } | undefined
        ) => {
          if (!payload) return false;
          if (!context) return false;

          const userId = context.user?._id?.toString();
          if (!userId) return false;

          // Only the original sender (whose messages were just read) needs this.
          return payload.messagesRead.conversationWith === userId;
        }
      ),
    },

    // Fires whenever any user updates their profile (name/avatar). Broadcast
    // to every other connected client — mirrors the simplicity of the
    // messageReceived/messagesRead pattern above. The client only acts on
    // this if the updated user happens to be someone they're currently
    // looking at (sidebar row or open chat), so there's no correctness
    // issue with broadcasting more broadly than strictly necessary.
    userUpdated: {
      subscribe: withFilter(
        () => pubsub.asyncIterableIterator([EVENTS.USER_UPDATED]),
        (
          payload: { userUpdated: ReturnType<typeof formatUser> } | undefined,
          _args: unknown,
          context: { user: IUser | null } | undefined
        ) => {
          if (!payload) return false;
          if (!context?.user) return false;
          // This prevents the user who updated their own profile from receiving their own subscription event.
          // as they have received the updation from the mutation .. this is only for the other user 
          return payload.userUpdated.id !== context.user._id.toString();
        }
      ),
    },

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