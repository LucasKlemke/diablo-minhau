import { L } from "../i18n";
export interface Stats {
  maxHp: number;
  maxMana: number;
  dmgMin: number;
  dmgMax: number;
  dmgFlat: number;
  dmgPct: number; // 0.25 = +25%
  armor: number;
  attackSpeed: number; // 0.10 = +10%
  moveSpeed: number; // 0.10 = +10%
  crit: number; // 0.05 = 5%
  lifeSteal: number; // 0.03 = 3%
  hpRegen: number; // per second
  manaRegen: number; // per second
  statusRes: number; // 0.20 = poison, stun and slow last 20% less
  dmgBeast: number; // 0.20 = +20% damage to beasts
  dmgUndead: number; // 0.20 = +20% damage to the undead
  fireDmg: number; // flat fire damage per hit: ignores physical resistance, stops regeneration
  thorns: number; // damage returned to melee attackers
  goldFind: number; // 0.20 = +20% gold
  magicFind: number; // 0.20 = +20% chance of better items
}

export type StatKey = keyof Stats;

export const emptyStats = (): Stats => ({
  maxHp: 0, maxMana: 0, dmgMin: 0, dmgMax: 0, dmgFlat: 0, dmgPct: 0, armor: 0,
  attackSpeed: 0, moveSpeed: 0, crit: 0, lifeSteal: 0, hpRegen: 0, manaRegen: 0,
  statusRes: 0, dmgBeast: 0, dmgUndead: 0, fireDmg: 0, thorns: 0, goldFind: 0, magicFind: 0,
});

export function addStats(into: Stats, add: Partial<Stats>, times = 1): Stats {
  for (const k of Object.keys(add) as StatKey[]) into[k] += (add[k] ?? 0) * times;
  return into;
}

const PCT: StatKey[] = ["dmgPct", "attackSpeed", "moveSpeed", "crit", "lifeSteal", "statusRes", "dmgBeast", "dmgUndead", "goldFind", "magicFind"];

export const STAT_LABEL: Record<StatKey, string> = {
  maxHp: L("Vida", "Life"), maxMana: L("Recurso", "Resource"), dmgMin: L("Dano mín.", "Min damage"), dmgMax: L("Dano máx.", "Max damage"), dmgFlat: L("Dano", "Damage"),
  dmgPct: L("Dano", "Damage"), armor: L("Armadura", "Armor"), attackSpeed: L("Velocidade de ataque", "Attack speed"), moveSpeed: L("Velocidade de movimento", "Movement speed"),
  crit: L("Chance de crítico", "Critical chance"), lifeSteal: L("Roubo de vida", "Life steal"), hpRegen: L("Vida por segundo", "Life per second"), manaRegen: L("Recurso por segundo", "Resource per second"),
  statusRes: L("Resistência a veneno, atordoamento e lentidão", "Poison, stun and slow resistance"),
  dmgBeast: L("Dano contra Feras", "Damage to Beasts"), dmgUndead: L("Dano contra Mortos-vivos", "Damage to Undead"),
  fireDmg: L("Dano de Fogo", "Fire Damage"), thorns: L("Espinhos", "Thorns"),
  goldFind: L("Ouro encontrado", "Gold Find"), magicFind: L("Achado mágico", "Magic Find"),
};

export function formatStat(k: StatKey, v: number): string {
  const sign = v < 0 ? "" : "+"; // negative implicits (heavy armour, slow weapons) already carry their "-"
  if (PCT.includes(k)) return `${sign}${Math.round(v * 100)}% ${STAT_LABEL[k]}`;
  if (k === "hpRegen" || k === "manaRegen") return `${sign}${v.toFixed(1)} ${STAT_LABEL[k]}`;
  return `${sign}${Math.round(v)} ${STAT_LABEL[k]}`;
}

/** Damage reduction from armor against an attacker of a given level. */
export const armorReduction = (armor: number, attackerLevel: number) => armor / (armor + 25 + attackerLevel * 8);
