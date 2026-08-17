"use client";

import { useEffect, useState } from "react";

/** Appears once there is enough page behind you for it to be worth having. */
export function BackToTop() {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    function onScroll() {
      setShown(window.scrollY > window.innerHeight);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      type="button"
      onClick={() =>
        window.scrollTo({
          top: 0,
          // Honours the OS setting on its own — "smooth" is ignored under
          // reduced motion rather than needing to be branched on here.
          behavior: "smooth",
        })
      }
      aria-label="Back to top"
      // Hidden from the keyboard and from screen readers while it is invisible:
      // a button nobody can see should not be the next thing Tab lands on.
      aria-hidden={!shown}
      tabIndex={shown ? 0 : -1}
      className={`btn-primary fixed bottom-6 right-6 z-40 grid h-11 w-11 place-items-center rounded-full transition-[opacity,transform] duration-300 ${
        shown ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
      }`}
    >
      <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
        <path
          fillRule="evenodd"
          d="M14.77 12.79a.75.75 0 0 1-1.06-.02L10 8.83l-3.71 3.94a.75.75 0 1 1-1.08-1.04l4.25-4.5a.75.75 0 0 1 1.08 0l4.25 4.5a.75.75 0 0 1-.02 1.06Z"
          clipRule="evenodd"
        />
      </svg>
    </button>
  );
}
