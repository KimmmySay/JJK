# JUJUTSU KAISEN — CURSED DOMAIN

A **first-person** cursed-combat game. 23 playable sorcerers, 5 Special Grade bosses,
6 hand-built arenas, 11 Domain Expansions.

Built on a custom raycasting engine written from scratch — no Three.js, no WebGL, no
CDN, no build step, no dependencies. Open `index.html` and play.

> This is a separate build. The original top-down game in the parent folder
> (`../jjk-game.html`) is untouched and still works exactly as before.

---

## Play

Open `fps/index.html` in any modern browser. Click to lock the mouse.

That's it — it runs straight off `file://` with no server, which is why the code
uses classic `<script>` tags rather than ES modules (modules are CORS-blocked on
`file://`).

## Controls

Valorant-style left-hand layout — your right hand never leaves the mouse.

| Key | Action |
|-----|--------|
| **W A S D** | Move |
| **Mouse** | Look |
| **LMB** | Cursed strike — this is what rolls Black Flash |
| **Q** | Ability 1 |
| **E** | Ability 2 |
| **C** | Ability 3 |
| **X** | Domain Expansion |
| **F** | Reverse Cursed Technique (heal) |
| **RMB** | Passive — hold for Gojo's Infinity (also `V`) |
| **SPACE** | Jump · press again mid-air to **double jump** |
| **SHIFT** | Dash (brief i-frames) |
| **TAB** | Map |
| **ESC** | Pause |

Aliases: `J` `K` `L` and `1`–`4` also fire abilities, `R` also heals.

## Modes

**Story** — Start as Yuji. The roster unlocks on a wave ladder and the arena
rotates every 5 waves. Progress is saved to localStorage.

**Endless** — Everything unlocked. Pick your arena, survive as long as you can.

**Battle** — 1v1 through 1v4 against AI sorcerers running real character kits,
at three difficulty grades.

## Run structure

**Boons.** Every 3 waves you pick 1 of 3 upgrades, chosen with the ability
keys already under your left hand — no pointer-lock break. 43 of them, 17
character-specific: *Unbroken Chain* takes Yuji's Black Flash escalation to
60% and stops it resetting; *Wider Shadow* gives Megumi an extra shikigami
per summon; *Rigged Reels* stops Hakari's gamble from ever busting. Some are
deals rather than gifts — *Binding Vow* doubles your damage and halves your
health.

**Kill chain.** Kills within 4s of each other stack a chain worth up to +51%
damage and a growing score multiplier, and it decays if you stop pushing.
Aggression had no reward before this except the Zone, which only fires on a
Black Flash.

**Boss phases.** At 60% and 30% health a boss transitions: brief invulner-
ability, a shockwave that clears the space around it, then cooldowns come
~30%/~50% faster, telegraphs shorten, damage climbs and it moves quicker.
The health bar shows both thresholds so you can see the next escalation
coming.

**Wave modifiers.** From wave 3 a wave can roll a rule change, announced
before it starts: every curse a grade higher, twice as many at half health,
no energy regeneration, near-zero visibility, one-hit-kill glass on both
sides, no wind-up at all, or a Bounty paying triple score and a guaranteed
boon. Boss waves are exempt — they're enough on their own.

## Combat

- **Black Flash** — per-character odds on every strike. Yuji is highest at 15% and
  *chains*: 15 → 25 → 35 → 45% on consecutive crits. Sukuna rises to 25% against
  stunned targets. Landing one puts you in **the Zone**: +10% damage and speed for 15s.
- **Bone Crush** — Maki, Toji and Mahoraga have no cursed energy, so no Black Flash
  and no RCT. They roll Bone Crush instead, and their abilities are free.
- **Adaptation** — Mahoraga keeps a ledger of what has hit it. Each repeat of the
  same ability does 12% less, up to 85% reduction. Vary your attacks or stop hurting it.
- **Blue / Red are fired, not placed.** They leave your hand as a volumetric orb
  you aim and watch cross the room, detonating into their field wherever they
  land — Blue implodes and drags everything in, Red blasts outward. The visible
  ball is deliberately much smaller than the pull radius; sizing it to the full
  AoE made it wider than a corridor and it just smeared across the screen.
- **Domain Expansions** — sure-hit damage plus a rider that changes the rules
  (Unlimited Void freezes everything, Deadly Sentencing executes below 34% HP,
  Idle Death Gamble grants infinite cursed energy).
- **Toji is domain-immune.** Heavenly Restriction means no domain touches him.

## Bosses

