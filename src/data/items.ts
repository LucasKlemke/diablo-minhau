import { L } from "../i18n";
import type { ClassDef, ClassId } from "./classes";
import { formatStat, type StatKey, type Stats } from "./stats";
import type { IconId } from "../ui/icons";

export type Slot = "weapon" | "helm" | "armor" | "gloves" | "boots" | "ring" | "amulet";
export type Rarity = "normal" | "magic" | "rare" | "epic" | "legendary" | "unique";
export const RARITIES: Rarity[] = ["normal", "magic", "rare", "epic", "legendary", "unique"];

export const SLOTS: Slot[] = ["weapon", "helm", "armor", "gloves", "boots", "ring", "amulet"];
export const SLOT_LABEL: Record<Slot, string> = {
  weapon: L("Arma", "Weapon"), helm: L("Elmo", "Helm"), armor: L("Armadura", "Armor"), gloves: L("Luvas", "Gloves"), boots: L("Botas", "Boots"), ring: L("Anel", "Ring"), amulet: L("Amuleto", "Amulet"),
};
export const RARITY_LABEL: Record<Rarity, string> = {
  normal: L("Comum", "Common"), magic: L("Mágico", "Magic"), rare: L("Raro", "Rare"), epic: L("Épico", "Epic"), legendary: L("Lendário", "Legendary"), unique: L("Único", "Unique"),
};
export const RARITY_COLOR: Record<Rarity, string> = {
  normal: "#e8e4d8", magic: "#6f8cff", rare: "#ffe14d", epic: "#c06bff", legendary: "#ff8a1f", unique: "#d8a648",
};
/** Affix count range and roll multiplier per rarity. */
const RARITY_ROLL: Record<Exclude<Rarity, "unique" | "normal">, { min: number; max: number; mult: number }> = {
  magic: { min: 1, max: 2, mult: 1 },
  rare: { min: 3, max: 4, mult: 1.1 },
  epic: { min: 4, max: 5, mult: 1.25 },
  legendary: { min: 5, max: 6, mult: 1.45 },
};
/** Rarities that get a light beam and a sound when they drop. */
export const BEAM_RARITIES: Rarity[] = ["epic", "legendary", "unique"];

export interface Affix { k: StatKey; v: number }

export interface Item {
  uid: number;
  name: string;
  base: string;
  slot: Slot;
  rarity: Rarity;
  ilvl: number;
  icon: IconId;
  implicit: Affix[];
  affixes: Affix[];
}

/** A base item: what the item is before its affixes. Bases unlock with the item level (`min`) and each one
 * has its own trade-off (light/heavy weapons, cloth/plate armour, the stone of a ring). */
interface BaseDef {
  name: string;
  icon: IconId;
  min: number; // item level from which it drops
  armor?: [number, number]; // base, per item level
  dmg?: number; // weapon damage multiplier
  implicit?: { k: StatKey; v: (l: number) => number }[];
}
const imp = (k: StatKey, v: number | ((l: number) => number)) => ({ k, v: typeof v === "number" ? () => v : v });

