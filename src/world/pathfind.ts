// 8-direction A* over the tile grid (no corner cutting) with line-of-sight smoothing.

export class Grid {
  constructor(public w: number, public h: number, public blocked: boolean[]) {}

  free(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h && !this.blocked[y * this.w + x];
  }

  /** Bresenham line test between two tiles. */
  lineFree(x0: number, y0: number, x1: number, y1: number) {
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    for (;;) {
      if (!this.free(x0, y0)) return false;
      if (x0 === x1 && y0 === y1) return true;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
      // Do not squeeze diagonally between two blocked tiles.
      if (e2 > -dy && e2 < dx && !this.free(x0 - sx, y0) && !this.free(x0, y0 - sy)) return false;
    }
  }

  /** Nearest free tile around (x, y), spiralling out. */
  nearestFree(x: number, y: number, maxR = 6): [number, number] | null {
    if (this.free(x, y)) return [x, y];
    for (let r = 1; r <= maxR; r++)
      for (let oy = -r; oy <= r; oy++)
        for (let ox = -r; ox <= r; ox++)
          if (Math.max(Math.abs(ox), Math.abs(oy)) === r && this.free(x + ox, y + oy)) return [x + ox, y + oy];
    return null;
  }

  find(sx: number, sy: number, tx: number, ty: number, maxNodes = 6000): [number, number][] | null {
    const goal = this.nearestFree(tx, ty);
    if (!goal || !this.free(sx, sy)) return null;
    [tx, ty] = goal;
    const W = this.w;
    const start = sy * W + sx, target = ty * W + tx;
    if (start === target) return [[tx, ty]];
    const g = new Map<number, number>([[start, 0]]);
    const came = new Map<number, number>();
    const closed = new Set<number>();
    const heap: [number, number][] = [];
    const h = (i: number) => {
      const dx = Math.abs((i % W) - tx), dy = Math.abs(Math.floor(i / W) - ty);
      return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
    };
    const push = (f: number, i: number) => {
      heap.push([f, i]);
      let c = heap.length - 1;
      while (c > 0) {
        const p = (c - 1) >> 1;
        if (heap[p][0] <= heap[c][0]) break;
        [heap[p], heap[c]] = [heap[c], heap[p]];
        c = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let c = 0;
        for (;;) {
          const l = 2 * c + 1, r = l + 1;
          let m = c;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === c) break;
          [heap[m], heap[c]] = [heap[c], heap[m]];
          c = m;
        }
      }
      return top;
    };
    push(h(start), start);
    let best = start, bestH = h(start), expanded = 0;
    while (heap.length) {
      const [, cur] = pop();
      if (closed.has(cur)) continue;
      closed.add(cur);
      if (cur === target) { best = cur; break; }
      const hc = h(cur);
      if (hc < bestH) { bestH = hc; best = cur; }
      if (++expanded > maxNodes) break;
      const cx = cur % W, cy = Math.floor(cur / W);
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          const nx = cx + ox, ny = cy + oy;
          if (!this.free(nx, ny)) continue;
          if (ox && oy && (!this.free(cx + ox, cy) || !this.free(cx, cy + oy))) continue;
          const ni = ny * W + nx;
          const ng = g.get(cur)! + (ox && oy ? 1.414 : 1);
          if (ng < (g.get(ni) ?? Infinity)) {
            g.set(ni, ng);
            came.set(ni, cur);
            push(ng + h(ni), ni);
          }
        }
    }
    if (best === start) return null;
    const path: [number, number][] = [];
    for (let c = best; c !== start; c = came.get(c)!) path.push([c % W, Math.floor(c / W)]);
    path.reverse();
    // Line-of-sight smoothing.
    const out: [number, number][] = [];
    let from: [number, number] = [sx, sy];
    for (let i = 0; i < path.length; i++) {
      const next = path[i + 1];
      if (!next || !this.lineFree(from[0], from[1], next[0], next[1])) {
        out.push(path[i]);
        from = path[i];
      }
    }
    return out;
  }
}
