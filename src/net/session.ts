import type { HeroData } from "../game/hero";
import { net, type Msg, type PlayerState } from "./net";

// The guest's side of getting into the host's game: it keeps saying hello until the host's game answers
// with a welcome (the host may still be in the lobby or watching the prologue, which do not answer it).

export const playerInfo = (d: HeroData): PlayerState => ({
  name: d.def.name, cls: d.cls, level: d.level, hp: d.hp, maxHp: d.stats.maxHp, x: 0, y: 0, anim: "idle", dir: "s", dead: false,
});

/** GameScene start data for a guest from the host's welcome. */
export const welcomeData = (hero: HeroData, w: Extract<Msg, { t: "welcome" }>) => ({
  hero, netSeed: w.seed, netZone: w.zone, dungeon: w.dungeon ?? undefined, spawnAt: { x: w.x, y: w.y }, cinematic: !!w.awaken,
});

let timer = 0;

/** Says hello every second until the welcome arrives; the host leaving calls `onBye`. */
export function awaitWelcome(hero: HeroData, h: {
  onWelcome: (w: Extract<Msg, { t: "welcome" }>) => void;
  onLobby?: (host: PlayerState) => void;
  onStart?: (intro: boolean) => void;
  onBye: () => void;
}) {
  stopWelcome();
  net.on("welcome", (w) => {
    stopWelcome();
    h.onWelcome(w);
  });
  net.on("lobby", (m) => h.onLobby?.(m.player));
  net.on("start", (m) => h.onStart?.(m.intro));
  net.on("bye", () => {
    stopWelcome();
    h.onBye();
  });
  const hello = () => net.send({ t: "hello", player: playerInfo(hero) });
  hello();
  timer = window.setInterval(hello, 1000);
}

export function stopWelcome() {
  window.clearInterval(timer);
  timer = 0;
}
