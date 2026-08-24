/* ==========================================================================
   GAME — state, main loop, and the glue between systems.

   Frame order matters and is deliberate:
     1. resolve hitstop / time scale   (a frozen frame still renders)
     2. input -> player                (so the camera is current before AI)
     3. AI + projectiles + particles
     4. domain tick
     5. build the sprite list, render, post, present, HUD

   HITSTOP is implemented as a near-zero time scale rather than a hard pause,
   so particles still creep and the freeze reads as impact rather than a
   dropped frame.
   ========================================================================== */

(function (JJK) {
  'use strict';

  const {
    M, Renderer, PostFX, Input, Audio, Particles, Projectiles,
    Entities, Director, Abilities, Player, Camera, GameMap, Art, Viewmodel,
  } = JJK;

  const G = {
    mode: 'story',
    running: false,
    paused: false,
    over: false,

    level: null, map: null, theme: null,
    cam: new Camera(),
    player: null,

    enemies: [], allies: [], timers: [],
    boss: null,
    flashLights: [],
    sprites: [], lights: [], shadows: [],

    wave: 0, waveScale: 1, difficulty: 1,
    rotateArenas: true,
    unlocked: null,

    hitstop: 0, timeScale: 1,
    time: 0, navStamp: 0, navTimer: 0,

    domain: null,
    boonOffer: null,          // { options: [3], t }
    mod: null,
    bannerData: null, subtitleData: null,
    _targets: [],
  };

  /* ------------------------------------------------------------------
     Helpers used across systems
     ------------------------------------------------------------------ */
  G.targets = function () { return G._targets; };

  G.schedule = function (delay, fn) { G.timers.push({ t: delay, fn }); };

  G.banner = function (text, color, life, sub) {
    G.bannerData = { text, color: color || '#ffffff', t: 0, life: life || 1.6, sub: sub || '' };
  };
  G.subtitle = function (text, life) {
    G.subtitleData = { text, t: 0, life: life || 2.5 };
  };

  /* ------------------------------------------------------------------
     Level loading
     ------------------------------------------------------------------ */
  G.loadLevel = function (level, keepEntities) {
    // setLevel() clears any domain override itself, so nothing to reset here.
    G.level = level;
    G.theme = level.theme;
    G.map = new GameMap(level.map);
    Renderer.setLevel(level.theme, Art.sky);

    if (!keepEntities) {
      G.enemies.length = 0;
      G.allies.length = 0;
      G.boss = null;
      Projectiles.clear();
      Particles.clear();
    } else {
      // Arena change mid-run: carry the player, drop everything else.
      G.enemies.length = 0;
      G.allies.length = 0;
      G.boss = null;
      Projectiles.clear();
    }

    const s = G.map.playerSpawn;
    G.player.x = s.x; G.player.y = s.y;
    G.player.vx = 0; G.player.vy = 0;
    G.navStamp++;
    G.map.buildFlowField(G.player.x, G.player.y, G.navStamp);

    G.banner(level.name, level.theme.gridColor, 2.2, level.kanji + '  ·  ' + level.subtitle);
  };

  /* ------------------------------------------------------------------
     Start / stop
     ------------------------------------------------------------------ */
  G.start = function (opts) {
    G.mode = opts.mode;
    G.difficulty = opts.difficulty || 1;
    G.rotateArenas = opts.mode !== 'battle';
    G.over = false;
    G.paused = false;
    G.time = 0;
    G.hitstop = 0;
    G.timeScale = 1;
    G.timers.length = 0;
    G.flashLights.length = 0;
    G.domain = null;
    G.bannerData = null;
    G.subtitleData = null;

    PostFX.reset();
    Director.reset();

    G.player = new Player(opts.charId);
    G.unlocked = opts.unlocked || null;

    const level = opts.level || JJK.LEVELS[0];
    G.loadLevel(level, false);

    if (opts.mode === 'battle') {
      Director.startBattle(G, opts.opponents || ['gojo']);
    } else {
      Director.intermission = 2.0;
      G.wave = 0;
    }

    G.running = true;
    JJK.HUD.show(true);
    JJK.HUD.bindCharacter(G.player.char);
    last = performance.now();
    requestAnimationFrame(frame);
  };

  G.stop = function () {
    G.running = false;
    JJK.HUD.show(false);
    Input.exitLock();
  };

  G.gameOver = function (reason) {
    if (G.over) return;
    G.over = true;
    G.running = false;
    Audio.SFX.death();
    Input.exitLock();
    JJK.HUD.show(false);
    JJK.Menu.showGameOver({
      reason: reason || 'YOU DIED',
      wave: G.wave, kills: G.player.kills, score: G.player.score,
      char: G.player.char, mode: G.mode, win: false,
    });
  };

  G.win = function (reason) {
    if (G.over) return;
    G.over = true;
    G.running = false;
    Audio.SFX.unlock();
    Input.exitLock();
    JJK.HUD.show(false);
    JJK.Menu.showGameOver({
      reason: reason || 'VICTORY',
      wave: G.wave, kills: G.player.kills, score: G.player.score,
      char: G.player.char, mode: G.mode, win: true,
    });
  };

  /* ------------------------------------------------------------------
     Story unlocks
     ------------------------------------------------------------------ */
  G.checkUnlocks = function () {
    if (!G.unlocked) return;
    for (const u of JJK.UNLOCKS) {
      if (G.wave >= u.wave && !G.unlocked.has(u.id)) {
        G.unlocked.add(u.id);
        JJK.Menu.saveUnlocks(G.unlocked);
        const c = JJK.CHARACTERS[u.id];
        G.banner('UNLOCKED', c.color, 2.6, c.name);
        Audio.SFX.unlock();
        PostFX.impact({ flash: 0.3, color: c.color, lines: 0.6, linesColor: c.color });
      }
    }
  };

  /* ------------------------------------------------------------------
     In-run upgrades
     ------------------------------------------------------------------ */
  G.offerBoons = function () {
    const opts = JJK.rollBoons(G.player.charId, G.player.boons, 3);
    if (!opts.length) return;
    G.boonOffer = { options: opts, t: 0 };
    Audio.SFX.unlock();
    PostFX.impact({ flash: 0.22, color: '#ffd166' });
  };

  G.chooseBoon = function (i) {
    if (!G.boonOffer) return;
    const b = G.boonOffer.options[i];
    if (!b) return;
    G.boonOffer = null;
    G.player.addBoon(b);
    const col = (JJK.BOON_RARITY[b.rarity] || {}).color || '#ffd166';
    G.banner(b.name, col, 2.2, b.desc);
    Audio.SFX.unlock();
    PostFX.impact({ flash: 0.35, color: col, ring: true, lines: 0.7, linesColor: col });
    Particles.burst(G.player.x, G.player.y, 1.0, {
      count: 30, color: col, core: '#ffffff', speed: 5, size: 0.28, life: 1.0, gravity: -1,
    });
  };

  /* ------------------------------------------------------------------
     Domains
     ------------------------------------------------------------------ */
  G.openDomain = function (def, p, lifeMult) {
    const life = def.duration * (lifeMult || 1);
    G.domain = { def, t: 0, life };
    p.domainActive = def;
    p.domainTime = life;
    PostFX.openDomain(def);
    // Repaint the arena rather than covering it.
    if (def.landscape) Renderer.setDomainTheme(def.landscape);
    Audio.SFX.domain(true);
    G.banner(def.name, def.palette.b, 3.0, def.kanji);
    G.subtitle(def.caption, 3.4);
    // Slow-motion on the unfold, easing back over ~1.2s.
    G.timeScale = 0.35;
    G.schedule(0.9, () => { G.timeScale = 1; });

    if (def.rider.infiniteMana) p.infiniteMana = true;
    if (def.rider.jackpot) p.jackpot = def.duration;
    if (def.rider.regen) {
      p.applyBuff({ id: 'domain-regen', label: def.name, duration: life,
        color: def.palette.b, mods: { regen: def.rider.regen } });
    }
    if (def.rider.damage) {
      p.applyBuff({ id: 'domain-dmg', label: def.name, duration: life,
        color: def.palette.b, mods: { damage: def.rider.damage } });
    }
  };

  function updateDomain(dt) {
    const d = G.domain;
    if (!d) return;
    const p = G.player;
    d.t += dt;
    p.domainTime = Math.max(0, d.life - d.t);

    if (d.t >= d.life) {
      G.domain = null;
      p.domainActive = null;
      p.infiniteMana = false;
      Renderer.setDomainTheme(null);
      PostFX.closeDomain();
      Audio.SFX.domain(false);
      return;
    }

    const r = d.def.rider;
    d.tick = (d.tick || 0) - dt;
    if (d.tick <= 0) {
      d.tick = 0.25;
      for (const e of G.targets()) {
        // Toji is immune to domains — and so is anything flagged as such.
        if (e.domainImmune) continue;
        JJK.Combat.playerHit(p, e, d.def.dps * 0.25, {
          sourceId: 'domain:' + d.def.id,
          color: d.def.palette.b, noCrit: true,
          trueDamage: r.trueDamage, lifesteal: r.lifesteal,
        });
        if (r.stun) e.stun = Math.max(e.stun || 0, 0.4);
        if (r.slow) e.slow = Math.max(e.slow || 0, 0.4);
        if (r.burn) Projectiles.applyBurn(e, r.burn);
        if (r.executeBelow && e.health > 0 && e.health / e.maxHealth < r.executeBelow) {
          JJK.Combat.damage(e, e.health, { trueDamage: true, ignoreInvuln: true });
          if (e.dead) JJK.Combat.onKill(p, e);
          Particles.number(e.x, e.y, e.z + e.height, 'GUILTY', 'crit', d.def.palette.c);
        }
      }
      // Chimera Shadow Garden keeps producing shikigami.
      if (r.summon && G.allies.filter((a) => !a.dead).length < (r.maxSummons || 6)) {
        const ang = M.rand(0, M.TAU);
        const spot = G.map.findOpenNear(p.x + Math.cos(ang) * 2, p.y + Math.sin(ang) * 2, 0.45, 3);
        if (spot) G.allies.push(new Entities.Ally(spot.x, spot.y, r.summon, p, 8));
      }
    }
  }

  /* ------------------------------------------------------------------
     Input handling
     ------------------------------------------------------------------ */
  function handleInput() {
    const p = G.player;
    // While an upgrade is on offer the ability keys pick it instead. Uses
    // the keys already under your left hand, so no pointer-lock break.
    if (G.boonOffer) {
      if (Input.wasPressed('ab1')) G.chooseBoon(0);
      else if (Input.wasPressed('ab2')) G.chooseBoon(1);
      else if (Input.wasPressed('ab3')) G.chooseBoon(2);
      return;
    }
    if (Input.wasPressed('ab1')) Abilities.cast(G, p, 'j');
    if (Input.wasPressed('ab2')) Abilities.cast(G, p, 'k');
    if (Input.wasPressed('ab3')) Abilities.cast(G, p, 'l');
    if (Input.wasPressed('domain')) Abilities.cast(G, p, 'q');
    if (Input.wasPressed('rct')) Abilities.castRCT(G, p);
    if (Input.isDown('strike')) doStrike();
    if (Input.wasPressed('map')) JJK.HUD.toggleMap();
  }

  /** LMB: the basic cursed-energy strike that rolls Black Flash. */
  function doStrike() {
    const p = G.player;
    if (p.strikeCd > 0) return;
    p.strikeCd = 0.34;
    p.startSwing('punch');

    const dx = Math.cos(p.angle), dy = Math.sin(p.angle);
    const range = 3.0, arc = 1.0;
    let hit = false;
    for (const e of G.targets()) {
      const ex = e.x - p.x, ey = e.y - p.y;
      const d = Math.hypot(ex, ey);
      if (d > range + e.radius) continue;
      const dot = (ex * dx + ey * dy) / (d || 1);
      if (dot < Math.cos(arc / 2)) continue;
      JJK.Combat.playerHit(p, e, 42, {
        sourceId: 'strike', knock: 6,
        dirX: ex / (d || 1), dirY: ey / (d || 1),
        color: p.char.color,
      });
      hit = true;
    }
    Projectiles.spawnFx({
      x: p.x + dx * 1.7, y: p.y + dy * 1.7, z: 0.5 + p.z - 0.1,
      size: 1.3, sheet: JJK.SpriteBake.ring(p.char.color),
      maxLife: 0.16, grow: 1.8, alpha: hit ? 0.9 : 0.45,
    });
    if (!hit) {
      Particles.burst(p.x + dx * 1.6, p.y + dy * 1.6, 0.5 + p.z, {
        count: 4, color: p.char.color, speed: 2.5, size: 0.14, life: 0.22,
      });
    }
  }

  /* ------------------------------------------------------------------
     Update
     ------------------------------------------------------------------ */
  function update(dt) {
    G.time += dt;

    // Scheduled callbacks (multi-hit combos, delayed impacts).
    for (let i = G.timers.length - 1; i >= 0; i--) {
      const t = G.timers[i];
      t.t -= dt;
      if (t.t <= 0) { G.timers.splice(i, 1); try { t.fn(); } catch (e) { console.error(e); } }
    }

    const p = G.player;
    if (p.strikeCd > 0) p.strikeCd -= dt;

    // Rebuild the target cache once per frame.
    G._targets.length = 0;
    for (const e of G.enemies) if (!e.dead) G._targets.push(e);
    if (G.boss && !G.boss.dead) G._targets.push(G.boss);

    handleInput();
    p.noRegen = !!(G.mod && G.mod.noRegen);
    p.update(G, dt, true);

    if (p.dead) { G.gameOver('YOU DIED'); return; }

    // Reflect (Simple Domain / Red Scale).
    if (p.reflectPending) {
      const r = p.reflectPending;
      p.reflectPending = null;
      for (const e of G.targets()) {
        if (M.dist(e.x, e.y, r.x, r.y) < 1.2) {
          JJK.Combat.playerHit(p, e, r.amount, { sourceId: 'reflect', color: '#ffffff', noCrit: true });
        }
      }
    }

    // Navigation field, a few times a second.
    G.navTimer -= dt;
    if (G.navTimer <= 0) {
      G.navTimer = 0.22;
      G.navStamp++;
      G.map.buildFlowField(p.x, p.y, G.navStamp);
    }

    // Entities.
    for (const e of G.enemies) e.update(G, dt, G.enemies);
    for (const a of G.allies) a.update(G, dt, G.allies);
    if (G.boss) G.boss.update(G, dt);

    // Cull the dead once their dissolve has finished.
    for (let i = G.enemies.length - 1; i >= 0; i--) {
      if (G.enemies[i].dead && G.enemies[i].deathT > 0.85) G.enemies.splice(i, 1);
    }
    for (let i = G.allies.length - 1; i >= 0; i--) {
      if (G.allies[i].dead && G.allies[i].deathT > 0.85) G.allies.splice(i, 1);
    }
    if (G.boss && G.boss.dead && G.boss.deathT > 1.6) {
      if (!G.boss.rewarded) {
        G.boss.rewarded = true;
        p.addMana(G.boss.manaReward);
      }
      G.boss = null;
    }

    Projectiles.update(G, dt);
    Particles.update(dt);
    updateDomain(dt);
    Director.update(G, dt);

    // Transient lights.
    for (let i = G.flashLights.length - 1; i >= 0; i--) {
      const f = G.flashLights[i];
      f.t += dt;
      if (f.t >= f.life) G.flashLights.splice(i, 1);
    }

    // Banners.
    if (G.bannerData) {
      G.bannerData.t += dt;
      if (G.bannerData.t >= G.bannerData.life) G.bannerData = null;
    }
    if (G.subtitleData) {
      G.subtitleData.t += dt;
      if (G.subtitleData.t >= G.subtitleData.life) G.subtitleData = null;
    }
    if (G.boonOffer) G.boonOffer.t += dt;
    if (G.bossTell) {
      G.bossTell.t += dt;
      if (G.bossTell.t >= G.bossTell.life) G.bossTell = null;
    }
  }

  /* ------------------------------------------------------------------
     Render
     ------------------------------------------------------------------ */
  function buildScene(dt) {
    const sprites = G.sprites; sprites.length = 0;
    const lights = G.lights; lights.length = 0;
    const shadows = G.shadows; shadows.length = 0;

    // The camera is needed here so each creature can pick the baked view
    // matching how it is turned relative to the viewer.
    Entities.collect(G.enemies, sprites, G.cam, shadows);
    Entities.collect(G.allies, sprites, G.cam, shadows);
    if (G.boss) {
      Entities.collect([G.boss], sprites, G.cam, shadows);
      G.boss.collectMarker(sprites);
    }
    Projectiles.collect(sprites);
    Particles.collect(sprites);

    Entities.collectLights(G.enemies, lights);
    Projectiles.collectLights(lights);
    for (const f of G.flashLights) {
      lights.push({ x: f.x, y: f.y, color: f.color, r: f.r, intensity: f.intensity * (1 - f.t / f.life) });
    }
    // Static level lights.
    for (const L of G.map.lights) {
      lights.push({ x: L.x, y: L.y, color: G.theme.lightColor, r: 3.4, intensity: 0.75 });
    }
    // The player's own cursed energy lights the room a little.
    lights.push({
      x: G.player.x, y: G.player.y,
      color: G.player.char.glow,
      r: 2.8 + (G.player.zone > 0 ? 1.6 : 0),
      intensity: 0.30 + (G.player.infinity > 0 ? 0.4 : 0),
    });

    G.player.applyToCamera(G.cam);

    return { map: G.map, theme: G.theme, cam: G.cam, sprites, lights, shadows, dt };
  }

  function render(dt) {
    const scene = buildScene(dt);
    Renderer.render(scene);

    const ctx = Renderer.ctx;
    const W = Renderer.W, H = Renderer.H;

    // Domain overlay + speed lines, in world resolution.
    PostFX.world(ctx, W, H);

    // Viewmodel on top of the world, below the HUD.
    const p = G.player;
    Viewmodel.draw(ctx, W, H, {
      charId: p.charId, color: p.char.color, glow: p.char.glow,
      t: G.time,
      bobX: p.bobX, bobY: p.bobY, lean: p.roll * 8,
      swing: p.swing, swingType: p.swingType, swingParity: p.swingParity,
      charge: p.charge,
      zone: p.zone > 0 ? 1 : 0,
      domain: G.domain ? 1 : 0,
      hurt: M.clamp(p.landDip, 0, 1),
    });

    // Blit + screen-space post.
    const d = Renderer.displayCanvas;
    const dctx = d.getContext('2d');
    PostFX.present(dctx, Renderer.buf, d.width, d.height);
    PostFX.screen(dctx, d.width, d.height);

    JJK.HUD.draw(G, dctx, d.width, d.height);
  }

  /* ------------------------------------------------------------------
     Main loop
     ------------------------------------------------------------------ */
  let last = 0;

  function frame(ts) {
    if (!G.running) return;
    // Clamp BOTH ends. Capping the top handles alt-tab and slow frames; the
    // zero floor matters just as much, because a negative delta runs the
    // whole simulation backwards — cooldowns count up, timers never expire,
    // and the exp(-k*dt) damping terms overflow to Infinity and poison every
    // velocity in the level. A stale or mismatched timestamp origin is
    // enough to produce one.
    const raw = M.clamp((ts - last) / 1000, 0, 0.05);
    last = ts;

    PostFX.update(raw);

    if (G.paused) {
      render(raw);
      Input.endFrame();
      requestAnimationFrame(frame);
      return;
    }

    // Hitstop: near-freeze, not a hard pause.
    let dt;
    if (G.player && G.player.hitstop > 0) {
      G.player.hitstop = Math.max(0, G.player.hitstop - raw);
      PostFX.hitstop(1);
      dt = raw * 0.06;
    } else {
      dt = raw * G.timeScale;
    }

    try {
      update(dt);
    } catch (err) {
      console.error('update error', err);
    }

    if (!G.running) return;

    try {
      render(raw);
    } catch (err) {
      console.error('render error', err);
    }

    Input.endFrame();
    requestAnimationFrame(frame);
  }

  G.setPaused = function (v) {
    G.paused = v;
    if (v) JJK.Menu.showPause(); else JJK.Menu.hidePause();
  };

  JJK.G = G;
})(window.JJK);
