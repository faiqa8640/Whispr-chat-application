import { useState, useRef, useEffect, type KeyboardEvent, type ClipboardEvent } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { gql } from "../lib/gqlClient";
import { VERIFY_OTP_MUTATION, RESEND_OTP_MUTATION } from "../lib/mutations";
import { useAuth, type AuthUser } from "../context/AuthContext";

const OTP_LENGTH = 6;

export default function VerifyOtp() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setUser } = useAuth();

  const email = searchParams.get("email") ?? "";

  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Focus first box on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // Cooldown countdown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // ── Box handlers ─────────────────────────────────────────────────────────────
  function handleChange(i: number, val: string) {
    const char = val.replace(/\D/g, "").slice(-1); // digits only, last char
    const next = [...digits];
    next[i] = char;
    setDigits(next);
    if (char && i < OTP_LENGTH - 1) inputRefs.current[i + 1]?.focus();
  }

  function handleKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      inputRefs.current[i - 1]?.focus();
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    const next = [...digits];
    pasted.split("").forEach((ch, idx) => { next[idx] = ch; });
    setDigits(next);
    inputRefs.current[Math.min(pasted.length, OTP_LENGTH - 1)]?.focus();
  }

  // ── Submit ───────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    const otp = digits.join("");
    if (otp.length < OTP_LENGTH) {
      setError("Please enter all 6 digits.");
      return;
    }
    setError("");
    setIsSubmitting(true);
    try {
      const data = await gql<{ verifyOtp: { user: AuthUser; message: string } }>(
        VERIFY_OTP_MUTATION,
        { email, otp }
      );
      setUser(data.verifyOtp.user);
      // navigate("/");
      navigate("/inbox")
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Verification failed.");
      setDigits(Array(OTP_LENGTH).fill(""));
      inputRefs.current[0]?.focus();
    } finally {
      setIsSubmitting(false);
    }
  }

  // ── Resend ───────────────────────────────────────────────────────────────────
  async function handleResend() {
    if (resendCooldown > 0) return;
    setError("");
    setInfo("");
    try {
      await gql(RESEND_OTP_MUTATION, { email });
      setInfo("A new OTP has been sent to your email.");
      setResendCooldown(60);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not resend OTP.");
    }
  }

  return (
    <div className="flex h-screen items-center justify-center overflow-y-auto bg-whispr-snow px-6 py-16">
      <div className="mx-auto w-full max-w-sm">
        <Link to="/" className="mb-10 flex flex-col items-center">
          <span className="font-display text-3xl font-semibold tracking-widest2 text-whispr-noir">
            WHISPR
          </span>
          <span className="mt-1 h-px w-10 bg-whispr-coral/60" />
          <span className="mt-1 font-body text-[10px] uppercase tracking-[0.3em] text-whispr-mauve">
            Speak softly. Connect deeply.
          </span>
        </Link>

        <h1 className="font-display text-[34px] font-semibold leading-tight text-whispr-noir">
          Verify your email
        </h1>
        <p className="mt-2 font-body text-sm text-whispr-mauve">
          We sent a 6-digit code to{" "}
          <span className="font-semibold text-whispr-noir">{email}</span>.
          Enter it below.
        </p>

        {/* OTP boxes */}
        <div className="mt-8 flex justify-between gap-2">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={handlePaste}
              className={[
                "h-14 w-full rounded-md border text-center font-display text-2xl font-semibold text-whispr-noir shadow-sm transition-all",
                "focus:outline-none focus:ring-2 focus:ring-whispr-coral/30",
                d ? "border-whispr-coral bg-white" : "border-whispr-rose/40 bg-white",
              ].join(" ")}
            />
          ))}
        </div>

        {error && (
          <p className="mt-4 rounded-md bg-whispr-burgundy/10 px-3 py-2 font-body text-sm text-whispr-burgundy">
            {error}
          </p>
        )}
        {info && (
          <p className="mt-4 rounded-md bg-green-50 px-3 py-2 font-body text-sm text-green-700">
            {info}
          </p>
        )}

        <button
          onClick={handleSubmit}
          disabled={isSubmitting || digits.join("").length < OTP_LENGTH}
          className="mt-6 w-full rounded-full bg-whispr-coral py-3.5 font-body text-sm font-semibold uppercase tracking-wider text-white shadow-sm transition-colors duration-200 hover:bg-whispr-crimson disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting ? "Verifying…" : "Verify Email"}
        </button>

        <p className="mt-6 text-center font-body text-sm text-whispr-mauve">
          Didn't receive a code?{" "}
          <button
            onClick={handleResend}
            disabled={resendCooldown > 0}
            className="font-semibold text-whispr-coral transition-colors hover:text-whispr-crimson disabled:cursor-not-allowed disabled:opacity-50"
          >
            {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend OTP"}
          </button>
        </p>

        <p className="mt-3 text-center font-body text-sm text-whispr-mauve">
          <Link to="/login" className="text-whispr-mauve hover:text-whispr-coral">
            ← Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}
