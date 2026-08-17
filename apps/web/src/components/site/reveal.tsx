"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Fades a section in the first time it is scrolled to, and never again.
 *
 * An IntersectionObserver rather than a scroll listener: the browser does the
 * work off the main thread, and a marketing page has a dozen of these. It
 * disconnects on the first hit, because a section that re-animates every time
 * it passes the viewport is a section nobody can read.
 *
 * Starts visible and is hidden by an effect, so a reader without JavaScript —
 * or one whose JS has not run yet — sees the content rather than a blank page.
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  /** Milliseconds, for staggering a row of cards. */
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(true);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Someone who has asked for less motion gets the content, not the fade.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Already on screen at load: leave it alone rather than fading in content
    // the reader is looking at.
    if (node.getBoundingClientRect().top < window.innerHeight * 0.9) return;

    setShown(false);
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          setShown(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: shown ? `${delay}ms` : "0ms" }}
      className={`transition-[opacity,transform] duration-700 ease-out ${
        shown ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
      } ${className}`}
    >
      {children}
    </div>
  );
}
