/* ==========================================================================
   HUD — drawn on the display canvas at full resolution.

   Deliberately canvas rather than DOM: half the HUD is world-anchored
   (floating damage numbers, enemy health bars, boss telegraph text) and
   needs the same projection and screen shake as the world render. Mixing
   that with DOM elements means two coordinate systems that drift apart.

   World-anchored elements reuse the exact projection constants from
   raycaster.js and are occluded against the wall z-buffer, so a damage
   number behind a pillar stays behind the pillar.
   ========================================================================== */

(function (JJK) {
  'use strict';

  const { M, Color, Renderer, PostFX, Particles, Input } = JJK;

  const HUD = {
    visible: false,
    mapOpen: false,
    char: null,
    hitMarker: 0,
  };

  function show(v) { HUD.visible = v; }
  function bindCharacter(c) { HUD.char = c; }
  function toggleMap() { HUD.mapOpen = !HUD.mapOpen; }

  /* ------------------------------------------------------------------
     Text helpers
     ------------------------------------------------------------------ */
  function text(ctx, str, x, y, size, color, align, weight, shadow) {
    ctx.font = `${weight || 600} ${size}px "Rajdhani", "Chakra Petch", system-ui, sans-serif`;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    if (shadow !== false) {
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillText(str, x + 2, y + 2);
    }
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function bar(ctx, x, y, w, h, frac, color, bg, skew) {
    frac = M.clamp(frac, 0, 1);
    ctx.save();
    if (skew) { ctx.translate(x, y); ctx.transform(1, 0, -0.28, 1, 0, 0); ctx.translate(-x, -y); }
    ctx.fillStyle = bg || 'rgba(0,0,0,0.55)';
    ctx.fillRect(x, y, w, h);
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, Color.shade(color, 1.4));
    g.addColorStop(0.5, color);
    g.addColorStop(1, Color.shade(color, 0.65));
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w * frac, h);
    ctx.fillStyle = Color.alpha('#ffffff', 0.35);
    ctx.fillRect(x, y, w * frac, Math.max(1, h * 0.18));
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.restore();
  }

  /* ------------------------------------------------------------------
     World projection matching the renderer exactly.
     ------------------------------------------------------------------ */
  function projector(G, dw, dh) {
    const bw = Renderer.W, bh = Renderer.H;
    const sx = dw / bw, sy = dh / bh;
    const cam = G.cam;
    const projH = JJK.projConst(bh, cam.fovMul);
    const k = JJK.planeK(bw, projH);
    const centerY = bh / 2 + cam.pitch + cam.bob;
    const dirX = cam.dirX, dirY = cam.dirY;
    const zBuf = Renderer.caster.zBuf;
    const ox = PostFX.state.lastOx || 0;
    const oy = PostFX.state.lastOy || 0;

    return function (wx, wy, wz) {
      const relX = wx - cam.x, relY = wy - cam.y;
      const depth = relX * dirX + relY * dirY;
      if (depth <= 0.25) return null;
      const lat = dirX * relY - dirY * relX;
      const bx = (bw / 2) * (1 + lat / (k * depth));
      const by = centerY + ((0.5 + cam.z - wz) * projH) / depth;
      if (bx < -60 || bx > bw + 60) return null;
      const col = M.clamp(bx | 0, 0, bw - 1);
      if (zBuf && zBuf[col] < depth - 0.3) return null;   // behind a wall
      return { x: bx * sx + ox, y: by * sy + oy, depth };
    };
  }

  /* ------------------------------------------------------------------
     Main draw
     ------------------------------------------------------------------ */
  function draw(G, ctx, W, H) {
    if (!HUD.visible || !G.player) return;
    const p = G.player;
    const c = p.char;
    const u = Math.min(W, H) / 900;      // scale unit
    const project = projector(G, W, H);

    /* ---------- world-anchored ---------- */
    drawEnemyBars(G, ctx, project, u);
    drawDamageNumbers(ctx, project, u);

    /* ---------- crosshair ---------- */
    drawCrosshair(ctx, W, H, u, c, p);

    /* ---------- bottom-left: vitals ---------- */
    const px = 34 * u, py = H - 40 * u;
    const barW = 300 * u, barH = 17 * u;

    // Name + kanji.
    text(ctx, c.name, px, py - 66 * u, 21 * u, c.color, 'left', 700);
    text(ctx, c.kanji, px + ctx.measureText(c.name).width + 14 * u, py - 66 * u, 15 * u, 'rgba(255,255,255,0.45)', 'left', 500);

    // Health.
    bar(ctx, px, py - 52 * u, barW, barH, p.health / p.maxHealth,
      p.health / p.maxHealth < 0.3 ? '#ff2b2b' : '#ff4d5e', 'rgba(20,0,6,0.7)', true);
    text(ctx, `${Math.ceil(p.health)}`, px + 8 * u, py - 52 * u + barH * 0.8, 13 * u, '#ffffff', 'left', 700);
    text(ctx, `${p.maxHealth}`, px + barW - 8 * u, py - 52 * u + barH * 0.8, 11 * u, 'rgba(255,255,255,0.5)', 'right', 500);

    // Cursed energy.
    const manaColor = p.infiniteMana ? '#ffdd66' : '#4db8ff';
    bar(ctx, px, py - 28 * u, barW * 0.82, barH * 0.75, p.mana / p.maxMana, manaColor, 'rgba(0,8,20,0.7)', true);
    text(ctx, p.infiniteMana ? '∞ CURSED ENERGY' : `${Math.floor(p.mana)}`,
      px + 8 * u, py - 28 * u + barH * 0.62, 11 * u, '#ffffff', 'left', 600);

    // Zone / Infinity / Jackpot flags.
    let fx = px;
    const fy = py - 6 * u;
    if (p.zone > 0) { fx = flag(ctx, fx, fy, u, 'THE ZONE', '#ff3344', p.zone / 15); }
    if (p.infinity > 0) { fx = flag(ctx, fx, fy, u, 'INFINITY', '#00ffff', 1); }
    if (p.jackpot > 0) { fx = flag(ctx, fx, fy, u, 'JACKPOT', '#ffdd66', p.jackpot / 12); }
    for (const b of p.buffs) {
      if (b.id === 'jackpot') continue;
      fx = flag(ctx, fx, fy, u, b.label + (b.stacks > 1 ? ` x${b.stacks}` : ''), b.color, 1 - b.t / b.duration);
    }

    /* ---------- bottom-right: abilities ---------- */
    drawAbilities(ctx, W, H, u, p);

    /* ---------- top-right: run stats ---------- */
    if (G.mode !== 'battle') {
      text(ctx, `WAVE ${G.wave}`, W - 34 * u, 48 * u, 30 * u, '#ffffff', 'right', 700);
      text(ctx, G.level.name, W - 34 * u, 70 * u, 13 * u, 'rgba(255,255,255,0.5)', 'right', 500);
    } else {
      const left = G.enemies.filter((e) => !e.dead).length;
      text(ctx, `${left} LEFT`, W - 34 * u, 48 * u, 30 * u, '#ff6677', 'right', 700);
    }
    text(ctx, `${p.kills} KILLS`, W - 34 * u, 96 * u, 15 * u, 'rgba(255,255,255,0.72)', 'right', 600);
    text(ctx, `${p.score.toLocaleString()}`, W - 34 * u, 116 * u, 15 * u, '#ffd166', 'right', 600);

    /* ---------- boss bar ---------- */
    if (G.boss && !G.boss.dead) drawBossBar(G, ctx, W, u);

    /* ---------- domain timer ---------- */
    if (G.domain) {
      const d = G.domain;
      const f = 1 - d.t / d.life;
      const bw = 340 * u;
      bar(ctx, W / 2 - bw / 2, H - 30 * u, bw, 6 * u, f, d.def.palette.b, 'rgba(0,0,0,0.6)');
      text(ctx, d.def.name, W / 2, H - 38 * u, 14 * u, d.def.palette.b, 'center', 700);
    }

    /* ---------- Yuta's copied technique ---------- */
    if (p.copyLabelT > 0 && p.copyLabel) {
      text(ctx, p.copyLabel, W / 2, H * 0.66, 20 * u, '#cc66ff', 'center', 700);
    }

    /* ---------- kill chain ---------- */
    drawCombo(G, ctx, W, H, u, p);

    /* ---------- active wave rule ---------- */
    if (G.mod) {
      const mx = W - 34 * u;
      text(ctx, `${G.mod.icon}  ${G.mod.name}`, mx, 146 * u, 15 * u, G.mod.color, 'right', 700);
      text(ctx, G.mod.desc, mx, 164 * u, 11 * u, 'rgba(255,255,255,0.55)', 'right', 500);
    }

    /* ---------- banners ---------- */
    drawBanner(G, ctx, W, H, u);

    /* ---------- upgrade offer ---------- */
    if (G.boonOffer) drawBoonOffer(G, ctx, W, H, u);

    /* ---------- boss telegraph name ---------- */
    if (G.bossTell) {
      const t = G.bossTell;
      const a = 1 - t.t / t.life;
      ctx.save();
      ctx.globalAlpha = 0.55 + 0.45 * Math.abs(Math.sin(t.t * 12));
      text(ctx, '⚠ ' + t.name, W / 2, H * 0.22, 22 * u, t.color, 'center', 700);
      ctx.restore();
      void a;
    }

    /* ---------- minimap ---------- */
    if (HUD.mapOpen) drawMinimap(G, ctx, W, H, u);

    /* ---------- hit marker ---------- */
    if (HUD.hitMarker > 0) {
      HUD.hitMarker -= 0.06;
      const s = 10 * u * (1 + (1 - HUD.hitMarker) * 0.6);
      ctx.save();
      ctx.globalAlpha = M.clamp(HUD.hitMarker, 0, 1);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5 * u;
      ctx.lineCap = 'round';
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        ctx.beginPath();
        ctx.moveTo(W / 2 + sx * s * 0.45, H / 2 + sy * s * 0.45);
        ctx.lineTo(W / 2 + sx * s, H / 2 + sy * s);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  /**
   * Kill chain. Sits under the crosshair so it is readable mid-fight without
   * pulling your eye to a corner.
   */
  function drawCombo(G, ctx, W, H, u, p) {
    if (p.combo < 2) return;
    const tier = p.comboTier();
    const cols = ['#ffffff', '#8ef07a', '#7cc4ff', '#c084fc', '#ffbe3d'];
    const col = cols[tier];
    const cx = W / 2, cy = H * 0.60;
    const pulse = 1 + M.decay(M.clamp(1 - p.comboT / 4, 0, 1)) * 0.12;

    ctx.save();
    ctx.globalAlpha = M.clamp(p.comboT / 1.2, 0.25, 1);
    text(ctx, `${p.combo}`, cx, cy, 34 * u * pulse, col, 'center', 800);
    text(ctx, 'CHAIN', cx, cy + 15 * u, 10 * u, Color.alpha(col, 0.8), 'center', 700);
    const bonus = Math.round((p.comboDamage() - 1) * 100);
    if (bonus > 0) {
      text(ctx, `+${bonus}% DMG`, cx, cy + 30 * u, 11 * u, 'rgba(255,255,255,0.7)', 'center', 600);
    }
    // Decay bar.
    const bw = 90 * u;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(cx - bw / 2, cy + 36 * u, bw, 3 * u);
    ctx.fillStyle = col;
    ctx.fillRect(cx - bw / 2, cy + 36 * u, bw * M.clamp(p.comboT / 4, 0, 1), 3 * u);
    ctx.restore();
  }

  /**
   * The upgrade offer. Three cards bound to the ability keys already under
   * your left hand, so choosing never breaks pointer lock or the flow.
   */
  function drawBoonOffer(G, ctx, W, H, u) {
    const o = G.boonOffer;
    const keys = [Input.LABELS.ab1, Input.LABELS.ab2, Input.LABELS.ab3];
    const inA = M.clamp(o.t / 0.25, 0, 1);

    ctx.save();
    ctx.globalAlpha = inA;
    ctx.fillStyle = 'rgba(4,3,10,0.72)';
    ctx.fillRect(0, 0, W, H);

    text(ctx, 'CHOOSE A BOON', W / 2, H * 0.22, 30 * u, '#ffd166', 'center', 800);
    text(ctx, 'your cursed energy has grown', W / 2, H * 0.22 + 22 * u, 13 * u,
      'rgba(255,255,255,0.55)', 'center', 500);

    const cw = Math.min(300 * u, W * 0.27), ch = 220 * u, gap = 22 * u;
    const total = cw * 3 + gap * 2;
    let x = W / 2 - total / 2;
    const y = H * 0.34;

    for (let i = 0; i < o.options.length; i++) {
      const b = o.options[i];
      const rar = JJK.BOON_RARITY[b.rarity] || JJK.BOON_RARITY.common;
      const slide = (1 - M.smoothstep(M.clamp((o.t - i * 0.06) / 0.3, 0, 1))) * 30 * u;

      ctx.save();
      ctx.translate(0, slide);
      ctx.globalAlpha = inA;
      ctx.fillStyle = 'rgba(10,8,18,0.95)';
      ctx.fillRect(x, y, cw, ch);
      ctx.strokeStyle = rar.color;
      ctx.lineWidth = 2 * u;
      ctx.strokeRect(x + 0.5, y + 0.5, cw - 1, ch - 1);
      ctx.shadowColor = rar.color;
      ctx.shadowBlur = 18 * u;
      ctx.strokeRect(x + 0.5, y + 0.5, cw - 1, ch - 1);
      ctx.shadowBlur = 0;

      ctx.fillStyle = Color.alpha(rar.color, 0.16);
      ctx.fillRect(x, y, cw, 34 * u);
      text(ctx, rar.label, x + cw / 2, y + 22 * u, 11 * u, rar.color, 'center', 800);

      text(ctx, b.icon, x + cw / 2, y + 92 * u, 46 * u, rar.color, 'center', 700);
      text(ctx, b.name.toUpperCase(), x + cw / 2, y + 124 * u, 15 * u, '#ffffff', 'center', 700);

      // Description, wrapped.
      ctx.font = `500 ${12 * u}px "Rajdhani", system-ui, sans-serif`;
      const words = b.desc.split(' ');
      let line = '', ly = y + 148 * u;
      for (const w of words) {
        const test = line ? line + ' ' + w : w;
        if (ctx.measureText(test).width > cw - 28 * u) {
          text(ctx, line, x + cw / 2, ly, 12 * u, 'rgba(255,255,255,0.72)', 'center', 500);
          line = w; ly += 15 * u;
        } else line = test;
      }
      if (line) text(ctx, line, x + cw / 2, ly, 12 * u, 'rgba(255,255,255,0.72)', 'center', 500);

      // Key prompt.
      ctx.fillStyle = Color.alpha(rar.color, 0.22);
      ctx.fillRect(x + cw / 2 - 22 * u, y + ch - 34 * u, 44 * u, 24 * u);
      ctx.strokeStyle = rar.color;
      ctx.lineWidth = 1.5 * u;
      ctx.strokeRect(x + cw / 2 - 22 * u, y + ch - 34 * u, 44 * u, 24 * u);
      text(ctx, keys[i], x + cw / 2, y + ch - 17 * u, 14 * u, '#ffffff', 'center', 800);
      ctx.restore();

      x += cw + gap;
    }
    ctx.restore();
  }

  function flag(ctx, x, y, u, label, color, frac) {
    const w = ctx.measureText(label).width;
    const pad = 9 * u;
    const bw = Math.max(64 * u, w + pad * 2);
    ctx.save();
    ctx.fillStyle = Color.alpha(color, 0.16);
    ctx.fillRect(x, y, bw, 18 * u);
    ctx.fillStyle = Color.alpha(color, 0.55);
    ctx.fillRect(x, y + 16 * u, bw * M.clamp(frac, 0, 1), 2 * u);
    ctx.strokeStyle = Color.alpha(color, 0.6);
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, bw - 1, 18 * u - 1);
    ctx.restore();
    text(ctx, label, x + pad, y + 13 * u, 11 * u, color, 'left', 700, false);
    return x + bw + 6 * u;
  }

  /* ------------------------------------------------------------------
     Abilities
     ------------------------------------------------------------------ */
  function drawAbilities(ctx, W, H, u, p) {
    const slots = ['j', 'k', 'l', 'q'];
    const keys = [Input.LABELS.ab1, Input.LABELS.ab2, Input.LABELS.ab3, Input.LABELS.domain];
    const size = 62 * u, gap = 12 * u;
    const total = slots.length * size + (slots.length - 1) * gap;
    let x = W - 34 * u - total;
    const y = H - 96 * u;

    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      const a = p.char.abilities[s];
      const cd = p.cooldowns[s];
      const cdMax = p.cooldownMax[s] || a.cd;
      const ready = cd <= 0;
      const cost = p.infiniteMana ? 0 : a.cost;
      const affordable = p.mana >= cost;
      const usable = ready && affordable;

      // Frame.
      ctx.save();
      ctx.fillStyle = usable ? Color.alpha(a.color, 0.20) : 'rgba(0,0,0,0.55)';
      ctx.fillRect(x, y, size, size);
      ctx.strokeStyle = usable ? Color.alpha(a.color, 0.95) : 'rgba(255,255,255,0.18)';
      ctx.lineWidth = usable ? 2 * u : 1 * u;
      ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
      if (usable) {
        ctx.shadowColor = a.color;
        ctx.shadowBlur = 12 * u;
        ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
      }
      ctx.restore();

      // Icon glyph.
      ctx.save();
      ctx.globalAlpha = usable ? 1 : 0.4;
      text(ctx, a.icon, x + size / 2, y + size * 0.60, size * 0.42, usable ? '#ffffff' : '#8a8a9a', 'center', 700);
      ctx.restore();

      // Cooldown wipe.
      if (!ready) {
        const f = M.clamp(cd / cdMax, 0, 1);
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.68)';
        ctx.fillRect(x, y, size, size * f);
        ctx.restore();
        text(ctx, cd.toFixed(1), x + size / 2, y + size * 0.62, 20 * u, '#ffffff', 'center', 700);
      } else if (!affordable) {
        text(ctx, `${cost}`, x + size / 2, y + size * 0.62, 17 * u, '#ff6677', 'center', 700);
      }

      // A live shot you can trigger: the slot reads DETONATE.
      const live = p.liveShots && p.liveShots[s] && p.liveShots[s].alive;
      if (live) {
        ctx.save();
        ctx.globalAlpha = 0.55 + 0.45 * Math.abs(Math.sin(Date.now() / 90));
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5 * u;
        ctx.strokeRect(x - 2 * u, y - 2 * u, size + 4 * u, size + 4 * u);
        ctx.restore();
        text(ctx, 'DETONATE', x + size / 2, y + size * 0.86, 9.5 * u, '#ffffff', 'center', 800);
      }

      // Key + name + cost.
      text(ctx, keys[i], x + 5 * u, y + 15 * u, 13 * u, usable ? a.color : 'rgba(255,255,255,0.4)', 'left', 800);
      if (cost > 0) {
        text(ctx, String(cost), x + size - 5 * u, y + 15 * u, 11 * u, 'rgba(140,200,255,0.85)', 'right', 600);
      } else {
        text(ctx, 'FREE', x + size - 5 * u, y + 15 * u, 9 * u, 'rgba(140,255,180,0.8)', 'right', 700);
      }
      // Shrink long names to the slot, then ellipsize — never bleed into
      // the neighboring slot ("CHIMERA SHADOW GARDEN" is wider than 62px).
      {
        let label = a.name.toUpperCase();
        const maxW = size - 6 * u;
        let fs = 9.5 * u;
        ctx.font = `600 ${fs}px "Rajdhani", "Chakra Petch", system-ui, sans-serif`;
        if (ctx.measureText(label).width > maxW) {
          fs = Math.max(7 * u, fs * maxW / ctx.measureText(label).width);
          ctx.font = `600 ${fs}px "Rajdhani", "Chakra Petch", system-ui, sans-serif`;
          while (label.length > 3 && ctx.measureText(label).width > maxW) {
            label = label.slice(0, -2).trimEnd() + '…';
          }
        }
        text(ctx, label, x + size / 2, y + size - 6 * u, fs,
          usable ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.35)', 'center', 600);
      }

      x += size + gap;
    }

    // Passive pip — the character's signature hold, and which key it is.
    // Gojo's Infinity was completely undiscoverable without this.
    if (p.char.passiveKey) {
      const vx = W - 34 * u - total - 66 * u - 66 * u;
      const on = p.infinity > 0;
      ctx.save();
      ctx.fillStyle = on ? Color.alpha(p.char.glow, 0.28) : 'rgba(0,0,0,0.5)';
      ctx.fillRect(vx, y + 12 * u, 58 * u, 38 * u);
      ctx.strokeStyle = on ? p.char.glow : 'rgba(255,255,255,0.18)';
      ctx.lineWidth = on ? 2 * u : 1.5 * u;
      if (on) { ctx.shadowColor = p.char.glow; ctx.shadowBlur = 12 * u; }
      ctx.strokeRect(vx + 0.5, y + 12 * u + 0.5, 58 * u - 1, 38 * u - 1);
      ctx.restore();
      text(ctx, Input.LABELS.passive, vx + 5 * u, y + 25 * u, 11 * u,
        on ? p.char.glow : 'rgba(255,255,255,0.45)', 'left', 800);
      text(ctx, p.char.passiveKey.toUpperCase(), vx + 29 * u, y + 44 * u, 11 * u,
        on ? '#ffffff' : 'rgba(255,255,255,0.4)', 'center', 700);
    }

    // RCT pip.
    const hasRCT = p.char.hasRCT === true || (p.char.hasRCT === 'jackpot' && p.jackpot > 0);
    const rx = W - 34 * u - total - 66 * u;
    ctx.save();
    ctx.fillStyle = hasRCT && p.rctCd <= 0 ? 'rgba(80,255,200,0.18)' : 'rgba(0,0,0,0.5)';
    ctx.fillRect(rx, y + 12 * u, 54 * u, 38 * u);
    ctx.strokeStyle = hasRCT && p.rctCd <= 0 ? 'rgba(80,255,200,0.9)' : 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1.5 * u;
    ctx.strokeRect(rx + 0.5, y + 12 * u + 0.5, 54 * u - 1, 38 * u - 1);
    ctx.restore();
    text(ctx, Input.LABELS.rct, rx + 5 * u, y + 25 * u, 12 * u, hasRCT ? '#50ffc8' : 'rgba(255,255,255,0.35)', 'left', 800);
    text(ctx, p.rctCd > 0 ? p.rctCd.toFixed(1) : 'RCT', rx + 27 * u, y + 44 * u, 13 * u,
      hasRCT ? '#ffffff' : 'rgba(255,255,255,0.3)', 'center', 700);
  }

  /* ------------------------------------------------------------------
     Crosshair — opens up while you're moving, tints on a ready ability.
     ------------------------------------------------------------------ */
  function drawCrosshair(ctx, W, H, u, c, p) {
    const cx = W / 2, cy = H / 2;
    const speed = Math.hypot(p.vx, p.vy);
    const spread = (5 + speed * 1.6 + p.swing * 6) * u;
    const len = 7 * u;

    ctx.save();
    ctx.strokeStyle = Color.alpha(c.glow, 0.9);
    ctx.lineWidth = 1.8 * u;
    ctx.lineCap = 'round';
    ctx.shadowColor = c.glow;
    ctx.shadowBlur = 6 * u;
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      ctx.beginPath();
      ctx.moveTo(cx + dx * spread, cy + dy * spread);
      ctx.lineTo(cx + dx * (spread + len), cy + dy * (spread + len));
      ctx.stroke();
    }
    ctx.fillStyle = Color.alpha('#ffffff', 0.9);
    ctx.beginPath(); ctx.arc(cx, cy, 1.4 * u, 0, M.TAU); ctx.fill();
    ctx.restore();
  }

  /* ------------------------------------------------------------------
     World-anchored: enemy health bars + damage numbers
     ------------------------------------------------------------------ */
  function drawEnemyBars(G, ctx, project, u) {
    const list = G.targets();
    for (const e of list) {
      if (e === G.boss) continue;
      if (e.lastHitTime > 3.5) continue;          // only recently hit
      if (e.health >= e.maxHealth) continue;
      const s = project(e.x, e.y, e.z + e.height + 0.28);
      if (!s) continue;
      const fade = M.clamp(1 - (e.lastHitTime - 2.5) / 1.0, 0, 1);
      const w = M.clamp(70 * u * (6 / Math.max(2, s.depth)), 26 * u, 92 * u);
      const h = 4.5 * u;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(s.x - w / 2, s.y, w, h);
      ctx.fillStyle = e.health / e.maxHealth > 0.5 ? '#8ef07a' : e.health / e.maxHealth > 0.22 ? '#ffcc44' : '#ff4444';
      ctx.fillRect(s.x - w / 2, s.y, w * (e.health / e.maxHealth), h);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(s.x - w / 2 + 0.5, s.y + 0.5, w - 1, h - 1);
      ctx.restore();
    }
  }

  function drawDamageNumbers(ctx, project, u) {
    for (const n of Particles.numbers) {
      const s = project(n.x + n.ox, n.y + n.oy, n.z);
      if (!s) continue;
      const f = n.life / n.maxLife;
      const alpha = 1 - f * f;
      const isCrit = n.kind === 'crit';
      const size = (isCrit ? 30 : n.kind === 'info' ? 15 : 19) * u * M.clamp(7 / Math.max(2.5, s.depth), 0.45, 1.5)
        * (isCrit ? 1 + M.decay(f) * 0.5 : 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      if (isCrit) {
        ctx.shadowColor = n.color;
        ctx.shadowBlur = 14 * u;
      }
      text(ctx, String(n.value), s.x, s.y, size, n.color, 'center', isCrit ? 800 : 700);
      ctx.restore();
    }
  }

  /* ------------------------------------------------------------------
     Boss bar
     ------------------------------------------------------------------ */
  function drawBossBar(G, ctx, W, u) {
    const b = G.boss;
    const def = b.def;
    const bw = Math.min(W * 0.55, 720 * u);
    const x = W / 2 - bw / 2, y = 34 * u;

    text(ctx, def.name, W / 2, y - 8 * u, 24 * u, def.color, 'center', 800);
    text(ctx, def.kanji + '   ' + def.title, W / 2, y + 30 * u, 12 * u, 'rgba(255,255,255,0.55)', 'center', 500);

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.68)';
    ctx.fillRect(x, y, bw, 14 * u);
    const f = b.health / b.maxHealth;
    const g = ctx.createLinearGradient(x, y, x, y + 14 * u);
    g.addColorStop(0, Color.shade(def.color, 1.5));
    g.addColorStop(1, Color.shade(def.color, 0.6));
    ctx.fillStyle = g;
    ctx.fillRect(x, y, bw * f, 14 * u);
    if (b.invuln > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(x, y, bw, 14 * u);
    }
    ctx.strokeStyle = Color.alpha(def.color, 0.9);
    ctx.lineWidth = 1.5 * u;
    ctx.strokeRect(x + 0.5, y + 0.5, bw - 1, 14 * u - 1);
    // Phase thresholds, so you can see the next escalation coming.
    for (const th of [0.6, 0.3]) {
      const tx = x + bw * th;
      ctx.strokeStyle = f > th ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 2 * u;
      ctx.beginPath(); ctx.moveTo(tx, y - 3 * u); ctx.lineTo(tx, y + 17 * u); ctx.stroke();
    }
    ctx.restore();
    if (b.phase > 0) {
      text(ctx, b.phase === 1 ? 'ENRAGED' : 'FINAL STAND',
        W / 2, y + 46 * u, 12 * u, def.color, 'center', 800);
    }
  }

  /* ------------------------------------------------------------------
     Banner
     ------------------------------------------------------------------ */
  function drawBanner(G, ctx, W, H, u) {
    const b = G.bannerData;
    if (b) {
      const f = b.t / b.life;
      // Slide in, hold, fade out.
      const inA = M.clamp(b.t / 0.25, 0, 1);
      const outA = M.clamp((b.life - b.t) / 0.5, 0, 1);
      const a = Math.min(inA, outA);
      const slide = (1 - M.smoothstep(inA)) * 40 * u;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, H * 0.30 - 34 * u, W, 76 * u);
      ctx.fillStyle = Color.alpha(b.color, 0.85);
      ctx.fillRect(0, H * 0.30 - 34 * u, W, 2 * u);
      ctx.fillRect(0, H * 0.30 + 40 * u, W, 2 * u);
      text(ctx, b.text, W / 2 + slide, H * 0.30 + 10 * u, 44 * u, b.color, 'center', 800);
      if (b.sub) text(ctx, b.sub, W / 2 + slide, H * 0.30 + 33 * u, 14 * u, 'rgba(255,255,255,0.65)', 'center', 500);
      ctx.restore();
      void f;
    }
    const s = G.subtitleData;
    if (s) {
      const a = Math.min(M.clamp(s.t / 0.3, 0, 1), M.clamp((s.life - s.t) / 0.6, 0, 1));
      ctx.save();
      ctx.globalAlpha = a * 0.9;
      text(ctx, s.text, W / 2, H * 0.42, 17 * u, 'rgba(255,255,255,0.8)', 'center', 400);
      ctx.restore();
    }
  }

  /* ------------------------------------------------------------------
     Minimap (TAB)
     ------------------------------------------------------------------ */
  function drawMinimap(G, ctx, W, H, u) {
    const map = G.map;
    const size = Math.min(W, H) * 0.42;
    const cell = size / Math.max(map.w, map.h);
    const ox = W - size - 34 * u, oy = 150 * u;

    ctx.save();
    ctx.fillStyle = 'rgba(4,4,10,0.82)';
    ctx.fillRect(ox - 8, oy - 8, size + 16, size + 16);
    ctx.strokeStyle = Color.alpha(G.theme.gridColor, 0.7);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(ox - 8.5, oy - 8.5, size + 17, size + 17);

    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        const c = map.cellAt(x, y);
        if (!c) continue;
        ctx.fillStyle = c === 4 ? Color.alpha(G.theme.gridColor, 0.9) : Color.alpha(G.theme.gridColor, 0.45);
        ctx.fillRect(ox + x * cell, oy + y * cell, cell - 0.5, cell - 0.5);
      }
    }
    // Enemies.
    for (const e of G.targets()) {
      ctx.fillStyle = e === G.boss ? '#ff2244' : '#ff8899';
      const r = e === G.boss ? cell * 1.1 : cell * 0.55;
      ctx.beginPath(); ctx.arc(ox + e.x * cell, oy + e.y * cell, r, 0, M.TAU); ctx.fill();
    }
    for (const a of G.allies) {
      if (a.dead) continue;
      ctx.fillStyle = '#66ccff';
      ctx.beginPath(); ctx.arc(ox + a.x * cell, oy + a.y * cell, cell * 0.5, 0, M.TAU); ctx.fill();
    }
    // Player + view cone.
    const p = G.player;
    ctx.fillStyle = p.char.color;
    ctx.beginPath(); ctx.arc(ox + p.x * cell, oy + p.y * cell, cell * 0.7, 0, M.TAU); ctx.fill();
    ctx.strokeStyle = Color.alpha(p.char.glow, 0.7);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ox + p.x * cell, oy + p.y * cell);
    ctx.arc(ox + p.x * cell, oy + p.y * cell, cell * 4, p.angle - 0.6, p.angle + 0.6);
    ctx.closePath();
    ctx.fillStyle = Color.alpha(p.char.glow, 0.16);
    ctx.fill();
    ctx.restore();

    text(ctx, G.level.name, ox, oy - 16, 13 * u, 'rgba(255,255,255,0.7)', 'left', 600);
  }

  HUD.show = show;
  HUD.draw = draw;
  HUD.bindCharacter = bindCharacter;
  HUD.toggleMap = toggleMap;
  HUD.hit = function () { HUD.hitMarker = 1; };

  JJK.HUD = HUD;
})(window.JJK);
