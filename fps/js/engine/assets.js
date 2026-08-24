/* ==========================================================================
   ASSETS — image loading with graceful degradation.

   Design rule: a missing image must NEVER break the game. Every load that
   fails resolves to `null`, and the sprite baker substitutes a procedural
   stand-in. The original game silently rendered broken-image icons for half
   its roster; here a bad path costs you fidelity, not a crash.
   ========================================================================== */

(function (JJK) {
  'use strict';

  const cache = new Map();
  const failed = new Set();

  /** Load one image. Resolves to HTMLImageElement, or null on failure. */
  function loadImage(src) {
    if (cache.has(src)) return cache.get(src);

    const p = new Promise((resolve) => {
      const img = new Image();
      let settled = false;
      const done = (val) => {
        if (settled) return;
        settled = true;
        if (!val) failed.add(src);
        resolve(val);
      };

      img.onload = () => {
        // Zero-dimension images (some broken webp) count as failures.
        done(img.naturalWidth > 0 ? img : null);
      };
      img.onerror = () => done(null);

      // Safety net: never let a hung request stall the loading screen.
      setTimeout(() => done(img.naturalWidth > 0 ? img : null), 8000);

      img.src = src;
    });

    cache.set(src, p);
    return p;
  }

  /**
   * Load a map of { key: src } and resolve to { key: img|null }.
   * onProgress(loaded, total) fires as each settles.
   */
  async function loadMap(map, onProgress) {
    const keys = Object.keys(map);
    const out = {};
    let done = 0;
    await Promise.all(keys.map(async (k) => {
      out[k] = await loadImage(map[k]);
      done++;
      if (onProgress) onProgress(done, keys.length);
    }));
    return out;
  }

  /** Synchronous lookup for images already resolved via loadMap. */
  const resolved = new Map();
  function put(key, img) { resolved.set(key, img); }
  function get(key) { return resolved.get(key) || null; }
  function didFail(src) { return failed.has(src); }
  function failures() { return Array.from(failed); }

  JJK.Assets = { loadImage, loadMap, put, get, didFail, failures };
})(window.JJK);
