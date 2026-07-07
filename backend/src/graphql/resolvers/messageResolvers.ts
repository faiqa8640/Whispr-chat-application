import { withFilter } from "graphql-subscriptions";
import Message from "../../models/Message.js";
import User from "../../models/User.js";
import { AuthContext, requireAuth } from "../../middleware/authContext.js";
import { formatUser } from "./authResolvers.js";
import type { IUser } from "../../models/User.js";
import { pubsub, EVENTS } from "../pubsub.js";
import { isUserOnline } from "../../utils/onlineStatus.js";
import { getSignedMediaUrl } from "../../utils/s3.js";

export { pubsub };

async function formatMessage(msg: any) {
  // Once unsent, or if there's no media key, there's nothing to sign.
  let mediaUrl: string | null = null;
  if (msg.mediaKey && !msg.deleted) {
    try {
      mediaUrl = await getSignedMediaUrl(msg.mediaKey);
    } catch (err) {
      console.error("Failed to sign media URL:", err);
      mediaUrl = null;
    }
  }

  let replyTo = null;
  if (msg.replyTo) {
    let replyMediaUrl: string | null = null;
    if (msg.replyTo.mediaKey && !msg.replyTo.deleted) {
      try {
        replyMediaUrl = await getSignedMediaUrl(msg.replyTo.mediaKey);
      } catch {
        replyMediaUrl = null;
      }
    }
    replyTo = {
      id: msg.replyTo._id.toString(),
      sender: formatUser(msg.replyTo.sender),
      content: msg.replyTo.deleted ? "" : msg.replyTo.content,
      type: msg.replyTo.type || "text",
      mediaUrl: replyMediaUrl,
      deleted: !!msg.replyTo.deleted,
    };
  }

  return {
    id: msg._id.toString(),
    sender: formatUser(msg.sender),
    receiver: formatUser(msg.receiver),
    content: msg.deleted ? "" : msg.content,
    type: msg.type || "text",
    mediaUrl,
    mediaDuration: msg.mediaDuration ?? null,
    read: msg.read,
    deleted: !!msg.deleted,
    createdAt: msg.createdAt,
    replyTo,
  };
}

