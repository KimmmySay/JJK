/* ==========================================================================
   WAVE DIRECTOR — spawning, pacing, arena rotation, mode rules.

   Enemies trickle in rather than popping in all at once: a wave has a budget
   and a spawn cadence, so pressure builds instead of arriving as a wall.
   Spawn points are always chosen out of your view and away from you, so
   nothing materialises in your face.

   Modes:
     story    wave ladder + character unlocks, arena rotates every 5 waves
     endless  everything unlocked, chosen arena, waves forever
     battle   no waves; N AI sorcerers, last one standing
   ========================================================================== */

(function (JJK) {
  'use strict';

  const { M, Entities, Audio, Particles } = JJK;

  const Director = {
    wave: 0,
    pending: 0,          // enemies still to spawn this wave
    spawnTimer: 0,
    intermission: 0,
    active: false,
    bossPending: null,
  };

  function reset() {
    Director.wave = 0;
    Director.pending = 0;
    Director.spawnTimer = 0;
    Director.intermission = 0;
    Director.active = false;
    Director.bossPending = null;
  }

  /** Enemy count and tier mix for a wave. */
  function waveComposition(wave) {
    const total = Math.min(6 + Math.floor(wave * 1.7), 26);
    const mix = { weak: 0, medium: 0, strong: 0, special: 0 };
    for (let i = 0; i < total; i++) {
      const r = Math.random();
      if (wave < 3) mix.weak++;
      else if (wave < 7) { if (r < 0.68) mix.weak++; else mix.medium++; }
      else if (wave < 13) { if (r < 0.45) mix.weak++; else if (r < 0.85) mix.medium++; else mix.strong++; }
      else if (wave < 22) { if (r < 0.28) mix.weak++; else if (r < 0.68) mix.medium++; else if (r < 0.94) mix.strong++; else mix.special++; }
      else { if (r < 0.15) mix.weak++; else if (r < 0.5) mix.medium++; else if (r < 0.85) mix.strong++; else mix.special++; }
    }
    return mix;
  }

  /** HP/damage scaling with wave. */
  function waveScale(wave) {
    return 1 + (wave - 1) * 0.11;
  }

  function startWave(G, wave) {
    Director.wave = wave;
    G.wave = wave;
    G.waveScale = waveScale(wave);

    // Roll a rule change for this wave and announce it up front.
    Director.mod = JJK.rollModifier ? JJK.rollModifier(wave) : null;
    G.mod = Director.mod;
    // Blackout thickens the fog; everything else is entity-side.
    JJK.Renderer.setDomainTheme(Director.mod && Director.mod.fogMult
      ? { fogDensity: (G.level.theme.fogDensity || 0.05) * Director.mod.fogMult }
      : null);

    const mix = waveComposition(wave);
    Director.queue = [];
    for (const tier of ['special', 'strong', 'medium', 'weak']) {
      for (let i = 0; i < mix[tier]; i++) Director.queue.push(tier);
    }
    // Swarm-style modifiers change how many turn up.
    const cm = Director.mod && Director.mod.countMult;
    if (cm && cm !== 1) {
      const extra = Math.round(Director.queue.length * (cm - 1));
      for (let i = 0; i < extra; i++) Director.queue.push(M.pick(Director.queue));
    }
    // Special Grade bumps every curse a tier.
    if (Director.mod && Director.mod.tierBump) {
      const up = { weak: 'medium', medium: 'strong', strong: 'special', special: 'special' };
      Director.queue = Director.queue.map((t) => up[t] || t);
    }
    Director.queue = M.shuffled(Director.queue);
    Director.pending = Director.queue.length;
    Director.spawnTimer = 0.4;
    Director.active = true;

    // Boss waves.
    const bossId = JJK.bossForWave(wave);
    Director.bossPending = bossId;

    const lvl = G.level;
    const mod = Director.mod;
    if (mod) {
      G.banner(mod.name, mod.color, 2.4, `WAVE ${wave}  ·  ${mod.desc}`);
      JJK.PostFX.impact({ flash: 0.25, color: mod.color, lines: 0.5, linesColor: mod.color });
    } else {
      G.banner(`WAVE ${wave}`, lvl.theme.palette.default?.glow || '#a855f7', 1.6, lvl.name);
    }
    Audio.SFX.waveStart();
  }

  function spawnOne(G, tier) {
    const p = G.player;
    // Prefer a spawn node that's out of sight and at a sane distance.
    let best = null;
    const nodes = M.shuffled(G.map.enemySpawns);
    for (const n of nodes) {
      const d = M.dist(n.x, n.y, p.x, p.y);
      if (d < 6) continue;
      if (!G.map.lineOfSight(n.x, n.y, p.x, p.y)) { best = n; break; }
      if (!best && d > 10) best = n;
    }
    if (!best) best = G.map.randomOpenNear(p.x, p.y, 7, 60);
    if (!best) return;

    // Jitter so a node doesn't stack a column of enemies, then guarantee
    // the result actually fits this tier's body radius.
    const need = (Entities.TIERS[tier] || Entities.TIERS.weak).radius + 0.08;
    let sx = best.x + M.spread(0.8), sy = best.y + M.spread(0.8);
    if (!G.map.openRadius(sx, sy, need)) {
      const fixed = G.map.findOpenNear(best.x, best.y, need, 4);
      if (!fixed) return;
      sx = fixed.x; sy = fixed.y;
    }

    const e = new Entities.Curse(sx, sy, tier, G.waveScale);
    // Apply the wave's rule change to this body.
    const mod = Director.mod;
    if (mod) {
      if (mod.healthMult) {
        e.maxHealth = Math.max(1, Math.round(e.maxHealth * mod.healthMult));
        e.health = e.maxHealth;
      }
      if (mod.speedMult) e.speed *= mod.speedMult;
      if (mod.damageMult) e.damage *= mod.damageMult;
      if (mod.tellMult) e.tell *= mod.tellMult;
      if (mod.scoreMult) e.score = Math.round(e.score * mod.scoreMult);
    }
    G.enemies.push(e);
    Particles.burst(sx, sy, 0.6, {
      count: 10, color: e.glow, core: '#ffffff', speed: 3.5, size: 0.22, life: 0.55,
    });
  }

  function spawnBoss(G, id) {
    const p = G.player;
    const def = JJK.BOSSES[id];
    // Clearance must be the BOSS's own radius, not a guessed constant.
    const need = def.radius + 0.15;

    let node = null;
    const nodes = M.shuffled(G.map.bossSpawns.concat(G.map.enemySpawns));
    for (const n of nodes) {
      if (M.dist(n.x, n.y, p.x, p.y) > 8 && G.map.openRadius(n.x, n.y, need)) { node = n; break; }
    }
    // Relax the distance rule before relaxing the clearance rule — spawning
    // a bit close is survivable, spawning inside a wall is not.
    if (!node) {
      for (const n of nodes) {
        const fixed = G.map.findOpenNear(n.x, n.y, need, 5);
        if (fixed && M.dist(fixed.x, fixed.y, p.x, p.y) > 5) { node = fixed; break; }
      }
    }
    if (!node) node = G.map.findOpenNear(p.x + 6, p.y, need, 12) || { x: p.x, y: p.y };

    const boss = new JJK.Boss(id, node.x, node.y, Director.wave);
    G.boss = boss;
    G.banner(def.name, def.color, 2.6, def.title);
    G.subtitle(def.intro, 3.0);
    Audio.SFX.bossSpawn();
    JJK.PostFX.impact({ shake: 1.2, flash: 0.4, color: def.color, ca: 0.7, ring: true, lines: 0.8, linesColor: def.color });
    Particles.burst(node.x, node.y, 1.2, {
      count: 40, color: def.color, core: '#ffffff', speed: 8, size: 0.35, life: 1.2,
    });
  }

  function update(G, dt) {
    if (G.mode === 'battle') return updateBattle(G, dt);

    // Between waves.
    if (Director.intermission > 0) {
      Director.intermission -= dt;
      if (Director.intermission <= 0) {
        const next = Director.wave + 1;
        // Arena rotation every 5 waves (story + endless-with-rotation).
        // Never rotate while a boss is still standing: loadLevel() clears
        // every entity, so an early rotation would delete the boss
        // mid-fight and the wave would silently resolve itself.
        if (G.rotateArenas && next > 1 && (next - 1) % 5 === 0 && !(G.boss && !G.boss.dead)) {
          G.loadLevel(JJK.levelForWave(next), true);
        }
        startWave(G, next);
      }
      return;
    }

    if (!Director.active) return;

    // Trickle spawns.
    if (Director.queue && Director.queue.length) {
      Director.spawnTimer -= dt;
      if (Director.spawnTimer <= 0) {
        const alive = G.enemies.filter((e) => !e.dead).length;
        const cap = 22;
        if (alive < cap) {
          spawnOne(G, Director.queue.shift());
          Director.pending = Director.queue.length;
          const rate = G.level.spawnRate || 1;
          Director.spawnTimer = M.rand(0.35, 0.85) / rate;
        } else {
          Director.spawnTimer = 0.4;
        }
      }
    }

    // Boss arrives once about half the wave is on the field.
    if (Director.bossPending && Director.queue.length <= Math.ceil(Director.pending * 0.4)) {
      const id = Director.bossPending;
      Director.bossPending = null;
      spawnBoss(G, id);
    }

    // Wave clear.
    const anyLeft = Director.queue.length > 0
      || G.enemies.some((e) => !e.dead)
      || (G.boss && !G.boss.dead);
    if (!anyLeft) {
      Director.active = false;
      Director.intermission = 3.2;
      G.player.addMana(30);
      G.player.heal(G.player.maxHealth * 0.12);
      JJK.Renderer.setDomainTheme(null);      // clear a blackout
      G.banner('WAVE CLEAR', '#66ffcc', 1.8, 'cursed energy restored');
      Audio.SFX.unlock();
      if (G.mode === 'story') G.checkUnlocks();
      // An upgrade every 3 waves, plus whatever a Bounty promised.
      const owed = Director.wave % 3 === 0 || (Director.mod && Director.mod.grantBoon);
      if (owed) G.offerBoons();
      Director.mod = null;
      G.mod = null;
    }
  }

  /* ---------------- battle mode ---------------- */
  function startBattle(G, opponentIds) {
    G.enemies.length = 0;
    G.boss = null;
    const p = G.player;
    const nodes = M.shuffled(G.map.enemySpawns.filter((n) => M.dist(n.x, n.y, p.x, p.y) > 7));
    opponentIds.forEach((id, i) => {
      const raw = nodes[i % Math.max(1, nodes.length)] || { x: p.x + 6, y: p.y };
      const n = G.map.findOpenNear(raw.x, raw.y, 0.5, 6) || raw;
      const o = new Entities.Opponent(n.x, n.y, id, G.difficulty || 1);
      G.enemies.push(o);
      Particles.burst(n.x, n.y, 1.0, {
        count: 22, color: o.color, core: '#ffffff', speed: 6, size: 0.3, life: 0.9,
      });
    });
    G.banner('BATTLE', '#ff4466', 2.0, `${opponentIds.length} opponent${opponentIds.length > 1 ? 's' : ''}`);
    Audio.SFX.bossSpawn();
    Director.active = true;
  }

  function updateBattle(G) {
    if (!Director.active) return;
    const left = G.enemies.filter((e) => !e.dead).length;
    if (left === 0) {
      Director.active = false;
      G.win('ALL OPPONENTS DOWN');
    }
  }

  JJK.Director = Object.assign(Director, {
    reset, startWave, update, startBattle, waveScale, waveComposition, spawnBoss,
  });
})(window.JJK);
