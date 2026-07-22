//// schema => it is like a blue print 
// document => mongodb store the data as document 
// model => is used to perform the operations 
import mongoose , { Model , Document,Schema } from "mongoose";
import Conversation, { IConversation } from "./Conversation";

//-----------------------------------
// ENUMS
// ----------------------------------

//resource type
export enum ResourceType{
    IMAGE = "image",
    VOICE = "voice"
}

export enum ResourceStatus{
    PENDING = "pending",
    UPLOADED = "uploaded",
    FAILED = "failed"
}


//-----------------------------------
// INTERFACE->TYEPSCRIPT BLUEPRINT
// ----------------------------------

// basically the schema means just the object
// so we havr 2 object the resouce and the voice metadata object 
// and the collection and the model is only of the resouce object are you getting 

//ust the embedded voiceMetadata object inside that document.
// we use it so that the resource collection stays clean 
export interface IVoiceMetadata{
    duration : number ;
}

export interface IResource extends Document {
    name: string;
    s3key: string;
    type : ResourceType;
    mimeType:string;
    size?: number;
    status: ResourceStatus;
    uploadedBy: mongoose.Types.ObjectId;
    voiceMetadata?: IVoiceMetadata;
    createdAt : Date;
    updatedAt : Date; 
}

//--------------------------------
// SCHEMAS -> MONGODB BLUEPRINT
//--------------------------------

//voicemetadataschema 
const VoiceMetadataSchema = new Schema<IVoiceMetadata>(
    {
        duration: {type:Number, required: false},
    },
    {_id: false}// no id required
);


//resouce schema
const ResourceSchema= new Schema<IResource>(
    {
        name : {type : String , required: true , trime: true},
        s3key: {type: String , required: true , unique: true , index: true },
        type: { type: String , enum: Object.values(ResourceType), required: true},
        //  default: "application/octet-stream" => is kind of  generic type 
        // it is just the binary data  and i means that i dont know  what file is it is
        // or treat it as a raw data 
        // octat => means 8 =>  means a stream of data 
        mimeType : {type: String, required: false,  default: "application/octet-stream"},
        size : { type : Number },
        status : { type : String, enum: Object.values(ResourceStatus), default: ResourceStatus.UPLOADED},
        uploadedBy : { type: Schema.Types.ObjectId, ref:"User", required:true},
        voiceMetadata : {type: VoiceMetadataSchema, default: undefined},
    },
    {timestamps: true}
);

const Resource:  Model<IResource>=
    mongoose.models.Resource || 
    mongoose.model<IResource>("Resource", ResourceSchema);

export default  Resource;