One every 5 waves: Jogo, Hanami, Mahito, Dagon, Finger Bearer. Each scales +25% HP,
+15% damage and +5% speed per appearance.

Every boss attack has a **telegraph** — a wind-up during which the boss commits,
its aura swells, and a warning marker is drawn in the world (a ground ring for AOE,
a sight line for beams and charges). If a boss kills you, it was avoidable.

## Arenas

| Arena | Style |
|-------|-------|
| Shibuya Concourse | Tiled underground hall, service blocks, pillar rows |
| Jujutsu High | Open sky, stone halls, torii gates |
| Shibuya Crossing | Neon city blocks around a wide crossroads |
| Cursed Womb | Chambers of flesh split by a long central spine |
| Culling Game Colony | Ruined compounds with timber cores |
| Malevolent Shrine | One massive shrine core you circle, flanked by torii |

Maps are authored as ASCII art in `js/data/levels.js` — edit them directly.

### Verticality

Arenas are **48 × 36** (2.3× the old footprint) and have real vertical
structure. Cells carry a height, so geometry is not all one wall:

| | height | traversal |
|---|---|---|
| `n` `m` | 0.40 | vault it with one jump |
| `N` | 0.72 | needs the **double jump** |
| `#` `=` `%` `｜` `T` | 1.30 | wall |
| `H` | 2.60 | tower — blocks everything |

Those numbers are solved against the jump arc rather than guessed: a single
jump peaks at `v²/2g = 2.6²/15 = 0.45` and a double at `0.45 + 2.35²/15 =
0.82`. So `n` clears on one jump, `N` demands the second, and standing on an
`n` then single-jumping (0.40 + 0.45 = 0.85) also reaches an `N` — blocks
chain into routes.

The raycaster marches *past* anything under full height, recording it, then
draws those blocks back-to-front after the far wall, so you see over cover
and can stand on it. Sprites behind a block are clipped at its top edge.
Sight lines and projectiles pass over low cover — you can shoot across a
crate — but ground AI treats every block as solid, because enemies can't
jump.

**Lane width is a hard constraint.** Bosses are up to 1.15 units in radius, so
they need cells whose full 3×3 neighbourhood is clear. A thin-walled maze looks
great in ASCII and is unusable by anything large. The test harness enforces that
at least 45% of every arena is large-body navigable and that every spawn point
connects to that network.

---

## How it renders

A **DDA raycaster** in plain canvas 2D. The projection is derived so horizontal and
vertical scale match exactly (`k = W / (2 · projH)`), which is why sprites never look
stretched against walls. Eye height is 0.5, so in any column a wall exactly covers
everything behind it — that's what lets floor decoration be drawn *before* walls and
still be occluded correctly.

Wall shading merges darkening and distance fog into a single `fillRect` per column
via a precomputed 32×8 colour LUT, so the inner loop never builds a colour string.

**All art is generated at load time.** Wall textures, curse spirits, effects — every
pixel is drawn with canvas paths from a seeded RNG, so a given wall or creature looks
identical every session. Nothing calls `getImageData`, which matters because the
`Avatar/` images are loaded over `file://` and would taint a canvas.

Curse spirits are drawn silhouettes — irregular organic bodies from a radial noise
walk, rim-lit, with asymmetric glowing eyes and a jagged maw. They are not stacks
of primitives.

Each is baked at **8 yaw angles × 8 poses (64 frames)**. A single front-facing
billboard is what makes sprite enemies read as flat paintings: it always turns to
face you, so you can never see which way it is looking, never flank it, and never
perceive it as a volume. Turning is expressed three ways at once — the body
foreshortens as it goes side-on, facial features slide across the head and clip
out past the edge, and limb depth order swaps. Past 90° the face is gone and a
ridged spine takes over, so a curse with its back to you is unmistakable.

Enemies face **where they are travelling**, not permanently at you, and they
approach in flanking arcs rather than beelines, peeling off to reposition after
they land a hit. All 8 views end up in real use.

Shadows are **projected onto the floor**, not painted into the sprite. A shadow
baked into a billboard lives on a vertical plane, and is the single biggest reason
sprite creatures look pasted onto the world.

### The shikigami

Megumi's Ten Shadows get a dedicated baker (`bakeShikigami`) rather than the
humanoid portrait path, because a divine dog is not a person: run it through the
capsule mask and you get a floating vertical oval that slides around without
moving a muscle.

Each is authored as a shadow construct — a near-black volume with a cursed-blue
rim, with the source portrait composited *inside* the silhouette as texture, so
the real art still reads but the shape and motion are deliberate:

