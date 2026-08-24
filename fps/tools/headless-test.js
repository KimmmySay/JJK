/* ==========================================================================
   HEADLESS TEST HARNESS

   Loads every game script in the same order index.html does, against a
   stubbed DOM + canvas, then actually runs the simulation for a few thousand
   frames. Catches the class of bug a syntax check never will: undefined
   functions, bad property access, NaN propagation, entities escaping the
   map, runaway array growth.

   Images are stubbed to FAIL by default, which deliberately exercises the
   procedural-fallback path (the worst case for a first-time player whose
   Avatar/ folder is missing or renamed).

   Run:  node tools/headless-test.js [frames]
   ========================================================================== */

'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');

/* ---------------- canvas 2d stub ---------------- */
function makeGradient() {
  return { addColorStop() {} };
}
function makeCtx() {
  const ctx = {
    canvas: null,
    globalAlpha: 1, globalCompositeOperation: 'source-over',
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineCap: 'butt',
    font: '10px sans-serif', textAlign: 'left', textBaseline: 'alphabetic',
    shadowColor: '#000', shadowBlur: 0, imageSmoothingEnabled: true,
    createLinearGradient: makeGradient,
    createRadialGradient: makeGradient,
    createPattern: () => null,
    measureText: (s) => ({ width: String(s).length * 6 }),
    getImageData() { throw new Error('getImageData must never be called (taints on file://)'); },
  };
  const noop = [
    'save', 'restore', 'translate', 'rotate', 'scale', 'transform', 'setTransform',
    'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'ellipse', 'rect',
    'quadraticCurveTo', 'bezierCurveTo', 'fill', 'stroke', 'clip',
    'fillRect', 'strokeRect', 'clearRect', 'fillText', 'strokeText', 'drawImage',
    'setLineDash',
  ];
  for (const m of noop) ctx[m] = function () {};
  return ctx;
}

function makeCanvas(w, h) {
  const c = {
    width: w || 300, height: h || 150,
    clientWidth: w || 1280, clientHeight: h || 720,
    style: {},
    getContext() { const x = makeCtx(); x.canvas = c; return x; },
    addEventListener() {}, removeEventListener() {},
    requestPointerLock() { return { catch() {} }; },
  };
  return c;
}

/* ---------------- DOM stub ---------------- */
const elements = new Map();
function makeEl(id) {
  const el = {
    id, tagName: 'DIV', innerHTML: '', textContent: '', value: '',
    checked: false, disabled: false, src: '', alt: '',
    children: [], dataset: {},
    style: { setProperty() {}, width: '' },
    classList: {
      _s: new Set(),
      add(...c) { c.forEach((x) => this._s.add(x)); },
      remove(...c) { c.forEach((x) => this._s.delete(x)); },
      toggle(c, v) { if (v === undefined) v = !this._s.has(c); v ? this._s.add(c) : this._s.delete(c); return v; },
      contains(c) { return this._s.has(c); },
    },
    appendChild(c) { this.children.push(c); return c; },
    setAttribute() {}, getAttribute() { return null; },
    addEventListener() {}, removeEventListener() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; },
  };
  return el;
}

global.window = global;
global.addEventListener = function () {};
global.removeEventListener = function () {};
global.setInterval = global.setInterval || function () { return 0; };
global.document = {
  readyState: 'complete',
  body: makeEl('body'),
  documentElement: makeEl('html'),
  createElement(tag) { return tag === 'canvas' ? makeCanvas() : makeEl(tag); },
  createElementNS() { return makeEl('svg'); },
  getElementById(id) {
    if (id === 'game') { if (!elements.has(id)) elements.set(id, makeCanvas(1280, 720)); return elements.get(id); }
    if (!elements.has(id)) elements.set(id, makeEl(id));
    return elements.get(id);
  },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  addEventListener() {}, removeEventListener() {},
  pointerLockElement: null,
  exitPointerLock() {},
};
// Defaults to failing loads (procedural fallback path). IMG_OK=1 simulates
// successful loads, exercising the real drawImage/cover-fit avatar bake.
const IMG_OK = process.env.IMG_OK === '1';
global.Image = class {
  constructor() { this.naturalWidth = 0; this.naturalHeight = 0; }
  set src(v) {
    this._src = v;
    setTimeout(() => {
      if (IMG_OK) { this.naturalWidth = 512; this.naturalHeight = 768; if (this.onload) this.onload(); }
      else if (this.onerror) this.onerror();
    }, 0);
  }
  get src() { return this._src; }
};
global.localStorage = {
  _d: new Map(),
  getItem(k) { return this._d.has(k) ? this._d.get(k) : null; },
  setItem(k, v) { this._d.set(k, String(v)); },
  removeItem(k) { this._d.delete(k); },
};
global.performance = global.performance || { now: () => Date.now() };
// node 24 exposes navigator as a getter-only global; don't fight it.