const BASES: Record<Exclude<Slot, "weapon">, BaseDef[]> = {
  helm: [
    { name: L("Capuz de Couro", "Leather Hood"), icon: "hood", min: 1, armor: [2, 0.8], implicit: [imp("maxMana", (l) => 6 + l * 1.5)] },
    { name: L("Elmo de Ferro", "Iron Helm"), icon: "helm", min: 1, armor: [3, 1.2] },
    { name: L("Elmo de Chifres", "Horned Helm"), icon: "horned_helm", min: 6, armor: [4, 1.4], implicit: [imp("maxHp", (l) => 8 + l * 2)] },
    { name: L("Coroa de Osso", "Bone Crown"), icon: "bone_crown", min: 10, armor: [3, 1.1], implicit: [imp("crit", 0.03)] },
    { name: L("Grande Elmo", "Great Helm"), icon: "greathelm", min: 14, armor: [6, 2] },
  ],
  armor: [
    { name: L("Túnica Acolchoada", "Padded Tunic"), icon: "tunic", min: 1, armor: [4, 1.4], implicit: [imp("hpRegen", (l) => 0.5 + l * 0.05)] },
    { name: L("Gibão de Couro", "Leather Jerkin"), icon: "armor", min: 1, armor: [6, 2] },
    { name: L("Cota de Malha", "Chainmail"), icon: "chainmail", min: 6, armor: [9, 2.6] },
    { name: L("Manto Arcano", "Arcane Robe"), icon: "robe", min: 8, armor: [4, 1.4], implicit: [imp("maxMana", (l) => 10 + l * 2), imp("manaRegen", (l) => 1 + l * 0.05)] },
    { name: L("Couraça de Placas", "Plate Cuirass"), icon: "plate", min: 14, armor: [14, 3.6], implicit: [imp("moveSpeed", -0.05)] },
  ],
  gloves: [
    { name: L("Luvas de Couro", "Leather Gloves"), icon: "gloves", min: 1, armor: [2, 0.8] },
    { name: L("Braçadeiras", "Bracers"), icon: "bracers", min: 5, armor: [2, 0.8], implicit: [imp("attackSpeed", 0.05)] },
    { name: L("Garras de Fera", "Beast Claws"), icon: "claws", min: 9, armor: [2, 0.7], implicit: [imp("dmgFlat", (l) => 2 + l * 0.4)] },
    { name: L("Manoplas de Ferro", "Iron Gauntlets"), icon: "gauntlets", min: 13, armor: [5, 1.6] },
  ],
  boots: [
    { name: L("Sandálias", "Sandals"), icon: "sandals", min: 1, armor: [1, 0.3], implicit: [imp("moveSpeed", 0.06)] },
    { name: L("Botas de Couro", "Leather Boots"), icon: "boots", min: 1, armor: [2, 0.8] },
    { name: L("Grevas", "Greaves"), icon: "greaves", min: 8, armor: [5, 1.6] },
    { name: L("Botas do Andarilho", "Wanderer's Boots"), icon: "walker_boots", min: 13, armor: [3, 1.1], implicit: [imp("moveSpeed", 0.08), imp("maxHp", (l) => 6 + l * 2)] },
  ],
  ring: [
    { name: L("Anel de Cobre", "Copper Ring"), icon: "ring_copper", min: 1 },
    { name: L("Anel de Prata", "Silver Ring"), icon: "ring_silver", min: 3, implicit: [imp("maxMana", (l) => 4 + l)] },
    { name: L("Anel de Ouro", "Gold Ring"), icon: "ring", min: 6, implicit: [imp("dmgFlat", (l) => 1 + l * 0.3)] },
    { name: L("Anel de Osso", "Bone Ring"), icon: "ring_bone", min: 8, implicit: [imp("lifeSteal", 0.015)] },
    { name: L("Anel de Rubi", "Ruby Ring"), icon: "ring_ruby", min: 11, implicit: [imp("maxHp", (l) => 10 + l * 2)] },
    { name: L("Anel de Safira", "Sapphire Ring"), icon: "ring_sapphire", min: 11, implicit: [imp("maxMana", (l) => 8 + l * 2), imp("manaRegen", 0.5)] },
    { name: L("Anel de Esmeralda", "Emerald Ring"), icon: "ring_emerald", min: 14, implicit: [imp("crit", 0.03)] },
  ],
  amulet: [
    { name: L("Pingente de Dente", "Tooth Pendant"), icon: "amulet_tooth", min: 1, implicit: [imp("dmgFlat", (l) => 1 + l * 0.3)] },
    { name: L("Talismã de Prata", "Silver Talisman"), icon: "amulet_silver", min: 5, implicit: [imp("maxMana", (l) => 6 + l * 1.5)] },
    { name: L("Relicário", "Locket"), icon: "amulet", min: 9, implicit: [imp("maxHp", (l) => 10 + l * 2.5)] },
    { name: L("Olho de Gato", "Cat's Eye"), icon: "amulet_cateye", min: 13, implicit: [imp("crit", 0.04)] },
  ],
};

