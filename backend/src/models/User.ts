import mongoose, { Document, Model, Schema } from "mongoose";
import bcrypt from "bcryptjs";

export interface IUser extends Document {
  name: string;
  email: string;
  password?: string;

  role: "user" | "admin";
  provider: "local" | "google";

  googleId?: string;
  avatar?: string;

  isVerified: boolean;

  otpCode?: string;
  otpExpires?: Date;

  resetToken?: string;
  resetTokenExpires?: Date;

  // Last time this user's final WebSocket connection dropped. Undefined
  // means they've never disconnected since this field was introduced (or
  // are a brand-new account) — the frontend treats that the same as "no
  // last-seen info available" rather than a specific date.
  lastSeen?: Date;

  // Soft-delete flag. The document (and its _id) is kept forever so that
  // existing Message.sender/receiver refs from other users' conversations
  // still resolve — formatUser() renders this account as "Deleted User"
  // wherever it's referenced instead of hard-deleting it.
  isDeleted: boolean;
  deletedAt?: Date;

  createdAt: Date;
  updatedAt: Date;

  matchPassword(enteredPassword: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    name:     { type: String, required: true, trim: true },
    email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, minlength: 6, select: false },

    role:     { type: String, enum: ["user", "admin"], default: "user" },
    provider: { type: String, enum: ["local", "google"], default: "local" },

    googleId: { type: String, unique: true, sparse: true },
    avatar:   { type: String },

    isVerified: { type: Boolean, default: false },

    otpCode:    { type: String, select: false },
    otpExpires: { type: Date,   select: false },

    resetToken:        { type: String, select: false },
    resetTokenExpires: { type: Date,   select: false },

    lastSeen: { type: Date },

    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
  },
  { timestamps: true }
);

UserSchema.pre<IUser>("save", async function () {
  if (!this.isModified("password") || !this.password) return;

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

UserSchema.methods.matchPassword = async function (
  enteredPassword: string
): Promise<boolean> {
  if (!this.password) return false;
  return bcrypt.compare(enteredPassword, this.password);
};

const User: Model<IUser> = mongoose.model<IUser>("User", UserSchema);
export default User;