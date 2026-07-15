import { withFilter } from "graphql-subscriptions";
import Message from "../../models/Message.js";
import User from "../../models/User.js";
import { AuthContext, requireAuth } from "../../middleware/authContext.js";
import { formatUser } from "./authResolvers.js";
import type { IUser } from "../../models/User.js";
import { pubsub, EVENTS } from "../pubsub.js";
import { isUserOnline } from "../../utils/onlineStatus.js";
import { getSignedMediaUrl, deleteMediaObject } from "../../utils/s3.js";
import { buildLocalVoiceUrl, deleteVoiceFileLocally } from "../../utils/voiceLocalStore.js";

export { pubsub };

//This formatMessage function takes a raw MongoDB message document and converts it into the clean message object your GraphQL API sends to the frontend
// Exported (was module-private before) so the REST voice-message route
// (routes/voiceMessage.ts) can format the message it creates/edits the
// exact same way this resolver file does everywhere else.
export async function formatMessage(msg: any) {
  // Once unsent, or if there's no media key, there's nothing to sign.
  let mediaUrl: string | null = null;
  // check msg have a file stored in s3 and the msg is not deleted
  if (msg.mediaKey && !msg.deleted) {
    try {
      // Still uploading to S3 in the background (voice messages only)?
      // Stream it from our own temporary local route instead of signing
      // an S3 URL that doesn't have the object yet.
      mediaUrl = msg.mediaPending
        ? buildLocalVoiceUrl(msg.mediaKey)
        : await getSignedMediaUrl(msg.mediaKey);//create a signed url
    } catch (err) {
      console.error("Failed to sign media URL:", err);
      mediaUrl = null;
    }
  }

  let replyTo = null;//This creates a variable for reply data.
  if (msg.replyTo) {
    let replyMediaUrl: string | null = null;
    if (msg.replyTo.mediaKey && !msg.replyTo.deleted) {
      try {
        // This creates a separate signed URL variable for the message being replied to.
        // Same pending-check as above, in case the quoted message is
        // itself a voice message still mid-upload.
        replyMediaUrl = msg.replyTo.mediaPending
          ? buildLocalVoiceUrl(msg.replyTo.mediaKey)
          : await getSignedMediaUrl(msg.replyTo.mediaKey);
      } catch {
        replyMediaUrl = null;
      }
    }
    replyTo = {// you build the reply object that will be returned to the frontend.
      id: msg.replyTo._id.toString(),
      sender: formatUser(msg.replyTo.sender),
      content: msg.replyTo.deleted ? "" : msg.replyTo.content,
      type: msg.replyTo.type || "text",
      mediaUrl: replyMediaUrl,
      deleted: !!msg.replyTo.deleted,
    };
  }

  // Reactions — a message that's been unsent shouldn't show any (nothing
  // left to react to), everything else renders whatever's on the doc.
  // msg.reactions entries are subdocuments with a populated `user`.
  const reactions = msg.deleted
    ? []
    : (msg.reactions || [])
        .filter((r: any) => r.user) // guard against a reactor whose user doc vanished
        .map((r: any) => ({
          emoji: r.emoji,
          user: formatUser(r.user),
        }));

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
    // NEW: WhatsApp/Instagram-style "(edited)" flag — true once
    // editMessage() has successfully changed this message's text.
    edited: !!msg.edited,
    createdAt: msg.createdAt,
    replyTo,
    reactions,
  };
}