/** Weapons per class: light and fast, the standard one, heavy and slow, and an elite base. */
const WEAPONS: Record<ClassId, BaseDef[]> = {
  barbarian: [
    { name: L("Machadinha", "Hatchet"), icon: "hatchet", min: 1, dmg: 0.85, implicit: [imp("attackSpeed", 0.1)] },
    { name: L("Machado de Guerra", "War Axe"), icon: "axe", min: 1, dmg: 1 },
    { name: L("Machado Duplo", "Double Axe"), icon: "double_axe", min: 7, dmg: 1.35, implicit: [imp("attackSpeed", -0.1)] },
    { name: L("Machado do Carrasco", "Executioner's Axe"), icon: "executioner", min: 14, dmg: 1.45, implicit: [imp("crit", 0.03)] },
  ],
  archer: [
    { name: L("Arco Curto", "Short Bow"), icon: "shortbow", min: 1, dmg: 0.85, implicit: [imp("attackSpeed", 0.1)] },
    { name: L("Arco Longo", "Long Bow"), icon: "bow", min: 1, dmg: 1 },
    { name: L("Arco Composto", "Composite Bow"), icon: "compbow", min: 7, dmg: 1.2 },
    { name: L("Arco de Chifre de Dragão", "Dragonhorn Bow"), icon: "dragonbow", min: 14, dmg: 1.35, implicit: [imp("attackSpeed", 0.05)] },
  ],
  mage: [
    { name: L("Cajado de Carvalho", "Oak Staff"), icon: "oakstaff", min: 1, dmg: 0.9, implicit: [imp("maxMana", (l) => 6 + l)] },
    { name: L("Cajado de Cristal", "Crystal Staff"), icon: "staff", min: 1, dmg: 1, implicit: [imp("manaRegen", 0.5)] },
    { name: L("Bastão Rúnico", "Rune Staff"), icon: "runestaff", min: 7, dmg: 1.25 },
    { name: L("Cajado do Arquimago", "Archmage's Staff"), icon: "archstaff", min: 14, dmg: 1.4, implicit: [imp("maxMana", (l) => 15 + l * 2)] },
  ],
  sorcerer: [
    { name: L("Varinha de Osso", "Bone Wand"), icon: "bonewand", min: 1, dmg: 0.9, implicit: [imp("lifeSteal", 0.01)] },
    { name: L("Varinha de Ébano", "Ebony Wand"), icon: "wand", min: 1, dmg: 1 },
    { name: L("Cetro Sombrio", "Shadow Scepter"), icon: "scepter", min: 7, dmg: 1.3, implicit: [imp("attackSpeed", -0.05)] },
    { name: L("Varinha da Lua", "Moon Wand"), icon: "moonwand", min: 14, dmg: 1.35, implicit: [imp("crit", 0.04)] },
  ],
};

/** Picks a base the item level allows, favouring the newest unlocked ones. */
function pickBase(list: BaseDef[], ilvl: number): BaseDef {
  const ok = list.filter((b) => b.min <= ilvl);
  const w = ok.map((b) => 1 + b.min / 6);
  let r = Math.random() * w.reduce((a, x) => a + x, 0);
  for (let i = 0; i < ok.length; i++) if ((r -= w[i]) < 0) return ok[i];
  return ok[0];
}

const findBase = (icon: IconId) =>
  [...Object.values(BASES).flat(), ...Object.values(WEAPONS).flat()].find((b) => b.icon === icon)!;

interface AffixDef { k: StatKey; slots: Slot[]; min: (l: number) => number; max: (l: number) => number; suffix: string }

