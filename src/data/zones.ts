import type { DungeonTheme } from "../world/dungeon";
import { L } from "../i18n";
import type { EnemyType, UniqueId } from "./enemies";

export type ZoneId = "forest" | "swamp" | "peaks";
export type CampKind = "goblin" | "bandit" | "undead" | "spider" | "beast" | "swamp";

/** An act: look of its areas (skin, ground, tint) and the story quest that opens the way into it. */
export interface ZoneDef {
  id: ZoneId;
  name: string;
  subtitle: string;
  /** Textures recoloured at boot (see game/recolor.ts); "" = the original Farm RPG art. */
  skin: "" | "swamp" | "snow" | "blight";
  dirt: string; // ground texture key
  /** Story quests completed (HeroData.tier) needed to walk into this act. */
  unlockAt: number;
  /** The act's village (its first area). */
  village: AreaId;
  ambient?: number; // vignette tint
}

export const ZONES: Record<ZoneId, ZoneDef> = {
  forest: { id: "forest", name: L("Floresta de Minhau", "Minhau Forest"), subtitle: L("Ato I", "Act I"), skin: "blight", dirt: "ash", unlockAt: 0, village: "minhau", ambient: 0x1a1410 },
  swamp: { id: "swamp", name: L("Pântano Sombrio", "Shadow Swamp"), subtitle: L("Ato II", "Act II"), skin: "swamp", dirt: "mud", unlockAt: 7, village: "swamp_camp", ambient: 0x1a3020 },
  peaks: { id: "peaks", name: L("Picos Gelados", "Frozen Peaks"), subtitle: L("Ato III", "Act III"), skin: "snow", dirt: "rock", unlockAt: 9, village: "mountain_fort", ambient: 0x202a40 },
};

export const ZONE_ORDER: ZoneId[] = ["forest", "swamp", "peaks"];

// ---------------------------------------------------------------- areas

export type AreaId =
  | "minhau" | "goblin_woods" | "bandit_road" | "wolf_wood" | "goblin_hollow"
  | "swamp_camp" | "lizard_marsh" | "sunken_ruins" | "gorlak_lair"
  | "mountain_fort" | "frozen_trail" | "ice_graveyard" | "malakar_tower";

/** One map of the world. Areas are joined by roads leading off the map edges (see LINKS). */
export interface AreaDef {
  id: AreaId;
  act: ZoneId;
  name: string;
  /** Monster level near the entrances; it grows a little toward the far side. */
  level: number;
  /** The act's village (houses, NPCs, a checkpoint). */
  village?: boolean;
  /** Has a checkpoint (the old Stone Portal): touch it once to travel there from any other checkpoint. */
  waypoint?: boolean;
  /** Cell on the world map (x to the right, y down); linked areas are neighbours. */
  pos: [number, number];
  camps: { kind: CampKind; weight: number }[];
  /** Monsters of each camp kind (repeat a type to make it more common); wolf packs are added to beast camps
   * of the forest on their own (see GameScene.spawnPack). */
  mix: Partial<Record<CampKind, EnemyType[]>>;
  /** Story bosses living in this area's farthest camps. */
  uniques: { id: UniqueId; camp: CampKind }[];
  /** `theme`: what the place is down there (its tiles, dressing and entrance); a crypt by default. */
  dungeons: { name: string; boss: UniqueId; enemies: EnemyType[]; theme?: DungeonTheme }[];
}

const FOREST_MIX: AreaDef["mix"] = {
  goblin: ["goblin", "goblin", "goblin", "goblin", "goblin", "worg_rider"],
  beast: ["boar", "boar", "wasp", "wasp", "slime", "slime", "ent"],
};
const SWAMP_MIX: AreaDef["mix"] = {
  undead: ["zombie", "zombie", "zombie", "skeleton", "skeleton", "ghoul", "ghoul"],
  goblin: ["goblin", "goblin", "goblin", "worg_rider"],
  bandit: ["bandit", "cultist"],
  swamp: ["lizardman", "lizardman", "lizardman", "leech", "wisp", "wisp"],
};
const PEAKS_MIX: AreaDef["mix"] = {
  undead: ["skeleton", "skeleton", "armor", "ghost", "ghost", "gargoyle"],
  goblin: ["orc", "orc", "goblin", "goblin", "hobgoblin"],
  bandit: ["bandit", "cultist"],
  beast: ["shadow_wolf"],
};

