/* ==========================================================================
   VIEWMODEL — first-person arms, weapons and cursed energy.

   Drawn procedurally in screen space every frame (not baked) because it has
   to respond continuously to bob, lean, charge level and swing phase.

   Animation follows the classic three beats:
     ANTICIPATION  hand pulls back and down, energy gathers  (swing 0.00-0.25)
     IMPACT        snaps forward past the rest pose          (swing 0.25-0.45)
     RECOVERY      eases back, energy dissipates             (swing 0.45-1.00)
   Overshooting the rest pose on the way back is what stops it looking like a
   linear tween.
   ========================================================================== */

(function (JJK) {
  'use strict';

  const { M, Color } = JJK;

  /* Characters that hold something. Everyone else fights bare-handed. */
  const WEAPONS = {
    maki:     { type: 'spear',  len: 1.55, color: '#c8ccd4', trim: '#44ff44' },
    toji:     { type: 'blade',  len: 0.95, color: '#dfe4ee', trim: '#8890a8' },
    nanami:   { type: 'cleaver', len: 0.85, color: '#e8dcc0', trim: '#daa520' },
    nobara:   { type: 'hammer', len: 0.80, color: '#d8d8e0', trim: '#ff69b4' },
    higuruma: { type: 'gavel',  len: 0.72, color: '#6b4a32', trim: '#9fc0c0' },
    mahoraga: { type: 'blade',  len: 1.25, color: '#ffd9a0', trim: '#ffaa00' },
    sukuna:   { type: 'claws',  len: 0.6,  color: '#ff5577', trim: '#ff0044' },
    meguna:   { type: 'claws',  len: 0.6,  color: '#e070e0', trim: '#8b008b' },
    yuta:     { type: 'blade',  len: 1.15, color: '#e8ddff', trim: '#9932cc' },
    kashimo:  { type: 'spear',  len: 1.35, color: '#bfeff0', trim: '#00ced1' },
    hakari:   { type: 'blade',  len: 0.55, color: '#ffd98a', trim: '#ffaa00' },
  };

  /* ------------------------------------------------------------------
     A stylised hand: sleeve, palm, four fingers, thumb.
     `grip` 0 = open palm, 1 = closed fist.
     ------------------------------------------------------------------ */
  /* Skin shading ramp — a single flat fill is what made these read as
     cardboard cut-outs rather than hands. */
  const SKIN = { lit: '#e8c39e', mid: '#cfa07c', dark: '#9e6f52', crease: '#7d5540' };

  /**
   * One finger: three tapering segments with a bend, a rounded tip and a
   * nail. Drawn as a filled path rather than a stack of ellipses so it
   * silhouettes cleanly.
   *
   * `curl` 0 = straight, 1 = folded into the palm.
   */
  function drawFinger(ctx, x, y, len, w, curl, lean, shade) {
    const c = M.clamp(curl, 0, 1);
    // Folding shortens the visible length and swings the tip inward.
    const l1 = len * 0.42 * (1 - c * 0.15);
    const l2 = len * 0.34 * (1 - c * 0.55);
    const l3 = len * 0.24 * (1 - c * 0.8);
    const a1 = -M.HALF_PI + lean;
    const a2 = a1 + c * 0.95;
    const a3 = a2 + c * 1.05;

    const p0 = { x, y };
    const p1 = { x: p0.x + Math.cos(a1) * l1, y: p0.y + Math.sin(a1) * l1 };
    const p2 = { x: p1.x + Math.cos(a2) * l2, y: p1.y + Math.sin(a2) * l2 };
    const p3 = { x: p2.x + Math.cos(a3) * l3, y: p2.y + Math.sin(a3) * l3 };

    const widths = [w, w * 0.92, w * 0.82, w * 0.68];
    const pts = [p0, p1, p2, p3];
    const left = [], right = [];
    for (let i = 0; i < 4; i++) {
      const a = i === 0 ? a1 : i === 1 ? (a1 + a2) / 2 : i === 2 ? (a2 + a3) / 2 : a3;
      const nx = Math.cos(a - M.HALF_PI), ny = Math.sin(a - M.HALF_PI);
      left.push({ x: pts[i].x + nx * widths[i], y: pts[i].y + ny * widths[i] });
      right.push({ x: pts[i].x - nx * widths[i], y: pts[i].y - ny * widths[i] });
    }

    ctx.beginPath();
    ctx.moveTo(left[0].x, left[0].y);
    ctx.quadraticCurveTo(left[1].x, left[1].y, left[2].x, left[2].y);
    ctx.quadraticCurveTo(left[3].x, left[3].y, p3.x + Math.cos(a3) * widths[3] * 0.9, p3.y + Math.sin(a3) * widths[3] * 0.9);
    ctx.quadraticCurveTo(right[3].x, right[3].y, right[2].x, right[2].y);
    ctx.quadraticCurveTo(right[1].x, right[1].y, right[0].x, right[0].y);
    ctx.closePath();

    const g = ctx.createLinearGradient(p0.x - w, p0.y, p0.x + w * 1.6, p0.y);
    g.addColorStop(0, SKIN.dark);
    g.addColorStop(0.4, shade);
    g.addColorStop(1, SKIN.dark);
    ctx.fillStyle = g;
    ctx.fill();

    // Knuckle crease where the first joint folds.
    if (c > 0.25) {
      ctx.strokeStyle = Color.alpha(SKIN.crease, c * 0.5);
      ctx.lineWidth = w * 0.35;
      ctx.beginPath();
      ctx.moveTo(p1.x - w * 0.7, p1.y);
      ctx.lineTo(p1.x + w * 0.7, p1.y);
      ctx.stroke();
    }
    // Nail on an extended finger.
    if (c < 0.4) {
      ctx.fillStyle = Color.alpha('#f3d9c4', 0.75 - c);
      ctx.save();
      ctx.translate(p3.x, p3.y);
      ctx.rotate(a3 + M.HALF_PI);
      ctx.beginPath();
      ctx.ellipse(0, -w * 0.25, w * 0.45, w * 0.6, 0, 0, M.TAU);
      ctx.fill();
      ctx.restore();
    }
    return p3;
  }

  /**
   * A hand. Deliberately small — a viewmodel hand should occupy the bottom
   * corner of the frame, not a quarter of the screen.
   */
  function drawHand(ctx, x, y, s, rot, shape, side, skin, cuff, glow) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(side, 1);

    // Sleeve running off the bottom of the frame.
    const sleeveG = ctx.createLinearGradient(0, s * 3.0, 0, -s * 0.1);
    sleeveG.addColorStop(0, Color.shade(cuff, 0.30));
    sleeveG.addColorStop(0.55, Color.shade(cuff, 0.75));
    sleeveG.addColorStop(1, cuff);
    ctx.fillStyle = sleeveG;
    ctx.beginPath();
    ctx.moveTo(-s * 0.50, s * 3.6);
    ctx.quadraticCurveTo(-s * 0.60, s * 1.1, -s * 0.44, s * 0.10);
    ctx.lineTo(s * 0.44, s * 0.10);
    ctx.quadraticCurveTo(s * 0.60, s * 1.1, s * 0.50, s * 3.6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = Color.alpha(glow, 0.42);
    ctx.fillRect(-s * 0.46, s * 0.10, s * 0.92, s * 0.06);

    /* Finger set. Curl and splay per shape — this is what makes a point
       read as a point instead of a differently-tinted fist. */
    let curls, splay, thumbCurl;
    switch (shape) {
      case 'fist':  curls = [1, 1, 1, 1];             splay = 0.00; thumbCurl = 1; break;
      case 'open':  curls = [0.08, 0.03, 0.05, 0.12]; splay = 0.30; thumbCurl = 0.1; break;
      case 'point': curls = [0.05, 0.05, 0.92, 1];    splay = 0.08; thumbCurl = 0.8; break;
      case 'claw':  curls = [0.45, 0.40, 0.45, 0.52]; splay = 0.42; thumbCurl = 0.4; break;
      case 'grip':  curls = [0.9, 0.95, 0.95, 0.9];   splay = 0.00; thumbCurl = 1; break;
      default:      curls = [0.5, 0.5, 0.5, 0.5];     splay = 0.15; thumbCurl = 0.6;
    }

    const fw = s * 0.105;
    const palmTop = -s * 0.30;

    // Back-of-hand mass.
    ctx.beginPath();
    ctx.moveTo(-s * 0.40, s * 0.14);
    ctx.quadraticCurveTo(-s * 0.46, palmTop, -s * 0.30, palmTop - s * 0.05);
    ctx.lineTo(s * 0.30, palmTop - s * 0.05);
    ctx.quadraticCurveTo(s * 0.46, palmTop, s * 0.40, s * 0.14);
    ctx.closePath();
    const palmG = ctx.createLinearGradient(-s * 0.4, palmTop, s * 0.4, s * 0.14);
    palmG.addColorStop(0, SKIN.dark);
    palmG.addColorStop(0.35, SKIN.lit);
    palmG.addColorStop(1, SKIN.mid);
    ctx.fillStyle = palmG;
    ctx.fill();

    for (let i = 0; i < 4; i++) {
      const t = i / 3;
      const fx = -s * 0.255 + i * s * 0.17 + (i - 1.5) * splay * s * 0.075;
      const lean = (i - 1.5) * (0.10 + splay * 0.30);
      const len = s * (0.50 - Math.abs(i - 1.2) * 0.045);
      drawFinger(ctx, fx, palmTop, len, fw, curls[i], lean,
        i === 3 ? SKIN.mid : SKIN.lit);
    }

    // Thumb, off the side of the palm.
    ctx.save();
    ctx.translate(-s * 0.38, -s * 0.02);
    ctx.rotate(-0.85 + thumbCurl * 0.75);
    drawFinger(ctx, 0, 0, s * 0.36, fw * 1.12, thumbCurl * 0.7, 0.25, SKIN.mid);
    ctx.restore();

    // Wrist shadow so the hand sits in front of the sleeve.
    ctx.fillStyle = Color.alpha('#000000', 0.22);
    ctx.fillRect(-s * 0.42, s * 0.06, s * 0.84, s * 0.07);

    ctx.restore();
    void skin;
  }

  /* ------------------------------------------------------------------
     Cursed energy gathered around a hand.
     ------------------------------------------------------------------ */
  function drawEnergy(ctx, x, y, r, color, core, intensity, t) {
    if (intensity <= 0.01) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    const g = ctx.createRadialGradient(x, y, 0, x, y, r * intensity);
    g.addColorStop(0, Color.alpha(core || '#ffffff', 0.9 * intensity));
    g.addColorStop(0.25, Color.alpha(color, 0.7 * intensity));
    g.addColorStop(0.6, Color.alpha(color, 0.22 * intensity));
    g.addColorStop(1, Color.alpha(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r * intensity, 0, M.TAU); ctx.fill();

    // Orbiting arcs.
    ctx.strokeStyle = Color.alpha(core || '#ffffff', 0.45 * intensity);
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 3; i++) {
      const a0 = t * (2.2 + i * 0.8) + i * 2.1;
      const rr = r * intensity * (0.34 + i * 0.13);
      ctx.beginPath();
      ctx.arc(x, y, rr, a0, a0 + 1.9);
      ctx.stroke();
    }
    // Sparks.
    for (let i = 0; i < 6; i++) {
      const a = t * 3 + i * 1.05;
      const rr = r * intensity * (0.7 + Math.sin(t * 5 + i) * 0.25);
      ctx.fillStyle = Color.alpha('#ffffff', 0.7 * intensity);
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr, 1.8, 0, M.TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ------------------------------------------------------------------
     Weapons.
     ------------------------------------------------------------------ */
  function drawWeapon(ctx, x, y, s, rot, def, glow, t) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);

    const L = s * def.len * 3.2;
    switch (def.type) {
      case 'spear': {
        // Shaft.
        const g = ctx.createLinearGradient(-s * 0.1, 0, s * 0.1, 0);
        g.addColorStop(0, Color.shade(def.color, 0.5));
        g.addColorStop(0.5, def.color);
        g.addColorStop(1, Color.shade(def.color, 0.6));
        ctx.fillStyle = g;
        ctx.fillRect(-s * 0.09, -L, s * 0.18, L + s * 1.6);
        // Blade.
        ctx.fillStyle = Color.shade(def.color, 1.25);
        ctx.beginPath();
        ctx.moveTo(0, -L - s * 0.95);
        ctx.lineTo(s * 0.20, -L - s * 0.1);
        ctx.lineTo(0, -L + s * 0.12);
        ctx.lineTo(-s * 0.20, -L - s * 0.1);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = Color.alpha(def.trim, 0.7);
        ctx.fillRect(-s * 0.13, -L + s * 0.1, s * 0.26, s * 0.14);
        break;
      }
      case 'blade': {
        ctx.fillStyle = Color.shade(def.color, 0.6);
        ctx.fillRect(-s * 0.08, 0, s * 0.16, s * 0.7);   // grip
        ctx.fillStyle = def.trim;
        ctx.fillRect(-s * 0.26, -s * 0.06, s * 0.52, s * 0.13); // guard
        const bg = ctx.createLinearGradient(-s * 0.12, 0, s * 0.12, 0);
        bg.addColorStop(0, Color.shade(def.color, 0.75));
        bg.addColorStop(0.4, '#ffffff');
        bg.addColorStop(1, Color.shade(def.color, 0.85));
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.moveTo(-s * 0.11, -s * 0.06);
        ctx.lineTo(s * 0.11, -s * 0.06);
        ctx.lineTo(s * 0.05, -L);
        ctx.lineTo(0, -L - s * 0.3);
        ctx.lineTo(-s * 0.09, -L);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'cleaver': {
        ctx.fillStyle = '#3a2c1c';
        ctx.fillRect(-s * 0.09, 0, s * 0.18, s * 0.8);
        ctx.fillStyle = def.trim;
        ctx.fillRect(-s * 0.22, -s * 0.05, s * 0.44, s * 0.11);
        ctx.fillStyle = def.color;
        ctx.beginPath();
        ctx.moveTo(-s * 0.16, -s * 0.05);
        ctx.lineTo(s * 0.16, -s * 0.05);
        ctx.lineTo(s * 0.22, -L);
        ctx.lineTo(-s * 0.10, -L);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = Color.alpha('#ffffff', 0.35);
        ctx.fillRect(s * 0.10, -L, s * 0.09, L);
        break;
      }
      case 'hammer': {
        ctx.fillStyle = '#6b4a32';
        ctx.fillRect(-s * 0.08, 0, s * 0.16, s * 0.9);
        ctx.fillStyle = def.color;
        ctx.fillRect(-s * 0.34, -L - s * 0.5, s * 0.68, s * 0.55);
        ctx.fillStyle = Color.alpha(def.trim, 0.8);
        ctx.fillRect(-s * 0.34, -L - s * 0.5, s * 0.68, s * 0.12);
        ctx.fillStyle = '#6b4a32';
        ctx.fillRect(-s * 0.07, -L, s * 0.14, L);
        break;
      }
      case 'gavel': {
        ctx.fillStyle = def.color;
        ctx.fillRect(-s * 0.07, 0, s * 0.14, s * 1.0);
        ctx.fillRect(-s * 0.06, -L, s * 0.12, L);
        ctx.fillStyle = Color.shade(def.color, 1.3);
        ctx.fillRect(-s * 0.30, -L - s * 0.42, s * 0.60, s * 0.46);
        ctx.fillStyle = Color.alpha(def.trim, 0.6);
        ctx.fillRect(-s * 0.30, -L - s * 0.42, s * 0.60, s * 0.09);
        break;
      }
      case 'claws': {
        // Cursed energy blades projecting from the knuckles.
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = -1; i <= 1; i++) {
          const off = i * s * 0.28;
          const wob = Math.sin(t * 8 + i) * s * 0.04;
          const g = ctx.createLinearGradient(off, 0, off + wob, -L);
          g.addColorStop(0, Color.alpha(def.trim, 0.9));
          g.addColorStop(0.6, Color.alpha(def.color, 0.75));
          g.addColorStop(1, Color.alpha(def.color, 0));
          ctx.strokeStyle = g;
          ctx.lineWidth = s * 0.13;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(off, 0);
          ctx.quadraticCurveTo(off + wob, -L * 0.5, off + wob * 2, -L);
          ctx.stroke();
          ctx.strokeStyle = Color.alpha('#ffffff', 0.8);
          ctx.lineWidth = s * 0.04;
          ctx.stroke();
        }
        ctx.restore();
        break;
      }
      default: break;
    }

    // Weapon glow trim.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = Color.alpha(glow, 0.12);
    ctx.fillRect(-s * 0.4, -L - s, s * 0.8, L + s * 2);
    ctx.restore();

    ctx.restore();
  }

  /* ==================================================================
     CAST STYLES

     Every character used to share one swing curve, so 23 sorcerers threw
     the same punch in different colours. Each style below choreographs the
     two hands independently — position, rotation, finger shape and where
     the cursed energy gathers.

     Several are lore-driven rather than invented:
       clap      Todo activates Boogie Woogie by clapping; no contact needed
       handsign  Megumi weaves a shadow puppet of the shikigami he wants
       speak     Inumaki's Cursed Speech leaves the MOUTH — the hand pulls
                 his collar down rather than throwing anything
       point     Gojo directs Limitless with an extended two-finger hand
       chop      Nanami's blunt cleaver comes down overhead

     Each returns hand poses in NORMALISED screen space (0..1), which the
     caller maps to pixels.
     ================================================================== */

  /* p = swing phase 0..1, r = reach 0..1 (already eased), t = time */
  const STYLES = {
    /* Straight boxing: hands alternate, so consecutive hits differ. */
    boxer(r, v) {
      const alt = v.swingParity ? -1 : 1;
      const lead = alt > 0 ? 'right' : 'left';
      const off = alt > 0 ? 0 : 1;
      return {
        right: { x: M.lerp(0.74, off ? 0.62 : 0.54, off ? r * 0.3 : r), y: M.lerp(1.00, off ? 0.86 : 0.60, r), rot: -0.32 + r * 0.4, shape: 'fist', scale: 1 + r * 0.34 },
        left:  { x: M.lerp(0.26, off ? 0.46 : 0.34, off ? r : r * 0.3), y: M.lerp(1.06, off ? 0.62 : 0.90, r), rot: 0.34 - r * 0.4, shape: 'fist', scale: 1 + (off ? r * 0.34 : 0) },
        energyHand: lead, energyAmt: r,
      };
    },

    /* Gojo: two fingers extended, hand held level and pushed forward. */
    point(r) {
      return {
        right: { x: M.lerp(0.72, 0.56, r), y: M.lerp(0.98, 0.56, r), rot: -0.9 + r * 0.35, shape: 'point', scale: 1 + r * 0.22 },
        left:  { x: 0.24, y: M.lerp(1.08, 0.98, r), rot: 0.4, shape: 'open', scale: 0.92 },
        energyHand: 'right', energyAmt: r * 1.15, energyAhead: 0.9,
      };
    },

    /* Sukuna: diagonal rake, both hands, claws out. */
    claw(r) {
      return {
        right: { x: M.lerp(0.80, 0.40, r), y: M.lerp(0.98, 0.58, r), rot: -0.7 + r * 1.9, shape: 'claw', scale: 1 + r * 0.4 },
        left:  { x: M.lerp(0.22, 0.60, r), y: M.lerp(1.06, 0.74, r), rot: 0.7 - r * 1.7, shape: 'claw', scale: 0.95 + r * 0.3 },
        energyHand: 'right', energyAmt: r * 0.8,
      };
    },

    /* Megumi: hands weave a shadow puppet low, then open toward the floor. */
    handsign(r) {
      const weave = M.hump(M.clamp(r * 1.6, 0, 1));
      const open = M.clamp((r - 0.5) / 0.5, 0, 1);
      return {
        right: { x: M.lerp(0.60, 0.66, open), y: M.lerp(0.96, 0.78, weave), rot: -0.5 - weave * 0.5 + open * 0.6, shape: open > 0.4 ? 'open' : 'point', scale: 0.96 + weave * 0.16 },
        left:  { x: M.lerp(0.40, 0.34, open), y: M.lerp(1.00, 0.80, weave), rot: 0.5 + weave * 0.5 - open * 0.6, shape: open > 0.4 ? 'open' : 'point', scale: 0.96 + weave * 0.16 },
        energyHand: 'mid', energyAmt: weave * 1.2, energyY: 0.80,
      };
    },

    /* Todo: the clap. Both hands slam together on the beat. */
    clap(r) {
      const close = M.clamp(r * 2.2, 0, 1);
      const snap = M.decay(M.clamp((r - 0.45) / 0.55, 0, 1));
      return {
        right: { x: M.lerp(0.82, 0.53, close), y: M.lerp(1.00, 0.66, close), rot: -1.15, shape: 'open', scale: 1 + close * 0.3 },
        left:  { x: M.lerp(0.18, 0.47, close), y: M.lerp(1.00, 0.66, close), rot: 1.15, shape: 'open', scale: 1 + close * 0.3 },
        energyHand: 'mid', energyAmt: snap * 1.6, energyY: 0.66,
      };
    },

    /* Inumaki: the hand pulls the collar down; the word does the work. */
    speak(r) {
      const pull = M.clamp(r * 2, 0, 1);
      return {
        right: { x: M.lerp(0.70, 0.60, pull), y: M.lerp(1.00, 0.74, pull), rot: -0.6 - pull * 0.5, shape: 'grip', scale: 0.95 },
        left:  { x: 0.26, y: 1.06, rot: 0.3, shape: 'fist', scale: 0.9 },
        // Energy erupts from the MOUTH — centre of frame, not the hand.
        energyHand: 'mouth', energyAmt: M.hump(r) * 1.5, energyY: 0.52,
      };
    },

    /* Nanami: two-handed overhead chop with the blunt cleaver. */
    chop(r) {
      const rise = M.clamp(r * 2.4, 0, 1);
      const fall = M.clamp((r - 0.42) / 0.58, 0, 1);
      const y = M.lerp(M.lerp(1.0, 0.42, rise), 0.88, fall);
      return {
        right: { x: M.lerp(0.66, 0.56, fall), y, rot: -0.25 + fall * 1.3, shape: 'grip', scale: 1 + rise * 0.2 },
        left:  { x: M.lerp(0.44, 0.42, fall), y: y + 0.07, rot: 0.2 + fall * 1.2, shape: 'grip', scale: 0.95 + rise * 0.15 },
        weaponHand: 'right', weaponRot: -0.25 + fall * 1.3,
        energyHand: 'right', energyAmt: fall * 0.5,
      };
    },

    /* Maki: a spear thrust straight down the sight line. */
    spear(r) {
      const pull = M.clamp(r * 2.6, 0, 1);
      const push = M.clamp((r - 0.38) / 0.62, 0, 1);
      const depth = M.lerp(M.lerp(0, -0.10, pull), 0.34, push);
      return {
        right: { x: 0.70 - depth * 0.18, y: 0.96 - depth * 0.42, rot: -0.5, shape: 'grip', scale: 1 + depth * 0.3 },
        left:  { x: 0.48 - depth * 0.10, y: 0.86 - depth * 0.30, rot: -0.5, shape: 'grip', scale: 0.9 + depth * 0.2 },
        weaponHand: 'right', weaponRot: -0.34,
        energyHand: 'right', energyAmt: push * 0.35,
      };
    },

    /* Toji: a short, brutally fast one-handed flick. */
    flick(r) {
      const snap = M.clamp((r - 0.2) / 0.25, 0, 1);
      return {
        right: { x: M.lerp(0.84, 0.46, snap), y: M.lerp(0.98, 0.68, snap), rot: -1.3 + snap * 2.4, shape: 'grip', scale: 1 + snap * 0.28 },
        left:  { x: 0.24, y: 1.05, rot: 0.35, shape: 'fist', scale: 0.88 },
        weaponHand: 'right', weaponRot: -1.3 + snap * 2.4,
        energyHand: 'right', energyAmt: 0,
      };
    },

    /* Nobara: hammer overhead, nail held in the off hand. */
    hammer(r) {
      const rise = M.clamp(r * 2.2, 0, 1);
      const fall = M.clamp((r - 0.45) / 0.55, 0, 1);
      return {
        right: { x: 0.70, y: M.lerp(M.lerp(1.0, 0.40, rise), 0.84, fall), rot: -0.6 + fall * 1.6, shape: 'grip', scale: 1 + rise * 0.22 },
        left:  { x: M.lerp(0.40, 0.48, fall), y: M.lerp(0.92, 0.80, fall), rot: 0.2, shape: 'point', scale: 0.9 },
        weaponHand: 'right', weaponRot: -0.6 + fall * 1.6,
        energyHand: 'left', energyAmt: fall * 0.8,
      };
    },

    /* Higuruma: the gavel comes down like a verdict. */
    gavel(r) {
      const rise = M.clamp(r * 2.0, 0, 1);
      const fall = M.clamp((r - 0.5) / 0.5, 0, 1);
      return {
        right: { x: 0.68, y: M.lerp(M.lerp(1.0, 0.36, rise), 0.86, fall), rot: -0.4 + fall * 1.5, shape: 'grip', scale: 1 + rise * 0.2 },
        left:  { x: 0.26, y: 1.04, rot: 0.3, shape: 'open', scale: 0.9 },
        weaponHand: 'right', weaponRot: -0.4 + fall * 1.5,
        energyHand: 'right', energyAmt: fall * 0.9,
      };
    },

    /* Ryu: both palms forward, braced like a cannon. */
    palmcannon(r) {
      const brace = M.clamp(r * 2.4, 0, 1);
      const fire = M.clamp((r - 0.4) / 0.6, 0, 1);
      return {
        right: { x: M.lerp(0.70, 0.60, fire), y: M.lerp(0.98, 0.66, brace), rot: -1.3, shape: 'open', scale: 1 + fire * 0.28 },
        left:  { x: M.lerp(0.30, 0.40, fire), y: M.lerp(1.02, 0.70, brace), rot: 1.3, shape: 'open', scale: 1 + fire * 0.28 },
        energyHand: 'mid', energyAmt: brace * 1.5, energyY: 0.66, energyAhead: 0.5,
      };
    },

    /* Jogo: one hand raised, fingers splayed, fire pooling above the palm. */
    flame(r, v) {
      const gather = M.clamp(r * 1.8, 0, 1);
      return {
        right: { x: M.lerp(0.72, 0.62, gather), y: M.lerp(0.96, 0.60, gather), rot: -1.5, shape: 'open', scale: 1 + gather * 0.24 },
        left:  { x: 0.26, y: 1.04, rot: 0.4, shape: 'claw', scale: 0.9 },
        energyHand: 'right', energyAmt: gather * 1.4 + (v.charge || 0) * 0.4, energyAhead: 0.5,
      };
    },

    /* Hanami: hands spread apart, growth pushing out between them. */
    growth(r) {
      const spread = M.clamp(r * 1.9, 0, 1);
      return {
        right: { x: M.lerp(0.68, 0.78, spread), y: M.lerp(0.98, 0.76, spread), rot: -0.9 - spread * 0.4, shape: 'open', scale: 1 + spread * 0.2 },
        left:  { x: M.lerp(0.32, 0.22, spread), y: M.lerp(1.02, 0.80, spread), rot: 0.9 + spread * 0.4, shape: 'open', scale: 1 + spread * 0.2 },
        energyHand: 'mid', energyAmt: spread * 1.3, energyY: 0.78,
      };
    },

    /* Choso: draws blood along the forearm, then flings it. */
    bloodarm(r) {
      const draw = M.clamp(r * 2.2, 0, 1);
      const fling = M.clamp((r - 0.45) / 0.55, 0, 1);
      return {
        right: { x: M.lerp(0.68, 0.50, fling), y: M.lerp(0.94, 0.62, fling), rot: -0.8 + fling * 1.0, shape: fling > 0.3 ? 'open' : 'claw', scale: 1 + fling * 0.3 },
        left:  { x: M.lerp(0.44, 0.30, fling), y: M.lerp(0.88, 1.02, fling), rot: 0.9, shape: 'point', scale: 0.9 },
        energyHand: 'right', energyAmt: draw * 1.1,
      };
    },

    /* Geto: palm up, releasing the curse he swallowed. */
    release(r) {
      const open = M.clamp(r * 1.8, 0, 1);
      return {
        right: { x: M.lerp(0.70, 0.60, open), y: M.lerp(0.98, 0.72, open), rot: -1.55, shape: 'open', scale: 1 + open * 0.3 },
        left:  { x: 0.28, y: 1.02, rot: 0.5, shape: 'fist', scale: 0.9 },
        energyHand: 'right', energyAmt: open * 1.45, energyAhead: 0.35,
      };
    },

    /* Mahito: a slow, deliberate open-palm reach for your soul. */
    soul(r) {
      const reach = M.smoothstep(M.clamp(r * 1.5, 0, 1));
      return {
        right: { x: M.lerp(0.72, 0.52, reach), y: M.lerp(0.98, 0.54, reach), rot: -1.45 + reach * 0.3, shape: 'open', scale: 1 + reach * 0.45 },
        left:  { x: 0.28, y: M.lerp(1.04, 0.94, reach), rot: 0.6, shape: 'claw', scale: 0.9 },
        energyHand: 'right', energyAmt: reach * 0.9,
      };
    },

    /* Kashimo: a sweeping arc, arcs crawling between the hands. */
    staff(r) {
      const sweep = M.clamp(r * 1.7, 0, 1);
      return {
        right: { x: M.lerp(0.80, 0.44, sweep), y: M.lerp(0.96, 0.70, sweep), rot: -0.4 + sweep * 1.8, shape: 'grip', scale: 1 + sweep * 0.3 },
        left:  { x: M.lerp(0.30, 0.58, sweep), y: M.lerp(1.02, 0.84, sweep), rot: 0.5 - sweep * 1.2, shape: 'grip', scale: 0.95 },
        energyHand: 'mid', energyAmt: sweep * 1.35, energyY: 0.76,
      };
    },

    /* Hakari: slams the lever, then throws the doors open. */
    slot(r) {
      const pull = M.clamp(r * 2.4, 0, 1);
      const slam = M.clamp((r - 0.42) / 0.58, 0, 1);
      return {
        right: { x: M.lerp(0.80, 0.66, slam), y: M.lerp(M.lerp(1.0, 0.62, pull), 0.92, slam), rot: -0.9 + slam * 1.1, shape: 'grip', scale: 1 + pull * 0.25 },
        left:  { x: M.lerp(0.24, 0.36, slam), y: M.lerp(1.04, 0.86, slam), rot: 0.6, shape: 'open', scale: 0.92 },
        energyHand: 'right', energyAmt: slam * 1.2,
      };
    },

    /* Yuta / Mahoraga: a heavy two-handed sword cut. */
    sword(r) {
      const rise = M.clamp(r * 2.2, 0, 1);
      const cut = M.clamp((r - 0.4) / 0.6, 0, 1);
      return {
        right: { x: M.lerp(M.lerp(0.72, 0.84, rise), 0.40, cut), y: M.lerp(M.lerp(1.0, 0.50, rise), 0.86, cut), rot: M.lerp(-0.9, 1.5, cut), shape: 'grip', scale: 1 + rise * 0.2 },
        left:  { x: M.lerp(M.lerp(0.50, 0.66, rise), 0.34, cut), y: M.lerp(M.lerp(0.98, 0.60, rise), 0.92, cut), rot: M.lerp(-0.7, 1.3, cut), shape: 'grip', scale: 0.95 },
        weaponHand: 'right', weaponRot: M.lerp(-0.9, 1.5, cut),
        energyHand: 'right', energyAmt: cut * 0.7,
      };
    },
  };

  /** Character -> cast style. */
  const CHAR_STYLE = {
    gojo: 'point', gojofull: 'point',
    yuji: 'boxer', todo: 'clap',
    sukuna: 'claw', meguna: 'claw',
    megumi: 'handsign',
    yuta: 'sword', mahoraga: 'sword',
    hakari: 'slot',
    maki: 'spear', toji: 'flick',
    nobara: 'hammer', higuruma: 'gavel',
    nanami: 'chop',
    inumaki: 'speak',
    choso: 'bloodarm', geto: 'release',
    mahito: 'soul', kashimo: 'staff',
    ryu: 'palmcannon', jogo: 'flame', hanami: 'growth',
  };

  /* ==================================================================
     Main draw.

     v = {
       charId, color, glow, t,
       bobX, bobY, lean, swing, swingType, swingParity,
       charge, zone, domain, hurt
     }
     ================================================================== */
  function draw(ctx, W, H, v) {
    // A viewmodel hand belongs in the bottom corner of the frame. At
    // H * 0.20 these filled a quarter of the screen and buried the world.
    const s = H * 0.115;
    const t = v.t;
    const weapon = WEAPONS[v.charId] || null;
    const style = STYLES[CHAR_STYLE[v.charId]] || STYLES.boxer;

    // Shared three-beat curve: anticipation, snap past rest, settle back.
    const sw = M.clamp(v.swing, 0, 1);
    let r = 0;
    if (sw > 0) {
      if (sw < 0.25) r = -0.22 * M.smoothstep(sw / 0.25);
      else if (sw < 0.45) r = M.lerp(-0.22, 1.0, M.smoothstep((sw - 0.25) / 0.20));
      else {
        const f = (sw - 0.45) / 0.55;
        r = 1.0 * (1 - M.smoothstep(f)) - 0.12 * Math.sin(f * Math.PI);
      }
    }
    const pose = style(M.clamp(r, -0.3, 1.2), v);

    const bobX = v.bobX * s * 0.10;
    const bobY = v.bobY * s * 0.10;
    const lean = v.lean || 0;
    const hurt = v.hurt || 0;

    const skin = '#d8b08c';
    const cuff = Color.shade(v.color, 0.55);

    /* Styles author y in a generous 0.4..1.1 range for choreography, but
       hands that climb to mid-screen block the fight. Remap so rest sits
       just off the bottom edge and full extension still stays in the lower
       third, keeping the animation shape without eating the view. */
    const mapY = (yy) => 1.06 - (1.06 - yy) * 0.46;
    const place = (h, sideSign) => ({
      x: 0.5 + (h.x - 0.5) * 1.12,   // push wider, toward the corners
      y: mapY(h.y),
      rot: h.rot + lean * 0.5 * sideSign,
      scale: s * (h.scale || 1),
      shape: h.shape,
      sideSign,
    });

    const L0 = place(pose.left, -1);
    const R0 = place(pose.right, 1);
    const toPx = (h) => ({
      x: h.x * W + bobX - lean * W * 0.03 * h.sideSign,
      y: h.y * H + bobY + hurt * H * 0.05,
      rot: h.rot, scale: h.scale, shape: h.shape,
    });
    const L = toPx(L0);
    const R = toPx(R0);

    /* ---- left hand (behind) ---- */
    drawHand(ctx, L.x, L.y, L.scale * 0.94, L.rot, L.shape, -1, skin, cuff, v.glow);
    if (pose.weaponHand === 'left' && weapon) {
      drawWeapon(ctx, L.x, L.y - s * 0.2, L.scale, pose.weaponRot || L.rot, weapon, v.glow, t);
    }

    /* ---- weapon + right hand ---- */
    if (weapon && pose.weaponHand !== 'left') {
      drawWeapon(ctx, R.x, R.y - s * 0.2, R.scale, (pose.weaponRot ?? R.rot) + 0.15, weapon, v.glow, t);
    }
    drawHand(ctx, R.x, R.y, R.scale, R.rot, R.shape, 1, skin, cuff, v.glow);

    /* ---- cursed energy, wherever this technique gathers it ---- */
    // Only while a technique is actually being thrown. A resting glow reads
    // as a permanent HUD blob, not as cursed energy.
    const amt = M.clamp((pose.energyAmt || 0) * (sw > 0 ? 1 : 0) + v.charge * 0.6, 0, 1.4);
    if (amt > 0.06) {
      let ex, ey;
      const ahead = pose.energyAhead || 0;
      if (pose.energyHand === 'mid') { ex = (L.x + R.x) / 2; ey = (pose.energyY || 0.75) * H; }
      else if (pose.energyHand === 'mouth') { ex = W / 2; ey = (pose.energyY || 0.55) * H; }
      else if (pose.energyHand === 'left') { ex = L.x; ey = L.y - s * 0.55; }
      else { ex = R.x; ey = R.y - s * 0.55; }
      ex = M.lerp(ex, W / 2, ahead);
      ey = M.lerp(ey, H * 0.52, ahead);
      drawEnergy(ctx, ex, ey, s * 1.15, v.color, '#ffffff', M.clamp(amt, 0, 1.2), t);
    }

    /* ---- zone / domain aura ---- */
    if (v.zone > 0.01 || v.domain > 0.01) {
      const a = Math.max(v.zone, v.domain);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(0, H, 0, H * 0.55);
      g.addColorStop(0, Color.alpha(v.glow, 0.30 * a));
      g.addColorStop(1, Color.alpha(v.glow, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, H * 0.55, W, H * 0.45);
      ctx.restore();
    }
  }

  JJK.Viewmodel = { draw, WEAPONS, STYLES, CHAR_STYLE };
})(window.JJK);
