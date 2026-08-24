/* ==========================================================================
   CHARACTER DATABASE — 23 playable sorcerers and curses.

   The original game hand-wrote a bespoke function per character (~1200 lines
   of near-duplicate switch statements). Here every ability is DATA fed to a
   small set of archetypes in game/abilities.js, so a character is defined by
   what makes it distinct, not by copy-pasted plumbing.

   ARCHETYPES
     melee       arc sweep in front of you        arc, range, dmg, knock
     projectile  travelling orb                   speed, dmg, radius, explode
     volley      N projectiles with spread        count, spread
     beam        instant piercing line            range, width, dmg
     burst       AOE placed ahead of you          range, radius, dmg, force
     vortex      lingering pull/push field        radius, force, dps
     summon      allied entity                    summon, count, life
     buff        timed self modifier              mods, duration
     heal        restore HP                       amount
     blink       teleport + damage on arrival     range
     domain      domain expansion                 domain id

   Units: distances are world cells, time is seconds, dmg is HP.
   `cost` is mana (max 100). Physical characters cost 0.
   ========================================================================== */

(function (JJK) {
  'use strict';

  const CHARACTERS = {

    /* ================= CORE ROSTER ================= */

    gojo: {
      name: 'SATORU GOJO', kanji: '五条 悟', short: 'Gojo',
      color: '#1e90ff', glow: '#00ffff',
      health: 500, speed: 8, blackFlash: 0.10, hasRCT: true,
      role: 'Zoner', passiveKey: 'Infinity',
      passive: 'Hold PASSIVE for Infinity — incoming damage is nullified while cursed energy drains.',
      blurb: 'The strongest. Space itself answers to him.',
      abilities: {
        // Lapse: Blue — attraction. Slow enough to steer a fight with, and
        // it drags everything toward it the entire flight. Re-press Q to
        // collapse it early.
        j: { name: 'Blue', icon: '蒼', cost: 6, cd: 1.2, kind: 'vortex',
             radius: 4.0, force: 14, dps: 34, life: 1.3,
             travels: { speed: 11, range: 26, size: 2.2 },
             color: '#1e6fff', core: '#e8f6ff' },
        // Reversal: Red — repulsion. Faster, and it shoves things aside on
        // the way in. Re-press E to detonate.
        k: { name: 'Red', icon: '赫', cost: 12, cd: 1.7, kind: 'burst',
             radius: 4.6, dmg: 115, force: 22,
             travels: { speed: 16, range: 26, size: 2.0 },
             color: '#ff2b2b', core: '#ffe6c8', shake: 0.9 },
        l: { name: 'Hollow Purple', icon: '茈', cost: 26, cd: 5.5, kind: 'beam',
             range: 30, width: 1.7, dmg: 280, color: '#9932cc', core: '#ff66ff',
             shake: 1.3, voidOrb: true },
        q: { name: 'Unlimited Void', icon: '∞', cost: 50, cd: 34, kind: 'domain', domain: 'unlimitedVoid' },
      },
    },

    yuji: {
      name: 'YUJI ITADORI', kanji: '虎杖 悠仁', short: 'Yuji',
      color: '#ff6b6b', glow: '#ffaaaa',
      health: 600, speed: 9, blackFlash: 0.15, blackFlashChain: true, hasRCT: true,
      role: 'Brawler', passiveKey: null,
      passive: 'Black Flash king. Consecutive crits chain the odds upward: 15% → 25% → 35% → 45%.',
      blurb: 'Sukuna\'s vessel. Hits far above his weight class.',
      abilities: {
        j: { name: 'Divergent Fist', icon: '拳', cost: 3, cd: 0.5, kind: 'melee',
             range: 3.0, arc: 1.15, dmg: 58, knock: 7, echo: { delay: 0.16, mult: 0.55 },
             color: '#ff6b6b', fx: 'punch' },
        k: { name: 'Blood Edge', icon: '血', cost: 7, cd: 0.9, kind: 'projectile',
             speed: 22, dmg: 74, radius: 0.55, color: '#cc2244', core: '#ff8899', shape: 'blood' },
        l: { name: 'Soul Dismantle', icon: '魂', cost: 14, cd: 2.6, kind: 'melee',
             range: 4.4, arc: 2.0, dmg: 150, knock: 12, trueDamage: true,
             color: '#ff4466', fx: 'slash', shake: 0.6 },
        q: { name: 'Soul Shrine', icon: '駅', cost: 50, cd: 34, kind: 'domain', domain: 'soulShrine' },
      },
    },

    sukuna: {
      name: 'RYOMEN SUKUNA', kanji: '両面宿儺', short: 'Sukuna',
      color: '#ff0044', glow: '#ff6688',
      health: 450, speed: 9, blackFlash: 0.10, hasRCT: true,
      role: 'Executioner', passiveKey: null,
      passive: 'Black Flash odds rise to 25% against stunned or slowed targets.',
      blurb: 'King of Curses. Every cut is already finished.',
      abilities: {
        j: { name: 'Dismantle', icon: '解', cost: 3, cd: 0.36, kind: 'melee',
             range: 4.6, arc: 0.75, dmg: 52, knock: 4, color: '#ff0044', fx: 'slash' },
        k: { name: 'Cleave', icon: '捌', cost: 8, cd: 0.85, kind: 'volley',
             count: 3, spread: 0.30, speed: 26, dmg: 46, radius: 0.5,
             color: '#ff2255', core: '#ffdddd', shape: 'shard' },
        l: { name: 'World Slash', icon: '斬', cost: 22, cd: 5.0, kind: 'beam',
             range: 34, width: 1.2, dmg: 300, trueDamage: true,
             color: '#ff0044', core: '#ffffff', shake: 1.2 },
        q: { name: 'Malevolent Shrine', icon: '伏', cost: 50, cd: 34, kind: 'domain', domain: 'malevolentShrine' },
      },
    },

    megumi: {
      name: 'MEGUMI FUSHIGURO', kanji: '伏黒 恵', short: 'Megumi',
      color: '#4a90d9', glow: '#88bbff',
      health: 400, speed: 7, blackFlash: 0.05, hasRCT: false,
      role: 'Summoner', passiveKey: 'Shikigami',
      passive: 'No RCT. Shikigami fight alongside you — PASSIVE recalls them to your side.',
      blurb: 'Ten Shadows. He never fights alone.',
      abilities: {
        j: { name: 'Divine Dogs', icon: '犬', cost: 8, cd: 1.4, kind: 'summon',
             summon: 'divineDog', count: 2, life: 18, color: '#4a90d9' },
        k: { name: 'Nue', icon: '鵺', cost: 12, cd: 1.7, kind: 'projectile',
             speed: 17, dmg: 82, radius: 0.7, homing: 3.0, stun: 0.5,
             color: '#66ccff', core: '#ffffff', shape: 'nueBolt' },
        l: { name: 'Max Elephant', icon: '象', cost: 18, cd: 3.4, kind: 'burst',
             range: 8, radius: 5.0, dmg: 130, force: 13, color: '#5599dd', shake: 0.8 },
        q: { name: 'Chimera Shadow Garden', icon: '影', cost: 50, cd: 34, kind: 'domain', domain: 'chimeraShadow' },
      },
    },

    yuta: {
      name: 'YUTA OKKOTSU', kanji: '乙骨 憂太', short: 'Yuta',
      color: '#9932cc', glow: '#cc66ff',
      health: 550, speed: 8, blackFlash: 0.08, hasRCT: true,
      role: 'Copier', passiveKey: null,
      passive: 'Rika auto-attacks nearby enemies. Copy borrows another sorcerer\'s technique at random.',
      blurb: 'Special Grade. A love that will not let go.',
      abilities: {
        j: { name: 'Rika Strike', icon: '里', cost: 4, cd: 0.55, kind: 'melee',
             range: 4.0, arc: 1.5, dmg: 66, knock: 10, color: '#9932cc', fx: 'slash' },
        k: { name: 'Copy: Random', icon: '写', cost: 10, cd: 1.2, kind: 'copy', color: '#cc66ff' },
        l: { name: 'Cursed Speech', icon: '言', cost: 16, cd: 2.4, kind: 'burst',
             range: 6, radius: 4.4, dmg: 110, stun: 1.1, force: 9, color: '#b07cff' },
        q: { name: 'Authentic Mutual Love', icon: '愛', cost: 50, cd: 34, kind: 'domain', domain: 'mutualLove' },
      },
    },

    hakari: {
      name: 'KINJI HAKARI', kanji: '秤 金次', short: 'Hakari',
      color: '#ffaa00', glow: '#ffdd66',
      health: 500, speed: 8, blackFlash: 0.08, hasRCT: 'jackpot',
      role: 'Gambler', passiveKey: null,
      passive: 'RCT only works during JACKPOT. Gamble Spin rolls for it — a jackpot grants infinite cursed energy and regeneration.',
      blurb: 'Idle Death Gamble. Pure variance, weaponised.',
      abilities: {
        j: { name: 'Door Slam', icon: '扉', cost: 3, cd: 0.65, kind: 'melee',
             range: 3.4, arc: 1.3, dmg: 62, knock: 14, color: '#ffaa00', fx: 'punch' },
        k: { name: 'Ball Strike', icon: '球', cost: 7, cd: 0.8, kind: 'projectile',
             speed: 24, dmg: 70, radius: 0.6, bounce: 3, color: '#ffcc33', core: '#ffffff', shape: 'ball' },
        l: { name: 'Gamble Spin', icon: '賭', cost: 12, cd: 3.0, kind: 'gamble', color: '#ffdd66' },
        q: { name: 'Idle Death Gamble', icon: '柏', cost: 50, cd: 34, kind: 'domain', domain: 'idleDeath' },
      },
    },

    maki: {
      name: 'MAKI ZENIN', kanji: '禪院 真希', short: 'Maki',
      color: '#44ff44', glow: '#88ff88',
      health: 350, speed: 11, blackFlash: 0, boneCrush: 0.15, hasRCT: false,
      role: 'Physical', passiveKey: null,
      passive: 'Zero cursed energy: abilities are free, but no Black Flash and no RCT. 15% BONE CRUSH instead.',
      blurb: 'Heavenly Restriction. She does not need cursed energy.',
      abilities: {
        j: { name: 'Spear Spin', icon: '回', cost: 0, cd: 0.45, kind: 'melee',
             range: 3.6, arc: 3.4, dmg: 54, knock: 8, color: '#44ff44', fx: 'slash' },
        k: { name: 'Heavy Strike', icon: '重', cost: 0, cd: 0.7, kind: 'melee',
             range: 4.2, arc: 0.9, dmg: 96, knock: 18, color: '#66ff66', fx: 'slash', shake: 0.5 },
        l: { name: 'Split Soul', icon: '魂', cost: 0, cd: 1.9, kind: 'melee',
             range: 3.8, arc: 1.1, dmg: 128, trueDamage: true, knock: 6,
             color: '#aaffaa', fx: 'slash' },
        q: { name: 'Dragon Bone', icon: '龍', cost: 0, cd: 7.0, kind: 'blink',
             range: 9, dmg: 190, radius: 2.2, color: '#ccffcc', shake: 0.9 },
      },
    },

    mahoraga: {
      name: 'MAHORAGA', kanji: '魔虚羅', short: 'Mahoraga',
      color: '#ffaa00', glow: '#ffdd88',
      health: 800, speed: 6, blackFlash: 0, boneCrush: 0.20, hasRCT: false,
      role: 'Adapter', passiveKey: 'Adaptation',
      passive: 'ADAPTATION — repeated damage from the same source is progressively nullified. 20% Bone Crush.',
      blurb: 'The divine general. It learns, then it wins.',
      abilities: {
        j: { name: 'Sword of Extermination', icon: '剣', cost: 0, cd: 0.65, kind: 'melee',
             range: 4.6, arc: 1.2, dmg: 88, knock: 12, color: '#ffaa00', fx: 'slash' },
        k: { name: 'Wheel Spin', icon: '輪', cost: 0, cd: 2.6, kind: 'buff',
             duration: 8, mods: { damage: 1.3, armor: 0.55 }, color: '#ffcc44', label: 'ADAPTING' },
        l: { name: 'Divine Strike', icon: '神', cost: 0, cd: 3.4, kind: 'burst',
             range: 6, radius: 4.6, dmg: 165, force: 15, color: '#ffbb33', shake: 0.9 },
        q: { name: 'Eight-Handled Sword', icon: '八', cost: 0, cd: 9.0, kind: 'beam',
             range: 26, width: 2.6, dmg: 340, color: '#ffdd88', core: '#ffffff', shake: 1.2 },
      },
    },

    todo: {
      name: 'AOI TODO', kanji: '東堂 葵', short: 'Todo',
      color: '#c1743a', glow: '#e0a060',
      health: 650, speed: 9, blackFlash: 0.12, hasRCT: false,
      role: 'Bruiser', passiveKey: null,
      passive: 'Combat genius — 12% Black Flash. Boogie Woogie swaps you with your target mid-fight.',
      blurb: 'BROTHER. His idea of a conversation is a clap.',
      abilities: {
        j: { name: 'Simple Punch', icon: '拳', cost: 0, cd: 0.34, kind: 'melee',
             range: 3.0, arc: 1.1, dmg: 50, knock: 9, color: '#c1743a', fx: 'punch' },
        k: { name: 'Boogie Woogie', icon: '掌', cost: 8, cd: 1.2, kind: 'blink',
             range: 12, dmg: 45, radius: 2.0, swap: true, color: '#e0a060' },
        l: { name: 'Brother Combo', icon: '兄', cost: 14, cd: 2.4, kind: 'melee',
             range: 3.8, arc: 1.5, dmg: 62, hits: 3, hitDelay: 0.12, knock: 6,
             color: '#ffbb77', fx: 'punch', shake: 0.5 },
        q: { name: 'Simple Domain', icon: '域', cost: 50, cd: 30, kind: 'buff',
             duration: 12, mods: { armor: 0.25, domainImmune: true, reflect: 0.4 },
             color: '#e0a060', label: 'SIMPLE DOMAIN', aura: true },
      },
    },

    choso: {
      name: 'CHOSO', kanji: '脹相', short: 'Choso',
      color: '#8B0000', glow: '#e05060',
      health: 550, speed: 7, blackFlash: 0.08, hasRCT: false, regen: 4,
      role: 'Sustain', passiveKey: null,
      passive: 'Blood Manipulation — passive HP regeneration replaces RCT.',
      blurb: 'Death Painting. Nine brothers, one grudge.',
      abilities: {
        j: { name: 'Blood Edge', icon: '刃', cost: 4, cd: 0.5, kind: 'projectile',
             speed: 26, dmg: 60, radius: 0.5, color: '#aa1122', core: '#ff6677', shape: 'blood' },
        k: { name: 'Piercing Blood', icon: '穿', cost: 14, cd: 2.0, kind: 'beam',
             range: 28, width: 0.9, dmg: 200, color: '#8B0000', core: '#ff4455', shake: 0.8 },
        l: { name: 'Supernova', icon: '爆', cost: 18, cd: 3.0, kind: 'burst',
             range: 9, radius: 4.8, dmg: 155, force: 12, color: '#cc2233', shake: 0.9 },
        q: { name: 'Flowing Red Scale', icon: '血', cost: 50, cd: 30, kind: 'buff',
             duration: 14, mods: { damage: 1.6, speed: 1.25, regen: 14 },
             color: '#ff3344', label: 'RED SCALE', aura: true },
      },
    },

    nobara: {
      name: 'NOBARA KUGISAKI', kanji: '釘崎 野薔薇', short: 'Nobara',
      color: '#ff69b4', glow: '#ffb6c1',
      health: 420, speed: 8, blackFlash: 0.10, hasRCT: false,
      role: 'Ranged', passiveKey: null,
      passive: 'Straw Doll Technique — Resonance detonates every nail already stuck in a target.',
      blurb: 'Hammer, nails, and absolutely no patience.',
      abilities: {
        j: { name: 'Hairpin', icon: '釘', cost: 4, cd: 0.42, kind: 'volley',
             count: 3, spread: 0.14, speed: 30, dmg: 34, radius: 0.4, nail: true,
             color: '#ff69b4', core: '#ffffff', shape: 'nail' },
        k: { name: 'Resonance', icon: '共', cost: 12, cd: 1.8, kind: 'resonance',
             dmg: 70, perNail: 55, range: 22, color: '#ff4da6' },
        l: { name: 'Hammer', icon: '槌', cost: 16, cd: 2.2, kind: 'melee',
             range: 3.4, arc: 1.2, dmg: 120, knock: 16, guaranteedCrit: true,
             color: '#ff88cc', fx: 'punch', shake: 0.8 },
        q: { name: 'Hairpin: Domain', icon: '薔', cost: 50, cd: 34, kind: 'domain', domain: 'hairpin' },
      },
    },

    inumaki: {
      name: 'TOGE INUMAKI', kanji: '狗巻 棘', short: 'Inumaki',
      color: '#9370db', glow: '#dda0dd',
      health: 350, speed: 7, blackFlash: 0.05, hasRCT: false, cursedSpeech: true,
      role: 'Control', passiveKey: null,
      passive: 'Cursed Speech — every word tears his own throat. Abilities cost HP as well as cursed energy.',
      blurb: 'Salmon. Salmon roe. Kelp.',
      abilities: {
        j: { name: 'Stop', icon: '止', cost: 6, cd: 0.9, kind: 'burst',
             range: 7, radius: 4.0, dmg: 40, stun: 1.6, selfDamage: 8,
             color: '#9370db', cone: 1.0 },
        k: { name: 'Run Away', icon: '逃', cost: 6, cd: 1.2, kind: 'burst',
             range: 6, radius: 5.0, dmg: 30, force: 26, fear: 2.5, selfDamage: 8,
             color: '#b088e8', cone: 1.2 },
        l: { name: 'Explode', icon: '爆', cost: 18, cd: 3.2, kind: 'burst',
             range: 10, radius: 4.2, dmg: 230, selfDamage: 22, color: '#c9a0ff', shake: 1.0 },
        q: { name: 'Die', icon: '死', cost: 50, cd: 40, kind: 'burst',
             range: 0, radius: 20, dmg: 600, selfDamage: 90, global: true,
             color: '#ffffff', shake: 1.6 },
      },
    },

    nanami: {
      name: 'KENTO NANAMI', kanji: '七海 建人', short: 'Nanami',
      color: '#daa520', glow: '#ffd700',
      health: 500, speed: 7, blackFlash: 0.12, hasRCT: false,
      role: 'Precision', passiveKey: null,
      passive: 'Ratio Technique — every strike carries a 7:3 weak point. Overtime multiplies everything by 1.6x.',
      blurb: 'A salaryman with a blunt sword and no illusions.',
      abilities: {
        j: { name: '7:3 Strike', icon: '七', cost: 4, cd: 0.55, kind: 'melee',
             range: 3.8, arc: 1.0, dmg: 64, knock: 8, ratio: true,
             color: '#daa520', fx: 'slash' },
        k: { name: 'Collapse', icon: '崩', cost: 12, cd: 1.8, kind: 'burst',
             range: 7, radius: 3.8, dmg: 135, ratio: true, color: '#c9a227', shake: 0.6 },
        l: { name: 'Overtime', icon: '残', cost: 0, cd: 16, kind: 'buff',
             duration: 12, mods: { damage: 1.6, speed: 1.15, critBonus: 0.12 },
             color: '#ffd700', label: 'OVERTIME', aura: true },
        q: { name: 'Binding Vow', icon: '縛', cost: 50, cd: 30, kind: 'buff',
             duration: 10, mods: { damage: 2.4, armor: -0.35, critBonus: 0.25 },
             color: '#fff0a0', label: 'BINDING VOW', aura: true },
      },
    },

    mahito: {
      name: 'MAHITO', kanji: '真人', short: 'Mahito',
      color: '#4169e1', glow: '#87ceeb',
      health: 480, speed: 8, blackFlash: 0.08, hasRCT: true,
      role: 'Trickster', passiveKey: null,
      passive: 'Idle Transfiguration — reshaping his own soul lets him heal freely.',
      blurb: 'He thinks your body and your soul are the same toy.',
      abilities: {
        j: { name: 'Soul Touch', icon: '触', cost: 4, cd: 0.5, kind: 'melee',
             range: 3.0, arc: 1.1, dmg: 72, trueDamage: true, color: '#4169e1', fx: 'punch' },
        k: { name: 'Polymorphic Clone', icon: '分', cost: 12, cd: 2.2, kind: 'summon',
             summon: 'transfigured', count: 2, life: 16, color: '#5b8ce8' },
        l: { name: 'Instant Spirit Body', icon: '変', cost: 10, cd: 2.6, kind: 'buff',
             duration: 7, mods: { speed: 1.5, armor: 0.35, damage: 1.25 },
             color: '#87ceeb', label: 'SPIRIT BODY', aura: true },
        q: { name: 'Self-Embodiment', icon: '完', cost: 50, cd: 34, kind: 'domain', domain: 'selfEmbodiment' },
      },
    },

    kashimo: {
      name: 'HAJIME KASHIMO', kanji: '鹿紫雲 一', short: 'Kashimo',
      color: '#00ced1', glow: '#40e0d0',
      health: 380, speed: 10, blackFlash: 0.12, hasRCT: false,
      role: 'Glass Cannon', passiveKey: null,
      passive: 'Mythical Beast Amber — Static Build stacks charge, and every charge amplifies lightning damage.',
      blurb: 'Four hundred years waiting for one good fight.',
      abilities: {
        j: { name: 'Lightning Strike', icon: '雷', cost: 3, cd: 0.28, kind: 'projectile',
             speed: 40, dmg: 46, radius: 0.45, lightning: true,
             color: '#00ced1', core: '#ffffff', shape: 'bolt' },
        k: { name: 'Discharge', icon: '放', cost: 12, cd: 1.5, kind: 'burst',
             range: 0, radius: 6.0, dmg: 130, lightning: true, chain: 3,
             color: '#40e0d0', shake: 0.7 },
        l: { name: 'Static Build', icon: '蓄', cost: 0, cd: 2.4, kind: 'buff',
             duration: 10, stacking: 3, mods: { damage: 1.25, speed: 1.1 },
             color: '#7fffd4', label: 'CHARGED', aura: true },
        q: { name: 'Mythical Beast Amber', icon: '獣', cost: 50, cd: 45, kind: 'burst',
             range: 0, radius: 14, dmg: 520, lightning: true, chain: 8,
             color: '#00ffff', shake: 1.5 },
      },
    },

    higuruma: {
      name: 'HIROMI HIGURUMA', kanji: '日車 寛見', short: 'Higuruma',
      color: '#4a6a6a', glow: '#9fc0c0',
      health: 450, speed: 7, blackFlash: 0.08, hasRCT: false,
      role: 'Judge', passiveKey: null,
      passive: 'Judgeman — Evidence marks a target; marked enemies take execution damage from the Gavel.',
      blurb: 'A defence attorney who reads the verdict himself.',
      abilities: {
        j: { name: 'Gavel Strike', icon: '槌', cost: 4, cd: 0.6, kind: 'melee',
             range: 3.4, arc: 1.1, dmg: 68, knock: 11, vsMarked: 2.2,
             color: '#4a6a6a', fx: 'punch' },
        k: { name: 'Evidence', icon: '証', cost: 8, cd: 1.4, kind: 'projectile',
             speed: 24, dmg: 45, radius: 0.6, mark: 8, color: '#9fc0c0', core: '#ffffff', shape: 'seal' },
        l: { name: 'Objection', icon: '異', cost: 14, cd: 2.4, kind: 'burst',
             range: 7, radius: 4.6, dmg: 120, stun: 0.9, color: '#7aa0a0', shake: 0.6 },
        q: { name: 'Deadly Sentencing', icon: '裁', cost: 50, cd: 34, kind: 'domain', domain: 'deadlySentencing' },
      },
    },

    ryu: {
      name: 'RYU ISHIGORI', kanji: '石流 龍', short: 'Ryu',
      color: '#c9772f', glow: '#ffb066',
      health: 520, speed: 6, blackFlash: 0.10, hasRCT: false,
      role: 'Artillery', passiveKey: null,
      passive: 'Granite Blast — the largest raw cursed energy output in the roster.',
      blurb: 'No technique. Just an absurd amount of output.',
      abilities: {
        j: { name: 'Cursed Blast', icon: '砲', cost: 4, cd: 0.5, kind: 'projectile',
             speed: 25, dmg: 66, radius: 0.6, explode: { radius: 1.8, dmg: 30 },
             color: '#c9772f', core: '#ffcc88', shape: 'blast' },
        k: { name: 'Charged Shot', icon: '充', cost: 14, cd: 1.9, kind: 'projectile',
             speed: 18, dmg: 190, radius: 1.1, explode: { radius: 3.6, dmg: 90 },
             color: '#ff9933', core: '#ffffff', shake: 0.8, shape: 'blast' },
        l: { name: 'Scatter Shot', icon: '散', cost: 16, cd: 2.1, kind: 'volley',
             count: 7, spread: 0.42, speed: 22, dmg: 48, radius: 0.5,
             color: '#e08840', core: '#ffdd99', shape: 'blast' },
        q: { name: 'Maximum Output', icon: '極', cost: 50, cd: 30, kind: 'beam',
             range: 32, width: 3.2, dmg: 400, color: '#ff8800', core: '#ffffff', shake: 1.5 },
      },
    },

    /* ================= CURSED SPIRITS ================= */

    jogo: {
      name: 'JOGO', kanji: '漏瑚', short: 'Jogo',
      color: '#ff4500', glow: '#ff8844',
      health: 550, speed: 7, blackFlash: 0, hasRCT: false,
      role: 'Fire', passiveKey: null,
      passive: 'Disaster Flames — no Black Flash, but everything burns over time.',
      blurb: 'A volcano with opinions about humanity.',
      abilities: {
        j: { name: 'Ember Insects', icon: '蟲', cost: 5, cd: 0.6, kind: 'volley',
             count: 4, spread: 0.35, speed: 16, dmg: 38, radius: 0.5, homing: 2.0, burn: 5,
             color: '#ff4500', core: '#ffcc44', shape: 'ember' },
        k: { name: 'Lava Geyser', icon: '噴', cost: 12, cd: 1.7, kind: 'burst',
             range: 8, radius: 4.0, dmg: 125, burn: 12, color: '#ff6622', shake: 0.7 },
        l: { name: 'Meteor', icon: '隕', cost: 22, cd: 3.6, kind: 'projectile',
             speed: 13, dmg: 240, radius: 1.4, explode: { radius: 5.5, dmg: 130 }, burn: 14,
             color: '#ff3300', core: '#ffee66', shake: 1.2, shape: 'meteor' },
        q: { name: 'Coffin of the Iron Mountain', icon: '棺', cost: 50, cd: 34, kind: 'domain', domain: 'ironMountain' },
      },
    },

    hanami: {
      name: 'HANAMI', kanji: '花御', short: 'Hanami',
      color: '#228b22', glow: '#90ee90',
      health: 650, speed: 5, blackFlash: 0, hasRCT: false,
      role: 'Drain Tank', passiveKey: null,
      passive: 'Nature spirit — Cursed Buds drain life from everything they touch and feed it back to you.',
      blurb: 'Patient as a forest. Just as hard to kill.',
      abilities: {
        j: { name: 'Wooden Balls', icon: '木', cost: 4, cd: 0.7, kind: 'projectile',
             speed: 19, dmg: 62, radius: 0.7, color: '#228b22', core: '#aaffaa', shape: 'wood' },
        k: { name: 'Cursed Buds', icon: '芽', cost: 10, cd: 1.5, kind: 'burst',
             range: 6, radius: 4.4, dmg: 70, lifesteal: 0.85, manaDrain: 8,
             color: '#66cc44' },
        l: { name: 'Flower Field', icon: '花', cost: 16, cd: 2.8, kind: 'vortex',
             radius: 4.6, force: -4, dps: 60, life: 4.0, lifesteal: 0.5,
             travels: { speed: 12, range: 16, size: 1.5 },
             color: '#90ee90', core: '#e8ffe8' },
        q: { name: 'Domain: Deep Forest', icon: '森', cost: 50, cd: 34, kind: 'domain', domain: 'deepForest' },
      },
    },

    toji: {
      name: 'TOJI FUSHIGURO', kanji: '伏黒 甚爾', short: 'Toji',
      color: '#5a5a72', glow: '#a0a0c0',
      health: 400, speed: 12, blackFlash: 0, boneCrush: 0.20, hasRCT: false, domainImmune: true,
      role: 'Assassin', passiveKey: null,
      passive: 'Heavenly Restriction — zero cursed energy, free abilities, 20% Bone Crush, and complete DOMAIN IMMUNITY.',
      blurb: 'The Sorcerer Killer. No technique, no weakness.',
      abilities: {
        j: { name: 'Inverted Spear', icon: '逆', cost: 0, cd: 0.42, kind: 'melee',
             range: 4.4, arc: 0.85, dmg: 60, knock: 7, trueDamage: true,
             color: '#a0a0c0', fx: 'slash' },
        k: { name: 'Chain Strike', icon: '鎖', cost: 0, cd: 0.9, kind: 'projectile',
             speed: 34, dmg: 66, radius: 0.5, pull: 10, color: '#8890a8', core: '#dde0ee', shape: 'chain' },
        l: { name: 'Split Soul Katana', icon: '断', cost: 0, cd: 1.9, kind: 'melee',
             range: 4.0, arc: 1.0, dmg: 145, trueDamage: true, knock: 9,
             color: '#c0c8e0', fx: 'slash', shake: 0.6 },
        q: { name: 'Assassin Mode', icon: '殺', cost: 0, cd: 22, kind: 'buff',
             duration: 12, mods: { speed: 1.6, damage: 1.7, critBonus: 0.3 },
             color: '#e0e4f0', label: 'ASSASSIN', aura: true },
      },
    },

    geto: {
      name: 'SUGURU GETO', kanji: '夏油 傑', short: 'Geto',
      color: '#4b0082', glow: '#a855f7',
      health: 500, speed: 7, blackFlash: 0.08, hasRCT: true,
      role: 'Swarm', passiveKey: null,
      passive: 'Curse Manipulation — every curse he has ever swallowed can be sent out to fight for him.',
      blurb: 'He stopped seeing the difference between people and curses.',
      abilities: {
        j: { name: 'Curse Release', icon: '呪', cost: 4, cd: 0.5, kind: 'projectile',
             speed: 21, dmg: 58, radius: 0.6, color: '#7c3aed', core: '#d8b4fe', shape: 'curse' },
        k: { name: 'Uzumaki', icon: '渦', cost: 16, cd: 2.2, kind: 'burst',
             range: 8, radius: 4.6, dmg: 175, force: 10, color: '#6d28d9', shake: 0.8 },
        l: { name: 'Maximum Uzumaki', icon: '極', cost: 26, cd: 4.5, kind: 'beam',
             range: 26, width: 2.8, dmg: 320, color: '#4b0082', core: '#c084fc', shake: 1.2 },
        q: { name: 'Curse Swarm', icon: '群', cost: 50, cd: 30, kind: 'summon',
             summon: 'bound', count: 6, life: 22, color: '#a855f7' },
      },
    },

    /* ================= SPECIAL FORMS ================= */

    gojofull: {
      name: 'FULL POWER GOJO', kanji: '五条 悟 【本気】', short: 'Gojo (Full)',
      color: '#00bfff', glow: '#a0f0ff',
      health: 600, speed: 10, blackFlash: 0.20, hasRCT: true,
      role: 'Apex', passiveKey: 'Infinity',
      passive: 'THE STRONGEST. Hold PASSIVE for Infinity. 20% Black Flash — he landed four in a row.',
      blurb: 'Throughout heaven and earth, he alone is the honoured one.',
      abilities: {
        // Maximum output. Same techniques, vastly more of them: wider pull,
        // longer hang time, and an orb you can see across the arena.
        j: { name: 'MAX Blue', icon: '蒼', cost: 10, cd: 1.0, kind: 'vortex',
             radius: 6.2, force: 26, dps: 68, life: 1.7,
             travels: { speed: 12, range: 32, size: 3.2 },
             color: '#00e5ff', core: '#ffffff' },
        k: { name: 'MAX Red', icon: '赫', cost: 18, cd: 1.4, kind: 'burst',
             radius: 7.0, dmg: 215, force: 40,
             travels: { speed: 17, range: 32, size: 3.0 },
             color: '#ff3a1a', core: '#fff0c8', shake: 1.3 },
        l: { name: '200% Hollow Purple', icon: '茈', cost: 32, cd: 5.0, kind: 'beam',
             range: 36, width: 3.4, dmg: 520, color: '#9932cc', core: '#ff88ff',
             shake: 1.8, voidOrb: true },
        q: { name: 'Unlimited Void', icon: '∞', cost: 50, cd: 28, kind: 'domain', domain: 'unlimitedVoid' },
      },
    },

    meguna: {
      name: 'MEGUNA', kanji: '宿儺【伏黒】', short: 'Meguna',
      color: '#8b008b', glow: '#e070e0',
      health: 550, speed: 9, blackFlash: 0.12, hasRCT: true,
      role: 'Dual Technique', passiveKey: null,
      passive: 'Sukuna wearing Megumi — Shrine and Ten Shadows in the same body.',
      blurb: 'The vessel lost. What is left uses both.',
      abilities: {
        j: { name: 'Cleave & Dismantle', icon: '解捌', cost: 4, cd: 0.4, kind: 'melee',
             range: 4.4, arc: 1.4, dmg: 62, hits: 2, hitDelay: 0.1, knock: 6,
             color: '#8b008b', fx: 'slash' },
        k: { name: 'Chimera Shadow', icon: '影', cost: 12, cd: 2.0, kind: 'summon',
             summon: 'divineDog', count: 3, life: 20, color: '#a020a0' },
        l: { name: 'Mahoraga', icon: '摩', cost: 28, cd: 12, kind: 'summon',
             summon: 'mahoraga', count: 1, life: 26, color: '#ffaa00' },
        q: { name: 'Malevolent Shrine', icon: '伏', cost: 50, cd: 34, kind: 'domain', domain: 'malevolentShrine' },
      },
    },
  };

  /* ------------------------------------------------------------------
     Derived fields. Movement is expressed in world cells/second; the
     original 5..12 stat maps onto a 2.9..5.0 range that feels right at
     this arena scale.
     ------------------------------------------------------------------ */
  for (const id of Object.keys(CHARACTERS)) {
    const c = CHARACTERS[id];
    c.id = id;
    c.moveSpeed = 2.9 + (c.speed - 5) * 0.30;
    c.maxHealth = c.health;
    c.blackFlash = c.blackFlash ?? 0;
    c.boneCrush = c.boneCrush ?? 0;
    c.physical = c.blackFlash === 0 && c.boneCrush > 0;
    for (const slot of ['j', 'k', 'l', 'q']) {
      const a = c.abilities[slot];
      a.slot = slot;
      a.owner = id;
      if (a.color == null) a.color = c.color;
    }
  }

  /** Display order for menus — roughly the original unlock progression. */
  const ROSTER_ORDER = [
    'yuji', 'nobara', 'maki', 'inumaki', 'todo', 'megumi', 'nanami', 'choso',
    'higuruma', 'hakari', 'ryu', 'hanami', 'yuta', 'jogo', 'kashimo', 'mahito',
    'geto', 'toji', 'gojo', 'sukuna', 'mahoraga', 'gojofull', 'meguna',
  ];

  /** Story-mode unlock ladder, ported from the original game. */
  const UNLOCKS = [
    { id: 'yuji', wave: 0 }, { id: 'nobara', wave: 3 }, { id: 'maki', wave: 6 },
    { id: 'inumaki', wave: 9 }, { id: 'todo', wave: 12 }, { id: 'megumi', wave: 15 },
    { id: 'nanami', wave: 18 }, { id: 'choso', wave: 22 }, { id: 'higuruma', wave: 26 },
    { id: 'hakari', wave: 30 }, { id: 'ryu', wave: 34 }, { id: 'hanami', wave: 38 },
    { id: 'yuta', wave: 42 }, { id: 'jogo', wave: 46 }, { id: 'kashimo', wave: 50 },
    { id: 'mahito', wave: 55 }, { id: 'geto', wave: 60 }, { id: 'toji', wave: 65 },
    { id: 'mahoraga', wave: 70 }, { id: 'gojo', wave: 75 }, { id: 'sukuna', wave: 82 },
    { id: 'gojofull', wave: 90 }, { id: 'meguna', wave: 100 },
  ];

  JJK.CHARACTERS = CHARACTERS;
  JJK.ROSTER_ORDER = ROSTER_ORDER;
  JJK.UNLOCKS = UNLOCKS;
})(window.JJK);
