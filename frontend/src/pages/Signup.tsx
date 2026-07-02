import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthBrandPanel from "../components/brand/AuthBrandPanel";
import { gql } from "../lib/gqlClient";
import { SIGNUP_MUTATION } from "../lib/mutations";

export default function Signup() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    if (!name.trim() || !email.trim() || !password) {
      setError("Please fill in all fields to continue.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    if (!agreed) {
      setError("Please agree to the Terms and Privacy Policy.");
      return;
    }

    setIsSubmitting(true);
    try {
      await gql<{ signup: { success: boolean; message: string } }>(
        SIGNUP_MUTATION,
        { name, email, password }
      );
      // Redirect to OTP page, carry email so the user doesn't retype it
      navigate(`/verify-otp?email=${encodeURIComponent(email)}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Signup failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-88px)] bg-whispr-snow">
      <AuthBrandPanel
        quote="Say less. Mean more."
        body="Join Whispr and start conversations that actually matter."
      />

      {/* Right — form panel */}
      <div className="flex w-full flex-col items-center justify-center px-6 py-14 lg:w-1/2">
        <div className="mx-auto w-full max-w-sm">
          <Link to="/" className="mb-7 flex flex-col items-center lg:hidden">
            <span className="font-display text-3xl font-semibold tracking-widest2 text-whispr-noir">
              WHISPR
            </span>
          </Link>

          <h1 className="font-display text-[34px] font-semibold leading-tight text-whispr-noir">
            Create your account
          </h1>
          <p className="mt-2 font-body text-sm text-whispr-mauve">
            Join Whispr and start chating with your loved ones.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div>
              <label htmlFor="name" className="mb-1.5 block font-body text-[11px] font-semibold uppercase tracking-wider text-whispr-mauve">
                Full Name
              </label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                className="w-full rounded-md border border-whispr-rose/40 bg-white px-4 py-3 font-body text-sm text-whispr-noir shadow-sm placeholder:text-whispr-mauve/50 transition-all focus:border-whispr-coral focus:outline-none focus:ring-2 focus:ring-whispr-coral/25"
              />
            </div>

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

            <div>
              <label htmlFor="password" className="mb-1.5 block font-body text-[11px] font-semibold uppercase tracking-wider text-whispr-mauve">
                Password
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
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-whispr-mauve transition-colors hover:text-whispr-noir"
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
              <label htmlFor="confirmPassword" className="mb-1.5 block font-body text-[11px] font-semibold uppercase tracking-wider text-whispr-mauve">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                className="w-full rounded-md border border-whispr-rose/40 bg-white px-4 py-3 font-body text-sm text-whispr-noir shadow-sm placeholder:text-whispr-mauve/50 transition-all focus:border-whispr-coral focus:outline-none focus:ring-2 focus:ring-whispr-coral/25"
              />
            </div>

            <label className="flex items-start gap-2.5 pt-1 font-body text-xs text-whispr-mauve">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-whispr-rose/50 text-whispr-coral focus:ring-whispr-coral/40"
              />
              <span>
                I agree to Whispr's{" "}
                <Link to="/terms" className="text-whispr-coral hover:text-whispr-crimson">Terms of Service</Link>{" "}
                and{" "}
                <Link to="/privacy" className="text-whispr-coral hover:text-whispr-crimson">Privacy Policy</Link>.
              </span>
            </label>

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
              {isSubmitting ? "Creating account…" : "Create Account"}
            </button>
          </form>

          <p className="mt-7 text-center font-body text-sm text-whispr-mauve">
            Already have an account?{" "}
            <Link to="/login" className="font-semibold text-whispr-coral transition-colors hover:text-whispr-crimson">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
