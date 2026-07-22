import { withFilter } from "graphql-subscriptions";
import Message from "../../models/Message";
import { MessageType } from "../../models/Message";
import User from "../../models/User";
import { AuthContext, requireAuth } from "../../middleware/authContext";
import { formatUser } from "./authResolvers";
import type { IUser } from "../../models/User";
import { pubsub, EVENTS } from "../pubsub";
import { isUserOnline } from "../../utils/onlineStatus";
import { getSignedMediaUrl, deleteMediaObject } from "../../utils/s3";
import { buildLocalVoiceUrl, deleteVoiceFileLocally } from "../../utils/voiceLocalStore";
import Resource ,{ResourceType, ResourceStatus} from "../../models/Resource";
import { findOrCreateConversation } from "../../utils/conversationHelpers";
import mongoose from "mongoose";
import Conversation from "../../models/Conversation";

export { pubsub };

//This formatMessage function takes a raw MongoDB message document and converts it into the clean message object your GraphQL API sends to the frontend
// Exported (was module-private before) so the REST voice-message route
// (routes/voiceMessage.ts) can format the message it creates/edits the
// exact same way this resolver file does everywhere else.
export async function formatMessage(msg: any) {
  // it received one message from the momgodb  and convert it into the format that your frontend expert
  // Once unsent, or if there's no media key, there's nothing to sign.
  let mediaUrl: string | null = null;
  const resource= msg.resource;
  // check msg hav the media keyu ? or can be text also and the msg is not deleted
  if (resource && !msg.deletedAt) {
    try {
      // Still uploading to S3 in the background (voice messages only)?
      // Stream it from our own temporary local route instead of signing
      // an S3 URL that doesn't have the object yet.
      mediaUrl = resource.status=== ResourceStatus.PENDING// if media pending 
        ? buildLocalVoiceUrl(resource.s3key)// make the local url to save it locally 
        : await getSignedMediaUrl(resource.s3key);//create a signed url
    } catch (err) {
      console.error("Failed to sign media URL:", err);
      mediaUrl = null;
    }
  }

  let replyTo = null;//This creates a variable for reply data.
  if (msg.replyTo) { // if the msg replies to another message  
    let replyMediaUrl: string | null = null;
    const replyResource= msg.replyTo.resource;// reply to media resource  
    // if  it is reply to media url and the msg whom we need to reply isnot deleted 
    if (replyResource && !msg.replyTo.deletedAt) { // if reply to media msg then 
      try {
        // This creates a separate signed URL variable for the message being replied to.
        // Same pending-check as above, in case the quoted message is
        // itself a voice message still mid-upload.
        replyMediaUrl = replyResource.status= ResourceStatus.PENDING
          ? buildLocalVoiceUrl(replyResource.s3key)
          : await getSignedMediaUrl(replyResource.s3key);
      } catch {
        replyMediaUrl = null;
      }
    }
    replyTo = {// you build the reply object that will be returned to the frontend.
      id: msg.replyTo._id.toString(),//msg if
      sender: formatUser(msg.replyTo.sender),//sendr
      content: msg.replyTo.deletedAt ? "" : msg.replyTo.content,
      type: msg.replyTo.type || MessageType.TEXT,
      mediaUrl: replyMediaUrl,
      deleted: !!msg.replyTo.deletedAt,
    };
  }

  // Reactions — a message that's been unsent shouldn't show any (nothing
  // left to react to), everything else renders whatever's on the doc.
  // msg.reactions entries are subdocuments with a populated `user`.
  const reactions = msg.deletedAt
    ? [] // if msg is deleted then no reaction 
    : (msg.reactions || [])//
        .filter((r: any) => r.user) // Remove reactions whose user no longer exists.
        .map((r: any) => ({//Convert each reaction into a simpler object.
          emoji: r.emoji,//store the emoji
          user: formatUser(r.user),// sort the user that reacted that emoji 
        }));

  return {
    id: msg._id.toString(),
    sender: formatUser(msg.sender),
    receiver: formatUser(msg.receiver),
    content: msg.deletedAt ? "" : msg.content,
    type: msg.type || MessageType.TEXT,
    mediaUrl,
    mediaDuration: resource?.voiceMetadata?.duration?? null,
    read: msg.isRead?? false,
    deleted: !!msg.deletedAt,
    edited: !!msg.isEdited,//!!->converts any value into a boolean (true or false).
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
      const user = await User.findOne({ email: email.toLowerCase(), deletedAt: null });
      // find the user and the account should not be deleted  
      return user ? formatUser(user) : null;// if user exist -> return user else return null
    },


    // __________coversation(sidebar)__________________________________________________
    // return us the  other participant , last message and the unread message count
    conversations: async (_: unknown, __: unknown, ctx: AuthContext) => {
      const currentUser = requireAuth(ctx);// authticate the user
      const currentUserId = currentUser._id.toString();// get the user id 

      const conversations = await Conversation.find({
        //get the all the conversations of currently logined user 
        participents: currentUserId,
      })
        .sort({ updatedAt: -1 })// we sort the conversation based on the updated at 
        .populate("participents")// populate the participants
        .populate({
          path: "lastMessage",
          populate: [
            { path: "sender" },
            { path: "receiver" },
            { path: "resource" },
            { path: "reactions.user" },
          ],
        });

      return Promise.all(// we process all the conversations together
        //conversations.map => take every conversation and  return a new object 
        //seperate object for each conversation 
        conversations.map(async (conversation) => {
          //we are apply Array destructuring => 
          // the firstparticipant = participants[0], and secondparticipant = participants[1]
          const [firstParticipant, secondParticipant] =
            conversation.participents as any[];

          const otherParticipant =// the chart partner
          // the oetherparticipant is the person whom the current user have the conversation with 
            firstParticipant._id.toString() === currentUserId
              ? secondParticipant
              : firstParticipant;

          return {
            id: conversation._id.toString(),
            otherParticipant: formatUser(otherParticipant),

            lastMessage: conversation.lastMessage
              ? await formatMessage(conversation.lastMessage)
              : null,

            unreadCount:
              conversation.unreadCounts?.get(currentUserId) ?? 0,
          };
        })
      );
    },


    // __________messages(inbox)__________________________________________________
    // messages: async (
    //   _: unknown,
    //   { withUserId, limit = 50 }: { withUserId: string; limit?: number },
    //   //  given the userid (of the partner)and the limit -> the default limit of the message history is 50
    //   ctx: AuthContext
    // ) => {
    //   const me = requireAuth(ctx);// check the authenticated user and get it
    //   const docs = await Message.find({// find the message in whic the user is either sender or receiver
    //     // of the convo  with the partener
    //     $or: [
    //       { sender: me._id, receiver: withUserId },
    //       { sender: withUserId, receiver: me._id },
    //     ],
    //   })
    //     .sort({ createdAt: -1 })// sort the message in the desending order
    //     // oldest comes first
    //     .limit(limit)// apply the limit to the messsages
    //     .populate("sender")// populate the sendeer and receiver and replyto
    //     .populate("receiver")
    //     .populate("resource")
    //     .populate({ path: "replyTo", populate: { path: "sender" } })
    //     .populate("reactions.user"); // who reacted with what
    //     // after this the things is that the message are in the order
    //     // oldest message first 
    //     // i.e zain ->10:40 and then zain->10:30

    //   const ordered = docs.reverse();//so we reverse it .. now the oldeest is the newest 
    //   // This formats every message before returning it.
    //   return Promise.all(ordered.map(formatMessage));// format all the messages 
    // },


    messages: async (
      _: unknown,
      { conversationId, limit = 50 }: { conversationId: string; limit?: number },
      ctx: AuthContext
    ) => {
      const me = requireAuth(ctx);

      // Authorization: make sure the caller is actually a participant of
      // this conversation before returning anything from it.
      const convo = await Conversation.findById(conversationId);
      if (
        !convo ||
        !convo.participents.map((p) => p.toString()).includes(me._id.toString())
      ) {
        throw new Error("Conversation not found.");
      }

      const docs = await Message.find({ conversation: conversationId })
        .sort({ createdAt: -1 }) // newest first — no reverse() anymore
        .limit(limit)
        .populate("sender")
        .populate("receiver")
        .populate("resource")
        .populate({ path: "replyTo", populate: { path: "sender" } })
        .populate("reactions.user");

      // Ordering is now the frontend's job — return as-is (newest first).
      return Promise.all(docs.map(formatMessage));
    },


    // __________userstatus__________________________________________________
    userStatus: async (_: unknown, { userId }: { userId: string }, ctx: AuthContext) => {
      requireAuth(ctx);// check that the user is authenticated  
      const user = await User.findById(userId).select("lastSeen deletedAt"); // we get the last scene and is deleted       // find the user by thhe id and get the last seen and is deleted
      return {
        userId,// return the user id 
        // if user is deleted then return false and if the user is not deleted the return check is user online
        isOnline: user?.deletedAt ? false : isUserOnline(userId),
        // get the user lastseen if not exist the  return null
        // ? -> optional 
        // ?. -> continue only if exist
        // ! -> I am sure this is not null or undefined
        // !! -> convert to true and false 
        // ?? -> if exist 
        lastSeen: user?.lastSeen ?? null,
        isDeleted: !!user?.deletedAt, 
      };
    },
  },


  // __________MUTATION__________________________________________________
  Mutation: {

    // __________send Message__________________________________________________
    //Take a message from the sender → validate it → store it 
    // → update the conversation → notify the receiver in real time.
    sendMessage: async (
      _: unknown,
      {
        receiverId,
        content,
        // NEW: type now uses the MessageType enum instead of a bare
        // "text" | "image" | "voice" string-literal union — see the
        // MessageType comment block in Message.ts for why. Defaulting to
        // MessageType.TEXT keeps the exact same runtime behavior as
        // before ("text" as the default).
        type = MessageType.TEXT,
        mediaKey,
        mediaDuration,
        replyToId,
      }: {
        receiverId: string;
        content?: string;
        type?: MessageType;
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
      if (type === MessageType.TEXT) {// cant be empty
        if (!content || !content.trim()) throw new Error("Message cannot be empty.");
      } else {// if  the type is voice or image (or, later, any other non-text type) then  if the mediakey is not presend then through the error
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
      if (receiver.deletedAt) throw new Error("This account no longer exists.");

      let replyTo: string | undefined;// replay to can be string or undefines
      // replytoid ->This searches the Message collection for the message being replied to.
      if (replyToId) {// if it exist
        const original = await Message.findById(replyToId); // find the user whom we need to replay
        if (
          original &&// if the  user exist and
          // and check that the msg belong to this conversation:
          //either => me -> receiver  or receiver -> me 
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


      //find or create the conversation btw the authenticated use and the receiver
      const conversation= await findOrCreateConversation(me._id.toString(), receiverId);
      // create a resource 
      let resourceId: mongoose.Types.ObjectId | undefined;
      if(type != MessageType.TEXT && mediaKey){// if media isnot text and  media key exist 
        //get the extenstion 
        // if cat.png => so we return .png 
        //*remember that the frontend send the media key to the backend 
        const ext =mediaKey.includes(".")?mediaKey.split(".").pop()!: "";
        // create the resource 
        const resource = await Resource.create({
          // get the name => 
          //i.e mediakey = whispr/images/123/cat.png
          //  we split at / and hence => return cat.png 
          name: mediaKey.split("/").pop() || mediaKey,
          s3key : mediaKey,
          // if type is image then resouce tyoe will be image else it will be voice 
          type : type===MessageType.IMAGE? ResourceType.IMAGE : ResourceType.VOICE,
          // get the mimetype 
          mimeType: ext? `application/${ext}`:"application/octet-stream",
          status : ResourceStatus.UPLOADED,
          uploadedBy: me._id,
          voiceMetadata:// get the voice meta data 
            type===MessageType.VOICE && mediaDuration!=null
              ? {duration : mediaDuration}
              : undefined,
        });
        resourceId= resource._id;
      }

      //creating the msg 
      const message = await Message.create({//creating the  message
        conversation : conversation._id,
        sender: me._id,
        receiver: receiverId,
        content: type === MessageType.TEXT ? content!.trim() : "",
        type,
        resource: resourceId,
        replyTo,
      });

      // find the conversation byb the conversation id 
      await Conversation.findByIdAndUpdate(conversation._id, {
        //set the last msg to the new msg
        $set: { lastMessage: message._id },
        //increment the receiver unread msg count by 1
        $inc: { [`unreadCounts.${receiverId}`]: 1 },
      });

      const populated = await message.populate<{ sender: any; receiver: any; resource:any ; replyTo: any; reactions: any }>([
        // populating the message
        "sender",
        "receiver",
        "resource",
        { path: "replyTo", populate: [{path: "sender"}, {path : "resource"}]},
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
        { sender: withUserId, receiver: me._id, isRead: false },
        { $set: { isRead: true } }// then set read true
      );

      if (result.modifiedCount > 0) {// if the count of message mark as read is greater then zero
        pubsub.publish(EVENTS.MESSAGES_READ, {// then  publish the event
          messagesRead: {
            readerId: me._id.toString(),
            conversationWith: withUserId,
          },
        });
      }

      // find the conversation 
      const convo = await Conversation.findOne({
        //having the particepents => the autheticated user and receiver
        participents: { $all: [me._id.toString(), withUserId], $size: 2 },
      });
      if (convo) {// if the convo exist
        // mark the unreadcount => as zero => as the conversation has been read 
        convo.unreadCounts.set(me._id.toString(), 0);
        await convo.save();// save the conversation  
      }

      return true;
    },


    //// __________startconversation__________________________________________________
    startConversation: async (
      _: unknown,
      { otherUserId }: { otherUserId: string },
      ctx: AuthContext
    ) => {
      const me = requireAuth(ctx);
      if (otherUserId === me._id.toString()) throw new Error("You can't message yourself.");
      const other = await User.findById(otherUserId);
      if (!other || other.deletedAt) throw new Error("This account no longer exists.");
      const convo = await findOrCreateConversation(me._id.toString(), otherUserId);
      return convo._id.toString();
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
      { messageId }: { messageId: string }, // send the msg that need to me deleted 
      ctx: AuthContext
    ) => {
      const me = requireAuth(ctx);// authticate the user
      //find the message by id 
      const message = await Message.findById(messageId).populate<{ sender: any; receiver: any; resource: any }>([
        "sender",
        "receiver",
        "resource",
      ]);
      // if msg dont exist then through errror 
      if (!message) throw new Error("Message not found.");

      //if the user is not the sender => cant delete the msg
      if (message.sender._id.toString() !== me._id.toString()) {
        throw new Error("You can only unsend messages you sent.");
      }
      // id msg is already deleted 
      if (message.deletedAt) {
        throw new Error("This message was already unsent.");
      }

      // Permanently remove the underlying media (S3 object + Resource doc)
      const resource: any = message.resource;// get the msg resource
      if (resource) {// if the resource exist
        try {
          if (resource.status === ResourceStatus.PENDING) {// is the sataus is pending 
            // delete the file locally 
            await deleteVoiceFileLocally(resource.s3key);
          } else {
            // else if the status is  uploaded => then delete the media 
            await deleteMediaObject(resource.s3key);
          }
          // and delete that resource
          await Resource.deleteOne({ _id: resource._id });
        } catch (err) {
          // error
          console.error("Failed to delete media:", err);
        }
      }

      // Soft-delete: the row stays in Mongo so it keeps its place as a
      // conversation's lastMessage and as the target of any replyTo
      // reference — content is scrubbed and isDeleted flips true so every
      // client renders the "unsent" placeholder from it. The resource ref
      // is cleared since the underlying media is now permanently gone.
      message.content = "";
      message.resource = undefined;
      message.reactions = [] as any;
      message.deletedAt = new Date();
      await message.save();

      const formatted = {//  format the msg
        id: message._id.toString(),
        sender: formatUser(message.sender),
        receiver: formatUser(message.receiver),
        content: "",
        type: message.type || MessageType.TEXT,
        mediaUrl: null,
        mediaDuration: null,
        read: message.isRead ?? false,
        deleted: true,
        edited: false,
        createdAt: message.createdAt,
        replyTo: null,
        reactions: [],
      };

      // Adjust the receiver's unread badge if this message hadn't been read
      const convo = await Conversation.findById(message.conversation);// find the conversation
      if (convo && !message.isRead) {// is the convo exist and msg is not read 
        const key = message.receiver._id.toString();// get the recever id 
        const current = convo.unreadCounts.get(key) ?? 0;// get the currunread msg count
        //if curr count > 0 => set the receiver msg as current -1 
        if (current > 0) convo.unreadCounts.set(key, current - 1);
        await convo.save();
      }

      pubsub.publish(EVENTS.MESSAGE_UNSENT, { messageUnsent: formatted });
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
      if (message.deletedAt) throw new Error("Can't edit a message that was unsent.");
      if (message.type !== MessageType.TEXT) throw new Error("Only text messages can be edited.");

      message.content = content.trim();
      message.isEdited = true;
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
      const me = requireAuth(ctx);// check weather the user is login 
      const myId = me._id.toString(); // get the if of the logined use 

      if (!emoji || !emoji.trim()) throw new Error("An emoji is required to react.");

      const message = await Message.findById(messageId);
      if (!message) throw new Error("Message not found.");
      if (message.deletedAt) throw new Error("Can't react to a message that was unsent.");

      // Only the two people in this conversation can react to it.
      if (// login = nisha  => myid =nisha 
        // chat is of  faiqa -> zainab => hence nisha cant react
        // only the sender and receiver ara allowed to react
        // faiqa !=nisha and zainab != nisha => true and true=> through error cant react
        // if myid=faiqa 
        // then faiqa=== faiqa => false and overall false => so can reac to the message  
        message.sender.toString() !== myId &&
        message.receiver.toString() !== myId
      ) {
        throw new Error("You can't react to this message.");
      }

      const existingIndex = message.reactions.findIndex(//Searches for the current user's reaction.
        // that has the user already reacted ? if yes then find that 
        (r) => r.user.toString() === myId//Compares each reaction's user ID with the logged-in user's ID.
        //Stores the index of the user's reaction.
      );

      // if the user already reacted and he taped with  the same emoji => will get removed 
      if (existingIndex !== -1 && message.reactions[existingIndex].emoji === emoji) {
        //existingIndex !== -1  => if found one
        //Checks if the user already reacted with the same emoji.
        // Tapped the same emoji they already reacted with — remove it.
        message.reactions.splice(existingIndex, 1);//Removes that reaction.
      } else if (existingIndex !== -1) {//Checks if the user reacted before, but with a different emoji.
        // Reacted before with a different emoji — swap it over.
        //Changes the old emoji to the new one.
        message.reactions[existingIndex].emoji = emoji;
      } else {// First reaction from this user on this message.
        //Adds a new reaction.
        //Saves the user's ID.
        message.reactions.push({ user: me._id, emoji });
      }

      await message.save();

      const populated = await message.populate<{
        sender: any;
        receiver: any;
        resource :any;
        replyTo: any;
        reactions: any;
      }>(["sender", "receiver", { 
        path: "replyTo",
        populate: [{path:"sender"}, {path: "resource"}],
        
      }, "reactions.user"]);
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
          // faiqa has the convo with zainab 
          // faiqa reades reads the convo  of zainab=> zainab will show the blue ticks 
          // readerid=faiqa and conversationwith =zainab
          // userid = zainab then => conversationwith=userid (zainab =zainab)=> will see the blue ticks
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
          // The updated user is someone else. => as updated profile will be visible to other except me
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
            payload.messageUnsent.sender.id === userId ||// either the user is sender or receiver 
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
            payload.messageEdited.sender.id === userId || // either the user is sender or reciever 
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
            //  receiverid => that receiveres the string  
            | undefined,
          _args: unknown,
          context: { user: IUser | null } | undefined
        ) => {
          if (!payload || !context) return false;
          const userId = context.user?._id?.toString();
          if (!userId) return false;
          return payload.typingStatus.receiverId === userId; // show me the typining if i am reciver
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
          // is visbile to us excepet me 
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
            payload.messageReactionUpdated.sender.id === userId ||// if the user is either the sender or reciever 
            payload.messageReactionUpdated.receiver.id === userId
          );
        }
      ),
    },
  },
};
