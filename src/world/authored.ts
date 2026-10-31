// Hand-authored areas (Act I): every player walks the same map. A layout lists the ground, roads, woods,
// buildings, camps and the spots where quest objects lie; this file turns it into the same WorldMap the
// procedural generator makes. The small scatter (grass tufts, stones, bones) uses a fixed seed per area.
import type { QuestItemId } from "../data/quests";
import { AREAS, exitsOf, type AreaId, type NpcSpots, type Side } from "../data/zones";
import type { SpriteName } from "../kiln";
import { MAP_H, MAP_W, rng, valueNoise, type Pack, type Prop, type WorldMap } from "./mapgen";

export type Pt = [number, number];
export type Shape = { rect: [number, number, number, number] } | { circle: [number, number, number] } | { poly: Pt[] };

/** A SpriteKiln prop at a tile. `alt` is drawn while the export is missing (another sprite or a classic prop
 * kind such as "tree_big"); `block` is the footprint it makes solid, in tiles relative to `at`. */
export interface Placement {
  name: SpriteName;
  at: Pt;
  alt?: string;
  variant?: number;
  anim?: string;
  /** Lies flat on the ground (decals, rugs): drawn under everything. */
  floor?: boolean;
  block?: [number, number, number, number];
  /** Trees fade when the hero walks behind them. */
  tree?: boolean;
  /** Pixel nudge of the pivot. */
  off?: Pt;
}

export interface Layout {
  seed: number;
  /** Bare ground (ash, mud) instead of grass. */
  dirt: Shape[];
  /** Dirt roads through tile points (3 wide unless `w`); an exit road ends on the map edge. */
  roads: { pts: Pt[]; w?: number }[];
  /** Woods: trees on free ground inside the shape. */
  woods: { shape: Shape; density: number; trees: Omit<Placement, "at">[] }[];
  /** Buildings and landmarks (placed first; nothing grows on them). */
  build: Placement[];
  /** Small decoration scattered inside shapes (deterministic). */
  scatter: { shape: Shape; density: number; items: Omit<Placement, "at">[] }[];
  packs: Pack[];
  chests: Pt[];
  /** Tile on the map edge where each exit road leaves (must match the area's neighbours). */
  exits: Partial<Record<Side, Pt>>;
  spawn: Pt;
  portal?: Pt;
  /** Dungeon entrances: the 5x3 ruin's bottom-left tile (as in mapgen). */
  dungeons: Pt[];
  /** Village: the fenced rect, where the NPCs stand, its palisade gaps and the gates that close them. */
  town?: { x0: number; y0: number; x1: number; y1: number };
  npcs?: NpcSpots;
  palisade?: { gaps: { side: Side; from: number; to: number }[]; broken: Pt[] };
  gates?: { tiles: Pt[]; spots: [number, number, number, number][] };
  /** Where quest objects of each kind lie (in this area). */
  spots: Partial<Record<QuestItemId, Pt[]>>;
  /** A palisaded arena whose only gap (`side`, tiles `from`..`to`) is barred until `quest` is taken. */
  arena?: { rect: [number, number, number, number]; side: Side; from: number; to: number; stage: Pt; quest: string };
  /** A ring of standing stones of radius `r` around `at`, open only at the mouth (`mouth` degrees ± `width`,
   * 0 = east, 90 = south), home of `quest`'s bosses. */
  lair?: { at: Pt; r: number; mouth: number; width: number; quest: string };
  /** Woods tree used along the map border. */
  border: Omit<Placement, "at">[];
}

const idx = (x: number, y: number) => y * MAP_W + x;
const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;

