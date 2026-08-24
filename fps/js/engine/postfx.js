/* ==========================================================================
   POST FX — the layer that makes hits feel like hits.

   Techniques, and what each one is doing:

   IMPACT FRAME   one inverted frame at the moment of contact. Done with a
                  'difference' composite against white, which inverts the
                  whole screen in a single op. This is the single most
                  "anime" trick available and it costs nothing.
   HITSTOP        the game loop freezes simulation for 60-140ms on a heavy
                  hit; postfx holds a white rim during the freeze so the
                  pause reads as impact rather than as a dropped frame.
   CHROMATIC AB.  the buffer is re-drawn twice, channel-isolated via a
                  'multiply' pass, offset in opposite directions. Only runs
                  during impacts, so the cost is bounded.
   SPEED LINES    radial strokes from the focal point. Fires on dash, crit
                  and ultimate — reads as sakuga motion smear.
   FOV KICK       driven on the camera, not here, but it lands with these.
   COLOUR GRADE   during a domain the world desaturates SLIGHTLY. It used to
                  drain almost to grey under a near-opaque overlay, which
                  made domains unplayable — you could not see the arena or
                  the enemies. The arena repaint now lives in the renderer
                  (Renderer.setDomainTheme); everything here is a light
                  motif layer on top of a world you can still read.
   ========================================================================== */

