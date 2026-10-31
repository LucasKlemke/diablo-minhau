// Act I, Minhau Forest: the five areas drawn by hand (see world/authored.ts). Every place has a reason to
// be where it is: the village huddles behind its palisade with the forest road to the north; the goblins
// camp along the woods' streams and trails; the wolves den in the misty rocks; the bandits sit on the old
// royal road; Grumm's junk throne stands in a ring of skull stakes at the heart of the forest.
import type { AreaId } from "../../data/zones";
import type { Pack } from "../mapgen";
import type { Layout, Placement, Pt, Shape } from "../authored";

// ---------------------------------------------------------------- building blocks

const rect = (x0: number, y0: number, x1: number, y1: number): Shape => ({ rect: [x0, y0, x1, y1] });
const circle = (x: number, y: number, r: number): Shape => ({ circle: [x, y, r] });

/** Dead woods of the blighted forest (twisted, burnt and bare trees; the classic trees while missing). */
const DEAD_WOODS: Omit<Placement, "at">[] = [
  { name: "twisted_tree", alt: "tree_big", variant: 0, block: [0, 0, 0, 0] },
  { name: "twisted_tree", alt: "tree_big", variant: 1, block: [0, 0, 1, 0] },
  { name: "twisted_tree", alt: "tree_medium", variant: 2, block: [0, 0, 0, 0] },
  { name: "burnt_tree", alt: "tree_medium", variant: 0, block: [0, 0, 0, 0] },
  { name: "burnt_tree", alt: "tree_medium", variant: 1, block: [0, 0, 0, 0] },
  { name: "dead_tree", alt: "tree_medium", block: [0, 0, 0, 0] },
  { name: "dead_bush", alt: "tree_bush", tree: false },
];
const MOSSY_WOODS: Omit<Placement, "at">[] = [
  ...DEAD_WOODS.slice(0, 3),
  { name: "mossy_rock", alt: "tree_stump", variant: 0, tree: false, block: [0, 0, 0, 0] },
  { name: "mossy_rock", alt: "tree_stump", variant: 1, tree: false, block: [0, 0, 1, 0] },
];
const BORDER = DEAD_WOODS.slice(0, 2);

/** Ground litter of a ruined land. */
const RUBBLE: Omit<Placement, "at">[] = [
  { name: "rubble_pile", alt: "tree_stump", variant: 0, block: [0, 0, 1, 0] },
  { name: "scorched_ground", variant: 0, floor: true },
  { name: "scorched_ground", variant: 2, floor: true },
  { name: "dead_bush", alt: "tree_bush" },
];
const FIELDS: Omit<Placement, "at">[] = [
  { name: "dead_crops", variant: 0 }, { name: "dead_crops", variant: 1 }, { name: "dead_crops", variant: 2 },
  { name: "scorched_ground", variant: 1, floor: true },
];

const pack = (x: number, y: number, level: number, count: number, faction: Pack["faction"], extra: Partial<Pack> = {}): Pack =>
  ({ x, y, level, count, champion: false, faction, ...extra });

const at = (name: Placement["name"], x: number, y: number, rest: Omit<Placement, "name" | "at"> = {}): Placement => ({ name, at: [x, y], ...rest });
/** A 4x3 building (aldo_hut, smithy, hunter_lodge): pivot 2 tiles right of its left edge, so it sits on a
 * tile corner; `back` blocks only the two back rows (a workshop open in front). */
const hut = (name: Placement["name"], x: number, y: number, back = false) =>
  at(name, x, y, { alt: "house", off: [-8, 0], block: back ? [-2, -2, 1, -1] : [-2, -2, 1, 0] });
/** A 5x3 building (pivot at the middle of its front wall). */
const house = (name: Placement["name"], x: number, y: number, rest: Omit<Placement, "name" | "at"> = {}) =>
  at(name, x, y, { alt: "house", block: [-2, -2, 2, 0], ...rest });

