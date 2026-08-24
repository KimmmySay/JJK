# JUJUTSU KAISEN — Cursed Battle

One game, two perspectives. **Open `index.html`** and choose:

- **2D · TOP-DOWN** — the original arena game (`2d/`)
- **3D · FIRST PERSON** — the raycasting build (`fps/`)

Both share the same 23 sorcerers, 5 bosses and character art, and both run
offline with no build step. Each title screen has a **‹ 2D / 3D SELECT** link
back to the launcher and a **SWITCH TO 2D / 3D** link straight across, so you
can hop between perspectives without leaving the browser. The launcher
remembers your last pick (`localStorage` key `jjk_perspective`) and takes
keyboard input: `1` / `2`, or arrows + `Enter`.

```
Game/
├── index.html              ← START HERE: pick 2D or 3D
│
├── 2d/                     Top-down arena game
│   ├── jjk-game.html         (launched by index.html; also opens standalone)
│   ├── characters.js         23 characters
│   ├── bosses.js             5 bosses
│   └── README.md             full details
│
├── fps/                    First-person game, custom raycasting engine
│   ├── index.html            (launched by ../index.html; also opens standalone)
│   ├── js/  css/             engine, data, game, UI
│   ├── tools/                test harness + sprite preview
│   └── README.md             full details
│
├── prototypes/             Experiments
│   └── bewilder-prototype.html   "Reality Shift" — interactive art piece
│
├── Avatar/                 Shared character art (29 images)
└── sky.jpeg                Shared sky texture
```

`Avatar/` and `sky.jpeg` live at the top level because **both games use them**.
Neither game copies the art; they reference it as `../Avatar/…`.

---

## The two perspectives

They are two independent code bases behind one front door. The launcher
navigates to whichever you pick — nothing is loaded in an iframe, so pointer
lock, fullscreen and saves behave exactly as they did standalone. Each build
stamps `jjk_perspective` on load, so the launcher's "LAST PLAYED" badge stays
right however you arrived. Progress is per perspective: the 2D game saves
under `jjk_story_progress`, the FPS under its own key; they do not share
unlocks.

### `2d/` — Cursed Battle *(top-down)*

The original. Top-down arena combat on HTML5 canvas, one 8,000-line file.
23 characters with four abilities each, bosses every 5 waves, Story / Endless /
Battle modes.

**Play:** `index.html` → **2D**, or open `2d/jjk-game.html` directly

### `fps/` — Cursed Domain *(first person)*

A separate build on a raycasting engine written from scratch — no Three.js,
no WebGL, no dependencies. Same roster and bosses, rebuilt for first person:
8-angle enemy sprites, climbable arenas with double jump, 43 in-run boons,
boss phases, wave modifiers, 11 domain expansions that repaint the arena.

**Play:** `index.html` → **3D**, or open `fps/index.html` directly
**Inspect the art:** open `fps/tools/sprite-preview.html`
**Run the tests:** `cd fps && node tools/headless-test.js`

---

## Note on the shared art

`Avatar/` has some filenames worth knowing about before you edit paths:

- `Higurama.webp` — misspelled on disk (should be *Higuruma*)
- `GojoFULL.webp` — upper-case `FULL`
- `Toge.webp` — Inumaki is filed under his given name
- Mixed formats: `.png` `.webp` `.jpg` `.gif` `.avif`

The 2D game assumes `.png` for most of the roster, so **13 of its 23 portraits
point at files that do not exist** and render as broken images. That has been
left exactly as it was — moving the folder did not change it. The FPS build
carries a corrected, verified path list in `fps/js/data/sprites.js`.

If you want the 2D game's portraits fixed, that's a small change to its two
sprite maps — just ask.

---

*Characters and techniques are from* Jujutsu Kaisen *by Gege Akutami.*
