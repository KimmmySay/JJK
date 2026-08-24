/* ==========================================================================
   BOSS — Special Grade encounter AI.

   The whole design is built around READABILITY. A boss picks an attack, then
   spends `tell` seconds committing to it with a visible wind-up: the sprite
   rears back, its aura swells, a warning marker is drawn in the world (a
   ground ring for AOE, a laser sight line for beams and charges). Only then
   does the attack resolve.

   That means every death is something you could have avoided, which is the
   difference between "hard" and "cheap".
   ========================================================================== */

(function (JJK) {
  'use strict';

  const { M, Art, SpriteBake, Combat, Particles, Projectiles, Audio, PostFX } = JJK;

  class Boss {
    constructor(id, x, y, wave) {
      const def = JJK.BOSSES[id];
      const sc = JJK.bossScaling(wave);

      this.uid = 900000 + Math.floor(Math.random() * 100000);
      this.def = def;
      this.id = id;
      this.x = x; this.y = y; this.z = 0;
      this.vx = 0; this.vy = 0;

      this.maxHealth = Math.round(def.health * sc.health);
      this.health = this.maxHealth;
      this.damageMult = sc.damage;
      this.speed = def.speed * sc.speed;
      this.radius = def.radius;
      this.height = def.height;
      this.score = def.score;
      this.manaReward = def.manaReward;
      this.color = def.color; this.glow = def.glow;

      this.sheet = Art.bosses[id];
      this.isCurseSheet = !!def.procedural;

      this.dead = false; this.deathT = 0; this.counted = false;
      this.hurtFlash = 0; this.lastHitTime = 99;
      this.stun = 0; this.slow = 0; this.burn = 0; this.burnTime = 0;
      this.marked = 0; this.nails = 0; this.invuln = 0;
      this.armor = 0.12;
      this.heavy = true;              // immune to knockback
      this.knockResist = 1;
      this.faction = 'enemy';

      this.state = 'approach'; this.stateT = 0;
      this.animT = 0;
      this.current = null;            // attack being wound up
      this.cooldowns = def.attacks.map(() => M.rand(1.2, 3.0));
      this.enrage = 0;
      this.marker = null;             // world telegraph
      /* Phases. A boss that runs the same rotation from 100% to 0% is an HP
         sponge; crossing a threshold should visibly change the fight. */
      this.phase = 0;
      this.phaseFlash = 0;
    }

    /** Cooldown / telegraph scaling for the current phase. */
    get phaseCd() { return this.phase === 0 ? 1 : this.phase === 1 ? 0.72 : 0.52; }
    get phaseTell() { return this.phase === 0 ? 1 : this.phase === 1 ? 0.85 : 0.7; }
    get phaseDmg() { return this.phase === 0 ? 1 : this.phase === 1 ? 1.18 : 1.4; }

    get alive() { return !this.dead; }

    setState(s) { if (this.state !== s) { this.state = s; this.stateT = 0; } }

    update(G, dt) {
      this.stateT += dt;
      this.animT += dt;
      this.lastHitTime += dt;
      this.hurtFlash = Math.max(0, this.hurtFlash - dt * 5);
      if (this.stun > 0) this.stun -= dt;
      if (this.invuln > 0) this.invuln -= dt;
      if (this.marked > 0) this.marked -= dt;
      if (this.enrage > 0) this.enrage -= dt;

      if (this.burnTime > 0) {
        this.burnTime -= dt;
        this.burnTick = (this.burnTick || 0) - dt;
        if (this.burnTick <= 0) {
          this.burnTick = 0.4;
          Combat.damage(this, this.burn * 0.4, { silent: true, trueDamage: true });
          if (this.dead) Combat.onKill(G.player, this);
        }
      }

      if (this.dead) { this.deathT += dt; this.marker = null; return; }

      /* Phase transitions at 60% and 30%. Brief invulnerability, a shockwave
         that clears space, then everything comes faster and hits harder. */
      const frac = this.health / this.maxHealth;
      const want = frac <= 0.30 ? 2 : frac <= 0.60 ? 1 : 0;
      if (want > this.phase) {
        this.phase = want;
        this.phaseFlash = 1;
        this.invuln = Math.max(this.invuln, 1.0);
        this.setState('recover');
        this.stateT = -0.5;                 // hold the pose a beat
        for (let i = 0; i < this.cooldowns.length; i++) this.cooldowns[i] = M.rand(0.3, 1.0);
        Projectiles.explode(G, this.x, this.y, this.height * 0.5,
          this.def.attacks[0].radius || 5.5, 28 * this.damageMult, {
            hostile: true, color: this.glow, ground: true,
          });
        PostFX.impact({
          shake: 1.4, flash: 0.5, color: this.color, ca: 0.8,
          ring: true, lines: 1, linesColor: this.glow,
        });
        Particles.burst(this.x, this.y, this.height * 0.5, {
          count: 46, color: this.color, core: '#ffffff', speed: 9, size: 0.34, life: 1.1,
        });
        Audio.SFX.bossSpawn();
        G.banner(this.phase === 1 ? 'ENRAGED' : 'FINAL STAND', this.color, 2.0, this.def.name);
        G.subtitle(this.phase === 1
          ? 'It stops holding back.'
          : 'It has nothing left to lose.', 2.4);
      }
      if (this.phaseFlash > 0) this.phaseFlash -= dt * 1.6;

      const cdRate = 1 / this.phaseCd;
      for (let i = 0; i < this.cooldowns.length; i++) this.cooldowns[i] -= dt * cdRate;

      const p = G.player;
      const dx = p.x - this.x, dy = p.y - this.y;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = dx / dist, ny = dy / dist;
      // A heavy body turns slowly, and you can see it line you up. During a
      // tell it locks on; otherwise it faces its travel direction.
      if (this.facing == null) this.facing = Math.atan2(dy, dx);
      const locked = this.state === 'tell' || this.state === 'charging';
      const mv = Math.hypot(this.vx, this.vy) > 0.4;
      const wantF = locked || !mv ? Math.atan2(dy, dx) : Math.atan2(this.vy, this.vx);
      this.facing = M.approachAngle(this.facing, wantF, (locked ? 3.4 : 2.2) * dt);

      if (this.stun > 0) { this.setState('stagger'); this.move(G, dt, 0, 0); return; }

      switch (this.state) {
        case 'tell': {
          const a = this.current;
          this.updateMarker(G, a, nx, ny, dist);
          if (this.stateT >= a.tell * this.phaseTell) {
            this.resolve(G, a, nx, ny, dist);
            // 'phase' puts itself into the 'phased' state inside resolve();
            // overwriting it here would cancel the invulnerability outright.
            if (this.state === 'tell') {
              this.setState(a.kind === 'charge' ? 'charging' : 'recover');
            }
          }
          this.move(G, dt, 0, 0);   // rooted while telegraphing
          break;
        }
        case 'charging': {
          const a = this.current;
          // Rush forward; damage anything caught, stop on a wall.
          const cd = this.chargeDir;
          const step = a.speed * dt;
          const before = { x: this.x, y: this.y };
          G.map.moveSlide(this, cd.x * step, cd.y * step, this.radius);
          const moved = M.dist(before.x, before.y, this.x, this.y);
          if (M.dist(this.x, this.y, p.x, p.y) < this.radius + p.radius + 0.6 && !this.chargeHit) {
            this.chargeHit = true;
            p.takeDamage(a.dmg * this.damageMult, { x: this.x, y: this.y });
            PostFX.impact({ shake: 0.9 });
          }
          Particles.burst(this.x, this.y, 0.6, { count: 2, color: a.color, speed: 2, size: 0.28, life: 0.35 });
          if (moved < step * 0.3 || this.stateT > 1.3) {
            this.chargeHit = false;
            this.setState('recover');
          }
          break;
        }
        case 'phased': {
          this.invuln = 0.1;
          if (this.stateT >= (this.current?.duration || 2)) {
            this.invuln = 0;
            this.setState('recover');
            Particles.burst(this.x, this.y, this.height * 0.5, {
              count: 18, color: this.glow, core: '#ffffff', speed: 5, size: 0.28, life: 0.5,
            });
          }
          break;
        }
        case 'recover': {
          if (this.stateT >= 0.55) this.setState('approach');
          this.move(G, dt, 0, 0);
          break;
        }
        case 'stagger': {
          if (this.stateT >= 0.4) this.setState('approach');
          this.move(G, dt, 0, 0);
          break;
        }
        default: {
          // Approach and look for something to throw.
          const pick = this.chooseAttack(G, dist);
          if (pick >= 0) {
            this.current = this.def.attacks[pick];
            this.cooldowns[pick] = this.current.cd * (this.enrage > 0 ? 0.6 : 1) * this.phaseCd;
            this.beginAttack(G, this.current, nx, ny, dist);
            break;
          }
          let mx = nx, my = ny;
          const hasLos = G.map.lineOfSight(this.x, this.y, p.x, p.y);
          if (!hasLos) {
            const f = G.map.flowDir(this.x, this.y, this.radius);
            if (f) { mx = f.x; my = f.y; }
          }
          // The flow field thinks in cells; this body has a radius. Deflect
          // around anything it would otherwise grind into.
          const steer = G.map.steerAround(this.x, this.y, mx, my, this.radius);
          mx = steer.x; my = steer.y;
          // Keep a little distance; bosses aren't melee-huggers except the
          // Bearer. But only hold range while the shot is actually there —
          // backing off with a wall in the way strands a ranged boss behind
          // cover where every attack fails its line-of-sight check and it
          // just paces. No sight line means close in, always.
          const want = this.def.attacks.some((a) => a.kind === 'melee') ? 2.2 : 5.5;
          const drive = !hasLos ? 1 : (dist > want ? 1 : -0.6);
          this.move(G, dt, mx * drive, my * drive);
          break;
        }
      }
    }

    move(G, dt, mx, my) {
      // Same escape hatch as Entity.physics — a boss wedged in geometry is
      // frozen forever, which reads as a broken encounter.
      if (!G.map.openRadius(this.x, this.y, this.radius)) {
        const spot = G.map.findOpenNear(this.x, this.y, this.radius, 4, true);
        if (spot) { this.x = spot.x; this.y = spot.y; this.vx = 0; this.vy = 0; }
      }
      const sp = this.speed * (this.enrage > 0 ? (this.current?.speedMult || 1.5) : 1)
        * (1 + this.phase * 0.16) * (this.slow > 0 ? 0.5 : 1);
      this.vx += mx * sp * 9 * dt;
      this.vy += my * sp * 9 * dt;
      const damp = Math.exp(-7 * dt);
      G.map.moveSlide(this, this.vx * dt, this.vy * dt, this.radius);
      this.vx *= damp; this.vy *= damp;
    }

    chooseAttack(G, dist) {
      const opts = [];
      for (let i = 0; i < this.def.attacks.length; i++) {
        if (this.cooldowns[i] > 0) continue;
        const a = this.def.attacks[i];
        if (a.kind === 'melee' && dist > (a.range || 3) + 1.5) continue;
        if (a.kind === 'charge' && (dist > (a.range || 12) || dist < 2.5)) continue;
        if (a.kind !== 'melee' && a.kind !== 'charge' &&
            !G.map.lineOfSight(this.x, this.y, G.player.x, G.player.y)) continue;
        opts.push(i);
      }
      if (!opts.length) return -1;
      return M.pick(opts);
    }

    beginAttack(G, a, nx, ny) {
      this.setState('tell');
      this.chargeDir = { x: nx, y: ny };
      Audio.SFX.cast(a.kind === 'beam' ? 'beam' : 'burst', a.color);
      G.bossTell = { name: a.name, t: 0, life: a.tell, color: a.color };
    }

    /** Live warning drawn in the world during the tell. */
    updateMarker(G, a, nx, ny, dist) {
      const f = M.clamp(this.stateT / (a.tell * this.phaseTell), 0, 1);
      switch (a.kind) {
        case 'groundAoe':
          if (!this.markerLocked) {
            // Locks onto where you were when the tell began - move and it misses.
            this.markerLocked = { x: G.player.x, y: G.player.y };
          }
          this.marker = { type: 'ring', x: this.markerLocked.x, y: this.markerLocked.y, r: a.radius, f, color: a.color };
          break;
        case 'shockwave':
        case 'pull':
          this.marker = { type: 'ring', x: this.x, y: this.y, r: a.radius, f, color: a.color };
          break;
        case 'beam':
        case 'charge':
          this.marker = { type: 'line', x: this.x, y: this.y, dx: nx, dy: ny,
            len: Math.min(a.range || 20, 26), f, color: a.color };
          this.chargeDir = { x: nx, y: ny };
          break;
        default:
          this.marker = { type: 'aura', x: this.x, y: this.y, r: 1.4, f, color: a.color };
      }
      void dist;
    }

    resolve(G, a, nx, ny, dist) {
      const p = G.player;
      const sz = this.z + this.height * 0.55;
      const dmg = (a.dmg || 0) * this.damageMult * this.phaseDmg;
      this.marker = null;
      this.markerLocked = null;

      switch (a.kind) {
        case 'volley': {
          const base = Math.atan2(ny, nx);
          for (let i = 0; i < a.count; i++) {
            const off = a.count === 1 ? 0 : ((i / (a.count - 1)) - 0.5) * a.spread * 2;
            const ang = base + off;
            Projectiles.spawnProjectile({
              x: this.x, y: this.y, z: sz,
              vx: Math.cos(ang) * a.speed, vy: Math.sin(ang) * a.speed,
              dmg, radius: 0.45, size: 0.45,
              color: a.color, core: '#ffffff', hostile: true,
              homing: a.homing || 0, burn: a.burn, maxLife: 4,
            });
          }
          break;
        }
        case 'aimed':
          Projectiles.spawnProjectile({
            x: this.x, y: this.y, z: sz,
            vx: nx * a.speed, vy: ny * a.speed,
            dmg, radius: a.radius || 0.6, size: 0.6,
            color: a.color, core: '#ffffff', hostile: true, maxLife: 4,
          });
          break;
        case 'beam': {
          const len = JJK.Abilities.clampToWall(G, this.x, this.y, nx, ny, a.range, 0.1);
          Projectiles.spawnBeam({
            x: this.x, y: this.y, z: sz, dirX: nx, dirY: ny,
            length: len, width: a.width, color: a.color, core: '#ffffff', maxLife: 0.5,
          });
          const r = JJK.Abilities.rayPointDist(this.x, this.y, nx, ny, p.x, p.y);
          if (r.along > 0 && r.along < len && r.perp < a.width / 2 + p.radius) {
            p.takeDamage(dmg, { x: this.x, y: this.y, burn: a.burn });
          }
          PostFX.impact({ shake: 0.7, ca: 0.4 });
          break;
        }
        case 'groundAoe': {
          const t = this.markerLocked || { x: p.x, y: p.y };
          Projectiles.explode(G, t.x, t.y, 0.5, a.radius, dmg, {
            hostile: true, color: a.color, burn: a.burn, ground: true,
          });
          if (a.manaDrain) p.mana = Math.max(0, p.mana - a.manaDrain);
          if (a.lifesteal && M.dist(t.x, t.y, p.x, p.y) < a.radius) {
            // Heal directly. Routing this through Combat.damage() with a
            // negative amount does NOT heal — damage() floors at 1, so the
            // boss would chip itself instead of draining you.
            this.health = Math.min(this.maxHealth, this.health + dmg * a.lifesteal);
          }
          PostFX.impact({ shake: a.shake || 0.8 });
          break;
        }
        case 'shockwave': {
          Projectiles.explode(G, this.x, this.y, 0.6, a.radius, dmg, {
            hostile: true, color: a.color, ground: true,
          });
          if (M.dist(this.x, this.y, p.x, p.y) < a.radius) {
            const d = M.dist(this.x, this.y, p.x, p.y) || 1;
            p.vx += ((p.x - this.x) / d) * (a.force || 10);
            p.vy += ((p.y - this.y) / d) * (a.force || 10);
            if (a.stun) p.stunT = Math.max(p.stunT || 0, a.stun);
          }
          PostFX.impact({ shake: a.shake || 1.0, ring: true, color: a.color });
          break;
        }
        case 'melee':
          if (dist < (a.range || 3) + p.radius) {
            p.takeDamage(dmg, { x: this.x, y: this.y });
            p.vx += nx * (a.force || 10);
            p.vy += ny * (a.force || 10);
          }
          Particles.burst(this.x + nx * 1.5, this.y + ny * 1.5, 1.0, {
            count: 14, color: a.color, speed: 6, size: 0.24, life: 0.4,
          });
          break;
        case 'summon':
          for (let i = 0; i < a.count; i++) {
            const ang = (i / a.count) * M.TAU;
            const spot = G.map.findOpenNear(this.x + Math.cos(ang) * 1.8, this.y + Math.sin(ang) * 1.8, 0.55, 3);
            if (!spot) continue;
            const c = new JJK.Entities.Curse(spot.x, spot.y, 'medium', G.waveScale);
            G.enemies.push(c);
            Particles.burst(spot.x, spot.y, 0.6, { count: 10, color: a.color, speed: 4, size: 0.22, life: 0.5 });
          }
          break;
        case 'pull':
          Projectiles.spawnField({
            x: this.x, y: this.y, radius: a.radius, force: a.force,
            dps: a.dps * this.damageMult, maxLife: a.duration,
            hostile: true, color: a.color,
          });
          break;
        case 'phase':
          this.setState('phased');
          this.invuln = a.duration;
          Particles.burst(this.x, this.y, this.height * 0.5, {
            count: 20, color: a.color, core: '#ffffff', speed: 4, size: 0.3, life: 0.6,
          });
          return;
        case 'enrage':
          this.enrage = a.duration;
          this.damageMult *= 1.0;    // multiplier applied via a.damageMult below
          this.enrageDamage = a.damageMult || 1.3;
          Particles.burst(this.x, this.y, this.height * 0.5, {
            count: 30, color: a.color, core: '#ffffff', speed: 6, size: 0.3, life: 0.9,
          });
          PostFX.impact({ shake: 1.0, flash: 0.3, color: a.color, ring: true });
          Audio.SFX.bossSpawn();
          break;
        default: break;
      }
    }

    frame() {
      const sh = this.sheet;
      if (!sh || (sh.poses || 1) <= 1) return 0;
      // Map boss states onto the shared pose vocabulary.
      const st = this.state === 'tell' ? 'windup'
        : (this.state === 'charging' || this.state === 'recover') ? 'strike'
          : this.state === 'stagger' ? 'stagger' : 'approach';
      const pose = SpriteBake.poseIndex(
        sh, st, this.stateT, this.current?.tell || 1, this.animT, 6);
      return (this.angleIndex || 0) * (sh.poses || 1) + pose;
    }

    /** Telegraph markers, appended to the sprite list. */
    collectMarker(out) {
      const m = this.marker;
      if (!m) return;
      const pulse = 0.35 + 0.65 * Math.abs(Math.sin(m.f * 14));
      if (m.type === 'ring') {
        out.push({
          x: m.x, y: m.y, z: 0.08, size: m.r * 2,
          sheet: JJK.SpriteBake.ring(m.color), frame: 0,
          alpha: 0.35 + 0.5 * pulse, additive: true, tintAmount: 0,
        });
      } else if (m.type === 'line') {
        const steps = 14;
        const sheet = JJK.SpriteBake.orb(m.color, '#ffffff');
        for (let i = 1; i <= steps; i++) {
          const f = i / steps;
          out.push({
            x: m.x + m.dx * m.len * f, y: m.y + m.dy * m.len * f, z: 0.12,
            size: 0.35, sheet, frame: 0,
            alpha: 0.28 * pulse * (1 - f * 0.5), additive: true, tintAmount: 0,
          });
        }
      } else {
        out.push({
          x: m.x, y: m.y, z: this.height * 0.5, size: m.r * 2 * (0.8 + m.f * 0.5),
          sheet: JJK.SpriteBake.orb(m.color, '#ffffff'), frame: 0,
          alpha: 0.25 * pulse, additive: true, tintAmount: 0,
        });
      }
    }
  }

  JJK.Boss = Boss;
})(window.JJK);
