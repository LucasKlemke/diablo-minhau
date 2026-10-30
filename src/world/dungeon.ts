// Dungeons under the overworld entrances. Each has a theme that says what it is: the crypt (rooms joined
// by corridors under a graveyard), the cellar of the Abandoned House (a tight warren of storerooms full of
// barrels, racks and flea webs), the Butcher's cellar (cold rooms with meat hooks, tables and drains) or a
// natural cave (a winding cavern grown with stalagmites and glowing mushrooms). The entrance (with the exit
// portal) is in the first room and the boss in the place farthest from it.
import type { EnemyType, UniqueId } from "../data/enemies";
import type { SpriteName } from "../kiln";
import { MAP_H, MAP_W, rng, type Pack, type Prop, type WorldMap } from "./mapgen";

export type DungeonTheme = "crypt" | "cellar" | "butcher" | "cave";

interface Room { x: number; y: number; w: number; h: number; cx: number; cy: number }

/** Room sizes, how many, how wide the corridors are and the box they fit in. */
const ROOMS: Record<Exclude<DungeonTheme, "cave">, { n: number; w: [number, number]; h: [number, number]; corridor: number; box: [number, number] }> = {
  crypt: { n: 11, w: [7, 13], h: [6, 11], corridor: 3, box: [24, 104] },
  cellar: { n: 9, w: [6, 11], h: [5, 9], corridor: 2, box: [32, 96] },
  butcher: { n: 10, w: [7, 13], h: [6, 10], corridor: 3, box: [28, 100] },
};

/** A SpriteKiln prop with a fallback; `w` tiles wide footprint (solid unless `floor` or `pass`: low things walked over). */
type Deco = { name: SpriteName; alt?: string; floor?: boolean; variants?: number; w?: number; anim?: string; pass?: boolean };
const D = (name: SpriteName, o: Omit<Deco, "name"> = {}): Deco => ({ name, ...o });

/** What each theme puts against the back walls, in the corners, in the middle of big rooms and on the floor,
 * and what marks the boss's lair. */
const DRESS: Record<DungeonTheme, { wall: Deco[]; corner: Deco[]; middle: Deco[]; floor: Deco[]; boss: Deco[]; entry?: Deco }> = {
  crypt: { wall: [], corner: [], middle: [], floor: [], boss: [] },
  cellar: {
    wall: [D("cellar_rack", { alt: "hut_shelf", w: 2 }), D("cellar_barrels", { alt: "firewood", variants: 3, w: 2 })],
    corner: [D("cellar_barrels", { alt: "firewood", variants: 3, w: 2 }), D("cellar_sacks", { alt: "rubble_pile", variants: 4 })],
    middle: [D("cellar_beam", { alt: "stump" })],
    floor: [D("cobweb_floor", { floor: true, variants: 4 })],
    boss: [D("flea_nest", { alt: "bones", w: 2 }), D("cobweb_floor", { floor: true, variants: 4 })],
    entry: D("cellar_stairs", { w: 2 }),
  },
  butcher: {
    wall: [D("meat_hook", { alt: "bone_hang", variants: 3, w: 2 }), D("cage", { alt: "rotten_barricade", variants: 2 })],
    corner: [D("bone_pile", { alt: "rubble_pile", variants: 3 }), D("cellar_barrels", { alt: "firewood", variants: 3, w: 2 })],
    middle: [D("butcher_table", { alt: "hut_table", w: 2 }), D("butcher_block", { alt: "stump" })],
    floor: [D("blood_drain", { floor: true, alt: "blood_splat", variants: 3 }), D("blood_splat", { floor: true, variants: 6 })],
    boss: [D("butcher_block", { alt: "stump" }), D("meat_hook", { alt: "bone_hang", variants: 3, w: 2 }), D("blood_splat", { floor: true, variants: 6 })],
  },
  cave: {
    wall: [D("stalagmite", { alt: "mossy_rock", variants: 3 }), D("cave_boulder", { alt: "mossy_rock", variants: 3, w: 2 })],
    corner: [D("glow_mushrooms", { alt: "dead_bush", pass: true }), D("guano_pile", { alt: "rubble_pile", pass: true, variants: 2 })],
    middle: [D("stalagmite", { alt: "mossy_rock", variants: 3 })],
    floor: [D("cave_puddle", { floor: true }), D("guano_pile", { alt: "rubble_pile", pass: true, variants: 2 })],
    boss: [D("ogre_bed", { alt: "bone_pile", w: 2 }), D("bone_pile", { alt: "rubble_pile", variants: 3 })],
  },
};

