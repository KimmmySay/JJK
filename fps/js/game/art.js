/* ==========================================================================
   ART REGISTRY — bakes every sprite sheet once, after images have loaded.

   Curse spirits get several seeded variants per tier so a wave doesn't look
   like one enemy stamped twelve times. Portraits are baked into figure
   billboards (see spritebake.bakeAvatar) which normalises png / webp / jpg
   into one consistent look with a rim light and ground shadow.
   ========================================================================== */

(function (JJK) {
  'use strict';

  const { M, SpriteBake, CHARACTERS, BOSSES, SPRITES, Assets } = JJK;

  const CURSE_VARIANTS = 4;

  const Art = {
    avatars: Object.create(null),
    bosses: Object.create(null),
    curses: Object.create(null),
    props: Object.create(null),
    sky: null,
    ready: false,
  };

  /**
   * Bake one sheet, retrying with a nudged seed on failure. Bake bugs are
   * seed-dependent (a bad random roll can produce an illegal canvas call),
   * so a reseed usually succeeds. Returns null only if every try throws —
   * callers must substitute, never leave a hole that crashes at spawn time.
   */
  function tryBake(label, seed, fn) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { return fn((seed + attempt * 0x9e37) >>> 0); }
      catch (err) { console.error(`bake failed (${label}, attempt ${attempt + 1})`, err); }
    }
    return null;
  }

  /** Load every image, then bake. onProgress(done,total,label). */
  async function build(onProgress) {
    const manifest = {};
    for (const id of Object.keys(SPRITES.PORTRAITS)) manifest['char:' + id] = SPRITES.PORTRAITS[id];
    for (const id of Object.keys(SPRITES.BOSS_PORTRAITS)) manifest['boss:' + id] = SPRITES.BOSS_PORTRAITS[id];
    for (const id of Object.keys(SPRITES.PROPS)) manifest['prop:' + id] = SPRITES.PROPS[id];
    manifest.sky = SPRITES.SKY;

    const imgs = await Assets.loadMap(manifest, onProgress);
    Art.sky = imgs.sky || null;

    // Character figures.
    for (const id of Object.keys(CHARACTERS)) {
      const c = CHARACTERS[id];
      Art.avatars[id] = tryBake('avatar:' + id, M.hash(id),
        (s) => SpriteBake.bakeAvatar(imgs['char:' + id], c.color, c.glow, s));
    }

    // Bosses: portrait where we have one, procedural curse where we don't.
    for (const id of Object.keys(BOSSES)) {
      const b = BOSSES[id];
      const img = imgs['boss:' + id];
      if (img) {
        Art.bosses[id] = tryBake('boss:' + id, M.hash('boss' + id),
          (s) => SpriteBake.bakeAvatar(img, b.color, b.glow, s));
      } else {
        const spec = b.procedural || { tier: 'special' };
        Art.bosses[id] = tryBake('boss:' + id, M.hash('boss' + id),
          (s) => SpriteBake.bakeCurse(spec.tier || 'special', s));
      }
    }

    // Curse spirit variants. A failed variant is skipped, not pushed as a
    // hole — curseSheet indexes into these arrays at spawn time.
    for (const tier of Object.keys(SpriteBake.CURSE_TIERS)) {
      Art.curses[tier] = [];
      for (let v = 0; v < CURSE_VARIANTS; v++) {
        const sheet = tryBake('curse:' + tier + ':' + v, M.hash(tier + ':' + v),
          (s) => SpriteBake.bakeCurse(tier, s));
        if (sheet) Art.curses[tier].push(sheet);
      }
    }

    // Shikigami get the dedicated animated baker, NOT bakeAvatar. Running a
    // divine dog through the humanoid capsule mask produces a floating
    // vertical oval that never moves a muscle — the exact "bot" look.
    // bakeShikigami authors the silhouette and a real animation cycle, and
    // composites the source art inside it as texture.
    Art.props.divineDog = tryBake('shiki:divineDog', M.hash('divineDog'),
      (s) => SpriteBake.bakeShikigami('divineDog', imgs['prop:divineDog'], s));
    // The Divine Dogs are a black-and-white pair; alternated on summon.
    Art.props.divineDogWhite = tryBake('shiki:divineDogWhite', M.hash('divineDogWhite'),
      (s) => SpriteBake.bakeShikigami('divineDogWhite', imgs['prop:divineDog'], s));
    Art.props.nue = tryBake('shiki:nue', M.hash('nue'),
      (s) => SpriteBake.bakeShikigami('nue', imgs['prop:nue'], s));
    Art.props.chimera = tryBake('shiki:chimera', M.hash('chimera'),
      (s) => SpriteBake.bakeShikigami('divineDog', imgs['prop:chimera'], s));
    Art.props.mahoraga = tryBake('shiki:mahoraga', M.hash('mahoraga'),
      (s) => SpriteBake.bakeShikigami('mahoraga', imgs['prop:megunaMaho'], s));

    Art.ready = true;
    return Art;
  }

  /** Pick a stable curse sheet for an entity by uid. */
  function curseSheet(tier, uid) {
    let arr = Art.curses[tier];
    if (!arr || !arr.length) arr = Art.curses.weak;
    if (!arr || !arr.length) {
      // Last resort: any tier that baked. Spawning must never crash the
      // update loop over a missing sheet.
      for (const t of Object.keys(Art.curses)) {
        if (Art.curses[t].length) { arr = Art.curses[t]; break; }
      }
    }
    return arr && arr.length ? arr[uid % arr.length] : null;
  }

  Art.build = build;
  Art.curseSheet = curseSheet;
  JJK.Art = Art;
})(window.JJK);
