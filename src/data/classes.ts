import { L } from "../i18n";
import type { Stats } from "./stats";
import type { IconId } from "../ui/icons";

export type ClassId = "barbarian" | "archer" | "mage" | "sorcerer";

export type SkillKind =
  | "melee" | "warcry" | "projectile" | "multishot" | "nova" | "drain"
  | "leap" | "buff" | "rain" | "chain" | "meteor" | "cloud" | "corpse" | "passive";

/** Hotbar slot a skill lives in: mouse buttons, Q/E/R, or none for passives. */
export type SkillSlot = "primary" | "secondary" | "q" | "e" | "r" | "passive";
export type ActiveSlot = Exclude<SkillSlot, "passive">;
export const ACTIVE_SLOTS: ActiveSlot[] = ["primary", "secondary", "q", "e", "r"];
export const SLOT_KEY: Record<SkillSlot, string> = { primary: "LMB", secondary: "RMB", q: "Q", e: "E", r: "R", passive: "—" };

/** How an enemy killed by the skill dies (see game/deaths.ts). */
export type DeathKind = "normal" | "slice" | "pierce" | "freeze" | "burn" | "shock" | "soul" | "melt" | "crush" | "gib";

export interface SkillDef {
  id: string;
  death: DeathKind;
  name: string;
  desc: string;
  kind: SkillKind;
  slot: SkillSlot;
  reqLevel: number;
  maxRank: number;
  anim: "attack" | "cast";
  /** Animation event that applies the skill. */
  event: "hit" | "release";
  cost: number;
  cooldown: number; // ms
  dmgMult: number; // at rank 1; +20% per extra rank
  range: number; // px: melee reach, projectile travel or cast distance
  radius?: number;
  arc?: number; // melee cone, degrees
  projectile?: { tex: string; speed: number; count?: number; spread?: number; pierce?: number; explode?: number };
  slow?: number;
  stun?: number; // ms
  heal?: number; // fraction of damage dealt returned as life
  gain?: number; // resource gained per enemy hit
  duration?: number; // ms, for areas over time and buffs
  tick?: number; // ms between area ticks
  chains?: number;
  /** Buff stats at rank 1 (+25% per extra rank). `absorb` = shield as a fraction of max life. */
  buff?: { stats: Partial<Stats>; absorb?: number; tint: number };
  /** Passive stats per rank. */
  passive?: Partial<Stats>;
}

export interface ClassDef {
  id: ClassId;
  name: string;
  desc: string;
  resource: string;
  resourceColor: string;
  weapon: { base: string; icon: IconId };
  base: Partial<Stats>;
  perLevel: Partial<Stats>;
  skills: SkillDef[];
}

export const MAX_RANK = 5;

export const rankMult = (rank: number) => 1 + 0.2 * Math.max(0, rank - 1);
export const buffMult = (rank: number) => 1 + 0.25 * Math.max(0, rank - 1);

type S = Omit<SkillDef, "maxRank"> & { maxRank?: number };
const skills = (list: S[]): SkillDef[] => list.map((s) => ({ maxRank: MAX_RANK, ...s }));

