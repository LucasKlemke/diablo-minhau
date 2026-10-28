import { buffMult, CLASSES, type ClassDef, type ClassId, type SkillDef } from "../data/classes";
import { itemStats, setNextUid, type Item, type Slot } from "../data/items";
import { QUESTS } from "../data/quests";
import type { ZoneId } from "../data/zones";
import type { Difficulty } from "../data/difficulty";
import { addStats, emptyStats, type Stats } from "../data/stats";

export const INVENTORY_SIZE = 30;
export const MAX_POTIONS = 9;

export const xpForLevel = (lvl: number) => (lvl <= 1 ? 0 : Math.round(90 * Math.pow(lvl - 1, 1.6)));

export interface Buff { id: string; until: number; stats: Partial<Stats>; tint: number }

/** Story progress: index of the current quest and its state. */
export interface QuestState {
  index: number; // QUESTS[index] is the current quest (== QUESTS.length when the story is over)
  status: "available" | "active" | "ready";
  progress: number;
  prologueSeen: boolean;
  /** Story bosses already slain (they never come back). */
  killed: string[];
}

/** The hero's persistent state (class, progression, skills, items, quests) and derived stats. */
export class HeroData {
  readonly def: ClassDef;
  level = 1;
  xp = 0;
  gold = 0;
  potions = { hp: 3, mp: 2 };
  inventory: (Item | null)[] = new Array(INVENTORY_SIZE).fill(null);
  equipment: Partial<Record<Slot, Item>> = {};
  ranks: Record<string, number> = {};
  skillPoints = 0;
  quest: QuestState = { index: 0, status: "available", progress: 0, prologueSeen: false, killed: [] };
  /** Current zone, fixed world seeds per zone and dungeons already cleared ("forest:0"). */
  zone: ZoneId = "forest";
  seeds: Record<string, number> = {};
  cleared: string[] = [];
  /** Marta's current stock (kept for the session, rerolled after quests). */
  shop: (Item | null)[] = [];
  buffs: Buff[] = [];
  absorb = 0;
  stats: Stats = emptyStats();
  hp = 0;
  mana = 0;

  slot = 0;
  difficulty: Difficulty = "normal";
  playtime = 0; // seconds
  private sessionStart = performance.now();

  constructor(readonly cls: ClassId) {
    this.def = CLASSES[cls];
    for (const s of this.def.skills) this.ranks[s.id] = s.slot === "primary" || s.slot === "secondary" ? 1 : 0;
    this.recalc();
    this.hp = this.stats.maxHp;
    this.mana = cls === "barbarian" ? 0 : this.stats.maxMana;
  }

  /** Completed story quests: drives how strong the world is. */
  get tier() {
    return this.quest.index;
  }

  rank(s: SkillDef) {
    return this.ranks[s.id] ?? 0;
  }

  canLearn(s: SkillDef) {
    return this.skillPoints > 0 && this.level >= s.reqLevel && this.rank(s) < s.maxRank;
  }

  learn(s: SkillDef) {
    if (!this.canLearn(s)) return false;
    this.ranks[s.id] = this.rank(s) + 1;
    this.skillPoints--;
    this.recalc();
    return true;
  }

  recalc() {
    const s = addStats(emptyStats(), this.def.base);
    addStats(s, this.def.perLevel, this.level - 1);
    for (const it of Object.values(this.equipment)) if (it) addStats(s, itemStats(it));
    for (const sk of this.def.skills) if (sk.passive && this.rank(sk)) addStats(s, sk.passive, this.rank(sk));
    for (const b of this.buffs) addStats(s, b.stats);
    s.dmgMin = Math.max(1, s.dmgMin);
    s.dmgMax = Math.max(s.dmgMin + 1, s.dmgMax);
    s.crit = Math.min(0.75, s.crit);
    this.stats = s;
    this.hp = Math.min(this.hp, s.maxHp);
    this.mana = Math.min(this.mana, s.maxMana);
  }

  addBuff(sk: SkillDef, now: number) {
    const m = buffMult(this.rank(sk));
    const stats: Partial<Stats> = {};
    for (const [k, v] of Object.entries(sk.buff!.stats)) stats[k as keyof Stats] = (v as number) * m;
    this.buffs = this.buffs.filter((b) => b.id !== sk.id);
    this.buffs.push({ id: sk.id, until: now + sk.duration!, stats, tint: sk.buff!.tint });
    if (sk.buff!.absorb) this.absorb = this.stats.maxHp * sk.buff!.absorb * m;
    this.recalc();
  }

  /** Drops expired buffs; returns true when stats changed. */
  tickBuffs(now: number) {
    const before = this.buffs.length;
    this.buffs = this.buffs.filter((b) => b.until > now);
    if (!this.buffs.some((b) => b.id === "shield")) this.absorb = 0;
    if (this.buffs.length !== before) {
      this.recalc();
      return true;
    }
    return false;
  }

  get xpNext() {
    return xpForLevel(this.level + 1);
  }

  get xpPrev() {
    return xpForLevel(this.level);
  }

  /** Adds xp; returns the number of levels gained (each one gives a skill point). */
  gainXp(n: number): number {
    this.xp += n;
    let ups = 0;
    while (this.xp >= this.xpNext) {
      this.level++;
      ups++;
    }
    if (ups) {
      this.skillPoints += ups;
      this.recalc();
      this.hp = this.stats.maxHp;
      if (this.cls !== "barbarian") this.mana = this.stats.maxMana;
    }
    return ups;
  }

  addItem(item: Item): boolean {
    const i = this.inventory.indexOf(null);
    if (i < 0) return false;
    this.inventory[i] = item;
    return true;
  }

