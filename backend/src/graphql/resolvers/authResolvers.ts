// import bcrypt from "bcryptjs";
// import { OAuth2Client } from "google-auth-library";
// import User from "../../models/User.js";
// import { ENV } from "../../config/env.js";
// import {
//   signToken,
//   attachCookie,
//   clearCookie,
//   generateOtp,
//   otpExpiryDate,
//   generateResetToken,
//   resetTokenExpiryDate,
// } from "../../utils/token.js";
// import { sendOtpEmail, sendPasswordResetEmail } from "../../utils/mailer.js";
// import { AuthContext, requireAuth } from "../../middleware/authContext.js";
// import { pubsub, EVENTS } from "../pubsub";

// const googleClient = new OAuth2Client(ENV.GOOGLE_CLIENT_ID);

// // ─── Helpers ──────────────────────────────────────────────────────────────────
// export function formatUser(user: InstanceType<typeof User>) {
//   return {
//     id: user._id.toString(),
//     name: user.name,
//     email: user.email,
//     provider: user.provider,
//     avatar: user.avatar ?? null,
//     isVerified: user.isVerified,
//     createdAt: user.createdAt,
//     updatedAt: user.updatedAt,
//   };
// }

// // ─── Resolvers ────────────────────────────────────────────────────────────────
// export const authResolvers = {
//   Query: { // used for testing

//     me: async (_: unknown, __: unknown, ctx: AuthContext) => { // this return currently logined user
//       if (!ctx.user) return null;
//       const user = await User.findById(ctx.user._id);
//       return user ? formatUser(user) : null;
//     },
//   },

//   Mutation: {
//     // ── Signup ─────────────────────────────────────────────────────────────────
//     signup: async (
//       _: unknown,
//       { name, email, password }: { name: string; email: string; password: string }
//     ) => {
//       if (password.length < 8) {
//         throw new Error("Password must be at least 8 characters.");
//       }

//       const existing = await User.findOne({ email: email.toLowerCase() });
//       if (existing) {
//         if (existing.provider === "google") {
//           throw new Error("This email is linked to a Google account. Please use Google Sign-In.");
//         }
//         if (existing.isVerified) {
//           throw new Error("An account with this email already exists.");
//         }
//         // Not verified yet — update details and resend OTP
//         // NOTE: assign plain password; the pre-save hook will hash it
//         const otp = generateOtp();
//         const hashedOtp = await bcrypt.hash(otp, 10);
//         existing.otpCode = hashedOtp;
//         existing.otpExpires = otpExpiryDate();
//         existing.password = password;          
//         existing.name = name;
//         await existing.save();
//         await sendOtpEmail(email, name, otp);
//         return { success: true, message: "OTP resent to your email. Please verify." };
//       }

//       const otp = generateOtp();
//       const hashedOtp = await bcrypt.hash(otp, 10);

//       // NOTE: store plain password — the pre-save hook hashes it on create too
//       await User.create({
//         name,
//         email: email.toLowerCase(),
//         password,                              // ← plain text; hook hashes it
//         provider: "local",
//         isVerified: false,
//         otpCode: hashedOtp,
//         otpExpires: otpExpiryDate(),
//       });

//       await sendOtpEmail(email, name, otp);
//       return { success: true, message: "Account created! Check your email for the verification OTP." };
//     },

//     // ── Verify OTP ─────────────────────────────────────────────────────────────
//     verifyOtp: async (
//       _: unknown,
//       { email, otp }: { email: string; otp: string },
//       ctx: AuthContext
//     ) => {
//       const user = await User.findOne({ email: email.toLowerCase() }).select(
//         "+otpCode +otpExpires"
//       );
//       if (!user) throw new Error("No account found with that email.");
//       if (user.isVerified) throw new Error("This account is already verified.");
//       if (!user.otpCode || !user.otpExpires) throw new Error("No OTP found. Request a new one.");

//       if (user.otpExpires < new Date()) {
//         throw new Error("OTP has expired. Please request a new one.");
//       }

//       const valid = await bcrypt.compare(otp, user.otpCode);
//       if (!valid) throw new Error("Invalid OTP. Please try again.");

//       user.isVerified = true;
//       user.otpCode = undefined;
//       user.otpExpires = undefined;
//       // password is not modified here so the hook won't re-hash it
//       await user.save();

//       const token = signToken(user._id.toString());//JWT
//       attachCookie(ctx.res, token);