/** Goblin camp: tents, a trash fire, barricades and bones around its pack. */
const goblinCamp = (x: number, y: number): Placement[] => [
  at("goblin_tent", x - 3, y - 3, { alt: "tree_stump", block: [-1, -1, 0, 0] }),
  at("goblin_tent", x + 3, y - 3, { alt: "tree_stump", block: [-1, -1, 0, 0] }),
  at("trash_fire", x, y - 1, { alt: "campfire", block: [0, 0, 1, 0] }),
  at("rotten_barricade", x - 5, y + 2, { alt: "fence_h", block: [-1, 0, 1, 0] }),
  at("bone_hang", x + 5, y + 1, { alt: "dead_tree", block: [0, 0, 0, 0] }),
];

/** Paving stones over tile rects (a variant per tile from a hash; a few stones missing). */
const paved = (rects: [number, number, number, number][]): Placement[] =>
  rects.flatMap(([x0, y0, x1, y1]) => Array.from({ length: (x1 - x0 + 1) * (y1 - y0 + 1) }, (_, i) => {
    const x = x0 + (i % (x1 - x0 + 1)), y = y0 + Math.floor(i / (x1 - x0 + 1));
    const h = (x * 73 + y * 151) % 17;
    return h === 0 ? null : at("road_stones", x, y, { variant: h % 4, floor: true });
  }).filter((p): p is Placement => !!p));

// ---------------------------------------------------------------- Minhau village

/** The besieged village: Aldo's hut to the north of the dry fountain, Marta's smithy to the west, Ivo's
 * lodge to the east; the burned quarter (south-east) where the oak beams lie; the refugees' tents
 * (south-west); the graveyard (north-west). The north gate leads to the woods; the south palisade is
 * broken, and the goblin scouts prowl outside it. Dead fields all around. */
const MINHAU: Layout = {
  seed: 0x4d1a,
  dirt: [circle(64, 62, 8), rect(66, 68, 84, 81), rect(46, 68, 58, 80), circle(24, 100, 14), circle(102, 24, 12), rect(56, 84, 72, 100)],
  roads: [
    { pts: [[64, 58], [64, 44], [65, 24], [62, 0]] },
    { pts: [[64, 66], [64, 82], [64, 98]] },
    { pts: [[60, 62], [48, 62]] },
    { pts: [[68, 62], [80, 62]] },
    { pts: [[64, 30], [40, 34], [24, 52], [22, 90]], w: 2 },
    { pts: [[66, 30], [96, 26]], w: 2 },
  ],
  town: { x0: 44, y0: 44, x1: 84, y1: 82 },
  palisade: {
    gaps: [{ side: "n", from: 62, to: 66 }, { side: "s", from: 61, to: 67 }],
    broken: [[58, 82], [69, 82], [71, 82], [84, 70], [44, 66]],
  },
  gates: { tiles: [[62, 44], [63, 44], [64, 44], [65, 44], [66, 44]], spots: [[64, 44, 0, 1]] },
  build: [
    at("dry_fountain", 64, 62, { block: [-1, -1, 1, 0] }),
    hut("aldo_hut", 64, 52),
    { ...hut("smithy", 51, 59, true), block: [-2, -2, 3, -1] }, // and its chimney on the right
    hut("hunter_lodge", 77, 59, true),
    house("patched_house", 56, 73),
    house("patched_house", 78, 51),
    // Burned quarter.
    house("burned_house", 72, 73, { variant: 0 }),
    house("burned_house", 79, 78, { variant: 1 }),
    at("ruined_hut", 70, 79, { alt: "tree_stump", block: [-1, -1, 1, 0] }),
    at("rubble_pile", 76, 70, { variant: 1, block: [0, 0, 1, 0] }),
    at("rubble_pile", 82, 74, { variant: 2, block: [0, 0, 1, 0] }),
    // Refugees.
    at("canvas_tent", 49, 72, { alt: "tree_stump", block: [-1, -1, 1, 0] }),
    at("canvas_tent", 53, 78, { alt: "tree_stump", block: [-1, -1, 1, 0] }),
    at("cold_campfire", 51, 75, { alt: "campfire" }),
    at("refugee_bedroll", 47, 76), at("refugee_bedroll", 56, 70),
    // Graveyard.
    at("grave_mound", 48, 48, { variant: 0 }), at("grave_mound", 51, 48, { variant: 1 }), at("grave_mound", 49, 51, { variant: 2 }),
    at("tombstone", 53, 50, { block: [0, 0, 0, 0] }), at("dead_tree", 47, 53, { alt: "tree_medium", tree: true, block: [0, 0, 0, 0] }),
    at("well_broken", 71, 55, { alt: "tree_stump", block: [0, -1, 1, 0] }),
    at("crow", 52, 49), at("crow", 75, 75),
    // Outside: the road north and the dead farms.
    at("broken_cart", 68, 30, { alt: "tree_stump", block: [-1, 0, 1, 0] }),
    house("burned_house", 24, 92, { variant: 2 }),
    house("burned_house", 104, 18, { variant: 0 }),
    at("broken_cart", 30, 104, { alt: "tree_stump", block: [-1, 0, 1, 0] }),
    at("crow", 20, 104),
  ],
  woods: [
    { shape: rect(3, 3, 42, 40), density: 0.17, trees: DEAD_WOODS },
    { shape: rect(86, 40, 124, 124), density: 0.17, trees: DEAD_WOODS },
    { shape: rect(3, 40, 42, 84), density: 0.09, trees: DEAD_WOODS },
    { shape: rect(42, 102, 86, 124), density: 0.16, trees: DEAD_WOODS },
    { shape: rect(3, 116, 42, 124), density: 0.17, trees: DEAD_WOODS },
    { shape: rect(42, 3, 86, 40), density: 0.05, trees: DEAD_WOODS },
  ],
  scatter: [
    { shape: circle(24, 100, 14), density: 0.22, items: FIELDS },
    { shape: circle(102, 24, 12), density: 0.22, items: FIELDS },
    { shape: rect(45, 45, 83, 81), density: 0.05, items: RUBBLE },
    { shape: rect(3, 3, 124, 124), density: 0.015, items: RUBBLE },
  ],
  packs: [
    pack(64, 92, 1, 4, "goblin"), pack(20, 96, 1, 3, "goblin"), pack(100, 28, 1, 3, "goblin"), pack(26, 56, 1, 3, "goblin"),
  ],
  chests: [[28, 96], [108, 22], [16, 30]],
  exits: { n: [62, 0] },
  spawn: [64, 66],
  portal: [58, 63],
  dungeons: [],
  npcs: { leader: [66, 55], shop: [54, 62], guide: [74, 62] },
  spots: { beam: [[69, 76], [75, 77], [82, 71], [67, 80], [80, 67]] },
  border: BORDER,
};

