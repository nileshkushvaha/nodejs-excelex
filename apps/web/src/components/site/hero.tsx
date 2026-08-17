"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { SLIDES, STATS } from "@/content/site";
import { RouteArt } from "./artwork";

const INTERVAL = 6500;

/**
 * The banner. Full height, because it is the first thing anyone sees and a
 * half-screen hero with a fold through it reads as a page that ran out.
 *
 * Four layers, back to front: aurora, grid, grain, content. The content is on
 * glass so the colour behind it stays visible without ever being read through
 * text.
 *
 * It rotates and stops the moment anyone interacts — hover, focus, or the tab
 * going to the background. A carousel that keeps moving while somebody is
 * reading the third slide is why carousels have a bad name.
 */
export function Hero() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const still = useRef(false);

  useEffect(() => {
    still.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still.current) return;

    // Nothing to advance for while nobody is looking, and a timer firing in a
    // background tab is just battery.
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
      className="relative isolate flex min-h-dvh flex-col justify-center overflow-hidden"
    >
      <div aria-hidden className="aurora -z-30" />
      <div aria-hidden className="aurora-mint -z-30 bottom-[-10rem] left-[35%]" />
      <div aria-hidden className="grid-field -z-20" />
      <div aria-hidden className="grain -z-10" />

      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-5 pb-16 pt-28 lg:grid-cols-[1.1fr_0.9fr] lg:pb-24">
        <div>
          {/* Every slide is rendered and the inactive ones hidden, so the block
              keeps the height of its tallest and nothing below it jumps when
              the banner turns. */}
          <div className="relative min-h-[22rem] sm:min-h-[20rem]">
            {SLIDES.map((slide, position) => (
              <div
                key={slide.title}
                aria-hidden={position !== index}
                className={`absolute inset-0 transition-[opacity,transform] duration-700 ease-out ${
                  position === index
                    ? "translate-y-0 opacity-100"
                    : "pointer-events-none translate-y-4 opacity-0"
                }`}
              >
                <span className="glass inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium text-accent-text">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--brand-cyan)] opacity-70" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--brand-cyan)]" />
                  </span>
                  {slide.eyebrow}
                </span>

                <h1 className="headline-gradient mt-6 max-w-2xl text-[2.75rem] font-semibold leading-[1.05] tracking-tight sm:text-6xl">
                  {slide.title}
                </h1>
                <p className="mt-5 max-w-lg text-base leading-relaxed text-muted sm:text-lg">
                  {slide.body}
                </p>

                <div className="mt-9 flex flex-wrap gap-3">
                  <Link
                    href={slide.primary.href}
                    className="btn-primary rounded-xl px-6 py-3 text-sm font-medium"
                  >
                    {slide.primary.label}
                  </Link>
                  {slide.secondary ? (
                    <Link
                      href={slide.secondary.href}
                      className="btn-glass rounded-xl px-6 py-3 text-sm font-medium"
                    >
                      {slide.secondary.label}
                    </Link>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 flex items-center gap-2">
            {SLIDES.map((slide, position) => (
              <button
                key={slide.title}
                type="button"
                onClick={() => setIndex(position)}
                aria-label={`Slide ${position + 1}: ${slide.eyebrow}`}
                aria-current={position === index}
                className={`h-1.5 rounded-full transition-all duration-500 ${
                  position === index
                    ? "brand-gradient w-12"
                    : "w-5 bg-line-strong hover:bg-[var(--brand-cyan)]"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="relative hidden lg:block">
          <RouteArt className="animate-float mx-auto w-full max-w-lg" />

          {/* Two glass chips pinned to the artwork. They are the only numbers
              above the fold, and they sit on the picture rather than beside it
              so the eye does not have to leave one to reach the other. */}
          <div className="glass absolute -left-2 top-8 rounded-2xl px-4 py-3">
            <p className="text-2xl font-semibold tabular-nums text-fg">{STATS[0]?.value.toLocaleString()}+</p>
            <p className="text-xs text-muted">{STATS[0]?.label}</p>
          </div>
          <div className="glass absolute -right-2 bottom-10 rounded-2xl px-4 py-3">
            <p className="text-2xl font-semibold tabular-nums text-fg">{STATS[2]?.value}%</p>
            <p className="text-xs text-muted">{STATS[2]?.label}</p>
          </div>
        </div>
      </div>

      {/* The scroll cue. Only useful on a screen this tall, so it is hidden on
          the short ones where the next section is already visible. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-8 hidden justify-center sm:flex">
        <span className="flex h-9 w-5 items-start justify-center rounded-full border border-line-strong p-1">
          <span className="animate-float h-1.5 w-1 rounded-full bg-[var(--brand-cyan)]" />
        </span>
      </div>
    </section>
  );
}