//       return {
//         user: formatUser(user),
//         message: "Email verified! You are now logged in.",
//       };
//     },

//     // ── Resend OTP ──────────────────────────────────────────────────────────────
//     resendOtp: async (_: unknown, { email }: { email: string }) => {
//       const user = await User.findOne({ email: email.toLowerCase() });
//       if (!user) throw new Error("No account found with that email.");
//       if (user.isVerified) throw new Error("Account is already verified.");

//       const otp = generateOtp();
//       const hashedOtp = await bcrypt.hash(otp, 10);
//       user.otpCode = hashedOtp;
//       user.otpExpires = otpExpiryDate();
      
//       await user.save();

//       await sendOtpEmail(email, user.name, otp);
//       return { success: true, message: "New OTP sent to your email." };
//     },

//     // ── Login ───────────────────────────────────────────────────────────────────
//     login: async (
//       _: unknown,
//       { email, password }: { email: string; password: string },
//       ctx: AuthContext
//     ) => {
//       const user = await User.findOne({ email: email.toLowerCase() }).select("+password");
//       if (!user) throw new Error("Invalid email or password.");
//       if (user.provider === "google") {
//         throw new Error("This account uses Google Sign-In. Please continue with Google.");
//       }
//       if (!user.password) throw new Error("Invalid email or password.");

//       const match = await bcrypt.compare(password, user.password);
//       if (!match) throw new Error("Invalid email or password.");

//       if (!user.isVerified) {
//         // Resend OTP automatically — only touch OTP fields, not password
//         const otp = generateOtp();
//         const hashedOtp = await bcrypt.hash(otp, 10);
//         user.otpCode = hashedOtp;
//         user.otpExpires = otpExpiryDate();
//         await user.save();
//         await sendOtpEmail(email, user.name, otp);
//         throw new Error("EMAIL_NOT_VERIFIED: A new OTP has been sent to your email.");
//       }

//       const token = signToken(user._id.toString()); // generate jwt token
//       attachCookie(ctx.res, token);

//       return { user: formatUser(user), message: "Logged in successfully." };
//     },

//     // ── Logout ──────────────────────────────────────────────────────────────────
//     logout: (_: unknown, __: unknown, ctx: AuthContext) => {
//       clearCookie(ctx.res);
//       return { success: true, message: "Logged out successfully." };
//     },

//     // ── Google OAuth ────────────────────────────────────────────────────────────
//     googleAuth: async (
//       _: unknown,
//       { idToken }: { idToken: string },
//       ctx: AuthContext
//     ) => {
//       let payload;
//       try {
//         const ticket = await googleClient.verifyIdToken({
//           idToken,
//           audience: ENV.GOOGLE_CLIENT_ID,
//         });
//         payload = ticket.getPayload();
//       } catch {
//         throw new Error("Invalid Google token. Please try again.");
//       }

//       if (!payload || !payload.email) {
//         throw new Error("Could not retrieve email from Google account.");
//       }

//       const { sub: googleId, email, name = "Delina User", picture } = payload;

//       let user = await User.findOne({
//         $or: [{ googleId }, { email: email.toLowerCase() }],
//       });

//       if (user) {
//         if (!user.googleId) user.googleId = googleId;
//         if (!user.avatar && picture) user.avatar = picture;
//         if (!user.isVerified) user.isVerified = true;
//         if (user.provider === "local") user.provider = "google";
//         // password not touched — hook won't fire
//         await user.save();
//       } else {
//         user = await User.create({
//           name,
//           email: email.toLowerCase(),
//           provider: "google",
//           googleId,
//           avatar: picture,
//           isVerified: true,
//         });
//       }

//       const token = signToken(user._id.toString());
//       attachCookie(ctx.res, token);

//       return { user: formatUser(user), message: "Signed in with Google." };
//     },

//     // ── Forgot Password ─────────────────────────────────────────────────────────
//     forgotPassword: async (_: unknown, { email }: { email: string }) => {
//       const user = await User.findOne({ email: email.toLowerCase() });
//       const genericMsg = "If an account with that email exists, a reset link has been sent.";

//       // Unknown email — stay generic so we don't leak which emails are registered
//       if (!user) return { success: true, message: genericMsg };

//       // Google accounts have no password to reset — tell them directly instead
//       // of making them wait on an email that will never arrive.
//       if (user.provider === "google") {
//         return {
//           success: false,
//           message:
//             "This account was created with Google Sign-In. Please log in using the \"Continue with Google\" button instead.",
//         };
//       }