// ---------------------------------------------------------------- Goblin Woods

/** Twisted woods split by three trails (south to the village, north to the Wolf Wood, east to the Bandit
 * Road). Three named goblin camps hold Marta's tool chests; the goblins' kitchen with the soap cauldron
 * is in the north-east, and the Abandoned House stands deepest in the woods. */
const GOBLIN_WOODS: Layout = {
  seed: 0x6b0d,
  dirt: [circle(64, 64, 6), circle(28, 72, 9), circle(92, 92, 9), circle(34, 30, 9), circle(92, 30, 9)],
  roads: [
    { pts: [[66, 127], [66, 96], [62, 80], [64, 64]] },
    { pts: [[64, 64], [58, 40], [60, 0]] },
    { pts: [[64, 64], [90, 58], [127, 56]] },
    { pts: [[62, 80], [40, 76], [28, 72]], w: 2 },
    { pts: [[66, 96], [80, 96], [92, 92]], w: 2 },
    { pts: [[58, 40], [44, 32], [34, 30]], w: 2 },
    { pts: [[90, 58], [94, 44], [92, 30]], w: 2 },
    { pts: [[92, 30], [104, 18]], w: 2 },
  ],
  build: [
    ...goblinCamp(28, 72), ...goblinCamp(92, 92), ...goblinCamp(34, 30),
    // The goblins' kitchen: the cauldron is the quest object; tents and a trash fire around it.
    at("goblin_tent", 88, 26, { alt: "tree_stump", block: [-1, -1, 0, 0] }), at("goblin_tent", 97, 27, { alt: "tree_stump", block: [-1, -1, 0, 0] }),
    at("trash_fire", 89, 32, { alt: "campfire", block: [0, 0, 1, 0] }), at("bone_hang", 86, 31, { alt: "dead_tree" }),
    at("rotten_barricade", 60, 86, { alt: "fence_h", block: [-1, 0, 1, 0] }),
    at("bone_hang", 70, 48, { alt: "dead_tree" }), at("bone_hang", 52, 70, { alt: "dead_tree" }),
    at("crow", 64, 60),
  ],
  woods: [
    { shape: rect(3, 3, 124, 124), density: 0.11, trees: DEAD_WOODS },
  ],
  scatter: [{ shape: rect(3, 3, 124, 124), density: 0.02, items: RUBBLE }],
  packs: [
    pack(28, 75, 2, 4, "goblin"), pack(92, 95, 3, 5, "goblin", { champion: true }), pack(34, 33, 3, 4, "goblin"),
    pack(92, 34, 3, 5, "goblin", { champion: true }),
    pack(64, 100, 2, 3, "goblin"), pack(46, 52, 2, 3, "goblin"), pack(80, 70, 2, 3, "beast"),
    pack(110, 110, 3, 3, "beast"), pack(16, 110, 3, 3, "beast"), pack(76, 16, 3, 4, "goblin"),
  ],
  chests: [[16, 40], [48, 110], [110, 70], [70, 18]],
  exits: { s: [66, 127], n: [60, 0], e: [127, 56] },
  spawn: [64, 66],
  dungeons: [[102, 16]],
  spots: { tools: [[25, 74], [95, 96], [31, 33]], soap: [[93, 31]] },
  border: BORDER,
};