(function (JJK) {
  'use strict';

  const { M, Color, makeCanvas } = JJK;

  const S = {
    shake: 0, shakeDecay: 3.4,
    shakeX: 0, shakeY: 0,
    flashA: 0, flashColor: '#ffffff', flashDecay: 4.0,
    invert: 0,
    ca: 0,
    lines: 0, linesColor: '#ffffff',
    vignette: 0,
    lowHealth: 0,
    zone: 0,
    hitstopGlow: 0,
    damageDirs: [],
    domain: null,       // { def, t, life, phase }
    grade: 0,           // desaturation 0..1
    gradeColor: '#000000',
    time: 0,
    rings: [],          // screen-space shockwave rings
  };

  let scratchA = null, scratchB = null;

  function ensureScratch(w, h) {
    if (!scratchA || scratchA.canvas.width !== w || scratchA.canvas.height !== h) {
      scratchA = makeCanvas(w, h);
      scratchB = makeCanvas(w, h);
    }
  }

  /* ------------------------------------------------------------------
     Triggers
     ------------------------------------------------------------------ */

  /** Generic impact. All fields optional. */
  function impact(o) {
    if (o.shake) S.shake = Math.max(S.shake, o.shake);
    if (o.flash) {
      S.flashA = Math.max(S.flashA, o.flash);
      S.flashColor = o.color || '#ffffff';
    }
    if (o.invert) S.invert = Math.max(S.invert, o.invert);
    if (o.ca) S.ca = Math.max(S.ca, o.ca);
    if (o.lines) {
      S.lines = Math.max(S.lines, o.lines);
      S.linesColor = o.linesColor || o.color || '#ffffff';
    }
    if (o.ring) S.rings.push({ t: 0, life: o.ringLife || 0.45, color: o.color || '#ffffff', w: o.ringWidth || 6 });
  }

  /** The signature. Invert, sub-shake, red/black lightning, hard CA. */
  function blackFlash() {
    S.invert = 1;
    S.flashA = 0.9;
    S.flashColor = '#ff0033';
    S.shake = 1.5;
    S.ca = 1;
    S.lines = 1;
    S.linesColor = '#ff2244';
    S.rings.push({ t: 0, life: 0.5, color: '#ff0044', w: 10 });
  }

  function boneCrush() {
    S.flashA = 0.55; S.flashColor = '#ffffff';
    S.shake = 1.1; S.ca = 0.6; S.lines = 0.7; S.linesColor = '#ffffff';
    S.rings.push({ t: 0, life: 0.4, color: '#e8ffe8', w: 8 });
  }

  /** Called when the player takes damage from a world direction. */
  function damageFrom(angleRelToView, amount) {
    S.damageDirs.push({ a: angleRelToView, t: 0, life: 1.1, mag: M.clamp(amount / 60, 0.3, 1.4) });
    S.flashA = Math.max(S.flashA, M.clamp(amount / 120, 0.12, 0.5));
    S.flashColor = '#ff2a2a';
    S.shake = Math.max(S.shake, M.clamp(amount / 55, 0.2, 1.1));
    S.vignette = Math.min(1, S.vignette + amount / 140);
  }

  function openDomain(def) {
    S.domain = { def, t: 0, life: def.duration, phase: 'open' };
    S.flashA = 1; S.flashColor = def.palette.c;
    S.shake = 1.3; S.ca = 0.8; S.lines = 1; S.linesColor = def.palette.b;
    S.invert = 0.6;
  }
  function closeDomain() {
    if (S.domain) S.domain.phase = 'close';
  }

  function setZone(on) { S.zone = on ? 1 : 0; }
  function setLowHealth(frac) { S.lowHealth = M.clamp(1 - frac / 0.35, 0, 1); }
  function hitstop(strength) { S.hitstopGlow = Math.max(S.hitstopGlow, strength); }

  function reset() {
    S.shake = S.flashA = S.invert = S.ca = S.lines = S.vignette = 0;
    S.lowHealth = S.zone = S.hitstopGlow = S.grade = 0;
    S.damageDirs.length = 0;
    S.rings.length = 0;
    S.domain = null;
  }

  /* ------------------------------------------------------------------
     Update
     ------------------------------------------------------------------ */
  function update(dt) {
    S.time += dt;

    S.shake = Math.max(0, S.shake - S.shakeDecay * dt);
    const amp = S.shake * S.shake;   // squared falloff = snappier settle
    S.shakeX = M.spread(1) * amp * 14;
    S.shakeY = M.spread(1) * amp * 14;

    S.flashA = Math.max(0, S.flashA - S.flashDecay * dt);
    S.invert = Math.max(0, S.invert - dt / 0.055);      // ~1 frame at 60fps
    S.ca = Math.max(0, S.ca - dt * 3.2);
    S.lines = Math.max(0, S.lines - dt * 3.6);
    S.vignette = Math.max(0, S.vignette - dt * 0.85);
    S.hitstopGlow = Math.max(0, S.hitstopGlow - dt * 7);

    for (let i = S.damageDirs.length - 1; i >= 0; i--) {
      const d = S.damageDirs[i];
      d.t += dt;
      if (d.t >= d.life) S.damageDirs.splice(i, 1);
    }
    for (let i = S.rings.length - 1; i >= 0; i--) {
      const r = S.rings[i];
      r.t += dt;
      if (r.t >= r.life) S.rings.splice(i, 1);
    }

    if (S.domain) {
      const d = S.domain;
      d.t += dt;
      if (d.phase === 'open' && d.t >= d.life) d.phase = 'close';
      if (d.phase === 'close' && d.t >= d.life + 0.9) S.domain = null;
      S.grade = M.damp(S.grade, d.phase === 'close' ? 0 : 1, 6, dt);
    } else {
      S.grade = M.damp(S.grade, 0, 6, dt);
    }
  }

  /* ==================================================================
     DOMAIN OVERLAYS — drawn into the world buffer, under the HUD.
     ================================================================== */
  const DOMAIN_STYLES = {

    /* Unlimited Void: converging perspective grid + falling information. */
    void(ctx, W, H, p, t, a) {
      ctx.fillStyle = Color.alpha(p.bg, 0.26 * a);
      ctx.fillRect(0, 0, W, H);

      const cx = W / 2, cy = H / 2;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      // Radial convergence lines.
      ctx.strokeStyle = Color.alpha(p.b, 0.30 * a);
      ctx.lineWidth = 1;
      for (let i = 0; i < 48; i++) {
        const ang = (i / 48) * M.TAU + t * 0.06;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * 30, cy + Math.sin(ang) * 30);
        ctx.lineTo(cx + Math.cos(ang) * W, cy + Math.sin(ang) * W);
        ctx.stroke();
      }
      // Concentric depth rings receding to the vanishing point.
      for (let i = 0; i < 14; i++) {
        const f = ((t * 0.35 + i / 14) % 1);
        const r = f * f * W * 0.85;
        ctx.strokeStyle = Color.alpha(p.b, 0.35 * (1 - f) * a);
        ctx.lineWidth = 1 + f * 2.5;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, M.TAU); ctx.stroke();
      }
      ctx.restore();

      // Streaming glyph columns — "too much information".
      const glyphs = '∞無量空処0123456789';
      const cols = Math.floor(W / 22);
      ctx.font = `${Math.round(H / 34)}px "Courier New", monospace`;
      ctx.textAlign = 'center';
      for (let c = 0; c < cols; c++) {
        const x = (c + 0.5) * 22;
        const seed = (c * 9301 + 49297) % 233280;
        const speed = 60 + (seed % 120);
        const yOff = (t * speed + seed % H) % (H + 120);
        for (let r = 0; r < 5; r++) {
          const y = yOff - r * 26;
          if (y < -20 || y > H + 20) continue;
          const ch = glyphs[(c * 7 + r * 3 + Math.floor(t * 9)) % glyphs.length];
          ctx.fillStyle = Color.alpha(r === 0 ? p.c : p.b, (0.75 - r * 0.14) * a);
          ctx.fillText(ch, x, y);
        }
      }
      ctx.textAlign = 'left';
    },

    /* Malevolent Shrine / Soul Shrine: unending slashes + a bone lattice. */
    shrine(ctx, W, H, p, t, a) {
      ctx.fillStyle = Color.alpha(p.bg, 0.24 * a);
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      // The shrine structure: an arched bone lattice.
      ctx.strokeStyle = Color.alpha(p.b, 0.22 * a);
      ctx.lineWidth = 2;
      const cx = W / 2, base = H * 0.92;
      for (let i = 0; i < 9; i++) {
        const f = i / 8;
        const rw = W * (0.14 + f * 0.42);
        const rh = H * (0.30 + f * 0.55);
        ctx.beginPath();
        ctx.ellipse(cx, base, rw, rh, 0, Math.PI, M.TAU);
        ctx.stroke();
      }
      // Ribs.
      for (let i = -5; i <= 5; i++) {
        const ang = Math.PI + (i / 5) * (Math.PI / 2) * 0.9;
        ctx.beginPath();
        ctx.moveTo(cx, base);
        ctx.lineTo(cx + Math.cos(ang) * W * 0.56, base + Math.sin(ang) * H * 0.85);
        ctx.stroke();
      }

      // Relentless slashes.
      const n = 26;
      for (let i = 0; i < n; i++) {
        const seed = i * 12.9898;
        const ph = (t * 1.9 + (seed % 1)) % 1;
        if (ph > 0.42) continue;
        const alpha = (1 - ph / 0.42) * a;
        const ang = ((seed * 43758.5453) % 1) * M.TAU;
        const len = W * (0.5 + ((seed * 7.13) % 1) * 0.7);
        const ox = ((seed * 3.7) % 1) * W;
        const oy = ((seed * 5.1) % 1) * H;
        ctx.strokeStyle = Color.alpha(i % 4 === 0 ? p.c : p.b, alpha * 0.85);
        ctx.lineWidth = i % 4 === 0 ? 3 : 1.6;
        ctx.beginPath();
        ctx.moveTo(ox - Math.cos(ang) * len, oy - Math.sin(ang) * len);
        ctx.lineTo(ox + Math.cos(ang) * len, oy + Math.sin(ang) * len);
        ctx.stroke();
      }
      ctx.restore();
    },

    /* Shadow / soul gardens: rippling floor, silhouettes rising. */
    garden(ctx, W, H, p, t, a) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, Color.alpha(p.bg, 0.30 * a));
      g.addColorStop(0.55, Color.alpha(p.a, 0.10 * a));
      g.addColorStop(1, Color.alpha(p.bg, 0.34 * a));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // Shadow ripples across the lower half.
      for (let i = 0; i < 10; i++) {
        const f = ((t * 0.5 + i / 10) % 1);
        const y = H * 0.52 + f * H * 0.5;
        ctx.strokeStyle = Color.alpha(p.b, 0.22 * (1 - f) * a);
        ctx.lineWidth = 1 + f * 3;
        ctx.beginPath();
        for (let x = 0; x <= W; x += 12) {
          const yy = y + Math.sin(x * 0.02 + t * 2 + i) * 6 * f;
          if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
      // Rising silhouettes.
      for (let i = 0; i < 12; i++) {
        const seed = i * 17.31;
        const x = ((seed * 3.1) % 1) * W;
        const ph = ((t * 0.32 + (seed % 1)) % 1);
        const h = H * 0.30 * ph;
        const w = 10 + ((seed * 5.7) % 1) * 22;
        ctx.fillStyle = Color.alpha(p.b, 0.16 * (1 - ph) * a);
        ctx.beginPath();
        ctx.ellipse(x, H - h * 0.4, w, h, 0, 0, M.TAU);
        ctx.fill();
      }
      ctx.restore();
    },

    /* Bloom: petals, hearts, a soft radial wash. */
    bloom(ctx, W, H, p, t, a) {
      ctx.fillStyle = Color.alpha(p.bg, 0.22 * a);
      ctx.fillRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2;
      const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.7);
      rg.addColorStop(0, Color.alpha(p.b, 0.30 * a));
      rg.addColorStop(1, Color.alpha(p.a, 0));
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 40; i++) {
        const seed = i * 23.77;
        const ph = ((t * 0.28 + (seed % 1)) % 1);
        const x = ((seed * 3.3) % 1) * W + Math.sin(t * 1.4 + i) * 26;
        const y = ph * (H + 60) - 30;
        const s = 3 + ((seed * 7.9) % 1) * 7;
        ctx.fillStyle = Color.alpha(i % 3 === 0 ? p.c : p.b, 0.5 * (1 - Math.abs(ph - 0.5) * 2) * a);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(t * 1.2 + i);
        ctx.beginPath();
        ctx.ellipse(0, 0, s, s * 0.5, 0, 0, M.TAU);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    },

    /* Inferno: heat gradient, rising embers, shimmer bands. */
    inferno(ctx, W, H, p, t, a) {
      const g = ctx.createLinearGradient(0, H, 0, 0);
      g.addColorStop(0, Color.alpha(p.b, 0.22 * a));
      g.addColorStop(0.4, Color.alpha(p.a, 0.16 * a));
      g.addColorStop(1, Color.alpha(p.bg, 0.26 * a));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // Embers.
      for (let i = 0; i < 60; i++) {
        const seed = i * 31.7;
        const ph = ((t * 0.55 + (seed % 1)) % 1);
        const x = ((seed * 2.9) % 1) * W + Math.sin(t * 3 + i) * 14;
        const y = H - ph * H;
        const s = 1 + ((seed * 6.1) % 1) * 3;
        ctx.fillStyle = Color.alpha(ph > 0.7 ? p.c : p.b, 0.8 * (1 - ph) * a);
        ctx.beginPath(); ctx.arc(x, y, s, 0, M.TAU); ctx.fill();
      }
      // Heat shimmer bands.
      for (let i = 0; i < 6; i++) {
        const y = H * (0.5 + i * 0.09) + Math.sin(t * 2.4 + i) * 8;
        ctx.strokeStyle = Color.alpha(p.c, 0.06 * a);
        ctx.lineWidth = 14;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      ctx.restore();
    },

    /* Courtroom: cold grey, a spotlight, falling verdict text. */
    court(ctx, W, H, p, t, a) {
      ctx.fillStyle = Color.alpha(p.bg, 0.24 * a);
      ctx.fillRect(0, 0, W, H);
      const cx = W / 2;
      const sg = ctx.createRadialGradient(cx, H * 0.1, 0, cx, H * 0.1, H * 1.0);
      sg.addColorStop(0, Color.alpha(p.c, 0.22 * a));
      sg.addColorStop(1, Color.alpha(p.c, 0));
      ctx.fillStyle = sg;
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = Color.alpha(p.b, 0.25 * a);
      ctx.lineWidth = 1.5;
      // Ledger rules.
      for (let i = 0; i < 18; i++) {
        const y = ((t * 34 + i * 40) % (H + 40)) - 20;
        ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.moveTo(W * 0.1, y); ctx.lineTo(W * 0.9, y); ctx.stroke();
      }
      // Gavel strike pulse.
      const pulse = (t * 1.2) % 1;
      if (pulse < 0.2) {
        ctx.strokeStyle = Color.alpha(p.c, (1 - pulse / 0.2) * 0.6 * a);
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(cx, H * 0.5, pulse * W * 0.8, 0, M.TAU); ctx.stroke();
      }
      ctx.restore();
    },

    /* Idle Death Gamble: pachinko gold, spinning reels, 777. */
    gamble(ctx, W, H, p, t, a) {
      ctx.fillStyle = Color.alpha(p.bg, 0.24 * a);
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // Falling pachinko balls.
      for (let i = 0; i < 70; i++) {
        const seed = i * 19.13;
        const ph = ((t * 0.75 + (seed % 1)) % 1);
        const x = ((seed * 4.1) % 1) * W + Math.sin(t * 4 + i) * 10;
        const y = ph * (H + 40) - 20;
        ctx.fillStyle = Color.alpha(i % 5 === 0 ? p.c : p.b, 0.7 * a);
        ctx.beginPath(); ctx.arc(x, y, 3, 0, M.TAU); ctx.fill();
      }
      // Reel bands.
      const reelH = H * 0.24, reelY = H * 0.38;
      for (let r = 0; r < 3; r++) {
        const rx = W * (0.3 + r * 0.2);
        ctx.fillStyle = Color.alpha(p.a, 0.5 * a);
        ctx.fillRect(rx - W * 0.07, reelY, W * 0.14, reelH);
        ctx.font = `bold ${Math.round(reelH * 0.6)}px "Courier New", monospace`;
        ctx.textAlign = 'center';
        const spin = Math.floor(t * (9 + r * 4)) % 10;
        ctx.fillStyle = Color.alpha(spin === 7 ? p.c : p.b, 0.9 * a);
        ctx.fillText(String(spin), rx, reelY + reelH * 0.72);
      }
      ctx.textAlign = 'left';
      ctx.restore();
    },
  };

  /**
   * Feature-test the 'saturation' blend mode once.
   * Assigning an unsupported globalCompositeOperation is a silent no-op —
   * the context keeps its previous value. Without this check, a browser
   * lacking the CSS blend modes would fall back to 'source-over' and paint
   * the entire screen flat red instead of desaturating it.
   */
  let SATURATION_OK = null;
  function canSaturate() {
    if (SATURATION_OK === null) {
      const t = makeCanvas(1, 1).ctx;
      t.globalCompositeOperation = 'saturation';
      SATURATION_OK = t.globalCompositeOperation === 'saturation';
    }
    return SATURATION_OK;
  }

  /** Domain overlay + colour grade, drawn into the world buffer. */
  function world(ctx, W, H) {
    // Desaturate the world under a domain so the domain reads as dominant.
    if (S.grade > 0.01 && canSaturate()) {
      ctx.save();
      ctx.globalCompositeOperation = 'saturation';
      ctx.fillStyle = `hsl(0, ${Math.round((1 - S.grade * 0.30) * 100)}%, 50%)`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    if (S.domain) {
      const d = S.domain;
      const def = d.def;
      // Ramp in over 0.5s, out over 0.9s.
      let a;
      if (d.phase === 'open') a = M.smoothstep(d.t / 0.5);
      else a = M.clamp(1 - (d.t - d.life) / 0.9, 0, 1);
      a = M.clamp(a, 0, 1);
      if (a > 0.01) {
        const fn = DOMAIN_STYLES[def.style] || DOMAIN_STYLES.void;
        ctx.save();
        fn(ctx, W, H, def.palette, S.time, a);
        ctx.restore();
      }
    }

    // Zone (Black Flash high) — warm rim on the world.
    if (S.zone > 0.01) {
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.85);
      g.addColorStop(0, 'rgba(255,60,60,0)');
      g.addColorStop(1, `rgba(255,50,60,${0.20 * S.zone})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    // Radial speed lines.
    if (S.lines > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const cx = W / 2, cy = H / 2;
      const n = 54;
      const strength = S.lines;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * M.TAU + i * 0.37;
        const inner = H * (0.22 + ((i * 7919) % 100) / 400);
        const outer = W * 0.9;
        ctx.strokeStyle = Color.alpha(S.linesColor, 0.30 * strength * (0.4 + ((i * 104729) % 100) / 160));
        ctx.lineWidth = 1 + ((i % 5) === 0 ? 2.5 : 0.6) * strength;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * inner, cy + Math.sin(ang) * inner);
        ctx.lineTo(cx + Math.cos(ang) * outer, cy + Math.sin(ang) * outer);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  /* ==================================================================
     Present: blit the world buffer to the display with shake + CA.
     ================================================================== */
  function present(dctx, buf, dw, dh) {
    const ox = S.shakeX * (dw / 900);
    const oy = S.shakeY * (dh / 600);
    // Recorded so the HUD can offset world-anchored elements (damage
    // numbers, enemy health bars) by the same shake the world just took.
    S.lastOx = ox;
    S.lastOy = oy;

    dctx.save();
    dctx.imageSmoothingEnabled = true;

    if (S.ca > 0.02) {
      const w = buf.width, h = buf.height;
      ensureScratch(w, h);
      const shift = S.ca * 7;

      // Channel isolation: multiply by pure red / cyan.
      const a = scratchA.ctx, b = scratchB.ctx;
      a.globalCompositeOperation = 'source-over';
      a.clearRect(0, 0, w, h);
      a.drawImage(buf, 0, 0);
      a.globalCompositeOperation = 'multiply';
      a.fillStyle = '#ff0000';
      a.fillRect(0, 0, w, h);

      b.globalCompositeOperation = 'source-over';
      b.clearRect(0, 0, w, h);
      b.drawImage(buf, 0, 0);
      b.globalCompositeOperation = 'multiply';
      b.fillStyle = '#00ffff';
      b.fillRect(0, 0, w, h);

      dctx.globalCompositeOperation = 'source-over';
      dctx.drawImage(buf, ox, oy, dw, dh);
      dctx.globalCompositeOperation = 'lighter';
      dctx.globalAlpha = 0.55;
      dctx.drawImage(scratchA.canvas, ox - shift, oy, dw, dh);
      dctx.drawImage(scratchB.canvas, ox + shift, oy, dw, dh);
      dctx.globalAlpha = 1;
      dctx.globalCompositeOperation = 'source-over';
    } else {
      dctx.drawImage(buf, ox, oy, dw, dh);
    }
    dctx.restore();
  }

  /* ==================================================================
     Screen pass: impact frame, flash, vignette, damage arrows, rings.
     ================================================================== */
  function screen(dctx, W, H) {
    // 1. IMPACT FRAME — invert the whole screen for a frame.
    if (S.invert > 0.02) {
      dctx.save();
      dctx.globalCompositeOperation = 'difference';
      dctx.globalAlpha = M.clamp(S.invert, 0, 1);
      dctx.fillStyle = '#ffffff';
      dctx.fillRect(0, 0, W, H);
      dctx.restore();
    }

    // 2. Screen-space shockwave rings.
    if (S.rings.length) {
      dctx.save();
      dctx.globalCompositeOperation = 'lighter';
      for (const r of S.rings) {
        const f = r.t / r.life;
        const rad = f * Math.max(W, H) * 0.75;
        dctx.strokeStyle = Color.alpha(r.color, (1 - f) * 0.5);
        dctx.lineWidth = r.w * (1 - f * 0.6);
        dctx.beginPath();
        dctx.arc(W / 2, H / 2, rad, 0, M.TAU);
        dctx.stroke();
      }
      dctx.restore();
    }

    // 3. Full-screen colour flash.
    if (S.flashA > 0.01) {
      dctx.save();
      dctx.globalCompositeOperation = 'lighter';
      dctx.fillStyle = Color.alpha(S.flashColor, M.clamp(S.flashA, 0, 1) * 0.75);
      dctx.fillRect(0, 0, W, H);
      dctx.restore();
    }

    // 4. Hitstop rim — makes the freeze read as impact.
    if (S.hitstopGlow > 0.02) {
      const g = dctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.75);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(1, `rgba(255,255,255,${0.30 * S.hitstopGlow})`);
      dctx.fillStyle = g;
      dctx.fillRect(0, 0, W, H);
    }

    // 5. Damage vignette + low-health pulse.
    const lowPulse = S.lowHealth * (0.55 + 0.45 * Math.sin(S.time * 6.5));
    const vig = M.clamp(S.vignette * 0.8 + lowPulse * 0.7, 0, 1);
    if (vig > 0.01) {
      const g = dctx.createRadialGradient(W / 2, H / 2, H * 0.22, W / 2, H / 2, H * 0.82);
      g.addColorStop(0, 'rgba(120,0,0,0)');
      g.addColorStop(1, `rgba(150,0,10,${vig * 0.72})`);
      dctx.fillStyle = g;
      dctx.fillRect(0, 0, W, H);
    }

    // 6. Constant cinematic vignette — cheap depth.
    const cg = dctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
    cg.addColorStop(0, 'rgba(0,0,0,0)');
    cg.addColorStop(1, 'rgba(0,0,0,0.45)');
    dctx.fillStyle = cg;
    dctx.fillRect(0, 0, W, H);

    // 7. Directional damage indicators.
    if (S.damageDirs.length) {
      const cx = W / 2, cy = H / 2;
      const rad = Math.min(W, H) * 0.31;
      dctx.save();
      for (const d of S.damageDirs) {
        const f = 1 - d.t / d.life;
        if (f <= 0) continue;
        dctx.save();
        dctx.translate(cx, cy);
        dctx.rotate(d.a);
        dctx.globalAlpha = f * 0.85;
        dctx.strokeStyle = '#ff3344';
        dctx.lineWidth = 4 * d.mag;
        dctx.beginPath();
        dctx.arc(0, 0, rad, -0.32, 0.32);
        dctx.stroke();
        // Arrow head at the arc's midpoint.
        dctx.beginPath();
        dctx.moveTo(rad + 12 * d.mag, 0);
        dctx.lineTo(rad - 4, -8 * d.mag);
        dctx.lineTo(rad - 4, 8 * d.mag);
        dctx.closePath();
        dctx.fillStyle = '#ff3344';
        dctx.fill();
        dctx.restore();
      }
      dctx.restore();
    }
  }

  JJK.PostFX = {
    impact, blackFlash, boneCrush, damageFrom, openDomain, closeDomain,
    setZone, setLowHealth, hitstop, update, world, present, screen, reset,
    state: S,
  };
})(window.JJK);