const AFFIXES: AffixDef[] = [
  { k: "dmgFlat", slots: ["weapon", "ring", "amulet", "gloves"], min: (l) => 1 + l * 0.6, max: (l) => 3 + l * 1.2, suffix: L("da Força", "of Strength") },
  { k: "dmgPct", slots: ["weapon", "amulet"], min: (l) => 0.05 + l * 0.01, max: (l) => 0.15 + l * 0.02, suffix: L("do Massacre", "of Slaughter") },
  { k: "maxHp", slots: ["helm", "armor", "gloves", "boots", "ring", "amulet"], min: (l) => 5 + l * 3, max: (l) => 12 + l * 5, suffix: L("da Baleia", "of the Whale") },
  { k: "maxMana", slots: ["weapon", "helm", "ring", "amulet"], min: (l) => 4 + l * 2, max: (l) => 10 + l * 3, suffix: L("do Sábio", "of the Sage") },
  { k: "armor", slots: ["helm", "armor", "gloves", "boots"], min: (l) => 2 + l, max: (l) => 5 + l * 2.5, suffix: L("da Muralha", "of the Bulwark") },
  { k: "attackSpeed", slots: ["weapon", "gloves", "ring"], min: () => 0.04, max: () => 0.12, suffix: L("da Rapidez", "of Swiftness") },
  { k: "moveSpeed", slots: ["boots"], min: () => 0.05, max: () => 0.15, suffix: L("do Vento", "of the Wind") },
  { k: "crit", slots: ["weapon", "ring", "amulet", "gloves", "helm"], min: () => 0.02, max: () => 0.06, suffix: L("da Precisão", "of Precision") },
  { k: "lifeSteal", slots: ["weapon", "ring", "amulet"], min: () => 0.01, max: () => 0.04, suffix: L("do Vampiro", "of the Vampire") },
  { k: "hpRegen", slots: ["armor", "helm", "ring", "amulet"], min: (l) => 0.3 + l * 0.1, max: (l) => 1 + l * 0.2, suffix: L("da Regeneração", "of Regeneration") },
  { k: "manaRegen", slots: ["weapon", "helm", "ring", "amulet"], min: () => 0.3, max: () => 1.5, suffix: L("da Meditação", "of Meditation") },
  { k: "statusRes", slots: ["helm", "armor", "boots", "amulet"], min: () => 0.08, max: () => 0.2, suffix: L("da Firmeza", "of Fortitude") },
  { k: "dmgBeast", slots: ["weapon", "gloves", "ring", "amulet"], min: () => 0.1, max: () => 0.3, suffix: L("do Caçador", "of the Hunter") },
  { k: "dmgUndead", slots: ["weapon", "gloves", "ring", "amulet"], min: () => 0.1, max: () => 0.3, suffix: L("do Exorcista", "of the Exorcist") },
  { k: "fireDmg", slots: ["weapon", "gloves", "ring"], min: (l) => 1 + l * 0.5, max: (l) => 3 + l, suffix: L("das Chamas", "of Flames") },
  { k: "coldDmg", slots: ["weapon", "gloves", "ring"], min: (l) => 1 + l * 0.4, max: (l) => 2 + l * 0.8, suffix: L("do Inverno", "of Winter") },
  { k: "lightningDmg", slots: ["weapon", "gloves", "ring"], min: () => 1, max: (l) => 4 + l * 1.3, suffix: L("dos Relâmpagos", "of Lightning") },
  { k: "poisonDmg", slots: ["weapon", "gloves", "ring"], min: (l) => 1 + l * 0.5, max: (l) => 3 + l, suffix: L("da Peçonha", "of Venom") },
  { k: "thorns", slots: ["armor", "helm", "gloves"], min: (l) => 2 + l, max: (l) => 5 + l * 2, suffix: L("dos Espinhos", "of Thorns") },
  { k: "goldFind", slots: ["helm", "boots", "ring", "amulet"], min: () => 0.1, max: () => 0.3, suffix: L("da Ganância", "of Greed") },
  { k: "magicFind", slots: ["helm", "boots", "ring", "amulet"], min: () => 0.05, max: () => 0.2, suffix: L("da Fortuna", "of Fortune") },
];

const RARE_A = [L("Presa", "Fang"), L("Garra", "Claw"), L("Sina", "Doom"), L("Marca", "Mark"), L("Lâmina", "Blade"), L("Vigília", "Vigil"), L("Fúria", "Fury"), L("Agonia", "Agony"), L("Ruína", "Ruin"), L("Sombra", "Shadow"), L("Glória", "Glory"), L("Prece", "Prayer")];
const LEGEND_A = [L("Fúria Ancestral", "Ancestral Fury"), L("Lamento Eterno", "Eternal Lament"), L("Coroa Partida", "Broken Crown"), L("Juramento", "Oath"), "Eclipse", L("Cicatriz Divina", "Divine Scar")];
const RARE_B = [L("do Corvo", "of the Raven"), L("da Tormenta", "of the Tempest"), L("do Abismo", "of the Abyss"), L("da Aurora", "of the Dawn"), L("do Carniceiro", "of the Butcher"), L("da Serpente", "of the Serpent"), L("do Trovão", "of Thunder"), L("da Cripta", "of the Crypt"), L("do Lobo", "of the Wolf"), L("da Brasa", "of Embers")];

