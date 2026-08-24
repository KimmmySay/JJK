/* ==========================================================================
   PARTICLES — world-space sparks, smoke, blood and floating damage numbers.

   Particles are pooled and hard-capped. A raycaster renders every particle
   as a billboard slice, so an uncapped emitter is the fastest way to tank
   the frame rate; MAX_PARTICLES is a real budget, not a suggestion.
   ========================================================================== */

(function (JJK) {
  'use strict';

  const { M, Color, SpriteBake } = JJK;

  const MAX_PARTICLES = 220;
  const MAX_NUMBERS = 28;

  const particles = [];
  const numbers = [];

  function clear() { particles.length = 0; numbers.length = 0; }

  /**
   * Spawn a burst.
   * opts: { count, color, core, speed, spread, size, life, gravity,
   *         additive, drag, dirX, dirY, dirZ }
   */
  function burst(x, y, z, opts) {
    const o = opts || {};
    const count = Math.min(o.count || 10, MAX_PARTICLES - particles.length);
    const sheet = SpriteBake.orb(o.color || '#ffffff', o.core || '#ffffff');
    for (let i = 0; i < count; i++) {
      const a = M.rand(0, M.TAU);
      const el = M.rand(-0.6, 0.9);
      const sp = (o.speed || 4) * M.rand(0.35, 1);
      particles.push({
        x, y, z,
        vx: Math.cos(a) * sp * Math.cos(el) + (o.dirX || 0) * sp * 0.6,
        vy: Math.sin(a) * sp * Math.cos(el) + (o.dirY || 0) * sp * 0.6,
        vz: Math.sin(el) * sp * 0.5 + (o.dirZ || 0) * sp * 0.5,
        life: 0,
        maxLife: (o.life || 0.6) * M.rand(0.6, 1.25),
        size: (o.size || 0.22) * M.rand(0.6, 1.35),
        gravity: o.gravity ?? 2.2,
        drag: o.drag ?? 2.0,
        sheet,
        additive: o.additive !== false,
        fade: o.fade ?? 1,
      });
    }
  }

  /** Directional spray — used for blood and impact sparks off a hit. */
  function spray(x, y, z, dx, dy, opts) {
    const o = opts || {};
    burst(x, y, z, Object.assign({}, o, { dirX: dx, dirY: dy, dirZ: 0.3, spread: 0.5 }));
  }

  /** Lingering smoke puff. */
  function smoke(x, y, z, color, count) {
    const sheet = SpriteBake.orb(color, color);
    const n = Math.min(count || 6, MAX_PARTICLES - particles.length);
    for (let i = 0; i < n; i++) {
      particles.push({
        x: x + M.spread(0.3), y: y + M.spread(0.3), z: z + M.spread(0.2),
        vx: M.spread(0.5), vy: M.spread(0.5), vz: M.rand(0.2, 0.8),
        life: 0, maxLife: M.rand(0.8, 1.6),
        size: M.rand(0.4, 0.9), gravity: -0.3, drag: 1.4,
        sheet, additive: false, fade: 0.6, grow: 1.6,
      });
    }
  }

  /** Floating combat text. */
  function number(x, y, z, value, kind, color) {
    if (numbers.length >= MAX_NUMBERS) numbers.shift();
    numbers.push({
      x, y, z, value, kind: kind || 'normal',
      color: color || '#ffffff',
      life: 0, maxLife: kind === 'crit' ? 1.4 : 0.95,
      vz: kind === 'crit' ? 1.5 : 1.1,
      ox: M.spread(0.25), oy: M.spread(0.25),
    });
  }

  function update(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) { particles.splice(i, 1); continue; }
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vy *= d; p.vz *= d;
      p.vz -= p.gravity * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.z < 0.03) { p.z = 0.03; p.vz *= -0.35; p.vx *= 0.6; p.vy *= 0.6; }
    }
    for (let i = numbers.length - 1; i >= 0; i--) {
      const n = numbers[i];
      n.life += dt;
      if (n.life >= n.maxLife) { numbers.splice(i, 1); continue; }
      n.z += n.vz * dt;
      n.vz *= Math.exp(-2.2 * dt);
    }
  }

  /** Append particle billboards to the render list. */
  function collect(out) {
    for (const p of particles) {
      const t = p.life / p.maxLife;
      const grow = p.grow ? 1 + (p.grow - 1) * t : 1;
      out.push({
        x: p.x, y: p.y, z: p.z,
        size: p.size * grow,
        sheet: p.sheet, frame: 0,
        alpha: (1 - t) * p.fade,
        additive: p.additive,
        tintAmount: 0,
      });
    }
  }

  JJK.Particles = {
    burst, spray, smoke, number, update, collect, clear,
    get list() { return particles; },
    get numbers() { return numbers; },
    MAX_PARTICLES,
  };

  void Color;
})(window.JJK);
