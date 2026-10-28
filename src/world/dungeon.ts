// Dungeon under an abandoned house: rooms joined by corridors, the entrance (with the exit portal)
// in the first room and the boss in the room farthest from it.
import type { EnemyType, UniqueId } from "../data/enemies";
import { MAP_H, MAP_W, rng, type Pack, type Prop, type WorldMap } from "./mapgen";

interface Room { x: number; y: number; w: number; h: number; cx: number; cy: number }

export function generateDungeon(seed: number, level: number, enemies: EnemyType[], boss: UniqueId | null): WorldMap {
  const rand = rng(seed);
  const idx = (x: number, y: number) => y * MAP_W + x;
  const blocked = new Array<boolean>(MAP_W * MAP_H).fill(true);
  const carve = (x: number, y: number) => {
    if (x > 1 && y > 1 && x < MAP_W - 2 && y < MAP_H - 2) blocked[idx(x, y)] = false;
  };

  const rooms: Room[] = [];
  for (let tries = 0; rooms.length < 11 && tries < 600; tries++) {
    const w = 7 + Math.floor(rand() * 7), h = 6 + Math.floor(rand() * 6);
    const x = 24 + Math.floor(rand() * (80 - w)), y = 24 + Math.floor(rand() * (80 - h));
    if (rooms.some((r) => x < r.x + r.w + 3 && x + w + 3 > r.x && y < r.y + r.h + 3 && y + h + 3 > r.y)) continue;
    rooms.push({ x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) });
  }
  for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) carve(x, y);

  // Corridors (3 wide): each room links to the nearest room already connected.
  const corridor = (a: Room, b: Room) => {
    const horizFirst = rand() < 0.5;
    const hLine = (y: number, x0: number, x1: number) => { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let o = -1; o <= 1; o++) carve(x, y + o); };
    const vLine = (x: number, y0: number, y1: number) => { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let o = -1; o <= 1; o++) carve(x + o, y); };
    if (horizFirst) { hLine(a.cy, a.cx, b.cx); vLine(b.cx, a.cy, b.cy); } else { vLine(a.cx, a.cy, b.cy); hLine(b.cy, a.cx, b.cx); }
  };
  const linked = [rooms[0]];
  for (const r of rooms.slice(1)) {
    const near = linked.reduce((best, o) => (Math.hypot(o.cx - r.cx, o.cy - r.cy) < Math.hypot(best.cx - r.cx, best.cy - r.cy) ? o : best));
    corridor(near, r);
    linked.push(r);
  }

  // Boss room: the farthest from the entrance by walking distance.
  const start = rooms[0];
  const dist = new Map<number, number>([[idx(start.cx, start.cy), 0]]);
  const queue = [idx(start.cx, start.cy)];
  while (queue.length) {
    const c = queue.shift()!;
    const x = c % MAP_W, y = Math.floor(c / MAP_W);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = idx(x + dx, y + dy);
      if (!blocked[n] && !dist.has(n)) { dist.set(n, dist.get(c)! + 1); queue.push(n); }
    }
  }
  const bossRoom = rooms.slice(1).reduce((a, b) => ((dist.get(idx(b.cx, b.cy)) ?? 0) > (dist.get(idx(a.cx, a.cy)) ?? 0) ? b : a));

  const props: Prop[] = [];
  const packs: Pack[] = [];
  const chests: WorldMap["chests"] = [];
  for (const r of rooms) {
    // Bones, rubble and candles scattered on the floor.
    for (let i = 0; i < 3 + Math.floor(rand() * 4); i++) {
      const x = r.x + 1 + Math.floor(rand() * (r.w - 2)), y = r.y + 1 + Math.floor(rand() * (r.h - 2));
      props.push({ kind: rand() < 0.3 ? "candle" : "bones", x, y, frame: Math.floor(rand() * 3) });
    }
    if (r === start) continue;
    if (r === bossRoom) {
      packs.push({ x: r.cx, y: r.cy, level: level + 1, count: 4, champion: false, faction: "undead", unique: boss ?? undefined, types: enemies });
      chests.push({ x: r.cx, y: r.y + 1, level: level + 2 });
      continue;
    }
    packs.push({ x: r.cx, y: r.cy, level, count: 3 + Math.floor(rand() * 3), champion: rand() < 0.2, faction: "undead", types: enemies });
    if (rand() < 0.3) chests.push({ x: r.x + 1 + Math.floor(rand() * (r.w - 2)), y: r.y + 1, level });
  }
  for (const c of chests) blocked[idx(c.x, c.y)] = true;
  const portal = { x: start.cx, y: start.cy - 1 };
  blocked[idx(portal.x, portal.y)] = true;

  return {
    kind: "dungeon",
    grass: blocked.map((b) => !b), // the floor, used for the minimap
    blocked, props, chests, packs,
    spawn: { x: start.cx, y: start.cy + 1 }, gates: [], portal, dungeons: [],
    town: { x0: start.x, y0: start.y, x1: start.x + start.w - 1, y1: start.y + start.h - 2 },
    npcs: null,
  };
}
