"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "excelex.theme";

/**
 * Runs before the first paint, in the document head.
 *
 * Without it the server sends light markup, React hydrates, and only then does
 * the stored preference apply — so a dark-mode user gets a white flash on every
 * navigation. It has to be inline and synchronous for the same reason: anything
 * deferred is by definition after the paint it is meant to precede.
 *
 * The OS preference is the fallback, not the authority. An explicit choice in
 * the header outranks it, which is the whole point of having the toggle.
 */
export const THEME_SCRIPT = `(function(){try{
var stored=localStorage.getItem(${JSON.stringify(STORAGE_KEY)});
var dark=stored?stored==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;
if(dark)document.documentElement.classList.add("dark");
}catch(e){}})();`;

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({ theme: "light", toggle: () => {} });

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Starts light and corrects on mount. Reading localStorage during render would
  // make the first client render disagree with the server's HTML; the inline
  // script above has already applied the real theme to the document by then, so
  // nothing visible depends on this initial value.
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  const toggle = useCallback(() => {
    setTheme((previous) => {
      const next: Theme = previous === "dark" ? "light" : "dark";
      document.documentElement.classList.toggle("dark", next === "dark");
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Private browsing can refuse storage. The theme still applies for this
        // page; only remembering it fails, which is not worth an error.
      }
      return next;
    });
  }, []);

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      title={theme === "dark" ? "Light theme" : "Dark theme"}
      className="grid h-9 w-9 place-items-center rounded-full border border-line text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
    >
      {theme === "dark" ? (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-4 w-4">
          <path d="M12 17a5 5 0 100-10 5 5 0 000 10zm0 2.5a1 1 0 011 1V22a1 1 0 11-2 0v-1.5a1 1 0 011-1zm0-19a1 1 0 011 1V3a1 1 0 11-2 0V1.5a1 1 0 011-1zM20.5 11H22a1 1 0 110 2h-1.5a1 1 0 110-2zM2 11h1.5a1 1 0 110 2H2a1 1 0 110-2zm15.8 6.4l1 1a1 1 0 01-1.4 1.4l-1-1a1 1 0 011.4-1.4zM5.6 5.2l1 1A1 1 0 015.2 7.6l-1-1a1 1 0 011.4-1.4zm12.2 1l1-1a1 1 0 011.4 1.4l-1 1a1 1 0 01-1.4-1.4zM5.2 16.4a1 1 0 011.4 1.4l-1 1a1 1 0 01-1.4-1.4z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-4 w-4">
          <path d="M21.6 13.3A9 9 0 1110.7 2.4a1 1 0 011.2 1.3 7 7 0 009 9 1 1 0 011.3 1.2z" />
        </svg>
      )}
    </button>
  );
}