export function inShape(s: Shape, x: number, y: number): boolean {
  if ("rect" in s) return x >= s.rect[0] && x <= s.rect[2] && y >= s.rect[1] && y <= s.rect[3];
  if ("circle" in s) return Math.hypot(x - s.circle[0], y - s.circle[1]) <= s.circle[2];
  // Even-odd point in polygon.
  let c = false;
  const p = s.poly;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++)
    if ((p[i][1] > y) !== (p[j][1] > y) && x < ((p[j][0] - p[i][0]) * (y - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) c = !c;
  return c;
}

const bounds = (s: Shape): [number, number, number, number] => {
  if ("rect" in s) return s.rect;
  if ("circle" in s) return [s.circle[0] - s.circle[2], s.circle[1] - s.circle[2], s.circle[0] + s.circle[2], s.circle[1] + s.circle[2]];
  const xs = s.poly.map((p) => p[0]), ys = s.poly.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};

export function buildAuthoredMap(area: AreaId, L: Layout): WorldMap {
  const rand = rng(L.seed);
  const grass = new Array<boolean>(MAP_W * MAP_H).fill(true);
  const blocked = new Array<boolean>(MAP_W * MAP_H).fill(false);
  const reserved = new Array<boolean>(MAP_W * MAP_H).fill(false);
  const props: Prop[] = [];
  const block = (x: number, y: number) => inside(x, y) && (blocked[idx(x, y)] = true);
  const reserve = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inside(x, y)) reserved[idx(x, y)] = true;
  };
  const place = (p: Placement) => {
    props.push({ kind: "kiln", x: p.at[0], y: p.at[1], name: p.name, alt: p.alt, variant: p.variant, anim: p.anim, floor: p.floor, tree: p.tree, off: p.off });
    if (p.block) for (let y = p.at[1] + p.block[1]; y <= p.at[1] + p.block[3]; y++) for (let x = p.at[0] + p.block[0]; x <= p.at[0] + p.block[2]; x++) block(x, y);
  };
  const forEach = (s: Shape, fn: (x: number, y: number) => void) => {
    const [x0, y0, x1, y1] = bounds(s);
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(MAP_H - 1, Math.ceil(y1)); y++)
      for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(MAP_W - 1, Math.ceil(x1)); x++) if (inShape(s, x, y)) fn(x, y);
  };

  // Ground.
  for (const s of L.dirt) forEach(s, (x, y) => (grass[idx(x, y)] = false));
  // Roads (reserved: nothing grows on them).
  const exitGap = new Array<boolean>(MAP_W * MAP_H).fill(false);
  for (const r of L.roads) {
    const h = (r.w ?? 3) >> 1;
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const [ax, ay] = r.pts[i], [bx, by] = r.pts[i + 1];
      const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay), 1);
      for (let k = 0; k <= n; k++) {
        const x = Math.round(ax + ((bx - ax) * k) / n), y = Math.round(ay + ((by - ay) * k) / n);
        for (let oy = -h; oy <= h; oy++) for (let ox = -h; ox <= h; ox++) {
          if (!inside(x + ox, y + oy)) continue;
          grass[idx(x + ox, y + oy)] = false;
          reserved[idx(x + ox, y + oy)] = true;
          if (x < 4 || y < 4 || x > MAP_W - 5 || y > MAP_H - 5) exitGap[idx(x + ox, y + oy)] = true;
        }
      }
    }
  }

  // Village fence: palisade stakes around the town rect with gaps (and a few broken stakes).
  const gates: WorldMap["gates"] = [];
  const t = L.town ?? { x0: L.spawn[0] - 4, y0: L.spawn[1] - 4, x1: L.spawn[0] + 4, y1: L.spawn[1] + 4 };
  if (L.town && L.palisade) {
    reserve(t.x0, t.y0, t.x1, t.y1);
    const gap = (side: Side, v: number) => L.palisade!.gaps.some((g) => g.side === side && v >= g.from && v <= g.to);
    const broken = (x: number, y: number) => L.palisade!.broken.some(([bx, by]) => bx === x && by === y);
    for (let x = t.x0; x <= t.x1; x++)
      for (const [y, side] of [[t.y0, "n"], [t.y1, "s"]] as const) {
        if (gap(side, x)) continue;
        const b = broken(x, y);
        props.push({ kind: "kiln", x, y, name: "palisade_h", alt: "fence_h", anim: b ? "broken" : (x * 7 + y) % 3 === 0 ? "alt" : undefined });
        if (!b) block(x, y);
      }
    for (let y = t.y0 + 1; y < t.y1; y++)
      for (const [x, side] of [[t.x0, "w"], [t.x1, "e"]] as const) {
        if (gap(side, y)) continue;
        const b = broken(x, y);
        props.push({ kind: "kiln", x, y, name: "palisade_v", alt: "fence_v", anim: b ? "broken" : (x + y * 7) % 3 === 0 ? "alt" : undefined });
        if (!b) block(x, y);
      }
    for (const [x, y] of L.gates?.tiles ?? []) gates.push({ x, y, kind: y === t.y0 || y === t.y1 ? "fence_h" : "fence_v" });
  }

  // Story arena: the same palisade around its rect, the gap left open in the map (the scene bars it).
  let arena: WorldMap["arena"];
  if (L.arena) {
    const [x0, y0, x1, y1] = L.arena.rect;
    const a = L.arena;
    reserve(x0, y0, x1, y1);
    const gapAt = (side: Side, v: number) => side === a.side && v >= a.from && v <= a.to;
    const gateTiles: { x: number; y: number }[] = [];
    for (let x = x0; x <= x1; x++)
      for (const [y, side] of [[y0, "n"], [y1, "s"]] as const) {
        if (gapAt(side, x)) { gateTiles.push({ x, y }); continue; }
        props.push({ kind: "kiln", x, y, name: "palisade_h", alt: "fence_h", anim: (x * 7 + y) % 3 === 0 ? "alt" : undefined });
        block(x, y);
      }
    for (let y = y0 + 1; y < y1; y++)
      for (const [x, side] of [[x0, "w"], [x1, "e"]] as const) {
        if (gapAt(side, y)) { gateTiles.push({ x, y }); continue; }
        props.push({ kind: "kiln", x, y, name: "palisade_v", alt: "fence_v", anim: (x + y * 7) % 3 === 0 ? "alt" : undefined });
        block(x, y);
      }
    const mid = gateTiles[gateTiles.length >> 1];
    arena = { x0, y0, x1, y1, gate: mid, gateTiles, stage: { x: a.stage[0], y: a.stage[1] }, quest: a.quest };
  }

  // Story lair: every tile of the ring is solid but the mouth; menhirs stand on it, mossy rocks fill between.
  let lair: WorldMap["lair"];
  if (L.lair) {
    const { at: [cx, cy], r, mouth, width } = L.lair;
    const off = (deg: number) => Math.abs(((deg - mouth + 540) % 360) - 180);
    reserve(cx - r, cy - r, cx + r, cy + r);
    let k = 0;
    for (let y = cy - r - 1; y <= cy + r + 1; y++)
      for (let x = cx - r - 1; x <= cx + r + 1; x++) {
        if (Math.abs(Math.hypot(x - cx, y - cy) - r) > 0.8) continue; // thick enough that nothing slips diagonally
        const deg = (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
        if (off(deg) <= width) continue;
        block(x, y);
      }
    // Props every 12°, a menhir on every other one; the ones flanking the mouth are always menhirs.
    for (let deg = 0; deg < 360; deg += 12) {
      if (off(deg) <= width + 3) continue;
      const x = Math.round(cx + Math.cos((deg * Math.PI) / 180) * r), y = Math.round(cy + Math.sin((deg * Math.PI) / 180) * r);
      const stone = k++ % 2 === 0 || off(deg) <= width + 15;
      place(stone
        ? { name: "standing_stone", at: [x, y], alt: "mossy_rock", variant: (x * 3 + y) % 3 }
        : { name: "mossy_rock", at: [x, y], alt: "tree_stump", variant: (x + y) % 3 });
    }
    const md = (mouth * Math.PI) / 180;
    lair = { x: cx, y: cy, r, mouth: { x: Math.round(cx + Math.cos(md) * r), y: Math.round(cy + Math.sin(md) * r) }, quest: L.lair.quest };
  }

  // Buildings and landmarks.
  for (const b of L.build) {
    place(b);
    const bl = b.block ?? [0, 0, 0, 0];
    reserve(b.at[0] + bl[0] - 1, b.at[1] + bl[1] - 1, b.at[0] + bl[2] + 1, b.at[1] + bl[3] + 1);
  }
  const portal = L.portal ? { x: L.portal[0], y: L.portal[1] } : null;
  if (portal) { block(portal.x, portal.y); reserve(portal.x - 2, portal.y - 2, portal.x + 2, portal.y + 2); }
  const dungeons: WorldMap["dungeons"] = L.dungeons.map(([hx, hy], index) => {
    props.push({ kind: "ruin", x: hx, y: hy });
    for (let y = hy - 2; y <= hy; y++) for (let x = hx; x < hx + 5; x++) block(x, y);
    reserve(hx - 4, hy - 5, hx + 8, hy + 3);
    return { x: hx + 2, y: hy + 1, index };
  });
  // Quest object spots and NPCs stay clear.
  for (const pts of Object.values(L.spots)) for (const [x, y] of pts ?? []) reserve(x - 1, y - 1, x + 1, y + 1);
  if (L.npcs) for (const [x, y] of Object.values(L.npcs)) { block(x, y); reserve(x - 1, y - 1, x + 1, y + 2); }
  for (const p of L.packs) reserve(p.x - 3, p.y - 3, p.x + 3, p.y + 3);
  reserve(L.spawn[0] - 2, L.spawn[1] - 2, L.spawn[0] + 2, L.spawn[1] + 2);

  // Border: a wall of trees, open where the exit roads leave.
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      const i = idx(x, y);
      if (!(x < 3 || y < 3 || x >= MAP_W - 3 || y >= MAP_H - 3) || exitGap[i]) continue;
      blocked[i] = true;
      if ((x + y) % 2 === 0 && rand() < 0.85) props.push({ kind: "kiln", x, y, ...pick(L.border), tree: true });
    }

  // Woods: dense groves that wall the map in (a woods' density decides how much of it they cover), open
  // ground between them with a lone tree here and there, now and then even on a road.
  const grove = valueNoise(rand, 10);
  for (const w of L.woods)
    forEach(w.shape, (x, y) => {
      const i = idx(x, y);
      if (reserved[i] || blocked[i]) return;
      const inGrove = grass[i] && grove(x, y) > 0.62 - w.density;
      const p = inGrove ? 0.82 : grass[i] ? 0.006 : 0.002;
      if (rand() >= p) return;
      const tr = pick(w.trees);
      place({ ...tr, at: [x, y], tree: tr.tree ?? true, block: tr.block ?? [0, 0, 0, 0] });
      reserve(x, y, x, y);
    });

  // Scatter.
  for (const s of L.scatter)
    forEach(s.shape, (x, y) => {
      const i = idx(x, y);
      if (reserved[i] || blocked[i] || rand() >= s.density) return;
      place({ ...pick(s.items), at: [x, y] });
      reserved[i] = true;
    });

  // More fighting in the open: the authored camps grow by two, and the clearings between the woods get extra
  // camps (outside the village areas), each borrowing the level and kind of the nearest authored camp.
  const packs: Pack[] = L.packs.map((p) => ({ ...p, count: p.unique || p.quest ? p.count : p.count + 2 }));
  if (!AREAS[area].village && L.packs.length) {
    const open = (cx: number, cy: number) => {
      for (let y = cy - 3; y <= cy + 3; y++)
        for (let x = cx - 3; x <= cx + 3; x++) if (!inside(x, y) || blocked[idx(x, y)]) return false;
      return true;
    };
    const exitPts = Object.values(L.exits).filter(Boolean) as [number, number][];
    let extra = 0, tries = 0;
    while (extra < 16 && tries++ < 4000) {
      const x = 6 + Math.floor(rand() * (MAP_W - 12)), y = 6 + Math.floor(rand() * (MAP_H - 12));
      if (!open(x, y) || Math.hypot(x - L.spawn[0], y - L.spawn[1]) < 18) continue;
      if (exitPts.some(([ex, ey]) => Math.hypot(ex - x, ey - y) < 16)) continue;
      if (packs.some((p) => Math.hypot(p.x - x, p.y - y) < 9)) continue;
      if ([...L.dungeons, ...Object.values(L.spots).flat()].some((q) => q && Math.hypot(q[0] - x, q[1] - y) < 8)) continue;
      const near = L.packs.filter((p) => !p.quest).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
      if (!near) break;
      // The kind of camp follows the area's mix (goblins, beasts, spiders, the risen dead...).
      const camps = AREAS[area].camps, total = camps.reduce((a, c) => a + c.weight, 0);
      let r = rand() * total, faction = camps[0].kind;
      for (const c of camps) if ((r -= c.weight) < 0) { faction = c.kind; break; }
      packs.push({ x, y, level: near.level, count: 4 + Math.floor(rand() * 3), champion: rand() < 0.2, faction });
      extra++;
    }
  }

  const chests: WorldMap["chests"] = L.chests.map(([x, y]) => {
    block(x, y);
    return { x, y, level: AREAS[area].level };
  });

  // Exits (the neighbour on each side comes from the world map).
  const sides = exitsOf(area);
  const exits: WorldMap["exits"] = (Object.keys(L.exits) as Side[])
    .filter((s) => sides[s])
    .map((side) => ({ side, to: sides[side]!, x: L.exits[side]![0], y: L.exits[side]![1] }));

  return {
    kind: "zone", grass, blocked, props, chests, packs,
    spawn: { x: L.spawn[0], y: L.spawn[1] }, gates, portal, exits, dungeons, town: t, npcs: L.npcs ?? null,
    gateSpots: L.gates?.spots, spots: L.spots, arena, lair,
  };
}
