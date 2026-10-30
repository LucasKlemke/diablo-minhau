import Phaser from "phaser";
import { cine, setMusic } from "../game/audio";
import { Director } from "../game/cutscene";
import type { HeroData } from "../game/hero";
import { hasSprite, kilnMeta, type KilnSprite } from "../kiln";
import { CinematicUi } from "../ui/cinematic";
import { openMainMenu, showWaiting } from "../ui/menu";
import { net } from "../net/net";
import { awaitWelcome, stopWelcome, welcomeData } from "../net/session";
import { L } from "../i18n";

// Act I prologue, played once for a new character, built in the engine from SpriteKiln sprites:
// 1. Ten years ago: the white marble court of Minhau. Jimmy (Princess Sarah's yorkshire) throws a tantrum,
//    runs into the storm and comes back as Jimmynelson; the First Guardian is thrown through the stained glass.
// 2. Today: the guardian wakes up in Aldo's hut. Then the game starts in the village (GameScene.awaken).

const T = {
  court: L("Dez anos atrás, o grande salão de Minhau reluzia em mármore branco.", "Ten years ago, the great hall of Minhau gleamed in white marble."),
  sarahFeed: L("Come direitinho, Jimmy. Isso, bom menino...", "Eat up, Jimmy. That's it, good boy..."),
  sarahScold: L("Jimmy! Não rosne para a Lisa! Ela só veio dar oi!", "Jimmy! Don't growl at Lisa! She only came to say hi!"),
  aldoSigh: L("Esse cachorro ainda vai nos causar problemas, minha filha.", "That dog is going to cause us trouble one day, my girl."),
  storm: L("Naquela noite, algo voltou da tempestade.", "That night, something came back from the storm."),
  sarahScream: L("Jimmy...? JIMMY, NÃO!", "Jimmy...? JIMMY, NO!"),
  guardian: L("O Primeiro Guardião de Minhau saltou para defender a princesa.", "The First Guardian of Minhau leapt to defend the princess."),
  fall: L("E caiu nas sombras do abismo.", "And fell into the shadows of the abyss."),
  aldoCry: L("SARAH!", "SARAH!"),
  years: L("Dez anos depois.", "Ten years later."),
  aldo1: L("Fique deitado... por favor. Foram dez longos anos trocando unguentos nas suas feridas.", "Stay down... please. Ten long years of changing the salves on your wounds."),
  aldo2: L("Quando o recolhi nas pedras do rio, pensei que a magia de Sarah tivesse partido com ela.", "When I pulled you from the river stones, I thought Sarah's magic had left with her."),
  aldo3: L("Mas o eco da bênção da minha filha manteve seu coração batendo.", "But the echo of my daughter's blessing kept your heart beating."),
  reveal: L("No reflexo da bacia: uma coroa de ferro amassada, escondida sob o capuz de camponês.", "In the basin's reflection: a dented iron crown, hidden under a peasant's hood."),
  aldo4: L("Sim, meu leal guardião... eu sou Aldo. Perdi meu trono, perdi meu castelo, perdi minha Sarah.", "Yes, my loyal guardian... I am Aldo. I lost my throne, my castle, my Sarah."),
  aldo5: L("Minhau não passa de um punhado de cabanas sitiadas por ladrões e criaturas imundas.", "Minhau is nothing but a handful of huts besieged by thieves and filthy creatures."),
  aldo6: L("Mas você abriu os olhos. E enquanto houver um guardião respirando, Minhau ainda não morreu.", "But you opened your eyes. And as long as a guardian still breathes, Minhau is not dead."),
};

/** World x of each set (built side by side; the camera cuts between them). */
const SET = { castle: 0, cabin: 1400 };
/** Throne room bounds (relative to SET.castle): the back wall's floor line, the far end, the half width,
 * and where the gate and the stained-glass window sit on the back wall. */
/** Top-left corner of Aldo's hut (14x10 tiles; its back wall's floor line is at y + 48). */
const HUT = { x: SET.cabin - 112, y: -128 };
const CASTLE = { top: -112, bottom: 176, half: 288, gateX: -112, windowX: 144 };
const C = {
  marble: 0xe9e4d8, marbleDark: 0xc9c2b2, wall: 0x8f8678, wallTop: 0x5d564c, carpet: 0xa8262c, carpetEdge: 0xe0b04a,
  plank: 0x6e4227, plankDark: 0x4a2a18, hutWall: 0x3f2618,
};

export class IntroScene extends Phaser.Scene {
  private hero?: HeroData;
  /** Watched again from the Cinematics menu: it returns there at the end. */
  private replay = false;
  /** Watched together in a session: the host's end (or skip) ends it for the guest too. */
  private coop = false;
  private ui!: CinematicUi;
  private dir!: Director;
  private ended = false;
  private fog!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private glass!: Phaser.GameObjects.Particles.ParticleEmitter;
  private blood!: Phaser.GameObjects.Particles.ParticleEmitter;
  /** Castle pieces that get destroyed: the columns, the hangings on the wall, the throne. */
  private columns: { x: number; y: number; obj: Phaser.GameObjects.GameObject }[] = [];
  private hangings: { name: "castle_tapestry" | "castle_banner"; x: number; obj: Phaser.GameObjects.GameObject }[] = [];
  private throne?: Phaser.GameObjects.GameObject;
  private fires: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  private baseZoom = 3;
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  /** Fades out the looping sounds that are playing. */
  private loops: ((fade?: number) => void)[] = [];
  private cast: Record<string, KilnSprite> = {};
  private gate!: KilnSprite;
  private window!: KilnSprite;
  private candleGlows: Phaser.GameObjects.Image[] = [];
  private basin: KilnSprite | null = null;
  private hutHole = { x: 0, y: 0 };

