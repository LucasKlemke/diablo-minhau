import { L } from "../i18n";
export type Difficulty = "easy" | "normal" | "hard" | "nightmare";

export interface DifficultyDef {
  name: string;
  desc: string;
  color: string;
  enemyHp: number;
  enemyDmg: number;
  xp: number;
  magicFind: number;
  goldLoss: number; // fraction of gold lost on death
}

export const DIFFICULTIES: Record<Difficulty, DifficultyDef> = {
  easy: { name: L("Fácil", "Easy"), desc: L("Inimigos mais fracos. Para curtir a história.", "Weaker enemies. For enjoying the story."), color: "#7bea6a",
    enemyHp: 0.7, enemyDmg: 0.6, xp: 1, magicFind: 1, goldLoss: 0.05 },
  normal: { name: "Normal", desc: L("A experiência pensada para o jogo.", "The experience the game was designed for."), color: "#ece3cf",
    enemyHp: 1, enemyDmg: 1, xp: 1, magicFind: 1, goldLoss: 0.1 },
  hard: { name: L("Difícil", "Hard"), desc: L("Inimigos mais duros. +25% XP e loot melhor.", "Tougher enemies. +25% XP and better loot."), color: "#ff8a1f",
    enemyHp: 1.5, enemyDmg: 1.4, xp: 1.25, magicFind: 1.3, goldLoss: 0.15 },
  nightmare: { name: L("Pesadelo", "Nightmare"), desc: L("Só para veteranos. +60% XP, loot muito melhor.", "Veterans only. +60% XP, much better loot."), color: "#ff3a3a",
    enemyHp: 2.2, enemyDmg: 2, xp: 1.6, magicFind: 1.7, goldLoss: 0.25 },
};

export const DIFFICULTY_ORDER: Difficulty[] = ["easy", "normal", "hard", "nightmare"];
