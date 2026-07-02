import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { gql } from "../lib/gqlClient";
import { ME_QUERY, LOGOUT_MUTATION } from "../lib/mutations";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  provider: "local" | "google";
  avatar: string | null;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  /** true while the initial /me check is in-flight */
  loading: boolean;
  setUser: (user: AuthUser | null) => void;//SET THE CURRENT USER
  logout: () => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * On mount, try to restore the session from the httpOnly cookie.
   * If the cookie is present and valid the backend returns the user;
   * if not (expired / absent) it returns null — either way we set
   * loading = false so the rest of the app can render.
   */
  useEffect(() => {
    (async () => {
      try {
        const data = await gql<{ me: AuthUser | null }>(ME_QUERY);
        setUser(data.me ?? null);
      } catch {
        // No valid session — that's fine, user just isn't logged in
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const logout = useCallback(async () => {
    try {
      await gql(LOGOUT_MUTATION);
    } finally {
      // Always clear local state even if the network call fails
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, setUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
}