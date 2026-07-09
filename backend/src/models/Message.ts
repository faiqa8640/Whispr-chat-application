import mongoose, { Schema, Document, Model } from "mongoose";

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
  mediaPending?: boolean;
  read: boolean;
  deleted: boolean;
  replyTo?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

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
    replyTo: { type: Schema.Types.ObjectId, ref: "Message", default: null },
  },
  { timestamps: true }
);

MessageSchema.index({ sender: 1, receiver: 1, createdAt: -1 });

const Message: Model<IMessage> = mongoose.model<IMessage>("Message", MessageSchema);
export default Message;
