/* ==========================================================================
   MAP — grid world, collision, line-of-sight, and navigation.

   Maps are authored as arrays of strings so an arena is readable and
   editable as ASCII art. See js/data/levels.js.

   Legend
     '#'  solid wall      (primary structure, full height)
     '='  accent wall     (metal / shrine / banded)
     '%'  cursed wall     (cracked, veined, emissive)
     '|'  pillar          (thin column, breaks sightlines)
     'T'  torii / gate    (dark lacquered timber)
     'H'  high building   (2.4 tall — towers over the arena)
     'n'  low block       (0.5 tall — vault onto it)
     'N'  mid block       (0.9 tall — needs a double jump)
     'm'  low cursed      (0.5 tall, cursed material)
     '.'  floor
     ' '  floor
     '@'  player spawn
     'x'  enemy spawn node
     'B'  boss spawn node
     'o'  floor light     (emissive pool, purely cosmetic)

   Navigation is a BFS flow field rebuilt a few times per second. Enemies
   follow it when they cannot see the player, so they route through doorways
   and around pillars instead of grinding into a corner.
   ========================================================================== */

(function (JJK) {
  'use strict';

  const { M } = JJK;

  const WALL_CHARS = {
    '#': 1, '=': 2, '%': 3, '|': 4, 'T': 5,
    H: 1, n: 2, N: 1, m: 3,
  };

  /* Per-cell height in world units. Anything below FULL can be seen over
     and stood on; FULL and above blocks the ray entirely. */
  const FULL = 1.0;
  /* Heights are tuned against the actual jump arc, so each block class is a
     deliberate traversal decision rather than a guess:
         single jump peaks at  v^2/2g = 2.6^2/15 = 0.45
         double jump peaks at  0.45 + 2.35^2/15  = 0.82
     'n' at 0.40 clears on one jump. 'N' at 0.72 needs the second. Standing
     on an 'n' and single-jumping (0.40 + 0.45 = 0.85) also reaches an 'N',
     so blocks chain into real routes. */
  const WALL_HEIGHTS = {
    '#': 1.3, '=': 1.3, '%': 1.3, '|': 1.3, T: 1.3,
    H: 2.6,    // high building — towers over everything
    n: 0.40,   // vault: one jump
    N: 0.72,   // ledge: needs the double jump
    m: 0.40,
  };

  class GameMap {
    constructor(rows) {
      this.h = rows.length;
      this.w = Math.max(...rows.map((r) => r.length));
      this.cells = new Uint8Array(this.w * this.h);
      this.heights = new Float32Array(this.w * this.h);
      this.lights = [];
      this.enemySpawns = [];
      this.bossSpawns = [];
      this.playerSpawn = { x: this.w / 2, y: this.h / 2 };

      for (let y = 0; y < this.h; y++) {
        const row = rows[y];
        for (let x = 0; x < this.w; x++) {
          const ch = x < row.length ? row[x] : '#'; // ragged rows -> solid
          const wall = WALL_CHARS[ch];
          this.cells[y * this.w + x] = wall || 0;
          this.heights[y * this.w + x] = wall ? (WALL_HEIGHTS[ch] || 1.0) : 0;

          const cx = x + 0.5, cy = y + 0.5;
          if (ch === '@') this.playerSpawn = { x: cx, y: cy };
          else if (ch === 'x') this.enemySpawns.push({ x: cx, y: cy });
          else if (ch === 'B') this.bossSpawns.push({ x: cx, y: cy });
          else if (ch === 'o') this.lights.push({ x: cx, y: cy });
        }
      }

      this._nav = new Int32Array(this.w * this.h);
      this._navL = new Int32Array(this.w * this.h);
      this._navStamp = -1;
      this._queue = new Int32Array(this.w * this.h);
      this._buildWide();

      // Connected component containing the player start. Computed once,
      // because the geometry never changes.
      this._buildReachable();

      // Any authored spawn marker that is walled off from the player is
      // dropped here rather than stranding whatever spawns on it.
      this.enemySpawns = this.enemySpawns.filter((s) => this.isReachable(s.x, s.y));
      this.bossSpawns = this.bossSpawns.filter((s) => this.isReachable(s.x, s.y));

      if (!this.enemySpawns.length) this.enemySpawns = this._deriveSpawns();
      if (!this.bossSpawns.length) this.bossSpawns = this.enemySpawns.slice();
    }

    /**
     * Flood fill the open cells connected to the player spawn.
     *
     * This exists because "not a wall" and "somewhere the player can meet
     * you" are different questions. Shibuya Crossing has sealed building
     * interiors that are perfectly open floor; anything placed in one is
     * stranded forever, with no path and no line of sight. In Battle mode
     * that is a softlock: the opponents can never be reached and never die,
     * so the match cannot end.
     */
    _buildReachable() {
      const n = this.w * this.h;
      this.reachable = new Uint8Array(n);
      const sx = M.clamp(Math.floor(this.playerSpawn.x), 0, this.w - 1);
      const sy = M.clamp(Math.floor(this.playerSpawn.y), 0, this.h - 1);
      if (this.solidCell(sx, sy)) return;

      const q = this._queue;
      let head = 0, tail = 0;
      const start = sy * this.w + sx;
      this.reachable[start] = 1;
      q[tail++] = start;

      while (head < tail) {
        const cur = q[head++];
        const cx = cur % this.w;
        const cy = (cur / this.w) | 0;
        for (let i = 0; i < 4; i++) {
          const nx = cx + (i === 0 ? 1 : i === 1 ? -1 : 0);
          const ny = cy + (i === 2 ? 1 : i === 3 ? -1 : 0);
          if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
          const ni = ny * this.w + nx;
          // Ground entities can't climb, so any block is impassable to them.
          if (this.reachable[ni] || this.heights[ni] > 0.06) continue;
          this.reachable[ni] = 1;
          q[tail++] = ni;
        }
      }
    }

    /** Is this world position in the same connected region as the player? */
    isReachable(x, y) {
      const cx = Math.floor(x), cy = Math.floor(y);
      if (!this.inBounds(cx, cy)) return false;
      return this.reachable[cy * this.w + cx] === 1;
    }

    /** Fallback spawn nodes: open cells far from the player start. */
    _deriveSpawns() {
      const out = [];
      const p = this.playerSpawn;
      for (let y = 1; y < this.h - 1; y++) {
        for (let x = 1; x < this.w - 1; x++) {
          if (this.solidCell(x, y)) continue;
          if (!this.isReachable(x + 0.5, y + 0.5)) continue;
          if (M.dist(x + 0.5, y + 0.5, p.x, p.y) < 6) continue;
          if (this.openRadius(x + 0.5, y + 0.5, 0.45)) out.push({ x: x + 0.5, y: y + 0.5 });
        }
      }
      return out.length ? out : [{ x: p.x + 2, y: p.y }];
    }

    inBounds(cx, cy) { return cx >= 0 && cy >= 0 && cx < this.w && cy < this.h; }

    /** Cell type at integer coords. Out of bounds reads as solid. */
    cellAt(cx, cy) {
      if (!this.inBounds(cx, cy)) return 1;
      return this.cells[cy * this.w + cx];
    }

    solidCell(cx, cy) { return this.cellAt(cx, cy) !== 0; }

    /** World height of the block in this cell. Out of bounds is a full wall. */
    heightCell(cx, cy) {
      if (!this.inBounds(cx, cy)) return FULL;
      return this.heights[cy * this.w + cx];
    }
    heightAt(x, y) { return this.heightCell(Math.floor(x), Math.floor(y)); }

    /**
     * The surface a body of radius r standing at (x,y) rests on: the tallest
     * block it overlaps. This is what lets you walk along the top of a row
     * of crates instead of falling between them.
     */
    floorAt(x, y, r) {
      let top = 0;
      const x0 = Math.floor(x - r), x1 = Math.floor(x + r);
      const y0 = Math.floor(y - r), y1 = Math.floor(y + r);
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          const h = this.heightCell(cx, cy);
          if (h < FULL && h > top) top = h;
        }
      }
      return top;
    }

    /** Solid test at world (float) coords. */
    solid(x, y) { return this.solidCell(Math.floor(x), Math.floor(y)); }

    /**
     * True when a box of half-size r centred at (x,y) is clear.
     * `z` is the body's foot height: anything at or below your feet is
     * something you are standing ON, not something blocking you.
     */
    openRadius(x, y, r, z) {
      const foot = z || 0;
      const x0 = Math.floor(x - r), x1 = Math.floor(x + r);
      const y0 = Math.floor(y - r), y1 = Math.floor(y + r);
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          const h = this.heightCell(cx, cy);
          if (h > foot + 0.06) return false;
        }
      }
      return true;
    }

    /**
     * Move an entity with wall sliding. Mutates ent.x / ent.y.
     * Returns true if either axis was blocked (useful for projectile impacts).
     */
    moveSlide(ent, dx, dy, r) {
      const z = ent.z || 0;
      let blocked = false;
      if (dx !== 0) {
        if (this.openRadius(ent.x + dx, ent.y, r, z)) ent.x += dx;
        else blocked = true;
      }
      if (dy !== 0) {
        if (this.openRadius(ent.x, ent.y + dy, r, z)) ent.y += dy;
        else blocked = true;
      }
      return blocked;
    }

    /**
     * DDA ray march. Returns { hit, dist, x, y, cell, side } where `side` is
     * 0 for a vertical (N/S facing) surface and 1 for horizontal.
     */
    raycast(ox, oy, dirX, dirY, maxDist) {
      let mapX = Math.floor(ox), mapY = Math.floor(oy);
      const ddx = dirX === 0 ? Infinity : Math.abs(1 / dirX);
      const ddy = dirY === 0 ? Infinity : Math.abs(1 / dirY);
      let stepX, stepY, sideX, sideY;

      if (dirX < 0) { stepX = -1; sideX = (ox - mapX) * ddx; }
      else { stepX = 1; sideX = (mapX + 1 - ox) * ddx; }
      if (dirY < 0) { stepY = -1; sideY = (oy - mapY) * ddy; }
      else { stepY = 1; sideY = (mapY + 1 - oy) * ddy; }

      let side = 0;
      for (let i = 0; i < 512; i++) {
        if (sideX < sideY) { sideX += ddx; mapX += stepX; side = 0; }
        else { sideY += ddy; mapY += stepY; side = 1; }

        const dist = side === 0 ? sideX - ddx : sideY - ddy;
        if (dist > maxDist) return { hit: false, dist: maxDist, x: ox + dirX * maxDist, y: oy + dirY * maxDist, cell: 0, side };

        // Only full-height geometry blocks sight. Low cover is something
        // you shoot and look OVER, not a sight blocker.
        if (this.heightCell(mapX, mapY) >= FULL) {
          return { hit: true, dist, x: ox + dirX * dist, y: oy + dirY * dist, cell: this.cellAt(mapX, mapY), side };
        }
      }
      return { hit: false, dist: maxDist, x: ox + dirX * maxDist, y: oy + dirY * maxDist, cell: 0, side };
    }

    /** Unobstructed straight line between two world points? */
    lineOfSight(ax, ay, bx, by) {
      const dx = bx - ax, dy = by - ay;
      const d = Math.hypot(dx, dy);
      if (d < 1e-4) return true;
      const r = this.raycast(ax, ay, dx / d, dy / d, d);
      return !r.hit;
    }

    /**
     * Find a spot near (x, y) with clearance `r`, spiralling outward.
     * Returns null only if the whole map is too tight for that radius.
     *
     * This exists because spawn markers are authored by eye: a marker one
     * cell from a wall is fine for a 0.38-radius grunt and lethal for a
     * 0.85-radius boss, which spawns overlapping the wall and can then
     * never move — moveSlide rejects every candidate step because the
     * position it is already in is illegal. Anything large must be placed
     * through here rather than dropped straight onto a marker.
     */
    findOpenNear(x, y, r, maxRadius, allowUnreachable) {
      const fits = (px, py) =>
        this.openRadius(px, py, r) && (allowUnreachable || this.isReachable(px, py));
      if (fits(x, y)) return { x, y };
      const max = maxRadius || 6;
      for (let ring = 0.5; ring <= max; ring += 0.5) {
        const steps = Math.max(8, Math.round(ring * 12));
        for (let i = 0; i < steps; i++) {
          const a = (i / steps) * M.TAU;
          const nx = x + Math.cos(a) * ring;
          const ny = y + Math.sin(a) * ring;
          if (nx < r || ny < r || nx > this.w - r || ny > this.h - r) continue;
          if (fits(nx, ny)) return { x: nx, y: ny };
        }
      }
      return null;
    }

    /**
     * Obstacle-avoidance steering. If heading (mx, my) would put a body of
     * radius r into geometry, fan out to either side and return the first
     * heading that is actually clear.
     *
     * Needed because the flow field reasons about CELLS while bodies have a
     * RADIUS. The field will happily aim a 0.7-radius boss at the centre of
     * a two-cell-tall corridor — a point its body can never occupy, since it
     * needs 1.4 cells of clearance. Without this the boss grinds into the
     * wall forever, never gains line of sight, and never attacks.
     */
    steerAround(x, y, mx, my, r, probe) {
      const d = probe || 0.65;
      if (this.openRadius(x + mx * d, y + my * d, r)) return { x: mx, y: my };
      const base = Math.atan2(my, mx);
      // Nearest deviations first, so it hugs the intended heading.
      for (const off of [0.7, -0.7, 1.35, -1.35, 2.0, -2.0, 2.7, -2.7]) {
        const a = base + off;
        const nx = Math.cos(a), ny = Math.sin(a);
        if (this.openRadius(x + nx * d, y + ny * d, r)) return { x: nx, y: ny };
      }
      return { x: mx, y: my };
    }

    /** A random open cell at least `minDist` from (fx, fy). */
    randomOpenNear(fx, fy, minDist, maxDist) {
      const pool = this.enemySpawns.filter((s) => {
        const d = M.dist(s.x, s.y, fx, fy);
        return d >= minDist && d <= maxDist;
      });
      if (pool.length) return M.pick(pool);
      const any = this.enemySpawns.filter((s) => M.dist(s.x, s.y, fx, fy) >= minDist);
      return any.length ? M.pick(any) : M.pick(this.enemySpawns);
    }

    /* ------------------------------------------------------------------
       Flow fields.

       TWO fields are maintained, because "can a path exist" depends on how
       wide the thing walking it is. A cell-based field will happily route a
       1.15-radius Finger Bearer down a two-cell corridor and aim it at the
       centre — a point its body can never occupy, since it needs 2.3 cells
       of clearance. It then grinds into the wall forever, never gains line
       of sight, and never attacks.

         _navS   small bodies (radius < 0.5): any open cell
         _navL   large bodies (radius >= 0.5): only cells whose full 3x3
                 neighbourhood is open, which is exactly the openRadius()
                 test for 0.5 <= r < 1.5 evaluated at a cell centre

       Large bodies fall back to the small field if the wide field cannot
       reach them, so they still make progress instead of freezing.
       ------------------------------------------------------------------ */

    /** Cells a large body can stand in. Static, so computed once. */
    _buildWide() {
      this.wide = new Uint8Array(this.w * this.h);
      for (let y = 0; y < this.h; y++) {
        for (let x = 0; x < this.w; x++) {
          if (this.heightCell(x, y) > 0.06) continue;
          let ok = true;
          for (let oy = -1; oy <= 1 && ok; oy++) {
            for (let ox = -1; ox <= 1 && ok; ox++) {
              if (this.heightCell(x + ox, y + oy) > 0.06) ok = false;
            }
          }
          if (ok) this.wide[y * this.w + x] = 1;
        }
      }
    }

    _bfs(nav, sx, sy, wideOnly) {
      nav.fill(-1);
      if (!this.inBounds(sx, sy) || this.solidCell(sx, sy)) return;

      // A large body cannot stand where the player is standing, so seed the
      // wide field from the nearest wide cell instead of giving up.
      if (wideOnly && !this.wide[sy * this.w + sx]) {
        let best = -1, bd = Infinity;
        for (let y = 0; y < this.h; y++) {
          for (let x = 0; x < this.w; x++) {
            if (!this.wide[y * this.w + x]) continue;
            const d = (x - sx) * (x - sx) + (y - sy) * (y - sy);
            if (d < bd) { bd = d; best = y * this.w + x; }
          }
        }
        if (best < 0) return;
        sx = best % this.w;
        sy = (best / this.w) | 0;
      }

      const q = this._queue;
      let head = 0, tail = 0;
      const start = sy * this.w + sx;
      nav[start] = 0;
      q[tail++] = start;

      while (head < tail) {
        const cur = q[head++];
        const d = nav[cur];
        const cx = cur % this.w;
        const cy = (cur / this.w) | 0;

        for (let i = 0; i < 4; i++) {
          const nx = cx + (i === 0 ? 1 : i === 1 ? -1 : 0);
          const ny = cy + (i === 2 ? 1 : i === 3 ? -1 : 0);
          if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
          const ni = ny * this.w + nx;
          if (nav[ni] !== -1) continue;
          if (this.heights[ni] > 0.06) continue;
          if (wideOnly && !this.wide[ni]) continue;
          nav[ni] = d + 1;
          q[tail++] = ni;
        }
      }
    }

    buildFlowField(tx, ty, stamp) {
      if (this._navStamp === stamp) return;
      this._navStamp = stamp;
      const sx = M.clamp(Math.floor(tx), 0, this.w - 1);
      const sy = M.clamp(Math.floor(ty), 0, this.h - 1);
      this._bfs(this._nav, sx, sy, false);
      this._bfs(this._navL, sx, sy, true);
    }

    /**
     * Unit vector pointing down the flow field from (x, y), or null when the
     * cell is unreachable. Diagonals are allowed when both orthogonal
     * neighbours are open, which keeps movement from looking grid-locked.
     *
     * Pass the body radius so wide entities get routed down corridors they
     * actually fit through.
     */
    flowDir(x, y, radius) {
      const big = (radius || 0) >= 0.5;
      let dir = this._flowFrom(big ? this._navL : this._nav, x, y, big);
      // A wide body stranded off the wide network still needs to move.
      if (!dir && big) dir = this._flowFrom(this._nav, x, y, false);
      return dir;
    }

    _flowFrom(nav, x, y, wideOnly) {
      const cx = Math.floor(x), cy = Math.floor(y);
      if (!this.inBounds(cx, cy)) return null;
      const here = nav[cy * this.w + cx];
      if (here === -1) return null;
      if (here === 0) return null; // already at target cell

      let bestD = here, bx = 0, by = 0;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          const nx = cx + ox, ny = cy + oy;
          if (!this.inBounds(nx, ny)) continue;
          // Disallow cutting diagonally through a wall corner.
          if (ox && oy && (this.solidCell(cx + ox, cy) || this.solidCell(cx, cy + oy))) continue;
          if (wideOnly && !this.wide[ny * this.w + nx]) continue;
          const d = nav[ny * this.w + nx];
          if (d === -1) continue;
          if (d < bestD) { bestD = d; bx = ox; by = oy; }
        }
      }
      if (!bx && !by) return null;

      // Aim at the centre of the chosen cell so entities don't hug corners.
      const tx = cx + bx + 0.5, ty = cy + by + 0.5;
      const dx = tx - x, dy = ty - y;
      const len = Math.hypot(dx, dy) || 1;
      return { x: dx / len, y: dy / len };
    }
  }

  JJK.GameMap = GameMap;
  JJK.WALL_CHARS = WALL_CHARS;
  JJK.WALL_HEIGHTS = WALL_HEIGHTS;
  JJK.FULL_HEIGHT = FULL;
})(window.JJK);
