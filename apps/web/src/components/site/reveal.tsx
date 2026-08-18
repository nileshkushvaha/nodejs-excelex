"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Fades a section in the first time it is scrolled to, and never again.
 *
 * The observer does the work — the browser handles it off the main thread, and
 * a marketing page has a dozen of these. It disconnects on the first hit,
 * because a section that re-animates every time it passes the viewport is a
 * section nobody can read.
 *
 * There is a scroll fallback behind it doing the same geometry check by hand.
 * That is not belt-and-braces for its own sake: this component's failure mode
 * is invisible content, which is the worst thing a page can do, and an
 * observer that never fires — a tab rendered while hidden, an engine quirk,
 * anything — would leave the whole page blank. Verified the hard way: a
 * screenshot of this site in a backgrounded pane is an empty column.
 *
 * It also starts visible and is hidden by an effect, so a reader whose
 * JavaScript has not run sees the content rather than nothing.
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

    const near = () => node.getBoundingClientRect().top < window.innerHeight * 0.9;

    // Already on screen at load: leave it alone rather than fading in content
    // the reader is looking at.
    if (near()) return;

    setShown(false);

    let live = true;
    const reveal = () => {
      if (!live) return;
      live = false;
      setShown(true);
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };

    function onScroll() {
      if (near()) reveal();
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) reveal();
      },
      { rootMargin: "0px 0px -10% 0px" },
    );

    observer.observe(node);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      live = false;
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
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