export function generateDungeon(seed: number, level: number, enemies: EnemyType[], boss: UniqueId | null, theme: DungeonTheme = "crypt"): WorldMap {
  const rand = rng(seed);
  const idx = (x: number, y: number) => y * MAP_W + x;
  const blocked = new Array<boolean>(MAP_W * MAP_H).fill(true);
  const carve = (x: number, y: number) => {
    if (x > 1 && y > 1 && x < MAP_W - 2 && y < MAP_H - 2) blocked[idx(x, y)] = false;
  };
  const isFloor = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && !blocked[idx(x, y)];

  const rooms = theme === "cave" ? carveCave(rand, carve, isFloor) : carveRooms(rand, theme, carve);

  // Walking distance from the entrance: the boss lairs in the farthest place.
  const start = rooms[0];
  const distFrom = (sx: number, sy: number) => {
    const dist = new Map<number, number>([[idx(sx, sy), 0]]);
    const queue = [idx(sx, sy)];
    for (let qi = 0; qi < queue.length; qi++) {
      const c = queue[qi];
      const x = c % MAP_W, y = Math.floor(c / MAP_W);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = idx(x + dx, y + dy);
        if (!blocked[n] && !dist.has(n)) { dist.set(n, dist.get(c)! + 1); queue.push(n); }
      }
    }
    return dist;
  };
  const dist = distFrom(start.cx, start.cy);
  const bossRoom = rooms.slice(1).reduce((a, b) => ((dist.get(idx(b.cx, b.cy)) ?? 0) > (dist.get(idx(a.cx, a.cy)) ?? 0) ? b : a));

  const props: Prop[] = [];
  const packs: Pack[] = [];
  const chests: WorldMap["chests"] = [];
  const portal = { x: start.cx, y: start.cy - 1 };
  const reserved = new Set<number>([idx(portal.x, portal.y), idx(start.cx, start.cy), idx(start.cx, start.cy + 1)]);
  const floorCount = () => blocked.reduce((n, b) => n + (b ? 0 : 1), 0);
  let open = floorCount();

  // Solid props must never cut the dungeon: each one is kept only if every floor tile stays reachable.
  const tryBlock = (tiles: [number, number][]) => {
    if (tiles.some(([x, y]) => !isFloor(x, y) || reserved.has(idx(x, y)))) return false;
    for (const [x, y] of tiles) blocked[idx(x, y)] = true;
    if (distFrom(start.cx, start.cy).size === open - tiles.length) {
      open -= tiles.length;
      return true;
    }
    for (const [x, y] of tiles) blocked[idx(x, y)] = false;
    return false;
  };
  const put = (d: Deco, x: number, y: number) => {
    const w = d.w ?? 1;
    const tiles: [number, number][] = Array.from({ length: w }, (_, i) => [x + i, y]);
    const solid = !d.floor && !d.pass;
    if (solid && !tryBlock(tiles)) return false;
    if (!solid && (!isFloor(x, y) || reserved.has(idx(x, y)))) return false;
    props.push({
      kind: "kiln", x, y, name: d.name, alt: d.alt, floor: d.floor, anim: d.anim,
      variant: d.variants ? Math.floor(rand() * d.variants) : undefined, off: w > 1 ? [(w - 1) * 8, 0] : undefined,
    });
    for (const [tx, ty] of tiles) reserved.add(idx(tx, ty));
    return true;
  };
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  const dress = DRESS[theme];
  /** The lair's centrepiece (nest, bed, chopping block) somewhere around the boss. */
  const nearLair = (d: Deco, r: Room) => {
    for (let i = 0; i < 12; i++) if (put(d, r.cx + Math.floor((rand() - 0.5) * 6), r.cy - 2 + Math.floor((rand() - 0.5) * 3))) return;
  };

  if (theme === "cave") {
    // Rock spikes and boulders along the cavern walls, mushrooms glowing in the nooks, puddles and guano.
    const wallNear = (x: number, y: number) => !isFloor(x + 1, y) || !isFloor(x - 1, y) || !isFloor(x, y + 1) || !isFloor(x, y - 1);
    for (let y = 2; y < MAP_H - 2; y++)
      for (let x = 2; x < MAP_W - 2; x++) {
        if (!isFloor(x, y) || reserved.has(idx(x, y))) continue;
        const r = rand();
        if (wallNear(x, y)) {
          if (r < 0.05) put(pick(dress.wall), x, y);
          else if (r < 0.075) put(dress.corner[0], x, y);
        } else if (r < 0.012) put(pick(dress.floor), x, y);
        else if (r < 0.016) put(pick(dress.middle), x, y);
      }
  }

  for (const r of rooms) {
    const lair = r === bossRoom;
    if (theme === "cave") {
      if (lair) {
        for (const d of dress.boss) nearLair(d, r);
        for (let i = 0; i < 5; i++) props.push({ kind: "bones", x: r.cx + Math.floor((rand() - 0.5) * 6), y: r.cy + Math.floor((rand() - 0.5) * 6), frame: Math.floor(rand() * 3) });
      }
    } else if (theme === "crypt") {
      // Bones, rubble and candles scattered on the floor.
      for (let i = 0; i < 3 + Math.floor(rand() * 4); i++) {
        const x = r.x + 1 + Math.floor(rand() * (r.w - 2)), y = r.y + 1 + Math.floor(rand() * (r.h - 2));
        props.push({ kind: rand() < 0.3 ? "candle" : "bones", x, y, frame: Math.floor(rand() * 3) });
      }
    } else {
      // Against the back wall (a wall right above), in the corners, a post or table in the middle of big
      // rooms, stains and webs on the floor; the lair gets its own dressing.
      if (r === start && dress.entry) put(dress.entry, r.cx + 1, r.y);
      for (let x = r.x; x < r.x + r.w; x++)
        if (!isFloor(x, r.y - 1) && rand() < (lair ? 0.35 : 0.28)) put(pick(lair ? [...dress.boss.filter((d) => !d.floor), ...dress.wall] : dress.wall), x, r.y);
      for (const [x, y] of [[r.x, r.y + r.h - 1], [r.x + r.w - 1, r.y + r.h - 1], [r.x, r.y + 1], [r.x + r.w - 1, r.y + 1]])
        if (rand() < 0.6) put(pick(dress.corner), x, y);
      if (r.w >= 9 && r.h >= 7 && r !== start)
        for (const [x, y] of [[r.x + 2, r.cy], [r.x + r.w - 3, r.cy]]) if (rand() < 0.7) put(pick(dress.middle), x, y);
      for (let i = 0; i < (lair ? 6 : 2 + Math.floor(rand() * 3)); i++)
        put(pick(lair ? dress.boss.filter((d) => d.floor).concat(dress.floor) : dress.floor), r.x + Math.floor(rand() * r.w), r.y + Math.floor(rand() * r.h));
      if (lair) for (const d of dress.boss.filter((b) => !b.floor)) nearLair(d, r);
      if (theme === "cellar" && rand() < 0.5) props.push({ kind: "candle", x: r.x + 1, y: r.y, frame: Math.floor(rand() * 3) });
      else if (rand() < 0.4) props.push({ kind: "bones", x: r.x + 1 + Math.floor(rand() * (r.w - 2)), y: r.y + 1 + Math.floor(rand() * (r.h - 2)), frame: Math.floor(rand() * 3) });
    }
    if (r === start) continue;
    if (lair) {
      packs.push({ x: r.cx, y: r.cy, level: level + 1, count: 4, champion: false, faction: "undead", unique: boss ?? undefined, types: enemies });
      chests.push({ x: r.cx, y: r.y + 1, level: level + 2, safe: true });
      continue;
    }
    packs.push({ x: r.cx, y: r.cy, level, count: 3 + Math.floor(rand() * 3), champion: rand() < 0.2, faction: "undead", types: enemies });
    if (rand() < 0.3) chests.push({ x: r.x + 1 + Math.floor(rand() * (r.w - 2)), y: r.y + 1, level });
  }
  // Chests sit on free floor (a prop may have taken the tile).
  const placed = chests.filter((c) => isFloor(c.x, c.y) && !reserved.has(idx(c.x, c.y)) && tryBlock([[c.x, c.y]]));
  blocked[idx(portal.x, portal.y)] = true;

  return {
    kind: "dungeon", theme,
    grass: blocked.map((b) => !b), // the floor, used for the minimap
    blocked, props, chests: placed, packs,
    spawn: { x: start.cx, y: start.cy + 1 }, gates: [], portal, exits: [], dungeons: [],
    town: { x0: start.x, y0: start.y, x1: start.x + start.w - 1, y1: start.y + start.h - 2 },
    npcs: null,
  };
}

