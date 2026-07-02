import mongoose from "mongoose";
import { ENV } from "./env.js";

export async function connectDB(): Promise<void> {
  try {
    await mongoose.connect(ENV.MONGO_URI);
    console.log(" MongoDB connected");
  } catch (err) {
    console.error(" MongoDB connection error:", err);
    process.exit(1);
  }
}