  constructor() {
    super("intro");
  }

  init(data: { hero?: HeroData; replay?: boolean; coop?: boolean }) {
    this.hero = data.hero;
    this.replay = !!data.replay;
    this.coop = !!data.coop && net.active;
    this.ended = false;
    this.cast = {};
    this.candleGlows = [];
    this.columns = [];
    this.hangings = [];
    this.fires = [];
  }

  create() {
    setMusic(null);
    const cam = this.cameras.main;
    cam.setBackgroundColor("#05060b");
    // Close enough that the hall fills the screen.
    this.baseZoom = Math.max(2, Math.min(5, Math.round(Math.min(window.innerWidth / 380, window.innerHeight / 270))));
    // The hall must fill the screen's width (no void past its side walls).
    cam.setZoom(Math.max(this.baseZoom, Math.ceil(window.innerWidth / ((CASTLE.half + 16) * 2))));

    const px = (tint: number | number[], cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig) =>
      this.add.particles(0, 0, "px", { emitting: false, tint, ...cfg }).setDepth(1e5);
    // Soft round puffs of the beast's stinking fog.
    this.fog = this.add.particles(0, 0, "disc", { emitting: false, tint: [0x9ab04a, 0x6a7a2a, 0xb8c070], speed: { min: 6, max: 26 }, lifespan: 2600,
      scale: { start: 0.08, end: 0.32 }, alpha: { start: 0.4, end: 0 } }).setDepth(1e5);
    this.sparks = px([0xffd27a, 0xff7a2a, 0xffb040], { speed: { min: 10, max: 40 }, angle: { min: 240, max: 300 }, lifespan: 1400, scale: { start: 1, end: 0 }, gravityY: -20 });
    this.blood = px([0x8a0f1a, 0xc1272d, 0x5a0710, 0xe0404a], { speed: { min: 50, max: 170 }, angle: { min: 200, max: 340 }, lifespan: { min: 400, max: 900 },
      scale: { start: 1.6, end: 0.5 }, gravityY: 320 });
    this.glass = px([0x6fb8ff, 0xff6a8a, 0xffe14d, 0x7bea6a], { speed: { min: 40, max: 120 }, lifespan: 900, scale: { start: 1.2, end: 0.4 }, gravityY: 180 });
    this.dust = px([0xd8c8a0, 0xfff2d0], { speed: { min: 1, max: 5 }, angle: { min: 80, max: 100 }, lifespan: 4000, scale: { start: 0.8, end: 0 }, alpha: { start: 0.6, end: 0 } });

    document.getElementById("ui")!.querySelector(".mm")?.remove();
    this.ui = new CinematicUi(() => this.finish(), { onSpeed: (f) => this.setSpeed(f) });
    this.dir = new Director(this, this.ui);
    this.buildCastle();
    this.buildCabin();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.dir.ended = true;
      this.setSpeed(1);
      this.ui.close(false);
      this.stopLoops(0.4);
    });
    if (this.coop && net.role === "guest") {
      net.clearHandlers();
      net.on("intro_skip", () => this.finish());
      net.on("bye", () => {
        net.leave(); // the host left: go on alone
        this.coop = false;
        this.finish();
      });
    }
    void this.play();
  }

  // ---------- Sets ----------

  /** The throne room, built from the castle props: a seamless marble floor, the back wall with its frieze
   * (the great gate on the left, the stained-glass window on the right), tapestries and banners, the throne
   * on its dais, lilies, lit candelabra, columns and the carpet down the middle. */
  private buildCastle() {
    const x0 = SET.castle, d = this.dir;
    // Thick dark stone around the hall (wider screens see past its walls).
    this.add.rectangle(x0, 0, 1400, 900, 0x1e171c).setDepth(-1e6 - 1);
    const has = (n: Parameters<typeof hasSprite>[0]) => hasSprite(n);
    // Floor: 32 px tiles, a variant per cell from a hash.
    if (has("castle_floor")) {
      const frames = kilnMeta("castle_floor")!.animations.variants?.directions.s?.frames ?? kilnMeta("castle_floor")!.animations.idle.directions.s!.frames;
      for (let ty = CASTLE.top; ty < CASTLE.bottom; ty += 32)
        for (let tx = -CASTLE.half; tx < CASTLE.half; tx += 32)
          this.add.image(x0 + tx + 16, ty + 16, "castle_floor", frames[((tx * 7 + ty * 13) >>> 0) % frames.length]).setDepth(-1e6);
    } else {
      this.add.rectangle(x0, (CASTLE.top + CASTLE.bottom) / 2, CASTLE.half * 2, CASTLE.bottom - CASTLE.top, C.marble).setDepth(-1e6);
    }
    // Back wall every 64 px, side walls every 32 px.
    for (let x = -CASTLE.half + 32; x < CASTLE.half; x += 64)
      d.prop("castle_wall_back", x0 + x, CASTLE.top, () => this.add.rectangle(x0 + x, CASTLE.top - 30, 64, 60, C.wall)).setDepth(CASTLE.top - 40);
    for (let y = CASTLE.top + 16; y < CASTLE.bottom + 32; y += 32)
      for (const sx of [-1, 1])
        d.prop("castle_wall_side", x0 + sx * (CASTLE.half + 8), y, () => this.add.rectangle(x0 + sx * (CASTLE.half + 8), y, 16, 32, C.wallTop)).setDepth(9e3);
    // On the wall: the gate (left), tapestries, a banner and the stained-glass window (right).
    const wallDeco = (name: "castle_tapestry" | "castle_banner", x: number) => {
      const obj = d.prop(name, x0 + x, CASTLE.top, () => this.add.rectangle(x0 + x, CASTLE.top - 24, 22, 34, 0x2c60d5)).setDepth(CASTLE.top - 30);
      this.hangings.push({ name, x: x0 + x, obj: obj as Phaser.GameObjects.GameObject });
    };
    wallDeco("castle_tapestry", -48);
    wallDeco("castle_tapestry", 48);
    wallDeco("castle_banner", 96);
    wallDeco("castle_banner", -176 + 16);
    wallDeco("castle_tapestry", -232);
    wallDeco("castle_banner", 200);
    wallDeco("castle_tapestry", 252);
    this.gate = d.actor("castle_gate", x0 + CASTLE.gateX, CASTLE.top, [0, 1]);
    this.gate.setDepth(CASTLE.top - 20);
    this.window = d.actor("castle_window", x0 + CASTLE.windowX, CASTLE.top, [0, 1]);
    this.window.setDepth(CASTLE.top - 20);
    // The throne on its dais, lilies, candelabra with warm glows, the bowl.
    this.throne = d.prop("castle_throne", x0, -78, () => this.add.rectangle(x0, -90, 30, 34, 0xe0b04a)) as Phaser.GameObjects.GameObject;
    for (const sx of [-1, 1]) d.prop("castle_lily_vase", x0 + sx * 40, -76, () => this.add.rectangle(x0 + sx * 40, -82, 8, 12, 0xffffff));
    for (const sx of [-1, 1]) {
      const cx = x0 + sx * 44, cy = -30;
      d.actor("castle_candelabrum", cx, cy, [0, 1]);
      const glow = this.add.image(cx, cy - 22, "disc").setTint(0xffb050).setScale(1.3, 1).setAlpha(0.35).setBlendMode(Phaser.BlendModes.ADD).setDepth(9e4 + 1);
      this.tweens.add({ targets: glow, alpha: 0.22, duration: 300 + Math.random() * 200, yoyo: true, repeat: -1 });
      this.candleGlows.push(glow);
    }
    d.prop("golden_bowl", x0 - 34, -44, () => this.add.ellipse(x0 - 34, -46, 8, 4, 0xffd36b));
    // Carpet from the dais down the hall (two pieces end to end), on the floor layer.
    for (const y of [-2, 110]) d.prop("castle_carpet", x0, y, () => this.add.rectangle(x0, y, 40, 112, C.carpet)).setDepth(-9e5);
    for (const sx of [-1, 1]) for (const y of [-6, 70, 146]) for (const cx of [124, 236]) {
      const obj = d.prop("castle_column", x0 + sx * cx, y, () => this.add.rectangle(x0 + sx * cx, y - 22, 12, 44, 0xf4f0e6));
      this.columns.push({ x: x0 + sx * cx, y, obj: obj as Phaser.GameObjects.GameObject });
    }

    const cls = this.hero?.cls ?? "barbarian";
    this.cast.aldo = d.actor("aldo_young", x0, -80, [0, 1]);
    this.cast.aldo.setDepth(-70);
    this.cast.sarah = d.actor("sarah_young", x0 - 20, -40, [-1, 0.4]);
    this.cast.jimmy = d.actor("jimmy_pup", x0 - 40, -38, [1, 0], { tint: 0xd8a860, scale: 0.6 });
    this.cast.lisa = d.actor("lisa", x0 + 170, 10, [-1, 0], { tint: 0xb07a50, scale: 0.85 });
    this.cast.hero = d.actor(cls, x0 + 30, -36, [-1, 0.5]);
    this.cast.guard1 = d.actor("royal_guard", x0 + CASTLE.gateX - 30, CASTLE.top + 22, [1, 1], { tint: 0x8fb0ff });
    this.cast.guard2 = d.actor("royal_guard", x0 + CASTLE.gateX + 30, CASTLE.top + 22, [-1, 1], { tint: 0x8fb0ff });
    // Warm candle light, and the red storm light shown on the cut.
    this.add.rectangle(x0, 20, 900, 460, 0xfff0d8).setBlendMode(Phaser.BlendModes.MULTIPLY).setDepth(9e4).setName("castleLight");
    this.add.rectangle(x0, 20, 900, 460, 0x7a4a68).setBlendMode(Phaser.BlendModes.MULTIPLY).setDepth(9e4).setAlpha(0).setName("stormLight");
  }

  /** Aldo's hut (14x10 tiles), laid out from the hut props: plank floor, the back wall with a hole in the
   * thatch, herbs, a shelf of salves, the door, the hearth; the bed, table, basin and the old royal chest. */
  private buildCabin() {
    const d = this.dir;
    // Room-local pixel -> world (the back wall's floor line at HUT.y + 48).
    const at = (x: number, y: number) => ({ x: HUT.x + x, y: HUT.y + y });
    const put = (name: Parameters<typeof hasSprite>[0], x: number, y: number, anim?: string) => {
      const p = at(x, y);
      const a = d.actor(name, p.x, p.y, [0, 1]);
      if (anim && a.has(anim)) a.play2(anim);
      return a;
    };
    if (hasSprite("hut_floor")) this.add.tileSprite(HUT.x, HUT.y + 32, 224, 128, "hut_floor", kilnMeta("hut_floor")!.animations.idle.directions.s!.frames[0]).setOrigin(0).setDepth(-1e6);
    else this.add.rectangle(HUT.x + 112, HUT.y + 96, 224, 128, C.plank).setDepth(-1e6);
    if (hasSprite("hut_rug")) put("hut_rug", 104, 116).setDepth(-9e5);
    if (hasSprite("hut_wall_back"))
      for (const [x, hole] of [[32, false], [96, true], [160, false], [192, false]] as const) put("hut_wall_back", x, 48, hole ? "idle" : "plain").setDepth(HUT.y);
    for (const [name, x] of [["hanging_herbs", 40], ["hut_shelf", 72], ["hut_door", 120], ["hearth", 164]] as const)
      if (hasSprite(name)) put(name, x, 48).setDepth(HUT.y + 1);
    for (const [name, x, y] of [["straw_bed", 46, 74], ["hut_candle", 78, 72], ["firewood", 190, 66], ["hut_table", 150, 108],
      ["hut_stool", 126, 112], ["hut_stool", 176, 114], ["royal_chest", 188, 146]] as const)
      if (hasSprite(name)) put(name, x, y);
    this.basin = hasSprite("wash_basin") ? put("wash_basin", 36, 124) : null;
    if (hasSprite("hut_wall_side"))
      for (let k = 0; k < 5; k++) {
        put("hut_wall_side", 8, 16 + 32 * k).setDepth(9e3);
        put("hut_wall_side", 216, 16 + 32 * k, "right").setDepth(9e3);
      }
    // Warm lights: the hearth, the candles; a dusty shaft of daylight through the hole in the thatch.
    const glow = (x: number, y: number, sx: number, a: number) => {
      const p = at(x, y);
      const g = this.add.image(p.x, p.y, "disc").setTint(0xff9a40).setScale(sx, sx * 0.7).setAlpha(a).setBlendMode(Phaser.BlendModes.ADD).setDepth(9e4 + 1);
      this.tweens.add({ targets: g, alpha: a * 0.6, duration: 260 + Math.random() * 200, yoyo: true, repeat: -1 });
    };
    glow(164, 41, 2.6, 0.32);
    glow(158, 85, 1, 0.3);
    glow(78, 59, 0.9, 0.3);
    const hole = at(107, 2);
    this.add.rectangle(hole.x - 14, hole.y + 62, 16, 140, 0xfff2c0).setAngle(14).setAlpha(0.14).setBlendMode(Phaser.BlendModes.ADD).setDepth(9e4 + 1);
    this.hutHole = hole;

    const cls = this.hero?.cls ?? "barbarian";
    const bed = at(46, 74);
    this.cast.sleeper = d.actor(cls, bed.x - 2, bed.y - 2, [1, 0]);
    this.cast.sleeper.setAngle(-90).setDepth(bed.y + 1); // lying on the bed, head on the pillow
    const aldo = at(114, 92);
    this.cast.oldAldo = d.actor("npc_aldo", aldo.x, aldo.y, [-1, -0.3]);
    this.add.rectangle(HUT.x + 112, HUT.y + 80, 320, 260, 0x6a5a80).setBlendMode(Phaser.BlendModes.MULTIPLY).setDepth(9e4);
  }

  // ---------- Timeline ----------

  private async play() {
    const cam = this.cameras.main, d = this.dir, c = this.cast;
    const stop = () => d.ended || this.ended;

    // 1. The court, ten years ago.
    const X = SET.castle, gate = { x: X + CASTLE.gateX, y: CASTLE.top + 6 };
    // Keep the camera inside the hall (no void past the side walls).
    cam.setBounds(X - CASTLE.half - 16, CASTLE.top - 80, CASTLE.half * 2 + 32, CASTLE.bottom - CASTLE.top + 80);
    cam.centerOn(X, -60);
    cam.fadeOut(0);
    setMusic("court");
    await d.say("p_court", T.court, 3200);
    if (stop()) return;
    void d.fadeIn(1400);
    void d.pan(X - 10, -50, 4000);
    await d.anim(c.sarah, "cast");
    await d.line("p_feed", L("Princesa Sarah", "Princess Sarah"), T.sarahFeed, 2200);
    if (stop()) return;
    // Lisa trots in toward the bowl; Jimmy growls.
    await d.walk(c.lisa, [{ x: X - 6, y: -24 }], 55);
    c.lisa.face(-1, 0);
    c.jimmy.face(1, 0.3);
    cine.play("bark", 0.8);
    void d.anim(c.jimmy, "attack", 0.8);
    cam.shake(120, 0.002);
    await d.line("p_scold", L("Princesa Sarah", "Princess Sarah"), T.sarahScold, 2600);
    if (stop()) return;
    // The tantrum: Jimmy pees on the Persian carpet and bolts out of the great gate into the storm.
    await d.walk(c.jimmy, [{ x: X - 8, y: 10 }], 70);
    c.jimmy.face(1, 0);
    cine.play("pee", 0.7);
    await d.anim(c.jimmy, "cast", 0.7);
    this.add.ellipse(X - 1, 13, 12, 5, 0xe8d050, 0.85).setDepth(-8e5);
    await d.line("p_sigh", L("Rei Aldo", "King Aldo"), T.aldoSigh, 2400);
    if (stop()) return;
    this.gate.play2("open", { restart: true, onComplete: () => this.gate.play2("opened") });
    await d.walk(c.jimmy, [{ x: gate.x, y: gate.y + 16 }, gate], 110);
    c.jimmy.setVisible(false);
    await d.wait(500);
    if (stop()) return;

    // Hard cut: red lightning, drums, howls.
    cam.flash(160, 255, 40, 40);
    cine.play("thunder", 1);
    setMusic("attack");
    (this.children.getByName("castleLight") as Phaser.GameObjects.Rectangle).setAlpha(0);
    (this.children.getByName("stormLight") as Phaser.GameObjects.Rectangle).setAlpha(1);
    for (const g of this.candleGlows) g.setVisible(false);
    this.loops.push(cine.loop("drums", 0.7, 0.3));
    const strikes = this.time.addEvent({ delay: 2600, loop: true, callback: () => { cam.flash(120, 255, 30, 30); cine.play("thunder", 0.6); } });
    await d.say("p_storm", T.storm, 2400);
    if (stop()) return;

    // The gate bursts; Jimmynelson walks in wrapped in a stinking fog. The guards choke and fall.
    cam.pan(gate.x + 60, gate.y + 10, 900, "Quad.easeOut");
    await d.wait(900);
    cine.play("gate_break", 1);
    cam.shake(320, 0.005);
    this.gate.play2(this.gate.has("burst") ? "burst" : "idle", { restart: true, onComplete: () => this.gate.has("broken") && this.gate.play2("broken") });
    const beast = d.actor("jimmynelson", gate.x, gate.y, [0, 1], { tint: 0xc8a060, scale: 1.6 });
    const fogTimer = this.time.addEvent({ delay: 90, loop: true, callback: () => this.fog.explode(2, beast.x + (Math.random() - 0.5) * 40, beast.y - 10) });
    cine.play("roar", 0.8);
    await d.walk(beast, [{ x: gate.x + 10, y: gate.y + 50 }], 40);
    // The guards charge with their halberds... and the beast tears them apart.
    for (const gd of [c.guard1, c.guard2]) gd.face(beast.x - gd.x, beast.y - gd.y);
    void d.walk(c.guard1, [{ x: beast.x - 18, y: beast.y - 4 }], 90);
    await d.walk(c.guard2, [{ x: beast.x + 18, y: beast.y - 2 }], 90);
    void d.anim(c.guard1, "attack");
    await d.anim(c.guard2, "attack");
    for (const gd of [c.guard1, c.guard2]) {
      beast.face(gd.x - beast.x, gd.y - beast.y);
      cine.play("rend", 1);
      await d.anim(beast, beast.has("rend") ? "rend" : "attack", 1.2);
      this.gore(gd);
      await d.wait(250);
    }
    beast.face(-1, 0.4);
    cine.play("scream", 0.8);
    await d.line("p_scream", L("Princesa Sarah", "Princess Sarah"), T.sarahScream, 1800);
    if (stop()) return;

    // The First Guardian leaps between them; the roar throws them through the stained glass.
    cam.pan(X - 30, -40, 800);
    await d.walk(c.hero, [{ x: X - 46, y: 0 }], 160, "walk", 1.8);
    c.hero.face(-1, -0.6);
    void d.anim(c.hero, "attack");
    await d.say("p_guardian", T.guardian, 1800);
    if (stop()) return;
    beast.face(1, 0.7);
    cine.play("roar", 1);
    void d.anim(beast, "cast", 0.7);
    for (let i = 0; i < 18; i++) this.time.delayedCall(i * 30, () => this.fog.explode(5, beast.x + 16 + i * 4, beast.y - 30 + i * 1.5));
    cam.shake(600, 0.007);
    // The roar brings the hall down: columns topple, the hangings catch fire and the fire runs along the wall.
    this.time.delayedCall(300, () => this.devastate());
    await d.wait(400);
    const win = this.window;
    void d.anim(c.hero, "hit");
    cam.pan(X + 50, -70, 700);
    await new Promise<void>((r) => this.tweens.add({
      targets: c.hero, x: win.x, y: win.y - 30, angle: 540, duration: 700, ease: "Quad.easeIn", onUpdate: () => c.hero.setDepth(win.depth + 1), onComplete: () => r(),
    }));
    cine.play("glass", 1);
    this.glass.explode(40, win.x, win.y - 34);
    if (win.has("break")) win.play2("break", { restart: true, onComplete: () => win.play2("broken") });
    else win.setAlpha(0.35);
    this.tweens.add({ targets: c.hero, y: win.y - 60, alpha: 0, scale: 0.4, duration: 600, ease: "Quad.easeIn" });
    await d.say("p_fall", T.fall, 2200);
    if (stop()) return;

    // Last image: the beast takes the princess in its jaws and leaves through the gate; Aldo cries out.
    cam.pan(X - 30, -50, 900);
    cine.play("chains", 0.8);
    await d.walk(beast, [{ x: c.sarah.x - 14, y: c.sarah.y + 6 }], 60);
    cine.play("roar", 0.5);
    const carrier = beast.has("carry_walk") ? beast : hasSprite("jimmynelson_carry") ? d.actor("jimmynelson_carry", beast.x, beast.y, [0, 1]) : null;
    const fire = this.time.addEvent({ delay: 60, loop: true, callback: () => this.sparks.explode(2, X + (Math.random() - 0.5) * 300, CASTLE.top - 10 + Math.random() * 200) });
    // On its way out, the beast's tail smashes the throne.
    this.breakThrone();
    c.aldo.face(0, 1);
    void d.anim(c.aldo, "cast");
    if (carrier) {
      if (carrier !== beast) beast.setVisible(false);
      c.sarah.setVisible(false);
      carrier.face(1, 1);
      carrier.play2("carry_idle");
      await d.wait(900);
      void d.walk(carrier, [{ x: gate.x + 10, y: gate.y + 30 }, gate], 34, "carry_walk");
    } else {
      // Without the carry animation: she is dragged behind it in chains.
      c.sarah.setTint(0xb0a0c0);
      void d.walk(c.sarah, [{ x: gate.x + 20, y: gate.y + 30 }, gate], 34);
      void d.walk(beast, [{ x: gate.x + 10, y: gate.y + 30 }, gate], 34);
    }
    await d.line("p_cry", L("Rei Aldo", "King Aldo"), T.aldoCry, 3400);
    strikes.remove();
    fogTimer.remove();
    fire.remove();
    this.stopLoops(1.4);
    setMusic(null);
    await d.fadeOut(1400);
    if (stop()) return;

    // 2. Ten years later: the hut.
    cam.removeBounds();
    await d.say("p_years", T.years, 2400);
    if (stop()) return;
    cam.centerOn(HUT.x + 70, HUT.y + 80);
    cam.setZoom(this.baseZoom * 1.25);
    // Blurred vision clearing up (WebGL only).
    const blur = cam.postFX?.addBlur(1, 2, 2, 3);
    this.loops.push(cine.loop("hearth", 0.5, 1));
    setMusic("aldo");
    const motes = this.time.addEvent({ delay: 200, loop: true, callback: () => this.dust.explode(1, this.hutHole.x - 30 + Math.random() * 30, this.hutHole.y + 20 + Math.random() * 100) });
    const embers = this.time.addEvent({ delay: 300, loop: true, callback: () => this.sparks.explode(1, HUT.x + 164 + (Math.random() - 0.5) * 12, HUT.y + 38) });
    cine.play("heartbeat", 0.6);
    void d.fadeIn(2400);
    if (blur) this.tweens.add({ targets: blur, strength: 0, duration: 5000, ease: "Sine.easeOut" });
    await d.line("p_aldo1", L("Ancião", "Elder"), T.aldo1, 3000);
    await d.line("p_aldo2", L("Ancião", "Elder"), T.aldo2, 3000);
    // The guardian lifts their head and sits up.
    this.tweens.add({ targets: c.sleeper, angle: 0, x: c.sleeper.x + 26, y: c.sleeper.y + 12, duration: 900, ease: "Back.easeOut",
      onComplete: () => c.sleeper.setDepth(c.sleeper.y) });
    await d.line("p_aldo3", L("Ancião", "Elder"), T.aldo3, 3000);
    if (stop()) return;
    if (blur) cam.postFX.remove(blur);
    // The reflection in the basin: the hood, and the crown under it.
    const basin = this.basin;
    const bx = basin?.x ?? HUT.x + 36, by = basin?.y ?? HUT.y + 124;
    await d.walk(c.sleeper, [{ x: bx + 16, y: by - 2 }], 35);
    c.sleeper.face(-1, 0.4);
    void d.walk(c.oldAldo, [{ x: bx + 42, y: by - 10 }], 30);
    cam.pan(bx + 6, by - 10, 1200);
    cam.zoomTo(cam.zoom * 1.5, 1200);
    await d.wait(1300);
    c.oldAldo.face(-1, 0.6);
    if (basin?.has("crown")) basin.play2("crown");
    await d.say("p_reveal", T.reveal, 2800);
    if (stop()) return;
    cam.zoomTo(cam.zoom / 1.5, 1000);
    cam.pan(HUT.x + 70, HUT.y + 96, 1000);
    c.oldAldo.face(1, 1);
    void d.anim(c.oldAldo, "talk");
    await d.line("p_aldo4", L("Rei Aldo", "King Aldo"), T.aldo4, 3200);
    await d.line("p_aldo5", L("Rei Aldo", "King Aldo"), T.aldo5, 3000);
    await d.line("p_aldo6", L("Rei Aldo", "King Aldo"), T.aldo6, 3400);
    motes.remove();
    embers.remove();
    if (stop()) return;
    this.ui.hideText();
    await d.fadeOut(1000);
    this.finish();
  }

  // ---------- Destruction ----------

  /** A guard torn apart: a burst of blood, chunks of flesh and armour flying, splatters on the marble and
   * the remains left on the floor. */
  private gore(gd: KilnSprite) {
    const x = gd.x, y = gd.y - 10;
    gd.setVisible(false);
    cine.play("gore", 1);
    this.cameras.main.shake(140, 0.003);
    this.blood.explode(70, x, y);
    const chunks = kilnMeta("gore_chunks")?.animations.variants?.directions.s?.frames;
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6, dist = 24 + Math.random() * 44;
      const piece = chunks
        ? this.add.image(x, y, "gore_chunks", chunks[i % chunks.length])
        : this.add.rectangle(x, y, 3 + Math.random() * 3, 2 + Math.random() * 2, i % 3 ? 0x8a0f1a : i % 2 ? 0xe6d6ad : 0x8a92a0);
      piece.setDepth(y + 40);
      const tx = x + Math.cos(a) * dist, ty = y + 14 + Math.random() * 20;
      this.tweens.addCounter({
        from: 0, to: 1, duration: 520 + Math.random() * 260, ease: "Quad.easeOut",
        onUpdate: (tw) => {
          const k = tw.getValue() ?? 0;
          piece.setPosition(x + (tx - x) * k, y + (ty - y) * k - Math.sin(Math.PI * k) * (18 + dist * 0.4));
        },
        onComplete: () => { piece.setDepth(-8e5 + 2); this.splat(piece.x, piece.y, 0.5); },
      });
    }
    for (let i = 0; i < 4; i++) this.splat(x + (Math.random() - 0.5) * 40, y + 12 + (Math.random() - 0.3) * 24, 0.8 + Math.random() * 0.5);
    if (hasSprite("guard_remains")) {
      const v = kilnMeta("guard_remains")?.animations.variants?.directions.s?.frames;
      const m = kilnMeta("guard_remains")!;
      this.add.image(gd.x, gd.y, "guard_remains", v ? v[Math.floor(Math.random() * v.length)] : m.animations.idle.directions.s!.frames[0])
        .setOrigin(m.pivot.x / m.frame_size, m.pivot.y / m.frame_size).setDepth(-8e5 + 3);
    }
  }

  /** A blood splatter on the floor. */
  private splat(x: number, y: number, scale = 1) {
    const v = kilnMeta("blood_splat")?.animations.variants?.directions.s?.frames;
    const o = v
      ? this.add.image(x, y, "blood_splat", v[Math.floor(Math.random() * v.length)]).setScale(scale)
      : this.add.ellipse(x, y, 12 * scale, 5 * scale, 0x6a0a14, 0.9);
    o.setDepth(-8e5 + 1).setAngle(v ? 0 : Math.random() * 30 - 15);
  }

  /** A fire: the animated export when it exists, else a column of flame particles with a glow. */
  private fire(name: "fire_large" | "fire_small" | "fire_wall", x: number, y: number) {
    if (hasSprite(name)) {
      const f = this.dir.actor(name, x, y, [0, 1]);
      f.anims.setProgress(Math.random());
    } else {
      const flames = this.add.particles(x, y, "px", {
        tint: [0xffe14d, 0xff7a2a, 0xc13a2b], speed: { min: 8, max: 26 }, angle: { min: 250, max: 290 }, lifespan: { min: 400, max: 800 },
        scale: { start: name === "fire_large" ? 3 : 2, end: 0 }, frequency: 40, quantity: name === "fire_small" ? 1 : 3,
        emitZone: { type: "random", source: new Phaser.Geom.Rectangle(name === "fire_wall" ? -20 : -6, -4, name === "fire_wall" ? 40 : 12, 4) } as Phaser.Types.GameObjects.Particles.EmitZoneData,
      }).setDepth(y + 1);
      this.fires.push(flames);
    }
    const glow = this.add.image(x, y - 12, "disc").setTint(0xff7a2a).setScale(name === "fire_small" ? 1.2 : 2.4).setAlpha(0.35)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(9e4 + 2);
    this.tweens.add({ targets: glow, alpha: 0.2, duration: 200 + Math.random() * 200, yoyo: true, repeat: -1 });
  }

  /** The roar's aftermath, spread over a few seconds. */
  private devastate() {
    const cam = this.cameras.main;
    cine.play("fire_whoosh", 0.9);
    this.loops.push(cine.loop("blaze", 0.6, 0.5));
    // Columns topple one after another.
    this.columns.forEach((col, i) => this.time.delayedCall(i * 260, () => {
      cine.play("column_fall", 0.7);
      if (i % 2 === 0) cam.shake(160, 0.004);
      const o = col.obj as Phaser.GameObjects.Image;
      if (hasSprite("castle_column_broken")) {
        o.setVisible(false);
        const b = this.dir.actor("castle_column_broken", col.x, col.y, [0, 1]);
        if (b.has("fall")) b.play2("fall", { restart: true, onComplete: () => b.play2("idle") });
      } else {
        this.tweens.add({ targets: o, angle: col.x < SET.castle ? -80 : 80, alpha: 0.6, duration: 500, ease: "Quad.easeIn" });
      }
      this.fog.explode(10, col.x, col.y - 6);
      if (hasSprite("castle_rubble")) this.add.image(col.x + (col.x < SET.castle ? 10 : -10), col.y + 4, "castle_rubble",
        kilnMeta("castle_rubble")!.animations.variants?.directions.s?.frames[i % 3] ?? kilnMeta("castle_rubble")!.animations.idle.directions.s!.frames[0]).setDepth(col.y + 3);
    }));
    // The hangings catch fire.
    this.hangings.forEach((h, i) => this.time.delayedCall(400 + i * 300, () => {
      const burning = `${h.name}_burning` as const;
      if (hasSprite(burning)) {
        (h.obj as Phaser.GameObjects.Image).setVisible(false);
        this.dir.actor(burning, h.x, CASTLE.top, [0, 1]).setDepth(CASTLE.top - 29);
      } else this.fire("fire_small", h.x, CASTLE.top - 14);
    }));
    // Fire runs along the back wall, then breaks out on the floor.
    for (let k = 0; k < 11; k++) this.time.delayedCall(900 + Math.abs(k - 5) * 220, () => this.fire("fire_wall", SET.castle - 280 + k * 56, CASTLE.top + 2));
    for (const [fx, fy, i] of [[-90, 20, 0], [100, 40, 1], [-40, 100, 2], [60, 120, 3], [180, -60, 4], [-190, 90, 5], [250, 60, 6], [-250, -40, 7]] as const)
      this.time.delayedCall(1800 + i * 250, () => {
        this.fire(i % 2 ? "fire_small" : "fire_large", SET.castle + fx, fy);
        if (hasSprite("scorch_mark")) this.add.image(SET.castle + fx, fy, "scorch_mark", kilnMeta("scorch_mark")!.animations.variants?.directions.s?.frames[i % 4]
          ?? kilnMeta("scorch_mark")!.animations.idle.directions.s!.frames[0]).setDepth(-8e5);
      });
    // The marble cracks under the quake (1 tile in 3).
    const cracked = kilnMeta("castle_floor_cracked")?.animations.variants?.directions.s?.frames;
    if (cracked)
      for (let ty = CASTLE.top; ty < CASTLE.bottom; ty += 32)
        for (let tx = -CASTLE.half; tx < CASTLE.half; tx += 32) {
          const h = ((tx * 31 + ty * 17) >>> 0) % 3;
          if (h) continue;
          const t = this.add.image(SET.castle + tx + 16, ty + 16, "castle_floor_cracked", cracked[((tx + ty) >>> 0) % cracked.length]).setDepth(-1e6 + 1).setAlpha(0);
          this.tweens.add({ targets: t, alpha: 1, duration: 300, delay: Math.random() * 900 });
        }
    // The light turns to fire.
    const storm = this.children.getByName("stormLight") as Phaser.GameObjects.Rectangle;
    this.tweens.addCounter({ from: 0, to: 1, duration: 2500, onUpdate: (tw) => {
      const k = tw.getValue() ?? 0;
      storm.setFillStyle(Phaser.Display.Color.GetColor(122 + 48 * k, 74 + 14 * k, 104 - 34 * k));
    } });
    for (const g of this.candleGlows) g.setVisible(true).setTint(0xff5a2a);
  }

  private breakThrone() {
    if (!this.throne) return;
    cine.play("column_fall", 0.6);
    this.cameras.main.shake(160, 0.004);
    if (hasSprite("castle_throne_broken")) {
      (this.throne as Phaser.GameObjects.Image).setVisible(false);
      this.dir.actor("castle_throne_broken", SET.castle, -78, [0, 1]);
    } else (this.throne as Phaser.GameObjects.Image).setTint(0x6a4a3a).setAngle(8);
    this.cast.aldo.setDepth(-60);
    this.fire("fire_large", SET.castle + 26, -70);
  }

  /** On to the game (the hero steps out of the hut into the village), or back to the menu on a replay. */
  private finish() {
    if (this.ended) return;
    this.ended = true;
    this.dir.ended = true;
    const d = this.hero;
    if (this.replay || !d) {
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => window.setTimeout(openMainMenu));
      this.scene.stop();
      return;
    }
    d.quest.prologueSeen = true;
    d.save();
    if (this.coop && net.role === "host") net.send({ t: "intro_skip" });
    if (this.coop && net.role === "guest") {
      // Into the host's game once it is running (the host may still be watching).
      showWaiting(L("Aguardando o anfitrião...", "Waiting for the host..."), () => { stopWelcome(); net.leave(); this.scene.start("game", { hero: d, cinematic: true }); });
      awaitWelcome(d, {
        onWelcome: (w) => {
          document.querySelector("#ui .mm")?.remove();
          this.scene.start("game", { ...welcomeData(d, w), cinematic: true });
        },
        onBye: () => { net.leave(); this.scene.start("game", { hero: d, cinematic: true }); },
      });
      return;
    }
    this.scene.start("game", { hero: d, cinematic: true });
  }

  /** Holding the button runs the whole scene faster: timeline, tweens, animations and particles. */
  private setSpeed(f: number) {
    this.time.timeScale = f;
    this.tweens.timeScale = f;
    this.anims.globalTimeScale = f;
    for (const e of [this.fog, this.sparks, this.glass, this.dust, this.blood, ...this.fires]) if (e) e.timeScale = f;
  }

  private stopLoops(fade = 0.8) {
    for (const stop of this.loops) stop(fade);
    this.loops = [];
  }
}
