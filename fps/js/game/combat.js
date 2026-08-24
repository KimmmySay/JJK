/* ==========================================================================
   COMBAT — damage resolution, Black Flash, Bone Crush, the Zone.

   BLACK FLASH is the identity mechanic of this series, so it gets the most
   care here:
     - per-character base chance (Yuji highest at 15%)
     - Yuji chains: consecutive crits push 15 -> 25 -> 35 -> 45%
     - Sukuna gets 25% against stunned/slowed targets
     - Hakari only crits at his base rate outside Jackpot, 15% inside
     - landing one puts you in THE ZONE: +10% damage and speed for 15s
   Physical characters (Maki, Toji, Mahoraga) have no cursed energy, so they
   roll BONE CRUSH instead — same role, different flavour and multiplier.

   MAHORAGA'S ADAPTATION is implemented as a per-source damage ledger: the
   more times a given ability id hits it, the less that ability does. That is
   what makes it a puzzle rather than a stat check.
   ========================================================================== */

(function (JJK) {
  'use strict';

  const { M, Particles, Audio, PostFX } = JJK;

  const BLACK_FLASH_MULT = 2.5;
  const BONE_CRUSH_MULT = 2.2;
  const ZONE_DURATION = 15;

  /**
   * Roll for a critical.
   * Returns { crit, kind, mult } where kind is 'blackflash' | 'bonecrush' | null.
   */
  function rollCrit(p, target) {
    const char = p.char;
    let chance;
    let kind;

    if (char.boneCrush > 0) {
      chance = char.boneCrush;
      kind = 'bonecrush';
    } else {
      chance = char.blackFlash;
      kind = 'blackflash';
      if (chance <= 0) return { crit: false, kind: null, mult: 1 };

      // Yuji's chain.
      if (char.blackFlashChain) {
        chance = Math.min(0.15 + p.bfChain * 0.10, p.flag('bfChainMax', 0.45));
      }
      // Sukuna punishes the helpless.
      if (char.id === 'sukuna' && target && (target.stun > 0 || target.slow > 0)) {
        chance = Math.max(chance, 0.25);
      }
      // Hakari's jackpot.
      if (char.id === 'hakari' && p.jackpot > 0) chance = 0.15;
    }

    chance += p.mods.critBonus || 0;
    if (p.guaranteedCrit) chance = 1;

    if (Math.random() < chance) return { crit: true, kind, mult: kind === 'blackflash' ? BLACK_FLASH_MULT : BONE_CRUSH_MULT };
    return { crit: false, kind: null, mult: 1 };
  }

  /** Enter the Zone after a Black Flash. */
  function enterZone(p) {
    const wasIn = p.zone > 0;
    p.zone = ZONE_DURATION + p.flag('zoneTime', 0);
    if (!wasIn) {
      Audio.SFX.zone();
      PostFX.setZone(true);
    }
  }

  /**
   * Apply damage to any entity with { health, maxHealth }.
   *
   * opts:
   *   trueDamage  bypass armour and adaptation
   *   sourceId    ability id, used by Mahoraga's adaptation ledger
   *   crit        { crit, kind, mult }
   *   knock       impulse magnitude
   *   dirX/dirY   knock direction
   *   color       damage number / particle colour
   *   silent      no number, no sound (for damage-over-time ticks)
   */
  function damage(target, amount, opts) {
    const o = opts || {};
    if (!target || target.dead || target.health <= 0) return 0;
    if (target.invuln > 0 && !o.ignoreInvuln) return 0;

    let dmg = amount;

    // Armour (0 = none, 0.5 = half damage). Negative armour amplifies.
    if (!o.trueDamage) {
      const armor = target.armor || 0;
      dmg *= (1 - M.clamp(armor, -1, 0.9));
    }

    // Mahoraga: adaptation ledger, keyed by what hit it.
    if (target.adapts && !o.trueDamage && o.sourceId) {
      const led = target.adaptation || (target.adaptation = Object.create(null));
      const seen = led[o.sourceId] || 0;
      led[o.sourceId] = seen + 1;
      // 12% reduction per prior hit, capped at 85%.
      const reduce = Math.min(0.85, seen * 0.12);
      dmg *= (1 - reduce);
      if (seen >= 3 && !o.silent) {
        Particles.number(target.x, target.y, target.z + target.height * 0.6, 'ADAPTED', 'info', '#ffaa00');
      }
    }

    dmg = Math.max(1, Math.round(dmg));
    target.health -= dmg;
    target.hurtFlash = 1;
    target.lastHitTime = 0;

    // Knockback.
    if (o.knock && !target.heavy) {
      const k = o.knock * (target.knockResist != null ? 1 - target.knockResist : 1);
      target.vx = (target.vx || 0) + (o.dirX || 0) * k;
      target.vy = (target.vy || 0) + (o.dirY || 0) * k;
    }

    if (!o.silent) {
      const kind = o.crit && o.crit.crit ? 'crit' : 'normal';
      Particles.number(
        target.x, target.y, target.z + target.height * 0.75,
        dmg, kind,
        o.crit && o.crit.kind === 'blackflash' ? '#ff0044'
          : o.crit && o.crit.kind === 'bonecrush' ? '#ffffff'
            : (o.color || '#ffdd66'));
    }

    if (target.health <= 0) {
      target.health = 0;
      target.dead = true;
    }
    return dmg;
  }

  /**
   * Full player-attack resolution: rolls crit, applies damage, plays the
   * matching feedback. Returns the damage dealt.
   */
  function playerHit(p, target, baseDamage, opts) {
    const o = opts || {};
    const crit = o.noCrit ? { crit: false, kind: null, mult: 1 } : rollCrit(p, target);

    let dmg = baseDamage * (p.mods.damage || 1) * crit.mult;
    if (crit.crit) dmg *= p.flag('critMult', 1);    // King of Black Flash
    dmg *= p.comboDamage();                          // kill chain
    if (p.zone > 0) dmg *= 1 + p.flag('zoneBonus', 0.10);
    if (o.ratio && Math.random() < 0.7) dmg *= 1.7; // Nanami's 7:3
    if (o.vsMarked && target.marked > 0) dmg *= o.vsMarked;

    const dealt = damage(target, dmg, {
      trueDamage: o.trueDamage,
      sourceId: o.sourceId,
      crit,
      knock: o.knock,
      dirX: o.dirX, dirY: o.dirY,
      color: o.color,
    });

    // Feedback.
    const hx = target.x, hy = target.y, hz = target.z + target.height * 0.5;
    if (crit.crit) {
      if (crit.kind === 'blackflash') {
        PostFX.blackFlash();
        Audio.SFX.blackFlash();
        enterZone(p);
        p.bfChain = Math.min(p.bfChain + 1, 3);
        p.hitstop = Math.max(p.hitstop, 0.14);
        Particles.burst(hx, hy, hz, { count: 26, color: '#ff0044', core: '#ffffff', speed: 9, size: 0.3, life: 0.7 });
        Particles.burst(hx, hy, hz, { count: 14, color: '#000000', speed: 6, size: 0.42, life: 0.55, additive: false });
      } else {
        PostFX.boneCrush();
        Audio.SFX.boneCrush();
        p.hitstop = Math.max(p.hitstop, 0.11);
        Particles.burst(hx, hy, hz, { count: 20, color: '#ffffff', speed: 8, size: 0.26, life: 0.6 });
      }
    } else {
      // A missed chain resets Yuji's escalation, unless a boon says otherwise.
      if (p.char.blackFlashChain && !p.flag('bfNoReset', 0)) p.bfChain = 0;
      Audio.SFX.hit(M.clamp(baseDamage / 70, 0.5, 2));
      p.hitstop = Math.max(p.hitstop, M.clamp(baseDamage / 900, 0.012, 0.055));
      PostFX.impact({ shake: M.clamp(baseDamage / 260, 0.05, 0.5) });
      Particles.burst(hx, hy, hz, {
        count: M.clamp(Math.round(baseDamage / 12), 4, 14),
        color: o.color || p.char.color, core: '#ffffff',
        speed: 5, size: 0.18, life: 0.45,
      });
    }

    if (crit.crit && p.flag('critHeal', 0)) p.heal(p.flag('critHeal', 0));
    if (target.dead) onKill(p, target);

    // Lifesteal from mods or the ability itself.
    const ls = (o.lifesteal || 0) + (p.mods.lifesteal || 0);
    if (ls > 0) p.heal(dealt * ls);

    p.lastHitAt = 0;
    return dealt;
  }

  function onKill(p, target) {
    if (target.counted) return;
    target.counted = true;
    p.kills++;
    p.registerKill();
    // Score scales with the chain, so pushing is worth real points.
    p.score += Math.round((target.score || 10) * (1 + p.combo * 0.08));
    p.addMana((target.manaReward || 4) + p.flag('killEnergy', 0));

    // Cascade: corpses detonate.
    if (p.flag('deathBlast', 0) && JJK.G && JJK.G.map) {
      JJK.Projectiles.explode(JJK.G, target.x, target.y, target.height * 0.4,
        2.6, 55 * (p.mods.damage || 1), {
          color: p.char.glow, force: 6, sourceId: 'cascade',
        });
    }
    Audio.SFX.enemyDie();
    Particles.burst(target.x, target.y, target.z + target.height * 0.4, {
      count: 22, color: target.glow || '#a855f7', core: '#ffffff',
      speed: 6, size: 0.3, life: 0.9,
    });
    Particles.smoke(target.x, target.y, target.z + 0.3, '#1a0f22', 8);
  }

  JJK.Combat = {
    rollCrit, damage, playerHit, enterZone, onKill,
    BLACK_FLASH_MULT, BONE_CRUSH_MULT, ZONE_DURATION,
  };
})(window.JJK);
