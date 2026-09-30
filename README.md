# JUJUTSU KAISEN — Cursed Battle

A fan-made Jujutsu Kaisen action game you play in your browser. One game, two
ways to play: a **2D top-down** arena brawler and a **3D first-person** version
on a custom raycasting engine.

## ▶ [Play now](https://kimmmysay.github.io/JJK/)

Nothing to install. Open the link, pick **2D** or **3D**, and fight.

### Or download it and play offline

1. Click the green **Code** button at the top of this page → **Download ZIP**
2. Unzip it
3. Double-click **`index.html`**

No server, no installs, no internet needed after download. Works in any modern
browser (Chrome, Edge, Firefox, Safari).

---

## What's in it

- **23 playable sorcerers** — Gojo, Yuji, Sukuna, Megumi, Yuta, Hakari, Maki,
  Toji, Nanami, Todo, Choso, Nobara, Inumaki, Mahito, Kashimo, Higuruma,
  Geto and more, each with their own abilities and passive
- **5 Special Grade bosses** — Jogo, Hanami, Mahito, Dagon and the Finger Bearer
- **Domain Expansions**, Black Flash crits, Reverse Cursed Technique healing
- **Three modes** in both versions:
  - **Story** — start as Yuji and unlock the roster as you survive waves
  - **Endless** — everyone unlocked, chase a high score
  - **Battle** — 1v1 up to 1v4 against AI sorcerers

The 3D version adds climbable arenas with double jump, 43 in-run upgrades
("boons"), multi-phase bosses, wave modifiers and 11 Domain Expansions that
repaint the whole arena.

## Controls

| | 2D · Top-down | 3D · First person |
|---|---|---|
| Move | WASD / arrows | WASD + mouse to look |
| Attack | — | Left click |
| Abilities | J · K · L | Q · E · C |
| Domain Expansion | Q | X |
| Heal (RCT) | R | F |
| Passive | SPACE | Right click (or V) |
| Jump / double jump | — | SPACE |
| Dash | — | SHIFT |
| Black Flash | H | rolls on left-click hits |
| Pause | ESC | ESC |

In 3D, click the screen to lock the mouse. On the launcher, press `1` / `2` or
use the arrow keys + `Enter`. Each title screen has a link to switch between 2D
and 3D.

Progress saves in your browser. 2D and 3D keep separate saves.

---

## For developers

Plain HTML + JavaScript. No frameworks, no build step, no dependencies.

```
index.html          Launcher — pick 2D or 3D
2d/                 Top-down game (HTML5 canvas)          → 2d/README.md
fps/                First-person game, custom raycaster   → fps/README.md
prototypes/         "Reality Shift" interactive art experiment
Avatar/             Character art, shared by both games
sky.jpeg            Sky texture, shared by both games
```

- Run the FPS tests: `cd fps && node tools/headless-test.js`
- Preview the FPS sprites: open `fps/tools/sprite-preview.html`

**Known issue:** the 2D game points at `.png` files for most of the roster, but
13 of its 23 portraits are other formats on disk (`.webp`, `.jpg`, …), so they
show as broken images. The 3D build uses a corrected list in
`fps/js/data/sprites.js`.

---

*Fan project. Characters and techniques are from* Jujutsu Kaisen *by Gege
Akutami.*
