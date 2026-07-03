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
    content: msg.content,
    read: msg.read,
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

    // this gets the chat history 
    conversations: async (_: unknown, __: unknown, ctx: AuthContext) => {
      const me = requireAuth(ctx);
      const userId = me._id;
      // gets the currentky logined user

      // uses the aggregation pipeline-> coz complex
      const results = await Message.aggregate([
        // check every msg where the user is either sender or recevier
        { $match: { $or: [{ sender: userId }, { receiver: userId }] } },
        // sort the newest msgs first -> -1 means desending order
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: { $cond: [{ $eq: ["$sender", userId] }, "$receiver", "$sender"] },
            lastMessage: { $first: "$$ROOT" },
            unreadCount: {
              $sum: {
                $cond: [
                  { $and: [{ $eq: ["$receiver", userId] }, { $eq: ["$read", false] }] },
                  1,
                  0,
                ],
              },
            },
          },
        },
        { $sort: { "lastMessage.createdAt": -1 } },
      ]);

      const partners = await User.find({ _id: { $in: results.map((r) => r._id) } });
      const partnerMap = new Map(partners.map((p) => [p._id.toString(), p]));

      return results
        .filter((r) => partnerMap.has(r._id.toString()))
        .map((r) => ({
          partner: formatUser(partnerMap.get(r._id.toString())!),
          lastMessage: formatMessage(r.lastMessage),
          unreadCount: r.unreadCount,
        }));
    },

    messages: async (
      _: unknown,
      { withUserId, limit = 50 }: { withUserId: string; limit?: number },
      ctx: AuthContext
    ) => {
      const me = requireAuth(ctx);
      const docs = await Message.find({
        $or: [
          { sender: me._id, receiver: withUserId },
          { sender: withUserId, receiver: me._id },
        ],
      })
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate("sender")
        .populate("receiver");

      return docs.reverse().map(formatMessage);
    },
  },

  Mutation: {
    sendMessage: async (
      _: unknown,
      { receiverId, content }: { receiverId: string; content: string },
      ctx: AuthContext
    ) => {
      const me = requireAuth(ctx);
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

    markConversationRead: async (
      _: unknown,
      { withUserId }: { withUserId: string },
      ctx: AuthContext
    ) => {
      const me = requireAuth(ctx);
      const result = await Message.updateMany(
        { sender: withUserId, receiver: me._id, read: false },
        { $set: { read: true } }
      );

      // Only notify the sender if something actually just became "read" —
      // avoids firing an event every time a conversation is simply opened.
      if (result.modifiedCount > 0) {
        pubsub.publish(EVENTS.MESSAGES_READ, {
          messagesRead: {
            readerId: me._id.toString(),
            conversationWith: withUserId,
          },
        });
      }

      return true;
    },
  },

  Subscription: {
    messageReceived: {
      subscribe: withFilter(
        () => pubsub.asyncIterableIterator([EVENTS.MESSAGE_RECEIVED]),
        (
          payload: { messageReceived: ReturnType<typeof formatMessage> } | undefined,
          _args: unknown,
          context: { user: IUser | null } | undefined
        ) => {
          if (!payload) return false;
          if (!context) return false;

          const userId = context.user?._id?.toString();
          if (!userId) return false;

          return (
            payload.messageReceived.sender.id === userId ||
            payload.messageReceived.receiver.id === userId
          );
        }
      ),
    },

    messagesRead: {
      subscribe: withFilter(
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
          // Skip echoing back to the user who made the change — their own
          // screen already updated from the mutation's return value.
          return payload.userUpdated.id !== context.user._id.toString();
        }
      ),
    },
  },
};
