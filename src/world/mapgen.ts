// Procedural overworld area: grass over dirt (blob autotile), roads leading to the neighbouring areas, a fenced
// village (each act's first area) or a clearing (with a checkpoint in some areas), forests, chests, abandoned
// houses leading to dungeons, and enemy camps whose level grows a little with the distance from the centre.
import type { DungeonTheme } from "./dungeon";
import type { EnemyType, UniqueId } from "../data/enemies";
import { AREAS, exitsOf, type AreaId, type CampKind, type NpcSpots, type Side } from "../data/zones";
import type { QuestItemId } from "../data/quests";
import type { SpriteName } from "../kiln";

export const TILE = 16;
export const MAP_W = 128;
export const MAP_H = 128;

export type TreeKind = "big" | "medium" | "bush" | "stump";
export interface Prop {
  kind: string; x: number; y: number; frame?: number;
  /** kind "kiln" (authored maps): a SpriteKiln prop, its fallback, variant/clip, ground decal, fading tree, pixel nudge. */
  name?: SpriteName; alt?: string; variant?: number; anim?: string; floor?: boolean; tree?: boolean; off?: [number, number];
}
export interface Pack {
  x: number; y: number; level: number; count: number; champion: boolean;
  faction: CampKind;
  unique?: UniqueId;
  /** Explicit enemy mix (dungeons); otherwise derived from the camp kind. */
  types?: EnemyType[];
  /** Story lair: only there while this quest is being done (the three mutts wait for their quest). */
  quest?: string;
}

export interface WorldMap {
  kind: "zone" | "dungeon";
  /** Dungeons: what kind of place it is (its tiles, dressing and light). */
  theme?: DungeonTheme;
  grass: boolean[];
  blocked: boolean[];
  props: Prop[];
  chests: { x: number; y: number; level: number; safe?: boolean }[];
  packs: Pack[];
  spawn: { x: number; y: number };
  /** Act I: far end of the south trail leading to the village. */
  start?: { x: number; y: number };
  /** Act I: village exits closed by barricades until the first quest is accepted (tiles of the fence gaps). */
  gates: { x: number; y: number; kind: "fence_h" | "fence_v" }[];
  /** Checkpoint (or a dungeon's exit portal); null in areas without one. */
  portal: { x: number; y: number } | null;
  /** Roads off the map edge into the neighbouring areas: the tile at the edge and the area it leads to. */
  exits: { side: Side; to: AreaId; x: number; y: number }[];
  /** Abandoned houses: entering one loads that zone's dungeon `index`. */
  dungeons: { x: number; y: number; index: number }[];
  npcs: NpcSpots | null;
  town: { x0: number; y0: number; x1: number; y1: number };
  /** Authored villages: the gates in the fence (tile, facing); else the north, west and east gaps. */
  gateSpots?: [number, number, number, number][];
  /** Authored areas: where each kind of quest object lies. */
  spots?: Partial<Record<QuestItemId, [number, number][]>>;
  /** A fenced arena opened by the story (Lula's customs house): its rect, the barricade across its only gap
   * (pivot tile and the tiles it closes), where the boss stands to make his speech, and the quest that opens it. */
  arena?: { x0: number; y0: number; x1: number; y1: number; gate: { x: number; y: number }; gateTiles: { x: number; y: number }[];
    stage: { x: number; y: number }; quest: string };
  /** A story lair in a ring of standing stones (the three mutts): its centre and radius in tiles, the mouth's
   * centre tile and the quest whose bosses wait in it. */
  lair?: { x: number; y: number; r: number; mouth: { x: number; y: number }; quest: string };
}

