// ═══════════════════════════════════════════════════════════════
// CinematicBackground.jsx
// ═══════════════════════════════════════════════════════════════
//
// Drop this into your React project (works with CRA or Vite).
// Usage:
//   import CinematicBackground from './CinematicBackground';
//   
//   function App() {
//     return (
//       <>
//         <CinematicBackground accentColor="#00ff88" secondaryColor="#0d2a2a" />
//         <YourContent />
//       </>
//     );
//   }
//
// If you want the exact same GSAP animation as Heal Code, run:
//   npm install gsap
// Otherwise this version uses CSS animations (no library needed).
// ═══════════════════════════════════════════════════════════════

import React, { useEffect, useRef } from 'react';

export default function CinematicBackground({
  secondaryColor = '#0d2a2a',
  accentColor = '#00ff88',
}) {

  // Helper: convert hex to rgba string with alpha
  const rgba = (hex, alpha) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  };

  const accent10 = rgba(accentColor, 0.10);
  const accent15 = rgba(accentColor, 0.15);
  const accent20 = rgba(accentColor, 0.20);
  const accent30 = rgba(accentColor, 0.30);

  return (
    <>
      {/* Inject the keyframes into the page once */}
      <style>{`
        @keyframes cb-drift-1 {
          from { transform: translate(0, 0); }
          to   { transform: translate(30px, -20px); }
        }
        @keyframes cb-drift-2 {
          from { transform: translate(0, 0); }
          to   { transform: translate(-25px, 15px); }
        }
        @keyframes cb-drift-3 {
          from { transform: translate(0, 0); }
          to   { transform: translate(20px, 25px); }
        }
        @keyframes cb-sweep {
          from { transform: translateX(-100vw); }
          to   { transform: translateX(100vw); }
        }
        @keyframes cb-scan1 {
          0%, 100% { opacity: 0; transform: translateY(0); }
          50%      { opacity: 1; transform: translateY(10px); }
        }
        @keyframes cb-scan2 {
          0%, 100% { opacity: 0;   transform: translateY(0); }
          50%      { opacity: 0.8; transform: translateY(-10px); }
        }
      `}</style>

      <div style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        zIndex: 0,
        backgroundColor: '#050a0a',
      }}>

        {/* Orb 1 — top-left */}
        <div style={{
          position: 'absolute',
          width: '80vw', height: '80vw',
          left: '-20vw', top: '-20vw',
          background: `radial-gradient(ellipse at center, ${secondaryColor} 0%, transparent 60%)`,
          opacity: 0.6,
          filter: 'blur(80px)',
          transform: 'translateZ(0)',
          animation: 'cb-drift-1 8s ease-in-out infinite alternate',
        }} />

        {/* Orb 2 — bottom-right */}
        <div style={{
          position: 'absolute',
          width: '60vw', height: '60vw',
          right: '-10vw', bottom: '-10vw',
          background: 'radial-gradient(ellipse at center, rgba(0,100,100,0.4) 0%, transparent 55%)',
          opacity: 0.5,
          filter: 'blur(100px)',
          transform: 'translateZ(0)',
          animation: 'cb-drift-2 10s ease-in-out infinite alternate',
        }} />

        {/* Orb 3 — center accent */}
        <div style={{
          position: 'absolute',
          width: '40vw', height: '40vw',
          left: '30vw', top: '40vh',
          background: `radial-gradient(ellipse at center, ${accent20} 0%, transparent 50%)`,
          opacity: 0.3,
          filter: 'blur(120px)',
          transform: 'translateZ(0)',
          animation: 'cb-drift-3 12s ease-in-out infinite alternate',
        }} />

        {/* Vertical scan line */}
        <div style={{
          position: 'absolute',
          top: 0,
          width: '2px',
          height: '100%',
          background: `linear-gradient(180deg, transparent 0%, ${accent30} 50%, transparent 100%)`,
          boxShadow: `0 0 60px 20px ${accent20}, 0 0 100px 40px ${accent10}`,
          animation: 'cb-sweep 4s linear infinite',
        }} />

        {/* Horizontal scan beam 1 */}
        <div style={{
          position: 'absolute',
          top: '25%', left: 0, right: 0,
          height: '1px',
          background: `linear-gradient(90deg, transparent 0%, ${accent15} 50%, transparent 100%)`,
          animation: 'cb-scan1 6s ease-in-out infinite',
        }} />

        {/* Horizontal scan beam 2 */}
        <div style={{
          position: 'absolute',
          top: '66%', left: 0, right: 0,
          height: '1px',
          background: `linear-gradient(90deg, transparent 0%, ${accent10} 50%, transparent 100%)`,
          animation: 'cb-scan2 8s ease-in-out infinite',
        }} />

        {/* SVG noise texture (film grain) */}
        <svg
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%', height: '100%',
            opacity: 0.03,
            mixBlendMode: 'overlay',
            pointerEvents: 'none',
          }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <filter id="cb-noise">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.8"
              numOctaves="4"
              stitchTiles="stitch"
            />
          </filter>
          <rect width="100%" height="100%" filter="url(#cb-noise)" />
        </svg>

        {/* Vignette (dark edges) */}
        <div style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: 'radial-gradient(ellipse at center, transparent 0%, transparent 40%, rgba(0,0,0,0.4) 100%)',
        }} />

        {/* Bottom fade */}
        <div style={{
          position: 'absolute',
          left: 0, right: 0, bottom: 0,
          height: '33%',
          pointerEvents: 'none',
          background: 'linear-gradient(to top, rgba(5,10,10,0.8) 0%, transparent 100%)',
        }} />

      </div>
    </>
  );
}