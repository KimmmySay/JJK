/* ==========================================================================
   BOSS DATABASE — Special Grade curses, one every 5 waves.

   Every attack carries a `tell` (telegraph seconds). During the tell the
   boss plays its wind-up pose and a warning marker is drawn in the world.
   This is the difference between a boss that feels unfair and one that feels
   hard: you should always be able to see it coming and have time to move.

   Attack kinds are handled in game/boss.js:
     volley | aimed | beam | groundAoe | shockwave | charge
     summon | pull | phase | enrage | melee
   ========================================================================== */

(function (JJK) {
  'use strict';

  const BOSSES = {
    jogo: {
      name: 'JOGO', kanji: '漏瑚', title: 'Disaster Curse — Volcano',
      color: '#ff4500', glow: '#ffaa33',
      health: 1700, speed: 2.1, radius: 0.85, height: 2.3,
      score: 500, manaReward: 30,
      portrait: 'jogo',
      intro: 'The temperature in the room just doubled.',
      attacks: [
        { name: 'Ember Insects', kind: 'volley', cd: 2.6, tell: 0.55,
          count: 5, spread: 0.5, speed: 11, dmg: 16, homing: 1.4, burn: 4,
          color: '#ff6622' },
        { name: 'Flame Beam', kind: 'beam', cd: 6.0, tell: 1.1,
          range: 26, width: 1.6, dmg: 42, burn: 8, color: '#ff3300' },
        { name: 'Maximum: Meteor', kind: 'groundAoe', cd: 11.0, tell: 1.7,
          radius: 5.0, dmg: 78, burn: 12, color: '#ff2200', shake: 1.4 },
      ],
    },

    hanami: {
      name: 'HANAMI', kanji: '花御', title: 'Disaster Curse — Nature',
      color: '#44aa44', glow: '#88ff88',
      health: 2100, speed: 1.8, radius: 0.95, height: 2.5,
      score: 500, manaReward: 30,
      portrait: 'hanami',
      intro: 'Roots are already under the floor.',
      attacks: [
        { name: 'Wooden Ball', kind: 'aimed', cd: 2.4, tell: 0.5,
          speed: 13, dmg: 24, radius: 0.7, color: '#4a9944' },
        { name: 'Cursed Buds', kind: 'groundAoe', cd: 5.0, tell: 1.0,
          radius: 4.2, dmg: 20, manaDrain: 14, lifesteal: 1.0, color: '#66cc44' },
        { name: 'Root Eruption', kind: 'shockwave', cd: 8.5, tell: 1.3,
          radius: 6.5, dmg: 46, force: 12, color: '#3d8b3d', shake: 1.0 },
      ],
    },

    mahito: {
      name: 'MAHITO', kanji: '真人', title: 'Idle Transfiguration',
      color: '#6688cc', glow: '#99ccff',
      health: 1500, speed: 3.4, radius: 0.7, height: 2.1,
      score: 600, manaReward: 35,
      portrait: 'mahito',
      intro: 'He wants to see what shape you make.',
      attacks: [
        { name: 'Soul Touch', kind: 'charge', cd: 4.0, tell: 0.7,
          speed: 11, dmg: 44, trueDamage: true, range: 12, color: '#6688cc' },
        { name: 'Transfigured Humans', kind: 'summon', cd: 9.0, tell: 1.0,
          summon: 'transfigured', count: 3, color: '#8899dd' },
        { name: 'Polymorphic Soul', kind: 'phase', cd: 12.0, tell: 0.4,
          duration: 2.0, color: '#aaccff' },
        { name: 'Body Repel', kind: 'shockwave', cd: 7.0, tell: 0.9,
          radius: 4.6, dmg: 34, force: 16, color: '#7799dd' },
      ],
    },

    dagon: {
      name: 'DAGON', kanji: '陀艮', title: 'Disaster Curse — Ocean',
      color: '#2288aa', glow: '#55ddff',
      health: 1900, speed: 1.9, radius: 1.0, height: 2.6,
      score: 550, manaReward: 30,
      // No art on disk — rendered procedurally as a special-grade curse.
      procedural: { tier: 'special', body: '#123a4a', glow: '#55ddff', eyes: 6 },
      intro: 'The floor is water now. It was always water.',
      attacks: [
        { name: 'Death Swarm', kind: 'volley', cd: 3.2, tell: 0.6,
          count: 8, spread: 0.75, speed: 10, dmg: 13, homing: 1.8, color: '#3399bb' },
        { name: 'Tidal Wave', kind: 'shockwave', cd: 7.0, tell: 1.2,
          radius: 7.5, dmg: 38, force: 22, color: '#2288aa', shake: 1.1 },
        { name: 'Whirlpool', kind: 'pull', cd: 10.0, tell: 1.0,
          radius: 6.5, force: 9, dps: 18, duration: 3.0, color: '#44ccff' },
      ],
    },

    fingerBearer: {
      name: 'FINGER BEARER', kanji: '指', title: "Bearer of Sukuna's Finger",
      color: '#aa0044', glow: '#ff4488',
      health: 2700, speed: 1.6, radius: 1.15, height: 2.8,
      score: 700, manaReward: 40,
      procedural: { tier: 'special', body: '#3a0620', glow: '#ff2d78', eyes: 8 },
      intro: 'It swallowed a finger. It is still growing.',
      attacks: [
        { name: 'Crushing Blow', kind: 'melee', cd: 2.2, tell: 0.65,
          range: 3.4, arc: 1.5, dmg: 52, force: 20, color: '#cc0044' },
        { name: 'Cursed Roar', kind: 'shockwave', cd: 8.0, tell: 1.2,
          radius: 7.0, dmg: 30, stun: 1.0, force: 10, color: '#ff2266', shake: 1.2 },
        { name: 'Charge', kind: 'charge', cd: 6.5, tell: 0.9,
          speed: 9, dmg: 48, range: 14, force: 18, color: '#aa0044' },
        { name: 'Berserk', kind: 'enrage', cd: 16.0, tell: 0.8,
          duration: 5.0, speedMult: 1.6, damageMult: 1.4, color: '#ff0055' },
      ],
    },
  };

  for (const id of Object.keys(BOSSES)) BOSSES[id].id = id;

  /** Rotation order, matching the original game. */
  const BOSS_ORDER = ['jogo', 'hanami', 'mahito', 'dagon', 'fingerBearer'];

  /** Which boss (if any) belongs to a wave. Bosses appear every 5 waves. */
  function bossForWave(wave) {
    if (wave % 5 !== 0) return null;
    const idx = (Math.floor(wave / 5) - 1) % BOSS_ORDER.length;
    return BOSS_ORDER[idx];
  }

  /** Scaling per appearance, ported from the original (+25%/+15%/+5%). */
  function bossScaling(wave) {
    const n = Math.max(1, Math.floor(wave / 5));
    return {
      health: 1 + (n - 1) * 0.25,
      damage: 1 + (n - 1) * 0.15,
      speed: 1 + (n - 1) * 0.05,
    };
  }

  JJK.BOSSES = BOSSES;
  JJK.BOSS_ORDER = BOSS_ORDER;
  JJK.bossForWave = bossForWave;
  JJK.bossScaling = bossScaling;
})(window.JJK);
