/* ==========================================================================
   RENDERER — world drawing.

   Pass order (and why):
     1. sky / ceiling
     2. floor depth-gradient
     3. floor grid + light pools      <- drawn BEFORE walls on purpose
     4. walls
     5. airborne motes
     6. sprites, far to near, z-buffer clipped per slice
   Step 3 works because in any column a wall exactly covers everything at
   greater depth: the wall's bottom edge lands where the floor at the wall's
   own distance projects. So far-floor decoration can never bleed past it.

   Shading is one fillRect per column. Darkening and fog are algebraically
   merged into a single rgba value:

     result = mix(mix(tex, black, dA), fog, fA)
     => alpha = 1 - (1-dA)(1-fA),  colour = fog * (fA / alpha)

   Those strings are precomputed into a 32x8 lookup table per level, so the
   inner loop never builds a colour string.
   ========================================================================== */

(function (JJK) {
  'use strict';

  const { M, Color, makeCanvas, Textures, Raycaster, Camera } = JJK;

  const FOG_STEPS = 32, DARK_STEPS = 8;

  const R = {
    display: null, dctx: null,
    buf: null, ctx: null,
    W: 0, H: 0,            // internal render size
    dispW: 0, dispH: 0,
    scale: 0.62,           // internal resolution factor
    caster: new Raycaster(),
    theme: null,
    fogLUT: null,
    skyImg: null,
    motes: [],
    scratch: null,
    blockTop: null,
    blockDist: null,
    maxDist: 34,
    baseTheme: null,
    override: null,
    levelSky: null,
  };

  /* ------------------------------------------------------------------ */
  function init(displayCanvas) {
    R.display = displayCanvas;
    R.dctx = displayCanvas.getContext('2d');
    const b = makeCanvas(16, 16);
    R.buf = b.canvas; R.ctx = b.ctx;
    R.scratch = makeCanvas(256, 256);
    resize();
    buildMotes();
  }

  function setQuality(scale) {
    R.scale = M.clamp(scale, 0.3, 1);
    resize(true);
  }

  function resize(force) {
    const dpr = 1; // internal buffer already handles sharpness/perf tradeoff
    const cw = R.display.clientWidth || window.innerWidth;
    const ch = R.display.clientHeight || window.innerHeight;
    if (!force && cw === R.dispW && ch === R.dispH) return;

    R.dispW = cw; R.dispH = ch;
    R.display.width = Math.max(1, Math.floor(cw * dpr));
    R.display.height = Math.max(1, Math.floor(ch * dpr));

    R.W = Math.max(160, Math.floor(cw * R.scale));
    R.H = Math.max(120, Math.floor(ch * R.scale));
    R.buf.width = R.W;
    R.buf.height = R.H;
    R.ctx.imageSmoothingEnabled = true;
    R.dctx.imageSmoothingEnabled = true;
  }

  /* ------------------------------------------------------------------
     Fog / darkness lookup table.
     ------------------------------------------------------------------ */
  function buildFogLUT(fogColor) {
    const lut = new Array(FOG_STEPS * DARK_STEPS);
    const fc = Color.parse(fogColor);
    for (let fi = 0; fi < FOG_STEPS; fi++) {
      const fA = fi / (FOG_STEPS - 1);
      for (let di = 0; di < DARK_STEPS; di++) {
        const dA = di / (DARK_STEPS - 1);
        const alpha = 1 - (1 - dA) * (1 - fA);
        let str;
        if (alpha <= 0.002) {
          str = null;
        } else {
          const s = fA / alpha;                        // fog's share of the overlay
          str = `rgba(${Math.round(fc.r * s)},${Math.round(fc.g * s)},${Math.round(fc.b * s)},${alpha.toFixed(3)})`;
        }
        lut[fi * DARK_STEPS + di] = str;
      }
    }
    return lut;
  }

  function setLevel(theme, skyImg) {
    R.baseTheme = theme;
    R.override = null;
    R.levelSky = skyImg || null;
    applyTheme();
    Textures.prewarm(theme);
  }

  /** Recompute the effective theme from base + domain override. */
  function applyTheme() {
    if (!R.baseTheme) return;   // nothing loaded yet
    const t = R.override ? Object.assign({}, R.baseTheme, R.override) : R.baseTheme;
    R.theme = t;
    R.fogLUT = buildFogLUT(t.fog);
    R.skyImg = t.sky === 'image' ? R.levelSky : null;
    R.maxDist = t.viewDistance || 34;
  }

  /**
   * Domain override. Wall TEXTURES are keyed by the base theme id and are
   * deliberately not re-baked — swapping fog, floor, ceiling and grid
   * colours already transforms the whole arena, because wall shading is
   * composited against the fog colour per column. Cheap, and instant.
   */
  function setDomainTheme(partial) {
    R.override = partial || null;
    applyTheme();
  }

  /* ------------------------------------------------------------------
     Airborne motes — cheap, constant atmosphere. Kept in a rolling box
     around the camera so they never run out.
     ------------------------------------------------------------------ */
  function buildMotes() {
    R.motes = [];
    for (let i = 0; i < 70; i++) {
      R.motes.push({
        x: M.rand(-12, 12), y: M.rand(-12, 12), z: M.rand(0.05, 1.6),
        r: M.rand(0.006, 0.03),
        vx: M.spread(0.12), vy: M.spread(0.12), vz: M.spread(0.06),
        ph: M.rand(0, M.TAU),
      });
    }
  }

  function updateMotes(cam, dt) {
    for (const m of R.motes) {
      m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt;
      if (m.z < 0.05 || m.z > 1.7) m.vz *= -1;
      // Re-wrap into a 24x24 box centred on the camera.
      const dx = m.x - cam.x, dy = m.y - cam.y;
      if (dx > 12) m.x -= 24; else if (dx < -12) m.x += 24;
      if (dy > 12) m.y -= 24; else if (dy < -12) m.y += 24;
    }
  }

  /* ------------------------------------------------------------------
     Depth gradient: approximates the 1/d fog curve with 16 stops so the
     whole floor or ceiling is one fillRect instead of H/2 of them.
     ------------------------------------------------------------------ */
  function depthGradient(ctx, yTop, yBot, centerY, projH, near, far, density, invert) {
    const g = ctx.createLinearGradient(0, yTop, 0, yBot);
    const steps = 16;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const y = M.lerp(yTop, yBot, t);
      const dy = Math.abs(y - centerY);
      const d = dy < 0.5 ? 1e4 : (0.5 * projH) / dy;
      const fog = 1 - Math.exp(-d * density);
      g.addColorStop(t, Color.mix(near, far, M.clamp(fog, 0, 1)));
    }
    void invert;
    return g;
  }

  /* ------------------------------------------------------------------
     Sky
     ------------------------------------------------------------------ */
  function drawSky(ctx, cam, centerY, theme) {
    const W = R.W, H = R.H;
    const horizon = M.clamp(centerY, -H, H * 2);

    if (R.skyImg) {
      const img = R.skyImg;
      // 360 degrees of yaw maps to one full image width.
      const total = W * 3.2;
      let off = ((cam.angle / M.TAU) % 1) * total;
      if (off < 0) off += total;
      const sh = H * 1.1;
      const top = horizon - sh + H * 0.16;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, Math.max(0, horizon));
      ctx.clip();
      for (let i = -1; i <= 2; i++) {
        ctx.drawImage(img, i * total - off, top, total, sh);
      }
      // Tint toward the level's palette so the shared sky fits every arena.
      ctx.fillStyle = Color.alpha(theme.skyTint || theme.fog, theme.skyTintAmount ?? 0.45);
      ctx.fillRect(0, 0, W, Math.max(0, horizon));
      ctx.restore();
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, Math.max(1, horizon));
      g.addColorStop(0, theme.ceilTop);
      g.addColorStop(1, theme.ceilBottom);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, Math.max(0, horizon));
    }

    // Horizon haze line.
    if (horizon > 0 && horizon < H) {
      const hz = ctx.createLinearGradient(0, horizon - H * 0.12, 0, horizon);
      hz.addColorStop(0, Color.alpha(theme.fog, 0));
      hz.addColorStop(1, Color.alpha(theme.fog, 0.55));
      ctx.fillStyle = hz;
      ctx.fillRect(0, Math.max(0, horizon - H * 0.12), W, Math.min(H * 0.12, horizon));
    }
  }

  /* ------------------------------------------------------------------
     Floor grid — the main motion cue. Without this a raycaster floor is a
     flat colour and movement reads as sliding.
     ------------------------------------------------------------------ */
  function drawFloorGrid(ctx, cam, centerY, projH, k, theme) {
    const W = R.W, H = R.H;
    const RANGE = 11;
    const near = 0.35;
    const col = theme.gridColor;
    const dirX = cam.dirX, dirY = cam.dirY;

    // Project a floor-plane point; returns null when behind the near plane.
    function proj(wx, wy) {
      const relX = wx - cam.x, relY = wy - cam.y;
      const depth = relX * dirX + relY * dirY;
      if (depth <= near) return null;
      const lat = dirX * relY - dirY * relX;
      return {
        x: (W / 2) * (1 + lat / (k * depth)),
        y: centerY + ((0.5 + cam.z) * projH) / depth,
        d: depth,
      };
    }

    // Clip a segment so both ends sit in front of the near plane.
    function clipped(ax, ay, bx, by) {
      const da = (ax - cam.x) * dirX + (ay - cam.y) * dirY;
      const db = (bx - cam.x) * dirX + (by - cam.y) * dirY;
      if (da <= near && db <= near) return null;
      let A = { x: ax, y: ay }, B = { x: bx, y: by };
      if (da <= near) {
        const t = (near - da) / (db - da);
        A = { x: M.lerp(ax, bx, t), y: M.lerp(ay, by, t) };
      } else if (db <= near) {
        const t = (near - db) / (da - db);
        B = { x: M.lerp(ax, bx, t), y: M.lerp(ay, by, t) };
      }
      const pa = proj(A.x, A.y), pb = proj(B.x, B.y);
      if (!pa || !pb) return null;
      return [pa, pb];
    }

    ctx.save();
    ctx.lineWidth = 1;
    const cx = Math.floor(cam.x), cy = Math.floor(cam.y);

    for (let axis = 0; axis < 2; axis++) {
      for (let i = -RANGE; i <= RANGE; i++) {
        let seg;
        if (axis === 0) seg = clipped(cx + i, cy - RANGE, cx + i, cy + RANGE);
        else seg = clipped(cx - RANGE, cy + i, cx + RANGE, cy + i);
        if (!seg) continue;
        const [a, b] = seg;
        // Fade each line along its own length with a gradient stroke.
        const fa = M.clamp(1 - a.d / (RANGE * 0.9), 0, 1);
        const fb = M.clamp(1 - b.d / (RANGE * 0.9), 0, 1);
        if (fa < 0.02 && fb < 0.02) continue;
        const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
        g.addColorStop(0, Color.alpha(col, 0.30 * fa));
        g.addColorStop(1, Color.alpha(col, 0.30 * fb));
        ctx.strokeStyle = g;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /**
   * Ground shadows, projected onto the floor plane.
   *
   * Drawn in the floor pass (before walls) so wall occlusion is automatic.
   * This is what anchors a billboard to the ground: a shadow baked into the
   * sprite sits on a vertical plane and always looks pasted on, no matter
   * how good the creature art is.
   */
  function drawGroundShadows(ctx, cam, centerY, projH, k, shadows) {
    if (!shadows || !shadows.length) return;
    const W = R.W;
    const dirX = cam.dirX, dirY = cam.dirY;
    ctx.save();
    for (const s of shadows) {
      const relX = s.x - cam.x, relY = s.y - cam.y;
      const depth = relX * dirX + relY * dirY;
      // Positive-logic guards: a NaN depth or radius fails `<= 0.35` and
      // `< 0.6` too, slips through, and createRadialGradient throws on
      // non-finite values — killing the whole render pass for one shadow.
      if (!(depth > 0.35) || depth > R.maxDist) continue;
      const lat = dirX * relY - dirY * relX;
      const sx = (W / 2) * (1 + lat / (k * depth));
      const sy = centerY + ((0.5 + cam.z) * projH) / depth;
      const halfW = (projH / depth) * s.r;
      if (!(halfW >= 0.6)) continue;
      const dNear = Math.max(0.3, depth - s.r), dFar = depth + s.r;
      const halfH = Math.abs(((0.5 + cam.z) * projH) / dNear - ((0.5 + cam.z) * projH) / dFar) / 2;
      const fade = M.clamp(1 - depth / R.maxDist, 0, 1);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.scale(1, Math.max(0.05, halfH / Math.max(halfW, 1)));
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(halfW, 1));
      g.addColorStop(0, `rgba(0,0,0,${0.62 * s.alpha * fade})`);
      g.addColorStop(0.55, `rgba(0,0,0,${0.30 * s.alpha * fade})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, Math.max(halfW, 1), 0, M.TAU); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  /** Emissive pools on the floor beneath level lights. */
  function drawLightPools(ctx, cam, map, centerY, projH, k, lights) {
    const W = R.W;
    const dirX = cam.dirX, dirY = cam.dirY;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const L of lights) {
      const relX = L.x - cam.x, relY = L.y - cam.y;
      const depth = relX * dirX + relY * dirY;
      if (depth <= 0.4 || depth > R.maxDist) continue;
      const rad = L.r || 2.2;
      if (!map.lineOfSight(cam.x, cam.y, L.x, L.y)) continue;

      const lat = dirX * relY - dirY * relX;
      const sx = (W / 2) * (1 + lat / (k * depth));
      const sy = centerY + ((0.5 + cam.z) * projH) / depth;
      const halfW = (projH / depth) * rad;
      const dNear = Math.max(0.3, depth - rad), dFar = depth + rad;
      const halfH = Math.abs(((0.5 + cam.z) * projH) / dNear - ((0.5 + cam.z) * projH) / dFar) / 2;

      const fade = M.clamp(1 - depth / R.maxDist, 0, 1);
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.max(halfW, 1));
      g.addColorStop(0, Color.alpha(L.color, 0.42 * fade * (L.intensity ?? 1)));
      g.addColorStop(0.55, Color.alpha(L.color, 0.15 * fade * (L.intensity ?? 1)));
      g.addColorStop(1, Color.alpha(L.color, 0));
      ctx.save();
      ctx.translate(sx, sy);
      ctx.scale(1, Math.max(0.06, halfH / Math.max(halfW, 1)));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(halfW, 1), 0, M.TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  /* ------------------------------------------------------------------
     Lighting sample used per wall column.
     ------------------------------------------------------------------ */
  function lightAt(x, y, lights) {
    let acc = 0;
    for (let i = 0; i < lights.length; i++) {
      const L = lights[i];
      const dx = x - L.x, dy = y - L.y;
      const d2 = dx * dx + dy * dy;
      const rr = (L.r || 2.5) * (L.r || 2.5);
      if (d2 > rr) continue;
      const t = 1 - Math.sqrt(d2 / rr);
      acc += t * t * (L.intensity ?? 1);
    }
    return acc > 1 ? 1 : acc;
  }

  /* ------------------------------------------------------------------
     Walls
     ------------------------------------------------------------------ */
  function drawWalls(ctx, cam, centerY, projH, theme, lights) {
    const W = R.W, H = R.H;
    const c = R.caster;
    const lut = R.fogLUT;
    const density = theme.fogDensity;
    const TEXSZ = Textures.TEX;
    const ambient = theme.ambient ?? 0.0;

    for (let x = 0; x < W; x++) {
      const cell = c.cell[x];
      if (!cell) continue;
      const dist = c.zBuf[x];

      // Height comes from the cell, so an 'H' building genuinely towers.
      const wh = c.wallHeight[x] || 1;
      const top = centerY + (0.5 + cam.z - wh) * projH / dist;
      const bot = centerY + (0.5 + cam.z) * projH / dist;
      const lineH = bot - top;
      if (bot < 0 || top > H || lineH <= 0) continue;

      const tex = Textures.getWallTexture(theme, cell, c.variant[x]);
      let texX = (c.texU[x] * TEXSZ) | 0;
      if (texX < 0) texX = 0; else if (texX >= TEXSZ) texX = TEXSZ - 1;

      // Clip vertically so a wall right in your face doesn't overdraw 50x.
      let dy = top, dh = lineH, sy = 0, sh = TEXSZ;
      if (top < 0) {
        const cut = -top / lineH;
        sy = cut * TEXSZ; sh = TEXSZ - sy; dy = 0; dh = lineH - (-top);
      }
      if (dy + dh > H) {
        const visible = H - dy;
        sh *= visible / dh;
        dh = visible;
      }
      if (dh <= 0) continue;

      ctx.drawImage(tex, texX, sy, 1, sh, x, dy, 1, dh);

      // Shading: side + distance fog - dynamic light.
      const lit = lights.length ? lightAt(c.hitX[x], c.hitY[x], lights) : 0;
      let dark = c.side[x] === 1 ? 0.34 : 0.10;
      dark += ambient;
      dark = M.clamp(dark - lit * 0.75, 0, 1);
      const fog = M.clamp(1 - Math.exp(-dist * density), 0, 1) * (1 - lit * 0.55);

      const fi = (fog * (FOG_STEPS - 1)) | 0;
      const di = (dark * (DARK_STEPS - 1)) | 0;
      const style = lut[fi * DARK_STEPS + di];
      if (style) {
        ctx.fillStyle = style;
        ctx.fillRect(x, dy, 1, dh);
      }

      // Additive kick for surfaces close to a light source.
      if (lit > 0.12) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = M.clamp((lit - 0.12) * 0.55, 0, 0.6);
        ctx.fillStyle = nearestLightColor(c.hitX[x], c.hitY[x], lights);
        ctx.fillRect(x, dy, 1, dh);
        ctx.restore();
      }
    }
  }

  /**
   * See-over blocks. Each column may have several stacked in depth; they are
   * drawn far-to-near after the full wall so the world reads correctly, and
   * their top edge is recorded per column so sprites behind them clip.
   */
  function drawLowBlocks(ctx, cam, centerY, projH, theme, lights) {
    const W = R.W, H = R.H;
    const c = R.caster;
    const lut = R.fogLUT;
    const density = theme.fogDensity;
    const TEXSZ = Textures.TEX;
    const ambient = theme.ambient ?? 0;
    const MAXL = c.MAX_LOW;

    if (!R.blockTop || R.blockTop.length !== W) {
      R.blockTop = new Float32Array(W);
      R.blockDist = new Float32Array(W);
    }
    R.blockTop.fill(Infinity);
    R.blockDist.fill(Infinity);

    for (let x = 0; x < W; x++) {
      const n = c.lowCount[x];
      if (!n) continue;
      for (let i = n - 1; i >= 0; i--) {          // far -> near
        const b = c.low[x * MAXL + i];
        if (!b) continue;
        const d = b.dist < 0.02 ? 0.02 : b.dist;
        const top = centerY + (0.5 + cam.z - b.h) * projH / d;
        const bot = centerY + (0.5 + cam.z) * projH / d;
        const hgt = bot - top;
        if (hgt <= 0 || bot < 0 || top > H) continue;

        const tex = Textures.getWallTexture(theme, b.cell, b.variant);
        let texX = (b.u * TEXSZ) | 0;
        if (texX < 0) texX = 0; else if (texX >= TEXSZ) texX = TEXSZ - 1;

        let dy = top, dh = hgt, sy = 0, sh = TEXSZ;
        if (top < 0) { const cut = -top / hgt; sy = cut * TEXSZ; sh = TEXSZ - sy; dy = 0; dh = hgt + top; }
        if (dy + dh > H) { const vis = H - dy; sh *= vis / dh; dh = vis; }
        if (dh <= 0) continue;

        ctx.drawImage(tex, texX, sy, 1, sh, x, dy, 1, dh);

        const lit = lights.length ? lightAt(cam.x + 0, cam.y + 0, lights) * 0 : 0;
        let dark = (b.side === 1 ? 0.34 : 0.10) + ambient;
        dark = M.clamp(dark - lit, 0, 1);
        const fog = M.clamp(1 - Math.exp(-d * density), 0, 1);
        const style = lut[((fog * (FOG_STEPS - 1)) | 0) * DARK_STEPS + ((dark * (DARK_STEPS - 1)) | 0)];
        if (style) { ctx.fillStyle = style; ctx.fillRect(x, dy, 1, dh); }

        // Bright lip along the top edge so the ledge reads as standable.
        ctx.fillStyle = Color.alpha(theme.gridColor, 0.5);
        ctx.fillRect(x, Math.max(0, top), 1, Math.min(2, Math.max(0, H - top)));

        if (d < R.blockDist[x]) { R.blockDist[x] = d; R.blockTop[x] = top; }
      }
    }
  }

  function nearestLightColor(x, y, lights) {
    let best = null, bd = Infinity;
    for (const L of lights) {
      const d = M.dist2(x, y, L.x, L.y);
      if (d < bd) { bd = d; best = L; }
    }
    return best ? best.color : '#ffffff';
  }

  /* ------------------------------------------------------------------
     Motes
     ------------------------------------------------------------------ */
  function drawMotes(ctx, cam, centerY, projH, k, theme) {
    const W = R.W, H = R.H;
    const c = R.caster;
    const dirX = cam.dirX, dirY = cam.dirY;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const m of R.motes) {
      const relX = m.x - cam.x, relY = m.y - cam.y;
      const depth = relX * dirX + relY * dirY;
      if (depth <= 0.3 || depth > 16) continue;
      const lat = dirX * relY - dirY * relX;
      const sx = (W / 2) * (1 + lat / (k * depth));
      if (sx < -8 || sx > W + 8) continue;
      const sy = centerY + ((0.5 + cam.z - m.z) * projH) / depth;
      if (sy < 0 || sy > H) continue;
      const col = M.clamp(sx | 0, 0, W - 1);
      if (c.zBuf[col] < depth) continue;
      const rr = Math.max(0.6, (projH / depth) * m.r);
      const a = 0.35 * (1 - depth / 16);
      ctx.fillStyle = Color.alpha(theme.moteColor, a);
      ctx.beginPath(); ctx.arc(sx, sy, rr, 0, M.TAU); ctx.fill();
    }
    ctx.restore();
  }

  /* ------------------------------------------------------------------
     Sprites — depth sorted, per-slice z-buffer clipped.
     ------------------------------------------------------------------ */
  function drawSprites(ctx, cam, centerY, projH, k, sprites, theme) {
    const W = R.W, H = R.H;
    const c = R.caster;
    const dirX = cam.dirX, dirY = cam.dirY;
    const density = theme.fogDensity;

    // Compute depth, cull, sort far -> near.
    const list = [];
    for (const s of sprites) {
      const relX = s.x - cam.x, relY = s.y - cam.y;
      const depth = relX * dirX + relY * dirY;
      if (depth <= 0.18 || depth > R.maxDist) continue;
      const lat = dirX * relY - dirY * relX;
      const sx = (W / 2) * (1 + lat / (k * depth));
      const sheet = s.sheet;
      const aspect = sheet.fw / sheet.fh;
      const hPx = (s.size * projH) / depth;
      const wPx = hPx * aspect;
      if (sx + wPx / 2 < 0 || sx - wPx / 2 > W) continue;
      list.push({ s, depth, sx, wPx, hPx });
    }
    list.sort((a, b) => b.depth - a.depth);

    for (const item of list) {
      const { s, depth, sx, wPx, hPx } = item;
      const sheet = s.sheet;
      const frame = s.frame | 0;
      const fw = sheet.fw, fh = sheet.fh;
      const srcX = frame * fw;

      const cy = centerY + ((0.5 + cam.z - s.z) * projH) / depth;
      const top = cy - hPx / 2;
      const left = sx - wPx / 2;

      // Fog on sprites must match the walls or they look pasted on.
      const fog = M.clamp(1 - Math.exp(-depth * density), 0, 1);
      const alpha = (s.alpha ?? 1);
      if (alpha <= 0.01) continue;

      // Build the source surface (tinted / fogged) when needed.
      let src = sheet.canvas;
      let sOffX = srcX;
      // Additive sprites never take the fog fill, so don't pay for the
      // scratch round-trip on their behalf — particles are additive and
      // by far the most numerous thing on screen.
      const needsTint = (s.tintAmount > 0.01) || (fog > 0.02 && !s.additive);
      if (needsTint) {
        const sc = R.scratch;
        if (sc.canvas.width < fw || sc.canvas.height < fh) {
          sc.canvas.width = Math.max(fw, sc.canvas.width);
          sc.canvas.height = Math.max(fh, sc.canvas.height);
        }
        const sctx = sc.ctx;
        sctx.clearRect(0, 0, fw, fh);
        sctx.globalCompositeOperation = 'source-over';
        sctx.drawImage(sheet.canvas, srcX, 0, fw, fh, 0, 0, fw, fh);
        sctx.globalCompositeOperation = 'source-atop';
        if (s.tintAmount > 0.01) {
          sctx.fillStyle = Color.alpha(s.tint || '#ffffff', M.clamp(s.tintAmount, 0, 1));
          sctx.fillRect(0, 0, fw, fh);
        }
        if (fog > 0.02 && !s.additive) {
          sctx.fillStyle = Color.alpha(theme.fog, fog);
          sctx.fillRect(0, 0, fw, fh);
        }
        sctx.globalCompositeOperation = 'source-over';
        src = sc.canvas;
        sOffX = 0;
      }

      ctx.save();
      ctx.globalAlpha = alpha * (s.additive ? M.clamp(1 - fog * 0.8, 0.05, 1) : 1);
      if (s.additive) ctx.globalCompositeOperation = 'lighter';

      // Slice across the sprite, skipping columns hidden by nearer walls.
      const step = s.additive ? 3 : 2;
      const x0 = Math.max(0, Math.floor(left));
      const x1 = Math.min(W, Math.ceil(left + wPx));
      const bTop = R.blockTop, bDist = R.blockDist;

      /* A slice can be fully hidden by a wall, fully visible, or partly
         hidden behind a low block — in which case only the part ABOVE the
         block's top edge shows. That last case is what makes standing
         behind a crate look right. */
      for (let x = x0; x < x1; x += step) {
        if (c.zBuf[x] <= depth) continue;
        let yTop = top, yH = hPx;
        if (bTop && bDist[x] < depth) {
          const cut = bTop[x];
          if (cut <= top) continue;                 // completely behind it
          if (cut < top + hPx) yH = cut - top;      // clip to the ledge
        }
        if (yH <= 0.5) continue;
        const u0 = (x - left) / wPx;
        const u1 = (Math.min(x + step, x1) - left) / wPx;
        const swSrc = (u1 - u0) * fw;
        if (swSrc <= 0.05) continue;
        ctx.drawImage(src, sOffX + u0 * fw, 0, swSrc, fh * (yH / hPx),
          x, yTop, Math.min(step, x1 - x), yH);
      }

      ctx.restore();
    }
  }

  /* ------------------------------------------------------------------
     Main entry.
     scene = { map, theme, cam, sprites, lights, dt }
     ------------------------------------------------------------------ */
  function render(scene) {
    resize();
    const ctx = R.ctx;
    const W = R.W, H = R.H;
    const cam = scene.cam;
    // The renderer owns the effective theme so a domain can repaint the
    // arena without every caller having to know about it.
    const theme = R.theme || scene.theme;

    const projH = JJK.projConst(H, cam.fovMul);
    const k = JJK.planeK(W, projH);
    const centerY = H / 2 + cam.pitch + cam.bob;

    updateMotes(cam, scene.dt || 0.016);

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // Camera roll: rotate the whole world render slightly.
    if (Math.abs(cam.roll) > 0.0005) {
      ctx.translate(W / 2, H / 2);
      ctx.rotate(cam.roll);
      ctx.scale(1.06, 1.06);           // hide the corners the rotation exposes
      ctx.translate(-W / 2, -H / 2);
    }

    // 1. sky / ceiling
    drawSky(ctx, cam, centerY, theme);

    // 2. floor
    const fy0 = Math.max(0, Math.min(H, centerY));
    if (fy0 < H) {
      ctx.fillStyle = depthGradient(ctx, fy0, H, centerY, projH,
        theme.floorFar, theme.floorNear, theme.fogDensity, false);
      ctx.fillRect(0, fy0, W, H - fy0);
    }

    // 3. floor decoration
    const lights = scene.lights || [];
    drawFloorGrid(ctx, cam, centerY, projH, k, theme);
    if (lights.length) drawLightPools(ctx, cam, scene.map, centerY, projH, k, lights);
    drawGroundShadows(ctx, cam, centerY, projH, k, scene.shadows);

    // 4. walls
    R.caster.cast(scene.map, cam, W, k, R.maxDist);
    drawWalls(ctx, cam, centerY, projH, theme, lights);

    // 4b. low blocks — drawn after the far wall, far to near, so you can
    //     see over them and stand on top.
    drawLowBlocks(ctx, cam, centerY, projH, theme, lights);

    // 5. atmosphere
    drawMotes(ctx, cam, centerY, projH, k, theme);

    // 6. sprites
    if (scene.sprites && scene.sprites.length) {
      drawSprites(ctx, cam, centerY, projH, k, scene.sprites, theme);
    }

    ctx.restore();

    return { projH, k, centerY, W, H, zBuf: R.caster.zBuf };
  }

  /** Blit the internal buffer to the visible canvas. */
  function present() {
    const d = R.dctx;
    d.imageSmoothingEnabled = true;
    d.drawImage(R.buf, 0, 0, R.buf.width, R.buf.height, 0, 0, R.display.width, R.display.height);
  }

  JJK.Renderer = {
    init, resize, render, present, setLevel, setQuality, setDomainTheme,
    get ctx() { return R.ctx; },
    get buf() { return R.buf; },
    get W() { return R.W; },
    get H() { return R.H; },
    get displayCanvas() { return R.display; },
    get caster() { return R.caster; },
    state: R,
  };

  void Camera;
})(window.JJK);
