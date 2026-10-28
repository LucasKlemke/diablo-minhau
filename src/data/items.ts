import type { ClassDef } from "./classes";
import { formatStat, type StatKey, type Stats } from "./stats";
import type { IconId } from "../ui/icons";

export type Slot = "weapon" | "helm" | "armor" | "gloves" | "boots" | "ring" | "amulet";
export type Rarity = "normal" | "magic" | "rare" | "epic" | "legendary" | "unique";
export const RARITIES: Rarity[] = ["normal", "magic", "rare", "epic", "legendary", "unique"];

export const SLOTS: Slot[] = ["weapon", "helm", "armor", "gloves", "boots", "ring", "amulet"];
export const SLOT_LABEL: Record<Slot, string> = {
  weapon: "Arma", helm: "Elmo", armor: "Armadura", gloves: "Luvas", boots: "Botas", ring: "Anel", amulet: "Amuleto",
};
export const RARITY_LABEL: Record<Rarity, string> = {
  normal: "Comum", magic: "Mágico", rare: "Raro", epic: "Épico", legendary: "Lendário", unique: "Único",
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

const BASES: Record<Exclude<Slot, "weapon">, { name: string; icon: IconId; armor?: [number, number] }> = {
  helm: { name: "Elmo", icon: "helm", armor: [3, 1.2] },
  armor: { name: "Gibão de Couro", icon: "armor", armor: [6, 2] },
  gloves: { name: "Luvas", icon: "gloves", armor: [2, 0.8] },
  boots: { name: "Botas", icon: "boots", armor: [2, 0.8] },
  ring: { name: "Anel", icon: "ring" },
  amulet: { name: "Amuleto", icon: "amulet" },
};

interface AffixDef { k: StatKey; slots: Slot[]; min: (l: number) => number; max: (l: number) => number; suffix: string }

const AFFIXES: AffixDef[] = [
  { k: "dmgFlat", slots: ["weapon", "ring", "amulet", "gloves"], min: (l) => 1 + l * 0.6, max: (l) => 3 + l * 1.2, suffix: "da Força" },
  { k: "dmgPct", slots: ["weapon", "amulet"], min: (l) => 0.05 + l * 0.01, max: (l) => 0.15 + l * 0.02, suffix: "do Massacre" },
  { k: "maxHp", slots: ["helm", "armor", "gloves", "boots", "ring", "amulet"], min: (l) => 5 + l * 3, max: (l) => 12 + l * 5, suffix: "da Baleia" },
  { k: "maxMana", slots: ["weapon", "helm", "ring", "amulet"], min: (l) => 4 + l * 2, max: (l) => 10 + l * 3, suffix: "do Sábio" },
  { k: "armor", slots: ["helm", "armor", "gloves", "boots"], min: (l) => 2 + l, max: (l) => 5 + l * 2.5, suffix: "da Muralha" },
  { k: "attackSpeed", slots: ["weapon", "gloves", "ring"], min: () => 0.04, max: () => 0.12, suffix: "da Rapidez" },
  { k: "moveSpeed", slots: ["boots"], min: () => 0.05, max: () => 0.15, suffix: "do Vento" },
  { k: "crit", slots: ["weapon", "ring", "amulet", "gloves", "helm"], min: () => 0.02, max: () => 0.06, suffix: "da Precisão" },
  { k: "lifeSteal", slots: ["weapon", "ring", "amulet"], min: () => 0.01, max: () => 0.04, suffix: "do Vampiro" },
  { k: "hpRegen", slots: ["armor", "helm", "ring", "amulet"], min: (l) => 0.3 + l * 0.1, max: (l) => 1 + l * 0.2, suffix: "da Regeneração" },
  { k: "manaRegen", slots: ["weapon", "helm", "ring", "amulet"], min: () => 0.3, max: () => 1.5, suffix: "da Meditação" },
];

const RARE_A = ["Presa", "Garra", "Sina", "Marca", "Lâmina", "Vigília", "Fúria", "Agonia", "Ruína", "Sombra", "Glória", "Prece"];
const LEGEND_A = ["Fúria Ancestral", "Lamento Eterno", "Coroa Partida", "Juramento", "Eclipse", "Cicatriz Divina"];
const RARE_B = ["do Corvo", "da Tormenta", "do Abismo", "da Aurora", "do Carniceiro", "da Serpente", "do Trovão", "da Cripta", "do Lobo", "da Brasa"];

const UNIQUES: Record<Slot, { name: string; affixes: Affix[] }> = {
  weapon: { name: "Racha-Goblins", affixes: [{ k: "dmgPct", v: 0.6 }, { k: "dmgFlat", v: 6 }, { k: "attackSpeed", v: 0.15 }, { k: "lifeSteal", v: 0.05 }] },
  helm: { name: "Coroa do Rei Goblin", affixes: [{ k: "maxHp", v: 60 }, { k: "crit", v: 0.08 }, { k: "armor", v: 20 }, { k: "hpRegen", v: 3 }] },
  armor: { name: "Manto da Colheita", affixes: [{ k: "maxHp", v: 80 }, { k: "armor", v: 40 }, { k: "hpRegen", v: 2 }] },
  gloves: { name: "Mãos de Ferro", affixes: [{ k: "attackSpeed", v: 0.2 }, { k: "dmgFlat", v: 6 }, { k: "armor", v: 12 }] },
  boots: { name: "Passos do Espantalho", affixes: [{ k: "moveSpeed", v: 0.25 }, { k: "armor", v: 15 }, { k: "maxHp", v: 30 }] },
  ring: { name: "Aliança do Fazendeiro", affixes: [{ k: "dmgFlat", v: 8 }, { k: "crit", v: 0.1 }, { k: "lifeSteal", v: 0.03 }] },
  amulet: { name: "Olho de Minhau", affixes: [{ k: "dmgPct", v: 0.3 }, { k: "maxMana", v: 40 }, { k: "manaRegen", v: 3 }] },
};

const FLAT: StatKey[] = ["dmgFlat", "maxHp", "maxMana", "armor", "hpRegen", "manaRegen"];

let nextUid = 1;
export const setNextUid = (n: number) => (nextUid = Math.max(nextUid, n));

const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const roll = (min: number, max: number) => min + Math.random() * (max - min);
const round = (k: StatKey, v: number) => (FLAT.includes(k) ? (k.endsWith("Regen") ? Math.round(v * 10) / 10 : Math.round(v)) : Math.round(v * 100) / 100);

export function rollRarity(magicFind = 1): Rarity {
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

export function generateItem(ilvl: number, cls: ClassDef, rarity: Rarity = rollRarity(), slot: Slot = pick(SLOTS)): Item {
  const base = slot === "weapon" ? { name: cls.weapon.base, icon: cls.weapon.icon } : BASES[slot];
  const implicit: Affix[] = [];
  if (slot === "weapon") {
    implicit.push({ k: "dmgMin", v: Math.round(2 + ilvl * 0.9 * roll(0.8, 1.2)) });
    implicit.push({ k: "dmgMax", v: Math.round(5 + ilvl * 1.6 * roll(0.8, 1.2)) });
  } else if ("armor" in base && base.armor) {
    implicit.push({ k: "armor", v: Math.round(base.armor[0] + ilvl * base.armor[1] * roll(0.8, 1.2)) });
  }

  let affixes: Affix[] = [];
  let name = base.name;
  if (rarity === "unique") {
    const u = UNIQUES[slot];
    const scale = 1 + ilvl * 0.05;
    affixes = u.affixes.map((a) => ({ k: a.k, v: round(a.k, FLAT.includes(a.k) ? a.v * scale : a.v) }));
    name = u.name;
  } else if (rarity !== "normal") {
    const pool = AFFIXES.filter((a) => a.slots.includes(slot));
    const rr = RARITY_ROLL[rarity];
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
  return a.k === "armor" ? `Armadura: ${a.v}` : formatStat(a.k, a.v);
}

export function itemLines(item: Item): string[] {
  const lines: string[] = [];
  const min = item.implicit.find((a) => a.k === "dmgMin");
  const max = item.implicit.find((a) => a.k === "dmgMax");
  if (min && max) lines.push(`Dano: ${min.v}–${max.v}`);
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