- **Divine Dog** — quadruped, four-legged run cycle that speeds up with actual
  movement speed, wagging tail, ears, maw that opens on the strike
- **Nue** — winged, flapping across the cycle, hovers with a bob, throws
  lightning between its wingtips
- **Mahoraga** — heavy humanoid with the wheel of adaptation turning above it

They rise out of a shadow pool on summon rather than popping into existence.
Open `tools/sprite-preview.html` to watch every sheet animate.

### Per-character cast animations

All 23 sorcerers used to share one swing curve, so every technique was the
same punch in a different colour. There are now **20 distinct animations**,
several driven by what the characters actually do rather than invented:

- **Todo — clap.** Boogie Woogie is activated by clapping; no contact needed.
- **Megumi — hand sign.** He weaves a shadow puppet of the shikigami he wants,
  and the shadow manifests it.
- **Inumaki — speak.** Cursed Speech leaves the *mouth*; his hand pulls the
  collar down and the energy erupts from the centre of the view, not a palm.
- **Gojo — point.** Limitless is directed with an extended two-finger hand.
- **Nanami — overhead chop** with the blunt cleaver. **Sukuna — claw rake.**
  **Maki — spear thrust.** **Toji — a single brutally fast flick.**
  **Ryu — braced two-palm cannon.** **Choso — draws blood down the forearm.**

Hands are posed per finger (`fist` / `open` / `point` / `claw` / `grip`), so a
two-finger point and a claw are genuinely different shapes rather than one
`grip` scalar. Punches alternate lead hand so consecutive hits differ.

The only shared animations are Gojo/Full-Power Gojo, Sukuna/Meguna (the same
character in another body) and Yuta/Mahoraga (both large blades). The test
suite fails if any other pair collides, or if a new character has none.

### Making the hits land

The techniques doing the work, in `js/engine/postfx.js`:

- **Impact frames** — one inverted frame at the moment of contact, via a `difference`
  composite against white. One op, and it's the most "anime" trick available.
- **Hitstop** — 60–140ms of near-frozen simulation on a heavy hit.
- **Chromatic aberration** — channel-isolated copies offset in opposite directions.
- **Speed lines** — radial strokes on dash, crit and ultimate.
- **FOV kick + camera roll** — widen on dash, lean on strafe, counter-roll when hit.
- **Colour grade** — the world desaturates under a domain so the domain dominates.

A Black Flash fires almost all of them at once, plus a sub-drop through the WebAudio
synth. All audio is synthesised — there are no sound files.

---

## Layout

```
index.html                  entry point + script order
css/main.css                reset, canvas, shared UI primitives
css/screens.css             menus and overlay cards

js/engine/
  core.js                   namespace, math, seeded RNG, colour
  assets.js                 image loading that degrades instead of breaking
  map.js                    grid, collision, line of sight, BFS flow field
  textures.js               procedural wall surfaces
  spritebake.js             curse spirits, avatar billboards, effect sprites
  raycaster.js              camera + per-column DDA (projection derived here)
  renderer.js               sky, floor, walls, sprites, lighting
  postfx.js                 impact frames, hitstop, CA, domains, vignette
  viewmodel.js              first-person arms, weapons, cursed energy
  input.js                  keyboard, pointer lock, mouse look
  audio.js                  WebAudio synthesis (no sound files)

js/data/
  characters.js             23 characters, 92 abilities, all data-driven
  bosses.js                 5 bosses with telegraphed attack patterns
  levels.js                 6 arenas as ASCII maps + render themes
  domains.js                11 Domain Expansions
  sprites.js                verified art paths (single source of truth)

js/game/
  art.js                    bakes every sprite sheet after images load
  particles.js              pooled particles + floating damage numbers
  combat.js                 damage, Black Flash, Bone Crush, the Zone
  projectiles.js            projectiles, beams, fields, explosions
  entities.js               curse spirits, summons, battle opponents
  abilities.js              one dispatcher for all 92 abilities
  boss.js                   boss AI and telegraphs
  player.js                 movement, camera feel, buffs, passives
  waves.js                  wave director, spawning, mode rules
  hud.js                    HUD + world-anchored UI
  game.js                   state and main loop

js/ui/menu.js               screen flow, roster UI, persistence
js/main.js                  boot

tools/headless-test.js      full integration test (see below)
tools/stub-dom.js           shared headless DOM/canvas stub
```

Adding a character is a data edit in `characters.js` — the archetype dispatcher
handles the rest. The original game needed ~60 lines of bespoke `switch` per
character; this needs none.

