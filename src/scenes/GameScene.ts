import Phaser from "phaser";
import { rankMult, skillAt, type ActiveSlot, type DeathKind, type SkillDef } from "../data/classes";
import { ENEMIES, UNIQUES, type BossAbility, type EnemyDef, type EnemyRank, type EnemyType, type UniqueDef, type UniqueId } from "../data/enemies";
import { BEAM_RARITIES, generateItem, itemValue, rollRarity, RARITY_COLOR, type Item, type Rarity } from "../data/items";
import { EPILOGUE, NPCS, PROLOGUE, type NpcId } from "../data/quests";
import { ZONES, ZONE_ORDER, type CampKind, type ZoneDef, type ZoneId } from "../data/zones";
import { sfx } from "../game/audio";
import { DIFFICULTIES } from "../data/difficulty";
import { settings } from "../game/settings";
import { openMainMenu, showPauseMenu } from "../ui/menu";
import { net, type EnemyRow, type Msg, type PlayerState } from "../net/net";
import { CLASSES } from "../data/classes";
import { generateDungeon } from "../world/dungeon";
import { armorReduction } from "../data/stats";
import { HeroData, MAX_POTIONS } from "../game/hero";
import { playDeath } from "../game/deaths";
import { Minimap, type MapMarker } from "../game/minimap";
import { hasSprite, KilnSprite, portrait, type Dir, type SpriteName } from "../kiln";
import { Hud } from "../ui/hud";
import { blobTile } from "../world/autotile";
import { generateMap, MAP_H, MAP_W, TILE, type Pack, type WorldMap } from "../world/mapgen";
import { Grid } from "../world/pathfind";

interface Enemy {
  spr: KilnSprite;
  body: Phaser.Physics.Arcade.Body;
  type: EnemyType;
  def: EnemyDef;
  rank: EnemyRank;
  unique?: UniqueId;
  pack: Pack;
  baseLevel: number;
  level: number;
  hp: number;
  maxHp: number;
  dmg: [number, number];
  speed: number;
  name: string;
  state: "idle" | "chase" | "attack" | "hit" | "dead";
  home: Phaser.Math.Vector2;
  nextAttack: number;
  slowUntil: number;
  stunUntil: number;
  path: [number, number][];
  repathAt: number;
  wanderAt: number;
  wander?: Phaser.Math.Vector2;
  aggro: boolean;
  tint: number | null;
  active: boolean;
  exploded?: boolean;
  corpse?: boolean;
  remains?: Phaser.GameObjects.GameObject[];
  boss?: UniqueDef;
  abilityAt?: number[]; // next time each boss ability is ready
  announced?: boolean;
  charging?: boolean;
  /** Network id (assigned by the host). */
  id: number;
  /** Guest-side copy of a host enemy: no AI, follows snapshots. */
  proxy?: boolean;
  netTarget?: { x: number; y: number };
  seenAt?: number;
  sentSlow?: number;
  sentStun?: number;
}

interface RemotePlayer { spr: KilnSprite; tag: HTMLDivElement; st: PlayerState }

/** Enemy projectile; `src` is null for visual-only copies on the guest (the host decides hits). */
interface EnemyBolt { img: Phaser.GameObjects.Image; vx: number; vy: number; left: number; src: Enemy | null; mult: number }

/** Who an enemy is after: the local hero or the co-op partner. */
interface Target { x: number; y: number; remote: boolean; dead: boolean }

/** How the killing blow landed: picks the death effect. */
interface Blow { kind: DeathKind; angle: number; big?: boolean; toHero?: boolean }

interface Loot {
  kind: "gold" | "potion_hp" | "potion_mp" | "item";
  amount: number;
  item?: Item;
  img: Phaser.GameObjects.Image;
  label?: HTMLDivElement;
  beam?: Phaser.GameObjects.Image;
  ready: boolean;
}

interface Projectile {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  left: number;
  pierce: number;
  hit: Set<Enemy>;
  skill: SkillDef;
  mult: number;
  /** The co-op partner's projectile: drawn only, its hits are reported by its owner. */
  ghost?: boolean;
}

/** Damage over time on the ground: arrow rain, plague cloud, burning meteor crater. */
interface Zone {
  x: number;
  y: number;
  r: number;
  until: number;
  next: number;
  skill: SkillDef;
  mult: number;
  fx: "rain" | "cloud" | "fire";
  img?: Phaser.GameObjects.Image;
}

interface Chest {
  spr: Phaser.GameObjects.Sprite;
  level: number;
  opened: boolean;
}

interface Npc {
  id: NpcId;
  spr: KilnSprite;
  tag: HTMLDivElement;
}

type Order =
  | { type: "move"; x: number; y: number }
  | { type: "attack"; enemy: Enemy }
  | { type: "pickup"; loot: Loot }
  | { type: "chest"; chest: Chest }
  | { type: "talk"; npc: Npc }
  | { type: "portal" }
  | { type: "enter"; index: number };

const ENEMY_RADIUS = 7;
const BASE_SPEED = 74;
const ACTIVE_RANGE = 460;
const DASH_COOLDOWN = 1200;
const TIER_LEVELS = 2; // monster levels added per completed story quest

export class GameScene extends Phaser.Scene {
  private data_!: HeroData;
  private hero!: KilnSprite;
  private heroBody!: Phaser.Physics.Arcade.Body;
  private hud!: Hud;
  private minimap!: Minimap;
  private map!: WorldMap;
  private grid!: Grid;
  private collision!: Phaser.Tilemaps.TilemapLayer;
  private zone!: ZoneDef;
  private dungeonRef: { index: number } | null = null;
  private exitAt: number | null = null;
  private portalSpr!: Phaser.GameObjects.Image;
  private portalSwirl!: Phaser.GameObjects.Image;
  private darkEl?: HTMLDivElement;
  private slowmoUntil = 0;
  private hitSfxAt = 0;
  /** Mouse buttons pressed on the game canvas (clicks on the HTML UI never count). */
  private held = { left: false, right: false };
  private enemyBolts: EnemyBolt[] = [];
  private mapSeed = 0;
  private netSeed?: number;
  private netZone?: ZoneId;
  private spawnAt?: { x: number; y: number };
  private remote: RemotePlayer | null = null;
  private byId = new Map<number, Enemy>();
  private enemySeq = 0;
  private netAt = 0;
  private snapAt = 0;
  private sessionEl?: HTMLDivElement;
  private enemies: Enemy[] = [];
  private loot: Loot[] = [];
  private projectiles: Projectile[] = [];
  private zones: Zone[] = [];
  private chests: Chest[] = [];
  private npcs: Npc[] = [];
  private trees: Phaser.GameObjects.Image[] = [];
  private decals: Phaser.GameObjects.Image[] = [];
  private bars!: Phaser.GameObjects.Graphics;
  private aura!: Phaser.GameObjects.Image;
  private emitters!: Record<"blood" | "fire" | "frost" | "shadow" | "gold" | "red" | "dust" | "smoke", Phaser.GameObjects.Particles.ParticleEmitter>;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  private busy = false;
  private castToken = 0;
  private dead = false;
  private leaping = false;
  private dashUntil = 0;
  private invulnUntil = 0;
  private dashCd = 0;
  private order: Order | null = null;
  private path: [number, number][] = [];
  private stuckT = 0;
  private lastPos = new Phaser.Math.Vector2();
  private cooldowns: Record<string, number> = {};
  private hovered: Enemy | null = null;
  private hoveredNpc: Npc | null = null;
  private lastHit: { e: Enemy; t: number } | null = null;
  private leftHeldAt = 0;
  private moveRepathAt = 0;
  private msgAt = 0;
  private saveAt = 0;
  private mapAt = 0;
  private inTown = true;

  constructor() {
    super("game");
  }

  init(data: { hero: HeroData; dungeon?: number; exitAt?: number; netSeed?: number; netZone?: ZoneId; spawnAt?: { x: number; y: number } }) {
    this.data_ = data.hero;
    this.netSeed = data.netSeed;
    this.netZone = data.netZone;
    this.spawnAt = data.spawnAt;
    this.remote = null;
    this.byId = new Map();
    this.enemySeq = 0;
    this.dungeonRef = data.dungeon !== undefined ? { index: data.dungeon } : null;
    this.exitAt = data.exitAt ?? null;
    this.darkEl = undefined;
    Object.assign(this, {
      enemies: [], loot: [], projectiles: [], zones: [], chests: [], npcs: [], trees: [], decals: [], cooldowns: {}, enemyBolts: [],
      busy: false, dead: false, leaping: false, order: null, path: [], dashUntil: 0, invulnUntil: 0, dashCd: 0,
    });
  }

  private get magicFind() {
    return DIFFICULTIES[this.data_.difficulty].magicFind;
  }

  private shake(ms: number, intensity: number) {
    if (settings.shake) this.cameras.main.shake(ms, intensity);
  }

  private get tier() {
    return this.data_.tier;
  }

  /** Extra monster levels from story progress made since this zone opened. */
  private get tierBonus() {
    return Math.max(0, this.tier - this.zone.unlockAt) * TIER_LEVELS;
  }

  create() {
    const d0 = this.data_;
    // A guest follows the host's zone even if it has not unlocked it yet.
    if (this.netZone) d0.zone = this.netZone;
    else if (!ZONES[d0.zone] || d0.tier < ZONES[d0.zone].unlockAt) d0.zone = "forest";
    this.zone = ZONES[d0.zone];
    this.mapSeed = this.netSeed ?? this.seedFor(this.zone.id, this.dungeonRef?.index ?? null);
    if (this.dungeonRef) {
      const dd = this.zone.dungeons[this.dungeonRef.index];
      const key = `${this.zone.id}:${this.dungeonRef.index}`;
      const level = this.zone.levelBase + 4 + this.dungeonRef.index * 2;
      this.map = generateDungeon(this.mapSeed, level, dd.enemies, d0.cleared.includes(key) ? null : dd.boss);
    } else {
      this.map = generateMap(this.mapSeed, this.zone.id);
    }
    this.grid = new Grid(MAP_W, MAP_H, this.map.blocked);
    this.buildWorld();

    let sp = this.map.spawn;
    if (this.spawnAt) {
      const f = this.grid.nearestFree(Math.floor(this.spawnAt.x / TILE), Math.floor(this.spawnAt.y / TILE), 4);
      if (f) sp = { x: f[0], y: f[1] };
    }
    if (this.exitAt !== null && this.map.dungeons[this.exitAt]) {
      const de = this.map.dungeons[this.exitAt];
      const f = this.grid.nearestFree(de.x, de.y + 1, 4);
      if (f) sp = { x: f[0], y: f[1] };
    }
    this.hero = new KilnSprite(this, sp.x * TILE + 8, sp.y * TILE + 8, this.data_.cls);
    this.physics.add.existing(this.hero);
    this.heroBody = this.hero.body as Phaser.Physics.Arcade.Body;
    this.setupBody(this.hero, 5);
    this.hero.play2("idle");
    this.physics.add.collider(this.hero, this.collision);
    this.aura = this.add.image(0, 0, "ring").setScale(0.42, 0.26).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);

    if (!this.isGuest) this.spawnEnemies(); // a guest sees the host's enemies through snapshots

    this.bars = this.add.graphics().setDepth(1e6);
    const em = (tint: number | number[], extra: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig = {}) =>
      this.add.particles(0, 0, "px", {
        speed: { min: 25, max: 80 }, lifespan: { min: 200, max: 420 }, scale: { start: 1, end: 0 },
        tint, emitting: false, gravityY: 120, ...extra,
      }).setDepth(1e6 - 1);
    this.emitters = {
      blood: em([0x8a0f1a, 0xc1272d, 0x4a0712], { speed: { min: 30, max: 110 }, angle: { min: 200, max: 340 }, lifespan: { min: 250, max: 600 }, gravityY: 260, scale: { start: 1, end: 0.4 } }),
      fire: em([0xfe6607, 0xfbbe71, 0x902308]), frost: em(0x7edaf2), shadow: em([0x5dff3d, 0x7a0ff8]), gold: em(0xffe14d), red: em(0xc13a2b),
      dust: em([0xc9a06a, 0xa87a4f], { speed: { min: 10, max: 40 }, gravityY: -20, lifespan: { min: 250, max: 450 } }),
      smoke: em([0x3a3438, 0x5a5258], { speed: { min: 5, max: 20 }, gravityY: -40, lifespan: { min: 500, max: 900 }, scale: { start: 1.5, end: 0.5 }, alpha: { start: 0.8, end: 0 } }),
    };

