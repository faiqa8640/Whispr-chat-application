import mongoose from "mongoose";// moongose is the library  tell allow node js to talk to the db 
import { ENV } from "./env";// this is the configure file 

export async function connectDB(): Promise<void> {// it is the asyn function 
  //every async function automatically returns a promise even if we dont write it ourself
  // basically we can write it and dont write its up to me okay .. 
  try {
    await mongoose.connect(ENV.MONGO_URI);//  here we are connecting to the mongodb 
    console.log(" MongoDB connected");
  } catch (err) {
    console.error(" MongoDB connection error:", err);
    process.exit(1);
  }
}
