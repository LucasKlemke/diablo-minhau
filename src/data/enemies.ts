import { L } from "../i18n";
import type { SpriteName } from "../kiln";

export type EnemyType = "goblin" | "bandit" | "brute" | "skeleton" | "spider" | "troll" | "lich"
  // Act I
  | "wolf" | "alpha" | "boar" | "wasp" | "slime" | "slime_small" | "worg_rider" | "ent" | "mimic"
  // Act II
  | "zombie" | "ghoul" | "lizardman" | "leech" | "wisp" | "cultist"
  // Act III
  | "orc" | "hobgoblin" | "shadow_wolf" | "armor" | "ghost" | "gargoyle"
  // dungeons
  | "bat" | "ant" | "beetle" | "centipede" | "gel_cube" | "kobold"
  // boss-only bodies
  | "manticore" | "dragon";
export type EnemyRank = "normal" | "champion" | "boss";
export type Faction = "goblin" | "bandit" | "undead" | "spider" | "beast" | "swamp" | "neutral";

/** Special behaviour of a monster type (each one handled in GameScene). */
export interface EnemyTraits {
  /** Pack hunter: +this damage for every other pack hunter close to the same target (max 3). */
  pack?: number;
  /** Pack leader: howls when it sees the hero (its pack runs faster); when it dies the pack flees. */
  leader?: boolean;
  /** Hits poison: `frac` of the hit's damage again every second for `ms`. */
  poison?: { frac: number; ms: number };
  /** Hits may stun the hero. */
  stun?: { ms: number; chance: number };
  /** Hits may slow the hero (spider web). */
  slow?: { mult: number; ms: number; chance: number };
  /** Heals this fraction of the damage it deals. */
  drain?: number;
  /** Splits into smaller monsters on death. */
  split?: { type: EnemyType; count: number };
  /** Lies in wait until a player comes within `range`: `hidden` = invisible (buried, under the mud),
   * `immune` = can't be hurt while asleep (stone gargoyle); otherwise it looks like scenery (a tree). */
  ambush?: { range: number; hidden?: boolean; immune?: boolean };
  /** Fraction of physical damage ignored (magic goes through). */
  physRes?: number;
  /** Flies through walls and trees. */
  noClip?: boolean;
  /** Alpha while not attacking (hard to see). */
  stealth?: number;
  /** Life regenerated per second (fraction of max life); fire stops it for a few seconds. */
  regen?: number;
  /** Keeps this distance from its target while its attack recharges. */
  kite?: number;
  /** Its attack is a self-destruct burst. */
  explode?: { radius: number; mult: number };
  /** Allies of the same faction within `radius` deal `mult` more damage. */
  aura?: { radius: number; mult: number };
  /** Extra items dropped. */
  loot?: number;
}

/** Ability shared by bosses and some ordinary monsters. `trap` = a hidden snare on the ground. */
export type MobAbility = BossAbility | { kind: "trap"; cooldown: number; mult: number };

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
  /** Sprite scale (1 by default), e.g. the small slimes. */
  scale?: number;
  /** Tint of every monster of this type (variants that reuse another sprite). */
  tint?: number;
  /** Alpha of the sprite (ghosts). */
  alpha?: number;
  /** Projectile colour of ranged attacks. */
  boltTint?: number;
  traits?: EnemyTraits;
  /** Abilities on a cooldown, used by ordinary monsters too (the boar's charge, the kobold's traps). */
  abilities?: MobAbility[];
}

