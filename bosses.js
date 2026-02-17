// ============ JJK BOSS DATABASE ============
// Special Grade Cursed Spirits that spawn every 5 waves

const BOSSES = {
  jogo: {
    name: 'JOGO',
    title: 'Disaster Curse - Volcano',
    kanji: '漏瑚',
    color: '#ff4400',
    colorLight: '#ff8844',
    baseHealth: 100,
    speed: 2.5,
    radius: 60,
    scoreValue: 500,
    manaReward: 30,
    abilities: {
      emberInsects: {
        name: 'Ember Insects',
        cooldown: 3000,
        damage: 15,
        type: 'projectile'
      },
      flameBeam: {
        name: 'Flame Beam',
        cooldown: 5000,
        damage: 25,
        type: 'beam'
      },
      maximumMeteor: {
        name: 'Maximum Meteor',
        cooldown: 12000,
        damage: 40,
        type: 'aoe',
        radius: 200
      }
    }
  },

  hanami: {
    name: 'HANAMI',
    title: 'Disaster Curse - Nature',
    kanji: '花御',
    color: '#44aa44',
    colorLight: '#88ff88',
    baseHealth: 120,
    speed: 2.0,
    radius: 65,
    scoreValue: 500,
    manaReward: 30,
    abilities: {
      cursedBuds: {
        name: 'Cursed Buds',
        cooldown: 4000,
        manaDrain: 10, // Drains player mana!
        type: 'debuff'
      },
      woodenBall: {
        name: 'Wooden Ball',
        cooldown: 3000,
        damage: 20,
        type: 'projectile'
      },
      rootEruption: {
        name: 'Root Eruption',
        cooldown: 8000,
        damage: 30,
        type: 'groundAoe',
        radius: 150
      }
    }
  },

  mahito: {
    name: 'MAHITO',
    title: 'Idle Transfiguration',
    kanji: '真人',
    color: '#6688cc',
    colorLight: '#99bbff',
    baseHealth: 90,
    speed: 3.5, // Fast and agile
    radius: 50,
    scoreValue: 600,
    manaReward: 35,
    abilities: {
      soulTouch: {
        name: 'Soul Touch',
        cooldown: 2500,
        damage: 35, // High damage melee
        type: 'melee',
        range: 100
      },
      transfiguredHuman: {
        name: 'Transfigured Human',
        cooldown: 6000,
        type: 'summon', // Spawns minions
        count: 2
      },
      polymorphic: {
        name: 'Polymorphic Soul',
        cooldown: 10000,
        type: 'phase', // Becomes invulnerable briefly
        duration: 1500
      }
    }
  },

  dagon: {
    name: 'DAGON',
    title: 'Disaster Curse - Ocean',
    kanji: '陀艮',
    color: '#2288aa',
    colorLight: '#44ccff',
    baseHealth: 110,
    speed: 2.2,
    radius: 70,
    scoreValue: 550,
    manaReward: 30,
    abilities: {
      deathSwarm: {
        name: 'Death Swarm',
        cooldown: 3500,
        damage: 12,
        type: 'multiProjectile',
        count: 6
      },
      tidalWave: {
        name: 'Tidal Wave',
        cooldown: 7000,
        damage: 25,
        type: 'wave',
        pushForce: 20
      },
      whirlpool: {
        name: 'Whirlpool',
        cooldown: 10000,
        damage: 10,
        type: 'pull',
        radius: 200,
        duration: 2500
      }
    }
  },

  fingerBearer: {
    name: 'FINGER BEARER',
    title: 'Sukuna\'s Vessel',
    kanji: '指',
    color: '#880044',
    colorLight: '#cc4488',
    baseHealth: 150, // Tanky
    speed: 1.8,
    radius: 75,
    scoreValue: 700,
    manaReward: 40,
    abilities: {
      crushingBlow: {
        name: 'Crushing Blow',
        cooldown: 2000,
        damage: 40,
        type: 'melee',
        range: 100,
        knockback: 30
      },
      cursedRoar: {
        name: 'Cursed Roar',
        cooldown: 8000,
        damage: 15,
        type: 'shockwave',
        radius: 150,
        stun: 800
      },
      berserk: {
        name: 'Berserk',
        cooldown: 15000,
        type: 'buff',
        speedMultiplier: 1.5,
        duration: 4000
      }
    }
  }
};

// Boss order for each wave (cycles through)
const BOSS_ORDER = ['jogo', 'hanami', 'mahito', 'dagon', 'fingerBearer'];

// Get boss for a specific wave (wave 5, 10, 15, etc.)
function getBossForWave(wave) {
  if (wave % 5 !== 0) return null;
  const bossIndex = (Math.floor(wave / 5) - 1) % BOSS_ORDER.length;
  return BOSS_ORDER[bossIndex];
}

// Calculate boss scaling based on appearance number
function getBossScaling(wave) {
  const appearance = Math.floor(wave / 5);
  return {
    healthMultiplier: 1 + (appearance - 1) * 0.25,  // +25% HP each cycle
    damageMultiplier: 1 + (appearance - 1) * 0.15,  // +15% damage each cycle
    speedMultiplier: 1 + (appearance - 1) * 0.05    // +5% speed each cycle
  };
}
