"use client";

import { useEffect, useRef } from "react";

const PARTICLE_COUNT = 350;
const DOT_COLOR = "#16a34a";
const DASH_LEN = 5; // fixed for every particle — "same size" is the rule
const DASH_HALF = DASH_LEN / 2;
const DASH_W_NEAR = 3; // stroke width at the cursor
const DASH_W_FAR = 1.5; // stroke width far from the cursor
const FOLLOW_LERP = 0.025; // slow, dreamy trailing
const SUCK_IN_LERP = 0.12; // quick grab when hovering a control
const SUCK_OUT_LERP = 0.028; // long gentle release (~0.6s ease-out), no snap
const VANISH_RADIUS = 70; // fade out within this distance of the cursor

type Particle = {
  x: number;
  y: number;
  z: number;
  phase: number;
  wobble: number;
  stagger: number; // per-particle stream delay, deterministic
  drift: number; // radial dispersal amount, deterministic
  swirl: number; // per-particle swirl direction, deterministic
  tanX: number;
  tanY: number;
  tanZ: number;
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
 * Fixed full-viewport backdrop: an Antigravity-style breathing point-cloud sphere.
 * ~350 identical solid-green dashes on a slowly rotating 3D sphere, projected to 2D
 * on a transparent canvas over the light page surface. Every dash faces the way
 * it orbits — tangential to the sphere, always to the side like the rotation.
 * The signature motion is a slow gather/disperse loop: tight dense shell <->
 * wide drifting cloud. The orb trails the cursor; hovering any button/link sucks
 * every dash into the mouse, where they stream in and vanish.
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

    // Tangent orientation state: dirs holds each dash's last known unit
    // tangent direction (deterministic hash fallback for degenerate cases).
    const dirs = new Float32Array(PARTICLE_COUNT * 2);

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
      drift: 0.55 + hash01(i, 47) * 0.5,
      swirl: hash01(i, 97) * 2 - 1,
      tanX: hash01(i, 51) * 2 - 1,
      tanY: hash01(i, 67) * 2 - 1,
      tanZ: hash01(i, 83) * 2 - 1,
    }));

    // Deterministic fallback dash directions (used before velocity exists).
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const a = hash01(i, 101) * Math.PI * 2;
      dirs[i * 2] = Math.cos(a);
      dirs[i * 2 + 1] = Math.sin(a);
    }

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);

      // Ease the orb center toward the cursor; drift home when it leaves.
      const tx = mouseInWindow ? mouseX : w / 2;
      const ty = mouseInWindow ? mouseY : h / 2;
      cx += (tx - cx) * FOLLOW_LERP;
      cy += (ty - cy) * FOLLOW_LERP;

      // Ease the suck factor: fast grab on hover, long gentle ease-out on
      // release. Snap exactly to 0 at the tail so there's no endless drift.
      const suckTarget = hoveringControl ? 1 : 0;
      const suckLerp = suckTarget > suck ? SUCK_IN_LERP : SUCK_OUT_LERP;
      suck += (suckTarget - suck) * suckLerp;
      if (!hoveringControl && suck < 0.002) suck = 0;

      // Large and centered: diameter ~70% of the smaller viewport dimension.
      const baseR = Math.min(w, h) * 0.35;

      // The Antigravity signature: slow gather/disperse loop.
      // 0 = tight dense shell, 1 = wide drifting cloud. ~11s loop, shaped
      // to linger in the tight state and bloom outward gracefully.
      const dcycle = (t / 11000) * Math.PI * 2 - Math.PI / 2;
      let disperse = 0.5 + 0.5 * Math.sin(dcycle);
      disperse = Math.pow(disperse, 1.6);

      // Subtle breathing on top of the dispersal (~5s and ~7.3s periods).
      const breathe =
        1 +
        0.05 * Math.sin((t / 5000) * Math.PI * 2) +
        0.025 * Math.sin((t / 7300) * Math.PI * 2 + 1.7);
      const R = baseR * breathe;

      // Very slow rotation underneath.
      const rotY = (t / 26000) * Math.PI * 2;
      const rotX = 0.35 + 0.08 * Math.sin((t / 11000) * Math.PI * 2);
      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);
      const cosX = Math.cos(rotX);
      const sinX = Math.sin(rotX);
      const focal = R * 3.4;

      ctx.strokeStyle = DOT_COLOR;
      ctx.lineCap = "round";
      const diag = Math.hypot(w, h); // width falloff normalizer

      for (let pi = 0; pi < particles.length; pi++) {
        const p = particles[pi];
        // Swirl: extra Y-rotation proportional to dispersal (cloud swirl).
        const sw = disperse * p.swirl * 0.9;
        const csw = Math.cos(sw);
        const ssw = Math.sin(sw);
        const xw = p.x * csw + p.z * ssw;
        const zw = -p.x * ssw + p.z * csw;

        // Radial expansion + tangential scatter: tight shell -> drifting cloud.
        const rad = 1 + disperse * p.drift;
        let x = (xw + p.tanX * disperse * 0.45) * rad;
        let y = (p.y + p.tanY * disperse * 0.45) * rad;
        let z = (zw + p.tanZ * disperse * 0.45) * rad;

        // Subtle per-particle wobble. Never jittery.
        const wob = 1 + 0.045 * Math.sin((t / 3800) * p.wobble + p.phase);
        x *= wob;
        y *= wob;
        z *= wob;

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

        // Tangential orientation: every dash faces the way it orbits —
        // always to the side, perpendicular to its radial vector, in the
        // rotation direction. The tangent of Y-rotation at (x, y, z) is
        // (z, 0, -x); rotate it through the same rotY -> rotX chain as the
        // positions and take the 2D direction. Fixed length — never scaled.
        let dx = z * cosY - x * sinY;
        let dy = (z * sinY + x * cosY) * sinX;
        const tmag = Math.hypot(dx, dy);
        if (tmag > 0.0001) {
          dx /= tmag;
          dy /= tmag;
          dirs[pi * 2] = dx;
          dirs[pi * 2 + 1] = dy;
        } else {
          dx = dirs[pi * 2];
          dy = dirs[pi * 2 + 1];
        }

        ctx.globalAlpha = alpha;
        // Stroke width falls off smoothly with cursor distance:
        // ~3px near the mouse, ~1.5px far away. Length stays uniform.
        const wt = Math.min(1, d / diag);
        ctx.lineWidth = DASH_W_FAR + (DASH_W_NEAR - DASH_W_FAR) * (1 - wt) * (1 - wt);
        ctx.beginPath();
        ctx.moveTo(px - dx * DASH_HALF, py - dy * DASH_HALF);
        ctx.lineTo(px + dx * DASH_HALF, py + dy * DASH_HALF);
        ctx.stroke();
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