/** Unique items. `cls` limits a weapon to its class; `boss` is the boss (UNIQUES id in enemies.ts) that
 * favours dropping it. */
interface UniqueItem { name: string; slot: Slot; icon: IconId; cls?: ClassId; boss?: string; affixes: Affix[] }
const UNIQUE_ITEMS: UniqueItem[] = [
  // weapons
  { name: L("Racha-Goblins", "Goblinsplitter"), slot: "weapon", icon: "axe", cls: "barbarian", affixes: [{ k: "dmgPct", v: 0.6 }, { k: "dmgFlat", v: 6 }, { k: "attackSpeed", v: 0.15 }, { k: "lifeSteal", v: 0.05 }] },
  { name: L("Fúria do Açougueiro", "Butcher's Fury"), slot: "weapon", icon: "executioner", cls: "barbarian", boss: "butcher", affixes: [{ k: "dmgPct", v: 0.5 }, { k: "lifeSteal", v: 0.06 }, { k: "attackSpeed", v: 0.1 }, { k: "maxHp", v: 30 }, { k: "dmgBeast", v: 0.3 }] },
  { name: L("Sussurro do Vento", "Whisper of the Wind"), slot: "weapon", icon: "shortbow", cls: "archer", affixes: [{ k: "attackSpeed", v: 0.25 }, { k: "moveSpeed", v: 0.1 }, { k: "dmgFlat", v: 5 }, { k: "crit", v: 0.06 }, { k: "coldDmg", v: 5 }] },
  { name: L("Ferrão da Mantícora", "Manticore's Sting"), slot: "weapon", icon: "dragonbow", cls: "archer", boss: "manticore", affixes: [{ k: "dmgPct", v: 0.55 }, { k: "crit", v: 0.1 }, { k: "dmgFlat", v: 7 }] },
  { name: L("Olho da Tempestade", "Eye of the Storm"), slot: "weapon", icon: "runestaff", cls: "mage", affixes: [{ k: "dmgPct", v: 0.45 }, { k: "maxMana", v: 40 }, { k: "manaRegen", v: 3 }, { k: "crit", v: 0.05 }, { k: "lightningDmg", v: 8 }] },
  { name: L("Cajado de Malakar", "Malakar's Staff"), slot: "weapon", icon: "archstaff", cls: "mage", boss: "malakar", affixes: [{ k: "dmgPct", v: 0.6 }, { k: "maxMana", v: 60 }, { k: "manaRegen", v: 4 }] },
  { name: L("Osso de Vargas", "Vargas' Bone"), slot: "weapon", icon: "bonewand", cls: "sorcerer", boss: "necro", affixes: [{ k: "dmgPct", v: 0.5 }, { k: "lifeSteal", v: 0.06 }, { k: "maxMana", v: 30 }] },
  { name: L("Lua Negra", "Black Moon"), slot: "weapon", icon: "moonwand", cls: "sorcerer", affixes: [{ k: "dmgPct", v: 0.45 }, { k: "crit", v: 0.1 }, { k: "manaRegen", v: 2.5 }, { k: "poisonDmg", v: 6 }] },
  // helms
  { name: L("Coroa do Rei Goblin", "Crown of the Goblin King"), slot: "helm", icon: "horned_helm", boss: "grumm", affixes: [{ k: "maxHp", v: 60 }, { k: "crit", v: 0.08 }, { k: "armor", v: 20 }, { k: "hpRegen", v: 3 }] },
  { name: L("Coroa de Vargas", "Crown of Vargas"), slot: "helm", icon: "bone_crown", boss: "necro", affixes: [{ k: "maxMana", v: 50 }, { k: "manaRegen", v: 3 }, { k: "crit", v: 0.06 }, { k: "armor", v: 10 }, { k: "dmgUndead", v: 0.3 }] },
  { name: L("Elmo do Cavaleiro Esqueleto", "Skeleton Knight's Helm"), slot: "helm", icon: "greathelm", boss: "knight", affixes: [{ k: "armor", v: 35 }, { k: "maxHp", v: 60 }, { k: "hpRegen", v: 2 }] },
  // chest
  { name: L("Manto da Colheita", "Harvest Mantle"), slot: "armor", icon: "tunic", affixes: [{ k: "maxHp", v: 80 }, { k: "armor", v: 40 }, { k: "hpRegen", v: 2 }] },
  { name: L("Escama de Ignir", "Ignir's Scale"), slot: "armor", icon: "plate", boss: "dragon", affixes: [{ k: "armor", v: 60 }, { k: "maxHp", v: 100 }, { k: "fireDmg", v: 6 }, { k: "statusRes", v: 0.15 }] },
  { name: L("Manto da Bruxa", "Witch's Robe"), slot: "armor", icon: "robe", boss: "witch", affixes: [{ k: "maxMana", v: 60 }, { k: "manaRegen", v: 4 }, { k: "maxHp", v: 40 }, { k: "lifeSteal", v: 0.03 }] },
  // gloves
  { name: L("Mãos de Ferro", "Iron Hands"), slot: "gloves", icon: "gauntlets", affixes: [{ k: "attackSpeed", v: 0.2 }, { k: "dmgFlat", v: 6 }, { k: "armor", v: 12 }] },
  { name: L("Luvas do Demagogo", "Demagogue's Gloves"), slot: "gloves", icon: "claws", boss: "polvo", affixes: [{ k: "dmgFlat", v: 10 }, { k: "attackSpeed", v: 0.15 }, { k: "lifeSteal", v: 0.03 }] },
  { name: L("Pinças da Rainha", "Queen's Pincers"), slot: "gloves", icon: "bracers", boss: "queen", affixes: [{ k: "attackSpeed", v: 0.22 }, { k: "crit", v: 0.07 }, { k: "armor", v: 10 }] },
  // boots
  { name: L("Passos do Espantalho", "Scarecrow's Stride"), slot: "boots", icon: "sandals", affixes: [{ k: "moveSpeed", v: 0.25 }, { k: "armor", v: 15 }, { k: "maxHp", v: 30 }] },
  { name: L("Patas de Presa-Negra", "Blackfang's Paws"), slot: "boots", icon: "walker_boots", boss: "fang", affixes: [{ k: "moveSpeed", v: 0.3 }, { k: "attackSpeed", v: 0.1 }, { k: "maxHp", v: 40 }, { k: "statusRes", v: 0.2 }] },
  { name: L("Grevas de Pedra", "Stone Greaves"), slot: "boots", icon: "greaves", affixes: [{ k: "armor", v: 45 }, { k: "maxHp", v: 50 }, { k: "thorns", v: 15 }] },
  // rings
  { name: L("Aliança do Fazendeiro", "Farmer's Wedding Band"), slot: "ring", icon: "ring", affixes: [{ k: "dmgFlat", v: 8 }, { k: "crit", v: 0.1 }, { k: "lifeSteal", v: 0.03 }] },
  { name: L("Anel da Rainha Formiga", "Ant Queen's Ring"), slot: "ring", icon: "ring_emerald", boss: "antqueen", affixes: [{ k: "crit", v: 0.08 }, { k: "attackSpeed", v: 0.12 }, { k: "dmgFlat", v: 6 }, { k: "statusRes", v: 0.25 }] },
  { name: L("Selo de Gorlak", "Gorlak's Seal"), slot: "ring", icon: "ring_ruby", boss: "gorlak", affixes: [{ k: "maxHp", v: 80 }, { k: "hpRegen", v: 4 }, { k: "armor", v: 15 }] },
  // amulets
  { name: L("Olho de Minhau", "Eye of Minhau"), slot: "amulet", icon: "amulet", affixes: [{ k: "dmgPct", v: 0.3 }, { k: "maxMana", v: 40 }, { k: "manaRegen", v: 3 }, { k: "goldFind", v: 0.25 }] },
  { name: L("Olho do Fogo-Fátuo", "Wisp's Eye"), slot: "amulet", icon: "amulet_cateye", affixes: [{ k: "crit", v: 0.1 }, { k: "maxMana", v: 40 }, { k: "moveSpeed", v: 0.08 }, { k: "magicFind", v: 0.2 }] },
  { name: L("Dente do Ogro", "Ogre's Tooth"), slot: "amulet", icon: "amulet_tooth", boss: "ogre", affixes: [{ k: "dmgFlat", v: 12 }, { k: "maxHp", v: 50 }, { k: "dmgPct", v: 0.15 }] },
];

