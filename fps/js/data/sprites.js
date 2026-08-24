/* ==========================================================================
   SPRITE MANIFEST
   Every path here was verified against the contents of Avatar/ on disk.

   NOTE: the original game shipped two conflicting sprite maps and 13 of the
   23 portrait paths pointed at files that do not exist (it assumed `.png`
   for everyone). This is the single source of truth for the FPS build.

   Gotchas preserved deliberately:
     - `Higurama.webp` is misspelled ON DISK. Do not "fix" the key here
       without renaming the file.
     - `GojoFULL.webp` is upper-case FULL.
     - Inumaki's portrait is filed under his given name, `Toge.webp`.
     - .gif files render as their FIRST FRAME when drawn to a canvas.
       That is expected and fine — they are stills in-engine.
   ========================================================================== */

(function (JJK) {
  'use strict';

  const DIR = '../Avatar/';

  /** Character id -> portrait file. Keys match JJK.CHARACTERS. */
  const PORTRAITS = {
    gojo:     DIR + 'Gojo.png',
    yuji:     DIR + 'Yuji.png',
    sukuna:   DIR + 'Sukuna.png',
    megumi:   DIR + 'Megumi.gif',
    yuta:     DIR + 'Yuta.png',
    hakari:   DIR + 'Hakari.gif',
    maki:     DIR + 'Maki.webp',
    mahoraga: DIR + 'Mahoraga.gif',
    todo:     DIR + 'Todo.png',
    choso:    DIR + 'Choso.jpg',
    nobara:   DIR + 'Nobara.webp',
    inumaki:  DIR + 'Toge.webp',
    nanami:   DIR + 'Nanami.webp',
    mahito:   DIR + 'Mahito.jpg',
    kashimo:  DIR + 'Kashimo.webp',
    higuruma: DIR + 'Higurama.webp',
    ryu:      DIR + 'Ryu.webp',
    jogo:     DIR + 'Jogo.webp',
    hanami:   DIR + 'Hanami.webp',
    toji:     DIR + 'Toji.webp',
    geto:     DIR + 'Geto.jpg',
    gojofull: DIR + 'GojoFULL.webp',
    meguna:   DIR + 'Meguna.webp',
  };

  /** Boss id -> portrait. Dagon + Finger Bearer have no art, so they fall
      back to fully procedural sprites (see textures.js). */
  const BOSS_PORTRAITS = {
    jogo:   DIR + 'Jogo.webp',
    hanami: DIR + 'Hanami.webp',
    mahito: DIR + 'Mahito.jpg',
    // dagon        -> procedural
    // fingerBearer -> procedural
  };

  /** Summons and ability props. */
  const PROPS = {
    divineDog:  DIR + 'MegumiDog.gif',
    nue:        DIR + 'MegumiBird.gif',
    chimera:    DIR + 'Chimera.avif',
    claw:       DIR + 'Claw.png',
    makiSpear:  DIR + 'MakiSpear.png',
    megunaMaho: DIR + 'MegunaMahoraga.webp',
  };

  /** Sky used by open-air arenas. */
  const SKY = '../sky.jpeg';

  JJK.SPRITES = { DIR, PORTRAITS, BOSS_PORTRAITS, PROPS, SKY };
})(window.JJK);