export const messageResolvers = {
  Query: {
    findUserByEmail: async (_: unknown, { email }: { email: string }, ctx: AuthContext) => {
      requireAuth(ctx);
      const user = await User.findOne({ email: email.toLowerCase(), isDeleted: { $ne: true } });
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

      const messagesToPopulate = results.map((r) => r.lastMessage).filter(Boolean);
      if (messagesToPopulate.length > 0) {
        await Message.populate(messagesToPopulate, [
          { path: "sender" },
          { path: "receiver" },
          { path: "replyTo", populate: { path: "sender" } },
        ]);
      }

      const partners = await User.find({ _id: { $in: results.map((r) => r._id) } });
      const partnerMap = new Map(partners.map((p) => [p._id.toString(), p]));

      const filtered = results.filter((r) => partnerMap.has(r._id.toString()));

      return Promise.all(
        filtered.map(async (r) => ({
          partner: formatUser(partnerMap.get(r._id.toString())!),
          lastMessage: await formatMessage(r.lastMessage),
          unreadCount: r.unreadCount,
        }))
      );
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
        .populate("receiver")
        .populate({ path: "replyTo", populate: { path: "sender" } });

      const ordered = docs.reverse();
      return Promise.all(ordered.map(formatMessage));
    },

    userStatus: async (_: unknown, { userId }: { userId: string }, ctx: AuthContext) => {
      requireAuth(ctx);
      const user = await User.findById(userId).select("lastSeen isDeleted");
      return {
        userId,
        isOnline: user?.isDeleted ? false : isUserOnline(userId),
        lastSeen: user?.lastSeen ?? null,
        isDeleted: !!user?.isDeleted,
      };
    },
  },

  Mutation: {
    sendMessage: async (
      _: unknown,
      {
        receiverId,
        content,
        type = "text",
        mediaKey,
        mediaDuration,
        replyToId,
      }: {
        receiverId: string;
        content?: string;
        type?: "text" | "image" | "voice";
        mediaKey?: string;
        mediaDuration?: number;
        replyToId?: string;
      },
      ctx: AuthContext
    ) => {
      const me = requireAuth(ctx);

      if (receiverId === me._id.toString()) throw new Error("You can't message yourself.");

      if (type === "text") {
        if (!content || !content.trim()) throw new Error("Message cannot be empty.");
      } else {
        if (!mediaKey) throw new Error("Media upload is required for this message type.");
      }

      const receiver = await User.findById(receiverId);
      if (!receiver) throw new Error("Recipient not found.");
      if (receiver.isDeleted) throw new Error("This account no longer exists.");

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

      const message = await Message.create({
        sender: me._id,
        receiver: receiverId,
        content: type === "text" ? content!.trim() : "",
        type,
        mediaKey,
        mediaDuration,
        replyTo,
      });

      const populated = await message.populate<{ sender: any; receiver: any; replyTo: any }>([
        "sender",
        "receiver",
        { path: "replyTo", populate: "sender" },
      ]);
      const formatted = await formatMessage(populated);

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

      if (message.sender._id.toString() !== me._id.toString()) {
        throw new Error("You can only unsend messages you sent.");
      }

      if (message.deleted) {
        return formatMessage(message);
      }

      message.deleted = true;
      message.content = "";
      // Wipe the media reference too — formatMessage() already blanks the
      // URL for deleted messages, but this keeps the DB doc clean as well.
      message.mediaKey = undefined;
      await message.save();

      const formatted = await formatMessage(message);
      pubsub.publish(EVENTS.MESSAGE_UNSENT, { messageUnsent: formatted });
      return formatted;
    },

    setTyping: async (
      _: unknown,
      { receiverId, isTyping }: { receiverId: string; isTyping: boolean },
      ctx: AuthContext
    ) => {
      const me = requireAuth(ctx);
      pubsub.publish(EVENTS.TYPING, {
        typingStatus: { userId: me._id.toString(), receiverId, isTyping },
      });
      return true;
    },
  },

  Subscription: {
    messageReceived: {
      subscribe: withFilter(
        () => pubsub.asyncIterableIterator([EVENTS.MESSAGE_RECEIVED]),
        (
          payload: { messageReceived: any } | undefined,
          _args: unknown,
          context: { user: IUser | null } | undefined
        ) => {
          if (!payload || !context) return false;
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
          payload: { messagesRead: { readerId: string; conversationWith: string } } | undefined,
          _args: unknown,
          context: { user: IUser | null } | undefined
        ) => {
          if (!payload || !context) return false;
          const userId = context.user?._id?.toString();
          if (!userId) return false;
          return payload.messagesRead.conversationWith === userId;
        }
      ),
    },

    userUpdated: {
      subscribe: withFilter(
        () => pubsub.asyncIterableIterator([EVENTS.USER_UPDATED]),
        (
          payload: { userUpdated: ReturnType<typeof formatUser> } | undefined,
          _args: unknown,
          context: { user: IUser | null } | undefined
        ) => {
          if (!payload || !context?.user) return false;
          return payload.userUpdated.id !== context.user._id.toString();
        }
      ),
    },

    messageUnsent: {
      subscribe: withFilter(
        () => pubsub.asyncIterableIterator([EVENTS.MESSAGE_UNSENT]),
        (
          payload: { messageUnsent: any } | undefined,
          _args: unknown,
          context: { user: IUser | null } | undefined
        ) => {
          if (!payload || !context) return false;
          const userId = context.user?._id?.toString();
          if (!userId) return false;
          return (
            payload.messageUnsent.sender.id === userId ||
            payload.messageUnsent.receiver.id === userId
          );
        }
      ),
    },

    typingStatus: {
      subscribe: withFilter(
        () => pubsub.asyncIterableIterator([EVENTS.TYPING]),
        (
          payload:
            | { typingStatus: { userId: string; receiverId: string; isTyping: boolean } }
            | undefined,
          _args: unknown,
          context: { user: IUser | null } | undefined
        ) => {
          if (!payload || !context) return false;
          const userId = context.user?._id?.toString();
          if (!userId) return false;
          return payload.typingStatus.receiverId === userId;
        }
      ),
    },

    userStatusChanged: {
      subscribe: withFilter(
        () => pubsub.asyncIterableIterator([EVENTS.USER_STATUS_CHANGED]),
        (
          payload:
            | { userStatusChanged: { userId: string; isOnline: boolean; lastSeen: string | null } }
            | undefined,
          _args: unknown,
          context: { user: IUser | null } | undefined
        ) => {
          if (!payload || !context?.user) return false;
          return payload.userStatusChanged.userId !== context.user._id.toString();
        }
      ),
    },
  },
};