// ---------------------------------------------------------------- Wolf Wood

/** Misty rocks and dens. Lady Kira sits in a rocky clearing to the west, surrounded by the wild pack; the
 * three corrupted mutts lair in the Crossing of the High Stones (north-east), a ring of menhirs open to the south-west; Blackfang's den is south-west. */
const WOLF_WOOD: Layout = {
  seed: 0x301f,
  dirt: [circle(34, 38, 8), circle(92, 32, 12), circle(22, 96, 6), circle(64, 64, 5)],
  roads: [
    { pts: [[60, 127], [60, 90], [64, 64]] },
    { pts: [[64, 64], [127, 64]] },
    { pts: [[64, 64], [46, 48], [36, 40]], w: 2 },
    { pts: [[64, 64], [80, 46], [90, 34]], w: 2 },
  ],
  build: [
    // Kira's clearing: a ring of mossy rocks.
    ...[0, 1, 2, 3, 4, 5, 6].map((i) => at("mossy_rock", Math.round(34 + Math.cos(i * 0.9 + 0.3) * 9), Math.round(38 + Math.sin(i * 0.9 + 0.3) * 8),
      { alt: "tree_stump", variant: i % 3, block: [0, 0, 0, 0] })),
    // Inside the Crossing of the High Stones (the ring itself is `lair`): the bandits' overturned dump cart and
    // the rotten scraps they tipped out, plague ooze where the mutts drank, gnawed bones by each one's bed.
    at("broken_cart", 93, 27, { alt: "rubble_pile", block: [-1, 0, 1, 0] }),
    at("offal_pile", 92, 30, { alt: "bone_pile", anim: "idle", block: [0, 0, 0, 0] }),
    at("offal_pile", 95, 31, { alt: "bone_pile", anim: "idle1", block: [0, 0, 0, 0] }),
    at("offal_pile", 89, 33, { alt: "bone_pile", anim: "idle2", block: [0, 0, 0, 0] }),
    at("plague_pool", 90, 30, { alt: "cave_puddle", anim: "idle", floor: true }),
    at("plague_pool", 95, 34, { alt: "cave_puddle", anim: "idle1", floor: true }),
    at("plague_pool", 87, 36, { alt: "cave_puddle", anim: "idle2", floor: true }),
    at("plague_pool", 97, 26, { alt: "cave_puddle", anim: "idle", floor: true }),
    at("gnawed_bones", 85, 26, { alt: "bone_pile", variant: 0, floor: true }),
    at("gnawed_bones", 99, 26, { alt: "bone_pile", variant: 1, floor: true }),
    at("gnawed_bones", 93, 39, { alt: "bone_pile", variant: 2, floor: true }),
    at("gnawed_bones", 88, 29, { alt: "bone_pile", variant: 1, floor: true }),
    at("wolf_den", 20, 92, { alt: "tree_stump", block: [-2, -2, 1, -1] }),
    at("wolf_den", 104, 100, { alt: "tree_stump", block: [-2, -2, 1, -1] }),
  ],
  woods: [{ shape: rect(3, 3, 124, 124), density: 0.13, trees: MOSSY_WOODS }],
  scatter: [{ shape: rect(3, 3, 124, 124), density: 0.015, items: RUBBLE }],
  packs: [
    pack(34, 41, 4, 5, "beast"),
    // The three mutts, alone in their ring (only while their quest is on).
    pack(86, 28, 5, 1, "beast", { unique: "caramelo", quest: "dogs" }), pack(98, 28, 5, 1, "beast", { unique: "trovao", quest: "dogs" }),
    pack(92, 37, 5, 1, "beast", { unique: "mancha", quest: "dogs" }),
    pack(23, 99, 5, 4, "beast", { unique: "fang" }),
    pack(80, 92, 4, 4, "beast"), pack(104, 104, 5, 4, "beast"), pack(44, 90, 4, 3, "goblin"), pack(64, 24, 5, 4, "beast"),
  ],
  chests: [[14, 60], [112, 18], [76, 112]],
  exits: { s: [60, 127], e: [127, 64] },
  spawn: [64, 66],
  dungeons: [[100, 112]],
  spots: {},
  lair: { at: [92, 32], r: 11, mouth: 131, width: 12, quest: "dogs" },
  border: BORDER,
};