/** Rectangular rooms, each linked by a corridor to the nearest one already linked. */
function carveRooms(rand: () => number, theme: Exclude<DungeonTheme, "cave">, carve: (x: number, y: number) => void) {
  const k = ROOMS[theme];
  const [b0, b1] = k.box;
  const rooms: Room[] = [];
  for (let tries = 0; rooms.length < k.n && tries < 800; tries++) {
    const w = k.w[0] + Math.floor(rand() * (k.w[1] - k.w[0])), h = k.h[0] + Math.floor(rand() * (k.h[1] - k.h[0]));
    const x = b0 + Math.floor(rand() * (b1 - b0 - w)), y = b0 + Math.floor(rand() * (b1 - b0 - h));
    if (rooms.some((r) => x < r.x + r.w + 3 && x + w + 3 > r.x && y < r.y + r.h + 3 && y + h + 3 > r.y)) continue;
    rooms.push({ x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) });
  }
  for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) carve(x, y);
  const lo = -((k.corridor - 1) >> 1), hi = lo + k.corridor - 1;
  const corridor = (a: Room, b: Room) => {
    const hLine = (y: number, x0: number, x1: number) => { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let o = lo; o <= hi; o++) carve(x, y + o); };
    const vLine = (x: number, y0: number, y1: number) => { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let o = lo; o <= hi; o++) carve(x + o, y); };
    if (rand() < 0.5) { hLine(a.cy, a.cx, b.cx); vLine(b.cx, a.cy, b.cy); } else { vLine(a.cx, a.cy, b.cy); hLine(b.cy, a.cx, b.cx); }
  };
  const linked = [rooms[0]];
  for (const r of rooms.slice(1)) {
    const near = linked.reduce((best, o) => (Math.hypot(o.cx - r.cx, o.cy - r.cy) < Math.hypot(best.cx - r.cx, best.cy - r.cy) ? o : best));
    corridor(near, r);
    linked.push(r);
  }
  return rooms;
}

