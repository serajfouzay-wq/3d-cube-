"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const NAV = [
  { href: "/", label: "The Wall" },
  { href: "/sketch", label: "Sketch to Life" },
];

export default function SiteHeader() {
  const barRef = useRef<HTMLElement>(null);
  const pathname = usePathname();

  /* Frost the bar once the page has scrolled past the hero. */
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const onScroll = () => el.classList.toggle("is-stuck", window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      ref={barRef}
      className="sticky top-0 z-40 border-b border-transparent transition-all duration-300 [&.is-stuck]:border-white/10 [&.is-stuck]:bg-[#04050b]/70 [&.is-stuck]:backdrop-blur-xl"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <Link href="/" className="group flex items-center gap-2.5 font-semibold tracking-tight">
          <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 text-sm font-black text-slate-950 shadow-[0_8px_26px_-10px_rgba(34,211,238,0.95)] transition-transform duration-300 group-hover:scale-105">
            26
            <span className="absolute inset-0 rounded-xl bg-cyan-300/50 opacity-0 blur-md transition-opacity duration-300 group-hover:opacity-100" />
          </span>
          <span className="transition-colors group-hover:text-cyan-200">Signature Mosaic</span>
        </Link>

        <nav className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-1 text-sm backdrop-blur-sm">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative rounded-lg px-3 py-1.5 transition-colors duration-200 ${
                  active ? "text-slate-950" : "text-white/60 hover:text-white"
                }`}
              >
                {active && (
                  <span className="absolute inset-0 rounded-lg bg-gradient-to-r from-cyan-300 to-violet-300" />
                )}
                <span className="relative">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
