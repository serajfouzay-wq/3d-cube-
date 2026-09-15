"use client";

import { useEffect, useRef } from "react";

/**
 * Counts up to `value` by writing straight to the DOM node — no per-frame
 * re-render, and the server-rendered markup already holds the final number.
 */
export default function AnimatedNumber({
  value,
  className,
  duration = 750,
}: {
  value: number;
  className?: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const fromRef = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const from = fromRef.current;
    const to = value;
    if (from === to) return;

    const start = performance.now();
    let raf = 0;

    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - (1 - p) ** 3;
      el.textContent = Math.round(from + (to - from) * eased).toLocaleString();
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return (
    <span ref={ref} className={className}>
      {value.toLocaleString()}
    </span>
  );
}