const FLAT: StatKey[] = ["dmgFlat", "maxHp", "maxMana", "armor", "hpRegen", "manaRegen", "fireDmg", "coldDmg", "lightningDmg", "poisonDmg", "thorns"];

let nextUid = 1;
export const setNextUid = (n: number) => (nextUid = Math.max(nextUid, n));

const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const roll = (min: number, max: number) => min + Math.random() * (max - min);
const round = (k: StatKey, v: number) => (FLAT.includes(k) ? (k.endsWith("Regen") ? Math.round(v * 10) / 10 : Math.round(v)) : Math.round(v * 100) / 100);

/** Best rarity that can drop for a hero of this level: no legendary at level 1. */
export function maxRarityFor(heroLevel: number): Rarity {
  return heroLevel < 3 ? "magic" : heroLevel < 6 ? "rare" : heroLevel < 10 ? "epic" : heroLevel < 15 ? "legendary" : "unique";
}

/** Caps a rarity to what the hero's level allows. */
export function capRarity(r: Rarity, heroLevel: number): Rarity {
  const max = RARITIES.indexOf(maxRarityFor(heroLevel));
  return RARITIES.indexOf(r) > max ? RARITIES[max] : r;
}

export function rollRarity(magicFind = 1, heroLevel = Infinity): Rarity {
  return capRarity(rollRarityUncapped(magicFind), heroLevel);
}

