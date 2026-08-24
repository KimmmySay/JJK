/* ==========================================================================
   CORE — namespace, math, timing, seeded RNG
   Loaded first. Every other file hangs off the global `JJK` object.
   Classic script (no ES modules) so the game runs from file:// by double-click.
   ========================================================================== */

window.JJK = window.JJK || {};

(function (JJK) {
  'use strict';

  const TAU = Math.PI * 2;

  const M = {
    TAU,
    HALF_PI: Math.PI / 2,
    DEG: Math.PI / 180,

    clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; },
    lerp(a, b, t) { return a + (b - a) * t; },
    /** Frame-rate independent exponential approach. `t` is per-second rate. */
    damp(a, b, rate, dt) { return M.lerp(a, b, 1 - Math.exp(-rate * dt)); },
    smoothstep(t) { t = M.clamp(t, 0, 1); return t * t * (3 - 2 * t); },
    /** 0->1->0 hump, useful for one-shot animation curves. */
    hump(t) { return Math.sin(M.clamp(t, 0, 1) * Math.PI); },
    /** Fast-out curve for impact flashes. */
    decay(t) { t = M.clamp(t, 0, 1); return (1 - t) * (1 - t); },

    /** Wrap an angle into (-PI, PI]. */
    wrapAngle(a) {
      a = (a + Math.PI) % TAU;
      if (a < 0) a += TAU;
      return a - Math.PI;
    },
    /** Shortest signed delta from angle a to angle b. */
    angleDelta(a, b) { return M.wrapAngle(b - a); },
    /** Rotate `a` toward `b` by at most `max` radians. */
    approachAngle(a, b, max) {
      const d = M.angleDelta(a, b);
      return a + M.clamp(d, -max, max);
    },

    dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); },
    dist2(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; },

    /** Uniform float in [lo, hi). */
    rand(lo, hi) { return lo + Math.random() * (hi - lo); },
    /** Uniform int in [lo, hi]. */
    randInt(lo, hi) { return Math.floor(lo + Math.random() * (hi - lo + 1)); },
    /** Symmetric spread: [-s, s). */
    spread(s) { return (Math.random() * 2 - 1) * s; },
    pick(arr) { return arr[(Math.random() * arr.length) | 0]; },
    chance(p) { return Math.random() < p; },

    /** Fisher-Yates, returns a new array. */
    shuffled(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        const t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
    },
  };

  /* ---------------------------------------------------------------------
     Seeded RNG (mulberry32). Used for procedural art so a given curse
     spirit or wall texture looks identical every run — stable art, not
     random noise that flickers between sessions.
     --------------------------------------------------------------------- */
  M.rng = function rng(seed) {
    let a = seed >>> 0;
    const f = function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.range = (lo, hi) => lo + f() * (hi - lo);
    f.int = (lo, hi) => Math.floor(lo + f() * (hi - lo + 1));
    f.pick = (arr) => arr[Math.floor(f() * arr.length) % arr.length];
    return f;
  };

  /** Hash a string to a 32-bit int — lets us seed art from an entity id. */
  M.hash = function (str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };

  /* ---------------------------------------------------------------------
     Colour helpers. Everything in the renderer works in #rrggbb so the
     procedural texture bakers can tint consistently.
     --------------------------------------------------------------------- */
  const C = {
    parse(hex) {
      let h = hex.replace('#', '');
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      const n = parseInt(h, 16);
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    },
    hex(r, g, b) {
      const c = (v) => M.clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
      return '#' + c(r) + c(g) + c(b);
    },
    /** Multiply brightness. */
    shade(hex, f) {
      const { r, g, b } = C.parse(hex);
      return C.hex(r * f, g * f, b * f);
    },
    /** Blend two hex colours, t=0 -> a, t=1 -> b. */
    mix(a, b, t) {
      const ca = C.parse(a), cb = C.parse(b);
      return C.hex(M.lerp(ca.r, cb.r, t), M.lerp(ca.g, cb.g, t), M.lerp(ca.b, cb.b, t));
    },
    /** rgba() string from a hex + alpha. */
    alpha(hex, a) {
      const { r, g, b } = C.parse(hex);
      return `rgba(${r},${g},${b},${a})`;
    },
  };

  /* ---------------------------------------------------------------------
     Offscreen canvas helper. All procedural art is baked into these once
     and then blitted — we never call getImageData, which matters because
     the Avatar/ images are loaded over file:// and would taint a canvas.
     --------------------------------------------------------------------- */
  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    const ctx = c.getContext('2d');
    return { canvas: c, ctx };
  }

  JJK.M = M;
  JJK.Color = C;
  JJK.makeCanvas = makeCanvas;
})(window.JJK);
