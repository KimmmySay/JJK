/* ==========================================================================
   DOMAIN EXPANSIONS

   A domain should feel like the rules changed, not like a big attack played.
   So each one does three things at once:
     1. barrier      the arena is visually replaced (postfx takes over)
     2. sure-hit     continuous guaranteed damage — no dodging inside
     3. a rider      the mechanic that makes it *that* character's domain

   `style` selects the renderer routine in engine/postfx.js; `palette` and
   `glyphs` re-skin it, which is how 11 domains get distinct looks without 11
   bespoke renderers.
   ========================================================================== */

(function (JJK) {
  'use strict';

  const DOMAINS = {
    unlimitedVoid: {
      name: 'UNLIMITED VOID', kanji: '無量空処', owner: 'gojo',
      duration: 7.0, dps: 62, radius: 999,
      style: 'void',
      palette: { a: '#001a4d', b: '#00ffff', c: '#ffffff', bg: '#01010a' },
      glyphs: '∞無量空処0123456789',
      // Infinite information: everything inside is frozen in place.
      rider: { stun: true, slow: 0.02, manaRegen: 3.5 },
      // The arena itself becomes the domain. An opaque screen overlay
      // just blindfolds the player; changing the landscape is what makes
      // it feel like the rules changed while you can still fight.
      landscape: { fog: '#00081f', fogDensity: 0.020, floorNear: '#060c20', floorFar: '#000208', ceilTop: '#000105', ceilBottom: '#001233', gridColor: '#39d0ff', moteColor: '#9fe8ff', ambient: 0.04, sky: 'gradient' },
      caption: 'Too much information. They cannot even move.',
    },

    malevolentShrine: {
      name: 'MALEVOLENT SHRINE', kanji: '伏魔御廚子', owner: 'sukuna',
      duration: 6.5, dps: 115, radius: 999,
      style: 'shrine',
      palette: { a: '#1a0008', b: '#ff0044', c: '#ffffff', bg: '#0a0004' },
      glyphs: '伏魔御廚子解捌',
      // No barrier — it just keeps cutting.
      rider: { cleave: 0.55, trueDamage: true },
      // The arena itself becomes the domain. An opaque screen overlay
      // just blindfolds the player; changing the landscape is what makes
      // it feel like the rules changed while you can still fight.
      landscape: { fog: '#160003', fogDensity: 0.050, floorNear: '#3a0510', floorFar: '#12000a', ceilTop: '#0a0002', ceilBottom: '#2c0209', gridColor: '#ff2b4d', moteColor: '#ff6b7d', ambient: 0.10, sky: 'gradient' },
      caption: 'A shrine with no walls. Nothing is spared.',
    },

    soulShrine: {
      name: 'SOUL SHRINE', kanji: '魂魄の社', owner: 'yuji',
      duration: 6.5, dps: 88, radius: 999,
      style: 'shrine',
      palette: { a: '#2a0a0a', b: '#ff5a3c', c: '#ffe9d0', bg: '#0d0403' },
      glyphs: '魂魄拳',
      rider: { lifesteal: 0.35, critBonus: 0.25 },
      // The arena itself becomes the domain. An opaque screen overlay
      // just blindfolds the player; changing the landscape is what makes
      // it feel like the rules changed while you can still fight.
      landscape: { fog: '#1a0703', fogDensity: 0.048, floorNear: '#3d1608', floorFar: '#150502', ceilTop: '#0d0301', ceilBottom: '#331004', gridColor: '#ff7a3c', moteColor: '#ffb27a', ambient: 0.08, sky: 'gradient' },
      caption: 'Every soul he ever touched, swinging with him.',
    },

    chimeraShadow: {
      name: 'CHIMERA SHADOW GARDEN', kanji: '嵌合暗翳庭', owner: 'megumi',
      duration: 7.5, dps: 52, radius: 999,
      style: 'garden',
      palette: { a: '#050510', b: '#4a90d9', c: '#aad4ff', bg: '#02020a' },
      glyphs: '影犬蛇兎',
      // The floor becomes shadow — shikigami pour out of it.
      rider: { summon: 'divineDog', summonRate: 1.1, maxSummons: 8 },
      // The arena itself becomes the domain. An opaque screen overlay
      // just blindfolds the player; changing the landscape is what makes
      // it feel like the rules changed while you can still fight.
      landscape: { fog: '#01030a', fogDensity: 0.042, floorNear: '#05070f', floorFar: '#000104', ceilTop: '#000104', ceilBottom: '#04101f', gridColor: '#4a90d9', moteColor: '#aad4ff', ambient: 0.06, sky: 'gradient' },
      caption: 'The shadows are deep enough now.',
    },

    mutualLove: {
      name: 'AUTHENTIC MUTUAL LOVE', kanji: '真贋相愛', owner: 'yuta',
      duration: 7.0, dps: 76, radius: 999,
      style: 'bloom',
      palette: { a: '#1a0033', b: '#c084fc', c: '#ffd6ff', bg: '#080012' },
      glyphs: '愛里香',
      rider: { copyAll: true, damage: 1.4 },
      // The arena itself becomes the domain. An opaque screen overlay
      // just blindfolds the player; changing the landscape is what makes
      // it feel like the rules changed while you can still fight.
      landscape: { fog: '#12002a', fogDensity: 0.042, floorNear: '#2c0d4d', floorFar: '#0d0018', ceilTop: '#08000f', ceilBottom: '#2a0642', gridColor: '#c084fc', moteColor: '#ffd6ff', ambient: 0.07, sky: 'gradient' },
      caption: 'She never actually left.',
    },

    idleDeath: {
      name: 'IDLE DEATH GAMBLE', kanji: '坐殺博徒', owner: 'hakari',
      duration: 8.0, dps: 58, radius: 999,
      style: 'gamble',
      palette: { a: '#241800', b: '#ffaa00', c: '#fff3c4', bg: '#0d0900' },
      glyphs: '賭博柏7777',
      // The jackpot pays out for the whole duration.
      rider: { jackpot: true, infiniteMana: true, regen: 26 },
      // The arena itself becomes the domain. An opaque screen overlay
      // just blindfolds the player; changing the landscape is what makes
      // it feel like the rules changed while you can still fight.
      landscape: { fog: '#1a1200', fogDensity: 0.038, floorNear: '#3d2f06', floorFar: '#140d00', ceilTop: '#0d0900', ceilBottom: '#33260a', gridColor: '#ffc233', moteColor: '#fff3c4', ambient: 0.07, sky: 'gradient' },
      caption: 'The doors open. The reels never stop.',
    },

    hairpin: {
      name: 'HAIRPIN', kanji: '簪', owner: 'nobara',
      duration: 6.0, dps: 70, radius: 999,
      style: 'bloom',
      palette: { a: '#2a0018', b: '#ff69b4', c: '#ffd9ec', bg: '#0f0008' },
      glyphs: '簪釘薔薇',
      rider: { nailAll: true, resonanceBonus: 1.6 },
      // The arena itself becomes the domain. An opaque screen overlay
      // just blindfolds the player; changing the landscape is what makes
      // it feel like the rules changed while you can still fight.
      landscape: { fog: '#20000f', fogDensity: 0.042, floorNear: '#3f0b24', floorFar: '#160008', ceilTop: '#0d0005', ceilBottom: '#33061c', gridColor: '#ff69b4', moteColor: '#ffd9ec', ambient: 0.07, sky: 'gradient' },
      caption: 'Every nail she has ever driven, all at once.',
    },

    selfEmbodiment: {
      name: 'SELF-EMBODIMENT OF PERFECTION', kanji: '自閉円頓裹', owner: 'mahito',
      duration: 6.5, dps: 95, radius: 999,
      style: 'garden',
      palette: { a: '#001a2a', b: '#4169e1', c: '#bfe4ff', bg: '#00060f' },
      glyphs: '自閉円頓裹魂',
      // Sure-hit soul damage ignores everything.
      rider: { trueDamage: true, soulTouch: true },
      // The arena itself becomes the domain. An opaque screen overlay
      // just blindfolds the player; changing the landscape is what makes
      // it feel like the rules changed while you can still fight.
      landscape: { fog: '#00101c', fogDensity: 0.046, floorNear: '#07223a', floorFar: '#00080f', ceilTop: '#000508', ceilBottom: '#052033', gridColor: '#4fa8ff', moteColor: '#bfe4ff', ambient: 0.08, sky: 'gradient' },
      caption: 'He can touch your soul directly in here.',
    },

    deadlySentencing: {
      name: 'DEADLY SENTENCING', kanji: '誅伏賜死', owner: 'higuruma',
      duration: 6.0, dps: 40, radius: 999,
      style: 'court',
      palette: { a: '#0d1414', b: '#9fc0c0', c: '#ffffff', bg: '#050909' },
      glyphs: '誅伏賜死裁',
      // The verdict: heavily wounded enemies are executed outright.
      rider: { executeBelow: 0.34, confiscate: true },
      // The arena itself becomes the domain. An opaque screen overlay
      // just blindfolds the player; changing the landscape is what makes
      // it feel like the rules changed while you can still fight.
      landscape: { fog: '#0d1414', fogDensity: 0.028, floorNear: '#273232', floorFar: '#0a1010', ceilTop: '#0a1010', ceilBottom: '#2d3d3d', gridColor: '#cfe0e0', moteColor: '#ffffff', ambient: 0.03, sky: 'gradient' },
      caption: 'The court is in session. The sentence is death.',
    },

    ironMountain: {
      name: 'COFFIN OF THE IRON MOUNTAIN', kanji: '蓋棺鉄囲山', owner: 'jogo',
      duration: 6.5, dps: 105, radius: 999,
      style: 'inferno',
      palette: { a: '#2a0800', b: '#ff4500', c: '#ffd27a', bg: '#120300' },
      glyphs: '蓋棺鉄囲山炎',
      rider: { burn: 22 },
      // The arena itself becomes the domain. An opaque screen overlay
      // just blindfolds the player; changing the landscape is what makes
      // it feel like the rules changed while you can still fight.
      landscape: { fog: '#1c0500', fogDensity: 0.052, floorNear: '#5e1600', floorFar: '#1a0400', ceilTop: '#200600', ceilBottom: '#6e2100', gridColor: '#ff6a1a', moteColor: '#ffc46a', ambient: 0.12, sky: 'gradient' },
      caption: 'A volcano, closed over your head.',
    },

    deepForest: {
      name: 'DEEP FOREST GARDEN', kanji: '深奥の森庭', owner: 'hanami',
      duration: 7.5, dps: 66, radius: 999,
      style: 'garden',
      palette: { a: '#04170a', b: '#4ade80', c: '#d9ffe4', bg: '#020c05' },
      glyphs: '森花御芽',
      rider: { lifesteal: 0.7, regen: 12 },
      // The arena itself becomes the domain. An opaque screen overlay
      // just blindfolds the player; changing the landscape is what makes
      // it feel like the rules changed while you can still fight.
      landscape: { fog: '#04160c', fogDensity: 0.036, floorNear: '#14401f', floorFar: '#03120a', ceilTop: '#02100a', ceilBottom: '#0e4022', gridColor: '#4ade80', moteColor: '#d9ffe4', ambient: 0.06, sky: 'gradient' },
      caption: 'Roots through the floor. It drinks while you die.',
    },
  };

  for (const id of Object.keys(DOMAINS)) DOMAINS[id].id = id;

  JJK.DOMAINS = DOMAINS;
})(window.JJK);