// ---------------------------------------------------------------- Bandit Road

/** The old royal road, paved and wide, runs west to east then turns north; looted carriages line it and
 * tolls block it. A branch east ends at the old Royal Customs House: a palisaded yard with Lula's podium,
 * barred by his barricade until King Aldo sends the hero after him. */
const BANDIT_ROAD: Layout = {
  seed: 0xb4d1,
  dirt: [rect(0, 60, 70, 68), rect(60, 0, 68, 64), rect(64, 61, 96, 67), rect(82, 40, 106, 60), circle(100, 100, 6)],
  roads: [
    { pts: [[0, 64], [64, 64]], w: 5 },
    { pts: [[64, 64], [64, 0]], w: 5 },
    // The royal road turns east to the old Royal Customs House, walled off by Lula's men.
    { pts: [[64, 64], [94, 64], [94, 58]], w: 5 },
    { pts: [[64, 64], [96, 96], [100, 104]], w: 2 },
  ],
  build: [
    // Inside the Alfândega Real: Lula's podium on three overturned carts, his banners, the toll he charges.
    at("podium_carts", 94, 46, { alt: "tree_stump", block: [-2, -1, 1, 0] }),
    at("torn_banner_pole", 89, 45, { alt: "dead_tree", block: [0, 0, 0, 0] }), at("torn_banner_pole", 99, 45, { alt: "dead_tree", block: [0, 0, 0, 0] }),
    at("toll_post", 86, 54, { alt: "fence_h", block: [-1, 0, 1, 0] }), at("toll_post", 102, 54, { alt: "fence_h", block: [-1, 0, 1, 0] }),
    at("looted_carriage", 86, 44, { alt: "tree_stump", block: [-2, -1, 1, 0] }), at("broken_cart", 103, 48, { alt: "tree_stump", block: [-1, 0, 1, 0] }),
    at("rubble_pile", 84, 57, { alt: "stump", block: [0, 0, 0, 0] }), at("cold_campfire", 100, 52, { alt: "campfire" }),
    // Outside: the toll posts and the carriages his men plundered along the road.
    at("toll_post", 40, 60, { alt: "fence_h", block: [-1, 0, 1, 0] }), at("toll_post", 60, 30, { alt: "fence_v", block: [-1, 0, 1, 0] }),
    at("looted_carriage", 20, 70, { alt: "tree_stump", block: [-2, -1, 1, 0] }), at("looted_carriage", 50, 58, { alt: "tree_stump", block: [-2, -1, 1, 0] }),
    at("looted_carriage", 70, 40, { alt: "tree_stump", block: [-2, -1, 1, 0] }), at("broken_cart", 30, 58, { alt: "tree_stump", block: [-1, 0, 1, 0] }),
    at("broken_cart", 58, 14, { alt: "tree_stump", block: [-1, 0, 1, 0] }), at("broken_cart", 78, 68, { alt: "tree_stump", block: [-1, 0, 1, 0] }),
    // The old royal road, paved (worn, cracked and missing stones).
    ...paved([[3, 62, 66, 66], [62, 3, 66, 61], [66, 62, 96, 66]]),
    at("crow", 52, 60), at("crow", 90, 68),
  ],
  woods: [{ shape: rect(3, 3, 124, 124), density: 0.1, trees: DEAD_WOODS }],
  scatter: [
    { shape: rect(10, 70, 58, 100), density: 0.12, items: FIELDS },
    { shape: rect(3, 3, 124, 124), density: 0.015, items: RUBBLE },
  ],
  packs: [
    pack(94, 51, 5, 5, "bandit", { unique: "polvo" }),
    pack(30, 50, 4, 4, "bandit"), pack(30, 80, 4, 4, "bandit"), pack(84, 90, 5, 4, "bandit"), pack(112, 96, 5, 4, "bandit"),
    pack(84, 18, 5, 4, "bandit"), pack(46, 30, 5, 3, "goblin"), pack(110, 70, 5, 3, "goblin"),
  ],
  chests: [[16, 84], [108, 16], [90, 74], [40, 20], [104, 42]],
  exits: { w: [0, 64], n: [64, 0] },
  spawn: [60, 70],
  portal: [58, 70],
  dungeons: [[98, 108]],
  spots: {},
  arena: { rect: [82, 40, 106, 60], side: "s", from: 92, to: 96, stage: [94, 47], quest: "polvo" },
  border: BORDER,
};

