"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { SLIDES } from "@/content/site";

const INTERVAL = 6500;

/**
 * The rotating banner.
 *
 * It advances on its own, and stops the moment you interact with it — hover,
 * focus, or a tab in the background. A carousel that keeps moving while
 * somebody is reading the third slide is the reason carousels have a bad name.
 * Reduced motion stops it entirely and leaves the dots to do the work.
 */
export function Hero() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const still = useRef(false);

  useEffect(() => {
    still.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still.current) return;

    // Nothing to advance for while the tab is not being looked at, and a timer
    // that fires in the background just burns a phone battery.
    function onVisibility() {
      setPaused(document.hidden);
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (paused || still.current) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % SLIDES.length);
    }, INTERVAL);
    return () => window.clearInterval(timer);
  }, [paused]);

  return (
    <section
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="ExcelEx"
      className="relative isolate overflow-hidden"
    >
      {/* The brand wash and the grid sit behind everything, at low opacity, so
          the headline stays the thing with contrast. */}
      <div aria-hidden className="brand-gradient absolute inset-0 -z-20 opacity-[0.07]" />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(ellipse at 50% 0%, #000 40%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse at 50% 0%, #000 40%, transparent 75%)",
        }}
      />

      <div className="mx-auto max-w-6xl px-5 pb-20 pt-32 sm:pt-40">
        {/* Every slide is rendered and the inactive ones are hidden, so the
            section keeps the height of its tallest and the page below does not
            jump each time it turns. */}
        <div className="relative min-h-[19rem] sm:min-h-[17rem]">
          {SLIDES.map((slide, position) => (
            <div
              key={slide.title}
              aria-hidden={position !== index}
              className={`absolute inset-0 transition-[opacity,transform] duration-700 ease-out ${
                position === index
                  ? "translate-y-0 opacity-100"
                  : "pointer-events-none translate-y-3 opacity-0"
              }`}
            >
              <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-accent-text">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-cyan)]" />
                {slide.eyebrow}
              </span>

              <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight text-fg sm:text-6xl">
                {slide.title}
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-muted">{slide.body}</p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href={slide.primary.href}
                  className="btn-primary rounded-lg px-5 py-2.5 text-sm font-medium"
                >
                  {slide.primary.label}
                </Link>
                {slide.secondary ? (
                  <Link
                    href={slide.secondary.href}
                    className="btn-secondary rounded-lg px-5 py-2.5 text-sm font-medium"
                  >
                    {slide.secondary.label}
                  </Link>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 flex items-center gap-2">
          {SLIDES.map((slide, position) => (
            <button
              key={slide.title}
              type="button"
              onClick={() => setIndex(position)}
              aria-label={`Slide ${position + 1}: ${slide.eyebrow}`}
              aria-current={position === index}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                position === index
                  ? "w-10 bg-[var(--brand-blue)]"
                  : "w-4 bg-line-strong hover:bg-[var(--brand-cyan)]"
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
