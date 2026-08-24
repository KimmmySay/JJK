/* ==========================================================================
   SPRITE BAKE — all creature and effect art, generated at load time.

   Why this file exists: the failure mode of most browser 3D games is
   building characters out of primitives (box body, cone horns, cylinder
   arms). That always reads as a toy. Instead every curse spirit here is a
   drawn silhouette — an irregular organic body from a seeded radial noise
   walk, rim-lit with cursed energy, with asymmetric eyes and a jagged maw.

   Everything is baked once into frame strips and blitted, so the per-frame
   cost is a drawImage, not a redraw.

   Animation: each creature bakes a pose strip
       0-5   idle      (breathing, writhing tendrils)
       6-8   windup    (rears back, aura swells — the attack telegraph)
       9-11  strike    (lunges forward, limbs extended)
   Hurt flash and death dissolve are applied at draw time, not baked.
   ========================================================================== */

(function (JJK) {
  'use strict';

  const { M, Color, makeCanvas } = JJK;

  const FW = 112;   // frame width
  const FH = 142;   // frame height

  /* Curse strips are baked as ANGLES x POSES.

     A single front-facing billboard is what makes sprite enemies read as
     flat paintings: it always turns to face you, so you can never see which
     way it is looking, never flank it, and never perceive it as a volume.
     Baking 8 yaw angles and picking by the angle between the creature's
     facing and the view ray fixes all three — you see it turn, you see its
     back, and it occupies space.

     Poses per angle are kept lean (4 idle + 2 windup + 2 strike) so the
     total stays at 64 frames per creature rather than 96+. The idle cycle
     is ping-ponged at draw time, which reads as 6 steps from 4 frames. */
  const ANGLES = 8;
  const IDLE = 4, WINDUP = 2, STRIKE = 2;
  const POSES = IDLE + WINDUP + STRIKE;    // 8
  const FRAMES = ANGLES * POSES;           // 64

  /* Shikigami keep their own richer 12-pose layout (no yaw variants). */
  const SH_IDLE = 6, SH_WINDUP = 3, SH_STRIKE = 3;
  const SH_POSES = SH_IDLE + SH_WINDUP + SH_STRIKE;

  const cache = new Map();

  /* ==================================================================
     Silhouette generator — an irregular closed blob. This is the single
     most important function for making curses look hand-made: the radial
     noise walk gives lumpy, asymmetric bodies instead of ellipses.
     ================================================================== */
  function bodyPath(ctx, cx, cy, rx, ry, rnd, lumps, wobble, phase) {
    const pts = [];
    const N = 26;
    // Pre-roll a stable set of lump offsets so the body keeps its identity
    // across frames; only `phase` animates.
    for (let i = 0; i < N; i++) {
      const a = (i / N) * M.TAU;
      const noise =
        Math.sin(a * lumps + rnd.seedA) * 0.16 +
        Math.sin(a * (lumps * 2 + 1) + rnd.seedB) * 0.08 +
        Math.sin(a * 3 + phase * 1.7 + rnd.seedC) * wobble;
      const r = 1 + noise;
      pts.push({ x: cx + Math.cos(a) * rx * r, y: cy + Math.sin(a) * ry * r });
    }
    ctx.beginPath();
    ctx.moveTo((pts[0].x + pts[N - 1].x) / 2, (pts[0].y + pts[N - 1].y) / 2);
    for (let i = 0; i < N; i++) {
      const p = pts[i], n = pts[(i + 1) % N];
      ctx.quadraticCurveTo(p.x, p.y, (p.x + n.x) / 2, (p.y + n.y) / 2);
    }
    ctx.closePath();
  }

  /** Tapered limb with claws, drawn as a filled polygon. */
  function limb(ctx, x, y, angle, len, thick, color, clawColor, segments) {
    let px = x, py = y, a = angle;
    const left = [], right = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const w = thick * (1 - t * 0.72);
      left.push({ x: px + Math.cos(a - M.HALF_PI) * w, y: py + Math.sin(a - M.HALF_PI) * w });
      right.push({ x: px + Math.cos(a + M.HALF_PI) * w, y: py + Math.sin(a + M.HALF_PI) * w });
      const step = len / segments;
      px += Math.cos(a) * step;
      py += Math.sin(a) * step;
      a += 0.16;   // natural inward curl
    }
    ctx.beginPath();
    ctx.moveTo(left[0].x, left[0].y);
    for (const p of left) ctx.lineTo(p.x, p.y);
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();

    // Claws at the tip.
    ctx.fillStyle = clawColor;
    for (let c = -1; c <= 1; c++) {
      const ca = a + c * 0.34;
      const cl = thick * 1.5;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + Math.cos(ca) * cl, py + Math.sin(ca) * cl);
      ctx.lineTo(px + Math.cos(ca + 0.5) * cl * 0.4, py + Math.sin(ca + 0.5) * cl * 0.4);
      ctx.closePath();
      ctx.fill();
    }
    return { x: px, y: py };
  }

  /** Glowing asymmetric eye. */
  function eye(ctx, x, y, r, color, open) {
    if (open <= 0.02) {
      ctx.strokeStyle = Color.alpha(color, 0.5);
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.stroke();
      return;
    }
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.6);
    g.addColorStop(0, Color.alpha(color, 0.9));
    g.addColorStop(0.35, Color.alpha(color, 0.35));
    g.addColorStop(1, Color.alpha(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r * 2.6, 0, M.TAU); ctx.fill();

    ctx.fillStyle = '#f6f1e8';
    ctx.beginPath(); ctx.ellipse(x, y, r, r * open, 0, 0, M.TAU); ctx.fill();
    ctx.fillStyle = '#0a0508';
    ctx.beginPath(); ctx.ellipse(x, y, r * 0.34, r * open * 0.86, 0, 0, M.TAU); ctx.fill();
    ctx.fillStyle = Color.alpha('#ffffff', 0.8);
    ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * open * 0.3, r * 0.15, 0, M.TAU); ctx.fill();
  }

  /** Jagged maw. `open` 0..1 */
  function maw(ctx, x, y, w, h, open, color) {
    const oh = h * (0.15 + open * 0.85);
    ctx.fillStyle = '#12040a';
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y);
    ctx.quadraticCurveTo(x, y - oh * 0.3, x + w / 2, y);
    ctx.quadraticCurveTo(x, y + oh, x - w / 2, y);
    ctx.closePath();
    ctx.fill();

    // Inner glow — the throat.
    const g = ctx.createRadialGradient(x, y + oh * 0.25, 0, x, y + oh * 0.25, w * 0.5);
    g.addColorStop(0, Color.alpha(color, 0.55));
    g.addColorStop(1, Color.alpha(color, 0));
    ctx.fillStyle = g;
    ctx.fill();

    // Teeth.
    const teeth = Math.max(4, Math.round(w / 7));
    ctx.fillStyle = '#e8e0d0';
    for (let i = 0; i < teeth; i++) {
      const t = i / (teeth - 1);
      const tx = x - w / 2 + t * w;
      const th = oh * (0.22 + (i % 2) * 0.16);
      ctx.beginPath();
      ctx.moveTo(tx - w / teeth * 0.3, y);
      ctx.lineTo(tx, y + th);
      ctx.lineTo(tx + w / teeth * 0.3, y);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(tx - w / teeth * 0.3, y + oh * 0.72);
      ctx.lineTo(tx, y + oh * 0.72 - th * 0.75);
      ctx.lineTo(tx + w / teeth * 0.3, y + oh * 0.72);
      ctx.closePath(); ctx.fill();
    }
  }

  /** Wispy lower-body tendrils for floating curses. */
  function tendrils(ctx, cx, cy, count, len, spread, color, phase, rnd) {
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const ox = (t - 0.5) * spread;
      const sway = Math.sin(phase * 2 + i * 1.3) * (6 + i * 1.5);
      const l = len * (0.6 + rnd.tendril[i % rnd.tendril.length]);
      const g = ctx.createLinearGradient(cx + ox, cy, cx + ox + sway, cy + l);
      g.addColorStop(0, Color.alpha(color, 0.85));
      g.addColorStop(1, Color.alpha(color, 0));
      ctx.strokeStyle = g;
      ctx.lineWidth = 5 - t * 1.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx + ox, cy);
      ctx.quadraticCurveTo(cx + ox + sway * 0.5, cy + l * 0.55, cx + ox + sway, cy + l);
      ctx.stroke();
    }
  }

  /* ==================================================================
     CURSE SPIRIT — one frame at a given yaw.

     `yaw` is the creature's facing relative to the viewer:
       0    facing you head-on
       PI/2 side-on
       PI   turned away, you see its back

     Turning is expressed three ways at once, which is what sells it as a
     volume rather than a rotated cutout:
       1. the body narrows as it turns side-on (foreshortening)
       2. facial features slide across the head and clip out past the edge
       3. limb depth order swaps, and the far limb shrinks
     Past 90 degrees the face is gone entirely and a spine ridge takes over.
     ================================================================== */
  function drawCurse(ctx, spec, rnd, pose, yaw) {
    const cx = FW / 2;
    const scale = spec.scale;
    const face = Math.cos(yaw || 0);   // +1 toward viewer, -1 away
    const side = Math.sin(yaw || 0);   // lateral turn
    const showFace = face > -0.10;

    const lean = pose.lean * 12 * (face >= 0 ? 1 : -1);
    const bodyCY = FH - 52 * scale - pose.hop * 7 + pose.crouch * 9;
    // Foreshortening: a body turned side-on presents a narrower profile.
    const bodyRX = 30 * scale * (0.70 + 0.30 * Math.abs(face)) * (1 + pose.squash * 0.12);
    const bodyRY = 35 * scale * (1 - pose.squash * 0.14);
    const bx = cx + lean + side * 3 * scale;

    // Outer cursed aura.
    ctx.save();
    const ag = ctx.createRadialGradient(bx, bodyCY, bodyRX * 0.4, bx, bodyCY, bodyRX * 2.5);
    ag.addColorStop(0, Color.alpha(spec.glow, 0.20 * pose.aura));
    ag.addColorStop(0.5, Color.alpha(spec.glow, 0.09 * pose.aura));
    ag.addColorStop(1, Color.alpha(spec.glow, 0));
    ctx.fillStyle = ag;
    ctx.fillRect(0, 0, FW, FH);
    ctx.restore();

    if (spec.floats) {
      tendrils(ctx, bx, bodyCY + bodyRY * 0.5, spec.tendrils,
        40 * scale, bodyRX * 1.4, spec.body, pose.phase, rnd);
    }

    // Limbs behind the body. `depth` is how far each shoulder is from the
    // viewer, so the far arm draws smaller and darker.
    const shoulderY = bodyCY - bodyRY * 0.25;
    const reach = pose.reach;
    const arms = [-1, 1].map((sgn) => ({ sgn, depth: sgn * side }));
    arms.sort((a, b) => a.depth - b.depth);   // far arm first
    for (const arm of arms) {
      const near = arm.depth > 0 ? 1 : 0.78;
      // One arm is longer and heavier than the other. Symmetry reads as
      // "designed"; curses should read as "grown wrong".
      const bias = arm.sgn > 0 ? rnd.armBias : 2 - rnd.armBias;
      const ox = arm.sgn * bodyRX * 0.8 * (0.55 + 0.45 * Math.abs(face)) + side * 4;
      limb(ctx,
        bx + ox, shoulderY,
        arm.sgn > 0 ? -0.35 - reach * 0.9 : Math.PI + 0.35 + reach * 0.9,
        (30 + reach * 24) * scale * near * bias, 7.0 * scale * near * bias,
        Color.shade(spec.body, 0.72 * near), spec.claw, 4);
    }

    // Hunched shoulders. Cursed spirits carry their head sunk between a
    // pair of heavy shoulders rather than on a neck.
    ctx.save();
    ctx.fillStyle = Color.shade(spec.body, 0.62);
    for (const sgn of [-1, 1]) {
      const hx = bx + sgn * bodyRX * 0.62 * (0.5 + 0.5 * Math.abs(face));
      ctx.beginPath();
      ctx.ellipse(hx, bodyCY - bodyRY * 0.52, bodyRX * 0.40, bodyRY * 0.30,
        sgn * 0.35, 0, M.TAU);
      ctx.fill();
    }
    ctx.restore();

    // Main mass.
    ctx.save();
    bodyPath(ctx, bx, bodyCY, bodyRX, bodyRY, rnd, spec.lumps, spec.wobble, pose.phase);
    // Light comes from the viewer's side, so a turned body shades off.
    const lightX = bx - bodyRX * 0.35 * face - side * bodyRX * 0.35;
    const bg = ctx.createRadialGradient(
      lightX, bodyCY - bodyRY * 0.4, bodyRX * 0.1,
      bx, bodyCY, bodyRX * 1.35);
    bg.addColorStop(0, Color.shade(spec.body, 1.5));
    bg.addColorStop(0.45, spec.body);
    bg.addColorStop(1, Color.shade(spec.body, 0.40));
    ctx.fillStyle = bg;
    ctx.fill();

    ctx.clip();
    for (let i = 0; i < spec.mottle; i++) {
      const mx = bx + rnd.mot[i * 2] * bodyRX;
      const my = bodyCY + rnd.mot[i * 2 + 1] * bodyRY;
      // mot is in [-1, 1) — take the magnitude or the radius can go
      // negative, and createRadialGradient throws on r < 0 (kills the
      // whole asset build for whichever curse rolls that seed).
      const mr = (5 + Math.abs(rnd.mot[(i * 3) % rnd.mot.length]) * 11) * scale;
      const mg = ctx.createRadialGradient(mx, my, 0, mx, my, mr);
      mg.addColorStop(0, Color.alpha(Color.shade(spec.body, 0.35), 0.55));
      mg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = mg;
      ctx.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
    }
    // Cursed energy veins.
    ctx.strokeStyle = Color.alpha(spec.glow, 0.30 * pose.aura);
    ctx.lineWidth = 1.5 * scale;
    for (let i = 0; i < 4; i++) {
      let vx = bx + rnd.vein[i * 2] * bodyRX * 0.8;
      let vy = bodyCY + rnd.vein[i * 2 + 1] * bodyRY * 0.8;
      let va = rnd.vein[i] * M.TAU;
      ctx.beginPath(); ctx.moveTo(vx, vy);
      for (let k = 0; k < 5; k++) {
        va += (rnd.vein[(i * 5 + k) % rnd.vein.length]) * 1.2;
        vx += Math.cos(va) * 8 * scale; vy += Math.sin(va) * 8 * scale;
        ctx.lineTo(vx, vy);
      }
      ctx.stroke();
    }
    // Exposed ribs / sinew — flesh stretched over something structural.
    if (spec.ribs) {
      ctx.strokeStyle = Color.alpha(Color.shade(spec.body, 1.45), 0.30);
      ctx.lineWidth = 2.2 * scale;
      for (let i = 0; i < 4; i++) {
        const ry2 = bodyCY - bodyRY * 0.2 + i * bodyRY * 0.27;
        ctx.beginPath();
        ctx.ellipse(bx + side * bodyRX * 0.25, ry2,
          bodyRX * (0.78 - i * 0.10), bodyRY * 0.16, 0, Math.PI * 0.08, Math.PI * 0.92);
        ctx.stroke();
      }
    }

    // Eyes on the BODY, not the face. Deeply wrong-looking, very on-brand.
    if (face > 0.1) {
      for (let i = 0; i < spec.bodyEyes; i++) {
        const bp = rnd.bodyEyes[i % rnd.bodyEyes.length];
        eye(ctx,
          bx + side * bodyRX * 0.4 + bp.x * bodyRX * 0.55,
          bodyCY + bp.y * bodyRY * 0.5,
          (1.8 + bp.r * 2.0) * scale, spec.glow, pose.eyeOpen * 0.9);
      }
    }

    // Turned away: a ridged spine reads instantly as "this is its back".
    if (face < 0.25) {
      const backAmt = M.clamp((0.25 - face) / 1.25, 0, 1);
      ctx.strokeStyle = Color.alpha(Color.shade(spec.body, 0.35), 0.85 * backAmt);
      ctx.lineWidth = 3.5 * scale;
      ctx.beginPath();
      ctx.moveTo(bx + side * 5, bodyCY - bodyRY * 0.85);
      ctx.lineTo(bx + side * 5, bodyCY + bodyRY * 0.7);
      ctx.stroke();
      ctx.fillStyle = Color.alpha(spec.claw, 0.9 * backAmt);
      for (let i = 0; i < 5; i++) {
        const sy2 = bodyCY - bodyRY * 0.75 + i * bodyRY * 0.34;
        ctx.beginPath();
        ctx.moveTo(bx + side * 5 - 4 * scale, sy2);
        ctx.lineTo(bx + side * 5, sy2 - 8 * scale);
        ctx.lineTo(bx + side * 5 + 4 * scale, sy2);
        ctx.closePath(); ctx.fill();
      }
    }
    ctx.restore();

    // Rim light.
    ctx.save();
    bodyPath(ctx, bx, bodyCY, bodyRX, bodyRY, rnd, spec.lumps, spec.wobble, pose.phase);
    ctx.strokeStyle = Color.alpha(spec.glow, 0.5 + pose.aura * 0.35);
    ctx.lineWidth = 2 * scale;
    ctx.shadowColor = spec.glow;
    ctx.shadowBlur = 13 * pose.aura;
    ctx.stroke();
    ctx.restore();

    // Horns swing around the head as it turns.
    if (spec.horns) {
      ctx.fillStyle = Color.shade(spec.claw, 0.9);
      for (const sgn of [-1, 1]) {
        const hx = bx + sgn * bodyRX * 0.52 * Math.abs(face) + side * bodyRX * 0.45;
        const hy = bodyCY - bodyRY * 0.72;
        ctx.beginPath();
        ctx.moveTo(hx - 4 * scale, hy);
        ctx.quadraticCurveTo(hx + sgn * 9 * scale, hy - 18 * scale, hx + sgn * 3 * scale, hy - 27 * scale);
        ctx.quadraticCurveTo(hx + sgn * 2 * scale, hy - 14 * scale, hx + 4 * scale, hy);
        ctx.closePath(); ctx.fill();
      }
    }

    // Face — slides across the head, clipped to the silhouette so features
    // disappear round the edge instead of floating off it.
    if (showFace) {
      const fade = M.clamp((face + 0.10) / 0.5, 0, 1);
      ctx.save();
      bodyPath(ctx, bx, bodyCY, bodyRX, bodyRY, rnd, spec.lumps, spec.wobble, pose.phase);
      ctx.clip();
      ctx.globalAlpha = fade;
      const faceY = bodyCY - bodyRY * 0.30;
      const faceX = bx + side * bodyRX * 0.55;
      for (let i = 0; i < spec.eyes; i++) {
        const ep = rnd.eyePos[i];
        const ex = faceX + ep.x * bodyRX * (0.55 + 0.45 * Math.abs(face));
        const ey = faceY + ep.y * bodyRY;
        eye(ctx, ex, ey, (3.0 + ep.r * 2.6) * scale, spec.glow, pose.eyeOpen);
      }
      const mawW = bodyRX * 0.9 * (0.5 + 0.5 * Math.abs(face));
      const mawY = faceY + bodyRY * 0.42;
      // Slack lower jaw hanging below the mouth — the human-but-wrong note.
      if (spec.jaw) {
        const droop = (6 + rnd.jawDroop * 10) * scale * (0.5 + pose.mouth);
        ctx.fillStyle = Color.shade(spec.body, 0.55);
        ctx.beginPath();
        ctx.moveTo(faceX - mawW * 0.45, mawY);
        ctx.quadraticCurveTo(faceX, mawY + droop * 1.7, faceX + mawW * 0.45, mawY);
        ctx.closePath();
        ctx.fill();
      }
      maw(ctx, faceX, mawY, mawW, 19 * scale, pose.mouth, spec.glow);
      ctx.restore();
    }

    // Front limbs, over the body during a strike.
    if (reach > 0.25) {
      for (const sgn of [-1, 1]) {
        const near = sgn * side > 0 ? 1 : 0.8;
        limb(ctx,
          bx + sgn * bodyRX * 0.55 * (0.55 + 0.45 * Math.abs(face)), shoulderY + 6,
          sgn > 0 ? -0.1 - reach * 0.35 : Math.PI + 0.1 + reach * 0.35,
          (38 + reach * 28) * scale * near, 8.5 * scale * near,
          Color.shade(spec.body, 0.95 * near), spec.claw, 4);
      }
    }
  }

  /* ==================================================================
     Curse spirit specs by tier. These mirror the original game's
     weak/medium/strong/special enemy tiers.
     ================================================================== */
  const CURSE_TIERS = {
    /* Palettes lean fleshy and sickly rather than flat purple — cursed
       spirits are grown out of human misery, and they should look like
       meat with something wrong inside it, not neon slime. */
    weak: {
      scale: 0.62, body: '#4b3a4e', glow: '#b06cff', claw: '#20161f',
      eyes: 2, bodyEyes: 1, lumps: 5, wobble: 0.05, mottle: 5, horns: false,
      floats: true, tendrils: 4, ribs: false, jaw: true,
    },
    medium: {
      scale: 0.85, body: '#4a3646', glow: '#9b5cf6', claw: '#1b1119',
      eyes: 3, bodyEyes: 2, lumps: 6, wobble: 0.045, mottle: 7, horns: false,
      floats: true, tendrils: 5, ribs: true, jaw: true,
    },
    strong: {
      scale: 1.08, body: '#573b40', glow: '#c026d3', claw: '#170d12',
      eyes: 4, bodyEyes: 3, lumps: 7, wobble: 0.04, mottle: 9, horns: true,
      floats: false, tendrils: 0, ribs: true, jaw: true,
    },
    special: {
      scale: 1.4, body: '#6a4640', glow: '#ff2d78', claw: '#150a0c',
      eyes: 5, bodyEyes: 4, lumps: 8, wobble: 0.035, mottle: 11, horns: true,
      floats: false, tendrils: 0, ribs: true, jaw: true,
    },
    /* Mahito's transfigured humans — pale, wrong, stitched. */
    transfigured: {
      scale: 0.8, body: '#9c8a86', glow: '#67e8f9', claw: '#33282c',
      eyes: 3, bodyEyes: 3, lumps: 9, wobble: 0.09, mottle: 8, horns: false,
      floats: false, tendrils: 0, ribs: true, jaw: true,
    },
    /* Geto's summoned curses — bound, indigo. */
    bound: {
      scale: 0.9, body: '#43355e', glow: '#a78bfa', claw: '#1c1430',
      eyes: 4, bodyEyes: 2, lumps: 6, wobble: 0.05, mottle: 6, horns: true,
      floats: true, tendrils: 6, ribs: false, jaw: false,
    },
  };

  /** Stable per-instance randomness for a curse's identity. */
  function curseRnd(seed) {
    const r = M.rng(seed);
    const eyePos = [];
    for (let i = 0; i < 8; i++) {
      eyePos.push({ x: (r() - 0.5) * 1.25, y: (r() - 0.5) * 0.85, r: r() });
    }
    // Body eyes sit on the torso, not the face — a very cursed-spirit trait.
    const bodyEyes = [];
    for (let i = 0; i < 4; i++) {
      bodyEyes.push({ x: (r() - 0.5) * 1.5, y: (r() - 0.2) * 0.9, r: r() });
    }
    return {
      seedA: r() * M.TAU, seedB: r() * M.TAU, seedC: r() * M.TAU,
      mot: Array.from({ length: 32 }, () => r() * 2 - 1),
      vein: Array.from({ length: 32 }, () => r() * 2 - 1),
      tendril: Array.from({ length: 8 }, () => r()),
      // Nothing about a curse is symmetrical. One arm is always wrong.
      armBias: 0.55 + r() * 0.85,
      jawDroop: r(),
      eyePos, bodyEyes,
    };
  }

  /** Pose for index i within a strip of (idle, windup, strike) counts. */
  function poseFor(i, idle, windup, strike) {
    idle = idle || IDLE; windup = windup || WINDUP; strike = strike || STRIKE;
    if (i < idle) {
      const t = i / idle;
      const ph = t * M.TAU;
      return {
        phase: ph,
        lean: Math.sin(ph) * 0.12,
        hop: (Math.sin(ph) * 0.5 + 0.5) * 0.5,
        crouch: 0,
        squash: Math.sin(ph) * 0.10,
        reach: 0,
        mouth: 0.12 + Math.sin(ph * 2) * 0.06,
        eyeOpen: 1,
        aura: 0.75 + Math.sin(ph) * 0.12,
      };
    }
    if (i < idle + windup) {
      const t = windup <= 1 ? 1 : (i - idle) / (windup - 1);
      return {
        phase: t * 2,
        lean: -0.35 * t,
        hop: 0,
        crouch: t * 0.9,
        squash: 0.25 * t,
        reach: 0.15 * t,
        mouth: 0.35 + t * 0.4,
        eyeOpen: 1 + t * 0.25,
        aura: 1 + t * 0.9,           // aura swells = readable telegraph
      };
    }
    const t = strike <= 1 ? 0 : (i - idle - windup) / (strike - 1);
    return {
      phase: 2 + t,
      lean: M.lerp(0.55, 0.3, t),
      hop: 0.2,
      crouch: -0.3,
      squash: M.lerp(-0.2, 0.05, t),
      reach: M.lerp(1, 0.6, t),
      mouth: M.lerp(1, 0.55, t),
      eyeOpen: 1.15,
      aura: M.lerp(1.5, 0.9, t),
    };
  }

  /**
   * Which pose an entity should show right now, given a sheet's layout.
   * Shared by curses and shikigami so entity code doesn't duplicate it.
   */
  const IDLE_PINGPONG = [0, 1, 2, 3, 2, 1];
  function poseIndex(sheet, state, stateT, tell, animT, speed) {
    const L = sheet.layout || { idle: IDLE, windup: WINDUP, strike: STRIKE };
    if (state === 'windup') {
      const f = M.clamp(stateT / Math.max(0.01, tell || 0.5), 0, 0.999);
      return L.idle + Math.floor(f * L.windup);
    }
    if (state === 'strike') {
      const f = M.clamp(stateT / 0.32, 0, 0.999);
      return L.idle + L.windup + Math.floor(f * L.strike);
    }
    if (state === 'stagger') return Math.min(1, L.idle - 1);
    const rate = speed || 7;
    if (L.idle === 4) return IDLE_PINGPONG[Math.floor(animT * rate) % IDLE_PINGPONG.length];
    return Math.floor(animT * rate) % L.idle;
  }

  /**
   * Bake a curse spirit into a horizontal frame strip.
   * Returns { canvas, fw, fh, frames, aspect }.
   */
  function bakeCurse(tier, seed) {
    const key = `curse:${tier}:${seed}`;
    if (cache.has(key)) return cache.get(key);

    const spec = CURSE_TIERS[tier] || CURSE_TIERS.weak;
    const rnd = curseRnd(seed);
    const { canvas, ctx } = makeCanvas(FW * FRAMES, FH);

    // Frame layout is [angle 0 poses][angle 1 poses]... so a frame index is
    // simply angleIndex * POSES + pose.
    for (let a = 0; a < ANGLES; a++) {
      const yaw = (a / ANGLES) * M.TAU;
      for (let p = 0; p < POSES; p++) {
        const i = a * POSES + p;
        ctx.save();
        ctx.translate(i * FW, 0);
        ctx.beginPath(); ctx.rect(0, 0, FW, FH); ctx.clip();
        drawCurse(ctx, spec, rnd, poseFor(p), yaw);
        ctx.restore();
      }
    }

    const out = {
      canvas, fw: FW, fh: FH, frames: FRAMES, spec,
      angles: ANGLES, poses: POSES,
      layout: { idle: IDLE, windup: WINDUP, strike: STRIKE },
    };
    cache.set(key, out);
    return out;
  }

  /* ==================================================================
     AVATAR BILLBOARD — the roster portraits, framed as figures.

     The Avatar/ folder mixes png (alpha), webp and jpg (no alpha). Drawing
     a jpg straight into the world gives you a floating rectangle. So each
     portrait is masked into a feathered capsule with a cursed-energy rim
     and a ground shadow — consistent for every source format.
     ================================================================== */
  function bakeAvatar(img, color, glow, seed) {
    const W = 150, H = 210;
    const { canvas, ctx } = makeCanvas(W, H);
    const rnd = M.rng(seed || 1);

    const cx = W / 2;
    const figTop = 16, figH = H - 40;
    const figCY = figTop + figH / 2;
    const rx = W * 0.36, ry = figH / 2;

    // --- Aura behind the figure.
    const ag = ctx.createRadialGradient(cx, figCY, rx * 0.3, cx, figCY, rx * 2.1);
    ag.addColorStop(0, Color.alpha(glow, 0.30));
    ag.addColorStop(0.55, Color.alpha(glow, 0.12));
    ag.addColorStop(1, Color.alpha(glow, 0));
    ctx.fillStyle = ag;
    ctx.fillRect(0, 0, W, H);

    // --- Portrait, masked to a feathered capsule.
    const layer = makeCanvas(W, H);
    if (img) {
      // cover-fit into the capsule box
      const bw = rx * 2, bh = ry * 2;
      const s = Math.max(bw / img.naturalWidth, bh / img.naturalHeight);
      const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
      layer.ctx.drawImage(img, cx - dw / 2, figCY - dh / 2 - dh * 0.04, dw, dh);
    } else {
      // Procedural stand-in so a missing file still reads as a sorcerer.
      const g = layer.ctx.createLinearGradient(0, figTop, 0, figTop + figH);
      g.addColorStop(0, Color.shade(color, 1.35));
      g.addColorStop(1, Color.shade(color, 0.45));
      layer.ctx.fillStyle = g;
      layer.ctx.fillRect(cx - rx, figTop, rx * 2, figH);
      layer.ctx.fillStyle = 'rgba(0,0,0,0.55)';
      layer.ctx.beginPath();
      layer.ctx.arc(cx, figTop + figH * 0.28, rx * 0.42, 0, M.TAU);
      layer.ctx.fill();
    }

    // Feathered elliptical mask.
    layer.ctx.globalCompositeOperation = 'destination-in';
    const mg = layer.ctx.createRadialGradient(cx, figCY, 0, cx, figCY, 1);
    // Use a transform so the radial gradient becomes elliptical.
    layer.ctx.save();
    layer.ctx.translate(cx, figCY);
    layer.ctx.scale(rx, ry);
    const eg = layer.ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    eg.addColorStop(0, 'rgba(0,0,0,1)');
    eg.addColorStop(0.72, 'rgba(0,0,0,1)');
    eg.addColorStop(0.93, 'rgba(0,0,0,0.55)');
    eg.addColorStop(1, 'rgba(0,0,0,0)');
    layer.ctx.fillStyle = eg;
    layer.ctx.fillRect(-1.2, -1.2, 2.4, 2.4);
    layer.ctx.restore();
    layer.ctx.globalCompositeOperation = 'source-over';
    void mg;

    ctx.drawImage(layer.canvas, 0, 0);

    // --- Rim light along the capsule edge.
    ctx.save();
    ctx.strokeStyle = Color.alpha(glow, 0.75);
    ctx.lineWidth = 2.4;
    ctx.shadowColor = glow;
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.ellipse(cx, figCY, rx * 0.99, ry * 0.99, 0, 0, M.TAU);
    ctx.stroke();
    ctx.restore();

    // --- Cursed energy wisps rising off the figure.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 9; i++) {
      const a = rnd() * M.TAU;
      const wx = cx + Math.cos(a) * rx * (0.85 + rnd() * 0.35);
      const wy = figCY + Math.sin(a) * ry * (0.85 + rnd() * 0.3);
      const wr = 4 + rnd() * 12;
      const wg = ctx.createRadialGradient(wx, wy, 0, wx, wy, wr);
      wg.addColorStop(0, Color.alpha(glow, 0.5));
      wg.addColorStop(1, Color.alpha(glow, 0));
      ctx.fillStyle = wg;
      ctx.fillRect(wx - wr, wy - wr, wr * 2, wr * 2);
    }
    ctx.restore();

    // --- Ground shadow.
    const sg = ctx.createRadialGradient(cx, H - 14, 0, cx, H - 14, rx * 1.15);
    sg.addColorStop(0, 'rgba(0,0,0,0.65)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.ellipse(cx, H - 14, rx * 1.15, 14, 0, 0, M.TAU); ctx.fill();

    return {
      canvas, fw: W, fh: H, frames: 1,
      angles: 1, poses: 1, layout: { idle: 1, windup: 0, strike: 0 },
    };
  }

  /* ==================================================================
     SHIKIGAMI — Megumi's Ten Shadows.

     These get their own baker rather than reusing bakeAvatar, because a
     divine dog is not a person: run it through the humanoid capsule mask
     and you get a floating vertical oval that slides around without moving
     a muscle. Correct silhouette + a real animation cycle is the whole
     difference between "shadow wolf" and "placeholder".

     They are shadow constructs, so each is built as a near-black volume
     with a cursed-blue rim, and the source portrait is composited INSIDE
     the silhouette at partial opacity — the real art still shows through
     as texture, but the shape and motion are authored.

     Frame layout matches the curse strip (6 idle / 3 windup / 3 strike) so
     the entity animation code is shared.
     ================================================================== */

  const SHIKI = {
    divineDog:      { w: 176, h: 120, ground: true },
    divineDogWhite: { w: 176, h: 120, ground: true, draw: 'divineDog',
                      pal: { body: '#cfd4e2', glow: '#9fd0ff', claw: '#2b2f3d' } },
    nue:            { w: 176, h: 132, ground: false },
    mahoraga:       { w: 150, h: 210, ground: true },
  };

  /** Clip an image into the current path as interior texture. Blended with
      soft-light rather than pasted: a literal draw reads as a white decal
      stuck inside the shadow body (and shows any checkerboard baked into
      the source file); soft-light keeps the construct's dark tone and uses
      the art only as tonal variation. */
  function fillWithArt(ctx, img, x, y, w, h, alpha) {
    if (!img) return;
    ctx.save();
    ctx.clip();
    const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = Math.min(1, alpha * 1.5);
    ctx.drawImage(img, x + w / 2 - dw / 2, y + h / 2 - dh / 2, dw, dh);
    ctx.restore();
  }

  /** Shadow wisps peeling off a construct. */
  function wisps(ctx, cx, cy, spread, count, color, phase, rnd) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < count; i++) {
      const t = i / count;
      const a = phase * 1.4 + i * 2.1;
      const wx = cx + Math.sin(a) * spread * (0.4 + t);
      const wy = cy - t * spread * 0.9 - Math.abs(Math.cos(a)) * 6;
      const r = (3 + rnd.tendril[i % rnd.tendril.length] * 7) * (1 - t * 0.5);
      const g = ctx.createRadialGradient(wx, wy, 0, wx, wy, r);
      g.addColorStop(0, Color.alpha(color, 0.35 * (1 - t)));
      g.addColorStop(1, Color.alpha(color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(wx - r, wy - r, r * 2, r * 2);
    }
    ctx.restore();
  }

  /**
   * A ragged fur silhouette. Alternating spikes instead of a smooth ellipse
   * is the single biggest thing separating "wolf" from "teddy bear" — a
   * clean curved outline always reads as a plush toy.
   */
  function furPath(ctx, cx, cy, rx, ry, spikes, len, rnd, seedOff) {
    const N = spikes * 2;
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * M.TAU - M.HALF_PI;
      const jag = (i % 2 === 0) ? 1 : 1 + len * (0.5 + rnd.tendril[(i + seedOff) % rnd.tendril.length]);
      const x = cx + Math.cos(a) * rx * jag;
      const y = cy + Math.sin(a) * ry * jag;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  /**
   * DIVINE DOG — one frame.
   *
   * Built as a lean, stalking wolf, deliberately against every instinct
   * that produces a cute animal:
   *   - body is ELONGATED horizontally, not a round mass
   *   - head carried LOW and FORWARD on an extended neck, below the
   *     shoulder line, the way a canid stalks
   *   - long wedge SNOUT rather than a button muzzle
   *   - ears small, low and SWEPT BACK against the skull, never tall
   *     triangles standing off the head
   *   - eyes are narrow glowing SLITS, not round sclera with pupils
   *   - all four legs visible and doing work
   *   - the whole silhouette is jagged with fur
   */
  function drawDivineDog(ctx, img, pal, rnd, pose, W, H) {
    const cx = W / 2;
    const gy = H - 8;
    const bob = pose.hop * 5 - pose.crouch * 5;
    const lunge = pose.reach;
    const gait = pose.phase * 2;

    // Shadow pool it is made of.
    const sg = ctx.createRadialGradient(cx, gy, 0, cx, gy, 58);
    sg.addColorStop(0, 'rgba(0,0,0,0.75)');
    sg.addColorStop(0.6, 'rgba(0,0,0,0.30)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.ellipse(cx, gy, 58, 13, 0, 0, M.TAU); ctx.fill();

    const backY = gy - 58 + bob;      // top of the shoulders
    const bodyCX = cx - 6;
    const bodyRX = 40, bodyRY = 20;   // wide and shallow = lean, not round

    const dark = Color.shade(pal.body, 0.55);
    const mid = pal.body;
    const light = Color.shade(pal.body, 1.5);

    /* ---- hind legs (behind the body) ---- */
    for (const sgn of [-1, 1]) {
      const sw = Math.sin(gait + (sgn > 0 ? 0 : Math.PI)) * 10;
      const hx = bodyCX - 26 + sgn * 7;
      ctx.fillStyle = Color.shade(pal.body, 0.45);
      ctx.beginPath();
      ctx.moveTo(hx - 7, backY + 12);
      ctx.quadraticCurveTo(hx - 12 + sw, backY + 30, hx - 5 + sw, gy - 3);
      ctx.lineTo(hx + 5 + sw, gy - 3);
      ctx.quadraticCurveTo(hx + 8, backY + 28, hx + 8, backY + 12);
      ctx.closePath(); ctx.fill();
    }

    /* ---- tail: long, heavy, bushy ---- */
    ctx.save();
    const tw = Math.sin(gait * 1.3) * 14;
    const tg = ctx.createLinearGradient(bodyCX - 34, backY, bodyCX - 74 + tw, backY - 34);
    tg.addColorStop(0, mid);
    tg.addColorStop(1, dark);
    ctx.strokeStyle = tg;
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      ctx.lineWidth = 15 - i * 4;
      ctx.globalAlpha = 0.6 + i * 0.2;
      ctx.beginPath();
      ctx.moveTo(bodyCX - 32, backY + 6);
      ctx.quadraticCurveTo(bodyCX - 58 + tw * 0.6, backY - 8, bodyCX - 70 + tw, backY - 34);
      ctx.stroke();
    }
    ctx.restore();

    /* ---- torso: elongated, fur-jagged ---- */
    ctx.save();
    furPath(ctx, bodyCX, backY + 6, bodyRX, bodyRY, 13, 0.16, rnd, 0);
    const bg = ctx.createLinearGradient(bodyCX, backY - bodyRY, bodyCX, backY + bodyRY + 12);
    bg.addColorStop(0, light);
    bg.addColorStop(0.45, mid);
    bg.addColorStop(1, '#050309');
    ctx.fillStyle = bg;
    ctx.fill();
    fillWithArt(ctx, img, bodyCX - bodyRX, backY - bodyRY, bodyRX * 2, bodyRY * 2 + 12, 0.32);
    ctx.restore();

    /* ---- front legs ---- */
    for (const sgn of [-1, 1]) {
      const sw = Math.sin(gait + (sgn > 0 ? Math.PI : 0)) * 12 + lunge * sgn * 5;
      const fx = bodyCX + 24 + sgn * 8;
      ctx.fillStyle = Color.shade(pal.body, sgn > 0 ? 0.9 : 0.6);
      ctx.beginPath();
      ctx.moveTo(fx - 6, backY + 8);
      ctx.quadraticCurveTo(fx - 8 + sw, backY + 30, fx - 6 + sw, gy - 2);
      ctx.lineTo(fx + 5 + sw, gy - 2);
      ctx.quadraticCurveTo(fx + 7, backY + 28, fx + 7, backY + 8);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = pal.claw;
      for (let c = -1; c <= 1; c++) {
        ctx.beginPath();
        ctx.moveTo(fx - 4 + sw + c * 4, gy - 2);
        ctx.lineTo(fx - 2 + sw + c * 4, gy + 3);
        ctx.lineTo(fx + sw + c * 4, gy - 2);
        ctx.closePath(); ctx.fill();
      }
    }

    /* ---- neck ruff: heavy shaggy mane ---- */
    const neckX = bodyCX + 34 + lunge * 6;
    const neckY = backY + 6 + lunge * 3;
    ctx.save();
    furPath(ctx, neckX, neckY, 19, 20, 11, 0.34, rnd, 3);
    const ng = ctx.createRadialGradient(neckX - 5, neckY - 8, 2, neckX, neckY, 26);
    ng.addColorStop(0, light);
    ng.addColorStop(1, dark);
    ctx.fillStyle = ng;
    ctx.fill();
    ctx.restore();

    /* ---- head: low, forward, long snout ---- */
    const hx = neckX + 17 + lunge * 9;
    const hy = neckY + 5 - lunge * 2;   // BELOW the shoulder line
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(0.12 - lunge * 0.18);

    // skull
    ctx.beginPath();
    ctx.moveTo(-14, -11);
    ctx.quadraticCurveTo(4, -14, 13, -7);
    ctx.quadraticCurveTo(20, -2, 13, 6);
    ctx.quadraticCurveTo(2, 13, -14, 10);
    ctx.closePath();
    const hg = ctx.createLinearGradient(0, -14, 0, 12);
    hg.addColorStop(0, light);
    hg.addColorStop(1, dark);
    ctx.fillStyle = hg;
    ctx.fill();
    fillWithArt(ctx, img, -16, -14, 34, 26, 0.4);

    // long wedge snout
    const jaw = pose.mouth;
    ctx.fillStyle = mid;
    ctx.beginPath();
    ctx.moveTo(10, -6);
    ctx.lineTo(38, -3);
    ctx.lineTo(38, 2);
    ctx.lineTo(10, 7);
    ctx.closePath(); ctx.fill();
    // lower jaw drops open on the strike
    ctx.fillStyle = dark;
    ctx.save();
    ctx.translate(11, 4);
    ctx.rotate(jaw * 0.5);
    ctx.beginPath();
    ctx.moveTo(-1, -3);
    ctx.lineTo(26, -1);
    ctx.lineTo(26, 4);
    ctx.lineTo(-1, 5);
    ctx.closePath(); ctx.fill();
    // fangs
    ctx.fillStyle = '#e9e2d4';
    for (let i = 0; i < 4; i++) {
      const tx = 4 + i * 6;
      ctx.beginPath();
      ctx.moveTo(tx, -1); ctx.lineTo(tx + 2, -6); ctx.lineTo(tx + 4, -1);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = '#e9e2d4';
    for (let i = 0; i < 4; i++) {
      const tx = 12 + i * 6;
      ctx.beginPath();
      ctx.moveTo(tx, -3); ctx.lineTo(tx + 2, 2 + jaw * 3); ctx.lineTo(tx + 4, -3);
      ctx.closePath(); ctx.fill();
    }
    // nose
    ctx.fillStyle = '#0b0710';
    ctx.beginPath(); ctx.ellipse(37, -0.5, 3.4, 2.8, 0, 0, M.TAU); ctx.fill();

    // ears: SMALL, low, swept BACK along the skull
    ctx.fillStyle = Color.shade(pal.body, 0.7);
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-9, -8 + sgn * 2);
      ctx.lineTo(-24, -17 + sgn * 5);
      ctx.lineTo(-8, -2 + sgn * 2);
      ctx.closePath(); ctx.fill();
    }

    // eyes: narrow glowing slits
    for (const sgn of [-1, 1]) {
      const ex = 2, ey = -3 + sgn * 4;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const eg = ctx.createRadialGradient(ex, ey, 0, ex, ey, 9);
      eg.addColorStop(0, Color.alpha(pal.glow, 0.85));
      eg.addColorStop(1, Color.alpha(pal.glow, 0));
      ctx.fillStyle = eg;
      ctx.beginPath(); ctx.arc(ex, ey, 9, 0, M.TAU); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(ex - 5, ey);
      ctx.lineTo(ex + 1, ey - 2.2 * pose.eyeOpen);
      ctx.lineTo(ex + 5, ey);
      ctx.lineTo(ex + 1, ey + 1.6 * pose.eyeOpen);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    /* ---- rim light along back and neck ---- */
    ctx.save();
    ctx.strokeStyle = Color.alpha(pal.glow, 0.5 + pose.aura * 0.28);
    ctx.lineWidth = 1.8;
    ctx.shadowColor = pal.glow;
    ctx.shadowBlur = 10 * pose.aura;
    furPath(ctx, bodyCX, backY + 6, bodyRX, bodyRY, 13, 0.16, rnd, 0);
    ctx.stroke();
    furPath(ctx, neckX, neckY, 19, 20, 11, 0.34, rnd, 3);
    ctx.stroke();
    ctx.restore();

    wisps(ctx, bodyCX, backY - 8, 30, 5, pal.glow, pose.phase, rnd);
  }

  /** One Nue frame — winged shadow, wings flap across the cycle. */
  function drawNue(ctx, img, pal, rnd, pose, W, H) {
    const cx = W / 2;
    const cy = H * 0.52 - pose.hop * 8;
    const flap = Math.sin(pose.phase * 2) * 0.5 + 0.5;   // 0..1
    const spread = 0.35 + flap * 0.65;

    // Wings, behind.
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(cx, cy - 4);
      ctx.rotate(side * (0.5 - spread * 0.85));
      const wg = ctx.createLinearGradient(0, 0, side * 78, -10);
      wg.addColorStop(0, Color.shade(pal.body, 1.1));
      wg.addColorStop(0.6, pal.body);
      wg.addColorStop(1, '#05030a');
      ctx.fillStyle = wg;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(side * 44, -34, side * 82, -12);
      ctx.quadraticCurveTo(side * 60, -2, side * 66, 16);
      ctx.quadraticCurveTo(side * 40, 6, 0, 16);
      ctx.closePath();
      ctx.fill();
      // Feather ribs.
      ctx.strokeStyle = Color.alpha(pal.glow, 0.35);
      ctx.lineWidth = 1.4;
      for (let i = 1; i <= 4; i++) {
        ctx.beginPath();
        ctx.moveTo(0, 2);
        ctx.lineTo(side * (18 * i), -14 + i * 5);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Body.
    ctx.beginPath();
    ctx.ellipse(cx, cy, 19, 27, 0, 0, M.TAU);
    const bg = ctx.createRadialGradient(cx - 6, cy - 10, 3, cx, cy, 32);
    bg.addColorStop(0, Color.shade(pal.body, 1.6));
    bg.addColorStop(0.55, pal.body);
    bg.addColorStop(1, '#05030a');
    ctx.fillStyle = bg;
    ctx.fill();
    fillWithArt(ctx, img, cx - 24, cy - 32, 48, 64, 0.45);

    // Head + beak.
    const hy = cy - 28;
    ctx.beginPath();
    ctx.ellipse(cx, hy, 13, 11, 0, 0, M.TAU);
    ctx.fillStyle = Color.shade(pal.body, 1.2);
    ctx.fill();
    ctx.fillStyle = pal.claw;
    ctx.beginPath();
    ctx.moveTo(cx - 5, hy + 4);
    ctx.lineTo(cx, hy + 16 + pose.mouth * 5);
    ctx.lineTo(cx + 5, hy + 4);
    ctx.closePath(); ctx.fill();

    eye(ctx, cx - 6, hy - 2, 3.2, pal.glow, pose.eyeOpen);
    eye(ctx, cx + 6, hy - 2, 3.2, pal.glow, pose.eyeOpen);

    // Talons.
    ctx.strokeStyle = pal.claw;
    ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + side * 7, cy + 22);
      ctx.lineTo(cx + side * 10, cy + 34 + pose.reach * 8);
      ctx.stroke();
    }

    // Lightning between the wingtips — Nue's whole thing.
    if (flap > 0.55 || pose.reach > 0.2) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const arcs = 3;
      for (let i = 0; i < arcs; i++) {
        let x = cx - 60, y = cy - 10 + i * 6;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let s = 0; s < 7; s++) {
          x += 17; y += (rnd.vein[(i * 7 + s) % rnd.vein.length]) * 13;
          ctx.lineTo(x, y);
        }
        ctx.strokeStyle = Color.alpha(pal.glow, 0.30);
        ctx.lineWidth = 5; ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.4; ctx.stroke();
      }
      ctx.restore();
    }

    // Rim — upper arc only; a closed ellipse stroke reads as a hitbox.
    ctx.save();
    ctx.strokeStyle = Color.alpha(pal.glow, 0.35);
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.shadowColor = pal.glow; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.ellipse(cx, cy, 19, 27, 0, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    ctx.restore();

    wisps(ctx, cx, cy + 10, 26, 5, pal.glow, pose.phase, rnd);
  }

  /** One Mahoraga frame — heavy humanoid with the spinning wheel. */
  function drawMahoraga(ctx, img, pal, rnd, pose, W, H) {
    const cx = W / 2;
    const gy = H - 16;
    const bodyY = gy - 78 + pose.hop * 5 + pose.crouch * 6;
    const lean = pose.lean * 10;

    // Ground shadow.
    const sg = ctx.createRadialGradient(cx, gy, 0, cx, gy, 46);
    sg.addColorStop(0, 'rgba(0,0,0,0.75)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.ellipse(cx, gy, 46, 13, 0, 0, M.TAU); ctx.fill();

    // Legs.
    for (const side of [-1, 1]) {
      ctx.fillStyle = Color.shade(pal.body, 0.6);
      ctx.beginPath();
      ctx.moveTo(cx + side * 16, bodyY + 34);
      ctx.lineTo(cx + side * 22, gy - 2);
      ctx.lineTo(cx + side * 6, gy - 2);
      ctx.lineTo(cx + side * 7, bodyY + 34);
      ctx.closePath(); ctx.fill();
    }

    // Torso.
    ctx.beginPath();
    ctx.moveTo(cx - 30 + lean, bodyY - 30);
    ctx.quadraticCurveTo(cx + lean, bodyY - 44, cx + 30 + lean, bodyY - 30);
    ctx.lineTo(cx + 22 + lean, bodyY + 36);
    ctx.lineTo(cx - 22 + lean, bodyY + 36);
    ctx.closePath();
    const tg = ctx.createLinearGradient(cx - 30, bodyY, cx + 30, bodyY);
    tg.addColorStop(0, '#0a0608');
    tg.addColorStop(0.45, pal.body);
    tg.addColorStop(1, Color.shade(pal.body, 0.5));
    ctx.fillStyle = tg;
    ctx.fill();
    fillWithArt(ctx, img, cx - 40, bodyY - 48, 80, 92, 0.5);

    // Arms — sword arm swings on the strike.
    for (const side of [-1, 1]) {
      const sw = side > 0 ? pose.reach * 1.1 : pose.reach * 0.3;
      limb(ctx, cx + side * 26 + lean, bodyY - 22,
        side > 0 ? -0.4 - sw : Math.PI + 0.4 + sw,
        40 + sw * 14, 8, Color.shade(pal.body, 0.8), pal.claw, 4);
    }

    // Head.
    const hy = bodyY - 46;
    ctx.beginPath();
    ctx.ellipse(cx + lean, hy, 15, 17, 0, 0, M.TAU);
    ctx.fillStyle = Color.shade(pal.body, 1.1);
    ctx.fill();
    eye(ctx, cx + lean - 6, hy - 2, 3.4, pal.glow, pose.eyeOpen);
    eye(ctx, cx + lean + 6, hy - 2, 3.4, pal.glow, pose.eyeOpen);
    maw(ctx, cx + lean, hy + 8, 18, 11, pose.mouth, pal.glow);

    // The wheel of adaptation, always turning.
    ctx.save();
    ctx.translate(cx + lean, hy - 30);
    ctx.rotate(pose.phase * 1.6);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = Color.alpha(pal.glow, 0.85);
    ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.arc(0, 0, 17, 0, M.TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, M.TAU); ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * M.TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 10, Math.sin(a) * 10);
      ctx.lineTo(Math.cos(a) * 17, Math.sin(a) * 17);
      ctx.stroke();
    }
    ctx.restore();

    wisps(ctx, cx, bodyY - 10, 34, 6, pal.glow, pose.phase, rnd);
  }

  const SHIKI_DRAW = { divineDog: drawDivineDog, nue: drawNue, mahoraga: drawMahoraga };

  /**
   * Bake an animated shikigami strip.
   * Returns { canvas, fw, fh, frames } with the same 12-frame layout as
   * the curse sheets, so entity animation code is shared.
   */
  function bakeShikigami(kind, img, seed) {
    const key = `shiki:${kind}:${seed}:${img ? 'art' : 'bare'}`;
    if (cache.has(key)) return cache.get(key);

    const spec = SHIKI[kind] || SHIKI.divineDog;
    const draw = SHIKI_DRAW[spec.draw || kind] || drawDivineDog;
    // Divine Dogs come as a black and a white pair.
    const pal = spec.pal || { body: '#1b1430', glow: '#6fb7ff', claw: '#0a0714' };
    const rnd = curseRnd(M.hash(key));
    const { canvas, ctx } = makeCanvas(spec.w * SH_POSES, spec.h);

    for (let i = 0; i < SH_POSES; i++) {
      ctx.save();
      ctx.translate(i * spec.w, 0);
      ctx.beginPath(); ctx.rect(0, 0, spec.w, spec.h); ctx.clip();
      draw(ctx, img, pal, rnd, poseFor(i, SH_IDLE, SH_WINDUP, SH_STRIKE), spec.w, spec.h);
      ctx.restore();
    }

    const out = {
      canvas, fw: spec.w, fh: spec.h, frames: SH_POSES, spec, shikigami: true,
      angles: 1, poses: SH_POSES,
      layout: { idle: SH_IDLE, windup: SH_WINDUP, strike: SH_STRIKE },
    };
    cache.set(key, out);
    return out;
  }

  /* ==================================================================
     EFFECT SPRITES — projectiles, impacts, slashes.
     All cached by (type, colour, size).
     ================================================================== */

  /**
   * VOLUMETRIC ENERGY SPHERE.
   *
   * A sphere is the one shape a billboard renders *correctly* from every
   * angle — it presents the same silhouette no matter where you stand. So
   * the only thing standing between a flat disc and a convincing 3D orb is
   * shading, and this bakes all of it:
   *
   *   1. an off-centre light term, giving a lit face and a dark limb
   *   2. a terminator wash on the opposite side for the shadowed hemisphere
   *   3. latitude/longitude energy bands that rotate across frames, so the
   *      surface visibly flows around a volume instead of shimmering flat
   *   4. a fresnel rim, which is what makes energy read as energy
   *   5. a hot core seen "through" the shell
   *
   * `mode` adds the directional cue that tells you what it DOES:
   *   implode  streaks converging inward   (Gojo's Blue — attraction)
   *   explode  streaks blasting outward    (Red — repulsion)
   *   void     light bending into a dark centre (Hollow Purple)
   */
  function energySphere(color, core, mode, frames) {
    const N = frames || 10;
    const key = `sphere2:${color}:${core}:${mode}:${N}`;
    if (cache.has(key)) return cache.get(key);

    const S = 160, R = S * 0.27;
    const c = S / 2;
    const { canvas, ctx } = makeCanvas(S * N, S);
    const rnd = M.rng(M.hash(key));
    const hot = core || '#ffffff';
    const inward = mode === 'implode' || mode === 'void';

    for (let f = 0; f < N; f++) {
      const ph = (f / N) * M.TAU;
      const spin = inward ? -ph : ph;
      ctx.save();
      ctx.translate(f * S, 0);
      ctx.globalCompositeOperation = 'lighter';

      /* --- 1. SPACE DISTORTION. Concentric rings warped toward (or away
         from) the centre. This is the single strongest cue that the orb is
         doing something to the space around it rather than just glowing. */
      for (let i = 0; i < 5; i++) {
        const t = ((inward ? -ph * 0.18 : ph * 0.18) + i / 5 + 10) % 1;
        const rr = R * (1.25 + t * 2.3);
        const a = (inward ? t : 1 - t) * 0.30;
        ctx.strokeStyle = Color.alpha(color, a);
        ctx.lineWidth = 1 + (1 - t) * 2.5;
        ctx.beginPath();
        for (let k = 0; k <= 28; k++) {
          const ang = (k / 28) * M.TAU;
          const warp = 1 + Math.sin(ang * 3 + ph * 2) * 0.06;
          const x = c + Math.cos(ang) * rr * warp;
          const y = c + Math.sin(ang) * rr * warp * 0.98;
          if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
      }

      /* --- 2. SPIRAL ARMS. Curving in for Blue, flung out for Red. */
      for (let i = 0; i < 7; i++) {
        const a0 = spin * 1.4 + (i / 7) * M.TAU;
        ctx.beginPath();
        for (let k = 0; k <= 22; k++) {
          const t = k / 22;
          const rr = R * (1.05 + t * 2.6);
          const ang = a0 + (inward ? t * 1.5 : -t * 1.5);
          const x = c + Math.cos(ang) * rr;
          const y = c + Math.sin(ang) * rr;
          if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        const g = ctx.createLinearGradient(c, c, c + R * 3.6, c);
        g.addColorStop(0, Color.alpha(hot, 0.75));
        g.addColorStop(0.4, Color.alpha(color, 0.45));
        g.addColorStop(1, Color.alpha(color, 0));
        ctx.strokeStyle = g;
        ctx.lineWidth = 2.4;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      /* --- 3. bloom */
      const halo = ctx.createRadialGradient(c, c, R * 0.6, c, c, R * 3.0);
      halo.addColorStop(0, Color.alpha(color, 0.62));
      halo.addColorStop(0.3, Color.alpha(color, 0.26));
      halo.addColorStop(1, Color.alpha(color, 0));
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, S, S);

      /* --- 4. the sphere body */
      ctx.save();
      ctx.beginPath(); ctx.arc(c, c, R, 0, M.TAU); ctx.clip();

      const lx = c - R * 0.32, ly = c - R * 0.32;
      const body = ctx.createRadialGradient(lx, ly, R * 0.04, c, c, R * 1.12);
      if (mode === 'void') {
        body.addColorStop(0, Color.alpha(color, 0.9));
        body.addColorStop(0.4, Color.alpha(Color.shade(color, 0.45), 0.95));
        body.addColorStop(1, 'rgba(0,0,0,0.98)');
      } else if (inward) {
        // Blue: brilliant rim, compressed dark heart where space collapses.
        body.addColorStop(0, '#ffffff');
        body.addColorStop(0.18, Color.alpha(hot, 0.95));
        body.addColorStop(0.42, Color.alpha(color, 0.95));
        body.addColorStop(0.72, Color.alpha(Color.shade(color, 0.35), 0.92));
        body.addColorStop(1, Color.alpha(Color.shade(color, 1.5), 0.95));
      } else {
        // Red: white-hot core forcing everything outward.
        body.addColorStop(0, '#ffffff');
        body.addColorStop(0.22, Color.alpha(hot, 0.95));
        body.addColorStop(0.55, Color.alpha(color, 0.9));
        body.addColorStop(1, Color.alpha(Color.shade(color, 0.5), 0.8));
      }
      ctx.fillStyle = body;
      ctx.fillRect(0, 0, S, S);

      // shadowed hemisphere
      ctx.globalCompositeOperation = 'source-over';
      const term = ctx.createRadialGradient(c + R * 0.5, c + R * 0.5, R * 0.08, c + R * 0.25, c + R * 0.25, R * 1.5);
      term.addColorStop(0, 'rgba(0,0,0,0.5)');
      term.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = term;
      ctx.fillRect(0, 0, S, S);
      ctx.globalCompositeOperation = 'lighter';

      // latitude bands + longitude sweep = rotation on a volume
      for (let b = -2; b <= 2; b++) {
        const lat = (b / 2) * 0.8 + Math.sin(ph) * 0.12;
        const yy = c + Math.sin(lat) * R;
        const rx = Math.cos(lat) * R;
        if (rx < 2) continue;
        ctx.strokeStyle = Color.alpha(b === 0 ? '#ffffff' : hot, 0.34 - Math.abs(b) * 0.06);
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(c, yy, rx, rx * 0.20, 0, 0, M.TAU); ctx.stroke();
      }
      for (let i = 0; i < 5; i++) {
        const a = spin + (i / 5) * Math.PI;
        ctx.strokeStyle = Color.alpha(hot, 0.24);
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.ellipse(c, c, Math.abs(Math.cos(a)) * R * 0.94, R * 0.98, 0, 0, M.TAU);
        ctx.stroke();
      }

      // surface crackle
      for (let i = 0; i < 5; i++) {
        let a = rnd() * M.TAU;
        let x = c + Math.cos(a) * R * 0.85, y = c + Math.sin(a) * R * 0.85;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let k = 0; k < 4; k++) {
          a += (rnd() - 0.5) * 2.2;
          x += Math.cos(a) * R * 0.22; y += Math.sin(a) * R * 0.22;
          ctx.lineTo(x, y);
        }
        ctx.strokeStyle = Color.alpha('#ffffff', 0.5);
        ctx.lineWidth = 1.1;
        ctx.stroke();
      }
      ctx.restore();

      /* --- 5. fresnel rim */
      const rim = ctx.createRadialGradient(c, c, R * 0.78, c, c, R * 1.07);
      rim.addColorStop(0, Color.alpha(color, 0));
      rim.addColorStop(0.7, Color.alpha(color, 0.6));
      rim.addColorStop(0.92, Color.alpha(hot, 0.95));
      rim.addColorStop(1, Color.alpha(hot, 0));
      ctx.fillStyle = rim;
      ctx.beginPath(); ctx.arc(c, c, R * 1.07, 0, M.TAU); ctx.fill();

      /* --- 6. Red throws lances; Blue swallows light. */
      if (!inward) {
        for (let i = 0; i < 12; i++) {
          const a = ph * 0.8 + (i / 12) * M.TAU;
          const len = R * (1.5 + ((i * 37) % 10) / 10 * 1.4);
          const g2 = ctx.createLinearGradient(
            c + Math.cos(a) * R, c + Math.sin(a) * R,
            c + Math.cos(a) * len, c + Math.sin(a) * len);
          g2.addColorStop(0, Color.alpha(hot, 0.85));
          g2.addColorStop(1, Color.alpha(color, 0));
          ctx.strokeStyle = g2;
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.moveTo(c + Math.cos(a) * R, c + Math.sin(a) * R);
          ctx.lineTo(c + Math.cos(a) * len, c + Math.sin(a) * len);
          ctx.stroke();
        }
      }

      ctx.restore();
    }

    const out = { canvas, fw: S, fh: S, frames: N, angles: 1, poses: N, sphere: true };
    cache.set(key, out);
    return out;
  }

  /** Soft energy orb with a hot core and a bloom halo. */
  function orb(color, coreColor) {
    const key = `orb:${color}:${coreColor}`;
    if (cache.has(key)) return cache.get(key);
    const S = 96;
    const { canvas, ctx } = makeCanvas(S, S);
    const c = S / 2;

    const halo = ctx.createRadialGradient(c, c, 0, c, c, c);
    halo.addColorStop(0, Color.alpha(color, 0.95));
    halo.addColorStop(0.28, Color.alpha(color, 0.55));
    halo.addColorStop(0.62, Color.alpha(color, 0.16));
    halo.addColorStop(1, Color.alpha(color, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, S, S);

    const core = ctx.createRadialGradient(c, c, 0, c, c, c * 0.34);
    core.addColorStop(0, '#ffffff');
    core.addColorStop(0.45, coreColor || Color.shade(color, 1.6));
    core.addColorStop(1, Color.alpha(color, 0));
    ctx.fillStyle = core;
    ctx.fillRect(0, 0, S, S);

    cache.set(key, { canvas, fw: S, fh: S, frames: 1 });
    return cache.get(key);
  }

  /* ==================================================================
     PROJECTILE SHAPES

     Every ranged attack used to be the same soft orb with a different
     tint, so a hairpin, a chain and a meteor were indistinguishable. Each
     technique now gets its own silhouette.

     Shapes are drawn point-first with a trailing tail, because a billboard
     cannot rotate to match a 3D velocity — but a projectile is nearly
     always seen going away from you or coming at you, and a head-plus-trail
     reads correctly from both.
     ================================================================== */
  const PROJ_FRAMES = 4;

  const PROJ_SHAPES = {
    /* Sukuna — a crescent cutting edge. */
    shard(ctx, C, R, col, hot, f, rnd) {
      ctx.save();
      ctx.translate(C, C);
      ctx.rotate(f * 0.6);
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = Color.alpha(i === 2 ? hot : col, 0.5 + i * 0.22);
        ctx.lineWidth = R * (0.42 - i * 0.11);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(0, 0, R * (0.72 - i * 0.06), -1.15, 1.15);
        ctx.stroke();
      }
      ctx.restore();
      void rnd;
    },

    /* Choso / Yuji — a blood dart with a spatter tail. */
    blood(ctx, C, R, col, hot, f, rnd) {
      ctx.save();
      ctx.translate(C, C);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.55);
      g.addColorStop(0, hot);
      g.addColorStop(0.5, col);
      g.addColorStop(1, Color.alpha(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -R * 0.75);
      ctx.quadraticCurveTo(R * 0.5, 0, 0, R * 0.85);
      ctx.quadraticCurveTo(-R * 0.5, 0, 0, -R * 0.75);
      ctx.fill();
      for (let i = 0; i < 5; i++) {
        const a = rnd() * M.TAU, d = R * (0.6 + rnd() * 0.7);
        ctx.fillStyle = Color.alpha(col, 0.5);
        ctx.beginPath();
        ctx.arc(Math.cos(a) * d, Math.sin(a) * d + f * 2, R * 0.09, 0, M.TAU);
        ctx.fill();
      }
      ctx.restore();
    },

    /* Nobara — a nail: bright head, thin bright streak. */
    nail(ctx, C, R, col, hot, f, rnd) {
      ctx.save();
      ctx.translate(C, C);
      ctx.strokeStyle = Color.alpha(col, 0.75);
      ctx.lineWidth = R * 0.12;
      ctx.beginPath(); ctx.moveTo(0, R * 0.9); ctx.lineTo(0, -R * 0.2); ctx.stroke();
      ctx.fillStyle = hot;
      ctx.beginPath();
      ctx.moveTo(0, -R * 0.85);
      ctx.lineTo(R * 0.16, -R * 0.2);
      ctx.lineTo(-R * 0.16, -R * 0.2);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = Color.alpha('#ffffff', 0.9);
      ctx.beginPath(); ctx.arc(0, -R * 0.55, R * 0.1, 0, M.TAU); ctx.fill();
      ctx.restore();
      void f; void rnd;
    },

    /* Kashimo — raw arc, re-cracking every frame. */
    bolt(ctx, C, R, col, hot, f, rnd) {
      ctx.save();
      ctx.translate(C, C);
      ctx.globalCompositeOperation = 'lighter';
      for (let b = 0; b < 4; b++) {
        let x = 0, y = 0, a = (b / 4) * M.TAU + f;
        ctx.beginPath(); ctx.moveTo(0, 0);
        for (let k = 0; k < 5; k++) {
          a += (rnd() - 0.5) * 1.9;
          const l = R * (0.16 + rnd() * 0.26);
          x += Math.cos(a) * l; y += Math.sin(a) * l;
          ctx.lineTo(x, y);
        }
        ctx.strokeStyle = Color.alpha(col, 0.45);
        ctx.lineWidth = R * 0.22; ctx.lineCap = 'round'; ctx.stroke();
        ctx.strokeStyle = hot;
        ctx.lineWidth = R * 0.07; ctx.stroke();
      }
      ctx.restore();
    },

    /* Jogo — an ember with a wing-flicker and a smoke tail. */
    ember(ctx, C, R, col, hot, f, rnd) {
      ctx.save();
      ctx.translate(C, C);
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(0, -R * 0.1, 0, 0, 0, R * 0.6);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.35, hot);
      g.addColorStop(1, Color.alpha(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, -R * 0.1, R * 0.6, 0, M.TAU); ctx.fill();
      // insect wings
      ctx.fillStyle = Color.alpha(hot, 0.5);
      const flap = 0.4 + Math.abs(Math.sin(f * 1.7)) * 0.6;
      for (const sgn of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(sgn * R * 0.34, -R * 0.2, R * 0.30, R * 0.13 * flap, sgn * 0.5, 0, M.TAU);
        ctx.fill();
      }
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = Color.alpha(col, 0.35 - i * 0.07);
        ctx.beginPath();
        ctx.arc(rnd() * R * 0.2 - R * 0.1, R * (0.3 + i * 0.16), R * (0.16 - i * 0.03), 0, M.TAU);
        ctx.fill();
      }
      ctx.restore();
    },

    /* Jogo's Meteor — a burning rock, not a light. */
    meteor(ctx, C, R, col, hot, f, rnd) {
      ctx.save();
      ctx.translate(C, C);
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(0, 0, R * 0.3, 0, 0, R);
      g.addColorStop(0, Color.alpha(hot, 0.8));
      g.addColorStop(1, Color.alpha(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, M.TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath();
      for (let i = 0; i <= 9; i++) {
        const a = (i / 9) * M.TAU;
        const rr = R * (0.42 + rnd() * 0.16);
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = '#2a1410';
      ctx.fill();
      ctx.fillStyle = Color.alpha(hot, 0.85);
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc((rnd() - 0.5) * R * 0.6, (rnd() - 0.5) * R * 0.6, R * 0.06, 0, M.TAU);
        ctx.fill();
      }
      ctx.restore();
      void f;
    },

    /* Ryu — a raw cursed-energy slug with a shock collar. */
    blast(ctx, C, R, col, hot, f, rnd) {
      ctx.save();
      ctx.translate(C, C);
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.8);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.28, hot);
      g.addColorStop(0.62, col);
      g.addColorStop(1, Color.alpha(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(0, 0, R * 0.62, R * 0.8, 0, 0, M.TAU); ctx.fill();
      ctx.strokeStyle = Color.alpha(hot, 0.7);
      ctx.lineWidth = R * 0.07;
      for (let i = 0; i < 2; i++) {
        const rr = R * (0.75 + i * 0.16) + Math.sin(f * 2 + i) * R * 0.06;
        ctx.beginPath(); ctx.ellipse(0, R * 0.25 * i, rr, rr * 0.30, 0, 0, M.TAU); ctx.stroke();
      }
      ctx.restore();
      void rnd;
    },

    /* Hanami — a knot of living wood. */
    wood(ctx, C, R, col, hot, f, rnd) {
      ctx.save();
      ctx.translate(C, C);
      ctx.beginPath();
      for (let i = 0; i <= 11; i++) {
        const a = (i / 11) * M.TAU;
        const rr = R * (0.5 + rnd() * 0.13);
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      const g = ctx.createRadialGradient(-R * 0.2, -R * 0.2, R * 0.05, 0, 0, R * 0.7);
      g.addColorStop(0, Color.shade(col, 1.5));
      g.addColorStop(1, Color.shade(col, 0.4));
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = Color.alpha(hot, 0.55);
      ctx.lineWidth = R * 0.05;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(0, 0, R * (0.2 + i * 0.13), R * (0.34 + i * 0.11), f * 0.4 + i, 0, M.TAU);
        ctx.stroke();
      }
      ctx.restore();
    },

    /* Toji — a chain link with a blade head. */
    chain(ctx, C, R, col, hot, f, rnd) {
      ctx.save();
      ctx.translate(C, C);
      ctx.strokeStyle = col;
      ctx.lineWidth = R * 0.10;
      for (let i = 0; i < 3; i++) {
        const yy = R * (0.25 + i * 0.28);
        ctx.beginPath();
        ctx.ellipse(Math.sin(f + i) * R * 0.08, yy, R * 0.14, R * 0.10, 0, 0, M.TAU);
        ctx.stroke();
      }
      ctx.fillStyle = hot;
      ctx.beginPath();
      ctx.moveTo(0, -R * 0.8);
      ctx.lineTo(R * 0.22, R * 0.05);
      ctx.lineTo(-R * 0.22, R * 0.05);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = Color.alpha('#ffffff', 0.85);
      ctx.beginPath();
      ctx.moveTo(0, -R * 0.72); ctx.lineTo(R * 0.07, -R * 0.1); ctx.lineTo(-R * 0.07, -R * 0.1);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      void rnd;
    },

    /* Geto — a small writhing curse, eye and all. */
    curse(ctx, C, R, col, hot, f, rnd) {
      ctx.save();
      ctx.translate(C, C);
      ctx.beginPath();
      for (let i = 0; i <= 13; i++) {
        const a = (i / 13) * M.TAU;
        const rr = R * (0.45 + Math.sin(a * 3 + f) * 0.09 + rnd() * 0.07);
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      const g = ctx.createRadialGradient(0, -R * 0.1, R * 0.05, 0, 0, R * 0.6);
      g.addColorStop(0, Color.shade(col, 1.6));
      g.addColorStop(1, Color.shade(col, 0.3));
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = Color.alpha(hot, 0.8);
      ctx.lineWidth = R * 0.05; ctx.stroke();
      ctx.fillStyle = hot;
      ctx.beginPath(); ctx.ellipse(0, -R * 0.05, R * 0.14, R * 0.09, 0, 0, M.TAU); ctx.fill();
      ctx.fillStyle = '#0a0510';
      ctx.beginPath(); ctx.ellipse(0, -R * 0.05, R * 0.045, R * 0.08, 0, 0, M.TAU); ctx.fill();
      ctx.restore();
    },

    /* Hakari — a polished pachinko ball. */
    ball(ctx, C, R, col, hot, f, rnd) {
      ctx.save();
      ctx.translate(C, C);
      const g = ctx.createRadialGradient(-R * 0.2, -R * 0.24, R * 0.03, 0, 0, R * 0.58);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.3, hot);
      g.addColorStop(0.75, col);
      g.addColorStop(1, Color.shade(col, 0.32));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, R * 0.55, 0, M.TAU); ctx.fill();
      ctx.strokeStyle = Color.alpha('#ffffff', 0.5);
      ctx.lineWidth = R * 0.05;
      ctx.beginPath(); ctx.arc(0, 0, R * 0.55, 2.2 + f, 3.6 + f); ctx.stroke();
      ctx.restore();
      void rnd;
    },

    /* Higuruma — a court seal / writ. */
    seal(ctx, C, R, col, hot, f, rnd) {
      ctx.save();
      ctx.translate(C, C);
      ctx.rotate(Math.sin(f) * 0.22);
      ctx.fillStyle = Color.alpha('#e8e4d6', 0.92);
      ctx.fillRect(-R * 0.26, -R * 0.6, R * 0.52, R * 1.2);
      ctx.fillStyle = Color.alpha(col, 0.85);
      ctx.fillRect(-R * 0.26, -R * 0.6, R * 0.52, R * 0.12);
      ctx.strokeStyle = Color.alpha('#3a3a46', 0.7);
      ctx.lineWidth = R * 0.035;
      for (let i = 0; i < 4; i++) {
        const yy = -R * 0.3 + i * R * 0.22;
        ctx.beginPath(); ctx.moveTo(-R * 0.15, yy); ctx.lineTo(R * 0.15, yy); ctx.stroke();
      }
      ctx.fillStyle = Color.alpha(hot, 0.8);
      ctx.beginPath(); ctx.arc(0, R * 0.36, R * 0.13, 0, M.TAU); ctx.fill();
      ctx.restore();
      void rnd;
    },

    /* Megumi — Nue, seen as a diving silhouette wrapped in lightning. */
    nueBolt(ctx, C, R, col, hot, f, rnd) {
      ctx.save();
      ctx.translate(C, C);
      const flap = 0.35 + Math.abs(Math.sin(f * 1.6)) * 0.65;
      ctx.fillStyle = Color.alpha(Color.shade(col, 0.35), 0.95);
      for (const sgn of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, -R * 0.1);
        ctx.quadraticCurveTo(sgn * R * 0.5, -R * 0.55 * flap, sgn * R * 0.85, -R * 0.05 * flap);
        ctx.quadraticCurveTo(sgn * R * 0.45, R * 0.2, 0, R * 0.25);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = Color.shade(col, 0.5);
      ctx.beginPath(); ctx.ellipse(0, 0, R * 0.16, R * 0.36, 0, 0, M.TAU); ctx.fill();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let b = 0; b < 3; b++) {
        let x = -R * 0.8, y = (b - 1) * R * 0.2;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let k = 0; k < 5; k++) {
          x += R * 0.32; y += (rnd() - 0.5) * R * 0.28;
          ctx.lineTo(x, y);
        }
        ctx.strokeStyle = Color.alpha(hot, 0.75);
        ctx.lineWidth = R * 0.05; ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = hot;
      for (const sgn of [-1, 1]) {
        ctx.beginPath(); ctx.arc(sgn * R * 0.07, -R * 0.22, R * 0.05, 0, M.TAU); ctx.fill();
      }
      ctx.restore();
    },
  };

  /** Baked projectile sprite for a named shape. Falls back to `orb`. */
  function projectileSprite(shape, color, core) {
    const key = `proj:${shape}:${color}:${core}`;
    if (cache.has(key)) return cache.get(key);
    const fn = PROJ_SHAPES[shape];
    if (!fn) return orb(color, core);

    const S = 96, R = S * 0.42, C = S / 2;
    const { canvas, ctx } = makeCanvas(S * PROJ_FRAMES, S);
    const hot = core || '#ffffff';
    for (let f = 0; f < PROJ_FRAMES; f++) {
      const rnd = M.rng(M.hash(key + ':' + f));
      ctx.save();
      ctx.translate(f * S, 0);
      ctx.beginPath(); ctx.rect(0, 0, S, S); ctx.clip();
      // Shared soft aura so every shape still glows in a dark arena.
      const g = ctx.createRadialGradient(C, C, 0, C, C, R * 1.5);
      g.addColorStop(0, Color.alpha(color, 0.45));
      g.addColorStop(0.5, Color.alpha(color, 0.16));
      g.addColorStop(1, Color.alpha(color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, S, S);
      fn(ctx, C, R, color, hot, (f / PROJ_FRAMES) * M.TAU, rnd);
      ctx.restore();
    }
    const out = { canvas, fw: S, fh: S, frames: PROJ_FRAMES, angles: 1, poses: PROJ_FRAMES };
    cache.set(key, out);
    return out;
  }

  /** Crackling bolt — used for Kashimo, Black Flash sparks. */
  function bolt(color) {
    const key = `bolt:${color}`;
    if (cache.has(key)) return cache.get(key);
    const S = 96;
    const { canvas, ctx } = makeCanvas(S, S);
    const rnd = M.rng(M.hash(key));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let b = 0; b < 5; b++) {
      let x = S / 2, y = S / 2;
      let a = rnd() * M.TAU;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let s = 0; s < 6; s++) {
        a += (rnd() - 0.5) * 1.8;
        const l = 5 + rnd() * 11;
        x += Math.cos(a) * l; y += Math.sin(a) * l;
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = Color.alpha(color, 0.30);
      ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.6; ctx.stroke();
    }
    ctx.restore();
    cache.set(key, { canvas, fw: S, fh: S, frames: 1 });
    return cache.get(key);
  }

  /** Crescent slash used by melee abilities. */
  function slash(color) {
    const key = `slash:${color}`;
    if (cache.has(key)) return cache.get(key);
    const W = 192, H = 128;
    const { canvas, ctx } = makeCanvas(W, H);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const t = i / 2;
      ctx.beginPath();
      ctx.ellipse(W / 2, H * 1.15, W * (0.44 - t * 0.05), H * (0.92 - t * 0.08),
        0, Math.PI * 1.15, Math.PI * 1.85);
      ctx.strokeStyle = Color.alpha(i === 2 ? '#ffffff' : color, 0.42 + t * 0.5);
      ctx.lineWidth = 14 - i * 5;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    ctx.restore();
    cache.set(key, { canvas, fw: W, fh: H, frames: 1 });
    return cache.get(key);
  }

  /** Expanding shockwave ring (drawn as a flat torus, billboarded). */
  function ring(color) {
    const key = `ring:${color}`;
    if (cache.has(key)) return cache.get(key);
    const S = 160;
    const { canvas, ctx } = makeCanvas(S, S);
    const c = S / 2;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(c, c, c * (0.62 + i * 0.11), 0, M.TAU);
      ctx.strokeStyle = Color.alpha(i === 0 ? '#ffffff' : color, 0.6 - i * 0.18);
      ctx.lineWidth = 10 - i * 3;
      ctx.stroke();
    }
    ctx.restore();
    cache.set(key, { canvas, fw: S, fh: S, frames: 1 });
    return cache.get(key);
  }

  JJK.SpriteBake = {
    bakeCurse, bakeAvatar, bakeShikigami, orb, bolt, slash, ring, energySphere,
    projectileSprite, PROJ_SHAPES,
    poseIndex, poseFor,
    CURSE_TIERS, FRAMES, ANGLES, POSES, IDLE, WINDUP, STRIKE, FW, FH,
  };
})(window.JJK);
