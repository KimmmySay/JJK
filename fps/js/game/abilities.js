/* ==========================================================================
   ABILITIES — one dispatcher for all 92 abilities across 23 characters.

   Each archetype is implemented once and driven by the data in
   data/characters.js. That is why adding a character is a data edit rather
   than another 60-line switch statement.

   Aiming: everything fires along the camera's forward vector, and anything
   placed in the world (bursts, blinks, vortices) is wall-clamped by a
   raycast first, so you can never drop an explosion on the far side of a
   wall by aiming through it.
   ========================================================================== */

(function (JJK) {
  'use strict';

  const { M, Combat, Particles, Projectiles, Audio, PostFX, CHARACTERS, DOMAINS } = JJK;

  /**
   * EYE is the camera height in world units (see raycaster.js: the eye sits
   * at 0.5 + player.z). Everything the player fires has to originate at the
   * HANDS, not at the camera, or the effect is born above your head and the
   * viewmodel looks disconnected from its own attack.
   */
  const EYE = 0.5;
  const MUZZLE_FWD = 0.38;    // out in front of the chest
  const MUZZLE_RIGHT = 0.20;  // toward the right hand
  const MUZZLE_DROP = 0.14;   // below the eye line
  const CONVERGE = 22;        // where the muzzle ray meets the crosshair ray

  /** World position of the firing hand. */
  function muzzle(p) {
    const fx = Math.cos(p.angle), fy = Math.sin(p.angle);
    const rx = -fy, ry = fx;
    return {
      x: p.x + fx * MUZZLE_FWD + rx * MUZZLE_RIGHT,
      y: p.y + fy * MUZZLE_FWD + ry * MUZZLE_RIGHT,
      z: EYE + p.z - MUZZLE_DROP,
    };
  }

  /**
   * Direction from the hand to the point the crosshair is looking at.
   * Standard FPS convergence: hit detection runs from the camera (so shots
   * land exactly on the crosshair) while the VISUAL leaves the hand, which
   * is what makes an attack feel like it came out of you.
   */
  function aimFromMuzzle(p, m, converge) {
    const fx = Math.cos(p.angle), fy = Math.sin(p.angle);
    const d = converge || CONVERGE;
    const tx = p.x + fx * d, ty = p.y + fy * d, tz = EYE + p.z;
    const dx = tx - m.x, dy = ty - m.y, dz = tz - m.z;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len, z: dz / len };
  }

  /**
   * Clamp a forward distance so it stops short of the first wall.
   * The floor is 0, NOT some minimum standoff: a minimum would happily
   * place the result *past* a wall you are standing right next to, which
   * is how a blink used to drop you inside geometry.
   */
  function clampToWall(G, x, y, dx, dy, want, pad) {
    const hit = G.map.raycast(x, y, dx, dy, want);
    if (!hit.hit) return want;
    return Math.max(0, hit.dist - (pad ?? 0.45));
  }

  /**
   * Teleport that refuses to land in geometry. Walks back along the path
   * until it finds space the player actually fits in; stays put if there
   * is none. Every warp in the game goes through this.
   */
  function safeWarp(G, p, tx, ty) {
    const r = p.radius + 0.02;
    if (G.map.openRadius(tx, ty, r)) { p.x = tx; p.y = ty; return true; }
    const ox = p.x, oy = p.y;
    for (let t = 0.85; t > 0.05; t -= 0.1) {
      const nx = ox + (tx - ox) * t, ny = oy + (ty - oy) * t;
      if (G.map.openRadius(nx, ny, r)) { p.x = nx; p.y = ny; return true; }
    }
    return false;
  }

  /** Perpendicular distance from a point to a ray, plus the along-ray coord. */
  function rayPointDist(ox, oy, dx, dy, px, py) {
    const t = (px - ox) * dx + (py - oy) * dy;
    if (t < 0) return { perp: Infinity, along: t };
    const cx = ox + dx * t, cy = oy + dy * t;
    return { perp: Math.hypot(px - cx, py - cy), along: t };
  }

  /* ==================================================================
     Archetypes
     ================================================================== */

  function doMelee(G, p, a, dx, dy) {
    const arc = a.arc || 1.2;
    const range = (a.range || 3) * p.flag('areaMult', 1);
    const hits = a.hits || 1;

    const swing = (n) => {
      let landed = 0;
      for (const e of G.targets()) {
        const ex = e.x - p.x, ey = e.y - p.y;
        const d = Math.hypot(ex, ey);
        if (d > range + e.radius) continue;
        const dot = (ex * dx + ey * dy) / (d || 1);
        if (dot < Math.cos(arc / 2)) continue;
        if (!G.map.lineOfSight(p.x, p.y, e.x, e.y)) continue;
        Combat.playerHit(p, e, a.dmg, {
          sourceId: a.owner + ':' + a.slot,
          knock: a.knock || 5, dirX: ex / (d || 1), dirY: ey / (d || 1),
          color: a.color, trueDamage: a.trueDamage, ratio: a.ratio,
          vsMarked: a.vsMarked, lifesteal: a.lifesteal,
        });
        landed++;
      }
      // Visual sweep regardless of whether it connected — at hand height.
      const mm = muzzle(p);
      const cx = p.x + dx * range * 0.55, cy = p.y + dy * range * 0.55;
      // A blade leaves a crescent in the air; a fist leaves a shock ring.
      Projectiles.spawnFx({
        x: cx, y: cy, z: mm.z + 0.12,
        size: (a.fx === 'slash' ? range * 0.85 : range * 0.45) * (1 + (a.arc || 1.2) * 0.18),
        sheet: a.fx === 'slash'
          ? JJK.SpriteBake.slash(a.color)
          : JJK.SpriteBake.ring(a.color),
        maxLife: a.fx === 'slash' ? 0.22 : 0.18,
        grow: a.fx === 'slash' ? 1.35 : 1.9,
        alpha: 0.95,
      });
      Particles.burst(cx, cy, mm.z, {
        count: a.fx === 'slash' ? 14 : 9,
        color: a.color, core: '#ffffff',
        speed: 5, size: 0.2, life: 0.3,
        dirX: dx, dirY: dy,
      });
      G.flashLights.push({ x: cx, y: cy, color: a.color, r: 3.2, intensity: 0.7, life: 0.16, t: 0 });
      if (n === 0 && !landed) Audio.SFX.cast('melee', a.color);
    };

    swing(0);
    for (let i = 1; i < hits; i++) G.schedule((a.hitDelay || 0.12) * i, () => swing(i));
    // Yuji's Divergent Fist: the delayed second impact.
    if (a.echo) {
      G.schedule(a.echo.delay, () => {
        for (const e of G.targets()) {
          const ex = e.x - p.x, ey = e.y - p.y;
          const d = Math.hypot(ex, ey);
          if (d > range + e.radius + 0.5) continue;
          const dot = (ex * dx + ey * dy) / (d || 1);
          if (dot < Math.cos(arc / 2)) continue;
          Combat.playerHit(p, e, a.dmg * a.echo.mult, {
            sourceId: a.owner + ':' + a.slot + ':echo', knock: (a.knock || 5) * 1.4,
            dirX: ex / (d || 1), dirY: ey / (d || 1), color: a.color,
          });
        }
        PostFX.impact({ shake: 0.35, flash: 0.12, color: a.color });
      });
    }
    p.startSwing(a.fx || 'punch');
  }

  function doProjectile(G, p, a, dx, dy, angle) {
    const m = muzzle(p);
    const aim = aimFromMuzzle(p, m);
    Projectiles.spawnProjectile({
      x: m.x, y: m.y, z: m.z,
      vx: aim.x * a.speed * p.flag('projSpeed', 1), vy: aim.y * a.speed * p.flag('projSpeed', 1), vz: aim.z * a.speed * p.flag('projSpeed', 1),
      dmg: a.dmg * (p.mods.damage || 1),
      radius: a.radius || 0.5,
      size: (a.radius || 0.5) * 1.5,
      color: a.color, core: a.core || '#ffffff',
      explode: a.explode, homing: a.homing || 0, bounce: a.bounce || 0,
      pierce: (a.pierce || 0) + p.flag('pierce', 0),
      burn: a.burn, stun: a.stun, mark: a.mark,
      nail: a.nail, pull: a.pull, lightning: a.lightning, chain: a.chain,
      trueDamage: a.trueDamage, knock: a.knock, shape: a.shape,
      sourceId: a.owner + ':' + a.slot,
      maxLife: 3.5,
    });
    p.startSwing('cast');
    void angle;
  }

  function doVolley(G, p, a, dx, dy) {
    const base = Math.atan2(dy, dx);
    const n = (a.count || 3) + p.flag('volleyExtra', 0);
    const m = muzzle(p);
    const aim = aimFromMuzzle(p, m);
    const aimBase = Math.atan2(aim.y, aim.x);
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : ((i / (n - 1)) - 0.5) * (a.spread || 0.3) * 2;
      const ang = aimBase + off + M.spread((a.spread || 0.3) * 0.15);
      const ndx = Math.cos(ang), ndy = Math.sin(ang);
      Projectiles.spawnProjectile({
        x: m.x, y: m.y, z: m.z + M.spread(0.06),
        vx: ndx * a.speed, vy: ndy * a.speed, vz: aim.z * a.speed,
        dmg: a.dmg * (p.mods.damage || 1), radius: a.radius || 0.45,
        size: (a.radius || 0.45) * 1.5,
        color: a.color, core: a.core || '#ffffff',
        homing: a.homing || 0, burn: a.burn, nail: a.nail, shape: a.shape,
        sourceId: a.owner + ':' + a.slot, maxLife: 3.0,
      });
    }
    p.startSwing('cast');
  }

  function doBeam(G, p, a, dx, dy) {
    const maxLen = clampToWall(G, p.x, p.y, dx, dy, a.range, 0.1);
    const halfW = (a.width || 1) / 2;

    // Hit test runs from the camera; the beam is DRAWN from the hand.
    const m = muzzle(p);
    const beamLen = Math.max(1, maxLen - MUZZLE_FWD);
    Projectiles.spawnBeam({
      x: m.x, y: m.y, z: m.z, dirX: dx, dirY: dy,
      length: beamLen, width: a.width || 1,
      color: a.color, core: a.core || '#ffffff',
      maxLife: 0.45,
      voidOrb: !!a.voidOrb,
    });

    for (const e of G.targets()) {
      const r = rayPointDist(p.x, p.y, dx, dy, e.x, e.y);
      if (r.along < 0 || r.along > maxLen) continue;
      if (r.perp > halfW + e.radius) continue;
      Combat.playerHit(p, e, a.dmg, {
        sourceId: a.owner + ':' + a.slot,
        knock: 8, dirX: dx, dirY: dy, color: a.color,
        trueDamage: a.trueDamage, lifesteal: a.lifesteal,
      });
      if (a.burn) Projectiles.applyBurn(e, a.burn);
    }

    // Impact bloom at the far end.
    Particles.burst(p.x + dx * maxLen, p.y + dy * maxLen, EYE + p.z, {
      count: 20, color: a.color, core: '#ffffff', speed: 7, size: 0.3, life: 0.6,
    });
    PostFX.impact({
      shake: a.shake || 0.8, ca: 0.5, lines: 0.7,
      linesColor: a.color, flash: 0.2, color: a.color,
    });
    Audio.SFX.cast('beam', a.color);
    p.startSwing('beam');
  }

  function doBurst(G, p, a, dx, dy) {
    // Travelling bursts (Red) are fired as an orb that detonates on impact.
    if (a.travels && !a.cone && !a.global) {
      const m = muzzle(p);
      const aim = aimFromMuzzle(p, m);
      const sp = a.travels.speed || 18;
      const shot = Projectiles.spawnProjectile({
        x: m.x, y: m.y, z: m.z,
        vx: aim.x * sp, vy: aim.y * sp, vz: aim.z * sp,
        dmg: 0, radius: a.travels.hitRadius || 0.5,
        size: a.travels.size || 1.3,
        color: a.color, core: a.core || '#ffffff',
        sphereMode: 'explode', trail: false,
        sourceId: a.owner + ':' + a.slot,
        // Repulsion shoves things aside the whole way in.
        aura: { radius: a.radius * 0.8, force: -(a.force || 12) * 0.5 },
        slotOwner: a.slot,
        maxLife: (a.travels.range || 16) / sp,
        onEnd: (gg, lx, ly, lz) => {
          Projectiles.explode(gg, lx, ly, lz, a.radius, a.dmg * (p.mods.damage || 1), {
            color: a.color, force: a.force, sourceId: a.owner + ':' + a.slot,
            burn: a.burn, stun: a.stun, lifesteal: a.lifesteal,
          });
          Projectiles.spawnField({
            x: lx, y: ly, radius: a.radius * 0.72, force: 0, dps: 0,
            maxLife: 0.42, color: a.color, core: a.core || '#ffffff',
            volumetric: true, sphereMode: 'explode', zHeight: 1.0, emit: 40,
          });
          PostFX.impact({ shake: a.shake || 0.5, flash: 0.16, color: a.color });
        },
      });
      if (a.selfDamage) p.takeDamage(a.selfDamage, { self: true });
      Audio.SFX.cast('burst', a.color);
      p.startSwing('cast');
      return;
    }

    let cx = p.x, cy = p.y;
    if (a.range > 0) {
      const d = clampToWall(G, p.x, p.y, dx, dy, a.range, 0.6);
      cx = p.x + dx * d; cy = p.y + dy * d;
    }
    // Cone-limited bursts (Inumaki) only hit what is in front of you.
    if (a.cone) {
      for (const e of G.targets()) {
        const ex = e.x - p.x, ey = e.y - p.y;
        const d = Math.hypot(ex, ey);
        if (d > a.radius + a.range) continue;
        const dot = (ex * dx + ey * dy) / (d || 1);
        if (dot < Math.cos(a.cone)) continue;
        Combat.playerHit(p, e, a.dmg, {
          sourceId: a.owner + ':' + a.slot, knock: a.force || 6,
          dirX: ex / (d || 1), dirY: ey / (d || 1), color: a.color,
          lifesteal: a.lifesteal,
        });
        if (a.stun) e.stun = Math.max(e.stun || 0, a.stun);
        if (a.fear) e.fear = Math.max(e.fear || 0, a.fear);
      }
      Particles.burst(p.x + dx * 2, p.y + dy * 2, muzzle(p).z, {
        count: 22, color: a.color, core: '#ffffff', speed: 8, size: 0.26,
        life: 0.5, dirX: dx, dirY: dy,
      });
    } else {
      Projectiles.explode(G, cx, cy, a.global ? 1.0 : 0.6, a.radius * p.flag('areaMult', 1), a.dmg * (p.mods.damage || 1), {
        color: a.color, force: a.force, sourceId: a.owner + ':' + a.slot,
        burn: a.burn, stun: a.stun, lifesteal: a.lifesteal,
      });
      // A short-lived sphere so the blast has visible volume at its origin
      // rather than being a puff of flat particles.
      Projectiles.spawnField({
        x: cx, y: cy, radius: a.radius * 0.72, force: 0, dps: 0,
        maxLife: 0.42, color: a.color, core: a.core || '#ffffff',
        volumetric: true, sphereMode: 'explode', zHeight: 1.0, emit: 40,
      });
    }

    if (a.manaDrain) p.addMana(a.manaDrain);
    if (a.selfDamage && !p.flag('noSelfDamage', 0)) p.takeDamage(a.selfDamage, { self: true });
    PostFX.impact({ shake: a.shake || 0.5, flash: 0.14, color: a.color });
    Audio.SFX.cast('burst', a.color);
    p.startSwing('cast');
  }

  /**
   * Attraction / repulsion fields.
   *
   * With `travels`, the technique is a PROJECTILE you fire and watch cross
   * the room, detonating into its field wherever it lands. That is the
   * difference between an ability that feels aimed and one that just
   * happens at a scripted distance in front of you.
   */
  function doVortex(G, p, a, dx, dy) {
    const implodes = (a.force || 0) >= 0;
    const mode = implodes ? 'implode' : 'explode';

    const land = (gg, lx, ly) => {
      Projectiles.spawnField({
        x: lx, y: ly,
        radius: a.radius, force: a.force, dps: a.dps * (p.mods.damage || 1),
        maxLife: a.life, color: a.color, core: a.core || '#dff4ff',
        sourceId: a.owner + ':' + a.slot, lifesteal: a.lifesteal,
        volumetric: true, sphereMode: mode, zHeight: 1.0,
        emit: implodes ? 46 : 30,
      });
      gg.flashLights.push({ x: lx, y: ly, color: a.color, r: a.radius * 2.4, intensity: 1.3, life: 0.32, t: 0 });
      PostFX.impact({ shake: 0.45, flash: 0.16, color: a.color });
    };

    if (a.travels) {
      const m = muzzle(p);
      const aim = aimFromMuzzle(p, m);
      const sp = a.travels.speed || 15;
      const shot = Projectiles.spawnProjectile({
        x: m.x, y: m.y, z: m.z,
        vx: aim.x * sp, vy: aim.y * sp, vz: aim.z * sp,
        dmg: 0, radius: a.travels.hitRadius || 0.5,
        size: a.travels.size || 1.4,
        color: a.color, core: a.core || '#dff4ff',
        sphereMode: mode, trail: false,
        sourceId: a.owner + ':' + a.slot,
        maxLife: (a.travels.range || 18) / sp,
        // Attraction drags things along the whole flight path.
        aura: {
          radius: a.radius * 0.85,
          force: (a.force || 0) * 0.55,
          dps: (a.dps || 0) * 0.35,
        },
        slotOwner: a.slot,
        onEnd: land,
      });
      p.liveShots = p.liveShots || {};
      p.liveShots[a.slot] = shot;
    } else {
      const d = a.range > 0 ? clampToWall(G, p.x, p.y, dx, dy, a.range, 0.6) : 0;
      land(G, p.x + dx * d, p.y + dy * d);
    }
    Audio.SFX.cast('burst', a.color);
    p.startSwing('cast');
  }

  function doSummon(G, p, a) {
    const n = (a.count || 1) + p.flag('summonExtra', 0);
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * M.TAU + M.rand(0, 1);
      const want = G.map.findOpenNear(p.x + Math.cos(ang) * 1.6, p.y + Math.sin(ang) * 1.6, 0.45, 3);
      const sx = want ? want.x : p.x;
      const sy = want ? want.y : p.y;
      const ally = new JJK.Entities.Ally(sx, sy, a.summon, p, a.life * p.flag('summonLife', 1));
      G.allies.push(ally);
      // Ten Shadows: they come OUT of a shadow, so the pool reads first and
      // the construct rises through it (see Ally.spawnT).
      Particles.burst(sx, sy, 0.06, {
        count: 16, color: '#0a0616', speed: 3.2, size: 0.42, life: 0.5,
        additive: false, gravity: 0.4,
      });
      Particles.burst(sx, sy, 0.35, {
        count: 14, color: a.color, core: '#cfe8ff', speed: 2.2, size: 0.2,
        life: 0.7, gravity: -1.8,
      });
      G.flashLights.push({ x: sx, y: sy, color: a.color, r: 3.6, intensity: 0.9, life: 0.4, t: 0 });
    }
    Audio.SFX.cast('summon', a.color);
    p.startSwing('cast');
  }

  function doBuff(G, p, a) {
    p.applyBuff({
      id: a.owner + ':' + a.slot,
      label: a.label || a.name,
      duration: a.duration,
      mods: a.mods,
      color: a.color,
      stacking: a.stacking || 1,
      aura: a.aura,
    });
    Particles.burst(p.x, p.y, 1.0, { count: 20, color: a.color, core: '#ffffff', speed: 3, size: 0.3, life: 0.8 });
    PostFX.impact({ flash: 0.2, color: a.color, lines: 0.4, linesColor: a.color });
    Audio.SFX.cast('buff', a.color);
  }

  function doBlink(G, p, a, dx, dy) {
    const want = a.range;
    const d = clampToWall(G, p.x, p.y, dx, dy, want, 0.5);
    const tx = p.x + dx * d, ty = p.y + dy * d;

    // Boogie Woogie: swap with whatever you were looking at.
    if (a.swap) {
      let best = null, bestPerp = 2.2;
      for (const e of G.targets()) {
        const r = rayPointDist(p.x, p.y, dx, dy, e.x, e.y);
        if (r.along < 0 || r.along > want) continue;
        if (r.perp < bestPerp) { bestPerp = r.perp; best = e; }
      }
      if (best) {
        const ox = best.x, oy = best.y;
        const px = p.x, py = p.y;
        if (safeWarp(G, p, ox, oy)) { best.x = px; best.y = py; }
        Combat.playerHit(p, best, a.dmg, {
          sourceId: a.owner + ':' + a.slot, color: a.color,
        });
        Particles.burst(ox, oy, 1.0, { count: 18, color: a.color, core: '#ffffff', speed: 6, size: 0.26, life: 0.5 });
        Particles.burst(best.x, best.y, 1.0, { count: 18, color: a.color, core: '#ffffff', speed: 6, size: 0.26, life: 0.5 });
        PostFX.impact({ flash: 0.3, color: a.color, ca: 0.5, lines: 0.6, linesColor: a.color });
        Audio.SFX.cast('buff', a.color);
        p.startSwing('cast');
        return;
      }
    }

    // Trail of after-images.
    for (let i = 1; i <= 6; i++) {
      const f = i / 6;
      Particles.burst(p.x + dx * d * f, p.y + dy * d * f, EYE + p.z, {
        count: 3, color: a.color, core: '#ffffff', speed: 1.5, size: 0.3, life: 0.4,
      });
    }
    safeWarp(G, p, tx, ty);
    p.dashFov = 1;

    if (a.dmg) {
      Projectiles.explode(G, p.x, p.y, 0.8, a.radius || 2, a.dmg * (p.mods.damage || 1), {
        color: a.color, force: 10, sourceId: a.owner + ':' + a.slot,
      });
    }
    PostFX.impact({ shake: a.shake || 0.5, lines: 0.9, linesColor: a.color, ca: 0.4 });
    Audio.SFX.cast('buff', a.color);
    p.startSwing('cast');
  }

  function doDomain(G, p, a) {
    const def = DOMAINS[a.domain];
    if (!def) return;
    G.openDomain(def, p, p.flag('domainTime', 1));
  }

  /** Yuta: borrow another sorcerer's technique. */
  function doCopy(G, p, a, dx, dy, angle) {
    const pool = JJK.ROSTER_ORDER.filter((id) => id !== 'yuta' && id !== 'gojofull' && id !== 'meguna');
    const src = CHARACTERS[M.pick(pool)];
    const slot = M.pick(['j', 'k', 'l']);
    const copied = Object.assign({}, src.abilities[slot], {
      owner: 'yuta', slot: 'copy', cost: 0, cd: 0,
    });
    p.copyLabel = src.short + ': ' + copied.name;
    p.copyLabelT = 2.2;
    execute(G, p, copied, dx, dy, angle);
    Audio.SFX.cast('buff', a.color);
  }

  /** Hakari: roll for a jackpot. */
  function doGamble(G, p, a) {
    const rigged = p.flag('riggedGamble', 0);
    const roll = Math.random() * (rigged ? 0.6 : 1);
    if (roll < (rigged ? 0.44 : 0.22)) {
      p.jackpot = 12;
      p.applyBuff({ id: 'jackpot', label: 'JACKPOT', duration: 12, color: '#ffdd66', aura: true,
        mods: { damage: 1.8, speed: 1.25, regen: 22, critBonus: 0.07 } });
      Particles.burst(p.x, p.y, 1.0, { count: 40, color: '#ffdd66', core: '#ffffff', speed: 7, size: 0.3, life: 1.2 });
      PostFX.impact({ flash: 0.7, color: '#ffdd66', lines: 1, linesColor: '#ffdd66', ca: 0.6, ring: true });
      G.banner('JACKPOT!!', '#ffdd66');
      Audio.SFX.unlock();
    } else if (roll < 0.6) {
      p.addMana(35);
      p.applyBuff({ id: 'gamble', label: 'SMALL WIN', duration: 6, color: '#ffaa00',
        mods: { damage: 1.25 } });
      Audio.SFX.cast('buff', a.color);
      G.banner('small win', '#ffaa00');
    } else {
      p.takeDamage(28, { self: true });
      Audio.SFX.hurt();
      G.banner('bust', '#886644');
    }
  }

  /** Nobara: detonate every nail already embedded. */
  function doResonance(G, p, a, dx, dy) {
    let any = false;
    for (const e of G.targets()) {
      if (M.dist(p.x, p.y, e.x, e.y) > a.range) continue;
      const nails = e.nails || 0;
      const dmg = (a.dmg + nails * a.perNail) * p.flag('resonanceMult', 1);
      if (nails > 0) any = true;
      e.nails = 0;
      Combat.playerHit(p, e, dmg, {
        sourceId: 'nobara:k', color: a.color, knock: 6, dirX: dx, dirY: dy,
      });
      Particles.burst(e.x, e.y, e.z + e.height * 0.5, {
        count: 8 + nails * 3, color: a.color, core: '#ffffff', speed: 5, size: 0.2, life: 0.5,
      });
    }
    PostFX.impact({ shake: any ? 0.7 : 0.3, flash: 0.2, color: a.color });
    Audio.SFX.cast('burst', a.color);
    p.startSwing('cast');
  }

  /* ==================================================================
     Dispatch
     ================================================================== */
  function execute(G, p, a, dx, dy, angle) {
    switch (a.kind) {
      case 'melee': doMelee(G, p, a, dx, dy); break;
      case 'projectile': doProjectile(G, p, a, dx, dy, angle); break;
      case 'volley': doVolley(G, p, a, dx, dy); break;
      case 'beam': doBeam(G, p, a, dx, dy); break;
      case 'burst': doBurst(G, p, a, dx, dy); break;
      case 'vortex': doVortex(G, p, a, dx, dy); break;
      case 'summon': doSummon(G, p, a); break;
      case 'buff': doBuff(G, p, a); break;
      case 'blink': doBlink(G, p, a, dx, dy); break;
      case 'domain': doDomain(G, p, a); break;
      case 'copy': doCopy(G, p, a, dx, dy, angle); break;
      case 'gamble': doGamble(G, p, a); break;
      case 'resonance': doResonance(G, p, a, dx, dy); break;
      default: doProjectile(G, p, a, dx, dy, angle);
    }
    if (a.kind !== 'beam' && a.kind !== 'burst' && a.kind !== 'melee') {
      Audio.SFX.cast(a.kind, a.color);
    }
  }

  /** Can this slot fire right now? Used by cast() and by the HUD. */
  function canCast(p, slot) {
    const a = p.char.abilities[slot];
    if (!a) return false;
    if (p.cooldowns[slot] > 0) return false;
    const cost = (p.infiniteMana || (p.flag('sixEyes', 0) && p.mana > p.maxMana * 0.6)) ? 0 : a.cost;
    if (p.mana < cost) return false;
    if (a.kind === 'domain' && p.domainActive) return false;
    return true;
  }

  /** Entry point from input. Returns true if the ability fired. */
  function cast(G, p, slot) {
    const a = p.char.abilities[slot];
    if (!a) return false;

    /* Re-pressing the key while your own shot is still in the air triggers
       it early, wherever it is. Checked BEFORE the cooldown test, so the
       cooldown you just started never blocks your own detonator. */
    const live = p.liveShots && p.liveShots[slot];
    if (live && live.alive) {
      if (Projectiles.detonate(G, live)) {
        p.liveShots[slot] = null;
        PostFX.impact({ shake: 0.5, flash: 0.2, color: a.color });
        Audio.SFX.cast('burst', a.color);
        return true;
      }
      p.liveShots[slot] = null;
    }

    if (!canCast(p, slot)) {
      if (p.cooldowns[slot] > 0) Audio.SFX.uiBack();
      else G.banner('NOT ENOUGH CURSED ENERGY', '#ff5566', 0.8);
      return false;
    }

    const freeCast = p.infiniteMana
      || (p.flag('sixEyes', 0) && p.mana > p.maxMana * 0.6);
    if (!freeCast) p.mana -= a.cost;
    const noCd = p.flag('freeSlot', null) === slot;
    p.cooldowns[slot] = noCd ? 0 : a.cd;
    p.cooldownMax[slot] = a.cd;

    // Cursed Speech costs Toge his throat.
    if (p.char.cursedSpeech && a.selfDamage) p.throatDamage = 1;

    const dx = Math.cos(p.angle), dy = Math.sin(p.angle);
    execute(G, p, a, dx, dy, p.angle);
    return true;
  }

  /** Reverse Cursed Technique — the heal, on its own key. */
  function castRCT(G, p) {
    const c = p.char;
    const allowed = c.hasRCT === true || (c.hasRCT === 'jackpot' && p.jackpot > 0);
    if (!allowed) {
      G.banner(c.hasRCT === 'jackpot' ? 'RCT REQUIRES JACKPOT' : 'NO REVERSE CURSED TECHNIQUE', '#ff5566', 1.0);
      Audio.SFX.uiBack();
      return false;
    }
    if (p.rctCd > 0) return false;
    const cost = 18;
    if (p.mana < cost && !p.infiniteMana) {
      G.banner('NOT ENOUGH CURSED ENERGY', '#ff5566', 0.8);
      return false;
    }
    if (!p.infiniteMana) p.mana -= cost;
    p.rctCd = 3.0;
    const amount = p.maxHealth * 0.28;
    p.heal(amount);
    Particles.burst(p.x, p.y, 1.0, {
      count: 24, color: '#66ffcc', core: '#ffffff', speed: 2.5, size: 0.25, life: 1.0, gravity: -1.5,
    });
    PostFX.impact({ flash: 0.22, color: '#66ffcc' });
    Audio.SFX.cast('heal');
    Particles.number(p.x, p.y, 1.6, '+' + Math.round(amount), 'heal', '#66ffcc');
    return true;
  }

  JJK.Abilities = { cast, canCast, castRCT, execute, clampToWall, safeWarp, rayPointDist, muzzle, aimFromMuzzle, EYE };
})(window.JJK);
