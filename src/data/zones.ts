import type { EnemyType, UniqueId } from "./enemies";

export type ZoneId = "forest" | "swamp" | "peaks";
export type CampKind = "goblin" | "bandit" | "undead" | "spider";

export interface ZoneDef {
  id: ZoneId;
  name: string;
  subtitle: string;
  /** Monster levels added on top of the distance-based level. */
  levelBase: number;
  /** Textures recoloured at boot (see game/recolor.ts); "" = the original Farm RPG art. */
  skin: "" | "swamp" | "snow";
  dirt: string; // ground texture key
  camps: { kind: CampKind; weight: number }[];
  /** Story bosses living in this zone's farthest camps. */
  uniques: { id: UniqueId; camp: CampKind }[];
  dungeons: { name: string; boss: UniqueId; enemies: EnemyType[] }[];
  /** Story quest index that unlocks travel here. */
  unlockAt: number;
  hasVillage: boolean;
  ambient?: number; // vignette tint
}

export const ZONES: Record<ZoneId, ZoneDef> = {
  forest: {
    id: "forest", name: "Floresta de Minhau", subtitle: "Ato I", levelBase: 0, skin: "", dirt: "dirt",
    camps: [{ kind: "goblin", weight: 6 }, { kind: "bandit", weight: 3 }],
    uniques: [{ id: "grumm", camp: "goblin" }, { id: "krag", camp: "bandit" }],
    dungeons: [
      { name: "Casa Abandonada", boss: "queen", enemies: ["spider", "goblin"] },
      { name: "Porão do Açougueiro", boss: "butcher", enemies: ["bandit", "goblin"] },
    ],
    unlockAt: 0, hasVillage: true,
  },
  swamp: {
    id: "swamp", name: "Pântano Sombrio", subtitle: "Ato II", levelBase: 8, skin: "swamp", dirt: "mud",
    camps: [{ kind: "undead", weight: 5 }, { kind: "goblin", weight: 3 }, { kind: "bandit", weight: 1 }],
    uniques: [{ id: "gorlak", camp: "goblin" }],
    dungeons: [
      { name: "Cripta Afundada", boss: "knight", enemies: ["skeleton", "spider"] },
      { name: "Toca da Rainha", boss: "queen", enemies: ["spider"] },
    ],
    unlockAt: 5, hasVillage: false, ambient: 0x1a3020,
  },
  peaks: {
    id: "peaks", name: "Picos Gelados", subtitle: "Ato III", levelBase: 13, skin: "snow", dirt: "rock",
    camps: [{ kind: "undead", weight: 5 }, { kind: "bandit", weight: 2 }],
    uniques: [{ id: "malakar", camp: "undead" }],
    dungeons: [
      { name: "Catacumbas de Gelo", boss: "knight", enemies: ["skeleton"] },
      { name: "Fortaleza Saqueada", boss: "butcher", enemies: ["bandit", "skeleton"] },
    ],
    unlockAt: 7, hasVillage: false, ambient: 0x202a40,
  },
};

export const ZONE_ORDER: ZoneId[] = ["forest", "swamp", "peaks"];
