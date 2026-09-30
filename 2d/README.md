# JUJUTSU KAISEN - Cursed Battle

A browser-based action game inspired by Jujutsu Kaisen, built entirely with vanilla HTML5 Canvas and JavaScript. No frameworks, no build tools — just open and play.

---

## Game Modes

**Story Mode** — Start as Yuji Itadori and unlock characters and abilities as you fight through escalating waves of cursed spirits.

**Endless Mode** — All 23 characters unlocked from the start. Survive infinite waves and chase a high score.

**Battle Mode** — PvP-style combat against AI-controlled sorcerers. Set up 1v1 through 1v4 matchups, pick your opponents or randomize them.

## Characters

The roster includes 23 playable sorcerers and cursed spirits, each with four unique abilities (J/K/L/Q), individual stats (HP, speed, Black Flash chance), and signature passives:

Gojo, Yuji, Sukuna, Megumi, Yuta, Hakari, Maki, Mahoraga, Todo, Choso, Nobara, Inumaki, Nanami, Mahito, Kashimo, Higuruma, Ryu, Jogo, Hanami, Toji, Geto — plus special forms like Full Power Gojo and Meguna (Sukuna in Megumi's body).

Characters fall into distinct playstyles — mana-based casters, physical brawlers with zero cursed energy, summoners, glass cannons, and tanks.

## Combat Mechanics

- **Abilities** — Four per character mapped to J, K, L, and Q (domain expansion). Each has mana costs and cooldowns.
- **Black Flash** — A critical hit system with per-character probability. Yuji has the highest base chance at 15%.
- **Bone Crush** — Physical-only characters like Maki and Toji replace Black Flash with devastating Bone Crush hits.
- **RCT (Reverse Cursed Technique)** — Healing ability available to select characters via the R key.
- **Passives** — Character-specific mechanics activated with SPACE or triggered automatically (Infinity, Shikigami, Adaptation, Jackpot, etc.).
- **Domain Expansions** — Ultimate abilities costing 50 mana with long cooldowns.

## Boss Fights

Every 5 waves, a Special Grade cursed spirit appears: Jogo, Hanami, Mahito, Dagon, or the Finger Bearer. Bosses have unique attack patterns (projectiles, beams, AOE, summons, debuffs) and scale in health, damage, and speed with each cycle.

## Controls

| Key | Action |
|-----|--------|
| WASD / Arrow Keys | Move |
| J | Ability 1 |
| K | Ability 2 |
| L | Ability 3 |
| Q | Domain Expansion |
| R | RCT Heal |
| H | Black Flash |
| SPACE | Character passive |

## How to Play

Open `jjk-game.html` in any modern browser. No installation or server needed.

Art lives one level up in `../Avatar/` because the first-person build in
`../fps/` shares it.

## Files

```
jjk-game.html             Main game (HTML5 Canvas)
characters.js             Character database (stats, abilities, passives)
bosses.js                 Boss database (attacks, scaling, spawn order)
../Avatar/                Character portraits (shared with the FPS build)
../sky.jpeg               Night sky background (shared)
../prototypes/            Reality Shift art experiment
../fps/                   First-person build of this game
```

## Bonus: Reality Shift

An experimental interactive art piece, now in `../prototypes/`. Click anywhere
to distort reality — the experience evolves through phases with glitch effects,
gravity inversion, floating geometry, hidden secrets, and a portal that opens if
you look hard enough.

---

*Built with HTML5 Canvas, vanilla JS, and zero dependencies.*
