import { useState, type FormEvent } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { gql } from "../lib/gqlClient";
import { RESET_PASSWORD_MUTATION } from "../lib/mutations";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!token) {
    return (
      <div className="flex h-screen items-center justify-center bg-whispr-snow px-6">
        <div className="text-center">
          <p className="font-body text-sm text-whispr-mauve">Invalid or missing reset token.</p>
          <Link to="/forgot-password" className="mt-4 inline-block font-body text-sm font-semibold text-whispr-coral hover:text-whispr-crimson">
            Request a new link
          </Link>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setIsSubmitting(true);
    try {
      await gql(RESET_PASSWORD_MUTATION, { token, newPassword: password });
      navigate("/login?reset=success");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Reset failed. The link may have expired.");
    } finally {
      setIsSubmitting(false);
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
          Set new password
        </h1>
        <p className="mt-2 font-body text-sm text-whispr-mauve">
          Choose a strong password for your Whispr account.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label htmlFor="password" className="mb-1.5 block font-body text-[11px] font-semibold uppercase tracking-wider text-whispr-mauve">
              New Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full rounded-md border border-whispr-rose/40 bg-white px-4 py-3 pr-11 font-body text-sm text-whispr-noir shadow-sm placeholder:text-whispr-mauve/50 transition-all focus:border-whispr-coral focus:outline-none focus:ring-2 focus:ring-whispr-coral/25"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-whispr-mauve hover:text-whispr-noir"
              >
                {showPassword ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-5 w-5">
                    <path d="M3 3l18 18" strokeLinecap="round" />
                    <path d="M10.6 10.6a2 2 0 002.8 2.8" strokeLinecap="round" />
                    <path d="M6.6 6.7C4.5 8 3 10 2 12c1.6 3.6 5 7 10 7 1.7 0 3.2-.4 4.6-1.1M9.9 4.2A10.4 10.4 0 0112 4c5 0 8.4 3.4 10 7-.5 1.1-1.2 2.2-2 3.2" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-5 w-5">
                    <path d="M2 12c1.6-3.6 5-7 10-7s8.4 3.4 10 7c-1.6 3.6-5 7-10 7s-8.4-3.4-10-7z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="confirm" className="mb-1.5 block font-body text-[11px] font-semibold uppercase tracking-wider text-whispr-mauve">
              Confirm Password
            </label>
            <input
              id="confirm"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your password"
              className="w-full rounded-md border border-whispr-rose/40 bg-white px-4 py-3 font-body text-sm text-whispr-noir shadow-sm placeholder:text-whispr-mauve/50 transition-all focus:border-whispr-coral focus:outline-none focus:ring-2 focus:ring-whispr-coral/25"
            />
          </div>

          {error && (
            <p className="rounded-md bg-whispr-burgundy/10 px-3 py-2 font-body text-sm text-whispr-burgundy">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-full bg-whispr-coral py-3.5 font-body text-sm font-semibold uppercase tracking-wider text-white shadow-sm transition-colors duration-200 hover:bg-whispr-crimson disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? "Saving…" : "Reset Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