function rollRarityUncapped(magicFind: number): Rarity {
  const w: Record<Rarity, number> = {
    normal: 50, magic: 30 * magicFind, rare: 12 * magicFind, epic: 4.5 * magicFind, legendary: 1.6 * magicFind, unique: 1 * magicFind,
  };
  let r = Math.random() * RARITIES.reduce((a, k) => a + w[k], 0);
  for (const k of [...RARITIES].reverse()) {
    if ((r -= w[k]) < 0) return k;
  }
  return "normal";
}

/** Gold value of an item; shops sell at this price and buy back at a quarter. */
export function itemValue(item: Item): number {
  const mult: Record<Rarity, number> = { normal: 1, magic: 2.5, rare: 6, epic: 14, legendary: 32, unique: 45 };
  return Math.round((12 + item.ilvl * 9) * mult[item.rarity]);
}

/** Rolls an item. `boss`: a boss's unique drop favours that boss's own unique (any slot). */
export function generateItem(ilvl: number, cls: ClassDef, rarity: Rarity = rollRarity(), slot: Slot = pick(SLOTS), boss?: string): Item {
  let u: UniqueItem | undefined;
  if (rarity === "unique") {
    const fits = (x: UniqueItem) => !x.cls || x.cls === cls.id;
    const own = boss ? UNIQUE_ITEMS.filter((x) => x.boss === boss && fits(x)) : [];
    u = own.length ? pick(own) : pick(UNIQUE_ITEMS.filter((x) => x.slot === slot && fits(x)));
    slot = u.slot;
  }
  const base = u ? findBase(u.icon) : pickBase(slot === "weapon" ? WEAPONS[cls.id] : BASES[slot], ilvl);
  const implicit: Affix[] = [];
  if (slot === "weapon") {
    const m = base.dmg ?? 1;
    implicit.push({ k: "dmgMin", v: Math.max(1, Math.round((2 + ilvl * 0.9) * m * roll(0.8, 1.2))) });
    implicit.push({ k: "dmgMax", v: Math.max(2, Math.round((5 + ilvl * 1.6) * m * roll(0.8, 1.2))) });
  } else if (base.armor) {
    implicit.push({ k: "armor", v: Math.round(base.armor[0] + ilvl * base.armor[1] * roll(0.8, 1.2)) });
  }
  for (const b of base.implicit ?? []) implicit.push({ k: b.k, v: round(b.k, b.v(ilvl)) });

  let affixes: Affix[] = [];
  let name = base.name;
  if (u) {
    const scale = 1 + ilvl * 0.05;
    affixes = u.affixes.map((a) => ({ k: a.k, v: round(a.k, FLAT.includes(a.k) ? a.v * scale : a.v) }));
    name = u.name;
  } else if (rarity !== "normal") {
    const pool = AFFIXES.filter((a) => a.slots.includes(slot));
    const rr = RARITY_ROLL[rarity as keyof typeof RARITY_ROLL];
    const count = rr.min + Math.floor(Math.random() * (rr.max - rr.min + 1));
    const chosen: AffixDef[] = [];
    while (chosen.length < Math.min(count, pool.length)) {
      const a = pick(pool);
      if (!chosen.includes(a)) chosen.push(a);
    }
    affixes = chosen.map((a) => ({ k: a.k, v: round(a.k, roll(a.min(ilvl), a.max(ilvl)) * rr.mult) }));
    name = rarity === "magic" ? `${base.name} ${chosen[0].suffix}`
      : rarity === "legendary" ? `${pick(LEGEND_A)} ${pick(RARE_B)}`
      : `${pick(RARE_A)} ${pick(RARE_B)}`;
  }
  return { uid: nextUid++, name, base: base.name, slot, rarity, ilvl, icon: base.icon, implicit, affixes };
}

