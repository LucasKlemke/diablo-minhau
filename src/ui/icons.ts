// Procedural 12x12 pixel-art item icons in the Farm RPG palette (outline #1c0f1a).
export type IconId =
  | "axe" | "bow" | "staff" | "wand" | "helm" | "armor" | "gloves" | "boots" | "ring" | "amulet"
  | "potion_hp" | "potion_mp" | "gold";

const COLORS: Record<string, string> = {
  k: "#1c0f1a", w: "#9e6d32", W: "#c4a75c", s: "#adb8c3", S: "#717c97", h: "#e8ebee",
  g: "#e1a227", G: "#eddc83", r: "#c13a2b", R: "#e0664a", b: "#2c60d5", B: "#5f93ea",
  l: "#7a4a2a", L: "#a8703f", p: "#8d44ac", P: "#cb71ff", c: "#5bc8f0", x: "#e8ebee",
};

const MAPS: Record<IconId, string[]> = {
  axe: [
    "............", "......kkkk..", ".....kshhsk.", "....kshhsssk", "....ksssssSk", "....kkSSSSk.",
    ".....kwkkk..", "....kwk.....", "...kwk......", "..kwk.......", ".kWk........", ".kk.........",
  ],
  bow: [
    "...kk.......", "...kWkk.....", "...x.kwk....", "...x..kwk...", "...x...kwk..", "...x...kwk..",
    "...x...kwk..", "...x...kwk..", "...x..kwk...", "...x.kwk....", "...kWkk.....", "...kk.......",
  ],
  staff: [
    "........kkk.", ".......kcBck", ".......kBcBk", "........kkk.", ".......kwk..", "......kwk...",
    ".....kwk....", "....kwk.....", "...kwk......", "..kwk.......", ".kWk........", ".kk.........",
  ],
  wand: [
    ".........kk.", "........kPPk", "........kPpk", ".......kkkk.", "......kgk...", ".....klk....",
    "....klk.....", "...klk......", "..klk.......", "..kk........", "............", "............",
  ],
  helm: [
    "............", "....kkkk....", "...kshhsk...", "..kssssssk..", "..kssssssk..", "..kSkkkkSk..",
    "..kSk..kSk..", "..kSk..kSk..", "..kkk..kkk..", "............", "............", "............",
  ],
  armor: [
    "............", "..kkk..kkk..", ".kLLLkkLLLk.", ".kLlLLLLlLk.", ".kkLLLLLLkk.", "..kLLLLLLk..",
    "..kLgLLgLk..", "..kLLLLLLk..", "..kllllllk..", "..kkkkkkkk..", "............", "............",
  ],
  gloves: [
    "............", "....k.k.....", "...kLkLkk...", "...kLkLkLk..", "..kkLLLLLk..", "..kLkLLLLk..",
    "..kLLLLLLk..", "...kLLLLk...", "...kllllk...", "...kkkkkk...", "............", "............",
  ],
  boots: [
    "............", "...kkkk.....", "...kLLk.....", "...kLLk.....", "...kLLk.....", "...kLLLkk...",
    "...kLLLLLk..", "..kllllllk..", "..kkkkkkkk..", "............", "............", "............",
  ],
  ring: [
    "............", ".....kk.....", "....kcck....", "....kkkk....", "...kgGGgk...", "..kgk..kgk..",
    "..kgk..kgk..", "..kgk..kgk..", "...kgggk....", "....kkk.....", "............", "............",
  ],
  amulet: [
    ".k........k.", "..k......k..", "...k....k...", "....k..k....", ".....kk.....", "....kggk....",
    "...kgrRgk...", "...kgrrgk...", "....kggk....", ".....kk.....", "............", "............",
  ],
  potion_hp: [
    "............", "....kkk.....", "....kWk.....", "....kxk.....", "...kxxxk....", "..kxrRrxk...",
    "..krRrrrk...", "..krrrrrk...", "...krrrk....", "....kkk.....", "............", "............",
  ],
  potion_mp: [
    "............", "....kkk.....", "....kWk.....", "....kxk.....", "...kxxxk....", "..kxbBbxk...",
    "..kbBbbbk...", "..kbbbbbk...", "...kbbbk....", "....kkk.....", "............", "............",
  ],
  gold: [
    "............", "............", "............", "....kkkk....", "...kgGGgk...", "..kgGggggk..",
    "..kgggggGk..", "..kkgggkkk..", ".kgGGgkgGgk.", ".kgggggggggk", "..kkkkkkkkk.", "............",
  ],
};

export const ICON_IDS = Object.keys(MAPS) as IconId[];

export function drawIcon(id: IconId): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = 12;
  const ctx = c.getContext("2d")!;
  MAPS[id].forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = COLORS[row[x]];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
    }
  });
  return c;
}

const urls = new Map<IconId, string>();
export function iconUrl(id: IconId): string {
  let u = urls.get(id);
  if (!u) urls.set(id, (u = drawIcon(id).toDataURL()));
  return u;
}