    const cam = this.cameras.main;
    cam.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE);
    cam.startFollow(this.hero, true, 0.2, 0.2);
    this.fitZoom();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.fitZoom, this);

    const d = this.data_;
    this.hud = new Hud({
      equipFromInventory: (i) => { d.equipFromInventory(i); this.afterItemsChanged(); },
      unequip: (slot) => {
        if (!d.unequip(slot)) this.hud.message("Mochila cheia!", "#ff6a5a");
        this.afterItemsChanged();
      },
      discard: (i) => {
        const it = d.inventory[i];
        d.inventory[i] = null;
        if (it) this.spawnLoot({ kind: "item", amount: 1, item: it }, this.hero.x, this.hero.y);
        this.afterItemsChanged();
      },
      drinkPotion: (k) => this.drinkPotion(k),
      learn: (sk) => {
        if (d.learn(sk)) {
          this.hud.message(`${sk.name} agora no nível ${d.rank(sk)}.`, "#ffe14d");
          sfx.buy();
          this.afterItemsChanged();
        }
      },
      buy: (i) => this.buyItem(i),
      sell: (i) => {
        const it = d.inventory[i];
        if (!it) return;
        d.inventory[i] = null;
        d.gold += Math.round(itemValue(it) / 4);
        sfx.coin();
        this.afterItemsChanged();
      },
      buyPotion: (k) => {
        if (d.gold < 25) return this.say("Ouro insuficiente.");
        if (d.potions[k] >= MAX_POTIONS) return this.say("Cinto de poções cheio.");
        d.gold -= 25;
        d.potions[k]++;
        sfx.buy();
        this.afterItemsChanged();
      },
      move: (from, to) => {
        d.moveItem(from, to);
        this.afterItemsChanged();
      },
      unequipTo: (slot, i) => {
        if (!d.unequipTo(slot, i)) this.say("Esse espaço tem um item de outro tipo.");
        this.afterItemsChanged();
      },
      sellMany: (indices) => {
        let gold = 0, n = 0;
        for (const i of indices) {
          const it = d.inventory[i];
          if (!it) continue;
          d.inventory[i] = null;
          gold += Math.round(itemValue(it) / 4);
          n++;
        }
        if (!n) return;
        d.gold += gold;
        sfx.coin();
        this.hud.message(`Vendeu ${n} ite${n > 1 ? "ns" : "m"} por ${gold} ouro.`, "#ffe14d");
        this.afterItemsChanged();
      },
      reroll: () => {
        const cost = this.rerollCost();
        if (d.gold < cost) return this.say("Ouro insuficiente.");
        d.gold -= cost;
        this.restockShop(true);
        sfx.buy();
      },
    }, d.def.skills, d.def.resourceColor);
    this.minimap = new Minimap(this.hud.minimap, this.map);
    this.spawnNpcs();

    this.setupInput();
    this.setupNet();
    this.game.events.on(Phaser.Core.Events.POST_RENDER, this.updateOverlay, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.POST_RENDER, this.updateOverlay, this);
      this.scale.off(Phaser.Scale.Events.RESIZE, this.fitZoom, this);
      document.getElementById("ui")!.innerHTML = "";
    });

    if (this.dungeonRef) {
      this.hud.zoneTitle(this.zone.dungeons[this.dungeonRef.index].name, `${this.zone.name} · Masmorra`);
      this.hud.vignette.classList.add("dungeon");
      this.darkEl = document.createElement("div");
      this.darkEl.className = "darkness";
      document.getElementById("ui")!.prepend(this.darkEl);
    } else if (d.quest.prologueSeen) {
      this.hud.zoneTitle(this.zone.name, this.zone.subtitle);
    }
    if (!d.quest.prologueSeen) {
      this.hud.dialog("Prólogo", null, PROLOGUE, [], () => {
        d.quest.prologueSeen = true;
        d.save();
        this.hud.message("Fale com o Ancião Bento (!) na praça da vila.", "#ffe14d");
      });
    }
    this.restockShop(false);
  }

  private fitZoom() {
    const auto = Math.max(2, Math.min(4, Math.round(Math.min(window.innerWidth / 400, window.innerHeight / 250))));
    const z = settings.zoom === "auto" ? auto : settings.zoom;
    if (this.cameras.main.zoom === z) return;
    this.cameras.main.setZoom(z);
  }

  private setupBody(spr: KilnSprite, r: number) {
    const b = spr.body as Phaser.Physics.Arcade.Body;
    const p = spr.meta.pivot;
    b.setCircle(r, p.x - r, p.y - r);
  }

  // ---------------------------------------------------------------- world

  private buildWorld() {
    const m = this.map;
    const W = MAP_W * TILE, H = MAP_H * TILE;
    const skin = this.zone.skin ? `_${this.zone.skin}` : "";
    const col: number[][] = [];
    for (let y = 0; y < MAP_H; y++) col.push(Array.from({ length: MAP_W }, (_, x) => (m.blocked[y * MAP_W + x] ? 0 : -1)));

    if (m.kind === "dungeon") {
      // Stone floor, brick wall faces where a wall sits above floor, void elsewhere.
      const data: number[][] = [];
      const floor = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && m.grass[y * MAP_W + x];
      for (let y = 0; y < MAP_H; y++)
        data.push(Array.from({ length: MAP_W }, (_, x) => (floor(x, y) ? ((x * 7 + y * 13) % 5 === 0 ? 1 : 0) : floor(x, y + 1) ? 2 : 3)));
      const tm = this.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE });
      tm.createLayer(0, tm.addTilesetImage("dtiles")!, 0, 0)!.setDepth(-10);
      // Chests and the portal block a tile but are not walls: keep them on the floor visually.
      for (const c of m.chests) data[c.y][c.x] = 0;
    } else {
      this.add.tileSprite(0, 0, W, H, this.zone.dirt).setOrigin(0).setDepth(-20);
      const isGrass = (x: number, y: number) => x < 0 || y < 0 || x >= MAP_W || y >= MAP_H || m.grass[y * MAP_W + x];
      const data: number[][] = [];
      for (let y = 0; y < MAP_H; y++)
        data.push(Array.from({ length: MAP_W }, (_, x) => (m.grass[y * MAP_W + x] ? blobTile(isGrass, x, y) : -1)));
      const tm = this.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE });
      tm.createLayer(0, tm.addTilesetImage("grass", `grass${skin}`)!, 0, 0)!.setDepth(-10);
    }
    const cm = this.make.tilemap({ data: col, tileWidth: TILE, tileHeight: TILE });
    this.collision = cm.createLayer(0, cm.addTilesetImage("grass")!, 0, 0)!.setVisible(false);
    this.collision.setCollision(0);

    for (const p of m.props) {
      const px = p.x * TILE, py = p.y * TILE;
      switch (p.kind) {
        case "house": {
          const v = p.frame ?? 0;
          const bottom = (p.y + 1 + v) * TILE;
          this.add.image(px, bottom, "house", `h${v}`).setOrigin(0, 1).setDepth(bottom - 8);
          break;
        }
        case "ruin": {
          // Abandoned house: the Farm RPG house, darkened, with a glowing doorway.
          const bottom = (p.y + 2) * TILE;
          this.add.image(px, bottom, "house", "h1").setOrigin(0, 1).setDepth(bottom - 8).setTint(0x7a6a7a);
          const glow = this.add.image(px + 2.5 * TILE, (p.y + 1) * TILE - 4, "disc").setTint(0xc06bff).setScale(0.35, 0.25)
            .setBlendMode(Phaser.BlendModes.ADD).setDepth(bottom - 7);
          this.tweens.add({ targets: glow, alpha: { from: 0.4, to: 0.9 }, duration: 900, yoyo: true, repeat: -1 });
          break;
        }
        case "fence_h":
        case "fence_v":
          this.add.image(px + 8, py + TILE, "fence", p.kind === "fence_h" ? "h" : "v").setOrigin(0.5, 1).setDepth(py + TILE - 2);
          break;
        case "tree_big":
          this.trees.push(this.add.image(px + TILE, py + TILE - 1, `tree${skin}`, "big").setOrigin(0.5, 1).setDepth(py + TILE - 3));
          break;
        case "tree_medium":
          this.trees.push(this.add.image(px + 8, py + TILE - 1, `tree${skin}`, "medium").setOrigin(0.5, 1).setDepth(py + TILE - 3));
          break;
        case "tree_bush":
          this.add.image(px + 8, py + TILE, `tree${skin}`, "bush").setOrigin(0.5, 1).setDepth(py + TILE - 4);
          break;
        case "tree_stump":
          this.add.image(px + 8, py + TILE, "tree", "stump").setOrigin(0.5, 1).setDepth(py + TILE - 4);
          break;
        case "stone":
          this.add.image(px + 8, py + 8, "stones", p.frame).setDepth(-5);
          break;
        case "plant":
          this.add.image(px + 8, py + TILE, `crops${skin}`, p.frame).setOrigin(0.5, 1).setDepth(py + TILE - 6);
          break;
        case "bones":
          this.add.image(px + 8, py + 8, "bones", p.frame).setDepth(-5);
          break;
        case "candle": {
          this.add.image(px + 8, py + TILE, "candle", p.frame).setOrigin(0.5, 1).setDepth(py + TILE - 4);
          const halo = this.add.image(px + 8, py + 10, "disc").setTint(0xffa64d).setScale(0.5, 0.35).setAlpha(0.35)
            .setBlendMode(Phaser.BlendModes.ADD).setDepth(1e6 - 1);
          this.tweens.add({ targets: halo, alpha: { from: 0.2, to: 0.45 }, duration: 300 + Math.random() * 300, yoyo: true, repeat: -1 });
          break;
        }
      }
    }

    for (const c of m.chests) {
      const spr = this.add.sprite(c.x * TILE + 8, c.y * TILE + TILE, "chest", 0).setOrigin(0.5, 1).setDepth(c.y * TILE + TILE - 2);
      this.chests.push({ spr, level: c.level, opened: false });
    }

    // Portal (travel between zones, or out of a dungeon).
    const pp = m.portal;
    this.portalSpr = this.add.image(pp.x * TILE + 8, pp.y * TILE + TILE + 2, "portal").setOrigin(0.5, 1).setDepth(pp.y * TILE + TILE - 2);
    const swirl = this.portalSwirl = this.add.image(pp.x * TILE + 8, pp.y * TILE + TILE - 11, "swirl").setBlendMode(Phaser.BlendModes.ADD).setDepth(pp.y * TILE + TILE - 1);
    this.tweens.add({ targets: swirl, scaleX: { from: 0.85, to: 1.05 }, alpha: { from: 0.7, to: 1 }, duration: 700, yoyo: true, repeat: -1 });
  }

  private spawnNpcs() {
    const spots = this.map.npcs;
    if (!spots) return;
    for (const id of Object.keys(NPCS) as NpcId[]) {
      const [tx, ty] = spots[id];
      const spr = new KilnSprite(this, tx * TILE + 8, ty * TILE + 10, NPCS[id].sprite);
      spr.play2("idle");
      spr.anims.setProgress(Math.random());
      spr.setDepth(spr.y);
      spr.face(0, 1);
      const tag = document.createElement("div");
      tag.className = "npc-tag";
      this.hud.world.appendChild(tag);
      this.npcs.push({ id, spr, tag });
    }
  }

  // ---------------------------------------------------------------- enemies: spawn & scaling

  private spawnEnemies() {
    for (const pack of this.map.packs) this.spawnPack(pack);
  }

  private spawnPack(pack: Pack) {
    const killed = this.data_.quest.killed;
    const campTypes: Record<CampKind, EnemyType[]> = {
      goblin: ["goblin"], bandit: ["bandit"], undead: ["skeleton"], spider: ["spider"],
    };
    const types = pack.types ?? campTypes[pack.faction];
    for (let i = 0; i < pack.count; i++) {
      let type: EnemyType = types[Math.floor(Math.random() * types.length)];
      let rank: EnemyRank = "normal";
      let unique: UniqueId | undefined;
      if (pack.faction === "bandit" && !pack.types) {
        const brutes = pack.champion ? 2 : pack.level >= 3 ? 1 : 0;
        type = i < brutes ? "brute" : "bandit";
      }
      if (pack.unique && i === 0 && !killed.includes(pack.unique)) {
        unique = pack.unique;
        type = UNIQUES[pack.unique].type;
        rank = "boss";
      } else if (pack.champion && i < (pack.faction === "goblin" ? 2 : 1)) rank = "champion";
      const tx = pack.x + Math.round((Math.random() - 0.5) * 6);
      const ty = pack.y + Math.round((Math.random() - 0.5) * 6);
      const t = this.grid.nearestFree(tx, ty, 4);
      if (t) this.spawnEnemy(t[0] * TILE + 8, t[1] * TILE + 8, pack, type, rank, unique);
    }
  }

  private spawnEnemy(x: number, y: number, pack: Pack, type: EnemyType, rank: EnemyRank, unique?: UniqueId) {
    const def = ENEMIES[type];
    const boss: UniqueDef | undefined = unique ? UNIQUES[unique] : undefined;
    const spr = new KilnSprite(this, x, y, def.sprite);
    this.physics.add.existing(spr);
    spr.setScale(boss ? boss.scale : rank === "champion" ? 1.12 : 1);
    this.setupBody(spr, def.body);
    const tint = boss ? boss.tint ?? null : rank === "champion" ? 0x9fb8ff : null;
    if (tint) spr.setTint(tint);
    const e: Enemy = {
      spr, body: spr.body as Phaser.Physics.Arcade.Body, type, def, rank, unique, pack, boss,
      baseLevel: pack.level, level: 0, hp: 0, maxHp: 0, dmg: [0, 0], speed: def.speed * (0.92 + Math.random() * 0.16), name: "",
      state: "idle", home: new Phaser.Math.Vector2(x, y), nextAttack: 0, slowUntil: 0, stunUntil: 0,
      path: [], repathAt: 0, wanderAt: Math.random() * 3000, aggro: false, tint, active: true,
      abilityAt: boss ? boss.abilities.map((a) => this.time.now + 2500 + Math.random() * a.cooldown * 0.5) : undefined,
      id: ++this.enemySeq,
    };
    this.byId.set(e.id, e);
    this.setLevel(e, pack.level + this.tierBonus);
    spr.play2("idle");
    spr.anims.setProgress(Math.random());
    this.physics.add.collider(spr, this.collision);
    this.enemies.push(e);
    return e;
  }

  /** Sets level-derived stats, keeping the current life ratio. */
  private setLevel(e: Enemy, level: number) {
    const ratio = e.maxHp ? e.hp / e.maxHp : 1;
    const d = e.def;
    const hpMult = e.boss ? e.boss.hpMult : e.rank === "champion" ? 2.6 : 1;
    const dm = e.rank === "boss" ? 2 : e.rank === "champion" ? 1.5 : 1;
    e.level = level;
    const diff = DIFFICULTIES[this.data_.difficulty];
    e.maxHp = Math.round((d.hp[0] + d.hp[1] * level) * hpMult * diff.enemyHp);
    e.hp = Math.max(1, Math.round(e.maxHp * ratio));
    e.dmg = [Math.max(1, Math.round((d.dmgMin[0] + d.dmgMin[1] * level) * dm * diff.enemyDmg)), Math.max(1, Math.round((d.dmgMax[0] + d.dmgMax[1] * level) * dm * diff.enemyDmg))];
    e.name = e.boss ? e.boss.name : e.rank === "champion" ? `${d.name(level)} Campeão` : d.name(level);
  }

  /** Each completed story quest: the world grows stronger and cleared camps are retaken. */
  private worldTierUp() {
    for (const e of this.enemies) if (e.state !== "dead") this.setLevel(e, e.baseLevel + this.tierBonus);
    let respawned = 0;
    for (const pack of this.map.packs) {
      const alive = this.enemies.some((e) => e.pack === pack && e.state !== "dead");
      const far = Phaser.Math.Distance.Between(pack.x * TILE, pack.y * TILE, this.hero.x, this.hero.y) > 500;
      if (!alive && far) {
        this.spawnPack(pack);
        respawned++;
      }
    }
    this.hud.banner("O perigo cresce...", `Inimigos agora são ${this.tierBonus} níveis mais fortes${respawned ? " e acampamentos foram reocupados" : ""}.`);
  }

  // ---------------------------------------------------------------- input

  private setupInput() {
    this.keys = this.input.keyboard!.addKeys("W,A,S,D,I,C,K,M,Q,E,R,ONE,TWO,ESC,SHIFT,SPACE") as Record<string, Phaser.Input.Keyboard.Key>;
    const k = this.keys;
    k.I.on("down", () => this.hud.toggle("inv"));
    k.C.on("down", () => this.hud.toggle("chr"));
    k.K.on("down", () => this.hud.toggle("tree"));
    k.M.on("down", () => this.hud.toggleMap());
    k.ESC.on("down", () => {
      if (this.hud.anyOpen()) {
        this.hud.closeAll();
        this.hud.closeDialog();
      } else this.pause();
    });
    k.ONE.on("down", () => this.drinkPotion("hp"));
    k.TWO.on("down", () => this.drinkPotion("mp"));
    k.SPACE.on("down", () => this.dash());
    for (const [key, slot] of [["Q", "q"], ["E", "e"], ["R", "r"]] as [string, ActiveSlot][]) {
      k[key].on("down", () => this.castSlot(slot));
    }

    const onCanvas = (p: Phaser.Input.Pointer) => p.downElement === this.game.canvas;
    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => {
      if (!p.leftButtonDown()) this.held.left = false;
      if (!p.rightButtonDown()) this.held.right = false;
    });
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, () => (this.held = { left: false, right: false }));
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      // Phaser also hears mouse-downs on the page; ignore those on shop, inventory, dialogs...
      if (!onCanvas(p)) return;
      if (p.rightButtonDown()) this.held.right = true;
      else this.held.left = true;
      if (this.dead || this.hud.dialogActive) return;
      const w = this.cameras.main.getWorldPoint(p.x, p.y);
      if (p.rightButtonDown()) {
        this.castSlot("secondary");
        return;
      }
      this.leftHeldAt = this.time.now;
      if (this.keys.SHIFT.isDown) {
        this.order = null;
        this.useSkill(skillAt(this.data_.def, "primary"), w.x, w.y, this.hovered ?? undefined);
        return;
      }
      if (this.hoveredNpc) {
        this.order = { type: "talk", npc: this.hoveredNpc };
        this.path = [];
        return;
      }
      if (Phaser.Math.Distance.Between(this.portalSpr.x, this.portalSpr.y - 14, w.x, w.y) < 16) {
        this.order = { type: "portal" };
        this.path = [];
        return;
      }
      const ruin = this.map.dungeons.find((dg) => Math.abs(dg.x * TILE + 8 - w.x) < 40 && w.y > (dg.y - 4) * TILE && w.y < (dg.y + 1) * TILE);
      if (ruin) {
        this.order = { type: "enter", index: ruin.index };
        this.path = [];
        return;
      }
      if (this.hovered) {
        this.order = { type: "attack", enemy: this.hovered };
        return;
      }
      const loot = this.loot.find((l) => l.ready && Phaser.Math.Distance.Between(l.img.x, l.img.y, w.x, w.y) < 9);
      if (loot) {
        this.order = { type: "pickup", loot };
        return;
      }
      const chest = this.chests.find((c) => !c.opened && Math.abs(c.spr.x - w.x) < 14 && w.y > c.spr.y - 18 && w.y < c.spr.y + 2);
      if (chest) {
        this.order = { type: "chest", chest };
        return;
      }
      this.moveTo(w.x, w.y);
    });
  }

  private pointerWorld() {
    const p = this.input.activePointer;
    return this.cameras.main.getWorldPoint(p.x, p.y);
  }

  private castSlot(slot: ActiveSlot) {
    if (this.dead || this.hud.dialogActive) return;
    const w = this.pointerWorld();
    this.order = null;
    this.path = [];
    this.useSkill(skillAt(this.data_.def, slot), w.x, w.y, this.hovered ?? undefined);
  }

  private moveTo(x: number, y: number) {
    this.order = { type: "move", x, y };
    this.planPath(x, y);
  }

  private planPath(x: number, y: number) {
    const sx = Math.floor(this.hero.x / TILE), sy = Math.floor(this.hero.y / TILE);
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (this.grid.lineFree(sx, sy, tx, ty)) {
      this.path = [[x, y]];
      return;
    }
    const p = this.grid.find(sx, sy, tx, ty);
    this.path = p ? p.map(([px, py]) => [px * TILE + 8, py * TILE + 8] as [number, number]) : [];
    if (p && this.path.length && this.grid.free(tx, ty)) this.path[this.path.length - 1] = [x, y];
  }

  private say(text: string, color = "#ff6a5a") {
    if (this.time.now < this.msgAt) return;
    this.msgAt = this.time.now + 1200;
    this.hud.message(text, color);
  }

  // ---------------------------------------------------------------- update

  update(time: number, delta: number) {
    const dt = delta / 1000;
    const d = this.data_;
    const pw = this.pointerWorld();

    for (const k of Object.keys(this.cooldowns)) this.cooldowns[k] = Math.max(0, this.cooldowns[k] - delta);
    this.dashCd = Math.max(0, this.dashCd - delta);
    if (d.tickBuffs(time)) this.hud.markInventoryDirty();
    const t = this.map.town;
    const htx = this.hero.x / TILE, hty = this.hero.y / TILE;
    this.inTown = htx > t.x0 && htx < t.x1 && hty > t.y0 && hty < t.y1 + 1;

    if (!this.dead) {
      const regen = d.stats.hpRegen * (this.inTown ? 4 : 1);
      d.hp = Math.min(d.stats.maxHp, d.hp + regen * dt);
      const fury = this.lastHit && time - this.lastHit.t < 3000;
      const mreg = d.cls === "barbarian" ? (fury ? 0 : -2.5) + Math.max(0, d.stats.manaRegen + 1) : d.stats.manaRegen;
      d.mana = Phaser.Math.Clamp(d.mana + mreg * dt, 0, d.stats.maxMana);
    }

    this.updateHover(pw.x, pw.y);
    if (!this.dead) this.updateHero(time, delta, pw);
    this.updateEnemies(time, delta);
    this.updateProjectiles(dt);
    this.updateZones(time);
    this.updateBolts(dt);
    this.updateNet(time, dt);
    this.updateLoot();
    this.updateTrees();
    this.updateAura(time);
    this.drawBars();
    for (const n of this.npcs) n.spr.setDepth(n.spr.y);

    if (time > this.mapAt) {
      this.mapAt = time + 120;
      this.minimap.reveal(this.hero.x, this.hero.y);
      this.minimap.draw(this.hero, this.mapMarkers(), time);
    }
    if (time > this.mapAt - 60) this.fitZoom();
    if (time > this.saveAt) {
      this.saveAt = time + 20000;
      d.save();
    }
    const q = d.currentQuest;
    this.hud.update({
      cls: d.cls, level: d.level, xp: d.xp, xpNext: d.xpNext, xpPrev: d.xpPrev, gold: d.gold, hp: d.hp, mana: d.mana,
      absorb: d.absorb, stats: d.stats, potions: d.potions, inventory: d.inventory, equipment: d.equipment,
      ranks: d.ranks, skillPoints: d.skillPoints, cooldowns: this.cooldowns, dashCooldown: this.dashCd, buffs: d.buffs, now: time,
      quest: q && d.quest.status !== "available"
        ? { title: q.title, goal: q.goal, progress: `${Math.min(d.quest.progress, q.objective.count)}/${q.objective.count}`, ready: d.quest.status === "ready" }
        : q ? { title: "Nova missão", goal: `Fale com ${NPCS[q.giver].name}`, progress: "", ready: false } : null,
    });
    const boss = this.enemies.find((e) => e.boss && e.aggro && e.state !== "dead" && Phaser.Math.Distance.Between(e.spr.x, e.spr.y, this.hero.x, this.hero.y) < 340);
    const tgt = this.hovered ?? boss ?? (this.lastHit && time - this.lastHit.t < 2500 && this.lastHit.e.state !== "dead" ? this.lastHit.e : null);
    this.hud.setTarget(tgt ? { name: `${tgt.name} (nv ${tgt.level})`, hp: tgt.hp, maxHp: tgt.maxHp, kind: tgt.rank } : null);
  }

  private updateHover(wx: number, wy: number) {
    let best: Enemy | null = null, bd = 16;
    for (const e of this.enemies) {
      if (e.state === "dead" || !e.active) continue;
      const dd = Phaser.Math.Distance.Between(e.spr.x, e.spr.y - 12 * e.spr.scaleY, wx, wy);
      if (dd < bd * e.spr.scaleX * (e.type === "brute" ? 1.3 : 1)) { bd = dd; best = e; }
    }
    if (best !== this.hovered) {
      if (this.hovered && this.hovered.state !== "dead") this.restoreTint(this.hovered);
      this.hovered = best;
      if (best) best.spr.setTint(0xff9a8a);
    }
    this.hoveredNpc = best ? null : this.npcs.find((n) => Phaser.Math.Distance.Between(n.spr.x, n.spr.y - 12, wx, wy) < 14) ?? null;
    for (const n of this.npcs) {
      if (n === this.hoveredNpc) n.spr.setTint(0xfff2b0);
      else n.spr.clearTint();
    }
  }

  private restoreTint(e: Enemy) {
    if (e.tint) e.spr.setTint(e.tint);
    else e.spr.clearTint();
  }

  private updateHero(time: number, delta: number, pw: Phaser.Math.Vector2) {
    const d = this.data_;
    const body = this.heroBody;
    this.hero.setDepth(this.hero.y);
    if (this.leaping) return;
    if (time < this.dashUntil) {
      if (Math.floor(time / 28) % 2 === 0) this.afterimage();
      return;
    }

    if (!this.hud.dialogActive) {
      if (this.held.left && time - this.leftHeldAt > 180 && !this.keys.SHIFT.isDown) {
        if (!this.order || this.order.type === "move") {
          if (time > this.moveRepathAt) {
            this.moveRepathAt = time + 160;
            this.moveTo(pw.x, pw.y);
          }
        }
      } else if (this.held.left && this.keys.SHIFT.isDown && !this.busy) {
        this.useSkill(skillAt(d.def, "primary"), pw.x, pw.y, this.hovered ?? undefined);
      }
      if (this.held.right && !this.busy && !(this.cooldowns[skillAt(d.def, "secondary").id] > 0)) this.castSlot("secondary");
    }

    if (this.busy) {
      body.setVelocity(0, 0);
      return;
    }

    const speed = BASE_SPEED * (1 + d.stats.moveSpeed);
    let vx = 0, vy = 0;
    const k = this.keys;
    const kx = (k.D.isDown ? 1 : 0) - (k.A.isDown ? 1 : 0);
    const ky = (k.S.isDown ? 1 : 0) - (k.W.isDown ? 1 : 0);
    if ((kx || ky) && !this.hud.dialogActive) {
      this.order = null;
      this.path = [];
      const len = Math.hypot(kx, ky);
      vx = (kx / len) * speed;
      vy = (ky / len) * speed;
    } else if (this.order) {
      const o = this.order;
      if (o.type === "attack") {
        const e = o.enemy;
        if (e.state === "dead") {
          this.order = null;
          this.path = [];
        } else {
          const sk = skillAt(d.def, "primary");
          const ex = e.spr.x, ey = e.spr.y;
          const dist = Phaser.Math.Distance.Between(this.hero.x, this.hero.y, ex, ey);
          // Ranged classes fire as soon as the target is in range; melee walks up to it.
          const reach = sk.kind === "melee" ? sk.range + ENEMY_RADIUS * e.spr.scaleX - 6 : sk.range * 0.92;
          if (dist <= reach) {
            this.path = [];
            this.useSkill(sk, ex, ey - 10 * e.spr.scaleY, e);
            if (!this.held.left) this.order = null;
            body.setVelocity(0, 0);
            return;
          }
          if (time > this.moveRepathAt || !this.path.length) {
            this.moveRepathAt = time + 300;
            this.planPath(ex, ey);
          }
        }
      } else if (o.type === "pickup") {
        if (!this.loot.includes(o.loot)) this.order = null;
        else if (Phaser.Math.Distance.Between(this.hero.x, this.hero.y, o.loot.img.x, o.loot.img.y) < 14) {
          this.pickup(o.loot);
          this.order = null;
          this.path = [];
        } else if (!this.path.length) this.planPath(o.loot.img.x, o.loot.img.y);
      } else if (o.type === "chest") {
        const c = o.chest;
        if (c.opened) this.order = null;
        else if (Phaser.Math.Distance.Between(this.hero.x, this.hero.y, c.spr.x, c.spr.y) < 22) {
          this.openChest(c);
          this.order = null;
          this.path = [];
        } else if (!this.path.length) this.planPath(c.spr.x, c.spr.y + 6);
      } else if (o.type === "portal") {
        const px = this.portalSpr.x, py = this.portalSpr.y + 10;
        if (Phaser.Math.Distance.Between(this.hero.x, this.hero.y, px, py) < 24) {
          this.order = null;
          this.path = [];
          this.usePortal();
        } else if (!this.path.length) this.planPath(px, py);
      } else if (o.type === "enter") {
        const dg = this.map.dungeons[o.index];
        const dx = dg.x * TILE + 8, dy = dg.y * TILE + 10;
        if (Phaser.Math.Distance.Between(this.hero.x, this.hero.y, dx, dy) < 22) {
          this.order = null;
          this.path = [];
          this.askEnterDungeon(o.index);
        } else if (!this.path.length) this.planPath(dx, dy);
      } else if (o.type === "talk") {
        const n = o.npc;
        if (Phaser.Math.Distance.Between(this.hero.x, this.hero.y, n.spr.x, n.spr.y) < 26) {
          this.order = null;
          this.path = [];
          this.talk(n);
        } else if (!this.path.length) this.planPath(n.spr.x, n.spr.y + 14);
      }

      const next = this.path[0];
      if (next) {
        const dx = next[0] - this.hero.x, dy = next[1] - this.hero.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 3) {
          this.path.shift();
          if (!this.path.length && this.order?.type === "move") this.order = null;
        } else {
          vx = (dx / dist) * speed;
          vy = (dy / dist) * speed;
        }
      }
    }

    body.setVelocity(vx, vy);
    if (vx || vy) {
      this.stuckT += delta;
      if (this.stuckT > 350) {
        if (Phaser.Math.Distance.Between(this.lastPos.x, this.lastPos.y, this.hero.x, this.hero.y) < 2 && this.order?.type === "move") {
          this.path = [];
          this.order = null;
        }
        this.stuckT = 0;
        this.lastPos.set(this.hero.x, this.hero.y);
      }
      this.hero.face(vx, vy);
      this.hero.play2("walk", { timeScale: 1 + d.stats.moveSpeed });
    } else {
      this.hero.play2("idle");
    }
  }

  // ---------------------------------------------------------------- dash

  private dash() {
    if (this.dead || this.busy || this.leaping || this.dashCd > 0 || this.hud.dialogActive) return;
    const k = this.keys;
    let dx = (k.D.isDown ? 1 : 0) - (k.A.isDown ? 1 : 0);
    let dy = (k.S.isDown ? 1 : 0) - (k.W.isDown ? 1 : 0);
    if (!dx && !dy) {
      const w = this.pointerWorld();
      dx = w.x - this.hero.x;
      dy = w.y - this.hero.y;
    }
    const len = Math.hypot(dx, dy) || 1;
    const speed = 470;
    this.order = null;
    this.path = [];
    this.dashCd = DASH_COOLDOWN;
    this.dashUntil = this.time.now + 170;
    this.invulnUntil = this.time.now + 260;
    this.heroBody.setVelocity((dx / len) * speed, (dy / len) * speed);
    this.hero.face(dx, dy);
    this.hero.play2("walk", { timeScale: 2.2 });
    this.emitters.dust.explode(10, this.hero.x, this.hero.y);
    this.time.delayedCall(170, () => {
      this.heroBody.setVelocity(0, 0);
      this.emitters.dust.explode(6, this.hero.x, this.hero.y);
    });
  }

  private afterimage() {
    const h = this.hero;
    const img = this.add.image(h.x, h.y, h.texture.key, h.frame.name).setOrigin(h.originX, h.originY)
      .setFlipX(h.flipX).setTint(0x9fc3ff).setAlpha(0.55).setDepth(h.depth - 1).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: img, alpha: 0, duration: 260, onComplete: () => img.destroy() });
  }

  // ---------------------------------------------------------------- skills

  private useSkill(sk: SkillDef, tx: number, ty: number, target: Enemy | undefined) {
    const d = this.data_;
    if (this.busy || this.dead || this.leaping || this.time.now < this.dashUntil) return;
    const rank = d.rank(sk);
    if (!rank) {
      this.say(d.level < sk.reqLevel ? `${sk.name} requer nível ${sk.reqLevel}.` : `Aprenda ${sk.name} na árvore de habilidades (K).`);
      return;
    }
    if ((this.cooldowns[sk.id] ?? 0) > 0) return;
    if (d.mana < sk.cost) {
      this.say(d.cls === "barbarian" ? "Fúria insuficiente — acerte inimigos para gerar Fúria." : `${d.def.resource} insuficiente!`);
      return;
    }
    if (sk.kind === "corpse" && !this.corpsesNear(this.clampTarget(sk, tx, ty), sk.radius!).length) {
      this.say("Nenhum cadáver perto do cursor.");
      return;
    }
    d.mana -= sk.cost;
    this.cooldowns[sk.id] = sk.cooldown;
    if (net.active) net.send({ t: "cast", skill: sk.id, tx, ty });
    this.busy = true;
    this.heroBody.setVelocity(0, 0);
    if (sk.kind !== "buff") this.hero.face(tx - this.hero.x, ty - this.hero.y);
    let applied = false;
    const apply = () => {
      if (applied) return;
      applied = true;
      this.applySkill(sk, tx, ty, target, rankMult(rank));
    };
    const token = ++this.castToken;
    const finish = () => {
      if (token !== this.castToken) return; // a newer action took over
      apply();
      if (!this.busy) return;
      this.busy = false;
      if (!this.leaping) this.hero.play2("idle");
    };
    this.hero.play2(sk.anim, {
      restart: true,
      timeScale: 1 + d.stats.attackSpeed,
      onEvent: (ev) => ev === sk.event && apply(),
      onComplete: finish,
    });
    // Safety net in case a clip never completes (e.g. interrupted).
    this.time.delayedCall(1500, () => this.busy && finish());
  }

  /** Point on the line hero → target, at most the skill's range away. */
  private clampTarget(sk: SkillDef, tx: number, ty: number) {
    const h = this.hero;
    const a = Phaser.Math.Angle.Between(h.x, h.y, tx, ty);
    const dist = Math.min(sk.range, Phaser.Math.Distance.Between(h.x, h.y, tx, ty));
    return new Phaser.Math.Vector2(h.x + Math.cos(a) * dist, h.y + Math.sin(a) * dist);
  }

  private enemiesIn(x: number, y: number, r: number) {
    return this.enemies.filter((e) => e.state !== "dead" && e.active && Phaser.Math.Distance.Between(x, y, e.spr.x, e.spr.y) < r + ENEMY_RADIUS * (e.spr.scaleX - 1));
  }

  private corpsesNear(p: Phaser.Math.Vector2, r: number) {
    return this.enemies.filter((e) => e.state === "dead" && e.corpse && !e.exploded && e.spr.active
      && Phaser.Math.Distance.Between(p.x, p.y, e.spr.x, e.spr.y) < r);
  }

  private applySkill(sk: SkillDef, tx: number, ty: number, target: Enemy | undefined, mult: number) {
    const h = this.hero;
    const now = this.time.now;
    switch (sk.kind) {
      case "melee": {
        const ang = Phaser.Math.Angle.Between(h.x, h.y - 8, tx, ty);
        let hits = 0;
        for (const e of this.enemiesIn(h.x, h.y, sk.range + ENEMY_RADIUS)) {
          const a = Phaser.Math.Angle.Between(h.x, h.y, e.spr.x, e.spr.y);
          if (e !== target && Math.abs(Phaser.Math.Angle.Wrap(a - ang)) > Phaser.Math.DegToRad((sk.arc ?? 90) / 2)) continue;
          this.heroHits(e, sk, mult);
          hits++;
        }
        if (hits) this.shake(70, 0.002);
        break;
      }
      case "warcry":
      case "nova": {
        const frost = sk.slow !== undefined;
        this.ringFx(h.x, h.y - 4, sk.radius!, frost ? 0x7edaf2 : 0xe0662a, 320);
        if (frost) this.emitters.frost.explode(30, h.x, h.y - 6);
        else this.emitters.dust.explode(sk.stun ? 40 : 16, h.x, h.y);
        this.shake(sk.stun ? 260 : 140, sk.stun ? 0.008 : 0.004);
        for (const e of this.enemiesIn(h.x, h.y, sk.radius!)) {
          this.heroHits(e, sk, mult);
          if (sk.slow) e.slowUntil = now + 3000;
          if (sk.stun) e.stunUntil = now + sk.stun;
        }
        break;
      }
      case "projectile":
      case "multishot": {
        // Spawn at the weapon socket, unless the target is so close the projectile would start past it.
        const sock = Phaser.Math.Distance.Between(h.x, h.y - 12, tx, ty) > 34 ? h.socket("muzzle") : null;
        const ox = h.x + (sock?.x ?? 0), oy = h.y + (sock?.y ?? -12);
        const base = Phaser.Math.Angle.Between(ox, oy, tx, ty);
        const p = sk.projectile!;
        const n = p.count ?? 1;
        for (let i = 0; i < n; i++) {
          const a = base + (n > 1 ? Phaser.Math.DegToRad(-p.spread! / 2 + (p.spread! * i) / (n - 1)) : 0);
          const img = this.add.image(ox, oy, p.tex).setRotation(a).setDepth(1e5);
          if (p.tex !== "fx_arrow") img.setBlendMode(Phaser.BlendModes.ADD);
          if (sk.id === "piercing") img.setScale(1.6).setTint(0xfff0b8);
          this.projectiles.push({ img, vx: Math.cos(a) * p.speed, vy: Math.sin(a) * p.speed, left: sk.range, pierce: p.pierce ?? 0, hit: new Set(), skill: sk, mult });
        }
        break;
      }
      case "drain": {
        const c = this.clampTarget(sk, tx, ty);
        this.discFx(c.x, c.y, sk.radius!, 0x7a0ff8, 600);
        this.emitters.shadow.explode(24, c.x, c.y);
        for (const e of this.enemiesIn(c.x, c.y, sk.radius!)) this.heroHits(e, sk, mult);
        break;
      }
      case "leap": {
        const c = this.clampTarget(sk, tx, ty);
        const free = this.grid.nearestFree(Math.floor(c.x / TILE), Math.floor(c.y / TILE), 3);
        const lx = free ? free[0] * TILE + 8 : h.x, ly = free ? free[1] * TILE + 8 : h.y;
        this.leaping = true;
        this.invulnUntil = now + 500;
        this.heroBody.enable = false;
        this.tweens.add({ targets: h, x: lx, y: ly, duration: 360, ease: "Sine.easeInOut" });
        this.tweens.add({
          targets: h, scale: 1.3, duration: 180, yoyo: true, ease: "Quad.easeOut",
          onComplete: () => {
            h.setScale(1);
            this.heroBody.enable = true;
            this.heroBody.reset(h.x, h.y);
            this.leaping = false;
            this.busy = false;
            this.hero.play2("idle");
            this.ringFx(h.x, h.y - 2, sk.radius!, 0xe0662a, 300);
            this.emitters.dust.explode(36, h.x, h.y);
            this.shake(180, 0.006);
            for (const e of this.enemiesIn(h.x, h.y, sk.radius!)) {
              this.heroHits(e, sk, mult);
              e.stunUntil = this.time.now + (sk.stun ?? 0);
            }
          },
        });
        break;
      }
      case "buff": {
        this.data_.addBuff(sk, now);
        this.ringFx(h.x, h.y - 4, 30, sk.buff!.tint, 400);
        this.emitters.gold.explode(14, h.x, h.y - 14);
        this.hud.message(`${sk.name} ativado!`, "#ffb38a");
        this.hud.markInventoryDirty();
        break;
      }
      case "rain":
      case "cloud": {
        const c = this.clampTarget(sk, tx, ty);
        const z: Zone = { x: c.x, y: c.y, r: sk.radius!, until: now + sk.duration!, next: now, skill: sk, mult, fx: sk.kind };
        if (sk.kind === "cloud") {
          z.img = this.add.image(c.x, c.y, "disc").setTint(0x5dff3d).setAlpha(0).setDepth(-1)
            .setScale(sk.radius! / 32, (sk.radius! / 32) * 0.65).setBlendMode(Phaser.BlendModes.ADD);
          this.tweens.add({ targets: z.img, alpha: 0.7, duration: 300 });
        } else {
          z.img = this.add.image(c.x, c.y, "ring").setTint(0xffe14d).setAlpha(0.6).setDepth(-1)
            .setScale(sk.radius! / 30, (sk.radius! / 30) * 0.62);
        }
        this.zones.push(z);
        break;
      }
      case "meteor": {
        const c = this.clampTarget(sk, tx, ty);
        const mark = this.add.image(c.x, c.y, "ring").setTint(0xff3a1a).setDepth(-1).setScale(sk.radius! / 30, (sk.radius! / 30) * 0.62);
        this.tweens.add({ targets: mark, alpha: { from: 0.2, to: 0.9 }, duration: 150, yoyo: true, repeat: 2 });
        const rock = this.add.image(c.x + 60, c.y - 200, "fx_fire").setScale(3).setDepth(1e5).setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({
          targets: rock, x: c.x, y: c.y - 6, duration: 650, ease: "Quad.easeIn",
          onUpdate: () => this.emitters.fire.explode(2, rock.x, rock.y),
          onComplete: () => {
            rock.destroy();
            mark.destroy();
            this.emitters.fire.explode(50, c.x, c.y - 6);
            this.emitters.dust.explode(20, c.x, c.y);
            this.ringFx(c.x, c.y, sk.radius!, 0xfe6607, 380);
            this.shake(260, 0.01);
            for (const e of this.enemiesIn(c.x, c.y, sk.radius!)) this.heroHits(e, sk, mult);
            const scorch = this.add.image(c.x, c.y, "disc").setTint(0xfe6607).setDepth(-1).setAlpha(0.7)
              .setScale(sk.radius! / 32, (sk.radius! / 32) * 0.65).setBlendMode(Phaser.BlendModes.ADD);
            this.zones.push({ x: c.x, y: c.y, r: sk.radius!, until: this.time.now + sk.duration!, next: this.time.now + sk.tick!,
              skill: sk, mult: mult * 0.12, fx: "fire", img: scorch });
          },
        });
        break;
      }
      case "chain": {
        const c = new Phaser.Math.Vector2(tx, ty);
        let cur = target && target.state !== "dead" ? target
          : this.enemiesIn(h.x, h.y, sk.range).sort((a, b) =>
            Phaser.Math.Distance.Between(a.spr.x, a.spr.y, c.x, c.y) - Phaser.Math.Distance.Between(b.spr.x, b.spr.y, c.x, c.y))[0];
        if (!cur) {
          this.boltFx(h.x, h.y - 16, this.clampTarget(sk, tx, ty).x, this.clampTarget(sk, tx, ty).y);
          break;
        }
        const hit = new Set<Enemy>();
        let fx = h.x, fy = h.y - 16, m = mult;
        for (let i = 0; i < (sk.chains ?? 3) && cur; i++) {
          const ex = cur.spr.x, ey = cur.spr.y - 10 * cur.spr.scaleY;
          this.boltFx(fx, fy, ex, ey);
          this.heroHits(cur, sk, m);
          this.emitters.frost.explode(8, ex, ey);
          hit.add(cur);
          fx = ex; fy = ey; m *= 0.85;
          cur = this.enemiesIn(ex, ey + 10, 90).filter((e) => !hit.has(e))
            .sort((a, b) => Phaser.Math.Distance.Between(a.spr.x, a.spr.y, ex, ey) - Phaser.Math.Distance.Between(b.spr.x, b.spr.y, ex, ey))[0];
        }
        break;
      }
      case "corpse": {
        const c = this.clampTarget(sk, tx, ty);
        const corpses = this.corpsesNear(c, sk.radius!);
        corpses.forEach((corpse, i) => {
          corpse.exploded = true;
          this.time.delayedCall(i * 90, () => {
            const x = corpse.spr.x, y = corpse.spr.y;
            this.gibs(x, y - 6, 6);
            this.splat(x, y, 3);
            this.ringFx(x, y, 44, 0xc1272d, 260);
            this.removeCorpse(corpse);
            const dmg = Math.round(corpse.maxHp * 0.35 * mult + this.data_.rollDamage(1).dmg);
            for (const e of this.enemiesIn(x, y, 50))
              this.damageEnemy(e, dmg, false, false, { kind: "gib", angle: Phaser.Math.Angle.Between(x, y, e.spr.x, e.spr.y) });
          });
        });
        break;
      }
    }
  }

  private ringFx(x: number, y: number, radius: number, tint: number, ms: number) {
    const r = this.add.image(x, y, "ring").setTint(tint).setDepth(1e5).setScale(0.1, 0.06).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: r, scaleX: radius / 30, scaleY: (radius / 30) * 0.62, alpha: { from: 1, to: 0 }, duration: ms, onComplete: () => r.destroy() });
  }

  private discFx(x: number, y: number, radius: number, tint: number, ms: number) {
    const disc = this.add.image(x, y, "disc").setTint(tint).setDepth(-1).setScale(0.2).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: disc, scaleX: radius / 32, scaleY: (radius / 32) * 0.65, alpha: { from: 1, to: 0 }, duration: ms, onComplete: () => disc.destroy() });
  }

  /** Jagged lightning segment that fades out. */
  private boltFx(x0: number, y0: number, x1: number, y1: number) {
    const g = this.add.graphics().setDepth(1e6).setBlendMode(Phaser.BlendModes.ADD);
    const steps = Math.max(3, Math.round(Phaser.Math.Distance.Between(x0, y0, x1, y1) / 10));
    for (const [w, c] of [[3, 0x3a7bff], [1, 0xe8f6ff]] as [number, number][]) {
      g.lineStyle(w, c, 1);
      g.beginPath();
      g.moveTo(x0, y0);
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        g.lineTo(x0 + (x1 - x0) * t + (Math.random() - 0.5) * 8, y0 + (y1 - y0) * t + (Math.random() - 0.5) * 8);
      }
      g.lineTo(x1, y1);
      g.strokePath();
    }
    this.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() });
  }

  private updateZones(time: number) {
    for (const z of this.zones) {
      if (time >= z.until) {
        if (z.img) this.tweens.add({ targets: z.img, alpha: 0, duration: 300, onComplete: () => z.img!.destroy() });
        continue;
      }
      if (time < z.next) continue;
      z.next = time + (z.skill.tick ?? 300);
      if (z.fx === "rain") {
        for (let i = 0; i < 4; i++) {
          const a = Math.random() * Math.PI * 2, r = Math.random() * z.r;
          const x = z.x + Math.cos(a) * r, y = z.y + Math.sin(a) * r * 0.62;
          const arrow = this.add.image(x, y - 90, "fx_arrow").setRotation(Math.PI / 2).setDepth(1e5);
          this.tweens.add({ targets: arrow, y, duration: 180, ease: "Quad.easeIn", onComplete: () => {
            arrow.destroy();
            this.emitters.dust.explode(3, x, y);
          } });
        }
      } else if (z.fx === "cloud") {
        this.emitters.shadow.explode(5, z.x + (Math.random() - 0.5) * z.r, z.y + (Math.random() - 0.5) * z.r * 0.5);
      } else {
        this.emitters.fire.explode(6, z.x + (Math.random() - 0.5) * z.r, z.y + (Math.random() - 0.5) * z.r * 0.5);
      }
      for (const e of this.enemiesIn(z.x, z.y, z.r)) {
        this.heroHits(e, z.skill, z.mult, true, z.fx === "rain" ? Math.PI / 2 : undefined);
        if (z.skill.slow) e.slowUntil = time + 600;
      }
    }
    this.zones = this.zones.filter((z) => time < z.until);
  }

  private heroHits(e: Enemy, sk: SkillDef, mult = 1, quiet = false, angle?: number) {
    const d = this.data_;
    const { dmg, crit } = d.rollDamage(sk.dmgMult * mult);
    const blow: Blow = {
      kind: sk.death,
      angle: angle ?? Phaser.Math.Angle.Between(this.hero.x, this.hero.y, e.spr.x, e.spr.y),
      big: sk.id === "piercing" || sk.id === "meteor" || sk.id === "explosive",
      toHero: !!sk.heal,
    };
    this.damageEnemy(e, dmg, crit, quiet, blow);
    const heal = dmg * (d.stats.lifeSteal + (sk.heal ?? 0));
    if (heal >= 1) {
      d.hp = Math.min(d.stats.maxHp, d.hp + heal);
      if (sk.heal) this.floatAt(this.hero.x, this.hero.y - 30, `+${Math.round(heal)}`, "heal");
    }
    if (sk.gain) d.mana = Math.min(d.stats.maxMana, d.mana + sk.gain);
    this.lastHit = { e, t: this.time.now };
  }

  private damageEnemy(e: Enemy, dmg: number, crit: boolean, quiet = false, blow: Blow = { kind: "normal", angle: 0 }) {
    if (e.state === "dead") return;
    if (e.proxy) {
      // Guest: the host owns enemy life. Report the hit and show the feedback locally.
      net.send({ t: "hit", id: e.id, dmg, crit, kind: blow.kind, angle: blow.angle });
      e.hp = Math.max(1, e.hp - dmg);
      if (settings.damageNumbers) this.floatAt(e.spr.x, e.spr.y - 22 * e.spr.scaleY, crit ? `${dmg}!` : String(dmg), crit ? "crit" : "");
      this.emitters.blood.explode(crit ? 14 : 6, e.spr.x, e.spr.y - 12 * e.spr.scaleY);
      if (!quiet) this.splat(e.spr.x, e.spr.y, 1);
      e.spr.setTintFill(0xffffff);
      this.time.delayedCall(70, () => e.state !== "dead" && this.restoreTint(e));
      return;
    }
    e.hp -= dmg;
    e.aggro = true;
    const cy = e.spr.y - 12 * e.spr.scaleY;
    if (settings.damageNumbers) this.floatAt(e.spr.x, cy - 10, crit ? `${dmg}!` : String(dmg), crit ? "crit" : "");
    if (this.time.now > this.hitSfxAt) {
      this.hitSfxAt = this.time.now + 70;
      sfx.hit(crit);
    }
    this.emitters.blood.explode(crit ? 18 : quiet ? 3 : 8, e.spr.x, cy);
    if (!quiet || Math.random() < 0.3) this.splat(e.spr.x, e.spr.y, crit ? 2 : 1);
    // Wounded variants rendered with SpriteKiln: the enemy looks worse as it loses life.
    const ratio = e.hp / e.maxHp;
    if (e.hp > 0 && e.def.hurt) e.spr.setSprite(ratio < 0.3 && e.def.maimed ? e.def.maimed : ratio < 0.6 ? e.def.hurt : e.def.sprite);
    e.spr.setTintFill(0xffffff);
    this.time.delayedCall(70, () => e.state !== "dead" && (this.hovered === e ? e.spr.setTint(0xff9a8a) : this.restoreTint(e)));
    if (e.hp <= 0) {
      this.killEnemy(e, blow, crit || -e.hp > e.maxHp * 0.25);
      return;
    }
    const flinch = e.def.flinch * (e.rank === "normal" ? 1 : e.rank === "champion" ? 0.4 : 0.12);
    if (!quiet && e.state !== "attack" && Math.random() < flinch) {
      e.state = "hit";
      e.body.setVelocity(0, 0);
      e.spr.play2("hit", { restart: true, onComplete: () => e.state !== "dead" && (e.state = "chase") });
    }
  }

  private killEnemy(e: Enemy, blow: Blow, overkill = false) {
    const d = this.data_;
    e.state = "dead";
    e.body.setVelocity(0, 0);
    e.body.enable = false;
    if (e.def.maimed) e.spr.setSprite(e.def.maimed);
    this.restoreTint(e);
    e.spr.setDepth(e.spr.y - 6);
    if (this.hovered === e) this.hovered = null;
    // A brutal "normal" kill (crit/overkill) blows the body apart.
    const kind = blow.kind === "normal" && overkill ? "gib" : blow.kind;
    if (this.isHost) net.send({ t: "die", id: e.id, kind, angle: blow.angle, big: !!(blow.big || overkill || e.rank === "boss"), overkill });
    const res = playDeath({
      scene: this, emitters: this.emitters, hero: this.hero,
      splat: (x, y, n) => this.splat(x, y, n), gibs: (x, y, n, t) => this.gibs(x, y, n, t),
      addDecal: (img) => this.addDecal(img), ringFx: (x, y, r, t, ms) => this.ringFx(x, y, r, t, ms),
    }, e.spr, kind, blow.angle, e.def.height, { big: blow.big || overkill || e.rank === "boss", toHero: blow.toHero });
    e.corpse = res.corpse;
    e.remains = res.remains;
    if (res.pool) {
      const pool = this.add.image(e.spr.x, e.spr.y + 1, "blood_pool").setDepth(-3).setScale(0.15).setFlipX(Math.random() < 0.5);
      this.tweens.add({ targets: pool, scale: e.spr.scaleX * (e.type === "brute" ? 1.3 : 1) * (0.8 + Math.random() * 0.4), duration: 1800, delay: 350, ease: "Quad.easeOut" });
      this.addDecal(pool);
    }

    const xp = Math.round((e.def.xp[0] + e.def.xp[1] * e.level) * (e.rank === "boss" ? 20 : e.rank === "champion" ? 3 : 1) * DIFFICULTIES[d.difficulty].xp);
    this.giveXp(xp);
    if (e.unique) {
      if (!d.quest.killed.includes(e.unique)) d.quest.killed.push(e.unique);
      this.hud.banner(`${e.name} caiu!`, this.dungeonRef ? "Masmorra concluída! Um portal se abriu." : "");
      sfx.quest();
      this.slowmo(900, 0.3);
      if (this.dungeonRef) {
        const key = `${this.zone.id}:${this.dungeonRef.index}`;
        if (!d.cleared.includes(key)) d.cleared.push(key);
        // Exit portal appears where the boss fell.
        const t = this.grid.nearestFree(Math.floor(e.spr.x / TILE), Math.floor(e.spr.y / TILE) - 2, 4);
        if (t) {
          this.portalSpr.setPosition(t[0] * TILE + 8, t[1] * TILE + TILE + 2).setDepth(t[1] * TILE + TILE - 2);
          this.portalSwirl.setPosition(t[0] * TILE + 8, t[1] * TILE + TILE - 11).setDepth(t[1] * TILE + TILE - 1);
          this.ringFx(this.portalSpr.x, this.portalSpr.y, 40, 0xc06bff, 600);
        }
        const q = d.currentQuest;
        if (q && d.quest.status === "active" && q.objective.type === "dungeon") this.questProgress();
        d.save();
      }
    }
    this.questKill(e);
    this.dropLoot(e);
    this.time.delayedCall(12000, () => {
      if (!e.spr.active) return;
      const shown = (e.remains ?? []).filter((o) => o instanceof Phaser.GameObjects.Image);
      this.tweens.add({ targets: [e.spr, ...shown], alpha: 0, duration: 800, onComplete: () => this.removeCorpse(e) });
    });
  }

  private removeCorpse(e: Enemy) {
    for (const o of e.remains ?? []) o.destroy();
    e.spr.destroy();
    this.enemies = this.enemies.filter((x) => x !== e);
  }

  private giveXp(xp: number) {
    const d = this.data_;
    const before = { hp: d.stats.maxHp, dmg: d.stats.dmgMax };
    const ups = d.gainXp(xp);
    if (ups) {
      d.save();
      const unlocked = d.def.skills.filter((sk) => sk.reqLevel > d.level - ups && sk.reqLevel <= d.level && sk.slot !== "primary" && sk.slot !== "secondary");
      this.levelUpFx(ups, [
        `+${Math.round(d.stats.maxHp - before.hp)} Vida`, `+${Math.round(d.stats.dmgMax - before.dmg)} Dano`,
        `+${ups} Ponto${ups > 1 ? "s" : ""} de habilidade`, "Vida restaurada",
      ], unlocked);
    }
  }

  /** Slows the whole game briefly (real time), for big moments. */
  private slowmo(ms: number, scale: number) {
    this.slowmoUntil = performance.now() + ms;
    this.time.timeScale = scale;
    this.tweens.timeScale = scale;
    this.anims.globalTimeScale = scale;
    this.physics.world.timeScale = 1 / scale;
    window.setTimeout(() => {
      if (performance.now() < this.slowmoUntil - 5 || !this.scene.isActive()) return;
      this.time.timeScale = 1;
      this.tweens.timeScale = 1;
      this.anims.globalTimeScale = 1;
      this.physics.world.timeScale = 1;
    }, ms);
  }

  private levelUpFx(ups: number, gains: string[], unlocked: SkillDef[]) {
    const h = this.hero;
    const d = this.data_;
    sfx.levelUp();
    this.slowmo(700, 0.3);
    this.hud.levelUp(d.level, gains, unlocked);
    this.hud.markInventoryDirty();
    // Zoom punch.
    const cam = this.cameras.main;
    const z = cam.zoom;
    cam.zoomTo(z * 1.25, 180, "Quad.easeOut");
    window.setTimeout(() => this.scene.isActive() && cam.zoomTo(z, 600, "Quad.easeInOut"), 650);
    cam.flash(250, 255, 240, 180);
    // Pillar of light, golden fountain and a shockwave that throws enemies back.
    const beam = this.add.image(h.x, h.y + 2, "beam").setOrigin(0.5, 1).setTint(0xffe14d).setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(1e5).setScale(0.2, 0);
    this.tweens.add({ targets: beam, scaleX: 3, scaleY: 2.4, duration: 220, ease: "Back.easeOut" });
    this.tweens.add({ targets: beam, alpha: 0, scaleX: 0.5, delay: 700, duration: 700, onComplete: () => beam.destroy() });
    for (let i = 0; i < 8; i++) this.time.delayedCall(i * 70, () => this.emitters.gold.explode(14, h.x + (Math.random() - 0.5) * 16, h.y - 10 - Math.random() * 30));
    this.ringFx(h.x, h.y - 2, 90, 0xffe14d, 600);
    this.time.delayedCall(150, () => this.ringFx(h.x, h.y - 2, 60, 0xffffff, 500));
    for (const e of this.enemiesIn(h.x, h.y, 90)) {
      const a = Phaser.Math.Angle.Between(h.x, h.y, e.spr.x, e.spr.y);
      this.tweens.add({ targets: e.spr, x: e.spr.x + Math.cos(a) * 26, y: e.spr.y + Math.sin(a) * 18, duration: 250, ease: "Quad.easeOut" });
      e.stunUntil = this.time.now + 1200;
      this.damageEnemy(e, Math.round(d.stats.dmgMax * ups), false, true, { kind: "normal", angle: a });
    }
  }

  // ---------------------------------------------------------------- enemies: AI

  private updateEnemies(time: number, delta: number) {
    if (this.isGuest) return this.updateProxies(delta);
    for (const e of this.enemies) {
      if (e.state === "dead") continue;
      // Each enemy goes after the nearest living player (local hero or the co-op partner).
      const h = this.targetFor(e);
      const dist = Phaser.Math.Distance.Between(h.x, h.y, e.spr.x, e.spr.y);
      const active = dist < ACTIVE_RANGE || e.aggro;
      if (active !== e.active) {
        e.active = active;
        e.body.enable = active;
        if (!active) e.body.setVelocity(0, 0);
      }
      if (!active) continue;
      e.spr.setDepth(e.spr.y);
      if (time < e.stunUntil) {
        e.body.setVelocity(0, 0);
        if (e.state !== "hit") e.spr.play2("idle", { timeScale: 0.3 });
        e.spr.setTint(0xfff2a0);
        if (Math.random() < 0.04) this.emitters.gold.explode(1, e.spr.x, e.spr.y - 24 * e.spr.scaleY);
        continue;
      }
      if (e.state === "attack" || e.state === "hit") continue;

      const fromHome = Phaser.Math.Distance.Between(e.home.x, e.home.y, e.spr.x, e.spr.y);
      if (h.dead || this.inTownAt(h.x, h.y) || fromHome > 320) {
        if (e.aggro) {
          e.aggro = false;
          e.hp = e.maxHp;
          e.path = [];
          if (e.def.hurt) e.spr.setSprite(e.def.sprite);
        }
      } else if (dist < e.def.aggro * (e.rank === "boss" ? 1.3 : 1)) e.aggro = true;

      const slowed = time < e.slowUntil;
      if (slowed) e.spr.setTint(0x9fdfff);
      else if (this.hovered !== e) this.restoreTint(e);
      const speed = e.speed * (slowed ? 0.45 : 1);

      if (e.charging) continue;
      if (e.aggro && e.boss && this.bossTurn(e, time, dist, h)) continue;
      if (e.aggro) {
        const reach = e.def.reach * e.spr.scaleX;
        if (dist <= reach) {
          e.body.setVelocity(0, 0);
          e.spr.face(h.x - e.spr.x, h.y - e.spr.y);
          if (time >= e.nextAttack) this.enemyAttack(e, time, h);
          else e.spr.play2("idle");
          continue;
        }
        this.steer(e, h.x, h.y, speed, time);
      } else {
        if (time > e.wanderAt) {
          e.wanderAt = time + 1500 + Math.random() * 3000;
          e.wander = Math.random() < 0.5 ? undefined
            : new Phaser.Math.Vector2(e.home.x + (Math.random() - 0.5) * 70, e.home.y + (Math.random() - 0.5) * 70);
        }
        if (e.wander && Phaser.Math.Distance.Between(e.spr.x, e.spr.y, e.wander.x, e.wander.y) > 4) {
          this.steer(e, e.wander.x, e.wander.y, speed * 0.5, time, false);
        } else {
          e.wander = undefined;
          e.body.setVelocity(0, 0);
          e.spr.play2("idle");
        }
      }
    }
    // Keep enemies from stacking on each other.
    const act = this.enemies.filter((e) => e.active && e.state !== "dead");
    for (let i = 0; i < act.length; i++)
      for (let j = i + 1; j < act.length; j++) {
        const a = act[i].spr, b = act[j].spr;
        const dx = b.x - a.x, dy = b.y - a.y;
        const min = 6.5 * (act[i].def.body / 5 * a.scaleX + act[j].def.body / 5 * b.scaleX);
        const d2 = dx * dx + dy * dy;
        if (d2 > 0.01 && d2 < min * min) {
          const dd = Math.sqrt(d2), push = ((min - dd) / dd) * 0.5 * Math.min(1, delta / 16);
          a.x -= dx * push; a.y -= dy * push;
          b.x += dx * push; b.y += dy * push;
        }
      }
  }

  private steer(e: Enemy, tx: number, ty: number, speed: number, time: number, usePath = true) {
    const sx = Math.floor(e.spr.x / TILE), sy = Math.floor(e.spr.y / TILE);
    const gx = Math.floor(tx / TILE), gy = Math.floor(ty / TILE);
    let px = tx, py = ty;
    if (usePath && !this.grid.lineFree(sx, sy, gx, gy)) {
      if (time > e.repathAt || !e.path.length) {
        e.repathAt = time + 600 + Math.random() * 300;
        e.path = (this.grid.find(sx, sy, gx, gy, 1500) ?? []).map(([x, y]) => [x * TILE + 8, y * TILE + 8]);
      }
      while (e.path.length && Phaser.Math.Distance.Between(e.spr.x, e.spr.y, e.path[0][0], e.path[0][1]) < 4) e.path.shift();
      if (e.path.length) [px, py] = e.path[0];
    } else e.path = [];
    const dx = px - e.spr.x, dy = py - e.spr.y;
    const len = Math.hypot(dx, dy) || 1;
    e.body.setVelocity((dx / len) * speed, (dy / len) * speed);
    e.spr.face(dx, dy);
    e.spr.play2("walk", { timeScale: speed / e.def.speed });
  }

  private enemyAttack(e: Enemy, time: number, target: Target) {
    e.state = "attack";
    e.nextAttack = time + e.def.cooldown * (e.rank === "boss" ? 1.1 : 1) + Math.random() * 400;
    let applied = false;
    const hit = () => {
      if (applied || e.state === "dead" || target.dead) return;
      applied = true;
      const t = this.targetPos(target);
      const dist = Phaser.Math.Distance.Between(t.x, t.y, e.spr.x, e.spr.y);
      if (e.type === "brute") {
        this.shake(120, 0.005);
        this.emitters.dust.explode(14, e.spr.x + (t.x - e.spr.x) * 0.5, e.spr.y + (t.y - e.spr.y) * 0.5);
      }
      if (e.def.hitRange === 0) this.enemyBolt(e, 0, 1, t);
      else if (dist <= e.def.hitRange * e.spr.scaleX) this.hurtTarget(target, e);
    };
    e.spr.play2("attack", {
      restart: true,
      timeScale: e.rank === "boss" ? 0.85 : 1,
      onEvent: (ev) => (ev === "hit" || ev === "release") && hit(),
      onComplete: () => {
        hit();
        if (e.state !== "dead") e.state = "chase";
      },
    });
  }

  // ---------------------------------------------------------------- bosses

  /** Runs a ready boss ability; returns true when the boss is busy with it. */
  private bossTurn(e: Enemy, time: number, dist: number, target: Target): boolean {
    const boss = e.boss!;
    if (!e.announced) {
      e.announced = true;
      sfx.boss();
      this.shake(400, 0.006);
      this.hud.banner(boss.name, "Chefe");
    }
    const i = boss.abilities.findIndex((a, k) => time >= e.abilityAt![k] && dist < (a.kind === "charge" ? 220 : 260));
    if (i < 0) return false;
    const a = boss.abilities[i];
    e.abilityAt![i] = time + a.cooldown * (0.85 + Math.random() * 0.3);
    this.useBossAbility(e, a, target);
    return true;
  }

  private useBossAbility(e: Enemy, a: BossAbility, target: Target) {
    const h = this.targetPos(target);
    const frost = e.type === "lich";
    const tint = frost ? 0x7edaf2 : 0xff3a1a;
    e.state = "attack";
    e.body.setVelocity(0, 0);
    e.spr.face(h.x - e.spr.x, h.y - e.spr.y);
    const anim = e.spr.has("cast") && a.kind !== "slam" && a.kind !== "charge" ? "cast" : "attack";
    const done = () => e.state !== "dead" && (e.state = "chase");
    switch (a.kind) {
      case "slam":
        this.telegraph(e, h.x, h.y, a.radius, a.mult, 900, tint);
        e.spr.play2(anim, { restart: true, timeScale: 0.7, onComplete: done });
        break;
      case "nova":
        for (let k = 0; k < a.count; k++) {
          const ang = Math.random() * Math.PI * 2, r = k === 0 ? 0 : 20 + Math.random() * 50;
          this.telegraph(e, h.x + Math.cos(ang) * r, h.y + Math.sin(ang) * r * 0.6, a.radius, a.mult, 1000 + k * 120, tint);
        }
        e.spr.play2(anim, { restart: true, onComplete: done });
        break;
      case "shockwave": {
        e.spr.play2(anim, { restart: true, timeScale: 0.8, onComplete: done,
          onEvent: (ev) => (ev === "hit" || ev === "release") && this.shockwave(e, a.radius, a.mult, tint) });
        break;
      }
      case "bolts":
        e.spr.play2(anim, { restart: true, onComplete: done,
          onEvent: (ev) => {
            if (ev !== "release" && ev !== "hit") return;
            for (let k = 0; k < a.count; k++) this.enemyBolt(e, (k - (a.count - 1) / 2) * 0.22, a.mult, this.targetPos(target));
          } });
        break;
      case "summon":
        e.spr.play2(anim, { restart: true, onComplete: done });
        this.time.delayedCall(400, () => {
          if (e.state === "dead") return;
          this.emitters.shadow.explode(30, e.spr.x, e.spr.y - 10);
          this.hud.message(`${e.name} invoca reforços!`, "#ff8a3a");
          for (let k = 0; k < a.count; k++) {
            const t = this.grid.nearestFree(Math.floor(e.spr.x / TILE) + Phaser.Math.Between(-3, 3), Math.floor(e.spr.y / TILE) + Phaser.Math.Between(-3, 3), 3);
            if (!t) continue;
            const m = this.spawnEnemy(t[0] * TILE + 8, t[1] * TILE + 8, e.pack, a.type, "normal");
            this.setLevel(m, Math.max(1, e.level - 2));
            m.aggro = true;
            this.ringFx(m.spr.x, m.spr.y, 14, 0x7a0ff8, 300);
          }
        });
        break;
      case "charge": {
        // Wind up (red line toward the hero), then rush along it hitting anything in the way.
        const tx = h.x, ty = h.y;
        const ang = Phaser.Math.Angle.Between(e.spr.x, e.spr.y, tx, ty);
        const len = Math.min(220, Phaser.Math.Distance.Between(e.spr.x, e.spr.y, tx, ty) + 30);
        const g = this.add.graphics().setDepth(-1);
        g.lineStyle(10 * e.spr.scaleX, 0xff3a1a, 0.35).lineBetween(e.spr.x, e.spr.y, e.spr.x + Math.cos(ang) * len, e.spr.y + Math.sin(ang) * len);
        this.tweens.add({ targets: g, alpha: { from: 0.3, to: 1 }, duration: 120, yoyo: true, repeat: 2, onComplete: () => g.destroy() });
        e.spr.play2("idle", { restart: true, timeScale: 2 });
        this.time.delayedCall(600, () => {
          if (e.state === "dead") return;
          let end = { x: e.spr.x, y: e.spr.y };
          for (let dd = 0; dd <= len; dd += 6) {
            const x = e.spr.x + Math.cos(ang) * dd, y = e.spr.y + Math.sin(ang) * dd;
            if (!this.grid.free(Math.floor(x / TILE), Math.floor(y / TILE))) break;
            end = { x, y };
          }
          let hit = false;
          e.charging = true;
          e.spr.play2("walk", { restart: true, timeScale: 3 });
          this.tweens.add({
            targets: e.spr, x: end.x, y: end.y, duration: Math.max(150, len * 1.6), ease: "Quad.easeIn",
            onUpdate: () => {
              this.emitters.dust.explode(1, e.spr.x, e.spr.y);
              if (!hit) {
                for (const p of this.players()) {
                  const pp = this.targetPos(p);
                  if (Phaser.Math.Distance.Between(e.spr.x, e.spr.y, pp.x, pp.y) < 18 * e.spr.scaleX) {
                    hit = true;
                    this.hurtTarget(p, e, a.mult);
                    this.shake(160, 0.008);
                  }
                }
              }
            },
            onComplete: () => {
              e.charging = false;
              e.body.reset(e.spr.x, e.spr.y);
              done();
            },
          });
        });
        break;
      }
    }
  }

  /** Danger circle that fills up and then explodes. */
  private telegraph(e: Enemy, x: number, y: number, radius: number, mult: number, ms: number, tint: number) {
    if (this.isHost) net.send({ t: "fx", kind: "circle", x, y, r: radius, ms, tint });
    const base = this.add.image(x, y, "disc").setTint(tint).setAlpha(0.35).setDepth(-1).setScale(radius / 32, (radius / 32) * 0.62);
    const fill = this.add.image(x, y, "disc").setTint(tint).setAlpha(0.55).setDepth(-1).setScale(0.05).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: fill, scaleX: radius / 32, scaleY: (radius / 32) * 0.62, duration: ms, ease: "Linear" });
    this.time.delayedCall(ms, () => {
      base.destroy();
      fill.destroy();
      if (e.state === "dead") return;
      this.ringFx(x, y, radius, tint, 260);
      (tint === 0x7edaf2 ? this.emitters.frost : this.emitters.fire).explode(24, x, y - 4);
      this.emitters.dust.explode(12, x, y);
      this.shake(140, 0.005);
      if (this.isGuest) return;
      for (const p of this.players()) {
        const pp = this.targetPos(p);
        if (Phaser.Math.Distance.Between(pp.x, (pp.y - y) / 0.62 + y, x, y) < radius) this.hurtTarget(p, e, mult);
      }
    });
  }

  /** Ring that expands from the boss: dodge it by being outside its band (or by dashing through). */
  private shockwave(e: Enemy, radius: number, mult: number, tint: number) {
    const x = e.spr.x, y = e.spr.y;
    if (this.isHost) net.send({ t: "fx", kind: "wave", x, y, r: radius, tint });
    this.ringFx(x, y, radius, tint, 700);
    this.shake(300, 0.008);
    this.emitters.dust.explode(40, x, y);
    const hit = new Set<boolean>();
    const start = this.time.now;
    this.time.addEvent({ delay: 30, repeat: 24, callback: () => {
      const r = radius * Math.min(1, (this.time.now - start) / 700);
      for (const p of this.players()) {
        const pp = this.targetPos(p);
        const d = Phaser.Math.Distance.Between(pp.x, pp.y, x, y);
        if (!hit.has(p.remote) && Math.abs(d - r) < 14) {
          hit.add(p.remote);
          this.hurtTarget(p, e, mult);
        }
      }
    } });
  }

  private enemyBolt(e: Enemy, spread: number, mult: number, at: { x: number; y: number }) {
    const sock = e.spr.socket("muzzle");
    const ox = e.spr.x + (sock?.x ?? 0), oy = e.spr.y + (sock?.y ?? -20 * e.spr.scaleY);
    const a = Phaser.Math.Angle.Between(ox, oy, at.x, at.y - 12) + spread;
    const vx = Math.cos(a) * 170, vy = Math.sin(a) * 170;
    if (this.isHost) net.send({ t: "fx", kind: "bolt", x: ox, y: oy, vx, vy, tint: e.type === "lich" ? 0x7edaf2 : 0xc06bff });
    this.addBolt(ox, oy, vx, vy, e.type === "lich" ? 0x7edaf2 : 0xc06bff, e, mult);
  }

  private addBolt(x: number, y: number, vx: number, vy: number, tint: number, src: Enemy | null, mult: number) {
    const img = this.add.image(x, y, "fx_fire").setTint(tint).setScale(1.3).setBlendMode(Phaser.BlendModes.ADD).setDepth(1e5);
    this.enemyBolts.push({ img, vx, vy, left: 320, src, mult });
  }

  private updateBolts(dt: number) {
    for (const b of this.enemyBolts) {
      b.img.x += b.vx * dt;
      b.img.y += b.vy * dt;
      b.left -= Math.hypot(b.vx, b.vy) * dt;
      if (Math.random() < 0.3) this.emitters.frost.explode(1, b.img.x, b.img.y);
      let done = b.left <= 0 || !this.grid.free(Math.floor(b.img.x / TILE), Math.floor((b.img.y + 12) / TILE));
      if (!done && b.src) {
        for (const p of this.players()) {
          const pp = this.targetPos(p);
          if (Phaser.Math.Distance.Between(b.img.x, b.img.y, pp.x, pp.y - 12) < 9) {
            this.hurtTarget(p, b.src, b.mult);
            this.emitters.frost.explode(10, b.img.x, b.img.y);
            done = true;
            break;
          }
        }
      }
      if (done) {
        b.img.destroy();
        b.left = -1;
      }
    }
    this.enemyBolts = this.enemyBolts.filter((b) => b.left > 0);
  }

  // ---------------------------------------------------------------- multiplayer

  private get isHost() {
    return net.role === "host";
  }

  private get isGuest() {
    return net.role === "guest";
  }

  /** Map seed for a zone or one of its dungeons (shared with the partner on travel). */
  private seedFor(zone: ZoneId, dungeon: number | null) {
    const d = this.data_;
    return dungeon === null ? d.seed(zone) : d.seed(`${zone}:${dungeon}:${d.cleared.length}`);
  }

  private inTownAt(x: number, y: number) {
    const t = this.map.town;
    const tx = x / TILE, ty = y / TILE;
    return tx > t.x0 && tx < t.x1 && ty > t.y0 && ty < t.y1 + 1;
  }

  /** Living players enemies can go after. */
  private players(): Target[] {
    const out: Target[] = [];
    if (!this.dead) out.push({ x: this.hero.x, y: this.hero.y, remote: false, dead: false });
    if (this.remote && !this.remote.st.dead) out.push({ x: this.remote.spr.x, y: this.remote.spr.y, remote: true, dead: false });
    return out;
  }

  private targetFor(e: Enemy): Target {
    let best: Target = { x: this.hero.x, y: this.hero.y, remote: false, dead: this.dead };
    let bd = Infinity;
    for (const p of this.players()) {
      const dd = Phaser.Math.Distance.Between(p.x, p.y, e.spr.x, e.spr.y);
      if (dd < bd) { bd = dd; best = p; }
    }
    return best;
  }

  /** Current position of a target (players move during wind-ups). */
  private targetPos(t: Target) {
    return t.remote && this.remote ? { x: this.remote.spr.x, y: this.remote.spr.y } : t.remote ? t : { x: this.hero.x, y: this.hero.y };
  }

  private setupNet() {
    net.clearHandlers();
    net.onStatus(() => this.renderSession());
    if (!net.active) return;
    this.renderSession();
    net.on("state", (m) => this.onRemoteState(m.player));
    net.on("cast", (m) => this.remoteCast(m));
    net.on("bye", () => {
      this.dropRemote();
      if (this.isGuest) {
        this.hud.banner("Sessão encerrada", "O anfitrião saiu. Você continua sozinho.");
        net.leave();
        this.time.delayedCall(1500, () => this.restartAt({}));
      } else {
        this.hud.message("Seu colega saiu da sessão.", "#ff8a3a");
        this.renderSession();
      }
    });
    if (this.isHost) {
      net.on("hello", (m) => {
        this.onRemoteState(m.player);
        net.send({ t: "welcome", zone: this.zone.id, dungeon: this.dungeonRef?.index ?? null, seed: this.mapSeed,
          x: this.hero.x, y: this.hero.y, difficulty: this.data_.difficulty, tier: this.tier });
        this.hud.banner(`${m.player.name} entrou!`, `Nível ${m.player.level}`);
        sfx.quest();
        this.renderSession();
      });
      net.on("hit", (m) => {
        const e = this.byId.get(m.id);
        if (!e || e.state === "dead") return;
        e.aggro = true;
        if (m.slow) e.slowUntil = this.time.now + m.slow;
        if (m.stun) e.stunUntil = this.time.now + m.stun;
        if (m.dmg > 0) this.damageEnemy(e, m.dmg, m.crit, false, { kind: m.kind as DeathKind, angle: m.angle });
      });
    } else {
      net.on("snap", (m) => this.onSnap(m.e));
      net.on("die", (m) => {
        const e = this.byId.get(m.id);
        if (!e || e.state === "dead") return;
        e.hp = 0;
        this.killEnemy(e, { kind: m.kind as DeathKind, angle: m.angle, big: m.big }, false);
      });
      net.on("hurt", (m) => this.hurtHeroRaw(m.raw, m.level));
      net.on("fx", (m) => this.onFx(m));
      net.on("travel", (m) => {
        const d = this.data_;
        d.save();
        this.cameras.main.fadeOut(300, 10, 5, 12);
        this.time.delayedCall(320, () => this.scene.restart({
          hero: d, dungeon: m.dungeon ?? undefined, exitAt: m.exitAt ?? undefined, netSeed: m.seed, netZone: m.zone as ZoneId,
        }));
      });
    }
  }

  /** Invite a friend from the pause menu. */
  private startHosting() {
    this.hud.message("Abrindo sessão...", "#9fe8ff");
    net.host().then(() => {
      this.setupNet();
      this.hud.banner("Sessão aberta!", "Copie o link no painel à esquerda e mande para o seu colega.");
    }).catch(() => this.hud.message("Não foi possível abrir a sessão (sem internet?).", "#ff6a5a"));
  }

  private renderSession() {
    if (!net.active) {
      this.sessionEl?.remove();
      this.sessionEl = undefined;
      return;
    }
    if (!this.sessionEl) {
      this.sessionEl = document.createElement("div");
      this.sessionEl.className = "session interactive";
      document.getElementById("ui")!.appendChild(this.sessionEl);
    }
    const el = this.sessionEl;
    const partner = this.remote ? `${this.remote.st.name} nv ${this.remote.st.level}` : "";
    if (this.isHost) {
      el.innerHTML = `<div>Sessão multijogador</div><div class="code">${net.code}</div>
        <div class="st ${net.peerConnected ? "ok" : ""}">${net.peerConnected ? `Conectado: ${partner || "colega"}` : "Aguardando colega..."}</div>`;
      const copy = document.createElement("button");
      copy.className = "btn";
      copy.textContent = "Copiar link de convite";
      copy.onclick = () => {
        void navigator.clipboard?.writeText(net.inviteLink());
        copy.textContent = "Link copiado!";
      };
      el.appendChild(copy);
    } else {
      el.innerHTML = `<div>Na sessão <b>${net.code}</b></div><div class="st ok">Anfitrião: ${partner || "conectando..."}</div>`;
    }
    const leave = document.createElement("button");
    leave.className = "btn";
    leave.textContent = "Sair da sessão";
    leave.onclick = () => {
      net.leave();
      this.dropRemote();
      this.renderSession();
      if (!this.isHost) this.restartAt({});
    };
    el.appendChild(leave);
  }

  private localState(): PlayerState {
    const d = this.data_;
    return { name: d.def.name, cls: d.cls, level: d.level, hp: Math.round(d.hp), maxHp: Math.round(d.stats.maxHp),
      x: Math.round(this.hero.x), y: Math.round(this.hero.y), anim: this.hero.current, dir: this.hero.dir, dead: this.dead };
  }

  private updateNet(time: number, dt: number) {
    if (!net.active) return;
    if (net.peerConnected && time > this.netAt) {
      this.netAt = time + 66;
      net.send({ t: "state", player: this.localState() });
    }
    if (this.isHost && this.remote && time > this.snapAt) {
      this.snapAt = time + 100;
      const r = this.remote.spr;
      const rows: EnemyRow[] = [];
      for (const e of this.enemies) {
        if (e.state === "dead" || Phaser.Math.Distance.Between(e.spr.x, e.spr.y, r.x, r.y) > 520) continue;
        const row: EnemyRow = [e.id, e.type, Math.round(e.spr.x), Math.round(e.spr.y), e.spr.current, e.spr.dir, Math.round(e.hp),
          e.maxHp, e.rank, e.level];
        if (e.unique) row.push(e.unique);
        rows.push(row);
      }
      net.send({ t: "snap", e: rows });
    }
    // Partner sprite: glide toward its last reported position.
    if (this.remote) {
      const r = this.remote;
      const k = Math.min(1, dt * 12);
      r.spr.x += (r.st.x - r.spr.x) * k;
      r.spr.y += (r.st.y - r.spr.y) * k;
      r.spr.setDepth(r.spr.y);
    }
  }

  private onRemoteState(p: PlayerState) {
    if (!this.remote || this.remote.spr.spriteName !== p.cls) {
      this.dropRemote();
      const spr = new KilnSprite(this, p.x, p.y, p.cls as SpriteName);
      spr.play2("idle");
      const tag = document.createElement("div");
      tag.className = "ptag";
      tag.innerHTML = `<div class="pn">${p.name} nv ${p.level}</div><div class="pb"><div></div></div>`;
      this.hud.world.appendChild(tag);
      this.remote = { spr, tag, st: p };
      this.renderSession();
    }
    const r = this.remote;
    const prev = r.st;
    r.st = p;
    if (prev.level !== p.level) r.tag.querySelector(".pn")!.textContent = `${p.name} nv ${p.level}`;
    if (p.dead) {
      if (r.spr.current !== "death") r.spr.play2("death", { restart: true });
      return;
    }
    // Loops come from the state; attacks and casts from "cast" messages.
    const busy = (r.spr.current === "attack" || r.spr.current === "cast" || r.spr.current === "death") && r.spr.anims.isPlaying;
    if (!busy && (p.anim === "idle" || p.anim === "walk")) {
      const turned = r.spr.dir !== p.dir;
      r.spr.dir = p.dir as Dir;
      r.spr.play2(p.anim, { restart: turned || r.spr.current === "death" });
    }
  }

  private dropRemote() {
    if (!this.remote) return;
    this.remote.spr.destroy();
    this.remote.tag.remove();
    this.remote = null;
  }

  /** Draws the partner's skill (damage is reported by the partner itself). */
  private remoteCast(m: Extract<Msg, { t: "cast" }>) {
    const r = this.remote;
    if (!r) return;
    const sk = CLASSES[r.st.cls as keyof typeof CLASSES]?.skills.find((x) => x.id === m.skill);
    if (!sk) return;
    r.spr.face(m.tx - r.spr.x, m.ty - r.spr.y);
    r.spr.play2(sk.anim, { restart: true });
    this.time.delayedCall(230, () => {
      if (!this.remote) return;
      const x = r.spr.x, y = r.spr.y;
      const clamp = () => {
        const a = Phaser.Math.Angle.Between(x, y, m.tx, m.ty);
        const dd = Math.min(sk.range, Phaser.Math.Distance.Between(x, y, m.tx, m.ty));
        return { x: x + Math.cos(a) * dd, y: y + Math.sin(a) * dd };
      };
      switch (sk.kind) {
        case "projectile":
        case "multishot": {
          const p = sk.projectile!;
          const n = p.count ?? 1;
          const base = Phaser.Math.Angle.Between(x, y - 12, m.tx, m.ty);
          for (let i = 0; i < n; i++) {
            const a = base + (n > 1 ? Phaser.Math.DegToRad(-p.spread! / 2 + (p.spread! * i) / (n - 1)) : 0);
            const img = this.add.image(x, y - 12, p.tex).setRotation(a).setDepth(1e5);
            if (p.tex !== "fx_arrow") img.setBlendMode(Phaser.BlendModes.ADD);
            this.projectiles.push({ img, vx: Math.cos(a) * p.speed, vy: Math.sin(a) * p.speed, left: sk.range, pierce: 99, hit: new Set(), skill: sk, mult: 1, ghost: true });
          }
          break;
        }
        case "melee": case "warcry": case "nova": case "leap":
          this.ringFx(x, y - 4, sk.radius ?? sk.range, sk.slow ? 0x7edaf2 : 0xe0662a, 300);
          break;
        case "buff":
          this.ringFx(x, y - 4, 30, sk.buff!.tint, 400);
          break;
        case "chain": {
          const c = clamp();
          this.boltFx(x, y - 16, c.x, c.y);
          break;
        }
        case "drain": case "cloud": case "rain": case "meteor": {
          const c = clamp();
          this.discFx(c.x, c.y, sk.radius ?? 40, sk.kind === "meteor" ? 0xfe6607 : sk.kind === "rain" ? 0xffe14d : sk.kind === "drain" ? 0x7a0ff8 : 0x5dff3d, 700);
          break;
        }
      }
    });
  }

  /** Guest: create, move and retire enemy copies from the host's snapshot. */
  private onSnap(rows: EnemyRow[]) {
    const now = this.time.now;
    for (const [id, type, x, y, anim, dir, hp, maxHp, rank, level, unique] of rows) {
      let e = this.byId.get(id);
      if (!e) {
        const pack: Pack = { x: Math.floor(x / TILE), y: Math.floor(y / TILE), level, count: 1, champion: false, faction: "goblin" };
        e = this.spawnEnemy(x, y, pack, type as EnemyType, rank as EnemyRank, unique as UniqueId | undefined);
        this.byId.delete(e.id);
        e.id = id;
        e.proxy = true;
        e.body.enable = false;
        this.byId.set(id, e);
        this.setLevel(e, level);
      }
      if (e.state === "dead") continue;
      e.seenAt = now;
      e.netTarget = { x, y };
      e.hp = hp;
      e.maxHp = maxHp;
      e.level = level;
      e.aggro = true;
      if (e.def.hurt) {
        const ratio = hp / maxHp;
        e.spr.setSprite(ratio < 0.3 && e.def.maimed ? e.def.maimed : ratio < 0.6 ? e.def.hurt : e.def.sprite);
      }
      const turned = e.spr.dir !== dir;
      if (anim !== e.spr.current || turned) {
        e.spr.dir = dir as Dir;
        e.spr.play2(anim, { restart: anim !== e.spr.current || !(anim === "idle" || anim === "walk") ? true : turned });
      }
    }
  }

  private updateProxies(delta: number) {
    const now = this.time.now;
    const k = Math.min(1, (delta / 1000) * 12);
    for (const e of [...this.enemies]) {
      if (!e.proxy || e.state === "dead") continue;
      if (now - (e.seenAt ?? 0) > 2000) {
        // Out of the host's snapshot range: retire the copy.
        e.spr.destroy();
        this.byId.delete(e.id);
        this.enemies = this.enemies.filter((x) => x !== e);
        continue;
      }
      if (e.netTarget) {
        e.spr.x += (e.netTarget.x - e.spr.x) * k;
        e.spr.y += (e.netTarget.y - e.spr.y) * k;
      }
      e.spr.setDepth(e.spr.y);
      // Crowd control applied by the guest's skills is forwarded to the host.
      if (e.slowUntil > (e.sentSlow ?? 0) + 50) {
        e.sentSlow = e.slowUntil;
        net.send({ t: "hit", id: e.id, dmg: 0, crit: false, kind: "normal", angle: 0, slow: e.slowUntil - now });
      }
      if (e.stunUntil > (e.sentStun ?? 0) + 50) {
        e.sentStun = e.stunUntil;
        net.send({ t: "hit", id: e.id, dmg: 0, crit: false, kind: "normal", angle: 0, stun: e.stunUntil - now });
      }
      if (now < e.slowUntil) e.spr.setTint(0x9fdfff);
      else if (now < e.stunUntil) e.spr.setTint(0xfff2a0);
      else if (this.hovered !== e) this.restoreTint(e);
    }
  }

  /** Guest: boss telegraphs, shockwaves and bolts drawn from the host's events. */
  private onFx(m: Extract<Msg, { t: "fx" }>) {
    if (m.kind === "circle") {
      const base = this.add.image(m.x, m.y, "disc").setTint(m.tint!).setAlpha(0.35).setDepth(-1).setScale(m.r! / 32, (m.r! / 32) * 0.62);
      const fill = this.add.image(m.x, m.y, "disc").setTint(m.tint!).setAlpha(0.55).setDepth(-1).setScale(0.05).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: fill, scaleX: m.r! / 32, scaleY: (m.r! / 32) * 0.62, duration: m.ms!, onComplete: () => {
        base.destroy();
        fill.destroy();
        this.ringFx(m.x, m.y, m.r!, m.tint!, 260);
        this.emitters.dust.explode(12, m.x, m.y);
      } });
    } else if (m.kind === "wave") {
      this.ringFx(m.x, m.y, m.r!, m.tint!, 700);
      this.emitters.dust.explode(30, m.x, m.y);
      this.shake(250, 0.006);
    } else {
      this.addBolt(m.x, m.y, m.vx!, m.vy!, m.tint!, null, 0);
    }
  }

  // ---------------------------------------------------------------- pause

  private pause() {
    const d = this.data_;
    d.save();
    this.heroBody.setVelocity(0, 0);
    this.held = { left: false, right: false };
    // In a session the world keeps running for the partner.
    if (!net.active) this.scene.pause();
    showPauseMenu({
      difficulty: d.difficulty, slot: d.slot,
      onResume: () => this.scene.isPaused() && this.scene.resume(),
      onInvite: net.active ? undefined : () => this.startHosting(),
      onQuit: () => {
        net.leave();
        d.save();
        // The shutdown handler clears the UI layer: show the menu after it.
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => window.setTimeout(openMainMenu));
        this.scene.stop();
      },
    });
  }

  // ---------------------------------------------------------------- travel

  private usePortal() {
    const d = this.data_;
    if (this.isGuest) return this.say("Na sessão, só o anfitrião usa o portal.", "#ffe14d");
    sfx.portal();
    if (this.dungeonRef) {
      this.hud.dialog("Portal", null, ["Um redemoinho de luz roxa leva de volta à superfície."],
        [{ label: `Voltar para ${this.zone.name}`, action: () => this.restartAt({ exitAt: this.dungeonRef!.index }) }]);
      return;
    }
    const open = ZONE_ORDER.filter((z) => z !== this.zone.id && d.tier >= ZONES[z].unlockAt);
    const locked = ZONE_ORDER.filter((z) => d.tier < ZONES[z].unlockAt);
    const lines = [open.length ? "O Portal de Pedra pulsa com energia. Para onde você quer ir?"
      : "O Portal de Pedra está adormecido. Avance na história para despertá-lo."];
    if (locked.length) lines[0] += ` (Ainda selado: ${locked.map((z) => ZONES[z].name).join(", ")}.)`;
    this.hud.dialog("Portal de Pedra", null, lines,
      open.map((z) => ({ label: `${ZONES[z].subtitle}: ${ZONES[z].name}`, action: () => this.travel(z) })));
  }

  private travel(zone: ZoneId) {
    this.data_.zone = zone;
    this.restartAt({});
  }

  private askEnterDungeon(index: number) {
    if (this.isGuest) return this.say("Na sessão, só o anfitrião entra nas masmorras.", "#ffe14d");
    const dd = this.zone.dungeons[index];
    const cleared = this.data_.cleared.includes(`${this.zone.id}:${index}`);
    const lvl = this.zone.levelBase + 4 + index * 2 + this.tierBonus;
    this.hud.dialog(dd.name, null,
      [`Uma casa abandonada. Do porão sobe um ar gelado e um cheiro de morte... (inimigos ~nível ${lvl}${cleared ? ", chefe já derrotado" : ""})`],
      [{ label: "Descer na masmorra", action: () => { sfx.portal(); this.restartAt({ dungeon: index }); } }]);
  }

  /** Reloads the scene (new zone, dungeon or exit) keeping the hero in memory. */
  private restartAt(opts: { dungeon?: number; exitAt?: number }) {
    const d = this.data_;
    d.save();
    if (this.isHost) {
      // The partner follows to the same map.
      net.send({ t: "travel", zone: d.zone, dungeon: opts.dungeon ?? null, exitAt: opts.exitAt ?? null,
        seed: this.seedFor(d.zone, opts.dungeon ?? null) });
    }
    this.cameras.main.fadeOut(300, 10, 5, 12);
    this.time.delayedCall(320, () => this.scene.restart({ hero: d, ...opts }));
  }

  /** Damage roll of an enemy hit (before the victim's armor). */
  private rollEnemyDamage(e: Enemy, mult: number) {
    return (e.dmg[0] + Math.random() * (e.dmg[1] - e.dmg[0])) * mult;
  }

  private hurtTarget(t: Target, e: Enemy, mult = 1) {
    if (t.remote) net.send({ t: "hurt", raw: this.rollEnemyDamage(e, mult), level: e.level });
    else this.hurtHero(e, mult);
  }

  private hurtHero(e: Enemy, mult = 1) {
    this.hurtHeroRaw(this.rollEnemyDamage(e, mult), e.level);
  }

  private hurtHeroRaw(raw: number, level: number) {
    const d = this.data_;
    if (this.dead) return;
    if (this.time.now < this.invulnUntil) {
      this.floatAt(this.hero.x, this.hero.y - 30, "Esquivou", "heal");
      return;
    }
    let dmg = Math.max(1, Math.round(raw * (1 - armorReduction(d.stats.armor, level))));
    if (d.absorb > 0) {
      const a = Math.min(d.absorb, dmg);
      d.absorb -= a;
      dmg -= a;
      this.emitters.frost.explode(6, this.hero.x, this.hero.y - 14);
      if (!dmg) {
        this.floatAt(this.hero.x, this.hero.y - 30, "Absorvido", "");
        return;
      }
    }
    d.hp -= dmg;
    this.floatAt(this.hero.x, this.hero.y - 30, String(dmg), "hurt");
    sfx.hurt();
    this.emitters.blood.explode(8, this.hero.x, this.hero.y - 12);
    if (Math.random() < 0.5) this.splat(this.hero.x, this.hero.y, 1);
    this.hero.setTintFill(0xff4040);
    this.time.delayedCall(80, () => this.hero.clearTint());
    if (d.cls === "barbarian") d.mana = Math.min(d.stats.maxMana, d.mana + 2);
    if (d.hp <= 0) this.heroDies();
    else if (!this.busy && !this.leaping && Math.random() < 0.25) {
      this.busy = true;
      const token = ++this.castToken;
      const end = () => token === this.castToken && (this.busy = false);
      this.hero.play2("hit", { restart: true, onComplete: end });
      this.time.delayedCall(400, end);
    }
  }

  private heroDies() {
    const d = this.data_;
    d.hp = 0;
    this.dead = true;
    this.busy = false;
    this.order = null;
    this.path = [];
    this.heroBody.setVelocity(0, 0);
    this.hero.play2("death", { restart: true });
    this.hud.closeAll();
    this.hud.closeDialog();
    this.hud.showDeath(() => {
      d.gold = Math.floor(d.gold * (1 - DIFFICULTIES[d.difficulty].goldLoss));
      d.hp = d.stats.maxHp;
      d.mana = d.cls === "barbarian" ? 0 : d.stats.maxMana;
      if (this.dungeonRef && !this.isGuest) {
        // Dying in a dungeon sends you back to the zone's portal.
        d.save();
        this.scene.restart({ hero: d });
        return;
      }
      this.hero.setPosition(this.map.spawn.x * TILE + 8, this.map.spawn.y * TILE + 8);
      this.dead = false;
      this.hero.play2("idle", { restart: true });
      d.save();
    });
  }

  // ---------------------------------------------------------------- shop

  private rerollCost() {
    return 40 + this.data_.level * 15;
  }

  /** Marta's stock: gear around the hero's level, rarer pieces at a premium. */
  private restockShop(force: boolean) {
    const d = this.data_;
    if (!force && d.shop.length) return;
    const rarities: Rarity[] = ["magic", "magic", "magic", "magic", "rare", "rare", "rare", "rare", "epic", "epic", "rare", "legendary"];
    d.shop = rarities.map((r) => (r === "legendary" && Math.random() < 0.6 ? generateItem(d.level, d.def, "epic") : generateItem(d.level + this.tier, d.def, r)));
    this.hud.refreshShop(d.shop, this.rerollCost());
  }

  private buyItem(i: number) {
    const d = this.data_;
    const it = d.shop[i];
    if (!it) return;
    const price = itemValue(it);
    if (d.gold < price) return this.say("Ouro insuficiente.");
    if (!d.addItem(it)) return this.say("Mochila cheia!");
    d.gold -= price;
    d.shop[i] = null;
    sfx.buy();
    this.hud.message(`Comprou: ${it.name}`, RARITY_COLOR[it.rarity]);
    this.hud.refreshShop(d.shop, this.rerollCost());
    this.afterItemsChanged();
  }

  // ---------------------------------------------------------------- quests & NPCs

  private questKill(e: Enemy) {
    const d = this.data_;
    const q = d.currentQuest;
    if (!q || d.quest.status !== "active") return;
    const o = q.objective;
    if ((o.type === "kill" && o.faction === e.def.faction) || (o.type === "unique" && e.unique === o.id)) this.questProgress();
  }

  private questProgress() {
    const d = this.data_;
    const q = d.currentQuest!;
    d.quest.progress++;
    if (d.quest.progress >= q.objective.count) {
      d.quest.status = "ready";
      this.hud.banner("Missão cumprida!", `Volte e fale com ${NPCS[q.giver].name}.`);
      d.save();
    } else if (q.objective.type !== "unique") {
      this.hud.message(`${q.goal}: ${d.quest.progress}/${q.objective.count}`, "#ffe14d");
    }
  }

  private npcPortrait(n: Npc) {
    return hasSprite(n.spr.spriteName) ? portrait(this, n.spr.spriteName, 2) : null;
  }

  private talk(n: Npc) {
    const d = this.data_;
    const npc = NPCS[n.id];
    n.spr.face(this.hero.x - n.spr.x, this.hero.y - n.spr.y);
    if (n.spr.has("talk")) n.spr.play2("talk");
    const done = () => n.spr.play2("idle");
    const q = d.currentQuest;
    const pic = this.npcPortrait(n);
    const shop = n.id === "smith" ? [{ label: "Ver mercadorias", action: () => { done(); this.hud.openShop(d.shop, this.rerollCost()); } }] : [];
    if (q && q.giver === n.id) {
      if (d.quest.status === "available") {
        this.hud.dialog(npc.name, pic, q.intro, [{ label: `Aceitar: ${q.title}`, action: () => { this.acceptQuest(); done(); } }, ...shop], done);
      } else if (d.quest.status === "active") {
        this.hud.dialog(npc.name, pic, [`${q.goal}: ${d.quest.progress}/${q.objective.count}. ${npc.idle[0]}`], shop, done);
      } else {
        this.hud.dialog(npc.name, pic, q.done, [{ label: "Receber recompensa", action: () => { this.completeQuest(); done(); } }], done);
      }
      return;
    }
    if (shop.length) {
      this.hud.dialog(npc.name, pic, ["Precisa de aço novo? Tenho o melhor da região. Também compro o que você achar por aí."], shop, done);
      return;
    }
    if (!q && n.id === "elder") {
      this.hud.dialog(npc.name, pic, EPILOGUE, [], done);
      return;
    }
    const hint = q ? ` (${NPCS[q.giver].name} precisa de você.)` : "";
    this.hud.dialog(npc.name, pic, [npc.idle[Math.floor(Math.random() * npc.idle.length)] + hint], [], done);
  }

  private acceptQuest() {
    const d = this.data_;
    const q = d.currentQuest!;
    d.quest.status = "active";
    d.quest.progress = 0;
    this.hud.message(`Nova missão: ${q.title}`, "#ffe14d");
    if (q.objective.type === "unique" && d.quest.killed.includes(q.objective.id)) this.questProgress();
    d.save();
  }

  private completeQuest() {
    const d = this.data_;
    const q = d.currentQuest!;
    const r = q.reward;
    d.gold += r.gold;
    d.potions.hp = Math.min(MAX_POTIONS, d.potions.hp + r.potions);
    for (const it of r.items) {
      const item = generateItem(d.level + this.tier, d.def, it.rarity, it.slot);
      if (d.addItem(item)) this.hud.message(`Recompensa: ${item.name}`, RARITY_COLOR[item.rarity]);
      else this.spawnLoot({ kind: "item", amount: 1, item }, this.hero.x, this.hero.y);
    }
    this.hud.message(`+${r.xp} XP · +${r.gold} ouro · +${r.potions} poções`, "#ffe14d");
    sfx.quest();
    this.restockShop(true);
    this.emitters.gold.explode(40, this.hero.x, this.hero.y - 14);
    d.quest = { ...d.quest, index: d.quest.index + 1, status: "available", progress: 0 };
    this.giveXp(r.xp);
    this.afterItemsChanged();
    for (const z of ZONE_ORDER) if (ZONES[z].unlockAt === d.tier) this.hud.banner(`${ZONES[z].name} desbloqueado!`, "Use o Portal de Pedra na praça da vila.");
    if (d.currentQuest) {
      this.worldTierUp();
      this.hud.message(`Próximo: fale com ${NPCS[d.currentQuest.giver].name}.`, "#ffe14d");
    } else {
      this.worldTierUp();
      this.time.delayedCall(600, () => this.hud.dialog("Epílogo", null, EPILOGUE));
    }
  }

  private mapMarkers(): MapMarker[] {
    const d = this.data_;
    const out: MapMarker[] = [];
    const h = this.hero;
    for (const e of this.enemies) {
      if (e.state === "dead") continue;
      if (e.unique) continue;
      if (Phaser.Math.Distance.Between(h.x, h.y, e.spr.x, e.spr.y) > 420) continue;
      out.push({ x: e.spr.x, y: e.spr.y, color: e.rank === "champion" ? "#6f8cff" : e.def.faction === "bandit" ? "#ff8a3a" : "#ff3a3a", size: e.type === "brute" ? 4 : 3 });
    }
    for (const l of this.loot) if (l.kind === "item" && l.item!.rarity !== "normal") out.push({ x: l.img.x, y: l.img.y, color: RARITY_COLOR[l.item!.rarity], size: 2 });
    const q = d.currentQuest;
    if (q && d.quest.status === "active" && q.objective.type === "chests")
      for (const c of this.chests) if (!c.opened) out.push({ x: c.spr.x, y: c.spr.y, color: "#ffe14d", size: 4 });
    if (q && d.quest.status === "active" && q.objective.type === "unique") {
      const boss = this.enemies.find((e) => e.unique === (q.objective as { id: string }).id && e.state !== "dead");
      if (boss) out.push({ x: boss.spr.x, y: boss.spr.y, color: "#ff3a1a", size: 5, ring: true });
    }
    if (this.remote) out.push({ x: this.remote.spr.x, y: this.remote.spr.y, color: "#9fe8ff", size: 5 });
    for (const n of this.npcs) {
      const mark = this.npcMark(n);
      out.push({ x: n.spr.x, y: n.spr.y, color: mark === "?" ? "#7bea6a" : "#ffe14d", size: 4, glyph: mark || undefined });
    }
    return out;
  }

  private npcMark(n: Npc): "" | "!" | "?" {
    const d = this.data_;
    const q = d.currentQuest;
    if (!q || q.giver !== n.id) return "";
    return d.quest.status === "available" ? "!" : d.quest.status === "ready" ? "?" : "";
  }

  // ---------------------------------------------------------------- projectiles

  private updateProjectiles(dt: number) {
    // Sub-steps of at most ~6 px so fast shots (or a slow frame) never skip over a target.
    for (const p of this.projectiles) {
      const n = Math.max(1, Math.ceil((Math.hypot(p.vx, p.vy) * dt) / 6));
      for (let i = 0; i < n && p.left > 0; i++) this.projectileStep(p, dt / n);
    }
    this.projectiles = this.projectiles.filter((p) => p.left > 0);
  }

  private projectileStep(p: Projectile, dt: number) {
    const step = Math.hypot(p.vx, p.vy) * dt;
    p.img.x += p.vx * dt;
    p.img.y += p.vy * dt;
    p.left -= step;
    let done = p.left <= 0;
    for (const e of this.enemies) {
      if (done || p.ghost) break;
      if (e.state === "dead" || !e.active || p.hit.has(e)) continue;
      const dd = Phaser.Math.Distance.Between(p.img.x, p.img.y, e.spr.x, e.spr.y - 10 * e.spr.scaleY);
      if (dd < 10 * e.spr.scaleX * (e.type === "brute" ? 1.3 : 1)) {
        p.hit.add(e);
        this.heroHits(e, p.skill, p.mult, false, Math.atan2(p.vy, p.vx));
        if (p.skill.projectile?.tex === "fx_shadow") this.emitters.shadow.explode(8, p.img.x, p.img.y);
        if (p.pierce-- <= 0) done = true;
      }
    }
    // Solid tiles (tree trunks, houses) stop projectiles once they have left the hero's side.
    const tx = Math.floor(p.img.x / TILE), ty = Math.floor((p.img.y + 12) / TILE);
    if (!done && p.skill.range - p.left > 16 && !this.grid.free(tx, ty) && !this.isFenceOrBorder(tx, ty)) done = true;
    if (done) {
      const ex = p.skill.projectile?.explode;
      if (ex) {
        this.emitters.fire.explode(ex > 30 ? 30 : 16, p.img.x, p.img.y);
        this.ringFx(p.img.x, p.img.y + 8, ex, 0xfe6607, 220);
        if (ex > 30) this.shake(100, 0.004);
        if (!p.ghost) for (const e of this.enemiesIn(p.img.x, p.img.y + 10, ex)) if (!p.hit.has(e)) this.heroHits(e, p.skill, p.mult * (ex > 30 ? 0.8 : 0.5));
      }
      p.img.destroy();
      p.left = -1;
    }
  }

  /** Projectiles fly over the village fence. */
  private isFenceOrBorder(x: number, y: number) {
    const t = this.map.town;
    return (y === t.y0 || y === t.y1 + 1 || x === t.x0 || x === t.x1) && x >= t.x0 && x <= t.x1 && y >= t.y0 && y <= t.y1 + 1;
  }

  // ---------------------------------------------------------------- loot

  private dropLoot(e: Enemy) {
    const d = this.data_;
    const x = e.spr.x, y = e.spr.y;
    const lvl = e.level;
    const rich = e.def.faction === "bandit" ? 1.6 : 1;
    if (Math.random() < (e.rank === "normal" ? 0.5 : 1) * (e.type === "brute" ? 2 : 1)) {
      const amt = Math.round(lvl * (2 + Math.random() * 5) * rich * (e.rank === "boss" ? 12 : e.rank === "champion" ? 3 : e.type === "brute" ? 2 : 1));
      this.spawnLoot({ kind: "gold", amount: amt }, x, y);
    }
    if (Math.random() < (e.rank === "normal" ? 0.12 : 0.6)) this.spawnLoot({ kind: Math.random() < 0.65 ? "potion_hp" : "potion_mp", amount: 1 }, x, y);
    let items = e.rank === "boss" ? 4 : e.rank === "champion" ? 1 + (Math.random() < 0.5 ? 1 : 0) : Math.random() < 0.13 ? 1 : 0;
    if (e.type === "brute" && e.rank === "normal" && Math.random() < 0.35) items++;
    for (let i = 0; i < items; i++) {
      let r: Rarity = rollRarity((e.rank === "boss" ? 3 : e.rank === "champion" || e.type === "brute" ? 1.8 : 1) * this.magicFind);
      if (e.rank === "boss" && i === 0) r = Math.random() < 0.5 ? "unique" : "rare";
      this.spawnLoot({ kind: "item", amount: 1, item: generateItem(lvl, d.def, r) }, x, y);
    }
  }

  private openChest(c: Chest) {
    c.opened = true;
    c.spr.setFrame(1);
    this.emitters.gold.explode(14, c.spr.x, c.spr.y - 8);
    const d = this.data_;
    const lvl = c.level + this.tierBonus;
    this.spawnLoot({ kind: "gold", amount: Math.round(lvl * (6 + Math.random() * 10)) }, c.spr.x, c.spr.y + 4);
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) this.spawnLoot({ kind: "item", amount: 1, item: generateItem(lvl, d.def, rollRarity((1.6) * this.magicFind)) }, c.spr.x, c.spr.y + 4);
    if (Math.random() < 0.6) this.spawnLoot({ kind: "potion_hp", amount: 1 }, c.spr.x, c.spr.y + 4);
    const q = d.currentQuest;
    if (q && d.quest.status === "active" && q.objective.type === "chests") this.questProgress();
  }

  private spawnLoot(l: { kind: Loot["kind"]; amount: number; item?: Item }, x: number, y: number) {
    const icon = l.kind === "item" ? l.item!.icon : l.kind;
    const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 16;
    const tx = x + Math.cos(a) * r, ty = y + Math.sin(a) * r * 0.6;
    const img = this.add.image(x, y - 6, `icon_${icon}`).setDepth(ty - 4);
    const loot: Loot = { ...l, img, ready: false };
    this.tweens.add({ targets: img, x: tx, duration: 380 });
    this.tweens.add({
      targets: img, y: { from: y - 6, to: ty }, duration: 380, ease: (t: number) => t + Math.sin(t * Math.PI) * -1.3,
      onComplete: () => {
        loot.ready = true;
        if (l.kind === "item") {
          const lab = document.createElement("div");
          lab.className = "label interactive";
          lab.textContent = l.item!.name;
          lab.style.color = RARITY_COLOR[l.item!.rarity];
          lab.onmousedown = (ev) => {
            ev.stopPropagation();
            if (!this.dead) this.order = { type: "pickup", loot };
          };
          lab.oncontextmenu = (ev) => ev.preventDefault();
          this.hud.world.appendChild(lab);
          loot.label = lab;
          const rar = l.item!.rarity;
          if (rar !== "normal" && rar !== "magic") {
            this.emitters.gold.explode(12, tx, ty);
            this.hud.message(`${l.item!.name} caiu no chão!`, RARITY_COLOR[rar]);
            sfx.drop(rar);
          }
          if (BEAM_RARITIES.includes(rar)) {
            const col = Phaser.Display.Color.HexStringToColor(RARITY_COLOR[rar]).color;
            loot.beam = this.add.image(tx, ty + 2, "beam").setOrigin(0.5, 1).setTint(col).setBlendMode(Phaser.BlendModes.ADD)
              .setDepth(ty - 5).setScale(1.2, 0);
            this.tweens.add({ targets: loot.beam, scaleY: rar === "normal" ? 0.6 : 1.1, duration: 300, ease: "Back.easeOut" });
            this.tweens.add({ targets: loot.beam, alpha: { from: 0.55, to: 0.95 }, duration: 600, yoyo: true, repeat: -1 });
            this.cameras.main.flash(120, 255, 220, 160);
          }
        }
      },
    });
    this.loot.push(loot);
  }

  private updateLoot() {
    if (this.dead) return;
    const d = this.data_;
    for (const l of [...this.loot]) {
      if (!l.ready || l.kind === "item") continue;
      if (Phaser.Math.Distance.Between(this.hero.x, this.hero.y, l.img.x, l.img.y) > 14) continue;
      if (l.kind !== "gold" && d.potions[l.kind === "potion_hp" ? "hp" : "mp"] >= MAX_POTIONS) continue;
      this.pickup(l);
    }
  }

  private pickup(l: Loot) {
    const d = this.data_;
    if (l.kind === "gold") {
      d.gold += l.amount;
      sfx.coin();
      this.floatAt(l.img.x, l.img.y - 6, `+${l.amount} ouro`, "");
    } else if (l.kind === "item") {
      if (!d.addItem(l.item!)) {
        this.hud.message("Mochila cheia!", "#ff6a5a");
        return;
      }
      this.hud.message(`Pegou: ${l.item!.name}`, RARITY_COLOR[l.item!.rarity]);
      this.afterItemsChanged();
    } else {
      const k = l.kind === "potion_hp" ? "hp" : "mp";
      if (d.potions[k] >= MAX_POTIONS) {
        this.hud.message("Cinto de poções cheio.", "#ff6a5a");
        return;
      }
      d.potions[k]++;
    }
    l.img.destroy();
    l.label?.remove();
    l.beam?.destroy();
    this.loot = this.loot.filter((x) => x !== l);
  }

  private afterItemsChanged() {
    this.hud.markInventoryDirty();
    this.data_.save();
  }

  private drinkPotion(k: "hp" | "mp") {
    const d = this.data_;
    if (this.dead || d.potions[k] <= 0) return;
    if (k === "hp" && d.hp >= d.stats.maxHp) return;
    if (k === "mp" && d.mana >= d.stats.maxMana) return;
    d.potions[k]--;
    if (k === "hp") {
      const amt = Math.round(d.stats.maxHp * 0.45);
      d.hp = Math.min(d.stats.maxHp, d.hp + amt);
      this.floatAt(this.hero.x, this.hero.y - 30, `+${amt}`, "heal");
      this.emitters.red.explode(10, this.hero.x, this.hero.y - 12);
    } else {
      d.mana = Math.min(d.stats.maxMana, d.mana + d.stats.maxMana * 0.6);
      this.emitters.frost.explode(10, this.hero.x, this.hero.y - 12);
    }
  }

  // ---------------------------------------------------------------- gore & visuals

  /** Blood splats on the ground around (x, y). */
  private splat(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) {
      const img = this.add.image(x + (Math.random() - 0.5) * 18, y + (Math.random() - 0.5) * 8, `blood_${Math.floor(Math.random() * 5)}`)
        .setDepth(-4).setFlip(Math.random() < 0.5, Math.random() < 0.5).setAlpha(0.95);
      this.addDecal(img);
    }
  }

  private addDecal(img: Phaser.GameObjects.Image) {
    this.decals.push(img);
    if (this.decals.length > 320) this.decals.shift()!.destroy();
    this.time.delayedCall(45000, () => {
      if (!img.active) return;
      this.tweens.add({ targets: img, alpha: 0, duration: 4000, onComplete: () => {
        img.destroy();
        this.decals = this.decals.filter((d) => d !== img);
      } });
    });
  }

  /** Chunks of flesh flying out and landing with a splat. */
  private gibs(x: number, y: number, n: number, tint?: number) {
    this.emitters.blood.explode(30, x, y);
    this.shake(90, 0.003);
    for (let i = 0; i < n; i++) {
      const g = this.add.image(x, y, `gib_${i % 3}`).setDepth(y + 20);
      if (tint) g.setTint(tint);
      const a = Math.random() * Math.PI * 2, r = 12 + Math.random() * 26;
      const tx = x + Math.cos(a) * r, ty = y + 10 + Math.sin(a) * r * 0.5;
      this.tweens.add({ targets: g, x: tx, angle: (Math.random() - 0.5) * 720, duration: 450 + Math.random() * 200 });
      this.tweens.add({
        targets: g, y: { from: y, to: ty }, duration: 450 + Math.random() * 200,
        ease: (t: number) => t + Math.sin(t * Math.PI) * -1.6,
        onComplete: () => {
          g.setDepth(-2);
          this.splat(tx, ty, 1);
          this.addDecal(g);
        },
      });
    }
  }

  private updateAura(time: number) {
    const b = this.data_.buffs[0];
    if (!b && this.data_.absorb <= 0) {
      this.aura.setAlpha(0);
      return;
    }
    this.aura.setPosition(this.hero.x, this.hero.y - 2).setDepth(this.hero.y - 1)
      .setTint(this.data_.absorb > 0 ? 0x7a9bff : b!.tint).setAlpha(0.45 + 0.25 * Math.sin(time / 120));
  }

  private updateTrees() {
    const h = this.hero;
    for (const t of this.trees) {
      if (Math.abs(t.x - h.x) > 20 || h.y > t.y || h.y < t.y - 46) {
        if (t.alpha !== 1) t.setAlpha(1);
      } else t.setAlpha(0.5);
    }
  }

  private drawBars() {
    const g = this.bars;
    g.clear();
    for (const e of this.enemies) {
      if (e.state === "dead" || !e.active || e.hp >= e.maxHp) continue;
      const w = e.rank === "boss" ? 24 : e.type === "brute" ? 18 : 14;
      const top = e.type === "brute" ? 40 : 26;
      const x = Math.round(e.spr.x - w / 2), y = Math.round(e.spr.y - top * e.spr.scaleY);
      g.fillStyle(0x1c0f1a).fillRect(x - 1, y - 1, w + 2, 4);
      g.fillStyle(e.rank === "boss" ? 0xe1a227 : e.rank === "champion" ? 0x6f8cff : 0xc13a2b)
        .fillRect(x, y, Math.max(1, Math.round((w * e.hp) / e.maxHp)), 2);
    }
  }

  private floatAt(wx: number, wy: number, text: string, cls: string) {
    const cam = this.cameras.main;
    const v = cam.worldView;
    this.hud.float((wx - v.x) * cam.zoom, (wy - v.y) * cam.zoom, text, cls);
  }

  /** Positions DOM labels (ground items, NPC names) after the camera has moved. */
  private updateOverlay() {
    const cam = this.cameras.main;
    const v = cam.worldView;
    if (this.darkEl) {
      const hx = (this.hero.x - v.x) * cam.zoom, hy = (this.hero.y - 14 - v.y) * cam.zoom;
      const r = 120 * cam.zoom;
      this.darkEl.style.background = `radial-gradient(circle at ${hx}px ${hy}px, transparent ${r * 0.45}px, rgba(6,3,8,0.55) ${r}px, rgba(6,3,8,0.94) ${r * 1.7}px)`;
    }
    const place = (el: HTMLElement, wx: number, wy: number) => {
      const sx = (wx - v.x) * cam.zoom, sy = (wy - v.y) * cam.zoom;
      const on = sx > -100 && sy > -40 && sx < window.innerWidth + 100 && sy < window.innerHeight + 40;
      el.style.display = on ? "block" : "none";
      if (on) el.style.transform = `translate(${Math.round(sx)}px, ${Math.round(sy)}px) translate(-50%, -100%)`;
    };
    for (const l of this.loot) if (l.label) place(l.label, l.img.x, l.img.y - 7);
    if (this.remote) {
      const r = this.remote;
      place(r.tag, r.spr.x, r.spr.y - 34);
      const bar = r.tag.querySelector(".pb div") as HTMLElement | null;
      if (bar) bar.style.width = `${Math.max(0, r.st.hp / r.st.maxHp) * 100}%`;
    }
    for (const n of this.npcs) {
      const mark = this.npcMark(n);
      const html = `${mark ? `<div class="mark${mark === "?" ? " ready" : ""}">${mark}</div>` : ""}<div class="nname">${NPCS[n.id].name}</div>`;
      if (n.tag.dataset.html !== html) {
        n.tag.innerHTML = html;
        n.tag.dataset.html = html;
      }
      place(n.tag, n.spr.x, n.spr.y - 30);
    }
  }
}