export const AREAS: Record<AreaId, AreaDef> = {
  // Act I
  minhau: { id: "minhau", act: "forest", name: L("Vila de Minhau", "Minhau Village"), level: 1, village: true, waypoint: true, pos: [1, 8],
    camps: [{ kind: "goblin", weight: 1 }], mix: FOREST_MIX, uniques: [], dungeons: [] },
  goblin_woods: { id: "goblin_woods", act: "forest", name: L("Bosque dos Goblins", "Goblin Woods"), level: 2, pos: [1, 7],
    camps: [{ kind: "goblin", weight: 6 }, { kind: "beast", weight: 2 }], mix: FOREST_MIX, uniques: [],
    dungeons: [{ name: L("Casa Abandonada", "Abandoned House"), boss: "flea", enemies: ["spider", "spider", "goblin"], theme: "cellar" }] },
  bandit_road: { id: "bandit_road", act: "forest", name: L("Estrada dos Bandidos", "Bandit Road"), level: 5, waypoint: true, pos: [2, 7],
    camps: [{ kind: "bandit", weight: 5 }, { kind: "goblin", weight: 2 }], mix: FOREST_MIX, uniques: [{ id: "polvo", camp: "bandit" }],
    dungeons: [{ name: L("Porão do Açougueiro", "Butcher's Cellar"), boss: "butcher", enemies: ["bandit", "goblin"], theme: "butcher" }] },
  wolf_wood: { id: "wolf_wood", act: "forest", name: L("Mata dos Lobos", "Wolf Wood"), level: 4, pos: [1, 6],
    camps: [{ kind: "beast", weight: 6 }, { kind: "goblin", weight: 2 }], mix: FOREST_MIX,
    uniques: [{ id: "caramelo", camp: "beast" }, { id: "trovao", camp: "beast" }, { id: "mancha", camp: "beast" }, { id: "fang", camp: "beast" }],
    dungeons: [{ name: L("Caverna dos Morcegos", "Bat Cave"), boss: "ogre", enemies: ["bat", "bat", "kobold", "centipede", "slime"], theme: "cave" }] },
  goblin_hollow: { id: "goblin_hollow", act: "forest", name: L("Clareira do Rei Goblin", "Goblin King's Hollow"), level: 6, waypoint: true, pos: [2, 6],
    camps: [{ kind: "goblin", weight: 6 }, { kind: "beast", weight: 1 }, { kind: "bandit", weight: 1 }], mix: FOREST_MIX,
    uniques: [{ id: "grumm", camp: "goblin" }], dungeons: [] },
  // Act II
  swamp_camp: { id: "swamp_camp", act: "swamp", name: L("Acampamento do Pântano", "Swamp Camp"), level: 8, village: true, waypoint: true, pos: [2, 5],
    camps: [{ kind: "swamp", weight: 1 }], mix: SWAMP_MIX, uniques: [], dungeons: [] },
  lizard_marsh: { id: "lizard_marsh", act: "swamp", name: L("Brejo dos Lagartos", "Lizard Marsh"), level: 9, pos: [2, 4],
    camps: [{ kind: "swamp", weight: 6 }, { kind: "undead", weight: 2 }], mix: SWAMP_MIX, uniques: [{ id: "witch", camp: "swamp" }],
    dungeons: [{ name: L("Toca da Rainha", "Queen's Lair"), boss: "queen", enemies: ["spider"] }] },
  sunken_ruins: { id: "sunken_ruins", act: "swamp", name: L("Ruínas Afundadas", "Sunken Ruins"), level: 10, waypoint: true, pos: [3, 4],
    camps: [{ kind: "undead", weight: 6 }, { kind: "bandit", weight: 2 }, { kind: "swamp", weight: 2 }], mix: SWAMP_MIX,
    uniques: [{ id: "necro", camp: "undead" }],
    dungeons: [{ name: L("Cripta Afundada", "Sunken Crypt"), boss: "knight", enemies: ["skeleton", "zombie", "spider"] }] },
  gorlak_lair: { id: "gorlak_lair", act: "swamp", name: L("Covil de Gorlak", "Gorlak's Lair"), level: 12, waypoint: true, pos: [3, 3],
    camps: [{ kind: "goblin", weight: 4 }, { kind: "undead", weight: 3 }, { kind: "swamp", weight: 2 }], mix: SWAMP_MIX,
    uniques: [{ id: "gorlak", camp: "goblin" }],
    dungeons: [{ name: L("Formigueiro", "Anthill"), boss: "antqueen", enemies: ["ant", "ant", "ant", "beetle", "centipede"] }] },
  // Act III
  mountain_fort: { id: "mountain_fort", act: "peaks", name: L("Forte da Montanha", "Mountain Fort"), level: 13, village: true, waypoint: true, pos: [3, 2],
    camps: [{ kind: "beast", weight: 1 }], mix: PEAKS_MIX, uniques: [], dungeons: [] },
  frozen_trail: { id: "frozen_trail", act: "peaks", name: L("Trilha Congelada", "Frozen Trail"), level: 14, waypoint: true, pos: [2, 2],
    camps: [{ kind: "goblin", weight: 5 }, { kind: "beast", weight: 3 }, { kind: "bandit", weight: 2 }], mix: PEAKS_MIX,
    uniques: [{ id: "manticore", camp: "beast" }],
    dungeons: [{ name: L("Fortaleza Saqueada", "Ransacked Fortress"), boss: "butcher", enemies: ["bandit", "skeleton", "orc"] }] },
  ice_graveyard: { id: "ice_graveyard", act: "peaks", name: L("Cemitério de Gelo", "Ice Graveyard"), level: 16, pos: [2, 1],
    camps: [{ kind: "undead", weight: 6 }, { kind: "goblin", weight: 2 }], mix: PEAKS_MIX, uniques: [],
    dungeons: [{ name: L("Catacumbas de Gelo", "Ice Catacombs"), boss: "knight", enemies: ["skeleton", "armor", "ghost", "gel_cube"] }] },
  malakar_tower: { id: "malakar_tower", act: "peaks", name: L("Torre de Malakar", "Malakar's Tower"), level: 18, waypoint: true, pos: [3, 1],
    camps: [{ kind: "undead", weight: 6 }, { kind: "beast", weight: 1 }], mix: PEAKS_MIX, uniques: [{ id: "malakar", camp: "undead" }],
    dungeons: [{ name: L("Covil do Dragão", "Dragon's Lair"), boss: "dragon", enemies: ["kobold", "kobold", "gargoyle", "beetle", "bat"] }] },
};

