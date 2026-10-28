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
  easy: { name: "Fácil", desc: "Inimigos mais fracos. Para curtir a história.", color: "#7bea6a",
    enemyHp: 0.7, enemyDmg: 0.6, xp: 1, magicFind: 1, goldLoss: 0.05 },
  normal: { name: "Normal", desc: "A experiência pensada para o jogo.", color: "#ece3cf",
    enemyHp: 1, enemyDmg: 1, xp: 1, magicFind: 1, goldLoss: 0.1 },
  hard: { name: "Difícil", desc: "Inimigos mais duros. +25% XP e loot melhor.", color: "#ff8a1f",
    enemyHp: 1.5, enemyDmg: 1.4, xp: 1.25, magicFind: 1.3, goldLoss: 0.15 },
  nightmare: { name: "Pesadelo", desc: "Só para veteranos. +60% XP, loot muito melhor.", color: "#ff3a3a",
    enemyHp: 2.2, enemyDmg: 2, xp: 1.6, magicFind: 1.7, goldLoss: 0.25 },
};

export const DIFFICULTY_ORDER: Difficulty[] = ["easy", "normal", "hard", "nightmare"];
