// 47-tile "blob" autotile of Farm RPG's "Tileset Grass Spring" (12x4 tiles of 16px).
// Each pattern is the 3x3 neighbourhood the tile was drawn for: NW N NE | W C E | SW S SE
// ('#' = grass). Tile 22 is empty and unused.
const PATTERNS: Record<number, string> = {
  0: "...|.#.|.#.", 1: "...|.##|.#.", 2: "...|###|.#.", 3: "...|##.|.#.",
  4: "##.|###|.#.", 5: "...|###|.##", 6: "...|###|##.", 7: ".##|###|.#.",
  8: "...|.##|.##", 9: ".#.|###|###", 10: "...|###|###", 11: "...|##.|##.",
  12: ".#.|.#.|.#.", 13: ".#.|.##|.#.", 14: ".#.|###|.#.", 15: ".#.|##.|.#.",
  16: ".#.|.##|.##", 17: ".##|###|###", 18: "##.|###|###", 19: ".#.|##.|##.",
  20: ".##|.##|.##", 21: ".##|###|##.", 23: "##.|###|##.",
  24: ".#.|.#.|...", 25: ".#.|.##|...", 26: ".#.|###|...", 27: ".#.|##.|...",
  28: ".##|.##|.#.", 29: "###|###|.##", 30: "###|###|##.", 31: "##.|##.|.#.",
  32: ".##|###|.##", 33: "###|###|###", 34: "##.|###|.##", 35: "##.|##.|##.",
  36: "...|.#.|...", 37: "...|.##|...", 38: "...|###|...", 39: "...|##.|...",
  40: ".#.|###|##.", 41: ".##|###|...", 42: "##.|###|...", 43: ".#.|###|.##",
  44: ".##|.##|...", 45: "###|###|...", 46: "###|###|.#.", 47: "##.|##.|...",
};

export const FULL_GRASS = 33;

/** Canonical blob key: edges N E S W, corners only when both adjacent edges are grass. */
function key(nw: boolean, n: boolean, ne: boolean, w: boolean, e: boolean, sw: boolean, s: boolean, se: boolean): number {
  let k = 0;
  if (n) k |= 1;
  if (e) k |= 2;
  if (s) k |= 4;
  if (w) k |= 8;
  if (n && e && ne) k |= 16;
  if (s && e && se) k |= 32;
  if (s && w && sw) k |= 64;
  if (n && w && nw) k |= 128;
  return k;
}

const LOOKUP = new Map<number, number>();
for (const [idx, p] of Object.entries(PATTERNS)) {
  const c = p.replace(/\|/g, "").split("").map((ch) => ch === "#");
  LOOKUP.set(key(c[0], c[1], c[2], c[3], c[5], c[6], c[7], c[8]), Number(idx));
}

/** Tile index for a grass cell given an `isGrass(x, y)` lookup. */
export function blobTile(isGrass: (x: number, y: number) => boolean, x: number, y: number): number {
  const k = key(
    isGrass(x - 1, y - 1), isGrass(x, y - 1), isGrass(x + 1, y - 1),
    isGrass(x - 1, y), isGrass(x + 1, y),
    isGrass(x - 1, y + 1), isGrass(x, y + 1), isGrass(x + 1, y + 1),
  );
  return LOOKUP.get(k) ?? FULL_GRASS;
}
