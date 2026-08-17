"use client";

import { useEffect, useRef, useState } from "react";

import { STATS } from "@/content/site";

/**
 * The numbers, counted up the first time they are scrolled to.
 *
 * The count is the point: a number that lands already finished reads as
 * decoration, and one that ticks up is read. It runs once, off
 * requestAnimationFrame rather than a timer, so it stays with the refresh rate
 * instead of fighting it — and it starts at the final value, so reduced motion
 * and a failed observer both leave the correct figure on screen.
 */
export function Stats() {
  const ref = useRef<HTMLDivElement>(null);
  const [run, setRun] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          setRun(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -15% 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
      {STATS.map((stat) => (
        <div key={stat.label} className="text-center sm:text-left">
          <p className="brand-text text-4xl font-semibold tabular-nums tracking-tight">
            <Counter to={stat.value} run={run} />
            {stat.suffix}
          </p>
          <p className="mt-1 text-sm text-muted">{stat.label}</p>
        </div>
      ))}
    </div>
  );
}

function Counter({ to, run }: { to: number; run: boolean }) {
  const [value, setValue] = useState(to);

  useEffect(() => {
    if (!run) return;

    let frame = 0;
    const start = performance.now();
    const duration = 1200;

    function tick(now: number) {
      const progress = Math.min(1, (now - start) / duration);
      // Ease out: fast enough to register, slow enough at the end to read.
      const eased = 1 - (1 - progress) ** 3;
      setValue(to * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    }

    setValue(0);
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [run, to]);

  // Decimals are kept only where the real figure has them — "99.2%" means
  // something 99% does not, and "1715.0" means nothing at all.
  const decimals = Number.isInteger(to) ? 0 : 1;
  return <>{value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</>;
}
