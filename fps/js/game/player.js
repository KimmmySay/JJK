/* ==========================================================================
   PLAYER — movement, camera feel, resources, buffs, passives.

   CAMERA FEEL is most of what makes an FPS read as good, so it gets real
   attention here rather than being a position + a yaw:
     - acceleration and friction, not instant velocity
     - figure-eight head bob scaled by actual speed
     - camera roll when strafing, and a counter-roll kick when hit
     - FOV widening on dash, easing back over ~0.4s
     - landing dip after a knockback

   PASSIVES are per-character and live here because they modify the player's
   own rules: Infinity nullifies damage while draining energy, Adaptation
   feeds the combat ledger, Choso regenerates, Toge pays HP to speak.
   ========================================================================== */

(function (JJK) {
  'use strict';

  const { M, Audio, PostFX, Particles } = JJK;

  const MAX_MANA = 100;

  /* Jump tuning. Solved so the arc peaks at ~0.32 world units in ~0.6s:
       peak = v^2 / 2g      airtime = 2v / g
     The eye sits at 0.5 + z, and walls are 1 unit tall, so the peak has to
     stay under ~0.45 or you'd see over the ceiling. */
  const JUMP_V = 2.6;
  const GRAVITY = 7.5;
  const MAX_JUMPS = 2;          // ground jump + one in the air
  const AIR_JUMP_V = 2.35;      // slightly weaker, still clears a 0.9 ledge

  class Player {
    constructor(charId) {
      this.setCharacter(charId);
      this.x = 2; this.y = 2; this.z = 0;
      this.vx = 0; this.vy = 0;
      this.vz = 0; this.grounded = true; this.airT = 0;
      this.jumpsLeft = MAX_JUMPS; this.groundZ = 0;
      this.angle = 0; this.pitch = 0;
      this.radius = 0.34;
      this.eyeZ = 0.5;

      this.kills = 0; this.score = 0;

      // Camera feel state.
      this.bobPhase = 0; this.bobX = 0; this.bobY = 0;
      this.roll = 0; this.rollTarget = 0;
      this.fov = 1; this.dashFov = 0;
      this.landDip = 0;

      // Viewmodel state.
      this.swing = 0; this.swingType = 'punch'; this.swingSpeed = 3.4;
      this.charge = 0;

      this.hitstop = 0;
    }

    setCharacter(charId) {
      const c = JJK.CHARACTERS[charId];
      this.charId = charId;
      this.char = c;
      this.maxHealth = c.health;
      this.health = c.health;
      this.maxMana = MAX_MANA;
      this.mana = MAX_MANA;
      this.cooldowns = { j: 0, k: 0, l: 0, q: 0 };
      this.cooldownMax = { j: 1, k: 1, l: 1, q: 1 };
      this.rctCd = 0;
      this.buffs = [];
      this.mods = this.baseMods();
      this.zone = 0;
      this.bfChain = 0;
      this.jackpot = 0;
      this.infinity = 0;
      this.infiniteMana = false;
      this.domainActive = null;
      this.domainTime = 0;
      this.dashCd = 0;
      this.invuln = 0;
      this.copyLabel = null; this.copyLabelT = 0;
      this.guaranteedCrit = false;
      this.dead = false;
      // In-run upgrades and the kill chain.
      this.boons = [];
      this.flags = Object.create(null);
      this.combo = 0; this.comboT = 0; this.comboBest = 0;
      this.usedRevive = false;
    }

    baseMods() {
      return {
        damage: 1, speed: 1, armor: 0, critBonus: 0,
        lifesteal: 0, regen: this.char.regen || 0,
        domainImmune: !!this.char.domainImmune, reflect: 0,
        maxHealth: 0,
      };
    }

    /* ---------------- boons ---------------- */
    addBoon(b) {
      this.boons.push(b);
      if (b.flags) for (const k of Object.keys(b.flags)) {
        // Multiplicative flags stack; additive ones sum.
        const v = b.flags[k];
        if (k === 'cdMult' || k === 'dashCd' || k === 'healthMult' || k === 'infinityDrain') {
          this.flags[k] = (this.flags[k] == null ? 1 : this.flags[k]) * v;
        } else if (typeof v === 'number') {
          this.flags[k] = (this.flags[k] || 0) + v;
        } else {
          this.flags[k] = v;
        }
      }
      this.recomputeMods();
      // Health boons should pay out immediately, not on next level-up.
      const cap = this.effectiveMaxHealth();
      if (cap > this.maxHealth) this.health += cap - this.maxHealth;
      this.maxHealth = cap;
      this.health = M.clamp(this.health, 1, cap);
    }

    /** Read a boon flag with a default. */
    flag(name, dflt) {
      const v = this.flags[name];
      return v == null ? (dflt == null ? 0 : dflt) : v;
    }

    effectiveMaxHealth() {
      return Math.max(50, Math.round(
        (this.char.health + (this.mods.maxHealth || 0)) * this.flag('healthMult', 1)));
    }

    /* ---------------- kill chain ---------------- */
    registerKill() {
      const gain = this.flag('comboGain', 1) || 1;
      this.combo += gain;
      this.comboBest = Math.max(this.comboBest, this.combo);
      this.comboT = 4.0;
      const tier = this.comboTier();
      if (tier !== this._lastTier) {
        this._lastTier = tier;
        if (tier > 0) {
          Audio.SFX.uiClick();
          PostFX.impact({ flash: 0.10 + tier * 0.04, color: this.char.glow });
        }
      }
    }
    comboTier() {
      const c = this.combo;
      return c >= 30 ? 4 : c >= 20 ? 3 : c >= 12 ? 2 : c >= 6 ? 1 : 0;
    }
    /** Damage multiplier from the current chain, capped so it can't run away. */
    comboDamage() {
      return 1 + Math.min(this.combo, 30) * 0.017;   // up to +51%
    }

    /* ---------------- resources ---------------- */
    heal(amount) {
      const before = this.health;
      this.health = Math.min(this.maxHealth, this.health + amount);
      return this.health - before;
    }
    addMana(amount) {
      this.mana = M.clamp(this.mana + amount, 0, this.maxMana);
    }

    takeDamage(amount, opts) {
      const o = opts || {};
      if (this.dead) return 0;
      if (this.invuln > 0 && !o.self) return 0;

      // Infinity: nothing reaches him while it holds.
      if (this.infinity > 0 && !o.self) {
        Particles.burst(this.x + M.spread(0.6), this.y + M.spread(0.6), 1.2, {
          count: 6, color: '#00ffff', core: '#ffffff', speed: 2, size: 0.16, life: 0.3,
        });
        PostFX.impact({ flash: 0.08, color: '#00ffff' });
        return 0;
      }

      let dmg = amount;
      // Being airborne genuinely dodges ground-based attacks — that is what
      // makes the jump a tool rather than decoration.
      if (o.ground && this.z > 0.12) dmg *= 0.3;
      // Lightfoot: airborne guard against everything, not just ground attacks.
      if (this.flag('airGuard', 0) && this.z > 0.12) dmg *= 0.3;
      if (!o.self) dmg *= (1 - M.clamp(this.mods.armor, -1, 0.9));
      dmg = Math.max(1, Math.round(dmg));
      this.health -= dmg;

      // Simple Domain / Flowing Red Scale style reflect.
      if (this.mods.reflect > 0 && o.x != null && !o.self) {
        // handled by the caller's entity list in game.js via reflectQueue
        this.reflectPending = { x: o.x, y: o.y, amount: dmg * this.mods.reflect };
      }

      if (!o.silent) {
        Audio.SFX.hurt();
        const rel = o.x != null ? M.wrapAngle(Math.atan2(o.y - this.y, o.x - this.x) - this.angle) : 0;
        PostFX.damageFrom(rel, dmg);
        this.landDip = Math.max(this.landDip, M.clamp(dmg / 90, 0.1, 0.7));
        this.roll += M.clamp(dmg / 400, 0.01, 0.09) * (Math.random() < 0.5 ? -1 : 1);
      }
      if (o.burn) { this.burn = o.burn; this.burnTime = 3; }
      if (o.stun) this.stunT = Math.max(this.stunT || 0, o.stun);

      if (this.health <= 0) {
        if (this.flag('revive', 0) && !this.usedRevive) {
          this.usedRevive = true;
          this.health = this.maxHealth * 0.4;
          this.invuln = 1.6;
          Audio.SFX.unlock();
          PostFX.impact({ flash: 0.9, color: '#66ffcc', ring: true, lines: 1, linesColor: '#66ffcc' });
          Particles.burst(this.x, this.y, 1.0, {
            count: 40, color: '#66ffcc', core: '#ffffff', speed: 6, size: 0.3, life: 1.2,
          });
          return dmg;
        }
        this.health = 0;
        this.dead = true;
      }
      return dmg;
    }

    /* ---------------- buffs ---------------- */
    applyBuff(b) {
      const existing = this.buffs.find((x) => x.id === b.id);
      if (existing) {
        if (b.stacking && b.stacking > 1) {
          existing.stacks = Math.min((existing.stacks || 1) + 1, b.stacking);
        }
        existing.t = 0;
        existing.duration = b.duration;
        return;
      }
      this.buffs.push(Object.assign({ t: 0, stacks: 1 }, b));
    }

    recomputeMods() {
      const m = this.baseMods();
      for (const b of this.buffs) {
        const s = b.stacks || 1;
        for (const k of Object.keys(b.mods || {})) {
          const v = b.mods[k];
          if (typeof v === 'boolean') { m[k] = m[k] || v; continue; }
          if (k === 'damage' || k === 'speed') m[k] *= Math.pow(v, s);
          else m[k] += v * s;
        }
      }
      this.mods = m;
    }

    startSwing(type) {
      this.swing = 0.001;
      this.swingType = type || 'punch';
      this.swingSpeed = type === 'beam' ? 2.2 : type === 'cast' ? 3.0 : 3.6;
      // Alternate lead hand so consecutive strikes aren't the same frame.
      this.swingParity = !this.swingParity;
    }

    /* ================================================================
       Update
       ================================================================ */
    update(G, dt, input) {
      if (this.dead) return;

      /* ---- timers ---- */
      const cdRate = 1 / this.flag('cdMult', 1);
      for (const k of ['j', 'k', 'l', 'q']) {
        if (this.cooldowns[k] > 0) this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt * cdRate);
      }
      if (this.rctCd > 0) this.rctCd -= dt;
      if (this.dashCd > 0) this.dashCd -= dt;

      // Kill chain decays if you stop pushing.
      if (this.combo > 0) {
        this.comboT -= dt * (this.flag('comboDecay', 1) || 1);
        if (this.comboT <= 0) { this.combo = 0; this._lastTier = 0; }
      }
      if (this.invuln > 0) this.invuln -= dt;
      if (this.copyLabelT > 0) this.copyLabelT -= dt;
      if (this.stunT > 0) this.stunT -= dt;

      if (this.zone > 0) {
        this.zone -= dt;
        if (this.zone <= 0) { this.zone = 0; PostFX.setZone(false); this.bfChain = 0; }
      }
      if (this.jackpot > 0) this.jackpot -= dt;

      // Burn ticking on the player.
      if (this.burnTime > 0) {
        this.burnTime -= dt;
        this.burnTick = (this.burnTick || 0) - dt;
        if (this.burnTick <= 0) {
          this.burnTick = 0.4;
          this.takeDamage(this.burn * 0.4, { silent: true, self: true });
        }
      }

      /* ---- buffs ---- */
      for (let i = this.buffs.length - 1; i >= 0; i--) {
        const b = this.buffs[i];
        b.t += dt;
        if (b.t >= b.duration) this.buffs.splice(i, 1);
      }
      this.recomputeMods();
      this.infiniteMana = this.buffs.some((b) => b.mods && b.mods.infiniteMana) || (this.domainActive && this.domainActive.rider.infiniteMana);

      /* ---- passives ---- */
      this.updatePassive(G, dt, input);

      /* ---- regen ---- */
      if (this.mods.regen > 0) this.heal(this.mods.regen * dt);
      // Cursed energy recovers slowly; physical characters don't need it.
      const manaRate = (this.char.blackFlash === 0 && this.char.boneCrush > 0 ? 8 : 4.2)
        * (this.flag('manaRate', 1) || 1);
      if (!this.infiniteMana && !this.noRegen) this.addMana(manaRate * dt);
      else this.mana = this.maxMana;

      /* ---- look ---- */
      if (input) {
        const m = JJK.Input.consumeMouse();
        this.angle = M.wrapAngle(this.angle + m.dx);
        const maxPitch = JJK.Renderer.H * 0.55;
        this.pitch = M.clamp(this.pitch - m.dy * JJK.Renderer.H * 0.55, -maxPitch, maxPitch);
      }

      /* ---- movement ---- */
      const ax = JJK.Input.moveAxis();
      const stunned = (this.stunT || 0) > 0 || (this.domainStun || 0) > 0;
      const zoneBonus = 1 + (this.zone > 0 ? this.flag('zoneBonus', 0.10) : 0);
      const speed = this.char.moveSpeed * (this.mods.speed || 1) *
        zoneBonus * (stunned ? 0 : 1);

      const fx = Math.cos(this.angle), fy = Math.sin(this.angle);
      const rx = -fy, ry = fx;
      let wishX = fx * ax.y + rx * ax.x;
      let wishY = fy * ax.y + ry * ax.x;
      const wl = Math.hypot(wishX, wishY);
      if (wl > 0.001) { wishX /= wl; wishY /= wl; }

      // Dash.
      if (JJK.Input.wasPressed('dash') && this.dashCd <= 0 && wl > 0.01) {
        this.dashCd = 1.4 * this.flag('dashCd', 1);
        this.vx += wishX * 16;
        this.vy += wishY * 16;
        this.dashFov = 1;
        this.invuln = Math.max(this.invuln, 0.18);
        PostFX.impact({ lines: 0.7, linesColor: this.char.glow });
        Audio.SFX.cast('buff');
        for (let i = 0; i < 5; i++) {
          Particles.burst(this.x, this.y, 0.8, { count: 2, color: this.char.color, speed: 2, size: 0.2, life: 0.3 });
        }
      }

      const accel = wl > 0.01 ? 44 : 0;
      this.vx += wishX * accel * dt;
      this.vy += wishY * accel * dt;

      // Friction, then clamp to the character's top speed.
      const fric = Math.exp(-9 * dt);
      this.vx *= fric; this.vy *= fric;
      const sp = Math.hypot(this.vx, this.vy);
      const cap = speed * 1.05;
      if (sp > cap && wl > 0.01) {
        const s = cap / sp;
        this.vx *= s; this.vy *= s;
      }

      G.map.moveSlide(this, this.vx * dt, this.vy * dt, this.radius);

      /* ---- jump / double jump / standing on blocks ---- */
      const ground = G.map.floorAt(this.x, this.y, this.radius);
      this.groundZ = ground;

      if (JJK.Input.wasPressed('jump') && !stunned && this.jumpsLeft > 0) {
        const first = this.grounded;
        this.vz = first ? JUMP_V : AIR_JUMP_V;
        this.jumpsLeft--;
        this.grounded = false;
        Audio.SFX.cast('buff');
        // The air jump gets its own burst so you can feel it fire.
        Particles.burst(this.x, this.y, this.z + 0.1, {
          count: first ? 8 : 14, color: this.char.color, core: '#ffffff',
          speed: first ? 2.5 : 4, size: 0.16, life: 0.32, gravity: 1.5,
        });
        if (!first) PostFX.impact({ lines: 0.35, linesColor: this.char.glow });
      }

      if (!this.grounded || this.z > ground + 0.001) {
        this.airT += dt;
        this.vz -= GRAVITY * dt;
        this.z += this.vz * dt;
        if (this.z <= ground) {
          // Landed — on the floor or on top of a block.
          const impact = -this.vz / JUMP_V;
          this.landDip = Math.max(this.landDip, M.clamp(impact, 0.12, 0.5));
          this.z = ground; this.vz = 0; this.grounded = true;
          this.jumpsLeft = MAX_JUMPS + this.flag('extraJump', 0);
          this.airT = 0;
          Audio.SFX.hit(0.5);
          Particles.burst(this.x, this.y, this.z + 0.08, {
            count: 10, color: '#8a8a9a', speed: 3, size: 0.14, life: 0.3, additive: false,
          });
        }
      } else {
        // Walked off a ledge: fall, and you keep only the air jump.
        if (this.z > ground + 0.001) {
          this.grounded = false;
          if (this.jumpsLeft === MAX_JUMPS) this.jumpsLeft = MAX_JUMPS - 1;
        } else {
          this.z = ground;
          this.grounded = true;
          this.jumpsLeft = MAX_JUMPS + this.flag('extraJump', 0);
        }
      }

      /* ---- camera feel ---- */
      // Head bob only makes sense with feet on the floor.
      const moving = sp > 0.4 && this.grounded;
      this.bobPhase += dt * (6.5 + sp * 1.1);
      const bobAmt = M.clamp(sp / Math.max(0.5, speed), 0, 1);
      // Figure-eight: horizontal at half the vertical frequency.
      this.bobX = M.damp(this.bobX, moving ? Math.sin(this.bobPhase) * bobAmt : 0, 12, dt);
      this.bobY = M.damp(this.bobY, moving ? Math.abs(Math.cos(this.bobPhase)) * bobAmt : 0, 12, dt);

      this.rollTarget = -ax.x * 0.035 * (moving ? 1 : 0.3);
      this.roll = M.damp(this.roll, this.rollTarget, 8, dt);

      this.dashFov = Math.max(0, this.dashFov - dt * 2.6);
      this.landDip = Math.max(0, this.landDip - dt * 3.2);
      this.fov = 1 + this.dashFov * 0.16 + (this.zone > 0 ? 0.03 : 0);

      /* ---- viewmodel ---- */
      if (this.swing > 0) {
        this.swing += dt * this.swingSpeed;
        if (this.swing >= 1) this.swing = 0;
      }
      /* Charge glow.
         This used to idle at 0.12-0.35 permanently, which parked a large
         glowing orb in the middle of the screen at all times for every
         character — the same blob, just tinted differently. Energy belongs
         to an actual cast, so it now decays to nothing when idle and only
         builds during the wind-up of a swing. */
      const winding = this.swing > 0 && this.swing < 0.3;
      this.charge = M.damp(this.charge, winding ? 0.55 : 0, 9, dt);

      PostFX.setLowHealth(this.health / this.maxHealth);
    }

    /* ---------------- per-character passives ---------------- */
    updatePassive(G, dt, input) {
      const id = this.charId;
      const holding = input && JJK.Input.isDown('passive');

      // Infinity — Gojo and Full Power Gojo.
      if (id === 'gojo' || id === 'gojofull') {
        if (holding && this.mana > 0) {
          this.infinity = 1;
          this.mana = Math.max(0, this.mana - 16 * dt * this.flag('infinityDrain', 1));
          if (this.mana <= 0) this.infinity = 0;
        } else {
          this.infinity = 0;
        }
      } else {
        this.infinity = 0;
      }

      // Megumi / Meguna — recall shikigami to your side.
      if ((id === 'megumi' || id === 'meguna') && JJK.Input.wasPressed('passive')) {
        for (const a of G.allies) {
          if (a.dead) continue;
          const ang = M.rand(0, M.TAU);
          const nx = this.x + Math.cos(ang) * 1.4, ny = this.y + Math.sin(ang) * 1.4;
          if (G.map.openRadius(nx, ny, 0.4)) { a.x = nx; a.y = ny; }
          Particles.burst(a.x, a.y, 0.5, { count: 8, color: '#4a90d9', speed: 3, size: 0.2, life: 0.4 });
        }
        Audio.SFX.cast('summon');
      }

      // Mahoraga — its own wheel spins toward whatever is hurting it.
      if (id === 'mahoraga' && JJK.Input.wasPressed('passive')) {
        this.applyBuff({
          id: 'adaptation', label: 'ADAPTING', duration: 6, color: '#ffcc44',
          mods: { armor: 0.45 }, aura: true,
        });
        Audio.SFX.cast('buff');
      }

      // Toge — cursed speech tears his throat.
      if (this.throatDamage) {
        this.throatDamage = 0;
        Particles.burst(this.x, this.y, 1.4, { count: 6, color: '#aa2244', speed: 2, size: 0.14, life: 0.4 });
      }
    }

    /** Camera state handed to the renderer each frame. */
    applyToCamera(cam) {
      cam.x = this.x; cam.y = this.y;
      cam.angle = this.angle;
      const H = JJK.Renderer.H;
      cam.pitch = this.pitch;
      cam.bob = this.bobY * H * 0.014 + this.landDip * H * 0.05;
      cam.roll = this.roll;
      cam.fovMul = this.fov;
      cam.z = this.z;
    }
  }

  JJK.Player = Player;
  JJK.MAX_MANA = MAX_MANA;
})(window.JJK);
