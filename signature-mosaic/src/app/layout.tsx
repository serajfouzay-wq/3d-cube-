import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Signature Mosaic — build the 26",
  description:
    "Sign the wall and watch hundreds of signatures arrange themselves into a giant 26. Plus: turn a doodle into a photoreal image.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <div className="aurora min-h-screen">
          <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
            <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-cyan-400 to-violet-500 text-sm font-black text-slate-950">
                26
              </span>
              Signature Mosaic
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <Link
                href="/"
                className="rounded-lg px-3 py-1.5 text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                The Wall
              </Link>
              <Link
                href="/sketch"
                className="rounded-lg px-3 py-1.5 text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                Sketch to Life
              </Link>
            </nav>
          </header>
          {children}
          <footer className="mx-auto max-w-6xl px-5 py-10 text-xs text-white/30">
            Built with Next.js · HTML5 Canvas · hexagonal lattice sampling + farthest-point ordering
          </footer>
        </div>
      </body>
    </html>
  );
}