// ---------------------------------------------------------------- Goblin King's Hollow

/** A circular mud clearing fenced by stakes with boar skulls; Grumm's junk throne at its north edge, trash
 * fires burning around it, goblin camps in the woods outside. */
const GOBLIN_HOLLOW: Layout = {
  seed: 0x9a77,
  dirt: [circle(64, 60, 20)],
  roads: [
    { pts: [[64, 127], [64, 80]] },
    { pts: [[0, 64], [44, 62]] },
    { pts: [[64, 40], [64, 0]] },
  ],
  build: [
    at("junk_throne", 64, 46, { alt: "tree_stump", block: [-2, -2, 1, -1] }),
    // The ring of skull stakes, open where the three trails come in.
    ...Array.from({ length: 28 }, (_, i) => i * (Math.PI * 2 / 28))
      .filter((a) => Math.abs(Math.sin(a)) < 0.92 && !(Math.abs(Math.cos(a) + 1) < 0.1))
      .map((a) => at("skull_stake", Math.round(64 + Math.cos(a) * 21), Math.round(60 + Math.sin(a) * 20), { alt: "dead_tree", block: [0, 0, 0, 0] })),
    at("trash_fire", 52, 56, { alt: "campfire", block: [0, 0, 1, 0] }), at("trash_fire", 76, 56, { alt: "campfire", block: [0, 0, 1, 0] }), at("trash_fire", 64, 70, { alt: "campfire", block: [0, 0, 1, 0] }),
    ...goblinCamp(28, 28), ...goblinCamp(100, 28), ...goblinCamp(100, 100),
  ],
  woods: [{ shape: rect(3, 3, 124, 124), density: 0.12, trees: DEAD_WOODS }],
  scatter: [{ shape: circle(64, 60, 19), density: 0.03, items: RUBBLE }],
  packs: [
    pack(64, 52, 7, 6, "goblin", { unique: "grumm" }),
    pack(28, 31, 6, 5, "goblin"), pack(100, 31, 6, 5, "goblin"), pack(100, 103, 6, 5, "goblin"), pack(30, 100, 6, 4, "beast"),
    pack(44, 84, 6, 4, "goblin", { champion: true }), pack(84, 84, 6, 4, "goblin"),
  ],
  chests: [[16, 16], [112, 64], [20, 112]],
  exits: { s: [64, 127], w: [0, 64], n: [64, 0] },
  spawn: [64, 84],
  portal: [70, 86],
  dungeons: [],
  spots: {},
  border: BORDER,
};

export const LAYOUTS: Partial<Record<AreaId, Layout>> = {
  minhau: MINHAU, goblin_woods: GOBLIN_WOODS, wolf_wood: WOLF_WOOD, bandit_road: BANDIT_ROAD, goblin_hollow: GOBLIN_HOLLOW,
};
export type { Pt };
