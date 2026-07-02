import { PubSub, withFilter } from "graphql-subscriptions";
import Message from "../../models/Message.js";
import User from "../../models/User.js";
import { AuthContext, requireAuth } from "../../middleware/authContext.js";
import { formatUser } from "./authResolvers.js";
import type { IUser } from "../../models/User.js";

export const pubsub = new PubSub();
const MESSAGE_RECEIVED = "MESSAGE_RECEIVED";

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
    findUserByEmail: async (_: unknown, { email }: { email: string }, ctx: AuthContext) => {
      requireAuth(ctx);
      const user = await User.findOne({ email: email.toLowerCase() });
      return user ? formatUser(user) : null;
    },

    conversations: async (_: unknown, __: unknown, ctx: AuthContext) => {
      const me = requireAuth(ctx);
      const userId = me._id;

      const results = await Message.aggregate([
        { $match: { $or: [{ sender: userId }, { receiver: userId }] } },
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

      pubsub.publish(MESSAGE_RECEIVED, { messageReceived: formatted });
      return formatted;
    },

    markConversationRead: async (
      _: unknown,
      { withUserId }: { withUserId: string },
      ctx: AuthContext
    ) => {
      const me = requireAuth(ctx);
      await Message.updateMany(
        { sender: withUserId, receiver: me._id, read: false },
        { $set: { read: true } }
      );
      return true;
    },
  },

  Subscription: {
    messageReceived: {
      subscribe: withFilter(
        () => pubsub.asyncIterableIterator([MESSAGE_RECEIVED]),
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
  },
};