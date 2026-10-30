import Phaser from "phaser";
import type { ClassId, DeathKind } from "../data/classes";
import { KilnSprite } from "../kiln";
import { CinematicUi } from "../ui/cinematic";
import { cine, sfx } from "./audio";
import { L } from "../i18n";

// The last part of the opening cutscene, played inside the game on the real map: the hero walks up the
// starting road, cuts down a goblin ambush with their class's attack, walks on, looks at the smoke over the
// village, does their class's signature move, the title shows, and control is handed over right there.

export const ARRIVAL_LINE: Record<ClassId, string> = {
  barbarian: L("Das terras do norte, um bárbaro ouviu o chamado da guerra.", "From the northern lands, a barbarian heard the call of war."),
  archer: L("Um arqueiro que nunca errou um alvo seguiu o rastro da fumaça.", "An archer who had never missed a mark followed the trail of smoke."),
  mage: L("Um mago errante sentiu no ar o cheiro de magia sombria.", "A wandering mage caught the scent of dark magic on the wind."),
  sorcerer: L("Um feiticeiro de olhar verde sorriu. Havia almas a colher.", "A green-eyed sorcerer smiled. There were souls to reap."),
};

/** What the game scene lends the cutscene. */
export interface ArrivalApi {
  scene: Phaser.Scene;
  hero: KilnSprite;
  cls: ClassId;
  /** World points along the road ahead of the hero (toward the village). */
  path: { x: number; y: number }[];
  /** Where the village lies (the hero looks there). */
  village: { x: number; y: number };
  lock(on: boolean): void;
  ring(x: number, y: number, radius: number, tint: number, ms: number): void;
  burst(kind: "fire" | "frost" | "shadow" | "dust" | "blood" | "gold", n: number, x: number, y: number): void;
  shake(ms: number, intensity: number): void;
  /** Spawns a real goblin (on free ground near x, y) that the cutscene moves; `kill` finishes it with the game's death fx. */
  foe(x: number, y: number): ArrivalFoe | null;
  /** Living enemies already on the map inside a world rectangle. */
  foesIn(r: Phaser.Geom.Rectangle): ArrivalFoe[];
  /** Called once the player has control (zone title, objective message...). */
  done(): void;
}

export interface ArrivalFoe {
  spr: KilnSprite;
  kill(kind: DeathKind, angle: number): void;
}

/** How each class finishes the ambushers: melee reach (0 = ranged), projectile and death. */
const STYLE: Record<ClassId, { reach: number; skill: string; tex?: string; death: DeathKind }> = {
  barbarian: { reach: 20, skill: "cleave", death: "slice" },
  archer: { reach: 0, skill: "arrow", tex: "fx_arrow", death: "pierce" },
  mage: { reach: 0, skill: "firebolt", tex: "fx_fire", death: "burn" },
  sorcerer: { reach: 0, skill: "shadowbolt", tex: "fx_shadow", death: "soul" },
};

