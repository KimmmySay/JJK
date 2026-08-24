/* ==========================================================================
   TEXTURES — procedural wall surfaces.

   Everything is drawn with canvas paths from a seeded RNG, so:
     - no external texture files (the game still opens from file://),
     - a given wall looks identical every session (stable art, not noise),
     - we never touch getImageData, so nothing taints.

   Textures are baked lazily per level theme and cached. SIX variants per
   wall type are generated and chosen by cell hash, which kills the "same
   tile stamped 400 times" look that makes raycasters feel cheap. Higher
   variant indices carry feature decals — a breach, a hazard band, conduit
   runs, hanging talismans — so a corridor has landmarks instead of being
   one texture repeated down its whole length.
   ========================================================================== */

(function (JJK) {
  'use strict';

  const { M, Color, makeCanvas } = JJK;

  const TEX = 128;              // texture resolution (square)
  const VARIANTS = 6;   // more variants = less obvious repetition
  const cache = new Map();      // `${themeId}:${style}:${variant}` -> canvas

  /* ------------------------------------------------------------------
     Shared grain pass. Adds fine speckle + broad blotches so flat fills
     read as a material instead of a colour swatch.
     ------------------------------------------------------------------ */
  function grain(ctx, rnd, amount, scale) {
    const n = Math.floor(TEX * TEX * amount);
    for (let i = 0; i < n; i++) {
      const x = rnd() * TEX, y = rnd() * TEX;
      const a = rnd() * 0.16;
      const v = rnd() < 0.5 ? 0 : 255;
      ctx.fillStyle = `rgba(${v},${v},${v},${a})`;
      const s = scale * (0.5 + rnd());
      ctx.fillRect(x, y, s, s);
    }
  }

  function blotches(ctx, rnd, color, count, maxR, alpha) {
    for (let i = 0; i < count; i++) {
      const x = rnd() * TEX, y = rnd() * TEX, r = maxR * (0.3 + rnd());
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, Color.alpha(color, alpha));
      g.addColorStop(1, Color.alpha(color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }

  /** Vertical streaks — water damage, soot. Sells "this place is old". */
  function streaks(ctx, rnd, color, count, alpha) {
    for (let i = 0; i < count; i++) {
      const x = rnd() * TEX;
      const w = 1 + rnd() * 4;
      const top = rnd() * TEX * 0.4;
      const len = TEX * (0.3 + rnd() * 0.7);
      const g = ctx.createLinearGradient(0, top, 0, top + len);
      g.addColorStop(0, Color.alpha(color, alpha));
      g.addColorStop(1, Color.alpha(color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x, top, w, len);
    }
  }

  /** Crack network, drawn as a branching walk. */
  function cracks(ctx, rnd, color, count, width) {
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    for (let i = 0; i < count; i++) {
      let x = rnd() * TEX, y = rnd() * TEX;
      let a = rnd() * M.TAU;
      const segs = 4 + Math.floor(rnd() * 7);
      ctx.lineWidth = width * (0.5 + rnd());
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let s = 0; s < segs; s++) {
        a += (rnd() - 0.5) * 1.4;
        const len = 3 + rnd() * 12;
        x += Math.cos(a) * len;
        y += Math.sin(a) * len;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  /** Vertical pipe / conduit run. Instantly makes a flat wall industrial. */
  function conduit(ctx, rnd, x, w, color, hi) {
    ctx.fillStyle = Color.shade(color, 0.55);
    ctx.fillRect(x, 0, w, TEX);
    ctx.fillStyle = Color.alpha(hi, 0.22);
    ctx.fillRect(x + w * 0.18, 0, w * 0.22, TEX);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x + w * 0.8, 0, w * 0.2, TEX);
    // brackets
    for (let y = 10 + rnd() * 20; y < TEX; y += 38 + rnd() * 18) {
      ctx.fillStyle = Color.shade(color, 0.4);
      ctx.fillRect(x - 2, y, w + 4, 5);
      ctx.fillStyle = Color.alpha(hi, 0.3);
      ctx.fillRect(x - 2, y, w + 4, 1.5);
    }
  }

  /** Painted hazard band. */
  function hazardBand(ctx, y, h, a, b) {
    ctx.save();
    ctx.beginPath(); ctx.rect(0, y, TEX, h); ctx.clip();
    ctx.fillStyle = a;
    ctx.fillRect(0, y, TEX, h);
    ctx.fillStyle = b;
    for (let x = -h; x < TEX + h; x += h * 1.6) {
      ctx.beginPath();
      ctx.moveTo(x, y + h); ctx.lineTo(x + h * 0.8, y);
      ctx.lineTo(x + h * 1.5, y); ctx.lineTo(x + h * 0.7, y + h);
      ctx.closePath(); ctx.fill();
    }
    // wear
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    for (let i = 0; i < 14; i++) {
      ctx.fillRect(Math.random() * TEX, y + Math.random() * h, 3 + Math.random() * 8, 2);
    }
    ctx.restore();
  }

  /** A broken-open section showing dark structure behind the surface. */
  function breach(ctx, rnd, cx, cy, r, inner, glow) {
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i <= 11; i++) {
      const a = (i / 11) * M.TAU;
      const rr = r * (0.6 + rnd() * 0.65);
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = inner;
    ctx.fill();
    ctx.clip();
    // rebar / sinew across the hole
    ctx.strokeStyle = Color.alpha(glow, 0.55);
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(cx - r, cy - r + i * r * 0.5 + rnd() * 6);
      ctx.lineTo(cx + r, cy - r + i * r * 0.5 + rnd() * 8);
      ctx.stroke();
    }
    ctx.restore();
    // lip highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  /** Hanging paper talismans (shide) — shrine dressing. */
  function talisman(ctx, x, y, w, h, color) {
    ctx.fillStyle = 'rgba(20,16,14,0.5)';
    ctx.fillRect(x - 1, y, 2, h * 0.25);
    ctx.fillStyle = '#e8e2d2';
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y + h * 0.25);
    ctx.lineTo(x + w / 2, y + h * 0.25);
    ctx.lineTo(x + w / 2, y + h);
    ctx.lineTo(x + w * 0.1, y + h * 0.8);
    ctx.lineTo(x - w * 0.2, y + h);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = Color.alpha(color, 0.65);
    ctx.fillRect(x - w / 2, y + h * 0.25, w, 3);
  }

  /** Darken the tile border so adjacent cells read as separate surfaces. */
  function edgeShade(ctx, strength) {
    const g = ctx.createLinearGradient(0, 0, TEX, 0);
    g.addColorStop(0, `rgba(0,0,0,${strength})`);
    g.addColorStop(0.08, 'rgba(0,0,0,0)');
    g.addColorStop(0.92, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${strength})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, TEX, TEX);

    // Slight top-down ambient occlusion.
    const v = ctx.createLinearGradient(0, 0, 0, TEX);
    v.addColorStop(0, 'rgba(0,0,0,0.30)');
    v.addColorStop(0.35, 'rgba(0,0,0,0)');
    v.addColorStop(0.8, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.38)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, TEX, TEX);
  }

  /* ==================================================================
     STYLES
     Each returns nothing; draws a full TEX x TEX surface.
     pal = { base, dark, light, accent, glow }
     ================================================================== */
  const STYLES = {

    /* Poured concrete with service infrastructure bolted to it. */
    concrete(ctx, rnd, pal, variant) {
      ctx.fillStyle = pal.base;
      ctx.fillRect(0, 0, TEX, TEX);
      blotches(ctx, rnd, pal.dark, 16, 26, 0.24);
      blotches(ctx, rnd, pal.light, 9, 20, 0.10);

      // Panel seams + form-tie holes.
      const seamY = TEX * (0.42 + rnd() * 0.16);
      ctx.fillStyle = Color.alpha(pal.dark, 0.6);
      ctx.fillRect(0, seamY, TEX, 2.5);
      ctx.fillStyle = Color.alpha(pal.light, 0.16);
      ctx.fillRect(0, seamY + 2.5, TEX, 1);
      for (let i = 0; i < 6; i++) {
        const x = 10 + rnd() * (TEX - 20);
        const y = seamY + (rnd() < 0.5 ? -12 - rnd() * 22 : 12 + rnd() * 22);
        ctx.fillStyle = Color.alpha(pal.dark, 0.65);
        ctx.beginPath(); ctx.arc(x, y, 2.2, 0, M.TAU); ctx.fill();
        ctx.fillStyle = Color.alpha(pal.light, 0.18);
        ctx.beginPath(); ctx.arc(x - 0.6, y - 0.6, 1.1, 0, M.TAU); ctx.fill();
      }

      // Patch repairs — a different pour, slightly wrong colour.
      for (let i = 0; i < 2; i++) {
        const px = rnd() * TEX * 0.7, py = rnd() * TEX * 0.7;
        const pw = 22 + rnd() * 30, ph = 18 + rnd() * 26;
        ctx.fillStyle = Color.shade(pal.base, 1.14);
        ctx.fillRect(px, py, pw, ph);
        ctx.strokeStyle = 'rgba(0,0,0,0.28)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, pw, ph);
      }

      if (variant % 3 === 1) conduit(ctx, rnd, TEX * (0.12 + rnd() * 0.1), 11, pal.accent, pal.light);
      if (variant % 3 === 2) {
        conduit(ctx, rnd, TEX * 0.74, 8, pal.accent, pal.light);
        conduit(ctx, rnd, TEX * 0.85, 6, pal.accent, pal.light);
      }
      if (variant === 3) hazardBand(ctx, TEX * 0.66, 13, '#c8a417', '#1b1b1b');
      if (variant === 5) breach(ctx, rnd, TEX * 0.5, TEX * 0.45, 18, '#08080c', pal.glow);

      streaks(ctx, rnd, pal.dark, 8, 0.30);
      cracks(ctx, rnd, Color.alpha(pal.dark, 0.55), 4, 1.1);
      grain(ctx, rnd, 0.055, 1.4);
      edgeShade(ctx, 0.42);
    },

    /* Station wall tiles — small grid, glossy, grouted. */
    tile(ctx, rnd, pal) {
      ctx.fillStyle = pal.dark;
      ctx.fillRect(0, 0, TEX, TEX);
      const n = 8, s = TEX / n;
      for (let ty = 0; ty < n; ty++) {
        for (let tx = 0; tx < n; tx++) {
          const j = (rnd() - 0.5) * 0.14;
          ctx.fillStyle = Color.shade(pal.base, 1 + j);
          ctx.fillRect(tx * s + 1, ty * s + 1, s - 2, s - 2);
          // specular corner
          ctx.fillStyle = Color.alpha(pal.light, 0.12 + rnd() * 0.1);
          ctx.fillRect(tx * s + 1, ty * s + 1, s - 2, 2);
        }
      }
      blotches(ctx, rnd, pal.dark, 10, 22, 0.30);
      streaks(ctx, rnd, pal.dark, 5, 0.22);
      cracks(ctx, rnd, Color.alpha('#000000', 0.45), 2, 0.9);
      grain(ctx, rnd, 0.03, 1.1);
      edgeShade(ctx, 0.38);
    },

    /* Cursed flesh — pulsing veins over dark membrane. Emissive. */
    cursed(ctx, rnd, pal) {
      ctx.fillStyle = pal.dark;
      ctx.fillRect(0, 0, TEX, TEX);
      blotches(ctx, rnd, pal.base, 16, 30, 0.5);
      blotches(ctx, rnd, '#000000', 10, 22, 0.4);

      // Vein network, glowing.
      ctx.lineCap = 'round';
      for (let i = 0; i < 9; i++) {
        let x = rnd() * TEX, y = rnd() * TEX, a = rnd() * M.TAU;
        const segs = 6 + Math.floor(rnd() * 8);
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let s = 0; s < segs; s++) {
          a += (rnd() - 0.5) * 1.1;
          const len = 4 + rnd() * 10;
          x += Math.cos(a) * len; y += Math.sin(a) * len;
          ctx.lineTo(x, y);
        }
        ctx.strokeStyle = Color.alpha(pal.glow, 0.16);
        ctx.lineWidth = 5; ctx.stroke();
        ctx.strokeStyle = Color.alpha(pal.glow, 0.75);
        ctx.lineWidth = 1.6; ctx.stroke();
      }

      // Occasional cursed eye.
      if (rnd() < 0.55) {
        const x = 20 + rnd() * (TEX - 40), y = 20 + rnd() * (TEX - 40);
        const r = 5 + rnd() * 5;
        ctx.fillStyle = '#0a0206';
        ctx.beginPath(); ctx.ellipse(x, y, r * 1.7, r, 0, 0, M.TAU); ctx.fill();
        ctx.fillStyle = pal.glow;
        ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, M.TAU); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(x, y, r * 0.16, r * 0.5, 0, 0, M.TAU); ctx.fill();
      }
      // Bone pushing through the membrane.
      if (rnd() < 0.5) {
        ctx.fillStyle = 'rgba(226,214,190,0.75)';
        const bx = 16 + rnd() * (TEX - 32), by2 = 16 + rnd() * (TEX - 32);
        for (let i = 0; i < 4; i++) {
          ctx.save();
          ctx.translate(bx, by2 + i * 9);
          ctx.rotate(-0.3 + rnd() * 0.6);
          ctx.beginPath(); ctx.ellipse(0, 0, 13 - i, 2.6, 0, 0, M.TAU); ctx.fill();
          ctx.restore();
        }
      }
      // Folds of stretched flesh.
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      for (let i = 0; i < 5; i++) {
        ctx.lineWidth = 1 + rnd() * 2.5;
        ctx.beginPath();
        const fy = rnd() * TEX;
        ctx.moveTo(0, fy);
        ctx.bezierCurveTo(TEX * 0.3, fy + (rnd() - 0.5) * 26, TEX * 0.7, fy + (rnd() - 0.5) * 26, TEX, fy + (rnd() - 0.5) * 14);
        ctx.stroke();
      }
      grain(ctx, rnd, 0.06, 1.5);
      edgeShade(ctx, 0.5);
    },

    /* Lacquered shrine timber — vertical grain, iron banding. */
    timber(ctx, rnd, pal) {
      ctx.fillStyle = pal.base;
      ctx.fillRect(0, 0, TEX, TEX);
      // Plank divisions.
      const planks = 4, pw = TEX / planks;
      for (let i = 0; i < planks; i++) {
        ctx.fillStyle = Color.shade(pal.base, 1 + (rnd() - 0.5) * 0.2);
        ctx.fillRect(i * pw, 0, pw - 1, TEX);
        ctx.fillStyle = Color.alpha(pal.dark, 0.65);
        ctx.fillRect(i * pw + pw - 2, 0, 2, TEX);
        // grain lines
        for (let g2 = 0; g2 < 7; g2++) {
          const gx = i * pw + 2 + rnd() * (pw - 5);
          ctx.strokeStyle = Color.alpha(pal.dark, 0.1 + rnd() * 0.2);
          ctx.lineWidth = 0.6 + rnd() * 0.9;
          ctx.beginPath();
          ctx.moveTo(gx, 0);
          for (let y = 0; y <= TEX; y += 16) ctx.lineTo(gx + Math.sin(y * 0.05 + i) * 1.6, y);
          ctx.stroke();
        }
      }
      // Hanging talismans on some variants.
      if ((rnd() * 6 | 0) < 2) {
        for (let i = 0; i < 3; i++) talisman(ctx, 18 + i * 46 + rnd() * 8, 4, 13, 34, pal.glow);
      }

      // Iron band with rivets.
      const by = TEX * (0.6 + rnd() * 0.2);
      ctx.fillStyle = Color.shade(pal.accent, 0.85);
      ctx.fillRect(0, by, TEX, 9);
      ctx.fillStyle = Color.alpha('#ffffff', 0.12);
      ctx.fillRect(0, by, TEX, 2);
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = Color.shade(pal.accent, 1.3);
        ctx.beginPath(); ctx.arc(10 + i * 22, by + 4.5, 2, 0, M.TAU); ctx.fill();
      }
      grain(ctx, rnd, 0.04, 1.2);
      edgeShade(ctx, 0.45);
    },

    /* Riveted metal bulkhead. */
    metal(ctx, rnd, pal) {
      ctx.fillStyle = pal.base;
      ctx.fillRect(0, 0, TEX, TEX);
      // Horizontal ribbing.
      for (let y = 0; y < TEX; y += 16) {
        ctx.fillStyle = Color.alpha(pal.light, 0.10);
        ctx.fillRect(0, y, TEX, 6);
        ctx.fillStyle = Color.alpha(pal.dark, 0.45);
        ctx.fillRect(0, y + 6, TEX, 2);
      }
      // Rivet columns.
      for (let x = 8; x < TEX; x += 28) {
        for (let y = 8; y < TEX; y += 16) {
          ctx.fillStyle = Color.alpha(pal.light, 0.28);
          ctx.beginPath(); ctx.arc(x, y, 1.8, 0, M.TAU); ctx.fill();
          ctx.fillStyle = Color.alpha('#000', 0.4);
          ctx.beginPath(); ctx.arc(x + 0.5, y + 0.7, 1.1, 0, M.TAU); ctx.fill();
        }
      }
      // Vent grille on some panels.
      if (rnd() < 0.4) {
        const gx = 20 + rnd() * 50, gy = 30 + rnd() * 50, gw = 44, gh = 30;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(gx, gy, gw, gh);
        ctx.fillStyle = Color.alpha(pal.light, 0.30);
        for (let i = 0; i < 6; i++) ctx.fillRect(gx + 2, gy + 3 + i * 4.6, gw - 4, 2);
        ctx.strokeStyle = Color.alpha(pal.light, 0.35);
        ctx.lineWidth = 1.5;
        ctx.strokeRect(gx - 1, gy - 1, gw + 2, gh + 2);
      }
      blotches(ctx, rnd, pal.accent, 9, 18, 0.26);  // rust
      streaks(ctx, rnd, pal.accent, 6, 0.28);
      grain(ctx, rnd, 0.05, 1.2);
      edgeShade(ctx, 0.44);
    },

    /* Cut stone blockwork. The plain version of this was the flat grey
       corridor problem — it now carries weathering, moss, a carved course
       and, on some variants, a broken-open block. */
    stone(ctx, rnd, pal, variant) {
      ctx.fillStyle = pal.dark;
      ctx.fillRect(0, 0, TEX, TEX);
      const rows = 4, rh = TEX / rows;
      for (let r = 0; r < rows; r++) {
        const offset = (r % 2) * (TEX / 6);
        let x = -offset;
        while (x < TEX) {
          const bw = TEX / 3 + (rnd() - 0.5) * 18;
          const shade = 1 + (rnd() - 0.5) * 0.30;
          ctx.fillStyle = Color.shade(pal.base, shade);
          ctx.fillRect(x + 1.5, r * rh + 1.5, bw - 3, rh - 3);
          // bevelled top / shadowed bottom gives each block depth
          ctx.fillStyle = Color.alpha(pal.light, 0.16);
          ctx.fillRect(x + 1.5, r * rh + 1.5, bw - 3, 2);
          ctx.fillStyle = 'rgba(0,0,0,0.34)';
          ctx.fillRect(x + 1.5, r * rh + rh - 4, bw - 3, 2.5);
          ctx.fillStyle = 'rgba(0,0,0,0.22)';
          ctx.fillRect(x + bw - 3, r * rh + 1.5, 2, rh - 3);
          // pitting
          for (let i = 0; i < 5; i++) {
            ctx.fillStyle = `rgba(0,0,0,${0.10 + rnd() * 0.18})`;
            ctx.beginPath();
            ctx.arc(x + 6 + rnd() * (bw - 12), r * rh + 5 + rnd() * (rh - 10), 0.8 + rnd() * 1.8, 0, M.TAU);
            ctx.fill();
          }
          x += bw;
        }
      }

      // A carved string course across one of the joints.
      if (variant % 3 === 1) {
        const cy = rh * 2;
        ctx.fillStyle = Color.shade(pal.base, 1.18);
        ctx.fillRect(0, cy - 5, TEX, 10);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, cy + 4, TEX, 2.5);
        ctx.fillStyle = Color.alpha(pal.light, 0.2);
        ctx.fillRect(0, cy - 5, TEX, 1.5);
        for (let x = 4; x < TEX; x += 12) {
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.fillRect(x, cy - 3, 2, 6);
        }
      }

      // Moss creeping up from the base, heavier in damp corners.
      const mossG = ctx.createLinearGradient(0, TEX, 0, TEX * 0.45);
      mossG.addColorStop(0, 'rgba(48,74,40,0.55)');
      mossG.addColorStop(1, 'rgba(48,74,40,0)');
      ctx.fillStyle = mossG;
      ctx.fillRect(0, TEX * 0.45, TEX, TEX * 0.55);
      blotches(ctx, rnd, '#3b5c33', 9, 18, 0.30);

      // Vines on some variants.
      if (variant % 3 === 2) {
        ctx.strokeStyle = 'rgba(60,92,48,0.75)';
        ctx.lineCap = 'round';
        for (let v = 0; v < 3; v++) {
          let vx = rnd() * TEX, vy = TEX;
          ctx.lineWidth = 1.4 + rnd();
          ctx.beginPath(); ctx.moveTo(vx, vy);
          for (let k = 0; k < 8; k++) {
            vx += (rnd() - 0.5) * 14; vy -= 10 + rnd() * 8;
            ctx.lineTo(vx, vy);
          }
          ctx.stroke();
          for (let k = 0; k < 6; k++) {
            ctx.fillStyle = 'rgba(74,110,58,0.8)';
            ctx.beginPath();
            ctx.ellipse(vx + (rnd() - 0.5) * 20, vy + rnd() * 60, 3, 1.8, rnd() * 3, 0, M.TAU);
            ctx.fill();
          }
        }
      }

      // A block knocked clean out.
      if (variant === 4) breach(ctx, rnd, TEX * (0.3 + rnd() * 0.4), TEX * (0.35 + rnd() * 0.3), 16, '#0d0d10', pal.glow);

      cracks(ctx, rnd, Color.alpha('#000', 0.45), 4, 1.1);
      grain(ctx, rnd, 0.05, 1.3);
      edgeShade(ctx, 0.42);
    },

    /* Thin pillar — strongly shaded cylinder read. */
    pillar(ctx, rnd, pal) {
      const g = ctx.createLinearGradient(0, 0, TEX, 0);
      g.addColorStop(0, Color.shade(pal.base, 0.45));
      g.addColorStop(0.35, Color.shade(pal.base, 1.12));
      g.addColorStop(0.55, pal.base);
      g.addColorStop(1, Color.shade(pal.base, 0.4));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, TEX, TEX);
      // Capital + base bands.
      ctx.fillStyle = Color.alpha(pal.dark, 0.6);
      ctx.fillRect(0, 4, TEX, 7);
      ctx.fillRect(0, TEX - 13, TEX, 7);
      ctx.fillStyle = Color.alpha(pal.light, 0.16);
      ctx.fillRect(0, 11, TEX, 2);
      ctx.fillRect(0, TEX - 6, TEX, 2);
      // Fluting.
      for (let i = 1; i < 7; i++) {
        ctx.fillStyle = Color.alpha('#000', 0.14);
        ctx.fillRect((TEX / 7) * i, 13, 1.5, TEX - 26);
      }
      grain(ctx, rnd, 0.03, 1.1);
    },

    /* Glass / signage — Shibuya storefront. Emissive strips. */
    signage(ctx, rnd, pal) {
      ctx.fillStyle = Color.shade(pal.dark, 0.7);
      ctx.fillRect(0, 0, TEX, TEX);
      // Neon bars.
      const bars = 2 + Math.floor(rnd() * 3);
      for (let i = 0; i < bars; i++) {
        const y = 10 + rnd() * (TEX - 30);
        const h = 6 + rnd() * 12;
        const col = rnd() < 0.5 ? pal.glow : pal.accent;
        const g = ctx.createLinearGradient(0, y - h, 0, y + h * 2);
        g.addColorStop(0, Color.alpha(col, 0));
        g.addColorStop(0.5, Color.alpha(col, 0.85));
        g.addColorStop(1, Color.alpha(col, 0));
        ctx.fillStyle = g;
        ctx.fillRect(0, y - h, TEX, h * 3);
        ctx.fillStyle = Color.alpha('#ffffff', 0.8);
        ctx.fillRect(0, y + h * 0.4, TEX, 2);
      }
      // Dark mullions.
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      for (let x = 0; x < TEX; x += TEX / 3) ctx.fillRect(x, 0, 3, TEX);
      grain(ctx, rnd, 0.03, 1.1);
      edgeShade(ctx, 0.5);
    },
  };

  /* ------------------------------------------------------------------
     Public: fetch a baked texture canvas.
     ------------------------------------------------------------------ */
  function getWallTexture(theme, cellType, variant) {
    const style = theme.walls[cellType] || theme.walls[1] || 'concrete';
    const key = `${theme.id}:${style}:${variant}`;
    let c = cache.get(key);
    if (c) return c;

    const { canvas, ctx } = makeCanvas(TEX, TEX);
    const rnd = M.rng(M.hash(key));
    const pal = theme.palette[style] || theme.palette.default;
    (STYLES[style] || STYLES.concrete)(ctx, rnd, pal, variant);
    cache.set(key, canvas);
    return canvas;
  }

  /** Deterministic variant index for a cell, so a wall never shimmers. */
  function variantFor(cx, cy) {
    const h = (Math.imul(cx | 0, 73856093) ^ Math.imul(cy | 0, 19349663)) >>> 0;
    return h % VARIANTS;
  }

  /** Pre-bake every texture a theme needs. Called on level load. */
  function prewarm(theme) {
    for (const t of [1, 2, 3, 4, 5]) {
      for (let v = 0; v < VARIANTS; v++) getWallTexture(theme, t, v);
    }
  }

  JJK.Textures = { getWallTexture, variantFor, prewarm, TEX, VARIANTS, STYLES };
})(window.JJK);