// rAF is driven manually so we control the frame count.
let rafCb = null;
global.requestAnimationFrame = (cb) => { rafCb = cb; return 1; };
global.cancelAnimationFrame = () => { rafCb = null; };
// No AudioContext -> engine/audio.js must degrade to silence, not throw.
global.AudioContext = undefined;
global.webkitAudioContext = undefined;

/* ---------------- load scripts in index.html order ---------------- */
const ORDER = [
  'js/engine/core.js',
  'js/data/sprites.js', 'js/data/characters.js', 'js/data/bosses.js',
  'js/data/levels.js', 'js/data/domains.js',
  'js/data/boons.js', 'js/data/modifiers.js',
  'js/engine/assets.js', 'js/engine/map.js', 'js/engine/textures.js',
  'js/engine/spritebake.js', 'js/engine/raycaster.js', 'js/engine/renderer.js',
  'js/engine/postfx.js', 'js/engine/viewmodel.js', 'js/engine/input.js', 'js/engine/audio.js',
  'js/game/art.js', 'js/game/particles.js', 'js/game/combat.js',
  'js/game/projectiles.js', 'js/game/entities.js', 'js/game/abilities.js',
  'js/game/boss.js', 'js/game/player.js', 'js/game/waves.js',
  'js/game/hud.js', 'js/game/game.js',
  'js/ui/menu.js',
];

let failures = 0;
function fail(msg) { console.log('  FAIL  ' + msg); failures++; }
function ok(msg) { console.log('  ok    ' + msg); }

/**
 * Keep the test player alive without disabling the damage pipeline.
 * Necessary because dying calls gameOver(), which stops the rAF loop and
 * would silently truncate every test below into a few hundred frames.
 * Damage is still fully computed and recorded in p.damageTaken.
 */
function makeInvincible(p) {
  const orig = p.takeDamage.bind(p);
  p.damageTaken = 0;
  p.takeDamage = function (amount, opts) {
    const d = orig(amount, opts);
    p.damageTaken += d;
    p.health = p.maxHealth;
    p.dead = false;
    return d;
  };
}

console.log('\n=== LOAD ===');
for (const f of ORDER) {
  try { require(path.join(ROOT, f)); }
  catch (e) { fail(`${f} threw on load: ${e.message}\n${e.stack.split('\n').slice(1, 3).join('\n')}`); }
}
const JJK = global.window.JJK;
if (!JJK) { console.log('FATAL: no JJK namespace'); process.exit(1); }
ok(`${ORDER.length} scripts loaded`);

/* ---------------- static data checks ---------------- */
console.log('\n=== DATA ===');
const chars = Object.keys(JJK.CHARACTERS);
ok(`${chars.length} characters`);
if (chars.length !== 23) fail(`expected 23 characters, got ${chars.length}`);

const KINDS = new Set(['melee', 'projectile', 'volley', 'beam', 'burst', 'vortex',
  'summon', 'buff', 'blink', 'domain', 'copy', 'gamble', 'resonance']);
let abilityCount = 0;
for (const id of chars) {
  const c = JJK.CHARACTERS[id];
  for (const s of ['j', 'k', 'l', 'q']) {
    const a = c.abilities[s];
    abilityCount++;
    if (!a) { fail(`${id}.${s} missing`); continue; }
    if (!KINDS.has(a.kind)) fail(`${id}.${s} unknown kind "${a.kind}"`);
    if (a.cd == null) fail(`${id}.${s} missing cd`);
    if (a.cost == null) fail(`${id}.${s} missing cost`);
    if (a.kind === 'domain' && !JJK.DOMAINS[a.domain]) fail(`${id}.${s} bad domain "${a.domain}"`);
    if (a.kind === 'summon' && !a.summon) fail(`${id}.${s} summon with no type`);
  }
  if (!(c.moveSpeed > 0)) fail(`${id} bad moveSpeed ${c.moveSpeed}`);
}
ok(`${abilityCount} abilities validated`);

// Every ranged technique must have its own silhouette. Without this a new
// character quietly falls back to the generic orb and looks like everyone
// else's projectile with a different tint.
const noShape = [];
const visSig = new Map();
for (const id of chars) {
  const c = JJK.CHARACTERS[id];
  for (const sl of ['j', 'k', 'l', 'q']) {
    const a = c.abilities[sl];
    if ((a.kind === 'projectile' || a.kind === 'volley') && !a.shape) {
      noShape.push(`${id}.${sl} (${a.name})`);
    }
    const vis = a.shape || a.kind + (a.fx || '') + (a.travels ? 'T' : '') + (a.voidOrb ? 'V' : '');
    const key = `${a.kind}|${vis}|${a.color}`;
    if (!visSig.has(key)) visSig.set(key, []);
    visSig.get(key).push(`${id}.${sl}`);
  }
}
if (noShape.length) fail(`ranged abilities with no silhouette: ${noShape.join(', ')}`);
else ok('every projectile/volley has its own silhouette');