export const CLASSES: Record<ClassId, ClassDef> = {
  barbarian: {
    id: "barbarian",
    name: L("Bárbaro", "Barbarian"),
    desc: L("Guerreiro brutal. Muita vida e armadura, ganha Fúria ao acertar golpes.", "A brutal warrior. Plenty of life and armor; gains Fury by landing blows."),
    resource: L("Fúria", "Fury"),
    resourceColor: "#e0662a",
    weapon: { base: L("Machado", "Axe"), icon: "axe" },
    base: { maxHp: 140, maxMana: 60, dmgMin: 7, dmgMax: 13, dmgFlat: 0, dmgPct: 0, armor: 12, attackSpeed: 0,
      moveSpeed: 0, crit: 0.05, lifeSteal: 0, hpRegen: 1.2, manaRegen: -1 },
    perLevel: { maxHp: 16, maxMana: 2, dmgMin: 1.4, dmgMax: 2.2, armor: 2 },
    skills: skills([
      { id: "cleave", death: "slice", name: L("Golpe Brutal", "Brutal Strike"), desc: L("Golpeia em arco os inimigos à frente. Gera Fúria.", "Strikes the enemies in front of you in an arc. Generates Fury."), slot: "primary", reqLevel: 1,
        kind: "melee", anim: "attack", event: "hit", cost: 0, cooldown: 0, dmgMult: 1, range: 30, arc: 110, gain: 6 },
      { id: "warcry", death: "slice", name: L("Redemoinho", "Whirlwind"), desc: L("Golpe giratório que atinge todos ao redor.", "A spinning strike that hits everything around you."), slot: "secondary", reqLevel: 1,
        kind: "warcry", anim: "cast", event: "hit", cost: 25, cooldown: 1200, dmgMult: 2.2, range: 0, radius: 52 },
      { id: "leap", death: "crush", name: L("Salto Esmagador", "Crushing Leap"), desc: L("Salta até o cursor e atordoa os inimigos onde cair.", "Leaps to the cursor and stuns the enemies where you land."), slot: "q", reqLevel: 2,
        kind: "leap", anim: "cast", event: "hit", cost: 20, cooldown: 5000, dmgMult: 1.6, range: 150, radius: 46, stun: 1500 },
      { id: "berserk", death: "normal", name: L("Fúria Berserker", "Berserker Rage"), desc: L("Por 8s: +40% velocidade de ataque e +25% dano.", "For 8s: +40% attack speed and +25% damage."), slot: "e", reqLevel: 4,
        kind: "buff", anim: "cast", event: "hit", cost: 30, cooldown: 20000, dmgMult: 0, range: 0, duration: 8000,
        buff: { stats: { attackSpeed: 0.4, dmgPct: 0.25 }, tint: 0xff5a3a } },
      { id: "quake", death: "gib", name: L("Terremoto", "Earthquake"), desc: L("Esmaga o chão: dano enorme em área e atordoamento longo.", "Smashes the ground: massive area damage and a long stun."), slot: "r", reqLevel: 7,
        kind: "nova", anim: "attack", event: "hit", cost: 45, cooldown: 9000, dmgMult: 3.5, range: 0, radius: 90, stun: 2500 },
      { id: "ironskin", death: "normal", name: L("Pele de Ferro", "Iron Skin"), desc: L("Passiva: +6 armadura e +15 vida por nível.", "Passive: +6 armor and +15 life per rank."), slot: "passive", reqLevel: 3,
        kind: "passive", anim: "attack", event: "hit", cost: 0, cooldown: 0, dmgMult: 0, range: 0, passive: { armor: 6, maxHp: 15 } },
    ]),
  },
  archer: {
    id: "archer",
    name: L("Arqueiro", "Archer"),
    desc: L("Ágil e certeiro. Ataca de longe e acerta críticos com frequência.", "Agile and deadly accurate. Strikes from afar and lands frequent critical hits."),
    resource: L("Foco", "Focus"),
    resourceColor: "#5fd06a",
    weapon: { base: L("Arco", "Bow"), icon: "bow" },
    base: { maxHp: 95, maxMana: 70, dmgMin: 6, dmgMax: 11, dmgFlat: 0, dmgPct: 0, armor: 6, attackSpeed: 0.1,
      moveSpeed: 0.08, crit: 0.12, lifeSteal: 0, hpRegen: 0.6, manaRegen: 3 },
    perLevel: { maxHp: 10, maxMana: 4, dmgMin: 1.2, dmgMax: 2.0, armor: 1 },
    skills: skills([
      { id: "arrow", death: "pierce", name: L("Flecha", "Arrow"), desc: L("Dispara uma flecha rápida.", "Fires a swift arrow."), slot: "primary", reqLevel: 1,
        kind: "projectile", anim: "attack", event: "release", cost: 0, cooldown: 0, dmgMult: 1, range: 320,
        projectile: { tex: "fx_arrow_px", speed: 320 } },
      { id: "multishot", death: "pierce", name: L("Leque de Flechas", "Fan of Arrows"), desc: L("Dispara 5 flechas em leque que atravessam inimigos.", "Fires a fan of 5 arrows that pierce through enemies."), slot: "secondary", reqLevel: 1,
        kind: "multishot", anim: "cast", event: "release", cost: 14, cooldown: 600, dmgMult: 0.8, range: 290,
        projectile: { tex: "fx_arrow_px", speed: 260, count: 5, spread: 50, pierce: 2 } },
      { id: "explosive", death: "burn", name: L("Flecha Explosiva", "Explosive Arrow"), desc: L("Flecha que explode em uma área ao atingir.", "An arrow that explodes over an area on impact."), slot: "q", reqLevel: 2,
        kind: "projectile", anim: "attack", event: "release", cost: 12, cooldown: 2500, dmgMult: 1.8, range: 300,
        projectile: { tex: "fx_fire", speed: 280, explode: 40 } },
      { id: "rain", death: "pierce", name: L("Chuva de Flechas", "Rain of Arrows"), desc: L("Flechas caem do céu na área do cursor por 3s.", "Arrows rain from the sky on the cursor area for 3s."), slot: "e", reqLevel: 4,
        kind: "rain", anim: "cast", event: "release", cost: 25, cooldown: 8000, dmgMult: 0.55, range: 260, radius: 50,
        duration: 3000, tick: 250 },
      { id: "piercing", death: "pierce", name: L("Flecha Perfurante", "Piercing Arrow"), desc: L("Disparo carregado que atravessa todos no caminho.", "A charged shot that pierces everything in its path."), slot: "r", reqLevel: 7,
        kind: "projectile", anim: "attack", event: "release", cost: 30, cooldown: 6000, dmgMult: 3.2, range: 420,
        projectile: { tex: "fx_arrow_px", speed: 460, pierce: 99 } },
      { id: "eagle", death: "normal", name: L("Olho de Águia", "Eagle Eye"), desc: L("Passiva: +3% crítico e +5% velocidade de ataque por nível.", "Passive: +3% critical chance and +5% attack speed per rank."), slot: "passive", reqLevel: 3,
        kind: "passive", anim: "attack", event: "release", cost: 0, cooldown: 0, dmgMult: 0, range: 0, passive: { crit: 0.03, attackSpeed: 0.05 } },
    ]),
  },
  mage: {
    id: "mage",
    name: L("Mago", "Mage"),
    desc: L("Mestre do fogo, gelo e raio. Frágil, mas devastador em área.", "Master of fire, frost and lightning. Fragile, but devastating against crowds."),
    resource: "Mana",
    resourceColor: "#3a7bff",
    weapon: { base: L("Cajado", "Staff"), icon: "staff" },
    base: { maxHp: 80, maxMana: 110, dmgMin: 8, dmgMax: 14, dmgFlat: 0, dmgPct: 0, armor: 3, attackSpeed: 0,
      moveSpeed: 0, crit: 0.05, lifeSteal: 0, hpRegen: 0.5, manaRegen: 4 },
    perLevel: { maxHp: 8, maxMana: 8, dmgMin: 1.5, dmgMax: 2.4, armor: 0.5 },
    skills: skills([
      { id: "firebolt", death: "burn", name: L("Bola de Fogo", "Fireball"), desc: L("Projétil flamejante que explode ao atingir.", "A blazing projectile that explodes on impact."), slot: "primary", reqLevel: 1,
        kind: "projectile", anim: "attack", event: "release", cost: 3, cooldown: 0, dmgMult: 1, range: 290,
        projectile: { tex: "fx_fire", speed: 230, explode: 18 } },
      { id: "frostnova", death: "freeze", name: L("Nova de Gelo", "Frost Nova"), desc: L("Explosão gélida ao redor que fere e deixa os inimigos lentos.", "An icy blast around you that wounds and slows enemies."), slot: "secondary", reqLevel: 1,
        kind: "nova", anim: "cast", event: "release", cost: 22, cooldown: 1500, dmgMult: 1.4, range: 0, radius: 70, slow: 0.6 },
      { id: "chain", death: "shock", name: L("Raio em Cadeia", "Chain Lightning"), desc: L("Raio que salta entre até 5 inimigos.", "Lightning that leaps between up to 5 enemies."), slot: "q", reqLevel: 2,
        kind: "chain", anim: "attack", event: "release", cost: 16, cooldown: 1200, dmgMult: 1.3, range: 230, chains: 5 },
      { id: "shield", death: "normal", name: L("Escudo Arcano", "Arcane Shield"), desc: L("Escudo que absorve dano igual a 35% da sua vida máxima por 10s.", "A shield that absorbs damage equal to 35% of your maximum life for 10s."), slot: "e", reqLevel: 4,
        kind: "buff", anim: "cast", event: "release", cost: 35, cooldown: 18000, dmgMult: 0, range: 0, duration: 10000,
        buff: { stats: { armor: 10 }, absorb: 0.35, tint: 0x7a9bff } },
      { id: "meteor", death: "burn", name: L("Meteoro", "Meteor"), desc: L("Um meteoro cai no cursor, explode e deixa o chão em chamas.", "A meteor crashes down at the cursor, exploding and leaving the ground ablaze."), slot: "r", reqLevel: 7,
        kind: "meteor", anim: "cast", event: "release", cost: 40, cooldown: 7000, dmgMult: 4, range: 260, radius: 56,
        duration: 2500, tick: 400 },
      { id: "arcanemind", death: "normal", name: L("Mente Arcana", "Arcane Mind"), desc: L("Passiva: +8% dano e +0.8 mana por segundo por nível.", "Passive: +8% damage and +0.8 mana per second per rank."), slot: "passive", reqLevel: 3,
        kind: "passive", anim: "attack", event: "release", cost: 0, cooldown: 0, dmgMult: 0, range: 0, passive: { dmgPct: 0.08, manaRegen: 0.8 } },
    ]),
  },
  sorcerer: {
    id: "sorcerer",
    name: L("Feiticeiro", "Sorcerer"),
    desc: L("Conjurador sombrio. Drena vida, espalha pragas e explode cadáveres.", "A dark conjurer. Drains life, spreads plagues and detonates corpses."),
    resource: L("Essência", "Essence"),
    resourceColor: "#b452ff",
    weapon: { base: L("Varinha", "Wand"), icon: "wand" },
    base: { maxHp: 90, maxMana: 95, dmgMin: 7, dmgMax: 12, dmgFlat: 0, dmgPct: 0, armor: 4, attackSpeed: 0,
      moveSpeed: 0, crit: 0.05, lifeSteal: 0.04, hpRegen: 0.4, manaRegen: 3.5 },
    perLevel: { maxHp: 10, maxMana: 6, dmgMin: 1.3, dmgMax: 2.2, armor: 0.8 },
    skills: skills([
      { id: "shadowbolt", death: "soul", name: L("Seta Sombria", "Shadow Bolt"), desc: L("Projétil sombrio que atravessa um inimigo.", "A shadowy projectile that pierces one enemy."), slot: "primary", reqLevel: 1,
        kind: "projectile", anim: "attack", event: "release", cost: 2, cooldown: 0, dmgMult: 0.9, range: 300,
        projectile: { tex: "fx_shadow", speed: 250, pierce: 1 } },
      { id: "drain", death: "soul", name: L("Drenar Almas", "Soul Drain"), desc: L("Amaldiçoa a área no cursor, causando dano e curando você.", "Curses the area at the cursor, dealing damage and healing you."), slot: "secondary", reqLevel: 1,
        kind: "drain", anim: "cast", event: "release", cost: 20, cooldown: 1400, dmgMult: 1.5, range: 240, radius: 50, heal: 0.5 },
      { id: "plague", death: "melt", name: L("Praga", "Plague"), desc: L("Nuvem tóxica que fere e deixa lentos os inimigos por 4s.", "A toxic cloud that wounds and slows enemies for 4s."), slot: "q", reqLevel: 2,
        kind: "cloud", anim: "cast", event: "release", cost: 18, cooldown: 3000, dmgMult: 0.45, range: 250, radius: 48,
        duration: 4000, tick: 400, slow: 0.5 },
      { id: "corpse", death: "gib", name: L("Explosão de Cadáver", "Corpse Explosion"), desc: L("Detona os cadáveres perto do cursor, causando dano em área.", "Detonates the corpses near the cursor, dealing area damage."), slot: "e", reqLevel: 4,
        kind: "corpse", anim: "cast", event: "release", cost: 15, cooldown: 1000, dmgMult: 1, range: 260, radius: 70 },
      { id: "bloodpact", death: "normal", name: L("Pacto de Sangue", "Blood Pact"), desc: L("Por 10s: +15% roubo de vida e +30% dano.", "For 10s: +15% life steal and +30% damage."), slot: "r", reqLevel: 7,
        kind: "buff", anim: "cast", event: "release", cost: 40, cooldown: 22000, dmgMult: 0, range: 0, duration: 10000,
        buff: { stats: { lifeSteal: 0.15, dmgPct: 0.3 }, tint: 0xc1272d } },
      { id: "harvest", death: "normal", name: L("Colheita de Almas", "Soul Harvest"), desc: L("Passiva: +12 vida e +1 essência por segundo por nível.", "Passive: +12 life and +1 essence per second per rank."), slot: "passive", reqLevel: 3,
        kind: "passive", anim: "attack", event: "release", cost: 0, cooldown: 0, dmgMult: 0, range: 0, passive: { maxHp: 12, manaRegen: 1 } },
    ]),
  },
};

export const CLASS_ORDER: ClassId[] = ["barbarian", "archer", "mage", "sorcerer"];

export const skillAt = (c: ClassDef, slot: SkillSlot) => c.skills.find((s) => s.slot === slot)!;
