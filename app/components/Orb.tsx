"use client";

import { useEffect, useRef } from "react";

const PARTICLE_COUNT = 300;
const COLORS = ["#16a34a", "#15803d", "#22c55e", "#16a34a", "#4ade80", "#15803d"];

type Particle = {
  x: number;
  y: number;
  z: number;
  color: string;
  size: number;
  phase: number;
  wobble: number;
};

/** Evenly distribute points on a unit sphere. */
function fibonacciSphere(n: number): Array<[number, number, number]> {
  const pts: Array<[number, number, number]> = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    pts.push([Math.cos(theta) * r, y, Math.sin(theta) * r]);
  }
  return pts;
}

// Deterministic pseudo-random from index (no hydration-sensitive Math.random).
function hash01(i: number, salt: number): number {
  let h = (i + 1) * 2654435761 + salt * 40503;
  h ^= h >>> 15;
  h = (h * 2246822519) >>> 0;
  return (h % 1000) / 1000;
}

/**
 * Fixed full-viewport backdrop: an orb made of many orbs.
 * ~300 glowing green dots on a slowly rotating, breathing 3D sphere,
 * projected to 2D on a transparent canvas over the light page surface.
 * The page's single focal moment — everything else stays still.
 */
export default function Orb() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let w = 0;
    let h = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const particles: Particle[] = fibonacciSphere(PARTICLE_COUNT).map(([x, y, z], i) => ({
      x,
      y,
      z,
      color: COLORS[i % COLORS.length],
      size: 1.6 + hash01(i, 7) * 2.2,
      phase: hash01(i, 13) * Math.PI * 2,
      wobble: 0.75 + hash01(i, 29) * 0.5,
    }));

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const baseR = Math.min(w, h) * 0.3;
      // Breathing: layered slow sines (~5s and ~7.3s periods). Never jittery.
      const breathe =
        1 +
        0.055 * Math.sin((t / 5000) * Math.PI * 2) +
        0.028 * Math.sin((t / 7300) * Math.PI * 2 + 1.7);
      const R = baseR * breathe;

      // Very slow rotation.
      const rotY = (t / 26000) * Math.PI * 2;
      const rotX = 0.35 + 0.08 * Math.sin((t / 11000) * Math.PI * 2);
      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);
      const cosX = Math.cos(rotX);
      const sinX = Math.sin(rotX);
      const focal = R * 3.4;

      // Faint luminous wash behind the orb so it glows on the light surface.
      const wash = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.9);
      wash.addColorStop(0, "rgba(240,253,244,0.55)");
      wash.addColorStop(1, "rgba(240,253,244,0)");
      ctx.fillStyle = wash;
      ctx.fillRect(cx - R * 1.9, cy - R * 1.9, R * 3.8, R * 3.8);

      // Project, then paint far → near.
      const projected = particles.map((p) => {
        const wob = 1 + 0.045 * Math.sin((t / 3800) * p.wobble + p.phase);
        const x = p.x * wob;
        const y = p.y * wob;
        const z = p.z * wob;
        // Rotate around Y, then X.
        const x1 = x * cosY + z * sinY;
        const z1 = -x * sinY + z * cosY;
        const y1 = y * cosX - z1 * sinX;
        const z2 = y * sinX + z1 * cosX;
        const s = focal / (focal + z2 * R);
        return {
          px: cx + x1 * R * s,
          py: cy + y1 * R * s,
          pr: Math.max(0.4, p.size * s),
          alpha: 0.22 + 0.68 * ((z2 + 1) / 2),
          color: p.color,
        };
      });
      projected.sort((a, b) => a.alpha - b.alpha);

      for (const d of projected) {
        // Soft halo (cheap: one extra low-alpha arc, no shadowBlur).
        ctx.globalAlpha = d.alpha * 0.32;
        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.arc(d.px, d.py, d.pr * 3.1, 0, Math.PI * 2);
        ctx.fill();
        // Core dot.
        ctx.globalAlpha = d.alpha;
        ctx.beginPath();
        ctx.arc(d.px, d.py, d.pr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    if (reducedMotion) {
      draw(1200); // One static frame, no animation.
    } else {
      const start = performance.now();
      const loop = (now: number) => {
        if (!document.hidden) draw(now - start);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0"
    />
  );
}
