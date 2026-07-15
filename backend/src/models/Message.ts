import mongoose, { Schema, Document, Model } from "mongoose";

// A single emoji reaction from a single user on a message — WhatsApp/
// Instagram-style: one reaction per user per message. Tapping the same
// emoji again removes it, tapping a different emoji swaps it.
export interface IReaction {
  user: mongoose.Types.ObjectId;
  emoji: string;
}

export interface IMessage extends Document {
  sender: mongoose.Types.ObjectId;
  receiver: mongoose.Types.ObjectId;
  content: string;
  type: "text" | "image" | "voice";
  mediaKey?: string;
  mediaDuration?: number; // seconds, voice notes only
  // True while a voice message's audio is only sitting on this server's
  // local disk, waiting on its background upload to S3. formatMessage()
  // uses this to decide whether mediaUrl should point at our own
  // temporary streaming route or a real S3 signed URL.
  mediaPending?: boolean;// untill the media dont gdt uploaded on the s3 it says true if it get uploaded its turn false
  // like if the media (voice) is on the local storage it is false but if  it upload on the s3 it shows upload
  read: boolean;
  deleted: boolean;
  // NEW: true once the sender has edited this message's text after
  // sending — WhatsApp/Instagram-style. Only ever set on text messages
  // (images/voice notes have no caption to edit in this app).
  edited: boolean;
  replyTo?: mongoose.Types.ObjectId;
  // Emoji reactions attached to this message — see IReaction above.
  reactions: IReaction[];
  createdAt: Date;
  updatedAt: Date;
}

// Subdocument schema for a single reaction. _id: false because we don't
// need to reference individual reactions directly — we look them up by
// user id when toggling.
const ReactionSchema = new Schema<IReaction>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    emoji: { type: String, required: true },
  },
  { _id: false }
);

const MessageSchema = new Schema<IMessage>(
  {
    sender: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    receiver: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    content: {
      type: String,
      // Only required for text messages that haven't been unsent.
      required: function (this: IMessage) {
        return !this.deleted && this.type === "text";
      },
      trim: true,
      maxlength: 5000,
      default: "",
    },
    type: { type: String, enum: ["text", "image", "voice"], default: "text" },
    mediaKey: { type: String },
    mediaDuration: { type: Number },
    mediaPending: { type: Boolean, default: false },
    read: { type: Boolean, default: false },
    deleted: { type: Boolean, default: false },
    // NEW: WhatsApp/Instagram-style "edited" flag — flipped true the
    // first time editMessage() successfully changes this message's text.
    edited: { type: Boolean, default: false },
    replyTo: { type: Schema.Types.ObjectId, ref: "Message", default: null },
    reactions: { type: [ReactionSchema], default: [] },
  },
  { timestamps: true }
);

MessageSchema.index({ sender: 1, receiver: 1, createdAt: -1 });

const Message: Model<IMessage> = mongoose.model<IMessage>("Message", MessageSchema);
export default Message;