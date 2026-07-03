import { useState, type FormEvent, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthBrandPanel from "../components/brand/AuthBrandPanel";
import { gql } from "../lib/gqlClient";
import { LOGIN_MUTATION, GOOGLE_AUTH_MUTATION } from "../lib/mutations";
import { useAuth, type AuthUser } from "../context/AuthContext";

/* global google */
declare const google: {
  accounts: {
    id: {
      initialize: (cfg: { client_id: string; callback: (r: { credential: string }) => void }) => void;
      renderButton: (el: HTMLElement, cfg: object) => void;
    };
  };
};

// Module-level guard: React 19 StrictMode double-invokes effects in dev,
// which would otherwise call google.accounts.id.initialize() twice and
// trigger Google's "initialize() called multiple times" console warning.
let googleInitialized = false;

export default function Login() {
  const navigate = useNavigate();
  const { setUser } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [googleUnavailable, setGoogleUnavailable] = useState(false);

  // ── Google One-Tap / button ─────────────────────────────────────────────────
  useEffect(() => {
    const rawClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;// GET THE CLIENT ID
    if (!rawClientId) {
      // No client ID configured — nothing to do, button section won't render usefully
      return;
    }
    // Re-bind to a const TypeScript knows is definitely a string,
    // since the nested function below can't narrow the outer variable.
    const clientId: string = rawClientId; ///THIS IS FOR THE TYPE SCRIPT

    let cancelled = false;
    let attempts = 0;//Google's script might not load instantly. SO THE GOOGLE REPEATLY CHECK IS THE GOOGLE AVAIABLE?
    const MAX_ATTEMPTS = 50; // ~5s at 100ms intervals
    // This function tries to initialize Google.
    function tryInit() {
      if (cancelled) return;

      if (typeof google === "undefined" || !google?.accounts?.id) {
        attempts += 1;
        if (attempts >= MAX_ATTEMPTS) {
          // Script never loaded (blocked, offline, ad-blocker, etc.)
          setGoogleUnavailable(true);
          return;
        }
        setTimeout(tryInit, 100);
        return;
      }

      // Only call initialize() once per page load, even if this effect
      // runs twice (StrictMode) or the component remounts.
      if (!googleInitialized) {
        google.accounts.id.initialize({
          client_id: clientId,
          callback: handleGoogleCredential,
        });
        googleInitialized = true;
      }

      // GOOGLE GENARTE THE BUTTON INSTEAD OF DEISGINING IT YOURSELF 
      const btn = document.getElementById("google-signin-btn");
      if (btn) {
        // Clear out any previous render (StrictMode double-invoke safety)
        btn.innerHTML = "";
        google.accounts.id.renderButton(btn, {
          theme: "outline",
          size: "large",
          width: btn.offsetWidth || 320,
        });
      }
    }

    tryInit();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleGoogleCredential(response: { credential: string }) {
    setError("");
    setIsSubmitting(true);
    try {
      const data = await gql<{ googleAuth: { user: AuthUser; message: string } }>(
        GOOGLE_AUTH_MUTATION,
        { idToken: response.credential }/// GOGLE TOKEN ID WILL BE THE RESPONESE
      );
      setUser(data.googleAuth.user);
      // navigate("/");
      navigate("/inbox")
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Google sign-in failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  // ── Email / password login ──────────────────────────────────────────────────
  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Please fill in both fields to continue.");
      return;
    }

    setIsSubmitting(true);
    try {
      const data = await gql<{ login: { user: AuthUser; message: string } }>(
        LOGIN_MUTATION,
        { email, password }
      );
      setUser(data.login.user);
      navigate("/");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Login failed.";
      // Backend sends this specific prefix when email isn't verified
      if (msg.startsWith("EMAIL_NOT_VERIFIED")) {
        navigate(`/verify-otp?email=${encodeURIComponent(email)}`);
      } else {
        setError(msg);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex h-screen bg-whispr-snow">
      <AuthBrandPanel
        quote="Every conversation starts with a single whisper."
        body="Welcome back — your messages, contacts, and conversations are waiting for you."
      />

      {/* Right — form panel */}
      <div className="flex w-full flex-col items-center justify-center overflow-y-auto px-6 py-16 lg:w-1/2">
        <div className="mx-auto w-full max-w-sm">
          <Link to="/" className="mb-10 flex flex-col items-center lg:hidden">
            <span className="font-display text-3xl font-semibold tracking-widest2 text-whispr-noir">
              WHISPR
            </span>
          </Link>

          <h1 className="font-display text-[34px] font-semibold leading-tight text-whispr-noir">
            Welcome back
          </h1>
          <p className="mt-2 font-body text-sm text-whispr-mauve">
            Log in to continue your chatting journey.
          </p>

          <form onSubmit={handleSubmit} className="mt-9 space-y-5">
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block font-body text-[11px] font-semibold uppercase tracking-wider text-whispr-mauve"
              >
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
              <div className="mb-1.5 flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="block font-body text-[11px] font-semibold uppercase tracking-wider text-whispr-mauve"
                >
                  Password
                </label>
                <Link
                  to="/forgot-password"
                  className="font-body text-xs text-whispr-mauve transition-colors hover:text-whispr-coral"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
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
              {isSubmitting ? "Logging in…" : "Log In"}
            </button>
          </form>

          <div className="my-8 flex items-center gap-3">
            <span className="h-px flex-1 bg-whispr-rose/30" />
            <span className="font-body text-[11px] uppercase tracking-wider text-whispr-mauve/70">
              or continue with
            </span>
            <span className="h-px flex-1 bg-whispr-rose/30" />
          </div>

          {/* Google renders its own button here */}
          <div id="google-signin-btn" className="flex w-full justify-center" />
          {googleUnavailable && (
            <p className="mt-2 text-center font-body text-xs text-whispr-mauve/70">
              Google Sign-In couldn't load. Check your connection and refresh.
            </p>
          )}

          <p className="mt-9 text-center font-body text-sm text-whispr-mauve">
            New to Whispr?{" "}
            <Link
              to="/signup"
              className="font-semibold text-whispr-coral transition-colors hover:text-whispr-crimson"
            >
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
