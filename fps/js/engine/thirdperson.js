/* ==========================================================================
   THIRD PERSON — collision-swept camera boom, aim decoupling, own-body draw.

   A raycaster is a surprisingly good fit for third person: the world solve
   is entirely a function of (camera position, angle), so moving the camera
   backwards costs nothing extra. Everything hard about third person here is
   in the three problems below, and each one has a specific fix.

   ------------------------------------------------------------------------
   PROBLEM 1 — the camera ends up inside geometry.

   Naively placing the eye at  pivot - dir * BOOM  puts it through the wall
   behind you every time your back is to one. The fix is a spring arm: cast
   backwards from the pivot and clamp the boom to the first full-height hit,
   minus a pad.

   A single centre ray is not enough. The camera has a near plane, not a
   point, so at grazing angles the corner of the frustum clips through a wall
   edge while the centre ray still reports clear. We sweep THREE rays — the
   centre and one either side, offset by the pad along the camera's right
   vector — and take the minimum. That is a cheap stand-in for a swept
   sphere and removes essentially all corner peek-through.

   Damping is deliberately ASYMMETRIC:

       pulling IN   is instantaneous     (a lagged frame renders inside a wall)
       pushing OUT  is exponentially damped, ~6/s

   Symmetric smoothing looks correct in an open room and fails in exactly the
   case that matters — backing into a doorway. Snap in, ease out.

   ------------------------------------------------------------------------
   PROBLEM 2 — the crosshair lies.

   The reticle sits at screen centre, which is a ray from the CAMERA. But
   abilities leave the PLAYER, roughly a metre forward and to the side. Fire
   along the camera ray and every shot is offset; fire along the player's
   facing and the reticle is decorative.

   The standard fix, and the one used here, is a two-stage convergence:

       1. cast from the camera through screen centre  -> aim point A
       2. fire from the player's muzzle toward A

   Both rays terminate at the same world point, so the reticle is honest at
   the thing you are actually pointing at. Two edge cases have to be handled
   or it feels broken:

       * A closer to the camera than the player   (something between camera
         and body) -> clamp to MIN_CONVERGE, otherwise the shot fires
         backwards through your own chest.
       * nothing hit at all -> converge at the far plane, which makes the
         shot parallel to the view ray. That is the correct limit.

   ------------------------------------------------------------------------
   PROBLEM 3 — you can now see yourself, and there is no "yourself".

   The viewmodel is first-person arms in screen space; it must be suppressed.
   In its place the player is submitted to the normal sprite list as a
   billboard, so it fogs, sorts and z-clips exactly like every other body in
   the world with no special path in the renderer.

   Avatars are baked by bakeAvatar (poses only, no yaw strip) unlike curses,
   which carry 8 yaw angles. Over-the-shoulder almost always shows the back,
   so this reads correctly; the visible cost is that hard strafing does not
   turn the shoulders. Noted, not fixed — a yaw strip for 23 characters is a
   bake-time cost we should only pay if the mode ships.

   ------------------------------------------------------------------------
   COST

   The boom is 3 DDA casts per frame against 793 for the world — about 0.4%.
   Third person also skips the viewmodel, which is drawn procedurally every
   frame and is not free, so in practice this mode renders slightly FASTER
   than first person.
   ========================================================================== */

