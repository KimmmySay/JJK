/* ==========================================================================
   INPUT — keyboard, pointer lock, mouse look.

   Two things worth calling out:
     - `pressed` is edge-triggered and consumed by the game each frame, so a
       held key can't machine-gun an ability that should fire once per press.
     - Mouse deltas accumulate between frames rather than being sampled, so
       fast flicks aren't dropped at low frame rates.
   ========================================================================== */

(function (JJK) {
  'use strict';

  const { M } = JJK;

  const Input = {
    down: Object.create(null),      // held this instant
    pressed: Object.create(null),   // went down since last consume()
    released: Object.create(null),
    mouseDX: 0,
    mouseDY: 0,
    locked: false,
    sensitivity: 0.0022,
    invertY: false,
    enabled: true,
    onLockChange: null,
    onPauseRequest: null,
  };

  /**
   * Physical code -> logical action.
   *
   * Layout is Valorant-style: everything sits under the left hand so the
   * right hand never leaves the mouse. Abilities are Q / E / C, ultimate is
   * X, heal is F — all reachable without moving off WASD.
   *
   * The original game's J/K/L keys are kept as aliases, along with 1-4, so
   * nobody who learned the 2D version has to relearn it.
   */
  const BINDINGS = {
    KeyW: 'forward', ArrowUp: 'forward',
    KeyS: 'back', ArrowDown: 'back',
    KeyA: 'left', ArrowLeft: 'left',
    KeyD: 'right', ArrowRight: 'right',

    KeyQ: 'ab1', KeyJ: 'ab1', Digit1: 'ab1',
    KeyE: 'ab2', KeyK: 'ab2', Digit2: 'ab2',
    KeyC: 'ab3', KeyL: 'ab3', Digit3: 'ab3',
    KeyX: 'domain', Digit4: 'domain',

    KeyF: 'rct', KeyR: 'rct',
    KeyV: 'passive',
    Space: 'jump',
    ShiftLeft: 'dash', ShiftRight: 'dash',

    Tab: 'map', KeyM: 'map',
  };

  /** What the HUD prints for each action. Mouse actions are named, not keyed. */
  const LABELS = {
    ab1: 'Q', ab2: 'E', ab3: 'C', domain: 'X',
    rct: 'F', passive: 'RMB', dash: 'SHIFT', strike: 'LMB',
    jump: 'SPACE', map: 'TAB',
  };

  function setKey(action, isDown) {
    if (!action) return;
    if (isDown) {
      if (!Input.down[action]) Input.pressed[action] = true;
      Input.down[action] = true;
    } else {
      if (Input.down[action]) Input.released[action] = true;
      Input.down[action] = false;
    }
  }

  function onKeyDown(e) {
    if (e.code === 'Escape') return;              // handled by pointerlockchange
    const action = BINDINGS[e.code];
    if (!action) return;
    // Tab would move focus off the canvas; Space would scroll the page.
    // Tab would move focus off the canvas; Space would scroll the page.
    if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
    if (!Input.enabled) return;
    if (e.repeat) return;   // held keys must not re-trigger `pressed`
    setKey(action, true);
  }

  function onKeyUp(e) {
    const action = BINDINGS[e.code];
    if (!action) return;
    if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
    setKey(action, false);
  }

  function onMouseMove(e) {
    if (!Input.locked || !Input.enabled) return;
    Input.mouseDX += e.movementX || 0;
    Input.mouseDY += e.movementY || 0;
  }

  function onMouseDown(e) {
    if (!Input.locked || !Input.enabled) return;
    e.preventDefault();
    if (e.button === 0) setKey('strike', true);
    else if (e.button === 2) setKey('passive', true);
    else if (e.button === 1) setKey('dash', true);
  }

  function onMouseUp(e) {
    if (e.button === 0) setKey('strike', false);
    else if (e.button === 2) setKey('passive', false);
    else if (e.button === 1) setKey('dash', false);
  }

  function onWheel(e) {
    if (Input.locked) e.preventDefault();
  }

  let canvasEl = null;

  function attach(canvas) {
    canvasEl = canvas;
    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp, { passive: false });
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('pointerlockchange', () => {
      const was = Input.locked;
      Input.locked = document.pointerLockElement === canvasEl;
      if (!Input.locked) {
        // Dropping lock clears held keys, otherwise you resume mid-strafe.
        Input.down = Object.create(null);
        if (was && Input.onPauseRequest) Input.onPauseRequest();
      }
      if (Input.onLockChange) Input.onLockChange(Input.locked);
    });

    // Losing focus mid-game must not leave movement keys stuck on.
    window.addEventListener('blur', () => {
      Input.down = Object.create(null);
    });
  }

  function requestLock() {
    if (!canvasEl) return;
    const p = canvasEl.requestPointerLock?.();
    // Chrome returns a promise; swallow the rejection when the user has
    // just exited lock (browsers rate-limit re-entry for ~1s).
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }

  function exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Read + clear accumulated mouse motion, returning yaw/pitch deltas. */
  function consumeMouse() {
    const dx = Input.mouseDX * Input.sensitivity;
    const dy = Input.mouseDY * Input.sensitivity * (Input.invertY ? -1 : 1);
    Input.mouseDX = 0;
    Input.mouseDY = 0;
    return { dx, dy };
  }

  /** Clear edge-triggered state. Call once at the end of each frame. */
  function endFrame() {
    Input.pressed = Object.create(null);
    Input.released = Object.create(null);
  }

  function isDown(a) { return !!Input.down[a]; }
  function wasPressed(a) { return !!Input.pressed[a]; }

  /** Normalised movement vector in local space (x = strafe, y = forward). */
  function moveAxis() {
    let mx = 0, my = 0;
    if (Input.down.forward) my += 1;
    if (Input.down.back) my -= 1;
    if (Input.down.right) mx += 1;
    if (Input.down.left) mx -= 1;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    return { x: mx, y: my };
  }

  Object.assign(Input, {
    attach, requestLock, exitLock, consumeMouse, endFrame,
    isDown, wasPressed, moveAxis, BINDINGS, LABELS,
  });

  JJK.Input = Input;
  void M;
})(window.JJK);
