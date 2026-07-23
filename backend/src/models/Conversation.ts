//// schema => it is like a blue print 
// document => mongodb store the data as document 
// model => is used to perform the operations 
import  mongoose , { Schema , Document,Model } from "mongoose";

//-----------------------------------
// INTERFACE->TYEPSCRIPT BLUEPRINT
// ----------------------------------

export interface IConversation extends Document {
    participants : mongoose.Types.ObjectId[];
    lastMessage?: mongoose.Types.ObjectId;
    unreadCounts: Map<string,number>;
    createdAt : Date;
    updatedAt : Date;
}


//--------------------------------
// SCHEMAS-> MONGODB BLUEPRINT 
//--------------------------------

const ConverstaionSchema = new Schema<IConversation>(
    {   //participents 
        participants:[
            {
                type: Schema.Types.ObjectId,
                ref : "User",
                required: true,
            },
        ],

        // lastMessage 
        lastMessage: {
            type: Schema.Types.ObjectId,
            ref: "Message",
            default: null,
        },

        //unreadmessagecount
        unreadCounts: {
            type: Map,
            of: Number,
            default: {},
        },  
    },
    {
        timestamps: true,
    }
);


//indexing on the participents and the updated as so that the search become easier
//participents in ascending and the conv=> in descending => newesat one first 
ConverstaionSchema.index({participants :1 , updatedAt: -1});

//model 
const Conversation : Model<IConversation>= 
// if the conversation model already exist use it otherwise built the model 
    mongoose.models.Conversation || 
    mongoose.model<IConversation>("Conversation", ConverstaionSchema);
export default Conversation ;