export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function valueNoise(rand: () => number, cell: number) {
  const gw = Math.ceil(MAP_W / cell) + 2;
  const gh = Math.ceil(MAP_H / cell) + 2;
  const g = Array.from({ length: gw * gh }, () => rand() * 2 - 1);
  const sm = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const fx = x / cell, fy = y / cell;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = sm(fx - ix), ty = sm(fy - iy);
    const v = (i: number, j: number) => g[j * gw + i];
    const a = v(ix, iy) + (v(ix + 1, iy) - v(ix, iy)) * tx;
    const b = v(ix, iy + 1) + (v(ix + 1, iy + 1) - v(ix, iy + 1)) * tx;
    return a + (b - a) * ty;
  };
}

export function generateMap(seed: number, areaId: AreaId = "minhau"): WorldMap {
  const zone = AREAS[areaId];
  const village = !!zone.village;
  // Act I's village is reached by the long forest trail of the opening cutscene.
  const arrival = areaId === "minhau";
  const exitSides = exitsOf(areaId);
  const rand = rng(seed);
  const n1 = valueNoise(rand, 9);
  const n2 = valueNoise(rand, 4);
  const forestN = valueNoise(rand, 12);
  const idx = (x: number, y: number) => y * MAP_W + x;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;

  const grass = new Array<boolean>(MAP_W * MAP_H).fill(true);
  const blocked = new Array<boolean>(MAP_W * MAP_H).fill(false);
  const reserved = new Array<boolean>(MAP_W * MAP_H).fill(false); // no trees/props
  const props: Prop[] = [];

  // Dirt clearings.
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) if (n1(x, y) * 0.75 + n2(x, y) * 0.25 < -0.42) grass[idx(x, y)] = false;

  const cx = MAP_W >> 1, cy = MAP_H >> 1;
  const town = village ? { x0: cx - 13, y0: cy - 9, x1: cx + 13, y1: cy + 9 } : { x0: cx - 5, y0: cy - 4, x1: cx + 5, y1: cy + 4 };

  // Roads: wobbling dirt lines from the centre to the edges (villages: all four; elsewhere: the exits). An exit road
  // runs on through the border trees into the next area.
  const exitGap = new Array<boolean>(MAP_W * MAP_H).fill(false);
  const exits: WorldMap["exits"] = [];
  const road = (dx: number, dy: number, straight = false, side?: Side) => {
    let x = cx, y = cy, wob = 0;
    const tiles: [number, number][] = [];
    const lim = side ? 0 : 3;
    while (x > lim && y > lim && x < MAP_W - 1 - lim && y < MAP_H - 1 - lim) {
      tiles.push([x, y]);
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          if (!inside(x + ox, y + oy)) continue;
          grass[idx(x + ox, y + oy)] = false;
          reserved[idx(x + ox, y + oy)] = true;
          if (side) exitGap[idx(x + ox, y + oy)] = true;
        }
      if (straight) {
        x += dx;
        y += dy;
        continue;
      }
      wob += (rand() - 0.5) * 0.9;
      wob = Math.max(-1, Math.min(1, wob));
      // Near the edge an exit road goes straight, so the way out is easy to find.
      const nearEdge = Math.min(x, y, MAP_W - 1 - x, MAP_H - 1 - y) < 8;
      x += dx || (!nearEdge && rand() < Math.abs(wob) * 0.5 ? Math.sign(wob) : 0);
      y += dy || (!nearEdge && rand() < Math.abs(wob) * 0.5 ? Math.sign(wob) : 0);
    }
    if (side) exits.push({ side, to: exitSides[side]!, x: Math.max(0, Math.min(MAP_W - 1, x)), y: Math.max(0, Math.min(MAP_H - 1, y)) });
    return tiles;
  };
  const dirs: [Side, number, number][] = [["e", 1, 0], ["w", -1, 0], ["s", 0, 1], ["n", 0, -1]];
  let southRoad: [number, number][] = [];
  for (const [side, dx, dy] of dirs) {
    const exit = exitSides[side] ? side : undefined;
    if (!exit && !village) continue;
    const tiles = road(dx, dy, side === "s" && arrival, exit);
    if (side === "s") southRoad = tiles; // Act I: the straight trail the hero arrives by
  }

  // Village (or portal clearing): grass with a dirt plaza, reserved from trees.
  for (let y = town.y0; y <= town.y1; y++)
    for (let x = town.x0; x <= town.x1; x++) {
      reserved[idx(x, y)] = true;
      grass[idx(x, y)] = !(Math.abs(x - cx) <= 4 && Math.abs(y - cy) <= 3);
    }
  const block = (x: number, y: number) => inside(x, y) && (blocked[idx(x, y)] = true);

  // Act I: south of the village there is only the trail the hero arrives by: a wide, straight road between
  // two walls of forest, from the hero's start to the village gate. Nothing else of the map is out there
  // (no camps, chests or dungeons): the goblin scouts of the first quest prowl there.
  const corridor = new Array<boolean>(MAP_W * MAP_H).fill(false);
  const nearTrail = corridor; // no camps around the trail
  const trail = arrival ? southRoad.filter(([, y]) => y >= town.y1 + 2) : [];
  const OPEN = 6, WALL = 8; // open ground half-width, then this many tiles of dense forest
  if (trail.length) {
    const y0 = town.y1 + 2;
    for (let y = y0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        const i = idx(x, y), ox = Math.abs(x - cx);
        corridor[i] = reserved[i] = true;
        if (ox <= 1 && y <= trail[trail.length - 1][1]) continue; // the road itself (dirt)
        grass[i] = true;
        if (ox <= OPEN && y <= trail[trail.length - 1][1]) {
          // Open verge: grass, a few flowers and stumps.
          const r = rand();
          if (ox >= 3 && r < 0.05) props.push({ kind: "plant", x, y, frame: [15, 16, 44, 45, 46, 72, 73, 100, 101][Math.floor(rand() * 9)] });
          else if (ox >= 4 && r < 0.07) { props.push({ kind: "tree_stump", x, y }); blocked[i] = true; }
          else if (ox >= 4 && r < 0.09) { props.push({ kind: "tree_bush", x, y }); }
          continue;
        }
        blocked[i] = true;
        // The forest edge is dense; farther out a sparser grid of big trees fills the view.
        const edge = ox <= OPEN + WALL;
        if (edge ? (x + y) % 2 === 0 : x % 2 === 0 && y % 2 === 0)
          props.push({ kind: edge && ox <= OPEN + 2 && rand() < 0.5 ? "tree_medium" : "tree_big", x, y });
      }
  }

  const portal = !zone.waypoint ? null : village ? { x: cx - 3, y: cy - 1 } : { x: cx, y: cy - 2 };
  if (portal) block(portal.x, portal.y);

  // Abandoned houses that lead to dungeons.
  const dungeons: WorldMap["dungeons"] = [];
  for (let tries = 0; dungeons.length < zone.dungeons.length && tries < 4000; tries++) {
    const hx = 6 + Math.floor(rand() * (MAP_W - 14)), hy = 8 + Math.floor(rand() * (MAP_H - 14));
    const d = Math.hypot(hx - cx, hy - cy);
    if (d < 28 || d > 56) continue;
    if (dungeons.some((o) => Math.hypot(o.x - hx, o.y - hy) < 35)) continue;
    let clear = true;
    for (let y = hy - 4; y <= hy + 3 && clear; y++) for (let x = hx - 2; x <= hx + 6; x++) if (!inside(x, y) || reserved[idx(x, y)]) { clear = false; break; }
    if (!clear) continue;
    for (let y = hy - 4; y <= hy + 3; y++) for (let x = hx - 2; x <= hx + 6; x++) {
      reserved[idx(x, y)] = true;
      grass[idx(x, y)] = y < hy + 1 || rand() < 0.5;
    }
    props.push({ kind: "ruin", x: hx, y: hy });
    for (let y = hy - 2; y <= hy; y++) for (let x = hx; x < hx + 5; x++) block(x, y);
    dungeons.push({ x: hx + 2, y: hy + 1, index: dungeons.length });
  }
  // Re-carve roads through the village plaza edges.
  for (let x = town.x0; x <= town.x1; x++) for (let oy = -1; oy <= 1; oy++) grass[idx(x, cy + oy)] = false;
  for (let y = town.y0; y <= town.y1; y++) for (let ox = -1; ox <= 1; ox++) grass[idx(cx + ox, y)] = false;

  // Houses (bottom-left tile anchor), footprint 5x3 tiles.
  const houses: [number, number, number][] = village ? [
    [town.x0 + 2, cy - 3, 0], [town.x0 + 2, town.y1 - 1, 1], [town.x1 - 7, cy - 3, 1], [town.x1 - 7, town.y1 - 1, 0],
  ] : [];
  for (const [hx, hy, variant] of houses) {
    props.push({ kind: "house", x: hx, y: hy, frame: variant });
    for (let y = hy - 2; y <= hy; y++) for (let x = hx; x < hx + 5; x++) block(x, y);
  }
  // Fence around the village, with gaps for the roads; in Act I the north, west and east gaps are gates.
  const gates: WorldMap["gates"] = [];
  if (village)
    for (let o = -2; o <= 2; o++)
      gates.push({ x: cx + o, y: town.y0, kind: "fence_h" }, { x: town.x0, y: cy + o, kind: "fence_v" }, { x: town.x1, y: cy + o, kind: "fence_v" });
  // The south gap follows the road where it leaves the village, so the trail always gets in.
  const southGap = southRoad.find(([, y]) => y === town.y1 + 1)?.[0] ?? cx;
  for (let x = town.x0; x <= town.x1 && village; x++) {
    for (const y of [town.y0, town.y1 + 1]) {
      if (Math.abs(x - (y === town.y0 ? cx : southGap)) <= 2) continue;
      props.push({ kind: "fence_h", x, y });
      block(x, y);
    }
  }
  for (let y = town.y0 + 1; y <= town.y1 && village; y++) {
    if (Math.abs(y - cy) <= 2) continue;
    for (const x of [town.x0, town.x1]) {
      props.push({ kind: "fence_v", x, y });
      block(x, y);
    }
  }

  // Border of dense trees + forests.
  const placeTree = (x: number, y: number, kind: TreeKind) => {
    props.push({ kind: `tree_${kind}`, x, y });
    if (kind === "big") { block(x, y); block(x + 1, y); } else if (kind !== "bush") block(x, y);
  };
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      const i = idx(x, y);
      const border = x < 3 || y < 3 || x >= MAP_W - 3 || y >= MAP_H - 3;
      if (border && exitGap[i]) continue; // the road out of the area
      if (border) {
        blocked[i] = true;
        if (corridor[i]) continue; // the trail's forest already fills it
        if ((x + y) % 2 === 0 && rand() < 0.8) props.push({ kind: "tree_big", x, y });
        continue;
      }
      if (reserved[i] || blocked[i]) continue;
      const f = forestN(x, y);
      const p = f > 0.3 ? 0.28 : 0.012;
      if (grass[i] && rand() < p) {
        const r = rand();
        const kind: TreeKind = r < 0.5 ? "big" : r < 0.8 ? "medium" : r < 0.93 ? "bush" : "stump";
        if (kind === "big" && (blocked[i + 1] || reserved[i + 1])) continue;
        placeTree(x, y, kind);
      } else if (!grass[i] && rand() < 0.02) {
        props.push({ kind: "stone", x, y, frame: Math.floor(rand() * 9) });
      } else if (grass[i] && rand() < 0.05) {
        props.push({ kind: "plant", x, y, frame: [15, 16, 44, 45, 46, 72, 73, 100, 101][Math.floor(rand() * 9)] });
      }
    }

  const free = (x: number, y: number) => inside(x, y) && !blocked[idx(x, y)];
  const dist = (x: number, y: number) => Math.hypot(x - cx, y - cy);
  const levelAt = (x: number, y: number) => zone.level + Math.floor(Math.max(0, dist(x, y) - 16) / 20);
  const totalWeight = zone.camps.reduce((a, c) => a + c.weight, 0);
  const pickCamp = (nearRoad: boolean): CampKind => {
    let r = rand() * totalWeight;
    for (const c of zone.camps) {
      // Bandits prefer the roads.
      const w = c.kind === "bandit" && nearRoad ? c.weight * 2 : c.weight;
      if ((r -= w) < 0) return c.kind;
    }
    return zone.camps[0].kind;
  };

  // Goblin camps.
  const packs: Pack[] = [];
  let tries = 0;
  const maxPacks = village ? 10 : 30;
  while (packs.length < maxPacks && tries++ < 5000) {
    const x = 4 + Math.floor(rand() * (MAP_W - 8));
    const y = 4 + Math.floor(rand() * (MAP_H - 8));
    if (!free(x, y) || nearTrail[idx(x, y)] || exitGap[idx(x, y)] || dist(x, y) < (village ? 25 : 14)) continue;
    if (exits.some((e) => Math.hypot(e.x - x, e.y - y) < 18)) continue; // a quiet stretch where the hero walks in
    if (packs.some((p) => Math.hypot(p.x - x, p.y - y) < 9)) continue;
    const level = levelAt(x, y);
    // Bandits camp along the roads, farther out; goblins everywhere.
    const nearRoad = Math.abs(x - cx) < 8 || Math.abs(y - cy) < 8;
    let faction = pickCamp(nearRoad);
    if (faction === "bandit" && level < 2) faction = "goblin";
    packs.push({ x, y, level, count: 3 + Math.floor(rand() * 3) + Math.floor(level / 3), champion: rand() < 0.18, faction });
  }
  // Story bosses live in the farthest camps of their kind, far from each other.
  packs.sort((a, b) => dist(b.x, b.y) - dist(a.x, a.y));
  for (const u of zone.uniques) {
    const taken = packs.filter((p) => p.unique);
    let pack = packs.find((p) => !p.unique && p.faction === u.camp && taken.every((t) => Math.hypot(p.x - t.x, p.y - t.y) > 40))
      ?? packs.find((p) => !p.unique && dist(p.x, p.y) > 30);
    if (!pack) continue;
    pack.faction = u.camp;
    Object.assign(pack, { unique: u.id, champion: false, count: pack.count + 2, level: pack.level + 1 });
  }

  const chests: WorldMap["chests"] = [];
  tries = 0;
  while (chests.length < (village ? 4 : 10) && tries++ < 3000) {
    const x = 4 + Math.floor(rand() * (MAP_W - 8));
    const y = 4 + Math.floor(rand() * (MAP_H - 8));
    if (!free(x, y) || corridor[idx(x, y)] || dist(x, y) < 18 || chests.some((c) => Math.hypot(c.x - x, c.y - y) < 12)) continue;
    chests.push({ x, y, level: levelAt(x, y) });
    block(x, y);
  }

  // Far end of the trail (unused since the Act I rewrite: the hero now starts in the plaza).
  let start: WorldMap["start"];
  if (trail.length > 12) {
    const [sx, sy] = trail[trail.length - 3];
    start = { x: sx, y: sy };
  }

  const npcs: WorldMap["npcs"] = village ? { leader: [cx + 2, cy - 2], shop: [town.x0 + 8, cy - 4], guide: [town.x1 - 3, cy + 3] } : null;
  if (npcs) for (const [x, y] of Object.values(npcs)) block(x, y);
  return { kind: "zone", grass, blocked, props, chests, packs, spawn: { x: cx, y: cy + 1 }, start, gates, portal, exits, dungeons, town, npcs };
}
