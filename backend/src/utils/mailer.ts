import nodemailer from "nodemailer";
import { ENV } from "../config/env.js";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: ENV.EMAIL_USER,
    pass: ENV.EMAIL_PASS,   // Gmail App Password (not your regular password)
  },
});

// ─── Branded email wrapper (Whispr) ───────────────────────────────────────────
function emailWrapper(content: string): string {
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;background:#FAF6FD;padding:40px 32px;border-radius:12px;">
      <div style="text-align:center;margin-bottom:32px;">
        <span style="font-family:Georgia,'Times New Roman',serif;font-size:28px;letter-spacing:0.25em;color:#2A1F3D;font-weight:600;">WHISPR</span>
        <div style="margin-top:10px;height:1px;background:#C19EE0;opacity:0.6;"></div>
        <span style="display:block;margin-top:8px;font-size:10px;letter-spacing:0.3em;text-transform:uppercase;color:#9163CB;">Speak softly. Connect deeply.</span>
      </div>
      <div style="background:#ffffff;border-radius:10px;padding:32px;box-shadow:0 1px 3px rgba(98,71,170,0.08);">
        ${content}
      </div>
      <div style="margin-top:32px;text-align:center;font-size:11px;color:#9163CB;letter-spacing:0.15em;text-transform:uppercase;">
        © ${new Date().getFullYear()} Whispr · All rights reserved
      </div>
    </div>
  `;
}

// ─── Send OTP verification email ─────────────────────────────────────────────
export async function sendOtpEmail(to: string, name: string, otp: string): Promise<void> {
  const html = emailWrapper(`
    <h2 style="color:#2A1F3D;font-size:22px;font-weight:600;margin:0 0 8px;">Verify your email</h2>
    <p style="color:#7C6A93;font-size:14px;line-height:1.6;margin:0 0 24px;">
      Hey ${name}, welcome to Whispr! Use the code below to verify your account and start chatting. It expires in <strong>${ENV.OTP_EXPIRES_MINUTES} minutes</strong>.
    </p>
    <div style="background:linear-gradient(135deg,#6247AA,#A06CD5);border-radius:10px;padding:24px;text-align:center;margin-bottom:24px;">
      <span style="font-family:Georgia,'Times New Roman',serif;font-size:38px;letter-spacing:0.5em;color:#FFFFFF;font-weight:700;">${otp}</span>
    </div>
    <p style="color:#9163CB;font-size:12px;line-height:1.6;margin:0;">If you didn't create a Whispr account, you can safely ignore this email.</p>
  `);

  await transporter.sendMail({
    from: `"Whispr" <${ENV.EMAIL_USER}>`,
    to,
    subject: "Your Whispr verification code",
    html,
  });
}

// ─── Send password reset email ────────────────────────────────────────────────
export async function sendPasswordResetEmail(
  to: string,
  name: string,
  resetLink: string
): Promise<void> {
  const html = emailWrapper(`
    <h2 style="color:#2A1F3D;font-size:22px;font-weight:600;margin:0 0 8px;">Reset your password</h2>
    <p style="color:#7C6A93;font-size:14px;line-height:1.6;margin:0 0 24px;">
      Hey ${name}, we received a request to reset your Whispr password. Click the button below — the link expires in <strong>1 hour</strong>.
    </p>
    <div style="text-align:center;margin-bottom:24px;">
      <a href="${resetLink}" style="display:inline-block;background:#A06CD5;color:#ffffff;padding:14px 32px;border-radius:999px;text-decoration:none;font-size:13px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;">
        Reset Password
      </a>
    </div>
    <p style="color:#9163CB;font-size:12px;line-height:1.6;margin:0;">If you didn't request a password reset, you can safely ignore this email — your password won't be changed.</p>
    <p style="color:#9163CB;font-size:11px;margin-top:12px;word-break:break-all;">Or copy this link: <a href="${resetLink}" style="color:#A06CD5;">${resetLink}</a></p>
  `);

  await transporter.sendMail({
    from: `"Whispr" <${ENV.EMAIL_USER}>`,
    to,
    subject: "Reset your Whispr password",
    html,
  });
}