import mongoose, { Schema, Document, Model } from "mongoose";
//// schema => it is like a blue print 
// document => mongodb store the data as document 
// model => is used to perform the operations 


//----------------------------------
//INTERFACE -> FOR TYPESCRIPT UNDERSTANDING->WHICH PROPERTIES AND METHODS SHOULD THE USER HAVE?
//SCHEMA -> HOW A USER SHOULD BE STORED IN THE MONGODB 
// MODEL->IT IS THE  KIND OF WORKER THAT STORE THE USER IN THE MONGODB AND PERFORM THE OPERATIONS
// I.E DELETE, FIND, ADD ETC => CAN ONLY DO IT WITH THE USER 
// USIND MODEL THE CODE CAN ACTUALLY USE THE DB
//----------------------------------


// ── Enums ──────────────────────────
export enum MessageType {
  TEXT = "text",
  IMAGE = "image",
  VOICE = "voice",
}


//-----------------------------------
// INTERFACE->TYEPSCRIPT BLUEPRINT
// ----------------------------------
export interface IReaction {
  user: mongoose.Types.ObjectId; // the user id
  emoji: string;
}

export interface IMessage extends Document {
  conversation: mongoose.Types.ObjectId;// conversation id for the conversations 
  sender: mongoose.Types.ObjectId;
  receiver: mongoose.Types.ObjectId;
  content: string;
  type: MessageType;
  resource?:mongoose.Types.ObjectId;// resource id for the resources 
  isRead: boolean;
  isDeleted: boolean;
  deletedAt?: Date;
  isEdited: boolean;
  replyTo?: mongoose.Types.ObjectId;
  reactions: IReaction[];//we are using the array coz one message could have multiples reactions
  createdAt: Date;
  updatedAt: Date;
}


//--------------------------------
// SCHEMAS-> MONGODB BLUEPRINT 
//--------------------------------

// REACTION SCHEMA 
// -------------------
//const ReactionSchema = new Schema<IReaction>  means 
// create a mongodb schema using the shap defined in the IReaction 
const ReactionSchema = new Schema<IReaction>(
  {
    //type: Schema.Types.ObjectId => means store another document id here 
    // objectid => each document have the _id so we store it here 
    // ref: "User" => this tells that the object id points to the user model
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    emoji: { type: String, required: true },
  },
  { _id: false }
);


// MESSAGE  SCHEMA 
// -------------------
// Create a new MongoDB schema that follows the IMessage interface.

const MessageSchema = new Schema<IMessage>(
  {
    conversation: { type:Schema.Types.ObjectId, ref: "Conversation", required:true , index:true},
    sender: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // index => make a shortcut for this feild => now the things is that the search become easier
    receiver: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    content: {// store the text messages 
      type: String,
      // the message should or should not have a content depens on the message 
      //like if text msg => content required  but if the msg is voice or image or is deleted -> then no content requried
      required: function (this: IMessage) {
        return !this.isDeleted && this.type === MessageType.TEXT;
      },
      trim: true, //remove spaces
      maxlength: 5000, //means max character of the message 
      default: "",
    },
    // enum: Object.values(MessageType) reads straight off the enum above —
    // add a new MessageType member later and it's automatically a valid
    // value here too, no separate array to keep in sync.
    type: { type: String, enum: Object.values(MessageType), default: MessageType.TEXT },
    resource : {type: Schema.Types.ObjectId, ref: "Resource", default : null },
    isRead: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    deletedAt : {type: Date , default: null},
    isEdited: { type: Boolean, default: false },
    replyTo: { type: Schema.Types.ObjectId, ref: "Message", default: null },
    reactions: { type: [ReactionSchema], default: [] },// an  array of reaction schema
  },
  { timestamps: true }
);

//using the index => to make the search fast 
//An index is a shortcut that helps MongoDB find data quickly
// we are using the compound index here
// sender : 1=> in acending order 
// receiver :1 => in ascending order 
// created at descending  order
MessageSchema.index({ sender: 1, receiver: 1, createdAt: -1 });


//creating the model  => for the messages 

const Message: Model<IMessage> = 
  mongoose.models.Message ||
  mongoose.model<IMessage>("Message", MessageSchema);
export default Message;




