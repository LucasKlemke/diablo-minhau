import Phaser from "phaser";
import { cine } from "../game/audio";
import type { HeroData } from "../game/hero";
import { hasSprite, KilnSprite } from "../kiln";
import { blobTile } from "../world/autotile";
import { CinematicUi } from "../ui/cinematic";
import { openMainMenu } from "../ui/menu";

// Opening cutscene, played once for a new character: the goblin war camp and the worried village at
// dusk, built from the game's SpriteKiln sprites. It then hands over to the game in cinematic mode, where
// the hero arrives on the real starting road (game/arrival.ts) and the player takes control right there.

const NARRATION = {
  open: "Há gerações, a vila Minhau vivia em paz entre campos e florestas.",
  drums: "Até que, numa noite sem lua, tambores de guerra ecoaram na mata.",
  grumm: "Grumm, o Rei Goblin, reuniu sua horda... e escolheu seu alvo.",
  village: "Na vila, o Ancião Bento viu a fumaça subir da floresta. E rezou por um herói.",
};

/** World x of each diorama (they are built side by side and the camera cuts between them). */
const SHOT = { camp: 0, village: 1200 };

export class IntroScene extends Phaser.Scene {
  private hero?: HeroData;
  /** Watched again from the Cinematics menu: it returns there at the end. */
  private replay = false;
  private ui!: CinematicUi;
  private ended = false;
  private embers!: Phaser.GameObjects.Particles.ParticleEmitter;
  private smoke!: Phaser.GameObjects.Particles.ParticleEmitter;
  /** Fades out the looping sounds that are playing. */
  private loops: ((fade?: number) => void)[] = [];

  constructor() {
    super("intro");
  }

  init(data: { hero?: HeroData; replay?: boolean }) {
    this.hero = data.hero;
    this.replay = !!data.replay;
    this.ended = false;
  }