export function itemStats(item: Item): Partial<Stats> {
  const s: Partial<Stats> = {};
  for (const a of [...item.implicit, ...item.affixes]) s[a.k] = (s[a.k] ?? 0) + a.v;
  return s;
}

export function implicitLine(a: Affix): string {
  if (a.k === "dmgMin" || a.k === "dmgMax") return "";
  return a.k === "armor" ? L(`Armadura: ${a.v}`, `Armor: ${a.v}`) : formatStat(a.k, a.v);
}

export function itemLines(item: Item): string[] {
  const lines: string[] = [];
  const min = item.implicit.find((a) => a.k === "dmgMin");
  const max = item.implicit.find((a) => a.k === "dmgMax");
  if (min && max) lines.push(L(`Dano: ${min.v}–${max.v}`, `Damage: ${min.v}–${max.v}`));
  for (const a of item.implicit) {
    const l = implicitLine(a);
    if (l) lines.push(l);
  }
  return lines;
}

/** Rough "how good is it" number used for the better/worse arrows. */
const SCORE: Partial<Record<StatKey, number>> = {
  dmgMin: 1.5, dmgMax: 1.5, dmgFlat: 2, dmgPct: 60, maxHp: 0.5, maxMana: 0.25, armor: 1, attackSpeed: 70,
  moveSpeed: 40, crit: 110, lifeSteal: 120, hpRegen: 3, manaRegen: 2,
  statusRes: 30, dmgBeast: 25, dmgUndead: 25, fireDmg: 2, coldDmg: 2.2, lightningDmg: 1.8, poisonDmg: 2, thorns: 0.5, goldFind: 10, magicFind: 30,
};

export function itemScore(item: Item): number {
  let s = 0;
  for (const [k, v] of Object.entries(itemStats(item))) s += (SCORE[k as StatKey] ?? 0) * (v as number);
  return s;
}

/** Compares an item with what is equipped in its slot: "up" (better), "down" (worse) or "same". */
export function compareItem(item: Item, equipment: Partial<Record<Slot, Item>>): "up" | "down" | "same" {
  const eq = equipment[item.slot];
  if (eq === item) return "same";
  if (!eq) return "up";
  const a = itemScore(item), b = itemScore(eq);
  if (Math.abs(a - b) <= Math.max(1, b * 0.03)) return "same";
  return a > b ? "up" : "down";
}

export const COMPARE_MARK = { up: "▲", down: "▼", same: "" } as const;
