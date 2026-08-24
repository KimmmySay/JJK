/* ==========================================================================
   STUB DOM — shared headless environment for tools/.
   Provides just enough canvas/DOM/Image/localStorage for the game scripts to
   load and run under node. Exports a manual rAF pump so tests drive frames.
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
/**
 * Image stub. Defaults to FAILING every load, which exercises the
 * procedural-fallback path. Set IMG_OK=1 to simulate successful loads
 * instead, which exercises the real drawImage/cover-fit path in
 * SpriteBake.bakeAvatar. Both need coverage — they are different code.
 */
const IMG_OK = process.env.IMG_OK === '1';
global.Image = class {
  constructor() { this.naturalWidth = 0; this.naturalHeight = 0; }
  set src(v) {
    this._src = v;
    setTimeout(() => {
      if (IMG_OK) {
        this.naturalWidth = 512;
        this.naturalHeight = 768;
        if (this.onload) this.onload();
      } else if (this.onerror) {
        this.onerror();
      }
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

function loadAll(onError) {
  for (const f of ORDER) {
    try { require(path.join(ROOT, f)); }
    catch (e) { if (onError) onError(f, e); else throw e; }
  }
  return global.window.JJK;
}

/** Run one frame. Returns false when the loop stopped scheduling. */
function pump(t) {
  if (!rafCb) return false;
  const cb = rafCb; rafCb = null;
  cb(t);
  return true;
}
function hasFrame() { return !!rafCb; }

module.exports = { loadAll, pump, hasFrame, ORDER, ROOT, makeCanvas, makeEl };
