// Procedural 12x12 pixel-art item icons in the Farm RPG palette (outline #1c0f1a).
export type IconId =
  | "axe" | "bow" | "staff" | "wand" | "helm" | "armor" | "gloves" | "boots" | "ring" | "amulet"
  | "potion_hp" | "potion_mp" | "gold" | "town_portal"
  // item bases (see BASES in data/items.ts)
  | "hatchet" | "double_axe" | "executioner" | "shortbow" | "compbow" | "dragonbow" | "oakstaff" | "runestaff" | "archstaff" | "bonewand" | "scepter" | "moonwand" | "hood" | "horned_helm" | "bone_crown" | "greathelm" | "tunic" | "chainmail" | "plate" | "robe" | "bracers" | "gauntlets" | "claws" | "sandals" | "greaves" | "walker_boots" | "ring_copper" | "ring_silver" | "ring_bone" | "ring_ruby" | "ring_sapphire" | "ring_emerald" | "amulet_tooth" | "amulet_silver" | "amulet_cateye";

const COLORS: Record<string, string> = {
  k: "#1c0f1a", w: "#9e6d32", W: "#c4a75c", s: "#adb8c3", S: "#717c97", h: "#e8ebee",
  g: "#e1a227", G: "#eddc83", r: "#c13a2b", R: "#e0664a", b: "#2c60d5", B: "#5f93ea",
  l: "#7a4a2a", L: "#a8703f", p: "#8d44ac", P: "#cb71ff", c: "#5bc8f0", x: "#e8ebee",
  o: "#c9b88a", q: "#b5502a", Q: "#e08a4a", e: "#3f8a2e", E: "#8fd060", n: "#41344f", f: "#7a1420", F: "#c0503a",
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
  town_portal: [
    "....kkkk....", "...kBccBk...", "..kBcxxcBk..", "..kcxBBxck..", ".kBcBkkBcBk.", ".kcxBkkBxck.",
    ".kcxBkkBxck.", ".kBcBkkBcBk.", "..kcxBBxck..", "..kBcxxcBk..", "..kkBccBkk..", ".kkkkkkkkkk.",
  ],
  gold: [
    "............", "............", "............", "....kkkk....", "...kgGGgk...", "..kgGggggk..",
    "..kgggggGk..", "..kkgggkkk..", ".kgGGgkgGgk.", ".kgggggggggk", "..kkkkkkkkk.", "............",
  ],  hatchet: [
    "............", "............", "......kkk...", ".....kshsk..", "....kshhsk..", "....kssSk...",
    ".....kwk....", "....kwk.....", "...kwk......", "..kwk.......", ".kWk........", ".kk.........",
  ],
  double_axe: [
    "..kk....kk..", ".kshk..khsk.", ".kshhkkhhsk.", ".ksshwwhssk.", ".kSsskwksSk.", "..kSkkwkkSk.",
    "...k.kwk.k..", ".....kwk....", ".....kwk....", ".....kwk....", ".....kWk....", ".....kkk....",
  ],
  executioner: [
    "...kkkkkk...", "..khhhhssk..", "..khsssssk..", "..ksssssSk..", "..kssssSSk..", "...kSSSSk...",
    "....kkwkk...", ".....kwk....", ".....kwk....", ".....kwk....", ".....kWk....", ".....kkk....",
  ],
  shortbow: [
    "............", "....kk......", "....kWk.....", "....x.kwk...", "....x..kwk..", "....x..kwk..",
    "....x..kwk..", "....x..kwk..", "....x.kwk...", "....kWk.....", "....kk......", "............",
  ],
  compbow: [
    "..kk........", "..kWkk......", "..x.kllk....", "..x...kwk...", "..x...kwk...", "..x..kgk....",
    "..x..kgk....", "..x...kwk...", "..x...kwk...", "..x.kllk....", "..kWkk......", "..kk........",
  ],
  dragonbow: [
    "..kkk.......", "..kRrk......", "..x.krrk....", "..x...krk...", "..x...krk...", "..x..kGk....",
    "..x..kGk....", "..x...krk...", "..x...krk...", "..x.krrk....", "..kRrk......", "..kkk.......",
  ],
  oakstaff: [
    "........kkk.", ".......kLLLk", ".......kLlLk", "........kkk.", ".......kwk..", "......kwk...",
    ".....kwk....", "....kwk.....", "...kwk......", "..kwk.......", ".kWk........", ".kk.........",
  ],
  runestaff: [
    ".......kkkk.", "......kSPSk.", "......kPpPk.", "......kSPSk.", ".......kkk..", "......kSk...",
    ".....kSk....", "....kSk.....", "...kSk......", "..kSk.......", ".kSk........", ".kk.........",
  ],
  archstaff: [
    "......k.kk.k", "......kgkkgk", ".......kcBk.", "......kgcBgk", ".......kgk..", "......kgk...",
    ".....kwk....", "....kwk.....", "...kwk......", "..kwk.......", ".kgk........", ".kk.........",
  ],
  bonewand: [
    ".........kk.", "........khhk", "........khok", ".......kkok.", "......kok...", ".....kok....",
    "....kok.....", "...kok......", "..kok.......", "..kk........", "............", "............",
  ],
  scepter: [
    "........kkk.", ".......kpPpk", ".......kPrPk", ".......kpPpk", "......kgkkk.", ".....knk....",
    "....knk.....", "...knk......", "..knk.......", "..kk........", "............", "............",
  ],
  moonwand: [
    "........kkk.", "..........Gk", ".........kGk", "........kGGk", ".......kGkk.", "......kSk...",
    ".....kSk....", "....kSk.....", "...kSk......", "..kSk.......", "..kk........", "............",
  ],
  hood: [
    "............", ".....kk.....", "....kLLk....", "...kLLLLk...", "..kLLkkLLk..", "..kLknnkLk..",
    "..kLknnkLk..", "..kLLkkLLk..", ".kLLLLLLLLk.", ".kllllllllk.", ".kkkkkkkkkk.", "............",
  ],
  horned_helm: [
    "k..........k", "kWk......kWk", ".kWkkkkkkWk.", "..kshhhhsk..", "..kssssssk..", "..kSkkkkSk..",
    "..kSk..kSk..", "..kSk..kSk..", "..kkk..kkk..", "............", "............", "............",
  ],
  bone_crown: [
    "............", "..k.k..k.k..", "..khkkkkhk..", "..khohhohk..", "..kohhhhok..", "..koororok..",
    "..kkkkkkkk..", "............", "............", "............", "............", "............",
  ],
  greathelm: [
    "....kkkk....", "...kshhsk...", "..kshhhhsk..", "..kssssssk..", "..kkkkkkkk..", "..kSkkkkSk..",
    "..kssssssk..", "..kSsssSSk..", "..kSSSSSSk..", "...kkkkkk...", "............", "............",
  ],
  tunic: [
    "............", "..kkk..kkk..", ".kfffkkfffk.", ".kfFffffFfk.", ".kkffffffkk.", "..kffffffk..",
    "..kfFffFfk..", "..kffffffk..", "..kffffffk..", "..kkkkkkkk..", "............", "............",
  ],
  chainmail: [
    "............", "..kkk..kkk..", ".kssskksssk.", ".kSsSsSsSsk.", ".kksSsSsSkk.", "..kSsSsSsk..",
    "..ksSsSsSk..", "..kSsSsSsk..", "..kllllllk..", "..kkkkkkkk..", "............", "............",
  ],
  plate: [
    "............", ".kkkk..kkkk.", ".khhskkshhk.", ".kshsssshsk.", ".kkssshsskk.", "..kssshssk..",
    "..kSsshsSk..", "..kSSssSSk..", "..kSSSSSSk..", "..kkkkkkkk..", "............", "............",
  ],
  robe: [
    "............", "..kkk..kkk..", ".kpppkkpppk.", ".kpPpggpPpk.", ".kkppgpppkk.", "..kpppgppk..",
    "..kppppgpk..", ".kpppppppk..", ".kpPpppPppk.", ".kkkkkkkkkk.", "............", "............",
  ],
  bracers: [
    "............", "............", "..kkkk.kkkk.", ".kLLLk.kLLLk", ".kgggk.kgggk", ".kLLLk.kLLLk",
    ".kLLLk.kLLLk", ".kgggk.kgggk", ".kllLk.kllLk", "..kkkk..kkk.", "............", "............",
  ],
  gauntlets: [
    "............", "....k.k.k...", "...kskskSk..", "...kskskSk..", "..kkssssSk..", "..kskssssk..",
    "..kssssssk..", "..kShhhhSk..", "..kSSSSSSk..", "..kkkkkkkk..", "............", "............",
  ],
  claws: [
    "..h..h..h...", "..hk.hk.hk..", "...kh.kh.kh.", "...kLkLkLk..", "..kkLLLLLk..", "..kLkLLLLk..",
    "..kLLLLLLk..", "...kLLLLk...", "...kllllk...", "...kkkkkk...", "............", "............",
  ],
  sandals: [
    "............", "............", "............", "...k.k......", "...kLk......", "...kLk......",
    "...kLkkk....", "..kLkkkLk...", "..kllllllk..", "..kkkkkkkk..", "............", "............",
  ],
  greaves: [
    "............", "...kkkk.....", "...khsk.....", "...ksSk.....", "...khsk.....", "...ksSkk....",
    "...ksssssk..", "..kSSSSSSk..", "..kkkkkkkk..", "............", "............", "............",
  ],
  walker_boots: [
    "...kkkkk....", "...kGggk....", "...knnnk....", "...knnnk....", "...knnnk....", "...knnnkk...",
    "...knnnnnk..", "..kllllllk..", "..kkkkkkkk..", "............", "............", "............",
  ],
  ring_copper: [
    "............", "............", "....kkkk....", "...kqQQqk...", "..kqk..kqk..", "..kqk..kqk..",
    "..kqk..kqk..", "...kqqqk....", "....kkk.....", "............", "............", "............",
  ],
  ring_silver: [
    "............", ".....kk.....", "....kBBk....", "....kkkk....", "...kshhsk...", "..ksk..ksk..",
    "..ksk..ksk..", "..kSk..kSk..", "...kSSSk....", "....kkk.....", "............", "............",
  ],
  ring_bone: [
    "............", "....k..k....", "...khkkhk...", "...kohhok...", "...kohhok...", "..kok..kok..",
    "..kok..kok..", "..kok..kok..", "...kooook...", "....kkkk....", "............", "............",
  ],
  ring_ruby: [
    "............", "....kkkk....", "...krRRrk...", "...krrrrk...", "....kkkk....", "...kgGGgk...",
    "..kgk..kgk..", "..kgk..kgk..", "...kgggk....", "....kkk.....", "............", "............",
  ],
  ring_sapphire: [
    "............", "....kkkk....", "...kbBBbk...", "...kbbbbk...", "....kkkk....", "...kshhsk...",
    "..ksk..ksk..", "..ksk..ksk..", "...kSSSk....", "....kkk.....", "............", "............",
  ],
  ring_emerald: [
    "............", "....kkkk....", "...keEEek...", "...keeeek...", "....kkkk....", "...kgGGgk...",
    "..kgk..kgk..", "..kgk..kgk..", "...kgggk....", "....kkk.....", "............", "............",
  ],
  amulet_tooth: [
    ".k........k.", "..k......k..", "...k....k...", "....k..k....", ".....kk.....", ".....kk.....",
    "....khhk....", "....khok....", ".....kok....", ".....kok....", "......kk....", "............",
  ],
  amulet_silver: [
    ".k........k.", "..k......k..", "...k....k...", "....k..k....", ".....kk.....", "....kssk....",
    "...kshBsk...", "..kshBBBsk..", "...kSBBSk...", "....kSSk....", ".....kk.....", "............",
  ],
  amulet_cateye: [
    ".k........k.", "..k......k..", "...k....k...", "....k..k....", ".....kk.....", "...kkggkk...",
    "..kgeEEegk..", "..kgEkkEgk..", "..kgeEEegk..", "...kkggkk...", "............", "............",
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
