"use client";

import { useEffect, useRef } from "react";

const PARTICLE_COUNT = 300;
const DOT_COLOR = "#16a34a";
const DOT_RADIUS = 2.2;
const FOLLOW_LERP = 0.025; // slow, dreamy trailing
const SUCK_LERP = 0.09; // smooth in/out
const VANISH_RADIUS = 70; // fade out within this distance of the cursor

type Particle = {
  x: number;
  y: number;
  z: number;
  phase: number;
  wobble: number;
  stagger: number; // per-particle stream delay, deterministic
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
 * ~300 identical solid-green dots on a slowly rotating, breathing 3D sphere,
 * projected to 2D on a transparent canvas over the light page surface.
 * The orb trails the cursor; hovering any button/link sucks every dot
 * into the mouse, where they stream in and vanish.
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

    // Animated state (mutated per frame, never triggers React renders).
    let cx = 0;
    let cy = 0;
    let mouseX = 0;
    let mouseY = 0;
    let mouseInWindow = false;
    let hoveringControl = false;
    let suck = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (cx === 0 && cy === 0) {
        cx = w / 2;
        cy = h / 2;
      }
      mouseX = w / 2;
      mouseY = h / 2;
    };
    resize();
    window.addEventListener("resize", resize);

    const onMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      mouseInWindow = true;
    };
    const onMouseLeaveWindow = () => {
      mouseInWindow = false;
    };
    const closestControl = (target: EventTarget | null): boolean => {
      const el = target as HTMLElement | null;
      return !!el && typeof el.closest === "function" && !!el.closest("button, a");
    };
    const onMouseOver = (e: MouseEvent) => {
      hoveringControl = closestControl(e.target);
    };
    const onMouseOut = (e: MouseEvent) => {
      hoveringControl = closestControl(e.relatedTarget);
    };
    window.addEventListener("mousemove", onMouseMove);
    document.documentElement.addEventListener("mouseleave", onMouseLeaveWindow);
    document.addEventListener("mouseover", onMouseOver);
    document.addEventListener("mouseout", onMouseOut);

    const particles: Particle[] = fibonacciSphere(PARTICLE_COUNT).map(([x, y, z], i) => ({
      x,
      y,
      z,
      phase: hash01(i, 13) * Math.PI * 2,
      wobble: 0.75 + hash01(i, 29) * 0.5,
      stagger: hash01(i, 41),
    }));

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);

      // Ease the orb center toward the cursor; drift home when it leaves.
      const tx = mouseInWindow ? mouseX : w / 2;
      const ty = mouseInWindow ? mouseY : h / 2;
      cx += (tx - cx) * FOLLOW_LERP;
      cy += (ty - cy) * FOLLOW_LERP;

      // Ease the suck factor in/out — no popping.
      suck += ((hoveringControl ? 1 : 0) - suck) * SUCK_LERP;

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

      ctx.fillStyle = DOT_COLOR;

      for (const p of particles) {
        const wob = 1 + 0.045 * Math.sin((t / 3800) * p.wobble + p.phase);
        const x = p.x * wob;
        const y = p.y * wob;
        const z = p.z * wob;
        // Rotate around Y, then X; project to 2D.
        const x1 = x * cosY + z * sinY;
        const z1 = -x * sinY + z * cosY;
        const y1 = y * cosX - z1 * sinX;
        const z2 = y * sinX + z1 * cosX;
        const s = focal / (focal + z2 * R);
        const sx = cx + x1 * R * s;
        const sy = cy + y1 * R * s;

        // Suck-in: stream toward the cursor with accelerating ease,
        // staggered per particle; vanish as they arrive.
        const si = Math.min(1, Math.max(0, suck * 1.25 - p.stagger * 0.25));
        const ease = si * si * si;
        const px = sx + (mouseX - sx) * ease;
        const py = sy + (mouseY - sy) * ease;
        const d = Math.hypot(px - mouseX, py - mouseY);
        const alpha = 1 - si * (1 - Math.min(1, d / VANISH_RADIUS));

        if (alpha <= 0.01) continue;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(px, py, DOT_RADIUS, 0, Math.PI * 2);
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
      window.removeEventListener("mousemove", onMouseMove);
      document.documentElement.removeEventListener("mouseleave", onMouseLeaveWindow);
      document.removeEventListener("mouseover", onMouseOver);
      document.removeEventListener("mouseout", onMouseOut);
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
