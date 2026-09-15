"use client";

import { useEffect, useRef } from "react";

/**
 * Adds `.in` to the element the first time it scrolls into view. Toggling a class
 * directly (rather than setState) keeps the reveal off React's render path.
 */
export function useReveal<T extends HTMLElement>(threshold = 0.12) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Anything already on screen at mount should not wait for a scroll event.
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        }
      },
      { threshold, rootMargin: "0px 0px -40px 0px" },
    );

    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);

  return ref;
}