  create() {
    const cam = this.cameras.main;
    cam.setBackgroundColor("#05060b");
    cam.setZoom(Math.max(2, Math.min(4, Math.round(Math.min(window.innerWidth / 400, window.innerHeight / 250)))));

    const px = (tint: number | number[], cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig) =>
      this.add.particles(0, 0, "px", { emitting: false, tint, ...cfg }).setDepth(1e5);
    this.embers = px([0xffd27a, 0xff7a2a], { speed: { min: 10, max: 30 }, angle: { min: 250, max: 290 }, lifespan: 1600, scale: { start: 1, end: 0 }, gravityY: -15 });
    this.smoke = px([0x3a3438, 0x5a5258, 0x2a2428], { speed: { min: 4, max: 12 }, angle: { min: 260, max: 280 }, lifespan: 5000, scale: { start: 2, end: 5 }, alpha: { start: 0.7, end: 0 } });

    this.buildCamp();
    this.buildVillage();
    document.getElementById("ui")!.querySelector(".mm")?.remove();
    this.ui = new CinematicUi(() => this.finish(false), { onSpeed: (f) => this.setSpeed(f) });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.setSpeed(1);
      this.ui.close(false);
      this.stopLoops(0.4);
    });
    this.play();
  }

  // ---------- Dioramas ----------

  /** Farm RPG grass over dirt (same autotile as the game); `dirt(tx, ty)` carves paths and clearings. */
  private ground(x0: number, dirt: (tx: number, ty: number) => boolean = () => false, w = 56, h = 34) {
    const ox = x0 - (w / 2) * 16, oy = -(h / 2) * 16;
    this.add.tileSprite(ox, oy, w * 16, h * 16, "dirt").setOrigin(0).setDepth(-1e6);
    const grass = (x: number, y: number) => x < 0 || y < 0 || x >= w || y >= h || !dirt(x, y);
    const data = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => (grass(x, y) ? blobTile(grass, x, y) : -1)));
    const map = this.make.tilemap({ data, tileWidth: 16, tileHeight: 16 });
    map.createLayer(0, map.addTilesetImage("grass")!, ox, oy)!.setDepth(-9e5);
    // Scattered tufts.
    for (let i = 0; i < 70; i++) {
      const tx = Math.floor(Math.random() * w), ty = Math.floor(Math.random() * h);
      if (!grass(tx, ty)) continue;
      this.add.image(ox + tx * 16 + 8, oy + ty * 16 + 16, "crops", [44, 45, 46, 72, 100, 101][i % 6]).setOrigin(0.5, 1).setDepth(-8e5);
    }
  }

  private tree(x: number, y: number) {
    this.add.image(x, y, "tree", Math.random() < 0.6 ? "big" : "medium").setOrigin(0.5, 1).setDepth(y);
  }

  /** Night-time goblin war camp around a fire, Grumm behind it. */
  private buildCamp() {
    const x0 = SHOT.camp;
    this.ground(x0, (tx, ty) => Math.hypot(tx - 28, (ty - 17.6) * 1.4) < 6.5);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      this.tree(x0 + Math.cos(a) * (170 + Math.random() * 60), Math.sin(a) * (110 + Math.random() * 40) + 20);
    }
    const fire = hasSprite("campfire") ? new KilnSprite(this, x0, 10, "campfire") : null;
    fire?.play2("idle");
    fire?.setDepth(10);
    this.add.image(x0, 6, "disc").setTint(0xff7a2a).setScale(4, 2.4).setAlpha(0.35).setBlendMode(Phaser.BlendModes.ADD).setDepth(1e4);
    this.time.addEvent({ delay: 120, loop: true, callback: () => this.embers.explode(2, x0 + (Math.random() - 0.5) * 12, -4) });
    // Dancing goblins.
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.3;
      const g = new KilnSprite(this, x0 + Math.cos(a) * 48, 10 + Math.sin(a) * 28, "goblin");
      g.face(x0 - g.x, 10 - g.y);
      g.setDepth(g.y);
      const dance = () => g.play2(Math.random() < 0.5 ? "attack" : "idle", { restart: true, onComplete: dance });
      this.time.delayedCall(i * 140, dance);
    }
    const grumm = new KilnSprite(this, x0, -38, "goblin");
    grumm.setScale(1.6).setTint(0xffd36b).setDepth(-38);
    grumm.face(0, 1);
    grumm.play2("idle");
    grumm.setName("grumm");
    // Night: a cold blue multiply over the whole camp.
    this.add.rectangle(x0, 0, 900, 520, 0x3a4a90).setBlendMode(Phaser.BlendModes.MULTIPLY).setDepth(9e4);
  }

  /** The village at dusk, the Elder looking at smoke over the forest. */
  private buildVillage() {
    const x0 = SHOT.village;
    this.ground(x0, (tx, ty) => Math.abs(tx - 28) <= 2 || (Math.abs(tx - 28) < 9 && Math.abs(ty - 19) < 4));
    const house = (x: number, y: number, v: number) => {
      if (hasSprite("house")) new KilnSprite(this, x + 40, y, "house").setDepth(y).play2("idle");
      else this.add.image(x, y, "house", `h${v}`).setOrigin(0, 1).setDepth(y);
    };
    house(x0 - 170, -10, 0);
    house(x0 + 80, -10, 1);
    house(x0 - 170, 120, 1);
    house(x0 + 80, 120, 0);
    for (let i = 0; i < 12; i++) this.tree(x0 + (Math.random() - 0.5) * 800, -150 - Math.random() * 60);
    const elder = new KilnSprite(this, x0 + 10, 40, "npc_elder");
    elder.setDepth(40);
    elder.face(1, -1);
    elder.play2("idle");
    this.time.addEvent({ delay: 160, loop: true, callback: () => this.smoke.explode(2, x0 + 160 + Math.random() * 20, -170) });
    this.add.rectangle(x0, 0, 900, 520, 0xe09060).setBlendMode(Phaser.BlendModes.MULTIPLY).setDepth(9e4);
  }

  // ---------- Timeline ----------

  private async play() {
    const cam = this.cameras.main;
    const wait = (ms: number) => new Promise<void>((r) => this.time.delayedCall(ms, () => r()));

    // 1. Black, the old peace.
    cam.centerOn(SHOT.camp, 0);
    cam.fadeOut(0);
    this.loops.push(cine.loop("night", 0.45, 2));
    await this.say("open", NARRATION.open, 3600);
    if (this.ended) return;

    // 2. The goblin camp.
    cam.fadeIn(1200);
    const fire = cine.loop("fire", 0.55, 1.2);
    this.loops.push(fire);
    // Goblins cackling around the fire.
    const laughs = this.time.addEvent({ delay: 1300, loop: true, callback: () => Math.random() < 0.75 && cine.play("laugh", 0.45 + Math.random() * 0.3) });
    cam.centerOn(SHOT.camp - 120, 10);
    cam.pan(SHOT.camp, 0, 6000, "Sine.easeInOut");
    await this.say("drums", NARRATION.drums, 3200);
    const drums = cine.loop("drums", 0.8, 0.4);
    this.loops.push(drums);
    const beat = this.time.addEvent({ delay: 520, loop: true, callback: () => cam.shake(60, 0.0015) });
    await this.say("grumm", NARRATION.grumm, 1600);
    if (this.ended) return;
    const grumm = this.children.getByName("grumm") as KilnSprite;
    cam.zoomTo(cam.zoom * 1.4, 900, "Quad.easeIn");
    cam.pan(SHOT.camp, -30, 900, "Quad.easeIn");
    await wait(900);
    grumm.play2("attack", { restart: true, timeScale: 0.6, onComplete: () => grumm.play2("idle") });
    cine.play("grumm", 1);
    this.time.delayedCall(700, () => cine.play("cheer", 0.8));
    cam.shake(400, 0.01);
    cam.flash(200, 180, 30, 20);
    await wait(1600);
    beat.remove();
    laughs.remove();
    drums(1.2);
    fire(1.2);
    cam.fadeOut(700);
    await wait(750);
    if (this.ended) return;

    // 3. The village at dusk.
    cam.zoomTo(cam.zoom / 1.4, 0);
    cam.centerOn(SHOT.village, 30);
    cam.fadeIn(900);
    cam.pan(SHOT.village + 60, -40, 5500, "Sine.easeInOut");
    this.time.delayedCall(600, () => cine.play("bell", 0.6));
    await this.say("village", NARRATION.village, 5000);
    cam.fadeOut(700);
    await wait(750);
    if (this.ended) return;

    // 4. Into the game: the hero arrives on the real starting road.
    this.finish(true);
  }

  /** `arrive`: continue with the in-game arrival; false when the player skipped the whole intro. */
  private finish(arrive: boolean) {
    if (this.ended) return;
    this.ended = true;
    const d = this.hero;
    if (this.replay || !d) {
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => window.setTimeout(openMainMenu));
      this.scene.stop();
      return;
    }
    d.quest.prologueSeen = true; // the cutscene replaces the old prologue dialogue
    d.save();
    this.scene.start("game", { hero: d, cinematic: arrive });
  }

  /** Holding the button runs the whole scene faster: timeline, tweens, animations and particles. */
  private setSpeed(f: number) {
    this.time.timeScale = f;
    this.tweens.timeScale = f;
    this.anims.globalTimeScale = f;
    for (const e of [this.embers, this.smoke]) if (e) e.timeScale = f;
  }

  private stopLoops(fade = 0.8) {
    for (const stop of this.loops) stop(fade);
    this.loops = [];
  }

  /** Narration on the scene clock. */
  private say(key: string, text: string, hold: number) {
    return this.ui.say(key, text, hold, (ms) => new Promise<void>((r) => this.time.delayedCall(ms, () => r())));
  }
}