export function playArrival(api: ArrivalApi) {
  const { scene, hero, cls } = api;
  const cam = scene.cameras.main;
  let over = false;
  const wait = (ms: number) => new Promise<void>((r) => scene.time.delayedCall(ms, () => r()));
  const finish = () => {
    if (over) return;
    over = true;
    speed(1);
    scene.tweens.killTweensOf(hero);
    ui.close();
    api.lock(false);
    document.getElementById("ui")!.classList.remove("cinematic");
    cam.zoomTo(baseZoom, 700, "Sine.easeInOut");
    hero.play2("idle");
    api.done();
  };
  const speed = (f: number) => {
    scene.time.timeScale = f;
    scene.tweens.timeScale = f;
    scene.anims.globalTimeScale = f;
  };
  const ui = new CinematicUi(finish, { instantBars: true, onSpeed: speed });
  const baseZoom = cam.zoom;
  api.lock(true);
  document.getElementById("ui")!.classList.add("cinematic");
  cam.fadeIn(1200, 5, 6, 11);
  cam.setZoom(baseZoom * 1.2);

  (async () => {
    // Walk up the road.
    const half = Math.max(1, Math.ceil(api.path.length / 2));
    const intro = ui.say(`hero_${cls}`, ARRIVAL_LINE[cls], 3200, wait);
    await walk(api.path.slice(0, half));
    hero.play2("idle");
    await intro;
    if (over) return;
    // Goblins jump out of the woods: the hero cuts them down.
    hero.play2("idle");
    ui.hideText();
    await ambush();
    if (over) return;
    // Walk on, stop and look toward the smoke over the village.
    const line = ui.say("onward", L("A estrada para Minhau estava tomada. E a vila precisava dele.", "The road to Minhau was overrun. And the village needed a hero."), 3600, wait);
    await walk(api.path.slice(half));
    if (over) return;
    hero.play2("idle");
    hero.face(api.village.x - hero.x, api.village.y - hero.y);
    await line;
    if (over) return;
    await signature();
    if (over) return;
    await wait(700);
    ui.hideText();
    ui.title(cls);
    cine.play("title", 0.8);
    cam.zoomTo(baseZoom, 1600, "Sine.easeInOut");
    await ui.say("last", L("E assim começa a sua lenda.", "And so your legend begins."), 2600, wait);
    finish();
  })();

  async function walk(points: { x: number; y: number }[]) {
    if (!points.length) return;
    hero.play2("walk");
    for (const p of points) {
      if (over) return;
      hero.face(p.x - hero.x, p.y - hero.y);
      const dist = Phaser.Math.Distance.Between(hero.x, hero.y, p.x, p.y);
      await new Promise<void>((r) => scene.tweens.add({ targets: hero, x: p.x, y: p.y, duration: dist * 22, onComplete: () => r() }));
    }
    hero.play2("idle");
  }

  /** Three goblins charge in (those already on screen first, the rest from the woods ahead); the hero kills them. */
  async function ambush() {
    const ahead = api.path[api.path.length - 1] ?? api.village;
    const base = Math.atan2(ahead.y - hero.y, ahead.x - hero.x);
    const style = STYLE[cls];
    cine.play("ambush", 0.9);
    api.shake(250, 0.004);
    // Everything visible from here or from where control is handed over (at the normal zoom).
    const vw = cam.width / baseZoom / 2 + 24, vh = cam.height / baseZoom / 2 + 24;
    const seen = new Set<KilnSprite>();
    const list: ArrivalFoe[] = [];
    for (const c of [hero, ahead]) {
      for (const f of api.foesIn(new Phaser.Geom.Rectangle(c.x - vw, c.y - vh, vw * 2, vh * 2))) {
        if (!seen.has(f.spr)) list.push(f);
        seen.add(f.spr);
      }
    }
    const dist = (f: ArrivalFoe) => Phaser.Math.Distance.Between(f.spr.x, f.spr.y, hero.x, hero.y);
    list.sort((a, b) => dist(a) - dist(b)).splice(3);
    [-0.7, 0.15, 0.85].slice(list.length).forEach((off, i) => {
      const a = base + off, r = 95 + i * 18;
      const f = api.foe(hero.x + Math.cos(a) * r, hero.y + Math.sin(a) * r);
      if (f) {
        f.spr.setAlpha(0);
        scene.tweens.add({ targets: f.spr, alpha: 1, duration: 250 });
        list.push(f);
      }
    });
    list.sort((a, b) => dist(a) - dist(b));
    const foes = list.map((f, i) => {
      // Charge at the hero (melee stops at arm's length; against ranged heroes they never get there).
      const stop = style.reach || 26;
      const d = Math.max(dist(f), stop + 1);
      const tx = hero.x + ((f.spr.x - hero.x) / d) * stop, ty = hero.y + ((f.spr.y - hero.y) / d) * stop;
      f.spr.face(hero.x - f.spr.x, hero.y - f.spr.y);
      const arrived = new Promise<void>((r) => scene.time.delayedCall(i * 300, () => {
        if (!f.spr.active) return r();
        f.spr.play2("walk");
        if (i % 2) cine.play("laugh", 0.5);
        scene.tweens.add({ targets: f.spr, x: tx, y: ty, duration: (d - stop) * 14, onComplete: () => {
          if (f.spr.active) f.spr.play2("attack", { restart: true });
          r();
        } });
      }));
      return { f, arrived };
    });
    await wait(style.reach ? 0 : 450);
    for (const [i, { f, arrived }] of foes.entries()) {
      if (over) return;
      if (style.reach) await arrived;
      else await wait(i ? 220 : 0);
      if (over) return;
      hero.face(f.spr.x - hero.x, f.spr.y - hero.y);
      hero.play2("attack", { restart: true });
      sfx.skill(style.skill, style.reach ? "swing" : style.skill === "arrow" ? "bow" : "cast");
      await wait(style.reach ? 200 : 240);
      if (style.tex) await shot(style.tex, f.spr);
      scene.tweens.killTweensOf(f.spr);
      f.kill(style.death, Math.atan2(f.spr.y - hero.y, f.spr.x - hero.x));
      if (i === foes.length - 1) {
        api.shake(220, 0.006);
        await wait(900);
      } else await wait(style.reach ? 120 : 160);
    }
    hero.play2("idle");
  }

  /** A projectile that homes on a moving target. */
  function shot(tex: string, target: KilnSprite) {
    const sx = hero.x, sy = hero.y - 14;
    const img = scene.add.image(sx, sy, tex).setDepth(1e5);
    if (tex !== "fx_arrow") img.setBlendMode(Phaser.BlendModes.ADD);
    const dist = Phaser.Math.Distance.Between(sx, sy, target.x, target.y);
    return new Promise<void>((r) => scene.tweens.addCounter({
      from: 0, to: 1, duration: Math.max(90, dist * 2.6),
      onUpdate: (tw) => {
        const t = tw.getValue() ?? 0;
        const x = Phaser.Math.Linear(sx, target.x, t), y = Phaser.Math.Linear(sy, target.y - 12, t);
        img.setRotation(Math.atan2(y - img.y, x - img.x)).setPosition(x, y);
      },
      onComplete: () => { img.destroy(); r(); },
    }));
  }

  async function signature() {
    const x = hero.x, y = hero.y;
    const dir = { x: api.village.x - x, y: api.village.y - y };
    const len = Math.hypot(dir.x, dir.y) || 1;
    const ax = x + (dir.x / len) * 70, ay = y + (dir.y / len) * 70;
    if (cls === "archer") {
      hero.play2("attack", { restart: true });
      await wait(280);
      const arrow = scene.add.image(x, y - 12, "fx_arrow").setRotation(Math.atan2(ay - y, ax - x)).setDepth(1e5);
      sfx.hit(false);
      await new Promise<void>((r) => scene.tweens.add({ targets: arrow, x: ax, y: ay - 12, duration: 220, onComplete: () => r() }));
      arrow.destroy();
      api.burst("dust", 14, ax, ay);
      api.ring(ax, ay, 18, 0xffe14d, 300);
      return;
    }
    hero.play2("cast", { restart: true });
    await wait(280);
    if (cls === "barbarian") {
      sfx.boss();
      api.shake(500, 0.012);
      api.ring(x, y, 60, 0xe0662a, 500);
      for (let i = 0; i < 4; i++) scene.time.delayedCall(i * 90, () => api.burst("dust", 20, x + (Math.random() - 0.5) * 40, y));
    } else if (cls === "mage") {
      sfx.levelUp();
      api.ring(x, y - 12, 40, 0xfe6607, 500);
      for (let i = 0; i < 8; i++) scene.time.delayedCall(i * 70, () => api.burst("fire", 10, x + 6, y - 22));
    } else {
      sfx.boss();
      api.ring(x, y - 10, 40, 0x5dff3d, 500);
      for (let i = 0; i < 8; i++) scene.time.delayedCall(i * 70, () => api.burst("shadow", 10, x + 6, y - 18));
    }
    cam.flash(160, 255, 230, 180);
    await wait(700);
  }
}
