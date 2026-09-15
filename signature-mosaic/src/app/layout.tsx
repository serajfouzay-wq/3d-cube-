import type { Metadata } from "next";
import BackgroundFX from "@/components/BackgroundFX";
import SiteHeader from "@/components/SiteHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: "Signature Mosaic — build the 26",
  description:
    "Sign the wall and watch hundreds of signatures arrange themselves into a giant 26. Plus: turn a doodle into a photoreal image.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="grain relative min-h-screen antialiased">
        <BackgroundFX />
        <SiteHeader />
        {children}
        <footer className="mx-auto max-w-6xl px-5 pb-12 pt-6 text-xs text-white/25">
          Built with Next.js · HTML5 Canvas · hexagonal lattice sampling + farthest-point ordering
        </footer>
      </body>
    </html>
  );
}
