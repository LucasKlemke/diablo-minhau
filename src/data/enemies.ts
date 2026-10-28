import type { SpriteName } from "../kiln";

export type EnemyType = "goblin" | "bandit" | "brute" | "skeleton" | "spider" | "troll" | "lich";
export type EnemyRank = "normal" | "champion" | "boss";
export type Faction = "goblin" | "bandit" | "undead" | "spider";

export interface EnemyDef {
  name: (level: number) => string;
  sprite: SpriteName;
  /** Wounded sprite variants (same clips), swapped in as life drops. */
  hurt?: SpriteName;
  maimed?: SpriteName;
  hp: [number, number]; // base, per level
  dmgMin: [number, number];
  dmgMax: [number, number];
  speed: number;
  reach: number; // px from the target where it stops and swings
  hitRange: number; // px the swing actually lands
  cooldown: number; // ms between attacks
  xp: [number, number];
  flinch: number; // chance a hit interrupts it
  aggro: number; // px
  body: number; // physics radius
  height: number; // body height in px (unscaled), used by death effects
  faction: Faction;
}

export const ENEMIES: Record<EnemyType, EnemyDef> = {
  goblin: {
    name: (l) => (l < 3 ? "Goblin" : l < 6 ? "Goblin Saqueador" : l < 10 ? "Goblin Selvagem" : "Goblin Sanguinário"),
    sprite: "goblin", hurt: "goblin_hurt", maimed: "goblin_maimed",
    hp: [18, 11], dmgMin: [1, 1.2], dmgMax: [3, 1.9], speed: 55, reach: 17, hitRange: 26, cooldown: 1350,
    xp: [8, 5], flinch: 0.6, aggro: 115, body: 5, height: 22, faction: "goblin",
  },
  bandit: {
    name: (l) => (l < 4 ? "Bandido" : l < 8 ? "Bandido Cruel" : "Bandido Veterano"),
    sprite: "bandit",
    hp: [30, 13], dmgMin: [2, 1.4], dmgMax: [4, 2.2], speed: 64, reach: 18, hitRange: 28, cooldown: 1100,
    xp: [12, 6], flinch: 0.45, aggro: 130, body: 5, height: 30, faction: "bandit",
  },
  skeleton: {
    name: (l) => (l < 10 ? "Esqueleto" : l < 18 ? "Esqueleto Guerreiro" : "Esqueleto Ancião"),
    sprite: "skeleton",
    hp: [26, 12], dmgMin: [2, 1.4], dmgMax: [4, 2.1], speed: 50, reach: 18, hitRange: 28, cooldown: 1250,
    xp: [11, 6], flinch: 0.4, aggro: 125, body: 5, height: 30, faction: "undead",
  },
  spider: {
    name: (l) => (l < 10 ? "Aranha das Cavernas" : "Aranha Venenosa"),
    sprite: "spider",
    hp: [16, 9], dmgMin: [2, 1.2], dmgMax: [3, 1.8], speed: 78, reach: 16, hitRange: 24, cooldown: 900,
    xp: [7, 4], flinch: 0.5, aggro: 140, body: 5, height: 14, faction: "spider",
  },
  troll: {
    name: () => "Troll do Pântano",
    sprite: "troll",
    hp: [140, 40], dmgMin: [8, 3.2], dmgMax: [14, 4.5], speed: 40, reach: 30, hitRange: 46, cooldown: 2300,
    xp: [60, 20], flinch: 0.05, aggro: 150, body: 10, height: 62, faction: "goblin",
  },
  lich: {
    name: () => "Lich",
    sprite: "lich",
    hp: [110, 32], dmgMin: [6, 2.6], dmgMax: [10, 3.6], speed: 46, reach: 150, hitRange: 0, cooldown: 1700,
    xp: [60, 20], flinch: 0.05, aggro: 200, body: 6, height: 44, faction: "undead",
  },
  brute: {
    name: (l) => (l < 6 ? "Bandido Bruto" : "Bruto Esmaga-Ossos"),
    sprite: "bandit_brute",
    hp: [90, 30], dmgMin: [5, 2.6], dmgMax: [9, 4], speed: 44, reach: 24, hitRange: 36, cooldown: 2100,
    xp: [35, 14], flinch: 0.1, aggro: 120, body: 7, height: 42, faction: "bandit",
  },
};

/** Boss mechanics: each runs on its own cooldown while the boss is fighting. */
export type BossAbility =
  | { kind: "slam"; cooldown: number; radius: number; mult: number } // telegraphed circle on the hero
  | { kind: "shockwave"; cooldown: number; radius: number; mult: number } // expanding ring around the boss
  | { kind: "summon"; cooldown: number; type: EnemyType; count: number }
  | { kind: "bolts"; cooldown: number; count: number; mult: number } // fan of projectiles
  | { kind: "charge"; cooldown: number; mult: number }
  | { kind: "nova"; cooldown: number; count: number; radius: number; mult: number }; // several circles around the hero

export interface UniqueDef {
  name: string;
  type: EnemyType;
  scale: number;
  tint?: number;
  hpMult: number;
  abilities: BossAbility[];
}

/** Named bosses: story bosses in the zones and dungeon bosses. */
export const UNIQUES = {
  grumm: { name: "Grumm, o Rei Goblin", type: "goblin", scale: 1.5, tint: 0xffd36b, hpMult: 10,
    abilities: [{ kind: "summon", cooldown: 11000, type: "goblin", count: 3 }, { kind: "slam", cooldown: 6000, radius: 34, mult: 1.6 }] },
  krag: { name: "Krag, o Esmaga-Crânios", type: "brute", scale: 1.35, tint: 0xffb08a, hpMult: 9,
    abilities: [{ kind: "charge", cooldown: 7000, mult: 1.5 }, { kind: "slam", cooldown: 5000, radius: 40, mult: 2 }] },
  gorlak: { name: "Gorlak, o Troll do Pântano", type: "troll", scale: 1, hpMult: 7,
    abilities: [{ kind: "shockwave", cooldown: 7000, radius: 110, mult: 1.8 }, { kind: "slam", cooldown: 4500, radius: 44, mult: 2 },
      { kind: "summon", cooldown: 16000, type: "skeleton", count: 3 }] },
  malakar: { name: "Malakar, o Lich", type: "lich", scale: 1, hpMult: 8,
    abilities: [{ kind: "bolts", cooldown: 2600, count: 5, mult: 1 }, { kind: "nova", cooldown: 7000, count: 5, radius: 30, mult: 1.6 },
      { kind: "summon", cooldown: 12000, type: "skeleton", count: 4 }] },
  queen: { name: "Aranha Rainha", type: "spider", scale: 2, tint: 0xd08aff, hpMult: 12,
    abilities: [{ kind: "summon", cooldown: 8000, type: "spider", count: 4 }, { kind: "charge", cooldown: 6000, mult: 1.4 }] },
  knight: { name: "Cavaleiro Esqueleto", type: "skeleton", scale: 1.6, tint: 0x9fb8ff, hpMult: 12,
    abilities: [{ kind: "charge", cooldown: 5500, mult: 1.6 }, { kind: "shockwave", cooldown: 8000, radius: 80, mult: 1.4 }] },
  butcher: { name: "O Açougueiro", type: "brute", scale: 1.5, tint: 0xff7070, hpMult: 12,
    abilities: [{ kind: "charge", cooldown: 4500, mult: 1.8 }, { kind: "slam", cooldown: 4000, radius: 42, mult: 2.2 }] },
} satisfies Record<string, UniqueDef>;
export type UniqueId = keyof typeof UNIQUES;