// Cast animations must be per-character. One shared swing curve is how 23
// sorcerers end up throwing the same punch in different colours.
const VM = JJK.Viewmodel;
const styleUse = {};
const noStyle = [];
for (const id of JJK.ROSTER_ORDER) {
  const st = VM.CHAR_STYLE[id];
  if (!st || !VM.STYLES[st]) { noStyle.push(id); continue; }
  (styleUse[st] = styleUse[st] || []).push(id);
}
if (noStyle.length) fail(`characters with no cast animation: ${noStyle.join(', ')}`);
// Sharing is only legitimate between the same character or the same weapon
// archetype; anything else means two sorcerers animate identically.
const OK_SHARED = [['gojo', 'gojofull'], ['sukuna', 'meguna'], ['yuta', 'mahoraga']];
const badShare = Object.entries(styleUse)
  .filter(([, ids]) => ids.length > 1)
  .filter(([, ids]) => !OK_SHARED.some((g) => ids.length === g.length && ids.every((x) => g.includes(x))));
if (badShare.length) {
  for (const [st, ids] of badShare) fail(`cast animation "${st}" shared by ${ids.join(', ')}`);
}
const nStyles = Object.keys(styleUse).length;
if (nStyles < 18) fail(`only ${nStyles} distinct cast animations for ${JJK.ROSTER_ORDER.length} characters`);
if (!noStyle.length && !badShare.length) {
  ok(`${nStyles} distinct cast animations across ${JJK.ROSTER_ORDER.length} characters`);
}

// Gojo and Full-Power Gojo intentionally share Hollow Purple.
const visClashes = Array.from(visSig.entries())
  .filter(([, v]) => v.length > 1)
  .filter(([, v]) => !v.every((x) => x.startsWith('gojo')));
if (visClashes.length) {
  for (const [k, v] of visClashes) fail(`identical-looking abilities: ${v.join(', ')} (${k})`);
} else {
  ok('no two abilities render identically');
}

for (const id of JJK.ROSTER_ORDER) if (!JJK.CHARACTERS[id]) fail(`ROSTER_ORDER has unknown "${id}"`);
for (const u of JJK.UNLOCKS) if (!JJK.CHARACTERS[u.id]) fail(`UNLOCKS has unknown "${u.id}"`);
if (JJK.ROSTER_ORDER.length !== chars.length) fail(`ROSTER_ORDER covers ${JJK.ROSTER_ORDER.length}/${chars.length}`);
ok('roster order + unlock ladder reference real characters');

for (const b of Object.keys(JJK.BOSSES)) {
  const def = JJK.BOSSES[b];
  if (!def.attacks || !def.attacks.length) fail(`boss ${b} has no attacks`);
  for (const a of def.attacks) {
    if (a.tell == null) fail(`boss ${b} attack "${a.name}" has no telegraph`);
    if (a.cd == null) fail(`boss ${b} attack "${a.name}" has no cooldown`);
  }
}
ok(`${Object.keys(JJK.BOSSES).length} bosses, all attacks telegraphed`);

// A domain must REPAINT the arena, not black it out. Each needs its own
// landscape, and no two may look the same.
const noLand = [];
const landFog = new Map();
for (const id of Object.keys(JJK.DOMAINS)) {
  const d = JJK.DOMAINS[id];
  if (!d.landscape) { noLand.push(id); continue; }
  for (const k of ['fog', 'fogDensity', 'floorNear', 'gridColor']) {
    if (d.landscape[k] == null) fail(`domain ${id} landscape missing ${k}`);
  }
  const sig = d.landscape.fog + '|' + d.landscape.gridColor;
  if (landFog.has(sig)) fail(`domains ${landFog.get(sig)} and ${id} have identical landscapes`);
  landFog.set(sig, id);
}
if (noLand.length) fail(`domains with no landscape (would just black the screen): ${noLand.join(', ')}`);
else ok(`${Object.keys(JJK.DOMAINS).length} domains each repaint the arena distinctly`);

// ---- in-run upgrades ----
{
  let boonBad = 0;
  for (const id of JJK.ROSTER_ORDER) {
    const pl = new JJK.Player(id);
    for (const b of JJK.BOONS) {
      if (b.char && b.char !== id) continue;
      pl.addBoon(b);
    }
    if (!Number.isFinite(pl.maxHealth) || pl.maxHealth <= 0) { fail(`boons break ${id} health`); boonBad++; }
    if (!Number.isFinite(pl.mods.damage) || pl.mods.damage <= 0) { fail(`boons break ${id} damage`); boonBad++; }
    if (!Number.isFinite(pl.mods.speed) || pl.mods.speed <= 0) { fail(`boons break ${id} speed`); boonBad++; }
  }
  // A character-specific boon must never be offered to anyone else.
  for (const b of JJK.BOONS.filter((x) => x.char)) {
    const other = JJK.ROSTER_ORDER.find((c) => c !== b.char);
    for (let n = 0; n < 150; n++) {
      if (JJK.rollBoons(other, [], 3).some((o) => o.id === b.id)) {
        fail(`character boon ${b.id} offered to ${other}`); boonBad++; break;
      }
    }
  }
  if (JJK.rollBoons('yuji', [], 3).length !== 3) { fail('boon roll did not return 3 options'); boonBad++; }
  if (!boonBad) ok(`${JJK.BOONS.length} boons apply cleanly to every character`);
}

