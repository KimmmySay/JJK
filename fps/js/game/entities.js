/* ==========================================================================
   ENTITIES — curse spirits, summoned allies, and battle-mode opponents.

   The example project this replaces had enemies that were static meshes
   walking in a straight line at the player. Everything here is built to fix
   exactly that:

     STATE MACHINE   approach -> windup -> strike -> recover, plus stagger
                     and a death dissolve. Each state drives a different
                     slice of the baked animation strip.
     TELEGRAPH       every attack has a wind-up during which the sprite
                     rears back and its aura swells. You can always see the
                     hit coming, so getting hit is your fault.
     NAVIGATION      flow-field pathing when line of sight is broken, direct
                     steering when it is clear. They come round corners.
     SEPARATION      soft body repulsion so a pack spreads into a crescent
                     instead of stacking into one sprite.
   ========================================================================== */

(function (JJK) {
  'use strict';

  const { M, Art, SpriteBake, Combat, Particles, Projectiles, Audio, PostFX } = JJK;

  let nextUid = 1;

  /* Enemy tier stats. Mirrors the original weak/medium/strong/special. */
  const TIERS = {
    weak:    { health: 42,  speed: 2.0, damage: 11, radius: 0.38, height: 1.25, score: 10,  mana: 3, range: 1.5, cd: 1.5, tell: 0.45 },
    medium:  { health: 105, speed: 1.75, damage: 20, radius: 0.48, height: 1.65, score: 25,  mana: 5, range: 1.7, cd: 1.8, tell: 0.55 },
    strong:  { health: 240, speed: 1.5, damage: 34, radius: 0.60, height: 2.05, score: 50,  mana: 8, range: 2.0, cd: 2.2, tell: 0.7 },
    special: { health: 560, speed: 1.3, damage: 58, radius: 0.78, height: 2.6,  score: 200, mana: 14, range: 2.4, cd: 2.6, tell: 0.85 },
  };

  /* ==================================================================
     Base
     ================================================================== */
  class Entity {
    constructor(x, y) {
      this.uid = nextUid++;
      this.x = x; this.y = y; this.z = 0;
      this.vx = 0; this.vy = 0;
      this.radius = 0.4; this.height = 1.4;
      this.health = 1; this.maxHealth = 1;
      this.speed = 2;
      this.dead = false; this.deathT = 0; this.counted = false;
      this.hurtFlash = 0; this.lastHitTime = 99;
      this.stun = 0; this.slow = 0; this.burn = 0; this.burnTime = 0;
      this.marked = 0; this.nails = 0; this.invuln = 0;
      this.armor = 0;
      this.state = 'approach'; this.stateT = 0;
      this.animT = M.rand(0, 10);
      this.attackCd = M.rand(0.4, 1.4);
      this.sheet = null;
      this.color = '#8b5cf6'; this.glow = '#a855f7';
      this.faction = 'enemy';
    }

    get alive() { return !this.dead; }

    /** Shared physics: velocity integration + wall slide + separation. */
    physics(G, dt, others) {
      const map = G.map;
      // Soft separation so packs fan out.
      let sx = 0, sy = 0;
      if (others) {
        for (const o of others) {
          if (o === this || o.dead) continue;
          const dx = this.x - o.x, dy = this.y - o.y;
          const d2 = dx * dx + dy * dy;
          const want = this.radius + o.radius;
          if (d2 > want * want || d2 < 1e-6) continue;
          const d = Math.sqrt(d2);
          const push = (want - d) / want;
          sx += (dx / d) * push;
          sy += (dy / d) * push;
        }
      }
      this.vx += sx * 6 * dt;
      this.vy += sy * 6 * dt;

      // Escape hatch: if a body ever ends up overlapping geometry, NO step
      // is legal and moveSlide freezes it permanently — it will sit at its
      // spawn point forever with a perfectly valid path it cannot walk.
      // Trigger strictly on "currently illegal", never on "moving slowly",
      // or it fights normal movement in a crowd.
      if (!map.openRadius(this.x, this.y, this.radius)) {
        const spot = map.findOpenNear(this.x, this.y, this.radius, 3, true);
        if (spot) { this.x = spot.x; this.y = spot.y; this.vx = 0; this.vy = 0; }
      }

      const damp = Math.exp(-7 * dt);
      const px = this.x, py = this.y;
      map.moveSlide(this, this.vx * dt, this.vy * dt, this.radius);
      this.vx *= damp; this.vy *= damp;

      // NaN containment. An unguarded normalize anywhere upstream (knockback,
      // pull fields) can poison position/velocity; once x is NaN the entity
      // becomes an invisible immortal ghost and every draw call using its
      // position risks throwing. Snap back to the last good position instead.
      if (!Number.isFinite(this.x + this.y + this.vx + this.vy)) {
        this.x = Number.isFinite(px) ? px : 2.5;
        this.y = Number.isFinite(py) ? py : 2.5;
        this.vx = 0; this.vy = 0;
      }
    }

    /** Status effects shared by everything. */
    tickStatus(G, dt) {
      this.stateT += dt;
      this.animT += dt;
      this.lastHitTime += dt;
      this.hurtFlash = Math.max(0, this.hurtFlash - dt * 5);
      if (this.stun > 0) this.stun -= dt;
      if (this.slow > 0) this.slow -= dt;
      if (this.marked > 0) this.marked -= dt;
      if (this.invuln > 0) this.invuln -= dt;
      if (this.burnTime > 0) {
        this.burnTime -= dt;
        this.burnTick = (this.burnTick || 0) - dt;
        if (this.burnTick <= 0) {
          this.burnTick = 0.35;
          Combat.damage(this, this.burn * 0.35, { silent: true, trueDamage: true });
          Particles.burst(this.x, this.y, this.z + this.height * 0.5, {
            count: 2, color: '#ff6622', speed: 1.2, size: 0.12, life: 0.35,
          });
          if (this.dead) Combat.onKill(G.player, this);
        }
      }
    }

    setState(s) {
      if (this.state === s) return;
      this.state = s;
      this.stateT = 0;
    }
  }

  /* ==================================================================
     CURSE SPIRIT
     ================================================================== */
  class Curse extends Entity {
    constructor(x, y, tier, waveScale) {
      super(x, y);
      const t = TIERS[tier] || TIERS.weak;
      this.tier = tier;
      const s = waveScale || 1;
      this.maxHealth = Math.round(t.health * s);
      this.health = this.maxHealth;
      this.speed = t.speed * (1 + (s - 1) * 0.10);
      this.damage = t.damage * (1 + (s - 1) * 0.5);
      this.radius = t.radius;
      this.height = t.height;
      this.score = t.score;
      this.manaReward = t.mana;
      this.atkRange = t.range;
      this.atkCd = t.cd;
      this.tell = t.tell;
      // Flanking personality. A horde that beelines is both boring to fight
      // and always presents the same face to the camera; arcing in makes the
      // pack fan into a crescent and shows off the baked side views.
      this.flankSign = M.chance(0.5) ? 1 : -1;
      this.flankBias = M.rand(0.45, 1.05);
      this.flankTimer = M.rand(1.2, 3.0);
      this.sheet = Art.curseSheet(tier, this.uid);
      const spec = this.sheet.spec || SpriteBake.CURSE_TIERS[tier];
      this.color = spec.body;
      this.glow = spec.glow;
      this.z = 0;
    }

    update(G, dt, others) {
      this.tickStatus(G, dt);

      if (this.dead) {
        this.deathT += dt;
        return;
      }

      const p = G.player;
      const dx = p.x - this.x, dy = p.y - this.y;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = dx / dist, ny = dy / dist;

      // Facing is deliberately NOT locked to the player. If it were, the
      // yaw relative to the camera would always be "front" and the eight
      // baked views would never be seen — every enemy would look like the
      // same flat cutout again. Instead it faces where it is travelling,
      // and only turns to the player once committed to an attack. Turning
      // at a finite rate is what lets you read its intent and flank it.
      if (this.facing == null) this.facing = Math.atan2(dy, dx);
      const committed = this.state === 'windup' || this.state === 'strike'
        || (this.state !== 'reposition' && dist < this.atkRange + p.radius + 0.6);
      const moving = Math.hypot(this.vx, this.vy) > 0.35;
      const want = committed ? Math.atan2(dy, dx)
        : (moving ? Math.atan2(this.vy, this.vx) : this.facing);
      this.facing = M.approachAngle(this.facing, want, 5.5 * dt);

      if (this.stun > 0) {
        this.setState('stagger');
        this.physics(G, dt, others);
        return;
      }

      this.attackCd -= dt;

      switch (this.state) {
        case 'windup': {
          // Rooted during the tell — that is what makes it dodgeable.
          if (this.stateT >= this.tell) {
            this.setState('strike');
            // Commit the hit at the start of the strike.
            if (dist <= this.atkRange + p.radius + 0.5) {
              p.takeDamage(this.damage * (G.difficulty || 1), { x: this.x, y: this.y });
              Particles.burst(p.x - nx * 0.6, p.y - ny * 0.6, 1.1, {
                count: 8, color: this.glow, speed: 4, size: 0.18, life: 0.35,
              });
            }
          }
          break;
        }
        case 'strike': {
          if (this.stateT >= 0.35) {
            // Peel off after connecting rather than standing in your face.
            // Gives the fight a rhythm and a window to answer.
            this.setState('reposition');
            this.repositionT = M.rand(0.5, 1.1);
            this.flankSign *= M.chance(0.6) ? -1 : 1;
            this.attackCd = this.atkCd * M.rand(0.85, 1.2);
          }
          break;
        }
        case 'reposition': {
          // Orbit at roughly attack range, then re-engage.
          const speedR = this.speed * (this.slow > 0 ? 0.45 : 1) * 0.9;
          const px = -ny * this.flankSign, py = nx * this.flankSign;
          const pull = dist < this.atkRange * 2.2 ? -0.45 : 0.5;
          let rx = px + nx * pull, ry = py + ny * pull;
          const rl = Math.hypot(rx, ry) || 1;
          const steerR = G.map.steerAround(this.x, this.y, rx / rl, ry / rl, this.radius);
          this.vx += steerR.x * speedR * 9 * dt;
          this.vy += steerR.y * speedR * 9 * dt;
          if (this.stateT >= (this.repositionT || 0.8)) this.setState('approach');
          break;
        }
        case 'stagger': {
          if (this.stateT >= 0.3) this.setState('approach');
          break;
        }
        default: {
          // Approach.
          if (dist <= this.atkRange + p.radius && this.attackCd <= 0) {
            this.setState('windup');
            break;
          }
          const speed = this.speed * (this.slow > 0 ? 0.45 : 1);
          let mx = nx, my = ny;
          const hasLos = G.map.lineOfSight(this.x, this.y, p.x, p.y);
          // Route around geometry when sight is broken.
          if (!hasLos) {
            const f = G.map.flowDir(this.x, this.y, this.radius);
            if (f) { mx = f.x; my = f.y; }
          }
          // Curve in instead of charging down the straight line. The bias
          // fades as it closes, so the final approach still commits.
          this.flankTimer -= dt;
          if (this.flankTimer <= 0) {
            this.flankTimer = M.rand(1.4, 3.2);
            if (M.chance(0.35)) this.flankSign *= -1;
          }
          if (hasLos) {
            const arc = this.flankBias * M.clamp((dist - this.atkRange) / 7, 0, 1);
            const px = -my * this.flankSign, py = mx * this.flankSign;
            mx += px * arc; my += py * arc;
            const l = Math.hypot(mx, my) || 1;
            mx /= l; my /= l;
          }
          const steer = G.map.steerAround(this.x, this.y, mx, my, this.radius);
          mx = steer.x; my = steer.y;
          // Stop pressing in once inside attack range.
          if (dist > this.atkRange * 0.9) {
            this.vx += mx * speed * 9 * dt;
            this.vy += my * speed * 9 * dt;
          }
          break;
        }
      }

      this.physics(G, dt, others);
    }

    /** Animation frame: which yaw view, and which pose within it. */
    frame() {
      const sh = this.sheet;
      const pose = SpriteBake.poseIndex(sh, this.state, this.stateT, this.tell, this.animT, 7);
      return (this.angleIndex || 0) * (sh.poses || 1) + pose;
    }
  }

  /* ==================================================================
     SUMMONED ALLY — shikigami, clones, bound curses.
     ================================================================== */
  class Ally extends Entity {
    constructor(x, y, kind, owner, life) {
      super(x, y);
      this.faction = 'ally';
      this.kind = kind;
      this.owner = owner;
      this.lifeLeft = life || 16;

      const presets = {
        // Scale note: the eye sits at 0.5 world units and reads as ~1.6m,
        // so 1 unit is roughly 3.2m. h:1.0 made the Divine Dogs three metres
        // tall, which is why they filled the screen. A big wolf is ~0.62.
        divineDog:   { hp: 120, speed: 3.6, dmg: 26, r: 0.30, h: 0.62, sheet: 'prop:divineDog', color: '#4a90d9' },
        nue:         { hp: 90,  speed: 4.2, dmg: 30, r: 0.30, h: 0.66, sheet: 'prop:nue', color: '#66ccff' },
        transfigured:{ hp: 140, speed: 2.6, dmg: 30, r: 0.40, h: 1.45, sheet: 'curse:transfigured', color: '#9c8a86' },
        bound:       { hp: 110, speed: 3.0, dmg: 24, r: 0.42, h: 1.40, sheet: 'curse:bound', color: '#a78bfa' },
        mahoraga:    { hp: 600, speed: 3.0, dmg: 85, r: 0.65, h: 1.95, sheet: 'prop:mahoraga', color: '#ffaa00' },
      };
      const d = presets[kind] || presets.divineDog;
      this.maxHealth = d.hp; this.health = d.hp;
      this.speed = d.speed; this.damage = d.dmg;
      this.radius = d.r; this.height = d.h;
      this.color = d.color; this.glow = d.color;
      this.atkRange = 1.6; this.atkCd = 1.1; this.tell = 0.25;

      // Divine Dogs alternate black / white as they are summoned.
      if (kind === 'divineDog') {
        Ally._dogFlip = !Ally._dogFlip;
        const white = Ally._dogFlip && Art.props.divineDogWhite;
        this.sheet = white || Art.props.divineDog;
        this.color = white ? '#cfd4e2' : '#4a90d9';
      } else if (d.sheet.startsWith('prop:')) this.sheet = Art.props[d.sheet.slice(5)];
      else this.sheet = Art.curseSheet(d.sheet.slice(6), this.uid);
      // Both curse sheets and shikigami sheets use the same 12-frame layout,
      // so either one can drive the shared animation code.
      this.animated = this.sheet && this.sheet.frames > 1;
      this.flies = kind === 'nue';
      this.hoverPhase = M.rand(0, M.TAU);
      // Shikigami rise out of a shadow pool rather than popping into being.
      this.spawnT = 0;
    }

    update(G, dt, others) {
      this.tickStatus(G, dt);
      this.spawnT = Math.min(1, this.spawnT + dt * 3.2);
      // Nue is airborne; everything else keeps its feet on the floor.
      if (this.flies) {
        this.hoverPhase += dt * 2.4;
        this.zOffset = 0.55 + Math.sin(this.hoverPhase) * 0.14;
      }
      this.lifeLeft -= dt;
      if (this.lifeLeft <= 0 && !this.dead) {
        this.dead = true;
        Particles.smoke(this.x, this.y, 0.6, '#1a1030', 6);
      }
      if (this.dead) { this.deathT += dt; return; }

      // Target the nearest enemy, else heel to the player.
      let tgt = null, bd = 144;
      for (const e of G.enemies) {
        if (e.dead) continue;
        const d = M.dist2(this.x, this.y, e.x, e.y);
        if (d < bd) { bd = d; tgt = e; }
      }
      if (!tgt && G.boss && !G.boss.dead) tgt = G.boss;

      this.attackCd -= dt;
      const p = G.player;
      const goal = tgt || p;
      const dx = goal.x - this.x, dy = goal.y - this.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (this.facing == null) this.facing = Math.atan2(dy, dx);
      const movingA = Math.hypot(this.vx, this.vy) > 0.35;
      const wantA = (tgt && dist < this.atkRange + tgt.radius + 0.5) || !movingA
        ? Math.atan2(dy, dx) : Math.atan2(this.vy, this.vx);
      this.facing = M.approachAngle(this.facing, wantA, 7 * dt);

      if (tgt && dist <= this.atkRange + tgt.radius) {
        if (this.state === 'windup' && this.stateT >= this.tell) {
          Combat.playerHit(p, tgt, this.damage, {
            sourceId: 'summon:' + this.kind, knock: 3,
            dirX: dx / dist, dirY: dy / dist, color: this.color, noCrit: true,
          });
          this.setState('strike');
          this.attackCd = this.atkCd;
        } else if (this.state !== 'windup' && this.state !== 'strike' && this.attackCd <= 0) {
          this.setState('windup');
        } else if (this.state === 'strike' && this.stateT > 0.3) {
          this.setState('approach');
        }
      } else {
        if (this.state !== 'approach') this.setState('approach');
        // Don't crowd the player when idle.
        const keep = tgt ? 0 : 1.6;
        if (dist > keep) {
          let mx = dx / dist, my = dy / dist;
          if (!G.map.lineOfSight(this.x, this.y, goal.x, goal.y)) {
            const f = G.map.flowDir(this.x, this.y, this.radius);
            if (f && !tgt) { mx = f.x; my = f.y; }
          }
          const st = G.map.steerAround(this.x, this.y, mx, my, this.radius);
          mx = st.x; my = st.y;
          this.vx += mx * this.speed * 9 * dt;
          this.vy += my * this.speed * 9 * dt;
        }
      }

      this.physics(G, dt, others);
    }

    frame() {
      if (!this.animated) return 0;
      // Run/flap cycle scales with how fast it is actually moving.
      const sp = Math.hypot(this.vx, this.vy);
      const rate = this.flies ? 8 : 5 + sp * 1.6;
      const pose = SpriteBake.poseIndex(this.sheet, this.state, this.stateT, this.tell, this.animT, rate);
      return (this.angleIndex || 0) * (this.sheet.poses || 1) + pose;
    }
  }

  /* ==================================================================
     BATTLE OPPONENT — an AI sorcerer using a real character kit.
     ================================================================== */
  class Opponent extends Entity {
    constructor(x, y, charId, difficulty) {
      super(x, y);
      const c = JJK.CHARACTERS[charId];
      this.charId = charId;
      this.char = c;
      this.maxHealth = Math.round(c.health * (difficulty || 1));
      this.health = this.maxHealth;
      this.speed = c.moveSpeed * 0.82;
      this.radius = 0.42; this.height = 1.85;
      this.color = c.color; this.glow = c.glow;
      this.score = 400; this.manaReward = 20;
      this.sheet = Art.avatars[charId];
      this.atkRange = 2.4;
      this.castCd = M.rand(0.8, 2.2);
      this.strafe = M.chance(0.5) ? 1 : -1;
      this.strafeT = 0;
      this.preferred = M.rand(4, 9);   // stand-off distance
      this.faction = 'enemy';
    }

    update(G, dt, others) {
      this.tickStatus(G, dt);
      if (this.dead) { this.deathT += dt; return; }

      const p = G.player;
      const dx = p.x - this.x, dy = p.y - this.y;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = dx / dist, ny = dy / dist;
      if (this.facing == null) this.facing = Math.atan2(dy, dx);
      this.facing = M.approachAngle(this.facing, Math.atan2(dy, dx), 6 * dt);

      if (this.stun > 0) { this.setState('stagger'); this.physics(G, dt, others); return; }

      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafeT = M.rand(0.9, 2.2); this.strafe *= -1; }

      const los = G.map.lineOfSight(this.x, this.y, p.x, p.y);
      let mx, my;
      if (!los) {
        const f = G.map.flowDir(this.x, this.y, this.radius);
        mx = f ? f.x : nx; my = f ? f.y : ny;
      } else {
        // Hold the preferred range and circle.
        const closeIn = dist > this.preferred ? 1 : dist < this.preferred * 0.6 ? -1 : 0;
        mx = nx * closeIn + (-ny) * this.strafe * 0.85;
        my = ny * closeIn + (nx) * this.strafe * 0.85;
        const l = Math.hypot(mx, my) || 1;
        mx /= l; my /= l;
      }
      const os = G.map.steerAround(this.x, this.y, mx, my, this.radius);
      this.vx += os.x * this.speed * 9 * dt;
      this.vy += os.y * this.speed * 9 * dt;

      // Cast.
      this.castCd -= dt;
      if (this.castCd <= 0 && los && dist < 22) {
        this.castCd = M.rand(1.1, 2.6) / (G.difficulty || 1);
        this.castAt(G, p, nx, ny, dist);
      }

      if (this.state === 'strike' && this.stateT > 0.3) this.setState('approach');
      this.physics(G, dt, others);
    }

    /** Pick an ability that suits the current range and fire a simplified form. */
    castAt(G, p, nx, ny, dist) {
      const ab = this.char.abilities;
      const pool = [];
      for (const s of ['j', 'k', 'l']) {
        const a = ab[s];
        if (!a) continue;
        if (a.kind === 'melee' && dist > (a.range || 3) + 1) continue;
        if (a.kind === 'domain') continue;
        pool.push(a);
      }
      if (!pool.length) return;
      const a = M.pick(pool);
      this.setState('strike');
      const sz = this.z + this.height * 0.55;
      const dmgScale = 0.55 * (G.difficulty || 1);   // AI hits softer than the player

      switch (a.kind) {
        case 'melee':
          if (dist < (a.range || 3) + p.radius) {
            p.takeDamage((a.dmg || 40) * dmgScale, { x: this.x, y: this.y });
          }
          Particles.burst(this.x + nx, this.y + ny, sz, {
            count: 10, color: a.color, speed: 5, size: 0.2, life: 0.35,
          });
          break;
        case 'beam':
          Projectiles.spawnBeam({
            x: this.x, y: this.y, z: sz, dirX: nx, dirY: ny,
            length: Math.min(a.range || 20, dist + 2), width: (a.width || 1) * 0.7,
            color: a.color, core: a.core || '#ffffff',
          });
          p.takeDamage((a.dmg || 100) * dmgScale * 0.6, { x: this.x, y: this.y });
          break;
        case 'burst':
        case 'vortex':
          Projectiles.spawnField({
            x: p.x, y: p.y, radius: (a.radius || 3) * 0.8, hostile: true,
            color: a.color, tell: 0.8, maxLife: 0.1,
            detonate: { dmg: (a.dmg || 80) * dmgScale, force: 0 },
          });
          break;
        case 'volley': {
          const n = Math.min(a.count || 3, 4);
          for (let i = 0; i < n; i++) {
            const ang = Math.atan2(ny, nx) + M.spread(a.spread || 0.2);
            Projectiles.spawnProjectile({
              x: this.x, y: this.y, z: sz,
              vx: Math.cos(ang) * (a.speed || 18) * 0.7,
              vy: Math.sin(ang) * (a.speed || 18) * 0.7,
              dmg: (a.dmg || 30) * dmgScale, radius: a.radius || 0.5,
              size: 0.4, color: a.color, core: a.core || '#ffffff',
              hostile: true, maxLife: 3,
            });
          }
          break;
        }
        default:
          Projectiles.spawnProjectile({
            x: this.x, y: this.y, z: sz,
            vx: nx * (a.speed || 18) * 0.7, vy: ny * (a.speed || 18) * 0.7,
            dmg: (a.dmg || 50) * dmgScale, radius: a.radius || 0.5,
            size: 0.45, color: a.color, core: a.core || '#ffffff',
            hostile: true, maxLife: 3,
          });
      }
      Audio.SFX.cast(a.kind, a.color);
    }

    frame() { return 0; }
  }

  /* ------------------------------------------------------------------
     Shared render collection for any entity list.
     ------------------------------------------------------------------ */
  function collect(list, out, cam, shadows) {
    for (const e of list) {
      if (e.dead && e.deathT > 0.8) continue;
      if (!Number.isFinite(e.x + e.y)) continue;   // never emit NaN draw data

      // Choose the baked view whose yaw matches how this creature is turned
      // relative to the camera. angleIndex 0 is "facing the viewer".
      const sh = e.sheet;
      if (cam && sh && sh.angles > 1) {
        const viewAng = Math.atan2(e.y - cam.y, e.x - cam.x);
        const yaw = M.wrapAngle((e.facing || 0) - viewAng + Math.PI);
        const step = M.TAU / sh.angles;
        const idx = ((Math.round(yaw / step) % sh.angles) + sh.angles) % sh.angles;
        // Hysteresis: a facing that drifts near a bucket boundary would
        // otherwise flip between two baked views every frame. Only switch
        // once the yaw has clearly left the current bucket (12% margin).
        if (e.angleIndex == null) {
          e.angleIndex = idx;
        } else if (idx !== e.angleIndex) {
          const fromCurrent = Math.abs(M.wrapAngle(yaw - e.angleIndex * step));
          if (fromCurrent > step * 0.62) e.angleIndex = idx;
        }
      } else {
        e.angleIndex = 0;
      }
      const dying = e.dead;
      const t = dying ? e.deathT / 0.8 : 0;
      // Shikigami rise out of the floor rather than popping in: scale up
      // from nothing over the first third of a second.
      const rise = e.spawnT != null ? M.smoothstep(e.spawnT) : 1;
      // Death: sink, shrink and fade.
      const sz = e.height * (dying ? 1 - t * 0.35 : 1) * rise;

      // A real shadow on the floor, not one painted into the billboard.
      if (shadows && !dying) {
        shadows.push({
          x: e.x, y: e.y,
          r: e.radius * 2.1 * rise,
          alpha: 0.55 * rise * (e.zOffset ? 0.55 : 1),
        });
      }
      out.push({
        x: e.x, y: e.y,
        z: (dying ? e.height * 0.5 * (1 - t * 0.5) : e.height * 0.5 * rise) + (e.zOffset || 0),
        size: sz,
        sheet: e.sheet,
        frame: e.frame ? e.frame() : 0,
        alpha: dying ? 1 - t : 1,
        tint: e.hurtFlash > 0.02 ? '#ffffff' : null,
        tintAmount: e.hurtFlash > 0.02 ? e.hurtFlash * 0.85 : 0,
        additive: false,
        entity: e,
      });
    }
  }

  /** Aura lights for entities that are winding up or burning. */
  function collectLights(list, out) {
    for (const e of list) {
      if (e.dead) continue;
      if (e.state === 'windup') {
        out.push({ x: e.x, y: e.y, color: e.glow, r: 2.6, intensity: 0.5 * M.clamp(e.stateT / (e.tell || 0.5), 0, 1) });
      } else if (e.burnTime > 0) {
        out.push({ x: e.x, y: e.y, color: '#ff6622', r: 2.0, intensity: 0.35 });
      }
    }
  }

  JJK.Entities = { Entity, Curse, Ally, Opponent, TIERS, collect, collectLights };
  void PostFX;
})(window.JJK);
