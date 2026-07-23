import bcrypt from "bcryptjs"; // used to  has passwords 
import { OAuth2Client } from "google-auth-library";//This is Google's library.
// It is used to verify Google Sign-In tokens.
import User from "../../models/User";
import { ENV } from "../../config/env";
import {
  signToken,
  attachCookie,
  clearCookie,
  generateOtp,
  otpExpiryDate,
  generateResetToken,
  resetTokenExpiryDate,
} from "../../utils/token";
import { sendOtpEmail, sendPasswordResetEmail } from "../../utils/mailer";
import { AuthContext, requireAuth } from "../../middleware/authContext";
import { pubsub, EVENTS } from "../pubsub";
import { isUserOnline } from "../../utils/onlineStatus";


// This creates a Google OAuth client.
// Whenever someone signs in with Google this object verifies the token. 
const googleClient = new OAuth2Client(ENV.GOOGLE_CLIENT_ID);

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function formatUser(user: InstanceType<typeof User>) {
  // InstanceType<typeof User>: The type of an actual User document created from the User model."
  const id = user._id.toString();  //store the id of the user 

  // Deleted accounts: render a stable "Deleted User" placeholder instead of
  // real profile info everywhere this user is referenced (messages,
  // conversations, replyTo previews, subscriptions) — but keep the same id
  // so existing message history for the other participant still resolves.
  if (user.deletedAt) {
    return {
      id,
      name: "Deleted User",
      email: user.email,
      provider: user.provider,
      avatar: null,
      isVerified: user.isVerified,
      isOnline: false,
      lastSeen: user.lastSeen ?? null,
      isDeleted: true,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  return {
    id,
    name: user.name,
    email: user.email,
    provider: user.provider,
    avatar: user.avatar ?? null,
    isVerified: user.isVerified,
    isOnline: isUserOnline(id),
    lastSeen: user.lastSeen ?? null,
    isDeleted: false,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

// ─── Resolvers ────────────────────────────────────────────────────────────────
export const authResolvers = {
  Query: {

    // 3 paramertes  = parent , args, context , info  and ignore the info 
    // _ -> not using the parameter  of the name 
    // args => these are passed from the frontend 
    // ctx => is the context 
    // -> it backpack that GraphQL gives to every resolver.
    // it contain info such as =>the logged-in user, cookies , request ,response 
    me: async (_: unknown, __: unknown, ctx: AuthContext) => { // this return currently logined user
      // earlier after authtntication middleware  -> verify the jwt , find the user and store it into the context
      // hence eevery resolver can access the  logined user 
      if (!ctx.user) return null;//"Is anyone logged in?"
      const user = await User.findById(ctx.user._id);
      return user ? formatUser(user) : null;// if user find then format i
    },
  },

  Mutation: {
    // ── Signup ─────────────────────────────────────────────────────────────────
    signup: async (
      _: unknown,
      { name, email, password }: { name: string; email: string; password: string }
    ) => {
      if (password.length < 8) {
        throw new Error("Password must be at least 8 characters.");
      }

      const existing = await User.findOne({ email: email.toLowerCase() }).sort({ createdAt: -1 });
      //, deletedAt: { $in: [null, false, undefined]}
      if (existing) {
        if (existing.provider === "google") {
          throw new Error("This email is linked to a Google account. Please use Google Sign-In.");
        }
        if (existing.isVerified) {
          throw new Error("An account with this email already exists.");
        }
        // Not verified yet — update details and resend OTP
        // NOTE: assign plain password; the pre-save hook will hash it
        const otp = generateOtp();
        const hashedOtp = await bcrypt.hash(otp, 10);// 10 is the cost/work factor  / salt round
        // It tells bcrypt how much work to do when creating the hash
        existing.otpCode = hashedOtp;
        existing.otpExpires = otpExpiryDate();
        existing.password = password;          
        existing.name = name;
        await existing.save();
        await sendOtpEmail(email, name, otp);
        return { success: true, message: "OTP resent to your email. Please verify." };
      }

      const otp = generateOtp();
      const hashedOtp = await bcrypt.hash(otp, 10);

      // NOTE: store plain password — the pre-save hook hashes it on create too
      await User.create({
        name,
        email: email.toLowerCase(),
        password,                             
        provider: "local",
        isVerified: false,
        otpCode: hashedOtp,
        otpExpires: otpExpiryDate(),
      });

      await sendOtpEmail(email, name, otp);
      return { success: true, message: "Account created! Check your email for the verification OTP." };
    },

    // ── Verify OTP ─────────────────────────────────────────────────────────────
    verifyOtp: async (
      _: unknown,
      { email, otp }: { email: string; otp: string },
      ctx: AuthContext
    ) => {
      const user = await User.findOne({ email: email.toLowerCase() }).select(
        "+otpCode +otpExpires" // coz for them select =false  => so we explicity mentiion them to download it 
      );
      if (!user) throw new Error("No account found with that email.");
      if (user.isVerified) throw new Error("This account is already verified.");
      if (!user.otpCode || !user.otpExpires) throw new Error("No OTP found. Request a new one.");

      if (user.otpExpires < new Date()) {
        throw new Error("OTP has expired. Please request a new one.");
      }

      const valid = await bcrypt.compare(otp, user.otpCode);
      if (!valid) throw new Error("Invalid OTP. Please try again.");

      user.isVerified = true;
      user.otpCode = undefined;
      user.otpExpires = undefined;
      // password is not modified here so the hook won't re-hash it
      await user.save();

      const token = signToken(user._id.toString());//JWT
      attachCookie(ctx.res, token);

      return {
        user: formatUser(user),
        message: "Email verified! You are now logged in.",
      };
    },

    // ── Resend OTP ──────────────────────────────────────────────────────────────
    resendOtp: async (_: unknown, { email }: { email: string }) => {
      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user) throw new Error("No account found with that email.");
      if (user.isVerified) throw new Error("Account is already verified.");

      const otp = generateOtp();
      const hashedOtp = await bcrypt.hash(otp, 10);
      user.otpCode = hashedOtp;
      user.otpExpires = otpExpiryDate();
      
      await user.save();

      await sendOtpEmail(email, user.name, otp);
      return { success: true, message: "New OTP sent to your email." };
    },

    // ── Login ───────────────────────────────────────────────────────────────────
    login: async (
      _: unknown,
      { email, password }: { email: string; password: string },
      ctx: AuthContext
    ) => {
      const user = await User.findOne({ email: email.toLowerCase() }).select("+password");
      if (!user) throw new Error("Invalid email or password.");
      if (user.provider === "google") {
        throw new Error("This account uses Google Sign-In. Please continue with Google.");
      }
      if (!user.password) throw new Error("Invalid email or password.");

      const match = await bcrypt.compare(password, user.password);
      if (!match) throw new Error("Invalid email or password.");

      if (!user.isVerified) {
        // Resend OTP automatically — only touch OTP fields, not password
        const otp = generateOtp();
        const hashedOtp = await bcrypt.hash(otp, 10);
        user.otpCode = hashedOtp;
        user.otpExpires = otpExpiryDate();
        await user.save();
        await sendOtpEmail(email, user.name, otp);
        throw new Error("EMAIL_NOT_VERIFIED: A new OTP has been sent to your email.");
      }

      const token = signToken(user._id.toString()); // generate jwt token
      attachCookie(ctx.res, token);

      return { user: formatUser(user), message: "Logged in successfully." };
    },

    // ── Logout ──────────────────────────────────────────────────────────────────
    logout: (_: unknown, __: unknown, ctx: AuthContext) => {
      clearCookie(ctx.res);
      return { success: true, message: "Logged out successfully." };
    },

    // ── Google OAuth ────────────────────────────────────────────────────────────
    googleAuth: async (
      _: unknown,
      { idToken }: { idToken: string },
      ctx: AuthContext
    ) => {
      let payload; // create a variable called payload 
      try {// backend ask the google if it is actually created by google => if true google return ticket 
        // ticket contain user information 
        const ticket = await googleClient.verifyIdToken({
          idToken,
          audience: ENV.GOOGLE_CLIENT_ID, // is that token created for this app 
        });
        //Extracts user information (email, name, picture, Google ID) from the verified token.
        // payload => contains the Google user's profile. 
        payload = ticket.getPayload();
      } catch {
        throw new Error("Invalid Google token. Please try again.");
      }

      if (!payload || !payload.email) {
        throw new Error("Could not retrieve email from Google account.");
      }
      //Gets these values from Google's response:
      // sub->google id
      // object destructuring. => we are doing here 
      const { sub: googleId, email, name = "Delina User", picture } = payload;

      let user = await User.findOne({
        $or: [{ googleId }, { email: email.toLowerCase() }],
      });

      if (user) {
        if (!user.googleId) user.googleId = googleId;
        if (!user.avatar && picture) user.avatar = picture;
        if (!user.isVerified) user.isVerified = true;
        if (user.provider === "local") user.provider = "google";
        // password not touched — hook won't fire
        await user.save();
      } else {
        user = await User.create({
          name,
          email: email.toLowerCase(),
          provider: "google",
          googleId,
          avatar: picture,
          isVerified: true,
        });
      }

      const token = signToken(user._id.toString());
      attachCookie(ctx.res, token);

      return { user: formatUser(user), message: "Signed in with Google." };
    },

    // ── Forgot Password ─────────────────────────────────────────────────────────
    forgotPassword: async (_: unknown, { email }: { email: string }) => {
      const user = await User.findOne({ email: email.toLowerCase() });
      const genericMsg = "If an account with that email exists, a reset link has been sent.";

      // Unknown email — stay generic so we don't leak which emails are registered
      if (!user) return { success: true, message: genericMsg };

      // Google accounts have no password to reset — tell them directly instead
      // of making them wait on an email that will never arrive.
      if (user.provider === "google") {
        return {
          success: false,
          message:
            "This account was created with Google Sign-In. Please log in using the \"Continue with Google\" button instead.",
        };
      }

      const resetToken = generateResetToken();
      user.resetToken = resetToken;
      user.resetTokenExpires = resetTokenExpiryDate();
      // password not touched — hook won't fire
      await user.save();

      const resetLink = `${ENV.CLIENT_URL}/reset-password?token=${resetToken}`;
      await sendPasswordResetEmail(email, user.name, resetLink);

      return { success: true, message: genericMsg };
    },

    // ── Reset Password ──────────────────────────────────────────────────────────
    resetPassword: async (
      _: unknown,
      { token, newPassword }: { token: string; newPassword: string }
    ) => {
      if (newPassword.length < 8) {
        throw new Error("Password must be at least 8 characters.");
      }

      const user = await User.findOne({
        resetToken: token,
        resetTokenExpires: { $gt: new Date() },
      }).select("+resetToken +resetTokenExpires");

      if (!user) {
        throw new Error("Reset link is invalid or has expired. Please request a new one.");
      }

      // Assign plain text — the pre-save hook will hash it once
      user.password = newPassword;             // ← plain text; hook hashes it
      user.resetToken = undefined;
      user.resetTokenExpires = undefined;
      await user.save();

      return { success: true, message: "Password reset successfully. You can now log in." };
    },

    // ── Update Profile ──────────────────────────────────────────────────────────
    updateProfile: async (
      _: unknown,
      { name, avatar }: { name?: string; avatar?: string },
      ctx: AuthContext
    ) => {
      const authUser = requireAuth(ctx); // get the authenticated user 
      const user = await User.findById(authUser._id); //get that user 
      if (!user) throw new Error("User not found.");

      if (name) user.name = name;
      if (avatar !== undefined) user.avatar = avatar;
      // password not touched — hook won't fire
      await user.save();

      const formatted = formatUser(user);

      // Push the change to anyone else currently connected (e.g. someone
      // with a chat open with this user) so their sidebar/header avatar and
      // name update live, WhatsApp-style, without a refresh.
      pubsub.publish(EVENTS.USER_UPDATED, { userUpdated: formatted });

      return formatted;
    },

    // ── Delete Account ──────────────────────────────────────────────────────────
    /**
     * Soft-deletes the caller's account:
     *  - The User document (and its _id) is kept forever so existing
     *    Message.sender/receiver refs in other people's conversations still
     *    resolve correctly.
     *  - Personally-identifying / login-capable fields are scrubbed
     *    (name, email, avatar, password, googleId, otp/reset tokens) so the
     *    account can never log back in and never shows real info again.
     *  - `isDeleted: true` makes formatUser() render this account as
     *    "Deleted User" everywhere (sidebar rows, message bubbles, reply
     *    previews) — old messages stay visible to the other participant.
     *  - findUserByEmail excludes deleted users, and sendMessage refuses to
     *    deliver to one, so nobody can start a new conversation with them.
     */
    deleteAccount: async (_: unknown, __: unknown, ctx: AuthContext) => {
      const authUser = requireAuth(ctx);
      const user = await User.findById(authUser._id);
      if (!user) throw new Error("User not found.");
      if (user.deletedAt) throw new Error("This account has already been deleted.");
      
      user.deletedAt = new Date();

      user.name = "Deleted User";
      // Anonymized but still unique (keeps the `email` unique index happy)
      // and no longer resembles the real address.
      user.email = `deleted-${user._id.toString()}@whispr.deleted`;
      user.avatar = undefined;
      user.password = undefined;       // hook's isModified guard means no re-hash attempt
      user.googleId = undefined;
      user.otpCode = undefined;
      user.otpExpires = undefined;
      user.resetToken = undefined;
      user.resetTokenExpires = undefined;

      await user.save();

      // Log the (now-deleted) account out immediately.
      clearCookie(ctx.res);

      // Let anyone with a sidebar row / open chat for this person update
      // live to "Deleted User" instead of waiting for a page refresh.
      pubsub.publish(EVENTS.USER_UPDATED, { userUpdated: formatUser(user) });

      return { success: true, message: "Your account has been deleted." };
    },
  },
};