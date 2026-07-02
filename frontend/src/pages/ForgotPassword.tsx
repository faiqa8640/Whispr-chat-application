import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { gql } from "../lib/gqlClient";
import { FORGOT_PASSWORD_MUTATION } from "../lib/mutations";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [googleNotice, setGoogleNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setGoogleNotice("");

    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }

    setIsSubmitting(true);
    try {
      const data = await gql<{ forgotPassword: { success: boolean; message: string } }>(
        FORGOT_PASSWORD_MUTATION,
        { email }
      );

      if (data.forgotPassword.success) {
        setSuccess(data.forgotPassword.message);
      } else {
        // Currently the only case the backend returns success:false for is a
        // Google-signup email — surface it as a distinct notice, not an error.
        setGoogleNotice(data.forgotPassword.message);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-88px)] items-center justify-center bg-whispr-snow px-6 py-16">
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
          Forgot password?
        </h1>
        <p className="mt-2 font-body text-sm text-whispr-mauve">
          Enter the email linked to your account and we'll send you a reset link.
        </p>

        {success ? (
          <div className="mt-8 rounded-md bg-green-50 px-4 py-4 font-body text-sm text-green-700">
            {success}
            <p className="mt-3">
              <Link to="/login" className="font-semibold text-whispr-coral hover:text-whispr-crimson">
                ← Back to login
              </Link>
            </p>
          </div>
        ) : googleNotice ? (
          <div className="mt-8 rounded-md border border-whispr-coral/30 bg-whispr-petal/25 px-4 py-4 font-body text-sm text-whispr-noir">
            <div className="flex items-start gap-2.5">
              <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 flex-shrink-0" xmlns="http://www.w3.org/2000/svg">
                <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/>
                <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/>
                <path fill="#FBBC05" d="M5.27 14.28A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.37-2.28V6.63H1.29A11.98 11.98 0 0 0 0 12c0 1.94.46 3.77 1.29 5.37l3.98-3.09z"/>
                <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.6 4.58 1.79l3.43-3.43C17.94 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.63l3.98 3.09C6.22 6.88 8.87 4.77 12 4.77z"/>
              </svg>
              <p>{googleNotice}</p>
            </div>
            <Link
              to="/login"
              className="mt-3 inline-block font-semibold text-whispr-coral hover:text-whispr-crimson"
            >
              ← Back to login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label htmlFor="email" className="mb-1.5 block font-body text-[11px] font-semibold uppercase tracking-wider text-whispr-mauve">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
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
              {isSubmitting ? "Sending…" : "Send Reset Link"}
            </button>

            <p className="text-center font-body text-sm text-whispr-mauve">
              <Link to="/login" className="text-whispr-mauve hover:text-whispr-coral">
                ← Back to login
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
