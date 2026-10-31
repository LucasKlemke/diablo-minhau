import type { HeroData } from "./hero";

// Development cheats (the F2 menu, only in dev builds): god mode, a full resource bar and speed/damage multipliers, kept in
// localStorage across reloads. A "dev save" (created from the menu's Dev save button) keeps its own
// built-in god mode, 10x damage and 2x speed on top of these.

const KEY = "diablo-minhau:dev";

export const DEV_ENABLED = import.meta.env.DEV;

export const dev = { god: false, speed: 1, dmg: 1, mana: false };

try {
  Object.assign(dev, JSON.parse(localStorage.getItem(KEY) ?? "{}"));
} catch {
  // corrupt or blocked storage: defaults
}

export function saveDev() {
  try {
    localStorage.setItem(KEY, JSON.stringify(dev));
  } catch {
    // storage blocked: the cheats last this session only
  }
}

const on = () => DEV_ENABLED;
export const isGod = (d: HeroData) => d.dev || (on() && dev.god);
/** Mana / Fury / Focus / Essence always full. */
export const fullResource = () => on() && dev.mana;
export const speedMult = (d: HeroData) => (d.dev ? 2 : 1) * (on() ? dev.speed : 1);
export const dmgMult = (d: HeroData) => (d.dev ? 10 : 1) * (on() ? dev.dmg : 1);
