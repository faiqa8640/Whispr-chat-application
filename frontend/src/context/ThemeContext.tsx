// src/context/ThemeContext.tsx
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "whispr:theme";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

/**
 * Reads the saved preference first. If the person has never chosen one,
 * falls back to their OS-level preference so a first-time dark-mode user
 * isn't blinded by a bright screen.
 */
function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Storage unavailable (private mode, etc.) — fall through to system pref.
  }
  if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  // Toggling the `dark` class on <html> is what makes every `dark:` utility
  // class across the app take effect — this is the single source of truth.
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore — worst case the choice doesn't persist across reloads.
    }
  }, [theme]);

  function setTheme(next: Theme) {
    setThemeState(next);
  }

  function toggleTheme() {
    setThemeState((prev) => (prev === "dark" ? "light" : "dark"));
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside <ThemeProvider>");
  }
  return ctx;
}