---

## Testing

```bash
open tools/sprite-preview.html        # inspect every baked sprite, animating
node tools/headless-test.js           # default 2400 frames
node tools/headless-test.js 46000     # deep run
IMG_OK=1 node tools/headless-test.js  # simulate images loading successfully
```

Loads every script in `index.html` order against a stubbed DOM and actually runs
the simulation. Covers: all 23 characters casting every ability, all 5 bosses,
all 11 domains, battle mode offence and defence, and enemy pathing through geometry.
It asserts entities never enter walls, positions never go NaN, particle and
projectile caps hold, and every spawn node is reachable.

By default it forces **every image load to fail**, so the procedural-fallback path
is what gets tested — the worst case for someone whose `Avatar/` folder is missing.

### Bugs it caught during development

- **Blink teleporting the player inside walls.** The wall clamp had a `max(0.4, …)`
  floor that overshot *past* a wall when blinking from close range.
- **Negative frame delta running the simulation backwards.** `Math.min(dt, 0.05)`
  capped large deltas but not negative ones; a negative delta made cooldowns count
  up, timers never expire, and `exp(-k·dt)` overflow to Infinity, poisoning every
  velocity in the level.
- **Bosses spawning inside geometry.** Spawn markers were validated against a
  guessed radius, not the boss's own, so a large boss spawned overlapping a wall
  and could never move — `moveSlide` rejects every step when the current position
  is already illegal.
- **Ranged bosses hiding behind cover forever.** With no line of sight but inside
  preferred range, they backed *away* from the player, so every attack kept failing
  its LOS check and the boss just paced.
- **Battle-mode softlock.** `findOpenNear` checked wall clearance but not
  *reachability*, so opponents could spawn inside the sealed building interiors of
  Shibuya Crossing. They could never be reached and never die, so the match could
  never end. The map now precomputes the connected region containing the player.
- **Every arena was unusable by large bodies.** Only 1–42% of floor space was
  navigable by a radius ≥ 0.5 body — all bosses, special curses and Mahoraga.
  They moved only via a fallback and jammed constantly. All six maps were rebuilt
  around chunky cover with wide lanes; navigability is now 57–66% and enforced.
- **Entities frozen inside geometry.** If a body ever ended up overlapping a wall,
  every candidate step was illegal, so it sat at its spawn point forever holding a
  perfectly valid path it could not walk.
- **Nue and the divine dogs rendered as static floating ovals** — they were going
  through the humanoid portrait baker. Rewritten with authored silhouettes and
  real animation cycles.

### Bugs a real browser caught that the harness could not

The harness stubs canvas, so it validates logic, not draw calls. A headless
Chromium pass over the actual game found:

- **Boot crash on a seed-dependent draw call.** A mottle radius could roll
  negative and `createRadialGradient` throws on `r < 0` — killing the whole
  asset build for whichever curse rolled it. Radii are now clamped, every bake
  is retried with a nudged seed on failure, and a total build failure stops
  boot with a visible error instead of limping into an arena where every
  enemy spawn crash-loops.
- **Shikigami rim light read as debug hitboxes.** The rim was a full ellipse
  stroke around head and body — two clean glowing circles. Now partial arcs
  on the lit edge only.
- **Source art pasted as a decal.** Portrait art composited inside shikigami
  bodies at high alpha read as a white sticker (and showed checkerboards baked
  into some source files). Now blended with `soft-light` as tonal texture.
- **HUD ability names overflowing their slots** ("CHIMERA SHADOW GARDEN" is
  wider than 62px). Names now shrink to fit, then ellipsize.
- **128px pixel-art portraits blur-upscaled by the browser.** Small sources
  now render nearest-neighbor (`image-rendering: pixelated`), applied from JS
  only when `naturalWidth ≤ 256` so large art keeps smooth sampling.
- **Yaw-view flicker at bucket boundaries.** The 8-angle view was picked with
  a bare `round()`, so a facing drifting near a 22.5° boundary flipped the
  sprite between two baked views every few frames. View switches now require
  leaving the current bucket by a 12% margin (hysteresis).
- **A NaN entity could error-spam the render loop forever.** `halfW < 0.6`
  is false for NaN, so a non-finite ground shadow slipped past the guard and
  `createRadialGradient` threw every frame. Guards are now positive-logic,
  `collect()` never emits non-finite draw data, and entity physics snaps a
  poisoned position back to the last good one instead of ghosting.

---

*Characters and techniques are from* Jujutsu Kaisen *by Gege Akutami.*