// ---- thrown techniques: carried field + manual detonation ----
{
  let tb = 0;
  for (const id of chars) {
    const c = JJK.CHARACTERS[id];
    for (const sl of ['j', 'k', 'l', 'q']) {
      const a = c.abilities[sl];
      if (!a.travels) continue;
      if (!(a.travels.speed > 0)) { fail(`${id}.${sl} travels with no speed`); tb++; }
      if (!(a.travels.range > 0)) { fail(`${id}.${sl} travels with no range`); tb++; }
      // A thrown attraction/repulsion technique must actually move things
      // while it is in the air, not only where it lands.
      if (a.kind === 'vortex' && !(a.force !== 0)) { fail(`${id}.${sl} vortex has no force`); tb++; }
    }
  }
  if (!tb) ok('thrown techniques carry a field and a detonator');
}

// ---- wave modifiers ----
{
  const seenMods = new Set();
  for (let n = 0; n < 4000; n++) {
    const m = JJK.rollModifier(3 + (n % 40));
    if (m) seenMods.add(m.id);
  }
  const missingMods = JJK.MODIFIERS.filter((m) => !seenMods.has(m.id));
  if (missingMods.length) fail(`modifiers never rolled: ${missingMods.map((m) => m.id).join(', ')}`);
  let bossExempt = true;
  for (const w of [5, 10, 15, 20, 25]) if (JJK.rollModifier(w)) bossExempt = false;
  if (!bossExempt) fail('boss waves must not roll a modifier');
  if (!missingMods.length && bossExempt) {
    ok(`${JJK.MODIFIERS.length} wave modifiers reachable, boss waves exempt`);
  }
}

// Every spawn marker must be in the player's connected region, and every
// arena must have enough reachable room for the largest boss body.
for (const L of JJK.LEVELS) {
  const gm = new JJK.GameMap(L.map);
  const bad = gm.enemySpawns.concat(gm.bossSpawns).filter((s) => !gm.isReachable(s.x, s.y));
  if (bad.length) fail(`level ${L.id}: ${bad.length} unreachable spawn node(s)`);
  if (!gm.enemySpawns.length) fail(`level ${L.id}: no usable enemy spawns`);
  const biggest = Math.max(...Object.values(JJK.BOSSES).map((b) => b.radius)) + 0.15;
  const room = gm.findOpenNear(gm.playerSpawn.x, gm.playerSpawn.y, biggest, 14);
  if (!room) fail(`level ${L.id}: nowhere reachable fits a boss of radius ${biggest.toFixed(2)}`);
}
ok('all arenas: spawn nodes reachable + boss-sized clearance exists');

// Wide-body navigability. Bosses (radius up to 1.15), special curses (0.78)
// and Mahoraga all need cells whose full 3x3 is open. A thin-walled maze
// looks fine and is completely unusable by anything large: it can only move
// via the small-field fallback and jams constantly.
for (const L of JJK.LEVELS) {
  const m = new JJK.GameMap(L.map);
  let seed = null, bd = Infinity;
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      if (!m.wide[y * m.w + x]) continue;
      const d = (x - m.playerSpawn.x) ** 2 + (y - m.playerSpawn.y) ** 2;
      if (d < bd) { bd = d; seed = [x, y]; }
    }
  }
  if (!seed) { fail(`level ${L.id}: no cell fits a large body at all`); continue; }
  const seen = new Set([seed.join(',')]);
  const q = [seed];
  while (q.length) {
    const [cx, cy] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue;
      if (!m.wide[ny * m.w + nx]) continue;
      const k = nx + ',' + ny;
      if (seen.has(k)) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  const open = Array.from(m.cells).filter((c) => c === 0).length;
  const pct = seen.size / open;
  if (pct < 0.45) fail(`level ${L.id}: only ${Math.round(pct * 100)}% of floor is navigable by a large body (need >=45%)`);
  const cut = m.enemySpawns.filter((sp) => {
    for (let r = 0; r <= 2; r++) {
      for (let oy = -r; oy <= r; oy++) {
        for (let ox = -r; ox <= r; ox++) {
          if (seen.has((Math.floor(sp.x) + ox) + ',' + (Math.floor(sp.y) + oy))) return false;
        }
      }
    }
    return true;
  });
  if (cut.length) fail(`level ${L.id}: ${cut.length} spawn(s) cut off from the large-body network`);
}
ok('all arenas: large bodies can traverse and reach every spawn');

