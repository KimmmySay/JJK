/* ==========================================================================
   MENU — screen flow, roster UI, battle setup, overlays, persistence.

   Flow:
     title -> charSelect -> (story: play)
                         -> (endless: levelSelect -> play)
                         -> (battle: battleSetup -> play)
   ========================================================================== */

(function (JJK) {
  'use strict';

  const { M, CHARACTERS, ROSTER_ORDER, UNLOCKS, LEVELS, SPRITES, Audio } = JJK;

  const SAVE_KEY = 'jjk-fps-save-v1';

  const Menu = {
    mode: 'story',
    charId: null,
    levelId: null,
    opponents: [null],
    opponentCount: 1,
    armedSlot: -1,
    difficulty: 1,
    unlocked: new Set(['yuji']),
    settings: { sens: 1, quality: 0.62, volume: 0.55, invertY: false },
    best: { wave: 0, score: 0 },
  };

  const $ = (id) => document.getElementById(id);
  const screens = ['loading', 'title', 'charSelect', 'levelSelect', 'battleSetup'];
  const overlays = ['pause', 'gameOver', 'controls', 'settings'];

  // Low-res portrait sources (128px pixel art) get nearest-neighbor scaling
  // wherever they appear. Image load events don't bubble, so listen in the
  // capture phase — this covers every roster/battle card, present and future.
  document.addEventListener('load', (e) => {
    const img = e.target;
    if (img.tagName === 'IMG' && img.closest('.char-card, .opp-slot')) {
      img.classList.toggle('pixel-art', img.naturalWidth <= 256);
    }
  }, true);

  /* ---------------- persistence ---------------- */
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (Array.isArray(d.unlocked)) Menu.unlocked = new Set(d.unlocked);
      if (d.settings) Object.assign(Menu.settings, d.settings);
      if (d.best) Object.assign(Menu.best, d.best);
    } catch (e) { /* corrupt save is not fatal — start fresh */ }
    Menu.unlocked.add('yuji');
  }
  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        unlocked: Array.from(Menu.unlocked),
        settings: Menu.settings,
        best: Menu.best,
      }));
    } catch (e) { /* private browsing — settings just won't persist */ }
  }
  function saveUnlocks(set) { Menu.unlocked = new Set(set); save(); }

  /* ---------------- screen switching ---------------- */
  function showScreen(id) {
    for (const s of screens) $(s)?.classList.toggle('active', s === id);
    document.body.classList.add('menu-open');
    if (id === 'charSelect') buildCharGrid();
    if (id === 'levelSelect') buildLevelGrid();
    if (id === 'battleSetup') buildBattleSetup();
  }
  function hideScreens() {
    for (const s of screens) $(s)?.classList.remove('active');
    document.body.classList.remove('menu-open');
  }
  function showOverlay(id) { $(id)?.classList.add('active'); document.body.classList.add('menu-open'); }
  function hideOverlay(id) {
    $(id)?.classList.remove('active');
    if (!overlays.some((o) => $(o)?.classList.contains('active')) &&
        !screens.some((s) => $(s)?.classList.contains('active'))) {
      document.body.classList.remove('menu-open');
    }
  }

  /* ---------------- unlock helpers ---------------- */
  function isUnlocked(id) {
    if (Menu.mode !== 'story') return true;
    return Menu.unlocked.has(id);
  }
  function unlockWave(id) {
    const u = UNLOCKS.find((x) => x.id === id);
    return u ? u.wave : 0;
  }

  /* ---------------- character grid ---------------- */
  function buildCharGrid() {
    const grid = $('charGrid');
    grid.innerHTML = '';
    $('selMode').textContent = Menu.mode.toUpperCase();

    for (const id of ROSTER_ORDER) {
      const c = CHARACTERS[id];
      if (!c) continue;
      const unlocked = isUnlocked(id);
      const card = document.createElement('button');
      card.className = 'char-card' + (unlocked ? '' : ' locked');
      card.dataset.char = id;
      card.innerHTML = `
        <img src="${SPRITES.PORTRAITS[id]}" alt="${c.name}" loading="lazy">
        <span class="cc-role">${c.role}</span>
        <span class="cc-name">${c.short.toUpperCase()}</span>
        <span class="cc-kanji">${c.kanji}</span>
        ${unlocked ? '' : `<span class="cc-lock">🔒<small>WAVE ${unlockWave(id)}</small></span>`}
      `;
      if (unlocked) {
        card.addEventListener('click', () => selectChar(id));
        card.addEventListener('mouseenter', () => Audio.SFX.uiHover());
      }
      grid.appendChild(card);
    }

    // Keep or reset the current pick.
    if (Menu.charId && isUnlocked(Menu.charId)) selectChar(Menu.charId);
    else selectChar(Menu.mode === 'story' ? 'yuji' : ROSTER_ORDER[0]);
  }

  function selectChar(id) {
    if (!isUnlocked(id)) return;
    Menu.charId = id;
    Audio.SFX.uiClick();
    for (const el of document.querySelectorAll('#charGrid .char-card')) {
      el.classList.toggle('selected', el.dataset.char === id);
    }
    renderCharInfo(id);
    $('btnDeploy').disabled = false;
  }

  const KIND_LABEL = {
    melee: 'MELEE', projectile: 'PROJECTILE', volley: 'VOLLEY', beam: 'BEAM',
    burst: 'AOE', vortex: 'FIELD', summon: 'SUMMON', buff: 'BUFF',
    blink: 'BLINK', domain: 'DOMAIN', copy: 'COPY', gamble: 'GAMBLE',
    resonance: 'DETONATE',
  };

  function renderCharInfo(id) {
    const c = CHARACTERS[id];
    const panel = $('charInfo');
    panel.style.setProperty('--accent-c', c.color);

    const ciImg = $('ciImg');
    ciImg.onload = () => ciImg.classList.toggle('pixel-art', ciImg.naturalWidth <= 256);
    ciImg.src = SPRITES.PORTRAITS[id];
    ciImg.alt = c.name;
    $('ciName').textContent = c.name;
    $('ciKanji').textContent = c.kanji;
    $('ciRole').textContent = c.role;
    $('ciBlurb').textContent = c.blurb;

    const pct = (v, max) => Math.round(M.clamp(v / max, 0, 1) * 100);
    $('stHp').style.width = pct(c.health, 800) + '%';
    $('stHpV').textContent = c.health;
    $('stSp').style.width = pct(c.speed, 12) + '%';
    $('stSpV').textContent = c.speed;

    const physical = c.boneCrush > 0;
    $('stCritLabel').textContent = physical ? 'BONE CRUSH' : 'BLACK FLASH';
    const crit = physical ? c.boneCrush : c.blackFlash;
    $('stCrit').style.width = pct(crit, 0.25) + '%';
    $('stCritV').textContent = crit > 0 ? Math.round(crit * 100) + '%' : '—';

    const keys = { j: 'Q', k: 'E', l: 'C', q: 'X' };
    $('ciAbilities').innerHTML = ['j', 'k', 'l', 'q'].map((s) => {
      const a = c.abilities[s];
      const cost = a.cost > 0 ? `${a.cost} CE` : 'FREE';
      return `<div class="ab-row">
        <span class="ab-key">${keys[s]}</span>
        <span class="ab-name">${a.name}</span>
        <span class="ab-meta">${cost}<span class="ab-kind">${KIND_LABEL[a.kind] || a.kind}</span></span>
      </div>`;
    }).join('');

    $('ciPassive').textContent = c.passive;
  }

  /* ---------------- arena grid ---------------- */
  function buildLevelGrid() {
    const grid = $('levelGrid');
    grid.innerHTML = '';
    for (const lvl of LEVELS) {
      const card = document.createElement('button');
      card.className = 'level-card';
      card.dataset.level = lvl.id;
      const bossNames = lvl.bosses.map((b) => JJK.BOSSES[b]?.name || b).join(' · ');
      card.innerHTML = `
        <span class="lc-swatch" style="background:linear-gradient(90deg, ${lvl.theme.gridColor}, ${lvl.theme.moteColor})"></span>
        <span class="lc-kanji">${lvl.kanji}</span>
        <span class="lc-name">${lvl.name}</span>
        <span class="lc-sub">${lvl.subtitle}</span>
        <span class="lc-boss">▲ ${bossNames}</span>
      `;
      card.appendChild(miniMapSvg(lvl));
      card.addEventListener('click', () => {
        Menu.levelId = lvl.id;
        Audio.SFX.uiClick();
        for (const el of grid.children) el.classList.toggle('selected', el.dataset.level === lvl.id);
        $('btnLevelStart').disabled = false;
      });
      card.addEventListener('mouseenter', () => Audio.SFX.uiHover());
      grid.appendChild(card);
    }
    if (Menu.levelId) {
      const el = grid.querySelector(`[data-level="${Menu.levelId}"]`);
      if (el) { el.classList.add('selected'); $('btnLevelStart').disabled = false; }
    }
  }

  /** Tiny SVG floorplan so each arena is visually distinguishable up front. */
  function miniMapSvg(lvl) {
    const rows = lvl.map;
    const w = rows[0].length, h = rows.length;
    const S = 2;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'lc-mini');
    svg.setAttribute('width', w * S);
    svg.setAttribute('height', h * S);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < rows[y].length; x++) {
        if (!JJK.WALL_CHARS[rows[y][x]]) continue;
        const r = document.createElementNS(ns, 'rect');
        r.setAttribute('x', x * S); r.setAttribute('y', y * S);
        r.setAttribute('width', S); r.setAttribute('height', S);
        r.setAttribute('fill', lvl.theme.gridColor);
        svg.appendChild(r);
      }
    }
    return svg;
  }

  /* ---------------- battle setup ---------------- */
  function buildBattleSetup() {
    renderSlots();
    const grid = $('battleGrid');
    grid.innerHTML = '';
    for (const id of ROSTER_ORDER) {
      const c = CHARACTERS[id];
      const card = document.createElement('button');
      card.className = 'char-card';
      card.dataset.char = id;
      card.innerHTML = `
        <img src="${SPRITES.PORTRAITS[id]}" alt="${c.name}" loading="lazy">
        <span class="cc-name">${c.short.toUpperCase()}</span>
      `;
      card.addEventListener('click', () => {
        const slot = Menu.armedSlot >= 0 ? Menu.armedSlot
          : Menu.opponents.findIndex((o) => o == null);
        const idx = slot >= 0 ? slot : 0;
        Menu.opponents[idx] = id;
        Menu.armedSlot = -1;
        Audio.SFX.uiClick();
        renderSlots();
      });
      card.addEventListener('mouseenter', () => Audio.SFX.uiHover());
      grid.appendChild(card);
    }
  }

  function renderSlots() {
    const row = $('slotRow');
    row.innerHTML = '';
    Menu.opponents.length = Menu.opponentCount;
    for (let i = 0; i < Menu.opponentCount; i++) {
      const id = Menu.opponents[i];
      const el = document.createElement('div');
      el.className = 'slot' + (Menu.armedSlot === i ? ' armed' : '');
      if (id) {
        const c = CHARACTERS[id];
        el.innerHTML = `<img src="${SPRITES.PORTRAITS[id]}" alt=""><span class="slot-name">${c.short.toUpperCase()}</span>`;
      } else {
        el.innerHTML = '<span class="slot-empty">+</span>';
      }
      el.addEventListener('click', () => {
        Menu.armedSlot = Menu.armedSlot === i ? -1 : i;
        Audio.SFX.uiHover();
        renderSlots();
      });
      row.appendChild(el);
    }
  }

  function randomiseOpponents() {
    const pool = M.shuffled(ROSTER_ORDER);
    for (let i = 0; i < Menu.opponentCount; i++) Menu.opponents[i] = pool[i];
    Audio.SFX.uiClick();
    renderSlots();
  }

  /* ---------------- launching ---------------- */
  function deploy() {
    Audio.SFX.uiClick();
    if (Menu.mode === 'story') startGame();
    else if (Menu.mode === 'endless') showScreen('levelSelect');
    else showScreen('battleSetup');
  }

  function startGame() {
    hideScreens();
    for (const o of overlays) hideOverlay(o);

    const level = Menu.mode === 'story'
      ? LEVELS[0]
      : (LEVELS.find((l) => l.id === Menu.levelId) || LEVELS[0]);

    const opponents = Menu.mode === 'battle'
      ? Menu.opponents.slice(0, Menu.opponentCount)
          .map((o) => o || M.pick(ROSTER_ORDER))
      : null;

    JJK.G.start({
      mode: Menu.mode,
      charId: Menu.charId,
      level,
      opponents,
      difficulty: Menu.difficulty,
      unlocked: Menu.mode === 'story' ? Menu.unlocked : null,
    });
    JJK.G.rotateArenas = Menu.mode === 'story' ? true : $('rotateArenas')?.checked !== false;
    JJK.requestLock();
  }

  /* ---------------- overlays ---------------- */
  function statBlock(items) {
    return items.map((i) => `<div class="ov-stat"><b>${i.v}</b><span>${i.k}</span></div>`).join('');
  }

  function showPause() {
    const G = JJK.G;
    $('pauseStats').innerHTML = statBlock([
      { k: 'WAVE', v: G.wave },
      { k: 'KILLS', v: G.player.kills },
      { k: 'SCORE', v: G.player.score.toLocaleString() },
      { k: 'HEALTH', v: Math.ceil(G.player.health) },
    ]);
    showOverlay('pause');
  }
  function hidePause() { hideOverlay('pause'); }

  function showGameOver(r) {
    const isBest = r.score > Menu.best.score;
    if (isBest) { Menu.best.score = r.score; Menu.best.wave = Math.max(Menu.best.wave, r.wave); save(); }

    $('goKanji').textContent = r.win ? '勝' : '終';
    $('goTitle').textContent = r.reason;
    $('goTitle').style.color = r.win ? 'var(--good)' : 'var(--bad)';
    $('goStats').innerHTML = statBlock([
      { k: 'WAVE', v: r.wave },
      { k: 'KILLS', v: r.kills },
      { k: 'SCORE', v: r.score.toLocaleString() },
      { k: 'BEST', v: Menu.best.score.toLocaleString() },
    ]);
    showOverlay('gameOver');
  }

  /* ---------------- settings ---------------- */
  function applySettings() {
    JJK.Input.sensitivity = 0.0022 * Menu.settings.sens;
    JJK.Input.invertY = Menu.settings.invertY;
    JJK.Renderer.setQuality(Menu.settings.quality);
    JJK.Audio.setVolume(Menu.settings.volume);

    $('setSens').value = Menu.settings.sens;
    $('setSensV').textContent = Number(Menu.settings.sens).toFixed(2);
    $('setQual').value = Menu.settings.quality;
    $('setQualV').textContent = Math.round(Menu.settings.quality * 100) + '%';
    $('setVol').value = Menu.settings.volume;
    $('setVolV').textContent = Math.round(Menu.settings.volume * 100) + '%';
    $('setInvert').checked = Menu.settings.invertY;
  }

  /* ---------------- wiring ---------------- */
  function bind() {
    for (const b of document.querySelectorAll('.mode-card')) {
      b.addEventListener('click', () => {
        Menu.mode = b.dataset.mode;
        Audio.SFX.uiClick();
        showScreen('charSelect');
      });
      b.addEventListener('mouseenter', () => Audio.SFX.uiHover());
    }
    for (const b of document.querySelectorAll('[data-back]')) {
      b.addEventListener('click', () => { Audio.SFX.uiBack(); showScreen(b.dataset.back); });
    }

    $('btnDeploy').addEventListener('click', deploy);
    $('btnLevelStart').addEventListener('click', startGame);
    $('btnBattleStart').addEventListener('click', startGame);
    $('btnRandomise').addEventListener('click', randomiseOpponents);
    $('btnClearSlots').addEventListener('click', () => {
      Menu.opponents = new Array(Menu.opponentCount).fill(null);
      Audio.SFX.uiBack(); renderSlots();
    });

    for (const b of document.querySelectorAll('#countRow .count-btn')) {
      b.addEventListener('click', () => {
        Menu.opponentCount = Number(b.dataset.count);
        for (const o of document.querySelectorAll('#countRow .count-btn')) o.classList.remove('active');
        b.classList.add('active');
        while (Menu.opponents.length < Menu.opponentCount) Menu.opponents.push(null);
        Audio.SFX.uiClick();
        renderSlots();
      });
    }
    for (const b of document.querySelectorAll('#diffRow .count-btn')) {
      b.addEventListener('click', () => {
        Menu.difficulty = Number(b.dataset.diff);
        for (const o of document.querySelectorAll('#diffRow .count-btn')) o.classList.remove('active');
        b.classList.add('active');
        Audio.SFX.uiClick();
      });
    }

    $('btnResume').addEventListener('click', () => {
      hidePause(); JJK.G.setPaused(false); JJK.requestLock();
    });
    $('btnQuit').addEventListener('click', () => {
      hidePause(); JJK.G.stop(); JJK.G.over = true; showScreen('title'); Audio.SFX.uiBack();
    });
    $('btnRetry').addEventListener('click', () => { hideOverlay('gameOver'); startGame(); });
    $('btnMenu').addEventListener('click', () => { hideOverlay('gameOver'); showScreen('title'); Audio.SFX.uiBack(); });

    $('btnControls').addEventListener('click', () => showOverlay('controls'));
    $('btnPauseControls').addEventListener('click', () => showOverlay('controls'));
    $('btnControlsClose').addEventListener('click', () => hideOverlay('controls'));
    $('btnSettings').addEventListener('click', () => showOverlay('settings'));
    $('btnSettingsClose').addEventListener('click', () => { hideOverlay('settings'); save(); });

    $('setSens').addEventListener('input', (e) => { Menu.settings.sens = Number(e.target.value); applySettings(); });
    $('setQual').addEventListener('input', (e) => { Menu.settings.quality = Number(e.target.value); applySettings(); });
    $('setVol').addEventListener('input', (e) => { Menu.settings.volume = Number(e.target.value); applySettings(); });
    $('setInvert').addEventListener('change', (e) => { Menu.settings.invertY = e.target.checked; applySettings(); });
  }

  Object.assign(Menu, {
    load, save, saveUnlocks, bind, applySettings,
    showScreen, hideScreens, showOverlay, hideOverlay,
    showPause, hidePause, showGameOver, startGame,
  });

  JJK.Menu = Menu;
})(window.JJK);
