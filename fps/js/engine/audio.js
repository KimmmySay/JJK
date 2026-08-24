/* ==========================================================================
   AUDIO — WebAudio synthesis. No sound files, so nothing to 404 and the
   game still runs from file://.

   Everything is built from three primitives: an oscillator envelope, a
   filtered noise burst, and a frequency sweep. Layering those gets you
   surprisingly far — a Black Flash is a sub-drop plus a bright noise crack
   plus a short ring, which lands much harder than any single tone.

   The context is created lazily on first user gesture because browsers
   suspend AudioContexts that predate one.
   ========================================================================== */

(function (JJK) {
  'use strict';

  const { M } = JJK;

  let ctx = null;
  let master = null;
  let musicGain = null;
  let enabled = true;
  let volume = 0.55;
  let noiseBuffer = null;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { enabled = false; return null; }
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.35;
      musicGain.connect(master);

      // 2s of white noise, reused by every percussive sound.
      const len = ctx.sampleRate * 2;
      noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) {
      enabled = false;
    }
    return ctx;
  }

  function resume() {
    ensure();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function now() { return ctx ? ctx.currentTime : 0; }

  /* ---------------- primitives ---------------- */

  function tone(opts) {
    if (!enabled || !ensure()) return;
    const t0 = now() + (opts.delay || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = opts.type || 'sine';
    o.frequency.setValueAtTime(opts.freq, t0);
    if (opts.to != null) {
      if (opts.exp !== false && opts.to > 0 && opts.freq > 0) {
        o.frequency.exponentialRampToValueAtTime(opts.to, t0 + opts.dur);
      } else {
        o.frequency.linearRampToValueAtTime(opts.to, t0 + opts.dur);
      }
    }
    const peak = (opts.gain ?? 0.3);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + (opts.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);

    let node = o;
    if (opts.filter) {
      const f = ctx.createBiquadFilter();
      f.type = opts.filter;
      f.frequency.setValueAtTime(opts.filterFreq || 1200, t0);
      if (opts.filterTo) f.frequency.exponentialRampToValueAtTime(opts.filterTo, t0 + opts.dur);
      f.Q.value = opts.q ?? 1;
      node.connect(f); node = f;
    }
    node.connect(g);
    g.connect(opts.bus || master);
    o.start(t0);
    o.stop(t0 + opts.dur + 0.05);
  }

  function noise(opts) {
    if (!enabled || !ensure()) return;
    const t0 = now() + (opts.delay || 0);
    const s = ctx.createBufferSource();
    s.buffer = noiseBuffer;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = opts.filter || 'bandpass';
    f.frequency.setValueAtTime(opts.freq || 1400, t0);
    if (opts.to) f.frequency.exponentialRampToValueAtTime(Math.max(40, opts.to), t0 + opts.dur);
    f.Q.value = opts.q ?? 1.2;
    const g = ctx.createGain();
    const peak = opts.gain ?? 0.25;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + (opts.attack ?? 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    s.connect(f); f.connect(g); g.connect(opts.bus || master);
    s.start(t0);
    s.stop(t0 + opts.dur + 0.05);
  }

  /* ---------------- game sounds ---------------- */

  const SFX = {
    uiHover() { tone({ freq: 520, to: 640, dur: 0.07, type: 'triangle', gain: 0.07 }); },
    uiClick() {
      tone({ freq: 880, to: 1180, dur: 0.09, type: 'square', gain: 0.09 });
      noise({ freq: 3200, dur: 0.05, gain: 0.05 });
    },
    uiBack() { tone({ freq: 420, to: 240, dur: 0.12, type: 'triangle', gain: 0.09 }); },

    /** Generic melee connect. */
    hit(power) {
      const p = M.clamp(power ?? 1, 0.4, 2.4);
      noise({ freq: 1800 * p, to: 300, dur: 0.10, gain: 0.16, q: 0.9 });
      tone({ freq: 150 * p, to: 60, dur: 0.14, type: 'sine', gain: 0.22 });
    },

    /** The signature. Sub drop + bright crack + a ringing tail. */
    blackFlash() {
      noise({ freq: 5200, to: 220, dur: 0.30, gain: 0.34, q: 0.7 });
      tone({ freq: 90, to: 26, dur: 0.55, type: 'sine', gain: 0.5 });
      tone({ freq: 1400, to: 300, dur: 0.22, type: 'sawtooth', gain: 0.14, filter: 'lowpass', filterFreq: 3000, filterTo: 500 });
      tone({ freq: 2400, to: 2400, dur: 0.9, type: 'sine', gain: 0.07, delay: 0.03 });
    },

    boneCrush() {
      noise({ freq: 900, to: 120, dur: 0.22, gain: 0.3, q: 0.6 });
      tone({ freq: 70, to: 30, dur: 0.4, type: 'square', gain: 0.3, filter: 'lowpass', filterFreq: 400 });
    },

    cast(kind, color) {
      void color;
      switch (kind) {
        case 'beam':
          tone({ freq: 180, to: 1400, dur: 0.35, type: 'sawtooth', gain: 0.16, filter: 'lowpass', filterFreq: 600, filterTo: 4200 });
          noise({ freq: 400, to: 4000, dur: 0.35, gain: 0.12 });
          break;
        case 'burst':
          tone({ freq: 320, to: 60, dur: 0.34, type: 'sawtooth', gain: 0.24, filter: 'lowpass', filterFreq: 2200, filterTo: 200 });
          noise({ freq: 2400, to: 180, dur: 0.4, gain: 0.22 });
          break;
        case 'summon':
          tone({ freq: 120, to: 340, dur: 0.4, type: 'triangle', gain: 0.18 });
          tone({ freq: 240, to: 680, dur: 0.4, type: 'sine', gain: 0.1, delay: 0.05 });
          break;
        case 'buff':
          tone({ freq: 300, to: 900, dur: 0.35, type: 'sine', gain: 0.16 });
          tone({ freq: 450, to: 1350, dur: 0.35, type: 'sine', gain: 0.1, delay: 0.04 });
          break;
        case 'heal':
          tone({ freq: 520, to: 1040, dur: 0.5, type: 'sine', gain: 0.14 });
          tone({ freq: 780, to: 1560, dur: 0.5, type: 'sine', gain: 0.08, delay: 0.08 });
          break;
        default: // projectile
          tone({ freq: 700, to: 220, dur: 0.16, type: 'triangle', gain: 0.15 });
          noise({ freq: 2600, to: 600, dur: 0.12, gain: 0.08 });
      }
    },

    lightning() {
      noise({ freq: 6000, to: 900, dur: 0.18, gain: 0.24, q: 0.5 });
      tone({ freq: 2800, to: 400, dur: 0.14, type: 'square', gain: 0.1 });
    },

    hurt() {
      tone({ freq: 220, to: 90, dur: 0.24, type: 'sawtooth', gain: 0.20, filter: 'lowpass', filterFreq: 900 });
      noise({ freq: 700, to: 200, dur: 0.16, gain: 0.12 });
    },

    enemyDie() {
      tone({ freq: 300, to: 50, dur: 0.45, type: 'sawtooth', gain: 0.14, filter: 'lowpass', filterFreq: 1400, filterTo: 200 });
      noise({ freq: 1200, to: 120, dur: 0.4, gain: 0.14 });
    },

    /** Deep swelling chord — a domain unfolding should feel like pressure. */
    domain(open) {
      if (open) {
        [55, 82.4, 110, 164.8].forEach((f, i) => {
          tone({ freq: f, to: f * 1.02, dur: 2.4, type: 'sawtooth', gain: 0.11, attack: 0.5, delay: i * 0.05, filter: 'lowpass', filterFreq: 300, filterTo: 1600, exp: false });
        });
        noise({ freq: 80, to: 2000, dur: 1.6, gain: 0.13, filter: 'lowpass' });
        tone({ freq: 1200, to: 1200, dur: 2.6, type: 'sine', gain: 0.04, attack: 0.8 });
      } else {
        tone({ freq: 160, to: 40, dur: 0.9, type: 'sawtooth', gain: 0.14, filter: 'lowpass', filterFreq: 1200, filterTo: 120 });
      }
    },

    bossSpawn() {
      [41.2, 61.7, 87.3].forEach((f, i) => {
        tone({ freq: f, to: f, dur: 2.0, type: 'sawtooth', gain: 0.13, attack: 0.3, delay: i * 0.12, filter: 'lowpass', filterFreq: 220, filterTo: 900 });
      });
      noise({ freq: 120, to: 60, dur: 2.2, gain: 0.10, filter: 'lowpass' });
    },

    waveStart() {
      tone({ freq: 660, to: 990, dur: 0.5, type: 'sine', gain: 0.13 });
      tone({ freq: 990, to: 1320, dur: 0.5, type: 'sine', gain: 0.08, delay: 0.1 });
    },

    unlock() {
      [523, 659, 784, 1047].forEach((f, i) => {
        tone({ freq: f, to: f, dur: 0.5, type: 'triangle', gain: 0.11, delay: i * 0.08 });
      });
    },

    death() {
      [220, 175, 131, 87].forEach((f, i) => {
        tone({ freq: f, to: f * 0.5, dur: 1.4, type: 'sawtooth', gain: 0.13, delay: i * 0.16, filter: 'lowpass', filterFreq: 900, filterTo: 150 });
      });
    },

    zone() {
      tone({ freq: 130, to: 520, dur: 0.6, type: 'sine', gain: 0.18 });
      tone({ freq: 195, to: 780, dur: 0.6, type: 'sine', gain: 0.1, delay: 0.06 });
    },
  };

  function setVolume(v) {
    volume = M.clamp(v, 0, 1);
    if (master) master.gain.value = volume;
  }
  function setEnabled(on) {
    enabled = on;
    if (master) master.gain.value = on ? volume : 0;
  }

  JJK.Audio = { resume, SFX, setVolume, setEnabled, get enabled() { return enabled; }, get volume() { return volume; } };
})(window.JJK);