//       const resetToken = generateResetToken();
//       user.resetToken = resetToken;
//       user.resetTokenExpires = resetTokenExpiryDate();
//       // password not touched — hook won't fire
//       await user.save();

//       const resetLink = `${ENV.CLIENT_URL}/reset-password?token=${resetToken}`;
//       await sendPasswordResetEmail(email, user.name, resetLink);

//       return { success: true, message: genericMsg };
//     },

//     // ── Reset Password ──────────────────────────────────────────────────────────
//     resetPassword: async (
//       _: unknown,
//       { token, newPassword }: { token: string; newPassword: string }
//     ) => {
//       if (newPassword.length < 8) {
//         throw new Error("Password must be at least 8 characters.");
//       }

//       const user = await User.findOne({
//         resetToken: token,
//         resetTokenExpires: { $gt: new Date() },
//       }).select("+resetToken +resetTokenExpires");

//       if (!user) {
//         throw new Error("Reset link is invalid or has expired. Please request a new one.");
//       }

//       // Assign plain text — the pre-save hook will hash it once
//       user.password = newPassword;             // ← plain text; hook hashes it
//       user.resetToken = undefined;
//       user.resetTokenExpires = undefined;
//       await user.save();

//       return { success: true, message: "Password reset successfully. You can now log in." };
//     },

//     // ── Update Profile ──────────────────────────────────────────────────────────
//     updateProfile: async (
//       _: unknown,
//       { name, avatar }: { name?: string; avatar?: string },
//       ctx: AuthContext
//     ) => {
//       const authUser = requireAuth(ctx);
//       const user = await User.findById(authUser._id);
//       if (!user) throw new Error("User not found.");

//       if (name) user.name = name;
//       if (avatar !== undefined) user.avatar = avatar;
//       // password not touched — hook won't fire
//       await user.save();

//       const formatted = formatUser(user);

//       // Push the change to anyone else currently connected (e.g. someone
//       // with a chat open with this user) so their sidebar/header avatar and
//       // name update live, WhatsApp-style, without a refresh.
//       pubsub.publish(EVENTS.USER_UPDATED, { userUpdated: formatted });

//       return formatted;
//     },
//   },
// };





import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import User from "../../models/User.js";
import { ENV } from "../../config/env.js";
import {
  signToken,
  attachCookie,
  clearCookie,
  generateOtp,
  otpExpiryDate,
  generateResetToken,
  resetTokenExpiryDate,
} from "../../utils/token.js";
import { sendOtpEmail, sendPasswordResetEmail } from "../../utils/mailer.js";
import { AuthContext, requireAuth } from "../../middleware/authContext.js";
import { pubsub, EVENTS } from "../pubsub";
import { isUserOnline } from "../../utils/onlineStatus.js";

const googleClient = new OAuth2Client(ENV.GOOGLE_CLIENT_ID);

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function formatUser(user: InstanceType<typeof User>) {
  const id = user._id.toString();
  return {
    id,
    name: user.name,
    email: user.email,
    provider: user.provider,
    avatar: user.avatar ?? null,
    isVerified: user.isVerified,
    // Presence is derived live from the in-memory connection tracker, not
    // stored on the document — it reflects whoever is *currently* connected.
    isOnline: isUserOnline(id),
    // Only meaningful when isOnline is false; null otherwise (or for
    // accounts that have never disconnected since this field existed).
    lastSeen: user.lastSeen ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

// ─── Resolvers ────────────────────────────────────────────────────────────────
export const authResolvers = {
  Query: { // used for testing

    me: async (_: unknown, __: unknown, ctx: AuthContext) => { // this return currently logined user
      if (!ctx.user) return null;
      const user = await User.findById(ctx.user._id);
      return user ? formatUser(user) : null;
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

      const existing = await User.findOne({ email: email.toLowerCase() });
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
        const hashedOtp = await bcrypt.hash(otp, 10);
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
        password,                              // ← plain text; hook hashes it
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
        "+otpCode +otpExpires"
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
      let payload;
      try {
        const ticket = await googleClient.verifyIdToken({
          idToken,
          audience: ENV.GOOGLE_CLIENT_ID,
        });
        payload = ticket.getPayload();
      } catch {
        throw new Error("Invalid Google token. Please try again.");
      }

      if (!payload || !payload.email) {
        throw new Error("Could not retrieve email from Google account.");
      }

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
      const authUser = requireAuth(ctx);
      const user = await User.findById(authUser._id);
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
  },
};