for (const L of JJK.LEVELS) {
  const w = L.map[0].length;
  if (L.map.some((r) => r.length !== w)) fail(`level ${L.id} has ragged rows`);
  if (!L.theme) fail(`level ${L.id} missing theme`);
  for (const t of [1, 2, 3, 4, 5]) {
    const style = L.theme.walls[t];
    if (style && !JJK.Textures.STYLES[style]) fail(`level ${L.id} wall ${t} -> unknown style "${style}"`);
    if (style && !L.theme.palette[style] && !L.theme.palette.default) {
      fail(`level ${L.id} style "${style}" has no palette`);
    }
  }
}
ok(`${JJK.LEVELS.length} levels, themes + wall styles resolve`);

/* ---------------- art bake (with all images failing) ---------------- */
console.log(`\n=== ART BAKE (images ${IMG_OK ? 'loading OK' : 'forced to fail'}) ===`);
(async () => {
  JJK.Renderer.init(document.getElementById('game'));
  JJK.Input.attach(document.getElementById('game'));

  try {
    await JJK.Art.build(() => {});
    ok(IMG_OK ? 'Art.build completed with images present' : 'Art.build completed on total image failure');
  } catch (e) {
    fail('Art.build threw: ' + e.message + '\n' + e.stack.split('\n').slice(1, 4).join('\n'));
  }
  for (const id of chars) if (!JJK.Art.avatars[id]) fail(`no avatar sheet for ${id}`);
  for (const id of Object.keys(JJK.BOSSES)) if (!JJK.Art.bosses[id]) fail(`no boss sheet for ${id}`);
  ok('every character + boss has a sprite sheet');

  // Shikigami must be ANIMATED and use creature proportions. If one ever
  // regresses to bakeAvatar it becomes a static vertical oval — the exact
  // "floating portrait" look these were rewritten to fix — and that would
  // otherwise pass every other test silently.
  for (const key of ['divineDog', 'nue', 'mahoraga', 'chimera']) {
    const sh = JJK.Art.props[key];
    if (!sh) { fail(`no shikigami sheet for ${key}`); continue; }
    if (!(sh.frames > 1)) fail(`${key} is a single static frame (not animated)`);
    if (!sh.shikigami) fail(`${key} was not built by bakeShikigami`);
  }
  // Curses must keep their yaw views. Collapsing back to a single angle is
  // what makes sprite enemies read as flat paintings.
  for (const tier of Object.keys(JJK.Art.curses)) {
    const sh = JJK.Art.curses[tier][0];
    if (!sh) { fail(`no curse sheet for tier ${tier}`); continue; }
    if (!(sh.angles >= 8)) fail(`curse tier "${tier}" has only ${sh.angles} yaw view(s) — needs >= 8`);
    if (sh.frames !== sh.angles * sh.poses) fail(`curse tier "${tier}" frame count ${sh.frames} != angles*poses`);
  }
  ok(`curses baked at ${JJK.Art.curses.weak[0].angles} yaw angles x ${JJK.Art.curses.weak[0].poses} poses`);

  const dog = JJK.Art.props.divineDog, nue = JJK.Art.props.nue;
  if (dog && dog.fw <= dog.fh) fail(`divine dog frame is taller than wide (${dog.fw}x${dog.fh}) — that is a humanoid shape, not a quadruped`);
  if (nue && nue.fw <= nue.fh) fail(`nue frame is taller than wide (${nue.fw}x${nue.fh}) — wings need width`);
  ok(`shikigami animated: dog ${dog.fw}x${dog.fh}x${dog.frames}f, nue ${nue.fw}x${nue.fh}x${nue.frames}f, mahoraga ${JJK.Art.props.mahoraga.frames}f`);

  /* ---------------- simulation ---------------- */
  console.log('\n=== SIMULATION ===');
  // The sim has to outlive the opening intermission (Game.start sets 2.0s
  // before wave 1) or the entire spawn / AI / kill / wave-clear path never
  // executes and every combat assertion below passes vacuously. At the old
  // 2400 default that was 104 frames/char = 1.74s -- 0.26s short -- so the
  // suite reported "peak enemies=0, 0 kills" as a PASS for its whole life.
  // Derive the floor from the delay instead of hard-coding a frame count, so
  // bumping the intermission can never silently gut this suite again.
  const OPENING_INTERMISSION = 2.0;   // seconds; mirrors Game.start()
  const FRAME_MS = 16.7;
  const COMBAT_SECONDS = 5;           // live fighting wanted per character
  const MIN_PER_CHAR = Math.ceil(((OPENING_INTERMISSION + COMBAT_SECONDS) * 1000) / FRAME_MS);
  const FRAMES = Number(process.argv[2]) || MIN_PER_CHAR * JJK.ROSTER_ORDER.length;
  const G = JJK.G;

  // Run every character through a live game so no kit goes untested.
  const roster = JJK.ROSTER_ORDER;
  let totalFrames = 0, totalCasts = 0, maxEnemies = 0, maxParticles = 0, maxProjectiles = 0;
  const seen = { kills: 0, waves: 0, bosses: 0, domains: 0, crits: 0 };

  const origError = console.error;
  const runtimeErrors = [];
  console.error = (...a) => { runtimeErrors.push(a.map(String).join(' ')); };

  for (let ci = 0; ci < roster.length; ci++) {
    const charId = roster[ci];
    const level = JJK.LEVELS[ci % JJK.LEVELS.length];
    try {
      G.start({ mode: 'endless', charId, level, difficulty: 1, unlocked: null });
    } catch (e) {
      fail(`G.start(${charId}) threw: ${e.message}`);
      continue;
    }

    makeInvincible(G.player);
    let t = performance.now();
    const perChar = Math.floor(FRAMES / roster.length);
    for (let f = 0; f < perChar; f++) {
      t += 16.7;
      // Drive abilities constantly so every archetype actually executes.
      const p = G.player;
      p.mana = p.maxMana;
      const slot = ['j', 'k', 'l', 'q'][f % 4];
      if (f % 5 === 0) {
        JJK.Input.pressed[{ j: 'ab1', k: 'ab2', l: 'ab3', q: 'domain' }[slot]] = true;
        totalCasts++;
      }
      if (f % 7 === 0) JJK.Input.pressed.rct = true;
      if (f % 11 === 0) JJK.Input.pressed.passive = true;
      if (f % 13 === 0) JJK.Input.down.strike = true; else JJK.Input.down.strike = false;
      // Wander so pathing, collision and spawning all get exercised.
      JJK.Input.down.forward = (f % 60) < 40;
      JJK.Input.down.left = (f % 120) < 30;
      JJK.Input.down.right = (f % 120) >= 90;
      JJK.Input.mouseDX = Math.sin(f * 0.05) * 12;

      if (!rafCb) break;
      const cb = rafCb; rafCb = null;
      try { cb(t); } catch (e) {
        fail(`frame threw (${charId}): ${e.message}\n${e.stack.split('\n').slice(1, 3).join('\n')}`);
        break;
      }
      totalFrames++;

      maxEnemies = Math.max(maxEnemies, G.enemies.length);
      maxParticles = Math.max(maxParticles, JJK.Particles.list.length);
      maxProjectiles = Math.max(maxProjectiles, JJK.Projectiles.list.length);

      // Invariants.
      const p2 = G.player;
      if (!Number.isFinite(p2.x) || !Number.isFinite(p2.y)) { fail(`${charId}: player position went NaN`); break; }
      if (G.map.solid(p2.x, p2.y)) { fail(`${charId}: player inside a wall at ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`); break; }
      if (!Number.isFinite(p2.health) || !Number.isFinite(p2.mana)) { fail(`${charId}: NaN health/mana`); break; }
      for (const e of G.enemies) {
        if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) { fail(`${charId}: enemy position NaN`); break; }
      }
    }

    seen.kills += G.player.kills;
    seen.waves = Math.max(seen.waves, G.wave);
    if (G.boss) seen.bosses++;
    if (G.domain) seen.domains++;
    G.stop();
  }
  console.error = origError;

  ok(`${totalFrames} frames across ${roster.length} characters`);
  ok(`${totalCasts} ability casts issued`);
  ok(`peak enemies=${maxEnemies}  particles=${maxParticles}  projectiles=${maxProjectiles}`);
  ok(`reached wave ${seen.waves}, ${seen.kills} kills`);

  // Liveness gates. Without these the three lines above are decoration: they
  // print whatever happened and call it a pass, including nothing happening.
  const perCharFrames = Math.floor(FRAMES / roster.length);
  const intermissionFrames = Math.ceil((OPENING_INTERMISSION * 1000) / FRAME_MS);
  if (perCharFrames <= intermissionFrames) {
    fail(`sim too short: ${perCharFrames} frames/char (${(perCharFrames * FRAME_MS / 1000).toFixed(2)}s) `
       + `does not clear the ${OPENING_INTERMISSION}s opening intermission -- no wave ever starts`);
  } else {
    ok(`liveness: ${perCharFrames} frames/char clears the ${OPENING_INTERMISSION}s intermission by `
     + `${((perCharFrames - intermissionFrames) * FRAME_MS / 1000).toFixed(2)}s`);
  }
  if (seen.waves < 1) fail('sim never reached wave 1 -- spawn/pacing path untested');
  if (maxEnemies === 0) fail('sim spawned zero enemies -- enemy AI + collision path untested');
  if (seen.kills === 0) fail('sim scored zero kills -- damage/death/loot path untested');

  if (maxParticles > JJK.Particles.MAX_PARTICLES) fail(`particle cap exceeded: ${maxParticles}`);
  if (maxProjectiles > 140) fail(`projectile cap exceeded: ${maxProjectiles}`);

  if (runtimeErrors.length) {
    const uniq = Array.from(new Set(runtimeErrors));
    for (const e of uniq.slice(0, 12)) fail('runtime error: ' + e.split('\n')[0]);
    if (uniq.length > 12) fail(`…and ${uniq.length - 12} more distinct runtime errors`);
  } else {
    ok('no runtime errors logged');
  }

  /* ---------------- bosses ---------------- */
  console.log('\n=== BOSSES ===');
  console.error = (...a) => { runtimeErrors.push(a.map(String).join(' ')); };
  for (const bossId of JJK.BOSS_ORDER) {
    G.start({ mode: 'endless', charId: 'gojo', level: JJK.LEVELS[0], difficulty: 1 });
    G.wave = 5;
    JJK.Director.wave = 5;
    let spawned = false;
    try { JJK.Director.spawnBoss(G, bossId); spawned = !!G.boss; }
    catch (e) { fail(`spawnBoss(${bossId}) threw: ${e.message}`); }
    if (!spawned) { fail(`${bossId} did not spawn`); G.stop(); continue; }

    makeInvincible(G.player);
    const startHp = G.boss.maxHealth;
    const statesSeen = new Set();
    let t = performance.now(), tells = 0;
    const bossDmgBefore = () => G.player.damageTaken;

    for (let f = 0; f < 1400; f++) {
      t += 16.7;
      const p = G.player;
      p.mana = p.maxMana;
      if (f % 6 === 0) JJK.Input.pressed.ab3 = true;      // keep hitting it
      if (f % 4 === 0) JJK.Input.down.strike = true; else JJK.Input.down.strike = false;
      JJK.Input.down.forward = (f % 90) < 55;
      JJK.Input.mouseDX = Math.sin(f * 0.04) * 9;
      if (!rafCb) break;
      const cb = rafCb; rafCb = null;
      try { cb(t); } catch (e) { fail(`${bossId} frame threw: ${e.message}`); break; }

      if (G.boss) {
        statesSeen.add(G.boss.state);
        if (G.boss.state === 'tell') tells++;
        if (!Number.isFinite(G.boss.x) || !Number.isFinite(G.boss.y)) { fail(`${bossId} position NaN`); break; }
        if (G.map.solid(G.boss.x, G.boss.y)) { fail(`${bossId} inside a wall`); break; }
      }
    }

    // Drive it down through both thresholds so phases are exercised.
    if (G.boss) {
      const phasesSeen = new Set([G.boss.phase]);
      let t3 = performance.now();
      for (let f = 0; f < 400; f++) {
        t3 += 16.7;
        G.boss.health = G.boss.maxHealth * (1 - f / 400);
        if (!rafCb) break;
        const cb3 = rafCb; rafCb = null;
        try { cb3(t3); } catch (e) { fail(`${bossId} phase frame threw: ${e.message}`); break; }
        if (G.boss) phasesSeen.add(G.boss.phase);
      }
      if (!phasesSeen.has(1) || !phasesSeen.has(2)) {
        fail(`${bossId} never reached both phase thresholds (saw ${Array.from(phasesSeen).join(',')})`);
      }
    }

    const killed = !G.boss || G.boss.dead;
    const parts = [];
    if (!tells) parts.push('never telegraphed');
    if (!G.player.damageTaken) parts.push('never damaged player');
    void bossDmgBefore;
    if (parts.length) fail(`${bossId}: ${parts.join(', ')}`);
    else ok(`${bossId.padEnd(13)} hp=${startHp} tells=${tells} states=[${Array.from(statesSeen).join(',')}] ${killed ? 'killed' : 'survived'}`);
    G.stop();
  }

  /* ---------------- domains ---------------- */
  console.log('\n=== DOMAINS ===');
  for (const did of Object.keys(JJK.DOMAINS)) {
    const def = JJK.DOMAINS[did];
    G.start({ mode: 'endless', charId: def.owner || 'gojo', level: JJK.LEVELS[0], difficulty: 1 });
    // Put something in the domain to chew on.
    for (let i = 0; i < 6; i++) {
      const n = G.map.enemySpawns[i % G.map.enemySpawns.length];
      G.enemies.push(new JJK.Entities.Curse(n.x, n.y, 'medium', 1));
    }
    makeInvincible(G.player);
    let t = performance.now(), threw = null;
    try { G.openDomain(def, G.player); } catch (e) { threw = e; }
    if (threw) { fail(`openDomain(${did}) threw: ${threw.message}`); G.stop(); continue; }

    for (let f = 0; f < 700; f++) {
      t += 16.7;
      if (!rafCb) break;
      const cb = rafCb; rafCb = null;
      try { cb(t); } catch (e) { fail(`domain ${did} frame threw: ${e.message}`); break; }
    }
    // The domain must actually expire, or it would be permanent.
    if (G.domain) fail(`${did} never closed after ${def.duration}s`);
    else ok(`${did.padEnd(18)} style=${def.style} dps=${def.dps} opened + closed cleanly`);
    G.stop();
  }

  /* ---------------- battle mode ---------------- */
  console.log('\n=== BATTLE MODE ===');
  {
    const foes = ['gojo', 'sukuna', 'toji', 'mahoraga'];
    G.start({ mode: 'battle', charId: 'yuji', level: JJK.LEVELS[2], opponents: foes, difficulty: 1 });
    if (G.enemies.length !== 4) fail(`expected 4 opponents, got ${G.enemies.length}`);
    makeInvincible(G.player);
    let t = performance.now();
    for (let f = 0; f < 2000; f++) {
      t += 16.7;
      const p = G.player;
      p.mana = p.maxMana;
      // Aim at the nearest opponent — a bot spinning the mouse at random
      // never connects, which would make this test meaningless.
      let best = null, bd = 1e9;
      for (const e of G.enemies) {
        if (e.dead) continue;
        const d = JJK.M.dist(e.x, e.y, p.x, p.y);
        if (d < bd) { bd = d; best = e; }
      }
      if (best) p.angle = Math.atan2(best.y - p.y, best.x - p.x);
      if (f % 5 === 0) JJK.Input.pressed.ab2 = true;
      if (f % 9 === 0) JJK.Input.pressed.ab1 = true;
      if (f % 4 === 0) JJK.Input.down.strike = true; else JJK.Input.down.strike = false;
      JJK.Input.down.forward = bd > 3;
      if (!rafCb) break;
      const cb = rafCb; rafCb = null;
      try { cb(t); } catch (e) { fail(`battle frame threw: ${e.message}`); break; }
      for (const e of G.enemies) {
        if (G.map.solid(e.x, e.y)) { fail(`opponent ${e.charId} inside a wall`); break; }
      }
    }
    if (!G.player.kills) fail('player could not kill a single opponent in 2000 frames');
    else ok(`battle offence: ${G.player.kills}/4 defeated, win=${G.over}, took ${G.player.damageTaken} dmg`);
    G.stop();

    // Second pass: a passive player must actually get punished. Asserting
    // this in the aggressive pass is wrong — a bot with perfect aim can
    // legitimately flawless a 1v4, and that is not a bug.
    G.start({ mode: 'battle', charId: 'yuji', level: JJK.LEVELS[2], opponents: foes, difficulty: 1 });
    makeInvincible(G.player);
    let t2 = performance.now();
    for (let f = 0; f < 1600; f++) {
      t2 += 16.7;
      if (!rafCb) break;
      const cb = rafCb; rafCb = null;
      try { cb(t2); } catch (e) { fail(`passive battle frame threw: ${e.message}`); break; }
      for (const e of G.enemies) {
        if (!e.dead && G.map.solid(e.x, e.y)) { fail(`opponent ${e.charId} inside a wall`); break; }
      }
    }
    if (!G.player.damageTaken) fail('opponents never damaged a passive player');
    else ok(`battle defence: passive player took ${G.player.damageTaken} dmg from 4 opponents`);
    G.stop();
  }

  /* ---------------- enemy pathing ---------------- */
  console.log('\n=== PATHING ===');
  {
    G.start({ mode: 'endless', charId: 'gojo', level: JJK.LEVELS[3], difficulty: 1 });
    // Spawn far away, behind geometry, and see if they reach the player.
    const far = G.map.enemySpawns
      .slice()
      .sort((a, b) => JJK.M.dist(b.x, b.y, G.player.x, G.player.y) - JJK.M.dist(a.x, a.y, G.player.x, G.player.y));
    makeInvincible(G.player);
    const tracked = [];
    for (let i = 0; i < 8; i++) {
      const n = far[i % far.length];
      const e = new JJK.Entities.Curse(n.x, n.y, 'weak', 1);
      e.startDist = JJK.M.dist(e.x, e.y, G.player.x, G.player.y);
      G.enemies.push(e);
      tracked.push(e);
    }
    // Arenas are 48x36 now, so crossing one legitimately takes longer than
    // it did at 32x23. Measured: 7-8/8 arrive by 20s, 8/8 by 40s, with none
    // stuck. The window is sized to the map, not trimmed to pass.
    let t = performance.now();
    for (let f = 0; f < 2100; f++) {
      t += 16.7;
      if (!rafCb) break;
      const cb = rafCb; rafCb = null;
      try { cb(t); } catch (e) { fail(`pathing frame threw: ${e.message}`); break; }
    }
    let reached = 0, stuck = 0;
    for (const e of tracked) {
      const d = JJK.M.dist(e.x, e.y, G.player.x, G.player.y);
      if (e.dead || d < 3) reached++;
      else if (d > e.startDist * 0.85) stuck++;
    }
    // A straggler still walking is fine; one that never moved is a bug.
    if (stuck > 0) fail(`${stuck}/${tracked.length} enemies made no progress at all (stuck on geometry)`);
    else if (reached < tracked.length * 0.75) fail(`only ${reached}/${tracked.length} enemies reached the player in 35s`);
    else ok(`pathing: ${reached}/${tracked.length} enemies routed to the player, 0 stuck`);
    G.stop();
  }
  console.error = origError;

  if (runtimeErrors.length) {
    const uniq = Array.from(new Set(runtimeErrors));
    for (const e of uniq.slice(0, 10)) fail('runtime error: ' + e.split('\n')[0]);
  }

  console.log('\n=== RESULT ===');
  if (failures) { console.log(`  ${failures} FAILURE(S)\n`); process.exit(1); }
  console.log('  all checks passed\n');
})();
