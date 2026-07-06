import mongoose, { Schema, Document, Model } from "mongoose";

export interface IMessage extends Document {
  sender: mongoose.Types.ObjectId;
  receiver: mongoose.Types.ObjectId;
  content: string;
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
      // Only required while the message hasn't been unsent — once
      // `deleted` is true we intentionally blank the content, and that
      // blank value must be allowed to save.
      required: function (this: IMessage) {
        return !this.deleted;
      },
      trim: true,
      maxlength: 5000,
    },
    read: { type: Boolean, default: false },
    deleted: { type: Boolean, default: false },
    // Optional reference to the message this one is replying to. Left
    // unset for normal messages — only populated when the client quotes
    // an earlier message, WhatsApp-style.
    replyTo: { type: Schema.Types.ObjectId, ref: "Message", default: null },
  },
  { timestamps: true }
);

MessageSchema.index({ sender: 1, receiver: 1, createdAt: -1 });

const Message: Model<IMessage> = mongoose.model<IMessage>("Message", MessageSchema);
export default Message;