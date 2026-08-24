/* ==========================================================================
   RAYCASTER — camera + per-column DDA wall solve.

   PROJECTION (derived once, so sprites and walls agree exactly)

     Let dir be the unit view vector and plane = perp(dir) * k.
     For a point at world offset `rel` from the camera:

       depth = dot(rel, dir)                     -- distance along the view axis
       lat   = cross(dir, rel)                   -- signed lateral offset
       screenX = (W/2) * (1 + lat / (k * depth))

     Vertically we use the classic wall formula, lineHeight = projH / depth,
     for a wall one world-unit tall.

     Horizontal pixels-per-world-unit at depth d is (W/2)/(k*d).
     Vertical   pixels-per-world-unit at depth d is projH/d.
     Setting them equal (square pixels, no stretch) gives:

       k = W / (2 * projH)

     So projH alone controls FOV, and k follows. projH = H gives a vertical
     FOV of 2*atan(0.5) = 53 deg and, at 16:9, a horizontal FOV of ~83 deg —
     a normal FPS feel. `fovMul` > 1 widens (used for the dash FOV kick).

   Eye height is 0.5 (wall mid-height), so the floor at depth d lands at
   centerY + (0.5 * projH)/d. Everything beyond a wall in a given column
   projects *above* that wall's bottom edge, which is why floor decoration
   can be drawn before walls and still be occluded correctly.
   ========================================================================== */

(function (JJK) {
  'use strict';

  const { M } = JJK;

  class Camera {
    constructor() {
      this.x = 2; this.y = 2;
      this.angle = 0;
      this.pitch = 0;      // pixel shear, not a true rotation
      this.bob = 0;        // vertical pixel offset from head bob
      this.roll = 0;       // radians, for strafe lean / impact tilt
      this.fovMul = 1;
      this.z = 0;          // eye height offset in world units (jump/crouch)
    }

    get dirX() { return Math.cos(this.angle); }
    get dirY() { return Math.sin(this.angle); }
  }

  class Raycaster {
    constructor() {
      this.w = 0;
      this.zBuf = null;
      this.cell = null;
      this.variant = null;
      this.side = null;
      this.texU = null;
      this.mapX = null;
      this.mapY = null;
      this.hitX = null;
      this.hitY = null;
      // Low blocks (height < 1) you can see over and stand on. Stored per
      // column, nearest first, so the renderer can draw them after the wall.
      this.lowCount = null;
      this.low = null;      // flat array, MAX_LOW per column
      this.MAX_LOW = 4;
    }

    resize(w) {
      if (this.w === w) return;
      this.w = w;
      this.zBuf = new Float32Array(w);
      this.cell = new Uint8Array(w);
      this.variant = new Uint8Array(w);
      this.side = new Uint8Array(w);
      this.texU = new Float32Array(w);
      this.mapX = new Int32Array(w);
      this.mapY = new Int32Array(w);
      this.hitX = new Float32Array(w);
      this.hitY = new Float32Array(w);
      this.lowCount = new Uint8Array(w);
      this.low = new Array(w * this.MAX_LOW);
      this.wallHeight = new Float32Array(w);
    }

    /**
     * Solve every column. Fills the typed arrays above.
     * `k` is the camera plane half-width (see header).
     */
    cast(map, cam, w, k, maxDist) {
      this.resize(w);
      const dirX = cam.dirX, dirY = cam.dirY;
      const planeX = -dirY * k, planeY = dirX * k;
      const px = cam.x, py = cam.y;
      const Tex = JJK.Textures;

      for (let x = 0; x < w; x++) {
        const cameraX = (2 * x) / w - 1;
        const rayX = dirX + planeX * cameraX;
        const rayY = dirY + planeY * cameraX;

        let mapX = Math.floor(px), mapY = Math.floor(py);
        const ddx = rayX === 0 ? Infinity : Math.abs(1 / rayX);
        const ddy = rayY === 0 ? Infinity : Math.abs(1 / rayY);

        let stepX, stepY, sideX, sideY;
        if (rayX < 0) { stepX = -1; sideX = (px - mapX) * ddx; }
        else { stepX = 1; sideX = (mapX + 1 - px) * ddx; }
        if (rayY < 0) { stepY = -1; sideY = (py - mapY) * ddy; }
        else { stepY = 1; sideY = (mapY + 1 - py) * ddy; }

        let side = 0, cell = 0, dist = maxDist;
        let nLow = 0;
        for (let i = 0; i < 256; i++) {
          if (sideX < sideY) { sideX += ddx; mapX += stepX; side = 0; }
          else { sideY += ddy; mapY += stepY; side = 1; }

          const d = side === 0 ? sideX - ddx : sideY - ddy;
          if (d >= maxDist) { dist = maxDist; cell = 0; break; }

          const c = map.cellAt(mapX, mapY);
          if (!c) continue;
          const hgt = map.heightCell(mapX, mapY);
          if (hgt < 1.0) {
            // See-over block: record it and keep marching.
            if (nLow < this.MAX_LOW) {
              let u2;
              if (side === 0) u2 = py + d * rayY; else u2 = px + d * rayX;
              u2 -= Math.floor(u2);
              if ((side === 0 && rayX > 0) || (side === 1 && rayY < 0)) u2 = 1 - u2;
              this.low[x * this.MAX_LOW + nLow] = {
                dist: d, cell: c, side, u: u2, h: hgt,
                variant: Tex.variantFor(mapX, mapY),
              };
              nLow++;
            }
            continue;
          }
          cell = c; dist = d;
          this.wallH = hgt;
          break;
        }
        this.lowCount[x] = nLow;

        if (dist < 0.02) dist = 0.02;

        // Texture coordinate along the wall face.
        let u;
        if (side === 0) u = py + dist * rayY;
        else u = px + dist * rayX;
        u -= Math.floor(u);
        // Mirror so texture orientation is continuous around a corner.
        if ((side === 0 && rayX > 0) || (side === 1 && rayY < 0)) u = 1 - u;

        this.zBuf[x] = dist;
        this.cell[x] = cell;
        this.wallHeight[x] = cell ? map.heightCell(mapX, mapY) : 1;
        this.side[x] = side;
        this.texU[x] = u;
        this.mapX[x] = mapX;
        this.mapY[x] = mapY;
        this.hitX[x] = px + rayX * dist;
        this.hitY[x] = py + rayY * dist;
        this.variant[x] = cell ? Tex.variantFor(mapX, mapY) : 0;
      }
    }
  }

  /** Project a world point into screen space. Returns null if behind the eye. */
  function project(cam, wx, wy, wz, W, H, projH, k) {
    const relX = wx - cam.x, relY = wy - cam.y;
    const dirX = cam.dirX, dirY = cam.dirY;
    const depth = relX * dirX + relY * dirY;
    if (depth <= 0.02) return null;
    const lat = dirX * relY - dirY * relX;
    const sx = (W / 2) * (1 + lat / (k * depth));
    const centerY = H / 2 + cam.pitch + cam.bob;
    const sy = centerY + ((0.5 + cam.z - wz) * projH) / depth;
    return { x: sx, y: sy, depth, scale: projH / depth };
  }

  JJK.Camera = Camera;
  JJK.Raycaster = Raycaster;
  JJK.project = project;

  /** projH from a FOV multiplier, and the matching plane half-width. */
  JJK.projConst = function (H, fovMul) { return H / (fovMul || 1); };
  JJK.planeK = function (W, projH) { return W / (2 * projH); };

  void M;
})(window.JJK);