export const ENEMIES: Record<EnemyType, EnemyDef> = {
  goblin: {
    name: (l) => (l < 3 ? "Goblin" : l < 6 ? L("Goblin Saqueador", "Goblin Raider") : l < 10 ? L("Goblin Selvagem", "Feral Goblin") : L("Goblin Sanguinário", "Bloodthirsty Goblin")),
    sprite: "goblin", hurt: "goblin_hurt", maimed: "goblin_maimed",
    hp: [18, 11], dmgMin: [1, 1.2], dmgMax: [3, 1.9], speed: 55, reach: 17, hitRange: 26, cooldown: 1350,
    xp: [8, 5], flinch: 0.6, aggro: 115, body: 5, height: 22, faction: "goblin",
  },
  bandit: {
    name: (l) => (l < 4 ? L("Bandido", "Bandit") : l < 8 ? L("Bandido Cruel", "Vicious Bandit") : L("Bandido Veterano", "Veteran Bandit")),
    sprite: "bandit",
    hp: [30, 13], dmgMin: [2, 1.4], dmgMax: [4, 2.2], speed: 64, reach: 18, hitRange: 28, cooldown: 1100,
    xp: [12, 6], flinch: 0.45, aggro: 130, body: 5, height: 30, faction: "bandit",
  },
  skeleton: {
    name: (l) => (l < 10 ? L("Esqueleto", "Skeleton") : l < 18 ? L("Esqueleto Guerreiro", "Skeleton Warrior") : L("Esqueleto Ancião", "Ancient Skeleton")),
    sprite: "skeleton",
    hp: [26, 12], dmgMin: [2, 1.4], dmgMax: [4, 2.1], speed: 50, reach: 18, hitRange: 28, cooldown: 1250,
    xp: [11, 6], flinch: 0.4, aggro: 125, body: 5, height: 30, faction: "undead",
  },
  spider: {
    name: (l) => (l < 10 ? L("Aranha das Cavernas", "Cave Spider") : L("Aranha Venenosa", "Venomous Spider")),
    sprite: "spider",
    hp: [16, 9], dmgMin: [2, 1.2], dmgMax: [3, 1.8], speed: 78, reach: 16, hitRange: 24, cooldown: 900,
    xp: [7, 4], flinch: 0.5, aggro: 140, body: 5, height: 14, faction: "spider",
    traits: { poison: { frac: 0.15, ms: 2500 }, slow: { mult: 0.6, ms: 1500, chance: 0.2 } },
  },
  troll: {
    name: () => L("Troll do Pântano", "Swamp Troll"),
    sprite: "troll",
    hp: [140, 40], dmgMin: [8, 3.2], dmgMax: [14, 4.5], speed: 40, reach: 30, hitRange: 46, cooldown: 2300,
    xp: [60, 20], flinch: 0.05, aggro: 150, body: 10, height: 62, faction: "goblin", traits: { regen: 0.015 },
  },
  lich: {
    name: () => "Lich",
    sprite: "lich",
    hp: [110, 32], dmgMin: [6, 2.6], dmgMax: [10, 3.6], speed: 46, reach: 150, hitRange: 0, cooldown: 1700,
    xp: [60, 20], flinch: 0.05, aggro: 200, body: 6, height: 44, faction: "undead",
  },
  brute: {
    name: (l) => (l < 6 ? L("Bandido Bruto", "Bandit Brute") : L("Bruto Esmaga-Ossos", "Bonecrusher Brute")),
    sprite: "bandit_brute",
    hp: [90, 30], dmgMin: [5, 2.6], dmgMax: [9, 4], speed: 44, reach: 24, hitRange: 36, cooldown: 2100,
    xp: [35, 14], flinch: 0.1, aggro: 120, body: 7, height: 42, faction: "bandit",
  },

  // ---------------------------------------------------------------- Act I: Minhau Forest
  wolf: {
    name: (l) => (l < 6 ? L("Lobo Cinzento", "Grey Wolf") : L("Lobo Faminto", "Starving Wolf")),
    sprite: "wolf",
    hp: [14, 9], dmgMin: [1, 1.1], dmgMax: [3, 1.7], speed: 82, reach: 16, hitRange: 24, cooldown: 1000,
    xp: [8, 4], flinch: 0.55, aggro: 160, body: 5, height: 16, faction: "beast", traits: { pack: 0.25 },
  },
  alpha: {
    name: () => L("Lobo Alfa", "Alpha Wolf"),
    sprite: "wolf", scale: 1.3, tint: 0xd8c8b0,
    hp: [40, 16], dmgMin: [3, 1.6], dmgMax: [6, 2.4], speed: 80, reach: 18, hitRange: 28, cooldown: 1200,
    xp: [25, 10], flinch: 0.3, aggro: 170, body: 6, height: 20, faction: "beast", traits: { pack: 0.25, leader: true },
  },
  boar: {
    name: (l) => (l < 6 ? L("Javali Selvagem", "Wild Boar") : L("Javali Furioso", "Raging Boar")),
    sprite: "boar",
    hp: [34, 14], dmgMin: [3, 1.5], dmgMax: [6, 2.2], speed: 50, reach: 18, hitRange: 26, cooldown: 1600,
    xp: [14, 6], flinch: 0.3, aggro: 130, body: 6, height: 18, faction: "beast",
    abilities: [{ kind: "charge", cooldown: 6000, mult: 1.4 }],
  },
  wasp: {
    name: () => L("Vespa Gigante", "Giant Wasp"),
    sprite: "wasp",
    hp: [10, 6], dmgMin: [1, 0.8], dmgMax: [2, 1.2], speed: 95, reach: 14, hitRange: 22, cooldown: 800,
    xp: [6, 3], flinch: 0.7, aggro: 150, body: 4, height: 12, faction: "beast", traits: { poison: { frac: 0.3, ms: 3000 } },
  },
  slime: {
    name: () => L("Gosma", "Slime"),
    sprite: "slime",
    hp: [24, 10], dmgMin: [1, 1.0], dmgMax: [3, 1.5], speed: 38, reach: 15, hitRange: 22, cooldown: 1400,
    xp: [7, 4], flinch: 0.6, aggro: 100, body: 6, height: 12, faction: "neutral", traits: { split: { type: "slime_small", count: 2 } },
  },
  slime_small: {
    name: () => L("Gosminha", "Small Slime"),
    sprite: "slime", scale: 0.65,
    hp: [9, 4], dmgMin: [1, 0.5], dmgMax: [2, 0.8], speed: 52, reach: 12, hitRange: 18, cooldown: 1100,
    xp: [3, 1.5], flinch: 0.8, aggro: 140, body: 4, height: 8, faction: "neutral",
  },
  worg_rider: {
    name: () => L("Cavaleiro de Worg", "Worg Rider"),
    sprite: "worg_rider",
    hp: [44, 16], dmgMin: [3, 1.6], dmgMax: [6, 2.4], speed: 84, reach: 20, hitRange: 30, cooldown: 1250,
    xp: [20, 8], flinch: 0.3, aggro: 160, body: 7, height: 30, faction: "goblin",
  },
  ent: {
    name: () => L("Ent Jovem", "Young Ent"),
    sprite: "ent",
    hp: [70, 22], dmgMin: [4, 2.0], dmgMax: [8, 2.8], speed: 34, reach: 22, hitRange: 34, cooldown: 1900,
    xp: [26, 10], flinch: 0.1, aggro: 120, body: 7, height: 34, faction: "beast", traits: { ambush: { range: 45 } },
  },
  mimic: {
    name: () => L("Mímico", "Mimic"),
    sprite: "mimic",
    hp: [60, 20], dmgMin: [4, 2.0], dmgMax: [8, 3.0], speed: 60, reach: 18, hitRange: 28, cooldown: 1300,
    xp: [30, 12], flinch: 0.2, aggro: 400, body: 7, height: 18, faction: "neutral",
  },

  // ---------------------------------------------------------------- Act II: Shadow Swamp
  zombie: {
    name: (l) => (l < 12 ? L("Zumbi", "Zombie") : L("Zumbi Inchado", "Bloated Zombie")),
    sprite: "zombie",
    hp: [48, 16], dmgMin: [3, 1.5], dmgMax: [6, 2.2], speed: 34, reach: 18, hitRange: 26, cooldown: 1700,
    xp: [13, 6], flinch: 0.15, aggro: 110, body: 6, height: 30, faction: "undead",
  },
  ghoul: {
    name: () => L("Carniçal", "Ghoul"),
    sprite: "ghoul",
    hp: [30, 12], dmgMin: [3, 1.6], dmgMax: [5, 2.2], speed: 76, reach: 17, hitRange: 26, cooldown: 1100,
    xp: [14, 6], flinch: 0.4, aggro: 140, body: 5, height: 28, faction: "undead", traits: { stun: { ms: 600, chance: 0.3 } },
  },
  lizardman: {
    name: () => L("Homem-Lagarto", "Lizardman"),
    sprite: "lizardman", boltTint: 0xd8e05a,
    hp: [36, 14], dmgMin: [3, 1.6], dmgMax: [6, 2.3], speed: 60, reach: 26, hitRange: 36, cooldown: 1300,
    xp: [15, 7], flinch: 0.35, aggro: 140, body: 5, height: 32, faction: "swamp",
    abilities: [{ kind: "bolts", cooldown: 5000, count: 1, mult: 0.8 }],
  },
  leech: {
    name: () => L("Sanguessuga Gigante", "Giant Leech"),
    sprite: "leech",
    hp: [32, 12], dmgMin: [2, 1.3], dmgMax: [4, 1.9], speed: 44, reach: 15, hitRange: 22, cooldown: 1100,
    xp: [12, 6], flinch: 0.4, aggro: 120, body: 5, height: 10, faction: "swamp",
    traits: { ambush: { range: 40, hidden: true }, drain: 0.6 },
  },
  wisp: {
    name: () => L("Fogo-Fátuo", "Will-o'-Wisp"),
    sprite: "wisp", alpha: 0.9,
    hp: [14, 7], dmgMin: [4, 2.0], dmgMax: [7, 2.8], speed: 70, reach: 16, hitRange: 30, cooldown: 2600,
    xp: [12, 5], flinch: 0.2, aggro: 170, body: 4, height: 12, faction: "swamp",
    traits: { kite: 70, explode: { radius: 34, mult: 1.6 }, noClip: true },
  },
  cultist: {
    name: (l) => (l < 12 ? L("Cultista", "Cultist") : L("Cultista Fanático", "Zealot Cultist")),
    sprite: "cultist",
    hp: [24, 10], dmgMin: [3, 1.6], dmgMax: [6, 2.4], speed: 50, reach: 140, hitRange: 0, cooldown: 1800,
    xp: [15, 7], flinch: 0.5, aggro: 180, body: 5, height: 30, faction: "bandit",
  },

  // ---------------------------------------------------------------- Act III: Frozen Peaks
  orc: {
    name: (l) => (l < 18 ? "Orc" : L("Orc Chefe de Guerra", "Orc Warlord")),
    sprite: "orc",
    hp: [70, 22], dmgMin: [5, 2.2], dmgMax: [9, 3.2], speed: 52, reach: 20, hitRange: 30, cooldown: 1500,
    xp: [22, 9], flinch: 0.2, aggro: 140, body: 6, height: 36, faction: "goblin",
  },
  hobgoblin: {
    name: () => "Hobgoblin",
    sprite: "hobgoblin",
    hp: [55, 18], dmgMin: [4, 2.0], dmgMax: [7, 2.8], speed: 58, reach: 22, hitRange: 32, cooldown: 1300,
    xp: [20, 8], flinch: 0.25, aggro: 150, body: 5, height: 32, faction: "goblin", traits: { aura: { radius: 90, mult: 0.3 } },
  },
  shadow_wolf: {
    name: () => L("Lobo Sombrio", "Shadow Wolf"),
    sprite: "wolf", tint: 0x6a5a8a,
    hp: [30, 12], dmgMin: [3, 1.6], dmgMax: [5, 2.3], speed: 86, reach: 16, hitRange: 24, cooldown: 1000,
    xp: [16, 7], flinch: 0.45, aggro: 150, body: 5, height: 16, faction: "beast", traits: { pack: 0.2, stealth: 0.25 },
  },
  armor: {
    name: () => L("Armadura Animada", "Animated Armor"),
    sprite: "armor",
    hp: [90, 26], dmgMin: [6, 2.4], dmgMax: [10, 3.4], speed: 36, reach: 22, hitRange: 34, cooldown: 1900,
    xp: [28, 11], flinch: 0.05, aggro: 120, body: 7, height: 36, faction: "undead", traits: { physRes: 0.5 },
  },
  ghost: {
    name: () => L("Fantasma", "Ghost"),
    sprite: "ghost", alpha: 0.7,
    hp: [32, 12], dmgMin: [4, 2.0], dmgMax: [7, 2.6], speed: 58, reach: 17, hitRange: 26, cooldown: 1200,
    xp: [18, 8], flinch: 0.3, aggro: 160, body: 5, height: 30, faction: "undead", traits: { physRes: 0.4, noClip: true },
  },
  gargoyle: {
    name: () => L("Gárgula", "Gargoyle"),
    sprite: "gargoyle",
    hp: [60, 20], dmgMin: [5, 2.2], dmgMax: [8, 3.0], speed: 62, reach: 18, hitRange: 28, cooldown: 1300,
    xp: [24, 10], flinch: 0.2, aggro: 150, body: 6, height: 30, faction: "undead",
    traits: { ambush: { range: 55, immune: true }, physRes: 0.25 },
  },

  // ---------------------------------------------------------------- dungeons
  bat: {
    name: () => L("Morcego Gigante", "Giant Bat"),
    sprite: "bat",
    hp: [9, 5], dmgMin: [1, 0.8], dmgMax: [2, 1.2], speed: 100, reach: 14, hitRange: 22, cooldown: 900,
    xp: [5, 2.5], flinch: 0.7, aggro: 170, body: 4, height: 12, faction: "beast",
  },
  ant: {
    name: () => L("Formiga Soldado", "Soldier Ant"),
    sprite: "ant", boltTint: 0x8aff5a,
    hp: [34, 13], dmgMin: [2, 1.4], dmgMax: [4, 2.0], speed: 56, reach: 17, hitRange: 26, cooldown: 1200,
    xp: [12, 6], flinch: 0.3, aggro: 130, body: 5, height: 16, faction: "beast",
  },
  beetle: {
    name: () => L("Besouro Carapaça", "Shell Beetle"),
    sprite: "beetle",
    hp: [50, 18], dmgMin: [3, 1.6], dmgMax: [6, 2.3], speed: 34, reach: 18, hitRange: 28, cooldown: 1700,
    xp: [18, 8], flinch: 0.05, aggro: 110, body: 6, height: 16, faction: "beast", traits: { physRes: 0.65 },
  },
  centipede: {
    name: () => L("Centopeia das Profundezas", "Deep Centipede"),
    sprite: "centipede",
    hp: [38, 14], dmgMin: [3, 1.6], dmgMax: [6, 2.2], speed: 66, reach: 18, hitRange: 28, cooldown: 1150,
    xp: [16, 7], flinch: 0.3, aggro: 140, body: 5, height: 14, faction: "beast",
    traits: { ambush: { range: 50, hidden: true }, poison: { frac: 0.2, ms: 2500 } },
  },
  gel_cube: {
    name: () => L("Cubo Gelatinoso", "Gelatinous Cube"),
    sprite: "slime", scale: 1.7, tint: 0x8ff0e0,
    hp: [80, 24], dmgMin: [4, 2.0], dmgMax: [7, 2.6], speed: 30, reach: 20, hitRange: 30, cooldown: 1800,
    xp: [30, 12], flinch: 0.05, aggro: 90, body: 8, height: 20, faction: "neutral", traits: { stealth: 0.35, loot: 2 },
  },
  kobold: {
    name: () => "Kobold",
    sprite: "kobold",
    hp: [16, 8], dmgMin: [1, 1.0], dmgMax: [3, 1.5], speed: 62, reach: 18, hitRange: 28, cooldown: 1200,
    xp: [7, 4], flinch: 0.6, aggro: 140, body: 4, height: 22, faction: "beast",
    abilities: [{ kind: "trap", cooldown: 7000, mult: 1.3 }],
  },

  // ---------------------------------------------------------------- boss bodies
  manticore: {
    name: () => L("Mantícora", "Manticore"),
    sprite: "manticore", boltTint: 0xf0e0c0,
    hp: [120, 34], dmgMin: [7, 3.0], dmgMax: [12, 4.2], speed: 56, reach: 28, hitRange: 42, cooldown: 1800,
    xp: [60, 20], flinch: 0.05, aggro: 180, body: 10, height: 50, faction: "beast",
  },
  dragon: {
    name: () => L("Dragão Jovem", "Young Dragon"),
    sprite: "dragon", boltTint: 0xff7a1a,
    hp: [160, 44], dmgMin: [9, 3.6], dmgMax: [15, 5.0], speed: 44, reach: 34, hitRange: 52, cooldown: 2200,
    xp: [80, 26], flinch: 0.02, aggro: 200, body: 12, height: 70, faction: "beast",
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
  abilities: MobAbility[];
  /** Their own SpriteKiln model (drawn at `spriteScale`, untinted) instead of the type's, once exported. */
  sprite?: SpriteName;
  spriteScale?: number;
}

/** Named bosses: story bosses in the zones and dungeon bosses. */
export const UNIQUES = {
  // Act I
  grumm: { name: L("Grumm, o Rei dos Catadores", "Grumm, King of Scavengers"), type: "goblin", scale: 1.6, tint: 0xffd36b, hpMult: 11,
    abilities: [{ kind: "shockwave", cooldown: 8000, radius: 90, mult: 1.4 }, { kind: "summon", cooldown: 11000, type: "goblin", count: 3 },
      { kind: "slam", cooldown: 6000, radius: 34, mult: 1.6 }] },
  polvo: { name: L("Lula, o Demagogo do Lamaçal", "Lula, Demagogue of the Mire"), type: "bandit", scale: 1.35, tint: 0x9fd08a, hpMult: 10,
    sprite: "polvo", spriteScale: 1.1,
    abilities: [{ kind: "summon", cooldown: 12000, type: "bandit", count: 3 }, { kind: "bolts", cooldown: 3200, count: 5, mult: 0.9 }] },
  flea: { name: L("A Pulga Demoníaca", "The Demon Flea"), type: "spider", scale: 2.3, tint: 0xa0623a, hpMult: 12,
    abilities: [{ kind: "charge", cooldown: 5000, mult: 1.5 }, { kind: "slam", cooldown: 6500, radius: 40, mult: 2 },
      { kind: "summon", cooldown: 10000, type: "spider", count: 3 }] },
  caramelo: { name: L("Caramelo, o Saltador", "Caramelo the Leaper"), type: "wolf", scale: 1.7, tint: 0xe0a050, hpMult: 6,
    sprite: "dog_caramelo_demon", spriteScale: 1,
    abilities: [{ kind: "charge", cooldown: 4000, mult: 1.4 }] },
  trovao: { name: L("Trovão, o Uivador", "Trovão the Howler"), type: "alpha", scale: 1.6, tint: 0x8a8aa8, hpMult: 6,
    sprite: "dog_trovao_demon", spriteScale: 1,
    abilities: [{ kind: "shockwave", cooldown: 6000, radius: 90, mult: 1.2 }] },
  mancha: { name: L("Mancha, o Mordedor Brutal", "Mancha the Brutal Biter"), type: "alpha", scale: 1.7, tint: 0xd8d0c8, hpMult: 7,
    sprite: "dog_mancha_demon", spriteScale: 1.2,
    abilities: [{ kind: "charge", cooldown: 5000, mult: 1.8 }, { kind: "slam", cooldown: 7000, radius: 32, mult: 1.6 }] },
  gorlak: { name: L("Gorlak, o Troll do Pântano", "Gorlak, the Swamp Troll"), type: "troll", scale: 1, hpMult: 7,
    abilities: [{ kind: "shockwave", cooldown: 7000, radius: 110, mult: 1.8 }, { kind: "slam", cooldown: 4500, radius: 44, mult: 2 },
      { kind: "summon", cooldown: 16000, type: "skeleton", count: 3 }] },
  malakar: { name: L("Malakar, o Lich", "Malakar the Lich"), type: "lich", scale: 1, hpMult: 8,
    abilities: [{ kind: "bolts", cooldown: 2600, count: 5, mult: 1 }, { kind: "nova", cooldown: 7000, count: 5, radius: 30, mult: 1.6 },
      { kind: "summon", cooldown: 12000, type: "skeleton", count: 4 }] },
  queen: { name: L("Aranha Rainha", "Spider Queen"), type: "spider", scale: 2, tint: 0xd08aff, hpMult: 12,
    abilities: [{ kind: "summon", cooldown: 8000, type: "spider", count: 4 }, { kind: "charge", cooldown: 6000, mult: 1.4 }] },
  knight: { name: L("Cavaleiro Esqueleto", "Skeleton Knight"), type: "skeleton", scale: 1.6, tint: 0x9fb8ff, hpMult: 12,
    abilities: [{ kind: "charge", cooldown: 5500, mult: 1.6 }, { kind: "shockwave", cooldown: 8000, radius: 80, mult: 1.4 }] },
  butcher: { name: L("O Açougueiro", "The Butcher"), type: "brute", scale: 1.5, tint: 0xff7070, hpMult: 12,
    abilities: [{ kind: "charge", cooldown: 4500, mult: 1.8 }, { kind: "slam", cooldown: 4000, radius: 42, mult: 2.2 }] },
  // From inimmigos.md
  fang: { name: L("Presa-Negra, o Worg Alfa", "Blackfang, the Alpha Worg"), type: "alpha", scale: 1.9, tint: 0x5a4a4a, hpMult: 9,
    abilities: [{ kind: "charge", cooldown: 6000, mult: 1.6 }, { kind: "summon", cooldown: 12000, type: "wolf", count: 3 }] },
  antqueen: { name: L("Rainha Formiga", "Ant Queen"), type: "ant", scale: 2.1, tint: 0xffc070, hpMult: 12,
    abilities: [{ kind: "summon", cooldown: 9000, type: "ant", count: 3 }, { kind: "bolts", cooldown: 3200, count: 5, mult: 0.9 }] },
  witch: { name: L("Morgana, a Bruxa do Pântano", "Morgana, the Swamp Witch"), type: "cultist", scale: 1.5, tint: 0x9fe07a, hpMult: 10,
    abilities: [{ kind: "bolts", cooldown: 2800, count: 3, mult: 1 }, { kind: "summon", cooldown: 13000, type: "zombie", count: 3 },
      { kind: "slam", cooldown: 6000, radius: 38, mult: 1.8 }] },
  necro: { name: L("Vargas, o Necromante", "Vargas the Necromancer"), type: "cultist", scale: 1.5, tint: 0xb08aff, hpMult: 10,
    abilities: [{ kind: "summon", cooldown: 10000, type: "skeleton", count: 3 }, { kind: "summon", cooldown: 15000, type: "zombie", count: 2 },
      { kind: "shockwave", cooldown: 8000, radius: 100, mult: 1.6 }] },
  ogre: { name: L("Brugo, o Ogro", "Brugo the Ogre"), type: "brute", scale: 1.7, tint: 0xa8c070, hpMult: 11,
    abilities: [{ kind: "slam", cooldown: 4500, radius: 46, mult: 2.2 }, { kind: "charge", cooldown: 6500, mult: 1.7 }] },
  manticore: { name: L("Mantícora", "Manticore"), type: "manticore", scale: 1, hpMult: 9,
    abilities: [{ kind: "bolts", cooldown: 3000, count: 6, mult: 0.9 }, { kind: "charge", cooldown: 6000, mult: 1.8 }] },
  dragon: { name: L("Ignir, o Dragão Jovem", "Ignir the Young Dragon"), type: "dragon", scale: 1, hpMult: 10,
    abilities: [{ kind: "bolts", cooldown: 2600, count: 7, mult: 1.1 }, { kind: "slam", cooldown: 5000, radius: 48, mult: 2.2 },
      { kind: "shockwave", cooldown: 9000, radius: 120, mult: 1.8 }, { kind: "nova", cooldown: 11000, count: 6, radius: 30, mult: 1.6 }] },
} satisfies Record<string, UniqueDef>;
export type UniqueId = keyof typeof UNIQUES;
