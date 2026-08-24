/* ==========================================================================
   WAVE MODIFIERS

   Without these every wave is "kill everything", and wave 20 plays exactly
   like wave 5 with bigger numbers. A modifier is a single rule change
   announced up front, so the wave reads differently before it starts.
   ========================================================================== */

(function (JJK) {
  'use strict';

  const MODIFIERS = [
    { id: 'special', name: 'SPECIAL GRADE', icon: '特', color: '#ff2d78',
      desc: 'Every curse is a higher grade.',
      minWave: 6, weight: 5, tierBump: 1 },

    { id: 'swarm', name: 'SWARM', icon: '群', color: '#a855f7',
      desc: 'Twice as many, half as tough.',
      minWave: 3, weight: 6, countMult: 2.0, healthMult: 0.5 },

    { id: 'swift', name: 'ACCELERATED', icon: '疾', color: '#38bdf8',
      desc: 'They move 60% faster.',
      minWave: 4, weight: 6, speedMult: 1.6 },

    { id: 'drought', name: 'CURSED DROUGHT', icon: '涸', color: '#ffaa00',
      desc: 'Cursed energy does not regenerate.',
      minWave: 5, weight: 4, noRegen: true },

    { id: 'blackout', name: 'BLACKOUT', icon: '闇', color: '#6b7280',
      desc: 'You can barely see them coming.',
      minWave: 5, weight: 4, fogMult: 2.6 },

    { id: 'glass', name: 'GLASS', icon: '硝', color: '#f472b6',
      desc: 'They die in one hit — and so do you, nearly.',
      minWave: 8, weight: 3, healthMult: 0.18, damageMult: 2.2 },

    { id: 'relentless', name: 'RELENTLESS', icon: '執', color: '#ff6b3d',
      desc: 'No wind-up. They strike the moment they reach you.',
      minWave: 10, weight: 3, tellMult: 0.35 },

    { id: 'bounty', name: 'BOUNTY', icon: '賞', color: '#ffd166',
      desc: 'Triple score, and a guaranteed boon after this wave.',
      minWave: 4, weight: 4, scoreMult: 3, grantBoon: true },
  ];

  /** Roll a modifier for a wave, or null. Boss waves are left alone. */
  function roll(wave) {
    if (wave % 5 === 0) return null;         // boss waves are enough already
    if (wave < 3) return null;
    if (Math.random() > 0.42) return null;
    const pool = MODIFIERS.filter((m) => wave >= m.minWave);
    if (!pool.length) return null;
    let total = 0;
    for (const m of pool) total += m.weight;
    let r = Math.random() * total;
    for (const m of pool) { r -= m.weight; if (r <= 0) return m; }
    return pool[pool.length - 1];
  }

  JJK.MODIFIERS = MODIFIERS;
  JJK.rollModifier = roll;
})(window.JJK);
