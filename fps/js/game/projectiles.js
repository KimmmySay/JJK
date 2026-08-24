/* ==========================================================================
   PROJECTILES, BEAMS AND FIELDS

   Three shapes of ranged attack, all sharing one update pass:

     projectile  travels, collides with walls and bodies
     beam        instant hitscan; the visual is a line of additive billboards
                 that fades, which reads far better in a raycaster than
                 trying to draw a 3D cylinder
     field       a lingering area — vortex pulls, ground AOE with a telegraph
                 ring, damage-over-time zones

   Every one of these also registers a dynamic light while alive, so a
   Hollow Purple actually lights the corridor it's fired down.
   ========================================================================== */

(function (JJK) {
  'use strict';

  const { M, Color, SpriteBake, Particles, Combat, PostFX, Audio } = JJK;

  const MAX_PROJECTILES = 140;

  const projectiles = [];
  const beams = [];
  const fields = [];
  const fx = [];      // one-shot visuals: swing arcs, impact rings

  function clear() { projectiles.length = 0; beams.length = 0; fields.length = 0; fx.length = 0; }

  /**
   * Fire-and-forget world sprite. Melee used to be nothing but a coloured
   * particle puff, so a spear sweep and a punch looked identical; this is
   * what puts an actual arc in the air where you swung.
   */
  function spawnFx(o) {
    fx.push(Object.assign({
      x: 0, y: 0, z: 1.0, size: 2, life: 0, maxLife: 0.24,
      grow: 1.5, spin: 0, sheet: null, alpha: 1,
    }, o));
  }

  /* ------------------------------------------------------------------
     Spawning
     ------------------------------------------------------------------ */
  function spawnProjectile(o) {
    if (projectiles.length >= MAX_PROJECTILES) projectiles.shift();
    const p = Object.assign({
      x: 0, y: 0, z: 0.9,
      vx: 0, vy: 0, vz: 0,
      dmg: 20, radius: 0.5, size: 0.5,
      life: 0, maxLife: 3.0,
      hostile: false,
      color: '#ffffff', core: '#ffffff',
      pierce: 0, hits: null,
      gravity: 0, homing: 0, bounce: 0,
      trail: true, trailTimer: 0,
      spin: M.rand(0, M.TAU),
      sphereMode: null,   // 'implode' | 'explode' | 'void' -> render as a real orb
      shape: null,        // named silhouette from SpriteBake.PROJ_SHAPES
      onEnd: null,        // payload fired wherever this projectile stops
      /* A field carried BY the projectile while it flies. Blue should be
         dragging everything toward it the whole way in, not only where it
         lands; Red should be shoving things aside as it passes. */
      aura: null,         // { force, radius, dps }
      alive: true,
      slotOwner: null,    // which ability key can detonate it early
    }, o);
    p.sheet = p.sphereMode
      ? SpriteBake.energySphere(p.color, p.core, p.sphereMode)
      : p.shape
        ? SpriteBake.projectileSprite(p.shape, p.color, p.core)
        : SpriteBake.orb(p.color, p.core);
    if (!p.hits) p.hits = new Set();
    projectiles.push(p);
    return p;
  }

  function spawnBeam(o) {
    const b = Object.assign({
      x: 0, y: 0, z: 1.0, dirX: 1, dirY: 0,
      length: 20, width: 1.2,
      color: '#ffffff', core: '#ffffff',
      life: 0, maxLife: 0.42,
    }, o);
    b.sheet = SpriteBake.orb(b.color, b.core);
    // A beam drawn as one line of identical orbs reads as a flat streak.
    // Two concentric layers — a wide coloured body and a thin white-hot
    // core — give it a cross-section, which is what makes it look like a
    // column of energy rather than a painted line.
    b.coreSheet = SpriteBake.orb(b.core || '#ffffff', '#ffffff');
    if (b.voidOrb) b.orbSheet = SpriteBake.energySphere(b.color, b.core, 'void');
    beams.push(b);
    return b;
  }

  function spawnField(o) {
    const f = Object.assign({
      x: 0, y: 0, z: 0.1,
      radius: 3, force: 0, dps: 0,
      life: 0, maxLife: 2.0,
      tell: 0,                 // telegraph seconds before it becomes live
      hostile: false,
      color: '#ffffff',
      tickTimer: 0,
      detonate: null,          // { dmg, force } fired once when the tell ends
      lifesteal: 0,
      burn: 0,
      volumetric: false,   // render as a floating sphere, not a floor decal
      sphereMode: 'none',  // implode | explode | void
      zHeight: 1.0,
      core: '#ffffff',
      emit: 0,             // particles/sec streaming in or out
      emitTimer: 0,
    }, o);
    f.sheet = SpriteBake.ring(f.color);
    if (f.volumetric) f.sphere = SpriteBake.energySphere(f.color, f.core, f.sphereMode);
    fields.push(f);
    return f;
  }

  /* ------------------------------------------------------------------
     Explosion — damage + light + particles, used by several archetypes.
     ------------------------------------------------------------------ */
  function explode(G, x, y, z, radius, dmg, opts) {
    const o = opts || {};
    const color = o.color || '#ffaa44';
    Particles.burst(x, y, z, {
      count: 26, color, core: '#ffffff', speed: 8 + radius,
      size: 0.28 + radius * 0.05, life: 0.7,
    });
    Particles.smoke(x, y, z, '#221820', 8);
    G.flashLights.push({ x, y, color, r: radius * 1.8, intensity: 1.1, life: 0.28, t: 0 });

    const dist = M.dist(x, y, G.player.x, G.player.y);
    PostFX.impact({ shake: M.clamp((radius * 0.25) / Math.max(1, dist * 0.4), 0.1, 1.1) });

    if (o.hostile) {
      if (dist < radius) {
        const f = 1 - dist / radius;
        G.player.takeDamage(dmg * f, { x, y, burn: o.burn, ground: o.ground });
      }
    } else {
      for (const e of G.targets()) {
        const d = M.dist(x, y, e.x, e.y);
        if (d > radius) continue;
        const f = 1 - d * 0.6 / radius;
        const dx = (e.x - x) / (d || 1), dy = (e.y - y) / (d || 1);
        Combat.playerHit(G.player, e, dmg * f, {
          sourceId: o.sourceId, knock: o.force || 6, dirX: dx, dirY: dy,
          color, trueDamage: o.trueDamage, lifesteal: o.lifesteal,
        });
        if (o.burn) applyBurn(e, o.burn);
        if (o.stun) e.stun = Math.max(e.stun || 0, o.stun);
      }
    }
  }

  function applyBurn(e, dps) {
    e.burn = Math.max(e.burn || 0, dps);
    e.burnTime = Math.max(e.burnTime || 0, 3.0);
  }

  /* ------------------------------------------------------------------
     Update
     ------------------------------------------------------------------ */
  function update(G, dt) {
    const map = G.map;
    const player = G.player;

    /* ---------- projectiles ---------- */
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        if (p.explode) explode(G, p.x, p.y, p.z, p.explode.radius, p.explode.dmg,
          { color: p.color, hostile: p.hostile, sourceId: p.sourceId, burn: p.burn });
        if (p.onEnd) p.onEnd(G, p.x, p.y, p.z);
        p.alive = false;
        projectiles.splice(i, 1);
        continue;
      }

      // Homing: steer toward the nearest valid target.
      if (p.homing > 0) {
        const tgt = p.hostile ? player : nearestTarget(G, p.x, p.y, 14, p.hits);
        if (tgt) {
          const dx = tgt.x - p.x, dy = tgt.y - p.y;
          const d = Math.hypot(dx, dy) || 1;
          const sp = Math.hypot(p.vx, p.vy) || 1;
          p.vx = M.damp(p.vx, (dx / d) * sp, p.homing, dt);
          p.vy = M.damp(p.vy, (dy / d) * sp, p.homing, dt);
        }
      }

      p.vz -= (p.gravity || 0) * dt;
      const nx = p.x + p.vx * dt;
      const ny = p.y + p.vy * dt;
      const nz = p.z + p.vz * dt;

      // Wall / floor / ceiling collision. Height-aware, so a shot can sail
      // over a crate and still slam into the building behind it.
      let hitWall = false;
      if (map.heightAt(nx, ny) > nz) hitWall = true;
      if (nz < 0.08 || nz > 2.6) hitWall = true;

      if (hitWall) {
        if (p.bounce > 0) {
          p.bounce--;
          // Reflect off whichever axis is blocked.
          if (map.solid(nx, p.y)) p.vx *= -0.8;
          if (map.solid(p.x, ny)) p.vy *= -0.8;
          if (nz < 0.08 || nz > 1.9) p.vz *= -0.8;
          p.z = M.clamp(p.z, 0.12, 1.85);
          Particles.burst(p.x, p.y, p.z, { count: 5, color: p.color, speed: 3, size: 0.14, life: 0.3 });
          Audio.SFX.hit(0.5);
        } else {
          if (p.explode) explode(G, p.x, p.y, p.z, p.explode.radius, p.explode.dmg,
            { color: p.color, hostile: p.hostile, sourceId: p.sourceId, burn: p.burn });
          else if (!p.onEnd) Particles.burst(p.x, p.y, p.z, { count: 8, color: p.color, core: '#ffffff', speed: 4, size: 0.16, life: 0.35 });
          if (p.onEnd) p.onEnd(G, p.x, p.y, p.z);
          p.alive = false;
          projectiles.splice(i, 1);
          continue;
        }
      } else {
        p.x = nx; p.y = ny; p.z = nz;
      }

      // Carried field: drag things in (positive force) or shove them out
      // (negative), continuously, while the orb is still in the air.
      if (p.aura && !p.hostile) {
        const ar = p.aura.radius, af = p.aura.force;
        for (const e of G.targets()) {
          const dx = p.x - e.x, dy = p.y - e.y;
          const d = Math.hypot(dx, dy);
          if (d > ar || d < 0.001) continue;
          const falloff = 1 - d / ar;
          const imp = af * falloff * dt;
          e.vx += (dx / d) * imp;
          e.vy += (dy / d) * imp;
          if (p.aura.dps) {
            p.auraTick = (p.auraTick || 0) - dt;
            if (p.auraTick <= 0) {
              p.auraTick = 0.2;
              Combat.playerHit(G.player, e, p.aura.dps * 0.2, {
                sourceId: p.sourceId, color: p.color, noCrit: true,
              });
            }
          }
        }
        // Debris caught in the field, so the pull is visible.
        p.auraFx = (p.auraFx || 0) - dt;
        if (p.auraFx <= 0) {
          p.auraFx = 0.03;
          const a = M.rand(0, M.TAU);
          const rr = ar * (af > 0 ? M.rand(0.7, 1.05) : 0.15);
          Particles.burst(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr, p.z + M.spread(0.3), {
            count: 1, color: p.color, core: p.core, size: 0.14,
            life: 0.3, gravity: 0, drag: 0.5, speed: 0.01,
            dirX: -Math.cos(a) * Math.sign(af) * 2.2,
            dirY: -Math.sin(a) * Math.sign(af) * 2.2,
          });
        }
      }

      // Trail.
      p.trailTimer -= dt;
      if (p.trail && p.trailTimer <= 0) {
        p.trailTimer = 0.03;
        Particles.burst(p.x, p.y, p.z, {
          count: 1, color: p.color, core: p.core, speed: 0.3,
          size: p.size * 0.55, life: 0.28, gravity: 0, drag: 4,
        });
      }

      // Body collision.
      if (p.hostile) {
        // Test against the player's actual body column, which moves with a
        // jump — so hopping a low shot genuinely works.
        const bodyLo = player.z + 0.05, bodyHi = player.z + 1.75;
        if (M.dist(p.x, p.y, player.x, player.y) < p.radius + 0.35
            && p.z > bodyLo && p.z < bodyHi) {
          player.takeDamage(p.dmg, { x: p.x, y: p.y, burn: p.burn, stun: p.stun });
          Particles.burst(p.x, p.y, p.z, { count: 10, color: p.color, speed: 5, size: 0.2, life: 0.4 });
          projectiles.splice(i, 1);
          continue;
        }
      } else {
        let consumed = false;
        for (const e of G.targets()) {
          if (p.hits.has(e.uid)) continue;
          const rr = p.radius + e.radius;
          if (M.dist2(p.x, p.y, e.x, e.y) > rr * rr) continue;
          if (Math.abs(p.z - (e.z + e.height * 0.5)) > e.height * 0.75 + 0.3) continue;

          p.hits.add(e.uid);
          const d = M.dist(p.x, p.y, e.x, e.y) || 1;
          Combat.playerHit(G.player, e, p.dmg, {
            sourceId: p.sourceId, knock: p.knock || 4,
            dirX: (e.x - p.x) / d, dirY: (e.y - p.y) / d,
            color: p.color, trueDamage: p.trueDamage, lifesteal: p.lifesteal,
          });
          if (p.burn) applyBurn(e, p.burn);
          if (p.stun) e.stun = Math.max(e.stun || 0, p.stun);
          if (p.mark) e.marked = Math.max(e.marked || 0, p.mark);
          if (p.nail) e.nails = (e.nails || 0) + 1;
          if (p.pull) {
            const pd = Math.hypot(player.x - e.x, player.y - e.y) || 1;
            e.vx += ((player.x - e.x) / pd) * p.pull;
            e.vy += ((player.y - e.y) / pd) * p.pull;
          }
          if (p.lightning) {
            chainLightning(G, e, p.chain || 0, p.dmg * 0.6, p.color, p.sourceId);
          }

          if (p.explode || p.onEnd) {
            if (p.explode) {
              explode(G, p.x, p.y, p.z, p.explode.radius, p.explode.dmg,
                { color: p.color, sourceId: p.sourceId, burn: p.burn, force: p.knock });
            }
            if (p.onEnd) p.onEnd(G, p.x, p.y, p.z);
            consumed = true;
            break;
          }
          if (p.pierce > 0) p.pierce--;
          else { consumed = true; break; }
        }
        if (consumed) { p.alive = false; projectiles.splice(i, 1); continue; }
      }
    }

    /* ---------- one-shot fx ---------- */
    for (let i = fx.length - 1; i >= 0; i--) {
      fx[i].life += dt;
      if (fx[i].life >= fx[i].maxLife) fx.splice(i, 1);
    }

    /* ---------- beams ---------- */
    for (let i = beams.length - 1; i >= 0; i--) {
      const b = beams[i];
      b.life += dt;
      if (b.life >= b.maxLife) beams.splice(i, 1);
    }

    /* ---------- fields ---------- */
    for (let i = fields.length - 1; i >= 0; i--) {
      const f = fields[i];
      f.life += dt;

      // Telegraph phase: harmless, but shows the ring.
      if (f.tell > 0 && f.life < f.tell) continue;
      if (f.tell > 0 && !f.detonated) {
        f.detonated = true;
        if (f.detonate) {
          explode(G, f.x, f.y, 0.5, f.radius, f.detonate.dmg, {
            color: f.color, hostile: f.hostile, force: f.detonate.force,
            sourceId: f.sourceId, burn: f.burn, stun: f.detonate.stun,
            lifesteal: f.lifesteal,
          });
        }
        if (!f.dps) { fields.splice(i, 1); continue; }
      }

      if (f.life >= f.maxLife + f.tell) { fields.splice(i, 1); continue; }

      // Debris streaming in (or blasting out). This is the cue that reads
      // as "space is being crushed here" rather than "a light is on".
      if (f.emit > 0) {
        f.emitTimer -= dt;
        while (f.emitTimer <= 0) {
          f.emitTimer += 1 / f.emit;
          const a = M.rand(0, M.TAU);
          const el = M.rand(-0.5, 0.7);
          const inward = f.sphereMode !== 'explode';
          const rr = f.radius * (inward ? M.rand(0.85, 1.25) : 0.25);
          const px = f.x + Math.cos(a) * rr;
          const py = f.y + Math.sin(a) * rr;
          const pz = f.zHeight + Math.sin(el) * f.radius * 0.5;
          const sp = inward ? -f.radius * 1.9 : f.radius * 2.2;
          Particles.burst(px, py, pz, {
            count: 1, color: f.color, core: f.core, size: 0.16,
            life: inward ? 0.42 : 0.55, gravity: 0, drag: 0.6,
            speed: 0.01,
            dirX: Math.cos(a) * (sp / Math.max(0.001, f.radius)) * 0.5,
            dirY: Math.sin(a) * (sp / Math.max(0.001, f.radius)) * 0.5,
          });
        }
      }

      // Continuous pull/push + damage over time.
      f.tickTimer -= dt;
      const tick = f.tickTimer <= 0;
      if (tick) f.tickTimer = 0.2;

      if (f.hostile) {
        const d = M.dist(f.x, f.y, player.x, player.y);
        if (d < f.radius) {
          if (f.force) {
            const dx = (f.x - player.x) / (d || 1), dy = (f.y - player.y) / (d || 1);
            player.vx += dx * f.force * dt;
            player.vy += dy * f.force * dt;
          }
          if (tick && f.dps) player.takeDamage(f.dps * 0.2, { x: f.x, y: f.y, silent: true });
        }
      } else {
        for (const e of G.targets()) {
          const d = M.dist(f.x, f.y, e.x, e.y);
          if (d > f.radius) continue;
          if (f.force) {
            const dx = (f.x - e.x) / (d || 1), dy = (f.y - e.y) / (d || 1);
            e.vx += dx * f.force * dt;
            e.vy += dy * f.force * dt;
          }
          if (tick && f.dps) {
            Combat.playerHit(G.player, e, f.dps * 0.2, {
              sourceId: f.sourceId, color: f.color, noCrit: true,
              lifesteal: f.lifesteal,
            });
          }
        }
      }
    }
  }

  /**
   * Blow a projectile now, wherever it happens to be. This is what turns
   * Blue and Red from fire-and-forget into something you place: hold it
   * through a crowd, then trigger.
   */
  function detonate(G, p) {
    const i = projectiles.indexOf(p);
    if (i < 0 || !p.alive) return false;
    if (p.explode) {
      explode(G, p.x, p.y, p.z, p.explode.radius, p.explode.dmg, {
        color: p.color, hostile: p.hostile, sourceId: p.sourceId, burn: p.burn, force: p.knock,
      });
    }
    if (p.onEnd) p.onEnd(G, p.x, p.y, p.z);
    p.alive = false;
    projectiles.splice(i, 1);
    return true;
  }

  /** Nearest living target within range, skipping ones already hit. */
  function nearestTarget(G, x, y, range, exclude) {
    let best = null, bd = range * range;
    for (const e of G.targets()) {
      if (exclude && exclude.has(e.uid)) continue;
      const d = M.dist2(x, y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /** Kashimo's arc — hops between nearby enemies. */
  function chainLightning(G, from, jumps, dmg, color, sourceId) {
    let cur = from;
    const hit = new Set([from.uid]);
    for (let j = 0; j < jumps; j++) {
      const next = nearestTarget(G, cur.x, cur.y, 6, hit);
      if (!next) break;
      hit.add(next.uid);
      spawnBeam({
        x: cur.x, y: cur.y, z: cur.z + cur.height * 0.5,
        dirX: (next.x - cur.x) / (M.dist(cur.x, cur.y, next.x, next.y) || 1),
        dirY: (next.y - cur.y) / (M.dist(cur.x, cur.y, next.x, next.y) || 1),
        length: M.dist(cur.x, cur.y, next.x, next.y),
        width: 0.35, color, core: '#ffffff', maxLife: 0.22,
      });
      Combat.playerHit(G.player, next, dmg, { sourceId, color, noCrit: true });
      Audio.SFX.lightning();
      cur = next;
    }
  }

  /* ------------------------------------------------------------------
     Render collection
     ------------------------------------------------------------------ */
  function collect(out) {
    for (const p of projectiles) {
      out.push({
        x: p.x, y: p.y, z: p.z, size: p.size,
        sheet: p.sheet,
        frame: p.sheet.frames > 1 ? Math.floor(p.life * (p.sphereMode ? 22 : 18)) % p.sheet.frames : 0,
        alpha: 1, additive: true, tintAmount: 0,
      });
    }

    // One-shot fx: expand and fade.
    for (const e of fx) {
      const t = e.life / e.maxLife;
      out.push({
        x: e.x, y: e.y, z: e.z,
        size: e.size * (1 + (e.grow - 1) * t),
        sheet: e.sheet, frame: 0,
        alpha: (1 - t) * e.alpha,
        additive: true, tintAmount: 0,
      });
    }

    // Beams: two concentric runs of additive orbs, so the shaft has a
    // visible cross-section instead of being a single flat streak.
    for (const b of beams) {
      const t = b.life / b.maxLife;
      const fade = 1 - t;
      const steps = Math.max(4, Math.min(46, Math.round(b.length * 2.2)));
      const w = b.width * (0.55 + fade * 0.75);
      for (let i = 0; i <= steps; i++) {
        const f = i / steps;
        const x = b.x + b.dirX * b.length * f;
        const y = b.y + b.dirY * b.length * f;
        // Outer body — swells slightly toward the middle of the shaft.
        const bulge = 1 + Math.sin(f * Math.PI) * 0.22;
        out.push({
          x, y, z: b.z,
          size: w * bulge * (1 - f * 0.12),
          sheet: b.sheet, frame: 0,
          alpha: fade * (0.6 - f * 0.18),
          additive: true, tintAmount: 0,
        });
        // Inner white-hot core.
        out.push({
          x, y, z: b.z,
          size: w * 0.34 * bulge,
          sheet: b.coreSheet, frame: 0,
          alpha: fade * (0.95 - f * 0.25),
          additive: true, tintAmount: 0,
        });
      }
      // Hollow Purple: the orb itself, tearing down the line.
      if (b.orbSheet) {
        const travel = M.clamp(t / 0.55, 0, 1);
        out.push({
          x: b.x + b.dirX * b.length * travel,
          y: b.y + b.dirY * b.length * travel,
          z: b.z,
          size: b.width * 2.6,
          sheet: b.orbSheet,
          frame: Math.floor(b.life * 22) % b.orbSheet.frames,
          alpha: fade, additive: true, tintAmount: 0,
        });
      }
    }

    // Fields: a telegraph/contact ring on the floor, and for volumetric
    // ones an actual shaded sphere hanging in the air above it.
    for (const f of fields) {
      const telling = f.tell > 0 && f.life < f.tell;
      const pulse = telling
        ? 0.4 + 0.6 * Math.abs(Math.sin(f.life * 9))
        : M.clamp(1 - (f.life - f.tell) / (f.maxLife || 1), 0.15, 1);

      out.push({
        x: f.x, y: f.y, z: 0.09,
        size: f.radius * 2,
        sheet: f.sheet, frame: 0,
        alpha: telling ? pulse * 0.9 : pulse * (f.volumetric ? 0.3 : 0.55),
        additive: true, tintAmount: 0,
      });

      if (f.volumetric && f.sphere && !telling) {
        // Ease in fast, hold, then collapse — a technique that snaps to full
        // size instantly looks like a decal being switched on.
        const t = (f.life - f.tell) / Math.max(0.001, f.maxLife);
        const grow = M.smoothstep(M.clamp(t / 0.18, 0, 1));
        const fade = M.clamp(1 - (t - 0.82) / 0.18, 0, 1);
        const spin = Math.floor(f.life * 16) % f.sphere.frames;
        out.push({
          x: f.x, y: f.y, z: f.zHeight,
          // The baked sphere occupies ~0.6 of its frame. Sizing it to the
          // FULL damage radius made Blue a 7-unit ball — wider than a
          // corridor — so up close it smeared across the whole view and
          // read as a flat overlay. The orb is the visible core; the pull
          // reaches further than the ball you can see, which is both more
          // readable and more physically sensible.
          size: f.radius * 1.25 * grow,
          sheet: f.sphere, frame: spin,
          alpha: fade, additive: true, tintAmount: 0,
        });
      }
    }
  }

  /** Dynamic lights emitted by live ordnance. */
  function collectLights(out) {
    for (const p of projectiles) {
      out.push({ x: p.x, y: p.y, color: p.color, r: 2.4 + p.size * 2, intensity: 0.55 });
    }
    for (const b of beams) {
      const fade = 1 - b.life / b.maxLife;
      const steps = 4;
      for (let i = 0; i <= steps; i++) {
        const f = i / steps;
        out.push({
          x: b.x + b.dirX * b.length * f,
          y: b.y + b.dirY * b.length * f,
          color: b.color, r: 4 + b.width * 2, intensity: 1.0 * fade,
        });
      }
    }
    for (const f of fields) {
      out.push({
        x: f.x, y: f.y, color: f.color,
        r: f.radius * (f.volumetric ? 1.9 : 1.2),
        intensity: f.volumetric ? 1.0 : 0.5,
      });
    }
  }

  JJK.Projectiles = {
    spawnProjectile, spawnBeam, spawnField, spawnFx, explode, applyBurn, detonate,
    chainLightning, nearestTarget,
    update, collect, collectLights, clear,
    get list() { return projectiles; },
    get beams() { return beams; },
    get fields() { return fields; },
    get fx() { return fx; },
  };

  void Color;
})(window.JJK);
