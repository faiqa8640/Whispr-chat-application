import jwt from "jsonwebtoken";
import crypto from "crypto";
import { ENV } from "../config/env.js";
import { Response } from "express";

// ─── JWT ──────────────────────────────────────────────────────────────────────
export function signToken(userId: string): string { // CREATE JWT TOKEN
  return jwt.sign({ id: userId }, ENV.JWT_SECRET, {
    expiresIn: ENV.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

export function verifyToken(token: string): { id: string } {
  return jwt.verify(token, ENV.JWT_SECRET) as { id: string };
}

// COOKIES FUNCTION_______________________________________________________
// Attach JWT to httpOnly cookie
export function attachCookie(res: Response, token: string): void {
  const isProd = ENV.NODE_ENV === "production";
  res.cookie("delina_token", token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "strict" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  });
}

export function clearCookie(res: Response): void {
  res.clearCookie("delina_token");
}

// ─── OTP ──────────────────────────────────────────────────────────────────────
export function generateOtp(): string {
  // 6-digit numeric OTP
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function otpExpiryDate(): Date {
  const d = new Date();
  d.setMinutes(d.getMinutes() + ENV.OTP_EXPIRES_MINUTES);
  return d;
}

// ─── Password reset token ─────────────────────────────────────────────────────
export function generateResetToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function resetTokenExpiryDate(): Date {
  const d = new Date();
  d.setHours(d.getHours() + 1); // 1 hour
  return d;
}