export const messageResolvers = {
  // __________QUERY__________________________________________________
  Query: {
    // __________finduserbyemail__________________________________________________
    findUserByEmail: async (_: unknown, { email }: { email: string }, ctx: AuthContext) => {
      //  three parameters ->1) parent (_ -> exist but not used), email and then the context
      requireAuth(ctx);// it check that whether the user  is auenthicated or not
      const user = await User.findOne({ email: email.toLowerCase(), isDeleted: { $ne: true } });
      // find the user and the account should not be deleted  
      return user ? formatUser(user) : null;// if user exist -> return user else return null
    },

    // __________coversation(sidebar)__________________________________________________
    conversations: async (_: unknown, __: unknown, ctx: AuthContext) => {
      const me = requireAuth(ctx);// if the user is autheticated
      const userId = me._id;// get the user id only


      // apply the aggregate as  it is complex and  we cant use the simple fetch
      // the result contain 3  things
      //1) the id of person whom we have convo with
      // 2)the last message of there chat
      // 3)total unread messages
      const results = await Message.aggregate([
        // match that the user should either be the sender and the receiver
        { $match: { $or: [{ sender: userId }, { receiver: userId }] } },
        // sort the messesing in the descending order-> the  newest one at the top
        { $sort: { createdAt: -1 } },
        {
          $group: {
            //  if the userid = sender then return receiver else return sender 
            // means if faiqa(sender) == faiqa(userid) then we will return  zain (the receiver)
            // if zain (sender)!= faiqa (userid) then we will return the  zain(the sender)
            // in both case the  id of the person will be return with whom we convo 
            _id: { $cond: [{ $eq: ["$sender", userId] }, "$receiver", "$sender"] },
            // getting the last message -> the first message  is the newest message as above we sort them in the desending order 
            // so the last message will get the last message of the chat
            lastMessage: { $first: "$$ROOT" },
            unreadCount: {// counting the unread message
              $sum: {// we need to sum
                $cond: [// if receiver=userid and read is false -> it means that the user havent read the mesasge -> return the 1 and if read then return 0
                  // and then sum them up  so  let say 3 messge is unread then 1+1+1 = 3
                  { $and: [{ $eq: ["$receiver", userId] }, { $eq: ["$read", false] }] },
                  1,
                  0,
                ],
              },
            },
          },
        },
        { $sort: { "lastMessage.createdAt": -1 } }, //  now we sort the convo accoriding to the  having the newest last message
        // like if nisha send the message at 10 30 and zain send the message at 10 40 -> then zain chat (10:40) will be at the top 
      ]);

      // now we gonna populate the message 
      const messagesToPopulate = results.map((r) => r.lastMessage).filter(Boolean);
      // previously the result contain -> the  last message the id and the unread message count
      // so firstly we just extract the last message form
      // .filter(Boolean) removes empty values such as null, undefined, false, or an empty string
      if (messagesToPopulate.length > 0) {//this check that atleast there is one valid last message 
        await Message.populate(messagesToPopulate, [// if there is then we gonna populate the last mesasaage
          // populate ->“Take these message objects and replace their referenced IDs with the actual documents from MongoDB.”
          { path: "sender" },// so instead if the sender place the sender object
          { path: "receiver" },// similarly instead of the receiver replace the receiver id
          // This is a nested populate
          //first populate the reply to msg -> the older message and in that mmsg the sender is still the refernece id so we populate the refernce id then 
          { path: "replyTo", populate: { path: "sender" } },
          // populate whoever reacted so formatMessage can render their name/avatar
          { path: "reactions.user" },
        ]);
      }

      // partners -> are basically the person whom we have convo with 
      // so we find he user  in the result map where the  r._id -> is the chat partner id 
      // Find users whose _id is included in this list.(result)
      // so the partners will get all the  user with whom we have convo with
      // map basically stores the key value pairs 
      const partners = await User.find({ _id: { $in: results.map((r) => r._id) } });
      // whre we are creating the partners map so that 
      // You fetch all partner users in one database query, instead of calling User.findById() separately for every conversation.
      const partnerMap = new Map(partners.map((p) => [p._id.toString(), p]));

      //results contains grouped conversation data,
      // partnerMap contains the actual user document for each chat partner.
      // filtered removes any conversation whose partner user cannot be found.
      // basically this is userfull fo the delted user 
      // if a user account was deleted but old messages still exist in the Message collection. 
      // You do not want to return a broken conversation without a valid partner.

      const filtered = results.filter((r) => partnerMap.has(r._id.toString()));

      return Promise.all(
        filtered.map(async (r) => ({//For each conversation, it creates a new response object.
          partner: formatUser(partnerMap.get(r._id.toString())!),//get the partner 
          lastMessage: await formatMessage(r.lastMessage),//get the last mesage
          unreadCount: r.unreadCount,//get the unread message count
        }))
      );
    },

    // __________messages(inbox)__________________________________________________
    messages: async (
      _: unknown,
      { withUserId, limit = 50 }: { withUserId: string; limit?: number },
      //  given the userid (of the partner)and the limit -> the default limit of the message history is 50
      ctx: AuthContext
    ) => {
      const me = requireAuth(ctx);// check the authenticated user and get it
      const docs = await Message.find({// find the message in whic the user is either sender or receiver
        // of the convo  with the partener
        $or: [
          { sender: me._id, receiver: withUserId },
          { sender: withUserId, receiver: me._id },
        ],
      })
        .sort({ createdAt: -1 })// sort the message in the desending order
        // oldest comes first
        .limit(limit)// apply the limit to the messsages
        .populate("sender")// populate the sendeer and receiver and replyto
        .populate("receiver")
        .populate({ path: "replyTo", populate: { path: "sender" } })
        .populate("reactions.user"); // who reacted with what
        // after this the things is that the message are in the order
        // oldest message first 
        // i.e zain ->10:40 and then zain->10:30

      const ordered = docs.reverse();//so we reverse it .. now the oldeest is the newest 
      // This formats every message before returning it.
      return Promise.all(ordered.map(formatMessage));
    },


    // __________userstatus__________________________________________________
    userStatus: async (_: unknown, { userId }: { userId: string }, ctx: AuthContext) => {
      requireAuth(ctx);// check that the user is authenticated  
      const user = await User.findById(userId).select("lastSeen isDeleted");
      // find the user by thhe id and get the last seen and is deleted
      return {
        userId,// return the user id 
        // if user is deleted then return false and if the user is not deleted the return check is user online
        isOnline: user?.isDeleted ? false : isUserOnline(userId),
        // get the user lastseen if not exist the  return null
        // ? -> optional 
        // ?. -> continue only if exist
        // ! -> I am sure this is not null or undefined
        // !! -> convert to true and false 
        lastSeen: user?.lastSeen ?? null,
        isDeleted: !!user?.isDeleted, 
      };
    },
  },


  // __________MUTATION__________________________________________________
  Mutation: {

    // __________send Message__________________________________________________
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
        mediaKey?: string; // is the key if the type is the image or the voice 
        mediaDuration?: number;// and is only  if the type is the voice 
        replyToId?: string;
      },
      ctx: AuthContext
    ) => {
      const me = requireAuth(ctx); //check that the user is autheticated 

      // if receiver is me then i cant send message to myself so therefore throw and error
      if (receiverId === me._id.toString()) throw new Error("You can't message yourself."); 

      // if the type is text
      if (type === "text") {// cant be empty
        if (!content || !content.trim()) throw new Error("Message cannot be empty.");
      } else {// if  the type is voice or image then  if the mediakey is not presend then through the error
        if (!mediaKey) throw new Error("Media upload is required for this message type.");
      }
      // NOTE: voice messages now normally go through the dedicated
      // POST /api/voice-message REST route instead of this mutation (see
      // routes/voiceMessage.ts), since that flow needs to save locally,
      // publish immediately, then migrate to S3 in the background. This
      // mutation path is kept as-is for text/image and as a fallback.

      const receiver = await User.findById(receiverId);// find the receiver by id
      if (!receiver) throw new Error("Recipient not found.");// if not exist then error
      // if account is not delete then through the error
      if (receiver.isDeleted) throw new Error("This account no longer exists.");

      let replyTo: string | undefined;// replay to can be string or undefines
      // replytoid ->This searches the Message collection for the message being replied to.
      if (replyToId) {// if it exist
        const original = await Message.findById(replyToId); // find the user whom we need to replay
        if (
          original &&// if the  user exist and
          // The original message was sent by me to the receiver I am currently messaging.
          ((original.sender.toString() === me._id.toString() &&
            original.receiver.toString() === receiverId) ||
            // The original message may have been sent in the opposite direction: from the receiver to you.
            (original.receiver.toString() === me._id.toString() &&
              original.sender.toString() === receiverId))
        ) {
          // Only after all checks pass, the new message stores the reply reference:
          replyTo = replyToId;
        }
      }

      const message = await Message.create({//creating the  message
        sender: me._id,
        receiver: receiverId,
        content: type === "text" ? content!.trim() : "",
        type,
        mediaKey,
        mediaDuration,
        replyTo,
      });

      const populated = await message.populate<{ sender: any; receiver: any; replyTo: any; reactions: any }>([
        // populating the message
        "sender",
        "receiver",
        { path: "replyTo", populate: "sender" },
        "reactions.user", // empty on a fresh message, but keep the shape consistent
      ]);
      const formatted = await formatMessage(populated);//formatting the message 


      // publishing the message recived event
      pubsub.publish(EVENTS.MESSAGE_RECEIVED, { messageReceived: formatted });
      return formatted;
    },


    // __________markconvoread__________________________________________________
    markConversationRead: async (
      _: unknown,
      { withUserId }: { withUserId: string },
      ctx: AuthContext
    ) => {
      const me = requireAuth(ctx);//authenticated user
      const result = await Message.updateMany(//if the sender is the partner and i am receiver and read is false
        { sender: withUserId, receiver: me._id, read: false },
        { $set: { read: true } }// then set read true
      );

      if (result.modifiedCount > 0) {// if the count of message mark as read is greater then zero
        pubsub.publish(EVENTS.MESSAGES_READ, {// then  publish the event
          messagesRead: {
            readerId: me._id.toString(),
            conversationWith: withUserId,
          },
        });
      }

      return true;
    },

    // __________unsendmessage__________________________________________________
    /**
     * Unsend a message you sent — but unlike the old soft-delete version,
     * this now PERMANENTLY removes it:
     *  - If it's an image/voice message, the underlying S3 object is
     *    deleted first (best-effort — a failed S3 cleanup doesn't block
     *    the message itself from being removed, we just log it).
     *    UPDATE: a voice message that's still mid-migration (mediaPending)
     *    doesn't have an S3 object yet at all — its audio only exists on
     *    this server's local scratch disk, so we delete that local file
     *    instead. Anything not pending (images, or voice messages that
     *    already finished uploading) still goes through the S3 delete.
     *  - The Message document itself is then hard-deleted from Mongo,
     *    not just scrubbed + flagged. There's no restore feature in this
     *    app, so keeping a permanently-scrubbed row (or an orphaned file
     *    sitting in the bucket) forever serves no purpose.
     *  - We still publish MESSAGE_UNSENT with a deleted:true payload so
     *    the other participant's already-open chat flips the bubble to
     *    the "unsent" placeholder live, same as before. The difference is
     *    only visible on a fresh fetch afterwards: since the row is gone
     *    from the DB, it won't come back at all (no placeholder), and any
     *    reply that quoted it will just show without a quoted preview.
     */
    unsendMessage: async (
      _: unknown,
      { messageId }: { messageId: string },// message id is send 
      ctx: AuthContext
    ) => {
      const me = requireAuth(ctx);//check auth

      const message = await Message.findById(messageId).populate<{ sender: any; receiver: any }>([
        // the message is found and the sender and receiver are populated 
        "sender",
        "receiver",
      ]);
      if (!message) throw new Error("Message not found.");  // if not exist thenn error

      if (message.sender._id.toString() !== me._id.toString()) {
        // if you dont send that message it means you cant unsend them
        throw new Error("You can only unsend messages you sent.");
      }

      // Clean up the underlying file BEFORE touching the DB row — if this
      // were reversed and the DB delete succeeded but this failed, we'd
      // have no record left pointing at the orphaned file to clean it up
      // later.
      if (message.mediaKey) {
        try {
          if (message.mediaPending) {
            // Still mid-migration — the only copy of this audio is the
            // local scratch file, there's no S3 object to delete yet.
            await deleteVoiceFileLocally(message.mediaKey);
          } else {
            await deleteMediaObject(message.mediaKey);
          }
        } catch (err) {
          // Best-effort — even if cleanup fails, still proceed with
          // permanently removing the message itself below.
          console.error("Failed to delete media:", err);
        }
      }

      // Build the response BEFORE the doc is removed from Mongo — there's
      // nothing left to read from once deleteOne() below runs.
      const formatted = {
        id: message._id.toString(),
        sender: formatUser(message.sender),
        receiver: formatUser(message.receiver),
        content: "",
        type: message.type || "text",
        mediaUrl: null,
        mediaDuration: message.mediaDuration ?? null,
        read: message.read,
        deleted: true,
        // NEW: keep the shape consistent with formatMessage() — an
        // unsent message has nothing left to show an "(edited)" label
        // for, so this is always false here regardless of prior state.
        edited: false,
        createdAt: message.createdAt,
        replyTo: null,
        reactions: [], // nothing left to react to once it's unsent
      };

      // Permanently remove the message — hard delete, not soft delete.
      await message.deleteOne();

      pubsub.publish(EVENTS.MESSAGE_UNSENT, { messageUnsent: formatted });
      //publish the event
      return formatted;
    },

    // __________editmessage__________________________________________________
    /**
     * Edits the text content of a message the caller sent — WhatsApp/
     * Instagram-style. Rules:
     *  - Only the original sender can edit their own message.
     *  - Only text messages can be edited (images/voice notes have no
     *    caption in this app, so there's nothing to edit on those).
     *  - Can't edit a message that's already been unsent.
     *  - The new content can't be empty.
     * Marks `edited: true` so clients render the "(edited)" label next
     * to the timestamp, and reuses the same MESSAGE_EDITED event /
     * subscription that voice-message S3 migration already uses — that
     * subscription already delivers the full updated message to both
     * participants live, which is exactly what a text edit needs too.
     */
    editMessage: async (
      _: unknown,
      { messageId, content }: { messageId: string; content: string },
      ctx: AuthContext
    ) => {
      const me = requireAuth(ctx);

      if (!content || !content.trim()) throw new Error("Message cannot be empty.");

      const message = await Message.findById(messageId);
      if (!message) throw new Error("Message not found.");

      if (message.sender.toString() !== me._id.toString()) {
        throw new Error("You can only edit messages you sent.");
      }
      if (message.deleted) throw new Error("Can't edit a message that was unsent.");
      if (message.type !== "text") throw new Error("Only text messages can be edited.");

      message.content = content.trim();
      message.edited = true;
      await message.save();

      const populated = await message.populate<{
        sender: any;
        receiver: any;
        replyTo: any;
        reactions: any;
      }>(["sender", "receiver", { path: "replyTo", populate: "sender" }, "reactions.user"]);
      const formatted = await formatMessage(populated);

      // Same event/subscription voice-message migration uses — both
      // participants' open chats patch this message in place live.
      pubsub.publish(EVENTS.MESSAGE_EDITED, { messageEdited: formatted });

      return formatted;
    },

    // __________settyping__________________________________________________
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

    // __________togglereaction__________________________________________________
    /**
     * Add, change, or remove the caller's emoji reaction on a message —
     * WhatsApp/Instagram-style. Each user can only have ONE reaction on a
     * given message at a time:
     *  - No existing reaction from this user  -> add one with this emoji.
     *  - Existing reaction, SAME emoji tapped -> remove it (toggle off).
     *  - Existing reaction, DIFFERENT emoji   -> swap to the new emoji.
     * Only the two participants of the conversation (sender/receiver) can
     * react — same access rule as everything else in this conversation.
     * Publishes MESSAGE_REACTION_UPDATED so both participants' open chats
     * update the reaction pills live, same delivery pattern as
     * messageUnsent/messageEdited above.
     */
    toggleReaction: async (
      _: unknown,
      { messageId, emoji }: { messageId: string; emoji: string },
      ctx: AuthContext
    ) => {
      const me = requireAuth(ctx);
      const myId = me._id.toString();

      if (!emoji || !emoji.trim()) throw new Error("An emoji is required to react.");

      const message = await Message.findById(messageId);
      if (!message) throw new Error("Message not found.");
      if (message.deleted) throw new Error("Can't react to a message that was unsent.");

      // Only the two people in this conversation can react to it.
      if (
        message.sender.toString() !== myId &&
        message.receiver.toString() !== myId
      ) {
        throw new Error("You can't react to this message.");
      }

      const existingIndex = message.reactions.findIndex(
        (r) => r.user.toString() === myId
      );

      if (existingIndex !== -1 && message.reactions[existingIndex].emoji === emoji) {
        // Tapped the same emoji they already reacted with — remove it.
        message.reactions.splice(existingIndex, 1);
      } else if (existingIndex !== -1) {
        // Reacted before with a different emoji — swap it over.
        message.reactions[existingIndex].emoji = emoji;
      } else {
        // First reaction from this user on this message.
        message.reactions.push({ user: me._id, emoji });
      }

      await message.save();

      const populated = await message.populate<{
        sender: any;
        receiver: any;
        replyTo: any;
        reactions: any;
      }>(["sender", "receiver", { path: "replyTo", populate: "sender" }, "reactions.user"]);
      const formatted = await formatMessage(populated);

      pubsub.publish(EVENTS.MESSAGE_REACTION_UPDATED, {
        messageReactionUpdated: formatted,
      });

      return formatted;
    },
  },

  // __________SUBSCRIPION__________________________________________________
  Subscription: {
    // // __________MESSAGE RECIEVED__________________________________________________
    messageReceived: {
      subscribe: withFilter(// with filter  is used to filter the user who would receive the message
        // Listen continuously for events published under MESSAGE_RECEIVED.
        () => pubsub.asyncIterableIterator([EVENTS.MESSAGE_RECEIVED]),
        (
          payload: { messageReceived: any } | undefined,//This is the data that was published in the mutation
          _args: unknown,//These are subscription arguments sent by the frontend.
          // This is the context created for the WebSocket subscription connection.
          // it contains the authenticated user
          context: { user: IUser | null } | undefined
        ) => {
          if (!payload || !context) return false; // if payload and context is miising return false
          const userId = context.user?._id?.toString();// get the user id from the context
          if (!userId) return false;// if not exist then return false
          return (// return true if the subscriber is either sender or reciever of the message 
            payload.messageReceived.sender.id === userId ||
            payload.messageReceived.receiver.id === userId
          );
        }
      ),
    },

    // // __________MESSAGES READ__________________________________________________
    messagesRead: {
      subscribe: withFilter(
        () => pubsub.asyncIterableIterator([EVENTS.MESSAGES_READ]),// pulish read event
        (
          payload: { messagesRead: { readerId: string; conversationWith: string } } | undefined,
          _args: unknown,
          context: { user: IUser | null } | undefined
        ) => {
          if (!payload || !context) return false;
          const userId = context.user?._id?.toString();
          if (!userId) return false;
          return payload.messagesRead.conversationWith === userId;
          //let say convo with =zain and readid=faiqa
          // if zain=zain then  event is listen by him and he can notice blue tick as message is read
        }
      ),
    },

    // __________USER UPLOADED__________________________________________________
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

    // __________MESSAGE UNSENT__________________________________________________
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

    // __________MESSAGE EDITED (voice media migrated to S3, OR text edited)_______________
    // Emitted (1) when a voice message that was streaming from our local
    // scratch file finishes its background S3 upload, and (2) whenever a
    // text message's content is edited — lets clients patch the message
    // in place live, same filter pattern as messageUnsent above
    // (delivered to both participants).
    messageEdited: {
      subscribe: withFilter(
        () => pubsub.asyncIterableIterator([EVENTS.MESSAGE_EDITED]),
        (
          payload: { messageEdited: any } | undefined,
          _args: unknown,
          context: { user: IUser | null } | undefined
        ) => {
          if (!payload || !context) return false;
          const userId = context.user?._id?.toString();
          if (!userId) return false;
          return (
            payload.messageEdited.sender.id === userId ||
            payload.messageEdited.receiver.id === userId
          );
        }
      ),
    },


    // __________TYPING STATUS__________________________________________________
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

    // __________USER STATUS CHANGES__________________________________________________
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

    // __________MESSAGE REACTION UPDATED__________________________________________________
    // Delivered to both participants (same pattern as messageUnsent /
    // messageEdited) so reaction pills stay in sync live on both ends,
    // regardless of who added/changed/removed the reaction.
    messageReactionUpdated: {
      subscribe: withFilter(
        () => pubsub.asyncIterableIterator([EVENTS.MESSAGE_REACTION_UPDATED]),
        (
          payload: { messageReactionUpdated: any } | undefined,
          _args: unknown,
          context: { user: IUser | null } | undefined
        ) => {
          if (!payload || !context) return false;
          const userId = context.user?._id?.toString();
          if (!userId) return false;
          return (
            payload.messageReactionUpdated.sender.id === userId ||
            payload.messageReactionUpdated.receiver.id === userId
          );
        }
      ),
    },
  },
};