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
}

export type StatKey = keyof Stats;

export const emptyStats = (): Stats => ({
  maxHp: 0, maxMana: 0, dmgMin: 0, dmgMax: 0, dmgFlat: 0, dmgPct: 0, armor: 0,
  attackSpeed: 0, moveSpeed: 0, crit: 0, lifeSteal: 0, hpRegen: 0, manaRegen: 0,
});

export function addStats(into: Stats, add: Partial<Stats>, times = 1): Stats {
  for (const k of Object.keys(add) as StatKey[]) into[k] += (add[k] ?? 0) * times;
  return into;
}

const PCT: StatKey[] = ["dmgPct", "attackSpeed", "moveSpeed", "crit", "lifeSteal"];

export const STAT_LABEL: Record<StatKey, string> = {
  maxHp: "Vida", maxMana: "Recurso", dmgMin: "Dano mín.", dmgMax: "Dano máx.", dmgFlat: "Dano",
  dmgPct: "Dano", armor: "Armadura", attackSpeed: "Velocidade de ataque", moveSpeed: "Velocidade de movimento",
  crit: "Chance de crítico", lifeSteal: "Roubo de vida", hpRegen: "Vida por segundo", manaRegen: "Recurso por segundo",
};

export function formatStat(k: StatKey, v: number): string {
  if (PCT.includes(k)) return `+${Math.round(v * 100)}% ${STAT_LABEL[k]}`;
  if (k === "hpRegen" || k === "manaRegen") return `+${v.toFixed(1)} ${STAT_LABEL[k]}`;
  return `+${Math.round(v)} ${STAT_LABEL[k]}`;
}

/** Damage reduction from armor against an attacker of a given level. */
export const armorReduction = (armor: number, attackerLevel: number) => armor / (armor + 25 + attackerLevel * 8);
