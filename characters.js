// ============ JJK CHARACTER DATABASE ============
// All character stats, abilities, and properties

const CHARACTERS = {
  gojo: {
    name: 'SATORU GOJO',
    kanji: '五条 悟',
    color: '#1e90ff',
    colorLight: '#00ffff',
    health: 500,
    speed: 8,
    blackFlashChance: 0.10, // 10% base
    hasRCT: true, // Mastered RCT
    abilities: {
      j: { name: 'Blue', icon: '蒼', cost: 1, cooldown: 500 },
      k: { name: 'Red', icon: '赫', cost: 2, cooldown: 800 },
      l: { name: 'Hollow Purple', icon: '茈', cost: 3, cooldown: 3000 },
      q: { name: 'Unlimited Void', icon: '∞', cost: 50, cooldown: 30000 }
    },
    passive: 'Infinity (SPACE). RCT (R). 10% Black Flash.',
    passiveKey: 'space'
  },

  yuji: {
    name: 'YUJI ITADORI',
    kanji: '虎杖 悠仁',
    color: '#ff6b6b',
    colorLight: '#ffaaaa',
    health: 600,
    speed: 9,
    blackFlashChance: 0.15, // 15% base - KING of Black Flash
    blackFlashChain: true, // Special: chains up with consecutive hits
    hasRCT: true, // Can heal
    abilities: {
      j: { name: 'Divergent Fist', icon: '拳', cost: 1, cooldown: 400 },
      k: { name: 'Blood Edge', icon: '血', cost: 2, cooldown: 600 },
      l: { name: 'Soul Dismantle', icon: '魂', cost: 4, cooldown: 2500 },
      q: { name: 'Soul Shrine', icon: '駅', cost: 50, cooldown: 30000 }
    },
    passive: 'Black Flash KING (H). RCT (R). Chains up!',
    passiveKey: null
  },

  sukuna: {
    name: 'RYOMEN SUKUNA',
    kanji: '両面宿儺',
    color: '#ff0044',
    colorLight: '#ff6688',
    health: 450,
    speed: 9,
    blackFlashChance: 0.10, // 10% base
    hasRCT: true, // Mastered RCT
    abilities: {
      j: { name: 'Dismantle', icon: '解', cost: 1, cooldown: 300 },
      k: { name: 'Cleave', icon: '捌', cost: 2, cooldown: 500 },
      l: { name: 'World Slash', icon: '斬', cost: 5, cooldown: 4000 },
      q: { name: 'Malevolent Shrine', icon: '伏', cost: 50, cooldown: 30000 }
    },
    passive: '10% Black Flash. 25% vs stunned. RCT (R).',
    passiveKey: null
  },

  megumi: {
    name: 'MEGUMI FUSHIGURO',
    kanji: '伏黒 恵',
    color: '#4a90d9',
    colorLight: '#88bbff',
    health: 400,
    speed: 7,
    blackFlashChance: 0.05, // 5% base - tactician
    hasRCT: false, // No RCT - must rely on others
    abilities: {
      j: { name: 'Divine Dogs', icon: '犬', cost: 2, cooldown: 1000 },
      k: { name: 'Nue', icon: '鵺', cost: 3, cooldown: 1500 },
      l: { name: 'Max Elephant', icon: '象', cost: 5, cooldown: 3000 },
      q: { name: 'Chimera Shadow Garden', icon: '影', cost: 50, cooldown: 30000 }
    },
    passive: '5% Black Flash. NO RCT. Shikigami (SPACE).',
    passiveKey: 'space'
  },

  yuta: {
    name: 'YUTA OKKOTSU',
    kanji: '乙骨 憂太',
    color: '#9932cc',
    colorLight: '#cc66ff',
    health: 550,
    speed: 8,
    blackFlashChance: 0.08, // 8% base
    hasRCT: true, // Mastered - can heal others too!
    abilities: {
      j: { name: 'Rika Strike', icon: '里', cost: 1, cooldown: 500 },
      k: { name: 'Copy: Random', icon: '写', cost: 3, cooldown: 800 },
      l: { name: 'Cursed Speech', icon: '言', cost: 4, cooldown: 2000 },
      q: { name: 'Authentic Mutual Love', icon: '愛', cost: 50, cooldown: 30000 }
    },
    passive: '8% Black Flash. RCT (R). Rika auto-attacks!',
    passiveKey: null
  },

  hakari: {
    name: 'KINJI HAKARI',
    kanji: '秤 金次',
    color: '#ffaa00',
    colorLight: '#ffdd66',
    health: 500,
    speed: 8,
    blackFlashChance: 0.08, // 8% base, 15% during Jackpot
    hasRCT: 'jackpot', // Only during Jackpot!
    abilities: {
      j: { name: 'Door Slam', icon: '扉', cost: 1, cooldown: 600 },
      k: { name: 'Ball Strike', icon: '球', cost: 2, cooldown: 700 },
      l: { name: 'Gamble Spin', icon: '賭', cost: 3, cooldown: 2000 },
      q: { name: 'Idle Death Gamble', icon: '柏', cost: 50, cooldown: 30000 }
    },
    passive: '8% Black Flash. RCT only during JACKPOT!',
    passiveKey: null
  },

  maki: {
    name: 'MAKI ZENIN',
    kanji: '禪院 真希',
    color: '#44ff44',
    colorLight: '#88ff88',
    health: 350,
    speed: 11,
    blackFlashChance: 0, // No cursed energy = no Black Flash
    boneCrushChance: 0.15, // But 15% BONE CRUSH instead!
    hasRCT: false, // No cursed energy
    abilities: {
      j: { name: 'Spear Spin', icon: '回', cost: 0, cooldown: 400 },
      k: { name: 'Heavy Strike', icon: '重', cost: 0, cooldown: 500 },
      l: { name: 'Split Soul', icon: '魂', cost: 0, cooldown: 1500 },
      q: { name: 'Dragon Bone', icon: '龍', cost: 0, cooldown: 3000 }
    },
    passive: 'NO Black Flash. 15% BONE CRUSH instead! Pure physical.',
    passiveKey: null
  },

  mahoraga: {
    name: 'MAHORAGA',
    kanji: '魔虚羅',
    color: '#ffaa00',
    colorLight: '#ffdd88',
    health: 800,
    speed: 6,
    blackFlashChance: 0, // Shikigami - no black flash
    boneCrushChance: 0.20, // 20% devastating hits!
    hasRCT: false, // Adapts instead of healing
    adapts: true, // Special: adapts to damage types
    abilities: {
      j: { name: 'Sword of Extermination', icon: '剣', cost: 0, cooldown: 600 },
      k: { name: 'Wheel Spin', icon: '輪', cost: 0, cooldown: 2000 },
      l: { name: 'Divine Strike', icon: '神', cost: 0, cooldown: 3000 },
      q: { name: 'Eight-Handled Sword', icon: '八', cost: 0, cooldown: 8000 }
    },
    passive: 'ADAPTATION: Reduces repeated damage! 20% CRUSH chance!',
    passiveKey: 'space'
  },

  todo: {
    name: 'AOI TODO',
    kanji: '東堂 葵',
    color: '#8B4513',
    colorLight: '#D2691E',
    health: 650,
    speed: 9,
    blackFlashChance: 0.12, // 12% base - combat genius
    hasRCT: false, // Pure physical fighter
    abilities: {
      j: { name: 'Simple Punch', icon: '拳', cost: 0, cooldown: 300 },
      k: { name: 'Boogie Woogie', icon: '👏', cost: 2, cooldown: 1000 },
      l: { name: 'Brother Combo', icon: '兄', cost: 3, cooldown: 2000 },
      q: { name: 'Simple Domain', icon: '域', cost: 50, cooldown: 30000 }
    },
    passive: 'BROTHER! 12% Black Flash. Boogie Woogie swaps!',
    passiveKey: null
  },

  choso: {
    name: 'CHOSO',
    kanji: '脹相',
    color: '#8B0000',
    colorLight: '#CD5C5C',
    health: 550,
    speed: 7,
    blackFlashChance: 0.08, // 8% base
    hasRCT: false, // But has blood regen passive
    bloodRegen: true, // Special: passive HP regen
    abilities: {
      j: { name: 'Blood Edge', icon: '刃', cost: 1, cooldown: 400 },
      k: { name: 'Piercing Blood', icon: '穿', cost: 3, cooldown: 1200 },
      l: { name: 'Supernova', icon: '爆', cost: 4, cooldown: 2500 },
      q: { name: 'Flowing Red Scale', icon: '血', cost: 50, cooldown: 30000 }
    },
    passive: 'Blood Manipulation. 8% Black Flash. Passive HP regen!',
    passiveKey: null
  },

  // ============ NEW CHARACTERS ============

  nobara: {
    name: 'NOBARA KUGISAKI',
    kanji: '釘崎 野薔薇',
    color: '#ff69b4',
    colorLight: '#ffb6c1',
    health: 420,
    speed: 8,
    blackFlashChance: 0.10,
    hasRCT: false,
    abilities: {
      j: { name: 'Hairpin', icon: '釘', cost: 1, cooldown: 400 },
      k: { name: 'Resonance', icon: '共', cost: 3, cooldown: 1500 },
      l: { name: 'Black Flash Hammer', icon: '槌', cost: 4, cooldown: 2000 },
      q: { name: 'Hairpin: Domain', icon: '薔', cost: 50, cooldown: 30000 }
    },
    passive: 'Straw Doll Technique. 10% Black Flash. Resonance chains!',
    passiveKey: null
  },

  inumaki: {
    name: 'TOGE INUMAKI',
    kanji: '狗巻 棘',
    color: '#9370db',
    colorLight: '#dda0dd',
    health: 350,
    speed: 7,
    blackFlashChance: 0.05,
    hasRCT: false,
    cursedSpeech: true, // Abilities hurt self
    abilities: {
      j: { name: 'Stop', icon: '止', cost: 2, cooldown: 800 },
      k: { name: 'Run Away', icon: '逃', cost: 2, cooldown: 1000 },
      l: { name: 'Explode', icon: '爆', cost: 5, cooldown: 3000 },
      q: { name: 'Die', icon: '死', cost: 50, cooldown: 30000 }
    },
    passive: 'Cursed Speech. 5% Black Flash. Abilities cost HP too!',
    passiveKey: null
  },

  nanami: {
    name: 'KENTO NANAMI',
    kanji: '七海 建人',
    color: '#daa520',
    colorLight: '#ffd700',
    health: 500,
    speed: 7,
    blackFlashChance: 0.12,
    hasRCT: false,
    overtime: false, // Activates after wave 5
    abilities: {
      j: { name: '7:3 Strike', icon: '七', cost: 1, cooldown: 500 },
      k: { name: 'Collapse', icon: '崩', cost: 2, cooldown: 1200 },
      l: { name: 'Overtime', icon: '残', cost: 0, cooldown: 5000 },
      q: { name: 'Binding Vow', icon: '縛', cost: 50, cooldown: 30000 }
    },
    passive: 'Ratio Technique. 12% Black Flash. OVERTIME = 1.5x power!',
    passiveKey: null
  },

  mahito: {
    name: 'MAHITO',
    kanji: '真人',
    color: '#4169e1',
    colorLight: '#87ceeb',
    health: 480,
    speed: 8,
    blackFlashChance: 0.08,
    hasRCT: true, // Can reshape own soul
    abilities: {
      j: { name: 'Soul Touch', icon: '触', cost: 1, cooldown: 500 },
      k: { name: 'Polymorphic Clone', icon: '分', cost: 3, cooldown: 1500 },
      l: { name: 'Instant Spirit Body', icon: '変', cost: 2, cooldown: 800 },
      q: { name: 'Self-Embodiment', icon: '完', cost: 50, cooldown: 30000 }
    },
    passive: 'Idle Transfiguration. 8% Black Flash. Soul manipulation!',
    passiveKey: null
  },

  kashimo: {
    name: 'HAJIME KASHIMO',
    kanji: '鹿紫雲 一',
    color: '#00ced1',
    colorLight: '#40e0d0',
    health: 380,
    speed: 10,
    blackFlashChance: 0.12,
    hasRCT: false,
    lightningCharge: 0, // Builds up
    abilities: {
      j: { name: 'Lightning Strike', icon: '雷', cost: 1, cooldown: 300 },
      k: { name: 'Discharge', icon: '放', cost: 2, cooldown: 800 },
      l: { name: 'Static Build', icon: '蓄', cost: 0, cooldown: 1500 },
      q: { name: 'Mythical Beast Amber', icon: '獣', cost: 50, cooldown: 60000 }
    },
    passive: 'Lightning God. 12% Black Flash. Glass cannon!',
    passiveKey: null
  },

  higuruma: {
    name: 'HIROMI HIGURUMA',
    kanji: '日車 寛見',
    color: '#2f4f4f',
    colorLight: '#708090',
    health: 450,
    speed: 7,
    blackFlashChance: 0.08,
    hasRCT: false,
    abilities: {
      j: { name: 'Gavel Strike', icon: '槌', cost: 1, cooldown: 600 },
      k: { name: 'Evidence', icon: '証', cost: 2, cooldown: 1000 },
      l: { name: 'Objection', icon: '異', cost: 3, cooldown: 2000 },
      q: { name: 'Deadly Sentencing', icon: '裁', cost: 50, cooldown: 30000 }
    },
    passive: 'Judgeman. 8% Black Flash. Confiscate enemy power!',
    passiveKey: null
  },

  ryu: {
    name: 'RYU ISHIGORI',
    kanji: '石流 龍',
    color: '#8b4513',
    colorLight: '#d2691e',
    health: 520,
    speed: 6,
    blackFlashChance: 0.10,
    hasRCT: false,
    chargedShot: 0, // Charge level
    abilities: {
      j: { name: 'Cursed Blast', icon: '砲', cost: 1, cooldown: 500 },
      k: { name: 'Charged Shot', icon: '充', cost: 2, cooldown: 1200 },
      l: { name: 'Scatter Shot', icon: '散', cost: 3, cooldown: 1500 },
      q: { name: 'Maximum Output', icon: '極', cost: 50, cooldown: 30000 }
    },
    passive: 'Granite Blast. 10% Black Flash. Highest cursed energy output!',
    passiveKey: null
  },

  jogo: {
    name: 'JOGO',
    kanji: '漏瑚',
    color: '#ff4500',
    colorLight: '#ff6347',
    health: 550,
    speed: 7,
    blackFlashChance: 0,
    hasRCT: false,
    abilities: {
      j: { name: 'Ember Insects', icon: '蟲', cost: 1, cooldown: 600 },
      k: { name: 'Lava Geyser', icon: '噴', cost: 3, cooldown: 1500 },
      l: { name: 'Meteor', icon: '隕', cost: 5, cooldown: 3000 },
      q: { name: 'Coffin of Iron Mountain', icon: '棺', cost: 50, cooldown: 30000 }
    },
    passive: 'Disaster Flames. No Black Flash. Fire AOE master!',
    passiveKey: null
  },

  hanami: {
    name: 'HANAMI',
    kanji: '花御',
    color: '#228b22',
    colorLight: '#90ee90',
    health: 650,
    speed: 5,
    blackFlashChance: 0,
    hasRCT: false,
    abilities: {
      j: { name: 'Wooden Balls', icon: '木', cost: 1, cooldown: 700 },
      k: { name: 'Cursed Buds', icon: '芽', cost: 2, cooldown: 1200 },
      l: { name: 'Flower Field', icon: '花', cost: 3, cooldown: 2000 },
      q: { name: 'Domain Expansion', icon: '森', cost: 50, cooldown: 30000 }
    },
    passive: 'Nature Spirit. No Black Flash. Drains HP, heals self!',
    passiveKey: null
  },

  toji: {
    name: 'TOJI FUSHIGURO',
    kanji: '伏黒 甚爾',
    color: '#1a1a2e',
    colorLight: '#4a4a6a',
    health: 400,
    speed: 12,
    blackFlashChance: 0, // No cursed energy
    boneCrushChance: 0.20, // 20% devastating hits
    hasRCT: false,
    domainImmune: true, // Cannot be trapped in domains!
    abilities: {
      j: { name: 'Inverted Spear', icon: '逆', cost: 0, cooldown: 400 },
      k: { name: 'Chain Strike', icon: '鎖', cost: 0, cooldown: 800 },
      l: { name: 'Split Soul Katana', icon: '断', cost: 0, cooldown: 1500 },
      q: { name: 'Assassin Mode', icon: '殺', cost: 0, cooldown: 20000 }
    },
    passive: 'Heavenly Restriction. 20% BONE CRUSH. DOMAIN IMMUNE!',
    passiveKey: null
  },

  geto: {
    name: 'SUGURU GETO',
    kanji: '夏油 傑',
    color: '#4b0082',
    colorLight: '#8a2be2',
    health: 500,
    speed: 7,
    blackFlashChance: 0.08,
    hasRCT: true,
    abilities: {
      j: { name: 'Curse Release', icon: '呪', cost: 1, cooldown: 500 },
      k: { name: 'Uzumaki', icon: '渦', cost: 4, cooldown: 2000 },
      l: { name: 'Maximum Uzumaki', icon: '極', cost: 6, cooldown: 4000 },
      q: { name: 'Curse Swarm', icon: '群', cost: 50, cooldown: 30000 }
    },
    passive: 'Curse Manipulation. 8% Black Flash. Summons curses!',
    passiveKey: null
  },

  // ============ SPECIAL FORMS ============

  gojofull: {
    name: 'FULL POWER GOJO',
    kanji: '五条 悟 【本気】',
    color: '#00bfff',
    colorLight: '#87ceeb',
    health: 600,
    speed: 10,
    blackFlashChance: 0.20, // 20% - he hit 4 in a row vs Sukuna!
    hasRCT: true,
    abilities: {
      j: { name: 'MAX Blue', icon: '蒼', cost: 2, cooldown: 500 },
      k: { name: 'MAX Red', icon: '赫', cost: 4, cooldown: 800 },
      l: { name: '200% Purple', icon: '茈', cost: 6, cooldown: 3000 },
      q: { name: 'Unlimited Void', icon: '∞', cost: 50, cooldown: 25000 }
    },
    passive: 'HOLD SPACE = Infinity Barrier. THE STRONGEST!',
    passiveKey: 'space'
  },

  meguna: {
    name: 'MEGUNA',
    kanji: '宿儺【伏黒】',
    color: '#660066',
    colorLight: '#aa00aa',
    health: 550,
    speed: 9,
    blackFlashChance: 0.12,
    hasRCT: true,
    abilities: {
      j: { name: 'Cleave & Dismantle', icon: '解捌', cost: 1, cooldown: 400 },
      k: { name: 'Chimera Shadow', icon: '影', cost: 3, cooldown: 1500 },
      l: { name: 'Mahoraga', icon: '摩', cost: 6, cooldown: 8000 },
      q: { name: 'Malevolent Shrine', icon: '伏', cost: 50, cooldown: 30000 }
    },
    passive: 'Sukuna in Megumi. Shadow + Shrine. Dual techniques!',
    passiveKey: null
  }
};

// Export for use in other files (if using modules)
// export default CHARACTERS;
