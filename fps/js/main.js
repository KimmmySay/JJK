/* ==========================================================================
   MAIN — boot sequence.

     1. wire the renderer to the canvas
     2. load images and bake every sprite sheet (with a progress bar)
     3. attach input, restore settings
     4. hand over to the title screen

   Pointer lock is requested on click and released by ESC; losing it pauses
   the game rather than leaving you standing still while enemies close in.
   ========================================================================== */

(function (JJK) {
  'use strict';

  const canvas = document.getElementById('game');
  const lockPrompt = document.getElementById('lockPrompt');

  /* ------------------------------------------------------------------
     Pointer lock
     ------------------------------------------------------------------ */
  function requestLock() {
    JJK.Audio.resume();
    JJK.Input.requestLock();
  }
  JJK.requestLock = requestLock;

  function updateLockPrompt() {
    const G = JJK.G;
    const inGame = G.running && !G.paused && !G.over;
    const anyMenu = document.body.classList.contains('menu-open');
    lockPrompt.classList.toggle('hidden', !(inGame && !JJK.Input.locked && !anyMenu));
  }

  lockPrompt.addEventListener('click', requestLock);
  canvas.addEventListener('click', () => {
    if (JJK.G.running && !JJK.G.paused && !JJK.G.over) requestLock();
  });

  JJK.Input.onLockChange = updateLockPrompt;
  JJK.Input.onPauseRequest = function () {
    // ESC (or any lock loss) mid-run pauses instead of silently continuing.
    const G = JJK.G;
    if (G.running && !G.paused && !G.over) G.setPaused(true);
    updateLockPrompt();
  };

  // Keep the prompt honest even if state changes without a lock event.
  setInterval(updateLockPrompt, 250);

  /* ------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------ */
  async function boot() {
    const fill = document.getElementById('loadFill');
    const status = document.getElementById('loadStatus');

    JJK.Renderer.init(canvas);
    JJK.Input.attach(canvas);
    window.addEventListener('resize', () => JJK.Renderer.resize());

    status.textContent = 'loading portraits…';

    try {
      await JJK.Art.build((done, total) => {
        const f = done / total;
        fill.style.width = Math.round(f * 82) + '%';
        status.textContent = `loading assets… ${done}/${total}`;
      });
    } catch (err) {
      // Individual bake failures are retried and substituted inside
      // Art.build; reaching here means nothing usable was built. Continuing
      // would show menus for a game whose every spawn crashes — stop loudly.
      console.error('asset build failed', err);
      status.textContent = 'asset build failed — see console (F12)';
      fill.style.background = '#ff4455';
      return;
    }

    fill.style.width = '92%';
    status.textContent = 'baking cursed energy…';
    // Yield so the bar actually paints before the synchronous bake work.
    await new Promise((r) => setTimeout(r, 60));

    // Pre-warm the first arena's wall textures so the first frame isn't a hitch.
    try { JJK.Textures.prewarm(JJK.LEVELS[0].theme); } catch (e) { /* non-fatal */ }

    fill.style.width = '100%';

    const failures = JJK.Assets.failures();
    const note = document.getElementById('assetNote');
    if (failures.length) {
      console.warn('Missing art (using procedural fallbacks):', failures);
      note.textContent = `${failures.length} art file(s) missing — using fallbacks`;
    } else {
      note.textContent = `${Object.keys(JJK.SPRITES.PORTRAITS).length} portraits loaded`;
    }

    JJK.Menu.load();
    JJK.Menu.bind();
    JJK.Menu.applySettings();

    status.textContent = 'ready';
    await new Promise((r) => setTimeout(r, 220));
    JJK.Menu.showScreen('title');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window.JJK);
