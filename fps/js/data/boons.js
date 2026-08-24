/* ==========================================================================
   BOONS — in-run upgrades, offered every 3 waves.

   The gap these fill: without them a run is the same character with the same
   numbers from wave 1 to wave 30. Nothing about YOU changes, so there is no
   build, no escalation, and no decision outside of combat. Three choices
   every three waves means 23 characters x a diverging upgrade path.

   Shape:
     mods    folded into the player's stat block. `damage` and `speed`
             multiply; everything else adds.
     flags   arbitrary values other systems read (see Player.flag).
     char    if present, only offered to that character — this is where the
             character-specific upgrades live.
     weight  relative offer chance. Legendaries are deliberately rare.
   ========================================================================== */

(function (JJK) {
  'use strict';

  const BOONS = [
    /* ---------------- common: raw stats ---------------- */
    { id: 'ce-flow', name: 'Cursed Energy Flow', icon: '流', rarity: 'common', weight: 10,
      desc: '+15% damage.', mods: { damage: 1.15 } },
    { id: 'toughened', name: 'Toughened', icon: '硬', rarity: 'common', weight: 10,
      desc: '+120 max health, and heal for it now.', mods: { maxHealth: 120 } },
    { id: 'fleet', name: 'Fleet', icon: '疾', rarity: 'common', weight: 10,
      desc: '+12% movement speed.', mods: { speed: 1.12 } },
    { id: 'hardened', name: 'Hardened', icon: '盾', rarity: 'common', weight: 9,
      desc: 'Take 15% less damage.', mods: { armor: 0.15 } },
    { id: 'sharpened', name: 'Sharpened Intent', icon: '鋭', rarity: 'common', weight: 9,
      desc: '+6% critical chance.', mods: { critBonus: 0.06 } },
    { id: 'reservoir', name: 'Deep Reservoir', icon: '蓄', rarity: 'common', weight: 9,
      desc: 'Cursed energy regenerates 80% faster.', flags: { manaRate: 1.8 } },
    { id: 'quickened', name: 'Quickened', icon: '早', rarity: 'common', weight: 9,
      desc: 'Ability cooldowns are 18% shorter.', flags: { cdMult: 0.82 } },
    { id: 'siphon', name: 'Siphon', icon: '吸', rarity: 'common', weight: 8,
      desc: 'Heal for 6% of damage dealt.', mods: { lifesteal: 0.06 } },
    { id: 'harvest', name: 'Harvest', icon: '収', rarity: 'common', weight: 8,
      desc: 'Kills restore 6 cursed energy.', flags: { killEnergy: 6 } },

    /* ---------------- rare: mechanics ---------------- */
    { id: 'black-tide', name: 'Black Tide', icon: '黒', rarity: 'rare', weight: 6,
      desc: 'Black Flash and Bone Crush chance +7%.', mods: { critBonus: 0.07 },
      flags: { critFx: 1 } },
    { id: 'in-the-zone', name: 'Sustained Zone', icon: '域', rarity: 'rare', weight: 6,
      desc: 'The Zone lasts 15s longer and grants +20% damage instead of 10%.',
      flags: { zoneBonus: 0.20, zoneTime: 15 } },
    { id: 'twin-step', name: 'Twin Step', icon: '歩', rarity: 'rare', weight: 6,
      desc: 'One extra dash charge, and dashes recover 40% faster.',
      flags: { dashCharges: 1, dashCd: 0.6 } },
    { id: 'third-wind', name: 'Third Wind', icon: '風', rarity: 'rare', weight: 5,
      desc: 'Gain a third jump.', flags: { extraJump: 1 } },
    { id: 'momentum', name: 'Bloodlust', icon: '狂', rarity: 'rare', weight: 6,
      desc: 'Your kill chain builds twice as fast and decays half as fast.',
      flags: { comboGain: 2, comboDecay: 0.5 } },
    { id: 'overflow', name: 'Overflow', icon: '溢', rarity: 'rare', weight: 5,
      desc: 'Domain Expansions last 60% longer.', flags: { domainTime: 1.6 } },
    { id: 'piercer', name: 'Piercing Intent', icon: '貫', rarity: 'rare', weight: 5,
      desc: 'Projectiles pass through one extra enemy.', flags: { pierce: 1 } },
    { id: 'velocity', name: 'Velocity', icon: '速', rarity: 'rare', weight: 5,
      desc: 'Projectiles travel 45% faster.', flags: { projSpeed: 1.45 } },
    { id: 'wide-reach', name: 'Wide Reach', icon: '広', rarity: 'rare', weight: 5,
      desc: 'Melee range and AOE radius +30%.', flags: { areaMult: 1.3 } },
    { id: 'reprisal', name: 'Reprisal', icon: '返', rarity: 'rare', weight: 5,
      desc: 'Reflect 35% of damage taken back at whatever hit you.',
      mods: { reflect: 0.35 } },
    { id: 'vital-crit', name: 'Vital Strike', icon: '活', rarity: 'rare', weight: 5,
      desc: 'Critical hits heal you for 25 HP.', flags: { critHeal: 25 } },
    { id: 'lightfoot', name: 'Lightfoot', icon: '軽', rarity: 'rare', weight: 5,
      desc: 'Airborne, you take 70% less damage from everything.',
      flags: { airGuard: 1 } },

    /* ---------------- legendary ---------------- */
    { id: 'binding-vow', name: 'Binding Vow', icon: '縛', rarity: 'legendary', weight: 2,
      desc: 'DOUBLE damage. Your max health is halved.',
      mods: { damage: 2.0 }, flags: { healthMult: 0.5 } },
    { id: 'six-eyes', name: 'Six Eyes', icon: '眼', rarity: 'legendary', weight: 2,
      desc: 'Abilities cost no cursed energy while above 60% energy.',
      flags: { sixEyes: 1 } },
    { id: 'undying', name: 'Reverse Cursed Rebirth', icon: '蘇', rarity: 'legendary', weight: 2,
      desc: 'Once per run, survive a lethal hit at 40% health.',
      flags: { revive: 1 } },
    { id: 'chain-death', name: 'Cascade', icon: '連', rarity: 'legendary', weight: 2,
      desc: 'Enemies explode when they die, damaging everything near them.',
      flags: { deathBlast: 1 } },
    { id: 'black-king', name: 'King of Black Flash', icon: '閃', rarity: 'legendary', weight: 2,
      desc: 'Critical hits deal 1.6x their already-critical damage.',
      flags: { critMult: 1.6 } },

    /* ---------------- character-specific ---------------- */
    { id: 'gojo-limitless', name: 'Limitless Refinement', icon: '無', rarity: 'rare', weight: 7,
      char: 'gojo', desc: 'Infinity drains half as much cursed energy.',
      flags: { infinityDrain: 0.5 } },
    { id: 'gojofull-limitless', name: 'Limitless Refinement', icon: '無', rarity: 'rare', weight: 7,
      char: 'gojofull', desc: 'Infinity drains half as much cursed energy.',
      flags: { infinityDrain: 0.5 } },
    { id: 'megumi-pack', name: 'Wider Shadow', icon: '影', rarity: 'rare', weight: 7,
      char: 'megumi', desc: 'Every summon brings one extra shikigami, and they last 50% longer.',
      flags: { summonExtra: 1, summonLife: 1.5 } },
    { id: 'meguna-pack', name: 'Wider Shadow', icon: '影', rarity: 'rare', weight: 7,
      char: 'meguna', desc: 'Every summon brings one extra shikigami, and they last 50% longer.',
      flags: { summonExtra: 1, summonLife: 1.5 } },
    { id: 'yuji-chain', name: 'Unbroken Chain', icon: '鎖', rarity: 'rare', weight: 7,
      char: 'yuji', desc: 'Your Black Flash chain climbs to 60% and never resets on a miss.',
      flags: { bfChainMax: 0.60, bfNoReset: 1 } },
    { id: 'sukuna-cleave', name: 'Twenty Fingers', icon: '指', rarity: 'rare', weight: 7,
      char: 'sukuna', desc: 'Cleave fires 3 extra blades.', flags: { volleyExtra: 3 } },
    { id: 'maki-restriction', name: 'Deeper Restriction', icon: '禁', rarity: 'rare', weight: 7,
      char: 'maki', desc: 'Bone Crush chance +12%.', mods: { critBonus: 0.12 } },
    { id: 'toji-restriction', name: 'Heavenly Perfection', icon: '天', rarity: 'rare', weight: 7,
      char: 'toji', desc: 'Bone Crush chance +12% and +20% move speed.',
      mods: { critBonus: 0.12, speed: 1.2 } },
    { id: 'hakari-rig', name: 'Rigged Reels', icon: '賭', rarity: 'rare', weight: 7,
      char: 'hakari', desc: 'Gamble Spin can no longer bust, and jackpots are twice as likely.',
      flags: { riggedGamble: 1 } },
    { id: 'nobara-nails', name: 'Full Quiver', icon: '釘', rarity: 'rare', weight: 7,
      char: 'nobara', desc: 'Hairpin fires 3 extra nails and Resonance hits 60% harder.',
      flags: { volleyExtra: 3, resonanceMult: 1.6 } },
    { id: 'kashimo-charge', name: 'Standing Current', icon: '雷', rarity: 'rare', weight: 7,
      char: 'kashimo', desc: 'Lightning chains to 3 extra targets.', flags: { chainExtra: 3 } },
    { id: 'jogo-burn', name: 'Ceaseless Ember', icon: '炎', rarity: 'rare', weight: 7,
      char: 'jogo', desc: 'Burn deals double damage and lasts twice as long.',
      flags: { burnMult: 2 } },
    { id: 'hanami-drain', name: 'Deeper Roots', icon: '根', rarity: 'rare', weight: 7,
      char: 'hanami', desc: 'Lifesteal +25%.', mods: { lifesteal: 0.25 } },
    { id: 'choso-blood', name: 'Blood Surge', icon: '血', rarity: 'rare', weight: 7,
      char: 'choso', desc: 'Regeneration tripled.', mods: { regen: 9 } },
    { id: 'nanami-overtime', name: 'Permanent Overtime', icon: '残', rarity: 'legendary', weight: 4,
      char: 'nanami', desc: 'Overtime never expires.', flags: { permanentBuff: 'nanami:l' } },
    { id: 'inumaki-throat', name: 'Steel Throat', icon: '喉', rarity: 'rare', weight: 7,
      char: 'inumaki', desc: 'Cursed Speech no longer costs you health.',
      flags: { noSelfDamage: 1 } },
    { id: 'todo-clap', name: 'Perfect Rhythm', icon: '拍', rarity: 'rare', weight: 7,
      char: 'todo', desc: 'Boogie Woogie has no cooldown.', flags: { freeSlot: 'k' } },
  ];

  const RARITY = {
    common: { color: '#9fb4c8', label: 'COMMON' },
    rare: { color: '#7cc4ff', label: 'RARE' },
    legendary: { color: '#ffbe3d', label: 'LEGENDARY' },
  };

  /** Three offers for this character, no repeats of what you already hold. */
  function roll(charId, owned, count) {
    const pool = BOONS.filter((b) => {
      if (owned && owned.some((o) => o.id === b.id)) return false;
      if (b.char && b.char !== charId) return false;
      return true;
    });
    const out = [];
    const bag = pool.slice();
    const n = count || 3;
    for (let i = 0; i < n && bag.length; i++) {
      let total = 0;
      for (const b of bag) total += b.weight || 5;
      let r = Math.random() * total;
      let pick = 0;
      for (let j = 0; j < bag.length; j++) {
        r -= bag[j].weight || 5;
        if (r <= 0) { pick = j; break; }
      }
      out.push(bag[pick]);
      bag.splice(pick, 1);
    }
    return out;
  }

  JJK.BOONS = BOONS;
  JJK.BOON_RARITY = RARITY;
  JJK.rollBoons = roll;
})(window.JJK);