  equipFromInventory(i: number) {
    const it = this.inventory[i];
    if (!it) return;
    const prev = this.equipment[it.slot] ?? null;
    this.equipment[it.slot] = it;
    this.inventory[i] = prev;
    this.recalc();
  }

  unequip(slot: Slot): boolean {
    const it = this.equipment[slot];
    if (!it) return false;
    const i = this.inventory.indexOf(null);
    if (i < 0) return false;
    this.inventory[i] = it;
    delete this.equipment[slot];
    this.recalc();
    return true;
  }

  /** Damage roll for a skill multiplier. */
  rollDamage(mult: number): { dmg: number; crit: boolean } {
    const s = this.stats;
    const base = s.dmgMin + Math.random() * (s.dmgMax - s.dmgMin) + s.dmgFlat;
    const crit = Math.random() < s.crit;
    return { dmg: Math.max(1, Math.round(base * (1 + s.dmgPct) * mult * (crit ? 2 : 1))), crit };
  }

  seed(key: string) {
    return (this.seeds[key] ??= Math.floor(Math.random() * 2 ** 31));
  }

  get currentQuest() {
    return QUESTS[this.quest.index];
  }

  // ---------- Save slots ----------
  static readonly SLOTS = 3;
  private static key = (slot: number) => `diablo-minhau:slot:${slot}`;

  save() {
    this.playtime += (performance.now() - this.sessionStart) / 1000;
    this.sessionStart = performance.now();
    const data = {
      cls: this.cls, difficulty: this.difficulty, playtime: Math.round(this.playtime), savedAt: Date.now(),
      level: this.level, xp: this.xp, gold: this.gold, potions: this.potions, ranks: this.ranks,
      skillPoints: this.skillPoints, quest: this.quest, inventory: this.inventory, equipment: this.equipment,
      zone: this.zone, seeds: this.seeds, cleared: this.cleared,
    };
    try {
      localStorage.setItem(HeroData.key(this.slot), JSON.stringify(data));
    } catch {
      /* storage unavailable: progress lives only in this session */
    }
  }

  static create(slot: number, cls: ClassId, difficulty: Difficulty): HeroData {
    const h = new HeroData(cls);
    h.slot = slot;
    h.difficulty = difficulty;
    h.save();
    return h;
  }

  static load(slot: number): HeroData | null {
    HeroData.migrate();
    try {
      const raw = localStorage.getItem(HeroData.key(slot));
      if (!raw) return null;
      const d = JSON.parse(raw);
      const h = new HeroData(d.cls);
      h.slot = slot;
      h.difficulty = d.difficulty ?? "normal";
      h.playtime = d.playtime ?? 0;
      Object.assign(h, { level: d.level, xp: d.xp, gold: d.gold, potions: d.potions, equipment: d.equipment ?? {} });
      if (d.ranks) Object.assign(h.ranks, d.ranks);
      // Older saves had no skill points: grant one per level.
      h.skillPoints = d.skillPoints ?? Math.max(0, h.level - 1);
      if (d.quest) h.quest = { ...h.quest, ...d.quest };
      if (d.zone) h.zone = d.zone;
      if (d.seeds) h.seeds = d.seeds;
      if (d.cleared) h.cleared = d.cleared;
      h.inventory = Array.from({ length: INVENTORY_SIZE }, (_, i) => d.inventory?.[i] ?? null);
      const uids = [...h.inventory, ...Object.values(h.equipment)].map((it) => it?.uid ?? 0);
      setNextUid(Math.max(0, ...uids) + 1);
      h.recalc();
      h.hp = h.stats.maxHp;
      h.mana = h.cls === "barbarian" ? 0 : h.stats.maxMana;
      return h;
    } catch {
      return null; // corrupt or blocked storage
    }
  }

  static deleteSlot(slot: number) {
    try {
      localStorage.removeItem(HeroData.key(slot));
    } catch {
      /* ignore */
    }
  }

  /** Summary of each slot for the menus (null = empty). */
  static slots(): (SlotInfo | null)[] {
    HeroData.migrate();
    return Array.from({ length: HeroData.SLOTS }, (_, i) => {
      try {
        const raw = localStorage.getItem(HeroData.key(i));
        if (!raw) return null;
        const d = JSON.parse(raw);
        return { slot: i, cls: d.cls, level: d.level ?? 1, difficulty: d.difficulty ?? "normal", zone: d.zone ?? "forest",
          quest: d.quest?.index ?? 0, playtime: d.playtime ?? 0, savedAt: d.savedAt ?? 0 };
      } catch {
        return null;
      }
    });
  }

  /** Moves the old one-save-per-class format into free slots, once. */
  private static migrate() {
    try {
      if (localStorage.getItem("diablo-minhau:migrated")) return;
      let slot = 0;
      for (const cls of Object.keys(CLASSES) as ClassId[]) {
        const raw = localStorage.getItem(`diablo-minhau:save:${cls}`);
        if (!raw || slot >= HeroData.SLOTS) continue;
        while (slot < HeroData.SLOTS && localStorage.getItem(HeroData.key(slot))) slot++;
        if (slot >= HeroData.SLOTS) break;
        localStorage.setItem(HeroData.key(slot), JSON.stringify({ ...JSON.parse(raw), cls, difficulty: "normal" }));
        slot++;
      }
      localStorage.setItem("diablo-minhau:migrated", "1");
    } catch {
      /* ignore */
    }
  }
}

export interface SlotInfo {
  slot: number;
  cls: ClassId;
  level: number;
  difficulty: Difficulty;
  zone: ZoneId;
  quest: number;
  playtime: number;
  savedAt: number;
}