(function (JJK) {
  'use strict';

  const { M } = JJK;

  /* ---------------- tunables ----------------
     Grouped as presets so the feel can be swapped without hunting constants.
     `dist` is in world units; a wall cell is 1.0 and the player radius ~0.3,
     so 2.6 puts the body at roughly a third of screen height. */
  const PRESETS = {
    shoulder: { dist: 2.60, height: 0.30, side:  0.55, pitchBias: 0.10, fov: 1.06 },
    action:   { dist: 3.60, height: 0.55, side:  0.00, pitchBias: 0.18, fov: 1.12 },
    far:      { dist: 5.20, height: 1.10, side:  0.00, pitchBias: 0.30, fov: 1.18 },
  };

  const PAD          = 0.22;   // keep-out from geometry, in world units
  const OUT_RATE     = 6.0;    // e-folds/sec when the boom is extending
  const MIN_BOOM     = 0.45;   // below this we are effectively first person
  const MIN_CONVERGE = 3.0;    // shortest honest aim convergence
  const FAR_PLANE    = 34;     // matches Renderer.maxDist

  const TP = {
    enabled: false,
    preset: 'shoulder',
    boom: 0,            // current, smoothed
    /* Last solved aim point, in world units. Abilities read this instead of
       deriving a direction from the camera angle. */
    aim: { x: 0, y: 0, z: 0.5, dist: FAR_PLANE, hit: false },
    /* Pivot is the player's eye, kept separate from the camera so aim,
       muzzle origin and body draw all agree on where "you" are. */
    pivot: { x: 0, y: 0, z: 0.5 },
  };

  function cfg() { return PRESETS[TP.preset] || PRESETS.shoulder; }

  /* ------------------------------------------------------------------
     Swept boom solve. Returns the largest safe boom length <= want.
     ------------------------------------------------------------------ */
  function sweep(map, ox, oy, backX, backY, want) {
    // Right vector, used to offset the two flanking rays.
    const rx = -backY, ry = backX;
    let best = want;
    for (let i = -1; i <= 1; i++) {
      const sx = ox + rx * PAD * i;
      const sy = oy + ry * PAD * i;
      // A flanking origin can itself be inside a wall when you are hugging
      // one; treat that as a fully collapsed boom rather than trusting a
      // cast that starts in solid space.
      if (map.solid(sx, sy)) return MIN_BOOM;
      const r = map.raycast(sx, sy, backX, backY, want + PAD);
      if (r.hit) best = Math.min(best, r.dist - PAD);
    }
    return M.clamp(best, MIN_BOOM, want);
  }

  /* ------------------------------------------------------------------
     Called every frame AFTER player.applyToCamera(cam), so it can override
     a camera that is already carrying bob, roll, pitch and fov.
     ------------------------------------------------------------------ */
  function apply(cam, player, map, dt) {
    if (!TP.enabled) { TP.boom = 0; return; }
    const c = cfg();

    // Pivot = the eye we are orbiting. Bob is intentionally NOT applied to
    // the pivot: head bob on an orbit camera reads as a broken suspension
    // rather than as footsteps, so the boom stays rigid and only the body
    // sprite bobs.
    TP.pivot.x = player.x;
    TP.pivot.y = player.y;
    TP.pivot.z = 0.5 + player.z;

    const backX = -cam.dirX, backY = -cam.dirY;
    const want = sweep(map, TP.pivot.x, TP.pivot.y, backX, backY, c.dist);

    // Asymmetric damping — see header.
    if (want < TP.boom || TP.boom === 0) TP.boom = want;
    else TP.boom += (want - TP.boom) * (1 - Math.exp(-OUT_RATE * dt));

    // Lateral shoulder offset, swept the same way so it cannot push the eye
    // through a wall it was clear of.
    let side = c.side;
    if (side !== 0) {
      const sgn = Math.sign(side);
      const sx = -cam.dirY * sgn, sy = cam.dirX * sgn;
      const r = map.raycast(TP.pivot.x, TP.pivot.y, sx, sy, Math.abs(side) + PAD);
      if (r.hit) side = sgn * Math.max(0, r.dist - PAD);
    }

    cam.x = TP.pivot.x + backX * TP.boom + (-cam.dirY) * side;
    cam.y = TP.pivot.y + backY * TP.boom + (cam.dirX) * side;
    // Raise the eye and tilt down, so the body sits low in frame instead of
    // occluding the thing you are aiming at. pitchBias scales with the boom
    // so a collapsed camera does not stare at the floor.
    const t = TP.boom / Math.max(MIN_BOOM, c.dist);
    cam.z = player.z + c.height * t;
    cam.pitch += c.pitchBias * t * JJK.Renderer.H;
    cam.fovMul = player.fov * (1 + (c.fov - 1) * t);
    // Head bob belongs to the body, not the boom.
    cam.bob *= 0.15;

    solveAim(cam, map, player);
  }

  /* ------------------------------------------------------------------
     Aim convergence — see PROBLEM 2 in the header.
     ------------------------------------------------------------------ */
  function solveAim(cam, map, player) {
    const r = map.raycast(cam.x, cam.y, cam.dirX, cam.dirY, FAR_PLANE);
    let d = r.hit ? r.dist : FAR_PLANE;

    // Never converge behind or on top of the player.
    const toPlayer = (player.x - cam.x) * cam.dirX + (player.y - cam.y) * cam.dirY;
    d = Math.max(d, toPlayer + MIN_CONVERGE);

    TP.aim.x = cam.x + cam.dirX * d;
    TP.aim.y = cam.y + cam.dirY * d;
    TP.aim.z = 0.5;
    TP.aim.dist = d;
    TP.aim.hit = r.hit;
  }

  /**
   * Direction an ability should actually travel, from a given muzzle.
   * In first person this collapses to the camera direction, so callers can
   * use it unconditionally.
   */
  function aimDir(ox, oy) {
    if (!TP.enabled) return null;
    const dx = TP.aim.x - ox, dy = TP.aim.y - oy;
    const d = Math.hypot(dx, dy);
    if (d < 1e-4) return null;
    return { x: dx / d, y: dy / d, angle: Math.atan2(dy, dx), dist: d };
  }

  /* ------------------------------------------------------------------
     Own-body billboard. Pushed into the normal sprite list so it fogs,
     sorts and z-clips with everything else.
     ------------------------------------------------------------------ */
  function collectSelf(sprites, player) {
    if (!TP.enabled || TP.boom < MIN_BOOM + 0.05) return;
    const sheet = JJK.Art.avatars[player.char.id];
    if (!sheet) return;

    // Pose from movement, defensively — bakeAvatar's frame count is not
    // fixed across characters and a stale index draws garbage.
    const n = Math.max(1, sheet.frames | 0);
    const moving = Math.hypot(player.vx || 0, player.vy || 0) > 0.4;
    const phase = moving ? (player.bobT || player.animT || 0) * 6 : (player.animT || 0) * 1.6;
    const frame = n > 1 ? (Math.floor(phase) % n) : 0;

    sprites.push({
      x: player.x,
      y: player.y,
      z: player.z + (player.bobY || 0) * 0.02,
      size: 1.0,
      sheet,
      frame,
      alpha: 1,
      // Flash the body on damage the same way enemies flash, so a hit is
      // legible without the first-person screen-edge cue.
      tint: '#ffffff',
      tintAmount: M.clamp(player.hurtFlash || 0, 0, 1) * 0.8,
      additive: false,
      isSelf: true,
    });
  }

  /* ------------------------------------------------------------------ */
  function toggle(on) {
    TP.enabled = on === undefined ? !TP.enabled : !!on;
    if (!TP.enabled) TP.boom = 0;
    return TP.enabled;
  }

  function setPreset(name) {
    if (PRESETS[name]) TP.preset = name;
    return TP.preset;
  }

  JJK.ThirdPerson = Object.assign(TP, {
    apply, aimDir, collectSelf, toggle, setPreset, PRESETS,
  });
})(window.JJK);