/** A natural cavern: cellular automaton smoothing of random rock, only the largest open pocket kept. Its
 * "rooms" are wide spots picked along it (for camps and dressing), the entrance the westernmost one. */
function carveCave(rand: () => number, carve: (x: number, y: number) => void, isFloor: (x: number, y: number) => boolean) {
  const idx = (x: number, y: number) => y * MAP_W + x;
  const x0 = 30, y0 = 34, x1 = 98, y1 = 94;
  let open = new Array<boolean>(MAP_W * MAP_H).fill(false);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) open[idx(x, y)] = rand() < 0.55;
  for (let it = 0; it < 5; it++) {
    const next = open.slice();
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && open[idx(x + dx, y + dy)]) n++;
        next[idx(x, y)] = open[idx(x, y)] ? n >= 4 : n >= 5;
      }
    open = next;
  }
  // Largest connected pocket.
  const seen = new Int32Array(MAP_W * MAP_H).fill(-1);
  let best: number[] = [];
  for (let i = 0; i < open.length; i++) {
    if (!open[i] || seen[i] >= 0) continue;
    const cells = [i];
    seen[i] = i;
    for (let q = 0; q < cells.length; q++) {
      const c = cells[q], x = c % MAP_W, y = Math.floor(c / MAP_W);
      for (const n of [idx(x + 1, y), idx(x - 1, y), idx(x, y + 1), idx(x, y - 1)]) if (open[n] && seen[n] < 0) { seen[n] = i; cells.push(n); }
    }
    if (cells.length > best.length) best = cells;
  }
  for (const c of best) carve(c % MAP_W, Math.floor(c / MAP_W));
  // Wide spots: floor tiles with open ground around them, at least 12 tiles apart.
  const wide = (x: number, y: number, r: number) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (!isFloor(x + dx, y + dy)) return false;
    return true;
  };
  const spots = best.map((c) => [c % MAP_W, Math.floor(c / MAP_W)] as [number, number]).filter(([x, y]) => wide(x, y, 2));
  spots.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const picked: [number, number][] = [];
  for (const s of spots) if (picked.every((p) => Math.hypot(p[0] - s[0], p[1] - s[1]) >= 12)) picked.push(s);
  return picked.slice(0, 12).map(([cx, cy]): Room => ({ x: cx - 2, y: cy - 2, w: 5, h: 5, cx, cy }));
}