/** Roads between areas. The side of each exit comes from the areas' world map cells. */
export const LINKS: [AreaId, AreaId][] = [
  ["minhau", "goblin_woods"], ["goblin_woods", "bandit_road"], ["goblin_woods", "wolf_wood"], ["bandit_road", "goblin_hollow"],
  ["wolf_wood", "goblin_hollow"], ["goblin_hollow", "swamp_camp"],
  ["swamp_camp", "lizard_marsh"], ["lizard_marsh", "sunken_ruins"], ["sunken_ruins", "gorlak_lair"], ["gorlak_lair", "mountain_fort"],
  ["mountain_fort", "frozen_trail"], ["frozen_trail", "ice_graveyard"], ["ice_graveyard", "malakar_tower"],
];

export type Side = "n" | "s" | "e" | "w";
/** Where a village's three NPCs stand (tiles). */
export type NpcSpots = Record<"leader" | "shop" | "guide", [number, number]>;
export const OPPOSITE: Record<Side, Side> = { n: "s", s: "n", e: "w", w: "e" };

/** Exits of an area: side of the map -> neighbouring area. */
export function exitsOf(id: AreaId): Partial<Record<Side, AreaId>> {
  const out: Partial<Record<Side, AreaId>> = {};
  const [x, y] = AREAS[id].pos;
  for (const [a, b] of LINKS) {
    const other = a === id ? b : b === id ? a : null;
    if (!other) continue;
    const [ox, oy] = AREAS[other].pos;
    out[ox > x ? "e" : ox < x ? "w" : oy > y ? "s" : "n"] = other;
  }
  return out;
}

/** Can the hero walk from one area into another (a new act opens with the story)? */
export const canEnter = (to: AreaId, tier: number) => tier >= ZONES[AREAS[to].act].unlockAt;

/** Shortest way through the linked areas (ignores locks); [from, ..., to]. */
export function routeTo(from: AreaId, to: AreaId): AreaId[] {
  const prev = new Map<AreaId, AreaId | null>([[from, null]]);
  const queue: AreaId[] = [from];
  while (queue.length) {
    const a = queue.shift()!;
    if (a === to) break;
    for (const b of Object.values(exitsOf(a))) if (!prev.has(b)) { prev.set(b, a); queue.push(b); }
  }
  if (!prev.has(to)) return [from];
  const path: AreaId[] = [];
  for (let a: AreaId | null = to; a; a = prev.get(a) ?? null) path.unshift(a);
  return path;
}

/** Area holding a story boss. */
export const areaOfUnique = (id: UniqueId) => (Object.values(AREAS).find((a) => a.uniques.some((u) => u.id === id)) ?? null)?.id ?? null;
