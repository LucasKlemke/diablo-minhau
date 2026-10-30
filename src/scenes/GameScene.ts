import Phaser from "phaser";
import { rankMult, skillAt, type ActiveSlot, type DeathKind, type SkillDef } from "../data/classes";
import { ENEMIES, UNIQUES, type EnemyDef, type EnemyRank, type EnemyType, type MobAbility, type UniqueDef, type UniqueId } from "../data/enemies";
import { BEAM_RARITIES, capRarity, COMPARE_MARK, compareItem, generateItem, itemValue, rollRarity, RARITY_COLOR, SLOTS, type Item, type Rarity } from "../data/items";
import { AWAKEN_HINT, EPILOGUE, NPCS, npcsOf, QUEST_ITEMS, QUESTS, type NpcId, type Objective, type QuestItemId } from "../data/quests";
import { AREAS, canEnter, OPPOSITE, routeTo, ZONES, ZONE_ORDER, type AreaDef, type AreaId, type CampKind, type Side, type ZoneDef } from "../data/zones";
import { cine, setAmbience, setMusic, sfx, type Track } from "../game/audio";
import { DIFFICULTIES } from "../data/difficulty";
import { settings } from "../game/settings";
import { openMainMenu, showPauseMenu } from "../ui/menu";
import { net, type EnemyRow, type Msg, type PlayerState } from "../net/net";
import { CLASSES } from "../data/classes";
import { generateDungeon } from "../world/dungeon";
import { buildAuthoredMap } from "../world/authored";
import { LAYOUTS } from "../world/layouts/act1";
import { armorReduction } from "../data/stats";
import { HeroData, MAX_POTIONS } from "../game/hero";
import { playDeath } from "../game/deaths";
import { Minimap, type MapMarker } from "../game/minimap";
import { PropHover } from "../game/propHover";
import { drawIcon, type IconId } from "../ui/icons";
import { hasSprite, kilnImage, kilnMeta, KilnSprite, portrait, type Dir, type SpriteName } from "../kiln";
import { Hud } from "../ui/hud";
import { CinematicUi } from "../ui/cinematic";
import { Director } from "../game/cutscene";
import { blobTile } from "../world/autotile";
import { generateMap, MAP_H, MAP_W, rng, TILE, type Pack, type Prop, type WorldMap } from "../world/mapgen";
import { Grid } from "../world/pathfind";
import { L } from "../i18n";

/** NPC profession icons for the name tags (pixel icons as data URLs, drawn once). */
const npcIconUrls: Partial<Record<IconId, string>> = {};
const npcIcon = (id: IconId) => (npcIconUrls[id] ??= drawIcon(id).toDataURL());

interface Enemy {
  /** Village raid goblin: keeps chasing inside the village (normally a safe zone). */
  raider?: boolean;
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
  /** Boss abilities, or the type's own (boar charge, kobold traps). */
  abilities?: MobAbility[];
  abilityAt?: number[]; // next time each ability is ready
  /** Lying in ambush (see EnemyTraits.ambush). */
  dormant?: boolean;
  /** Running away (the pack lost its alpha). */
  fleeUntil?: number;
  /** Faster for a while (the alpha's howl). */
  hasteUntil?: number;
  howled?: boolean;
  /** Fully visible until then (stealthy monsters show themselves when they attack or get hit). */
  revealUntil?: number;
  /** Last fire damage taken: regeneration waits a few seconds after it. */
  burnedAt?: number;
  /** Mimic: the chest level it pretended to be (drops that chest's loot). */
  chestLevel?: number;
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

/** On-hit effects of a monster: poison [damage per second, ms], stun ms, slow [speed mult, ms]. */
interface HitEffects { poison?: [number, number]; stun?: number; slow?: [number, number] }

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

/** Story bosses who are beaten, not killed: Lula is handed a broom, the three mutts are purified. */
const SPARED: Partial<Record<UniqueId, "lula" | "dog">> = { polvo: "lula", caramelo: "dog", trovao: "dog", mancha: "dog" };

/** Where the current quest leads, for the edge arrows and the tracker's distances. */
interface ObjPoint { x: number; y: number; label: string; dist: number }

interface Chest {
  spr: Phaser.GameObjects.Sprite;
  level: number;
  opened: boolean;
  /** Boss-room chests are never mimics. */
  safe?: boolean;
}

/** Kobold snare: hurts and slows the first player who steps on it. */
interface Trap { img: Phaser.GameObjects.Image; until: number; src: Enemy; mult: number; armedAt: number }

/** Damage kinds that count as magic (they go through physical resistance). */
const MAGIC_KINDS = new Set<DeathKind>(["freeze", "burn", "shock", "soul", "melt"]);
const MIMIC_CHANCE = 0.12;

/** A quest object lying in the world (oak beam, tool chest, cauldron). */
interface QuestObj {
  item: QuestItemId; spr: Phaser.GameObjects.Image | KilnSprite; tx: number; ty: number; glow: Phaser.GameObjects.Image; key: string;
  /** Bobbing "!" above it, like a quest giver's. */
  marker?: Phaser.GameObjects.GameObject & { setVisible(v: boolean): unknown; destroy(): void };
}
/** A village animal or figure that only says a line when clicked (Kira, the mutts, Lula sweeping). */
interface Decor {
  spr: KilnSprite;
  lines: string[];
  label: string;
  /** Name tag above the head, like the NPCs'. */
  tag?: HTMLDivElement;
  /** Strolls within `r` tiles of home (inside the village), resting between walks with one of `rests`. */
  wander?: { home: { x: number; y: number }; r: number; speed: number; rests: string[]; at: number; walking: boolean;
    /** Walk clip (Lula pushes his broom); `dust` raises little puffs at his feet as he sweeps. */
    walk: string; dust?: boolean; dustAt: number };
}

interface Npc {
  id: NpcId;
  spr: KilnSprite;
  tag: HTMLDivElement;
  /** Floating "!"/"?" sprite above the head (SpriteKiln npc_marker); the HTML tag shows it as text otherwise. */
  marker?: KilnSprite;
  /** Where the NPC stands; during the village raid it hides inside a house. */
  home: { x: number; y: number };
  hidden?: boolean;
}

type Order =
  | { type: "move"; x: number; y: number }
  | { type: "attack"; enemy: Enemy }
  | { type: "pickup"; loot: Loot }
  | { type: "chest"; chest: Chest }
  | { type: "quest"; obj: QuestObj }
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
  /** The act of the current area (look, story lock). */
  private zone!: ZoneDef;
  private area!: AreaDef;
  /** Side of the map the hero walked in from (spawns at that exit). */
  private arriveFrom?: Side;
  /** Leaving through an exit (the scene is about to restart). */
  private leaving = false;
  private exitTags: { el: HTMLDivElement; x: number; y: number }[] = [];
  private exitHintAt = 0;
  /** Return portal conjured with B: walking into it goes back to the last checkpoint. */
  private townPortal: { spr: Phaser.GameObjects.Image | KilnSprite; until: number; back?: boolean; armed?: boolean } | null = null;
  private dungeonRef: { index: number } | null = null;
  private exitAt: number | null = null;
  private portalSpr?: Phaser.GameObjects.Image | KilnSprite;
  private portalSwirl?: Phaser.GameObjects.Image;
  private darkEl?: HTMLDivElement;
  private slowmoUntil = 0;
  private hitSfxAt = 0;
  /** Mouse buttons pressed on the game canvas (clicks on the HTML UI never count). */
  private held = { left: false, right: false };
  private enemyBolts: EnemyBolt[] = [];
  private traps: Trap[] = [];
  private growlAt = 0;
  /** Status effects on the local hero (from monster hits). */
  private heroPoison: { until: number; dps: number; next: number } | null = null;
  private heroStunUntil = 0;
  private heroSlow = { until: 0, mult: 1 };
  private mapSeed = 0;
  private netSeed?: number;
  private netArea?: AreaId;
  private spawnAt?: { x: number; y: number };
  private remote: RemotePlayer | null = null;
  private byId = new Map<number, Enemy>();
  private enemySeq = 0;
  private netAt = 0;
  private snapAt = 0;
  private sessionEl?: HTMLDivElement;
  private tipLoot: Loot | null = null;
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
  private stepT = 0;
  private lastPos = new Phaser.Math.Vector2();
  private cooldowns: Record<string, number> = {};
  private hovered: Enemy | null = null;
  private hoveredNpc: Npc | null = null;
  private hoverGlow?: Phaser.FX.Glow;
  private hoverGlowTween?: Phaser.Tweens.Tween;
  private hoverRing?: Phaser.GameObjects.Image;
  private propHover!: PropHover;
  /** Awakening after the prologue in progress (controls locked). */
  private cinematic = false;
  private questObjs: QuestObj[] = [];
  private objArrow?: Phaser.GameObjects.Graphics;
  private objPts: ObjPoint[] = [];
  private cineQueue: Promise<void> = Promise.resolve();
  /** Lady Kira in her clearing while the hero comes to her rescue. */
  private kiraSpr?: KilnSprite;
  /** Picking up a quest object: the hero works on it for a moment (progress bar); moving or getting hit stops it. */
  private gather: { obj: QuestObj; start: number; ms: number; el: HTMLDivElement; beat: Phaser.Time.TimerEvent } | null = null;
  private decor: Decor[] = [];
  /** Smoke timers and flowers of the village's current state (rebuilt when a story flag changes). */
  private villageFx: (Phaser.Time.TimerEvent | Phaser.GameObjects.GameObject)[] = [];
  /** Act I barricades on the village exits, and the raid in progress. */
  private gateObjs: Phaser.GameObjects.Image[] = [];
  /** The village's animated gates (north, west, east), when the SpriteKiln export exists. */
  private villageGates: KilnSprite[] = [];
  private gateHintAt = 0;
  /** Lula's barricade across the arena's gap (null once broken). */
  private arenaGate: KilnSprite | Phaser.GameObjects.Image[] | null = null;
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

  init(data: { hero: HeroData; dungeon?: number; exitAt?: number; netSeed?: number; netZone?: string; spawnAt?: { x: number; y: number };
    cinematic?: boolean; from?: Side }) {
    this.data_ = data.hero;
    this.cinematic = !!data.cinematic;
    this.netSeed = data.netSeed;
    this.netArea = data.netZone as AreaId | undefined;
    this.arriveFrom = data.from;
    this.leaving = false;
    this.exitTags = [];
    this.townPortal = null;
    this.portalSpr = this.portalSwirl = undefined;
    this.spawnAt = data.spawnAt;
    this.remote = null;
    this.byId = new Map();
    this.enemySeq = 0;
    this.dungeonRef = data.dungeon !== undefined ? { index: data.dungeon } : null;
    this.exitAt = data.exitAt ?? null;
    this.darkEl = undefined;
    Object.assign(this, {
      questObjs: [], objArrow: undefined, objPts: [], cineQueue: Promise.resolve(), kiraSpr: undefined, gather: null, decor: [], villageFx: [], enemies: [], loot: [], hovered: null, hoverGlow: undefined, hoverRing: undefined, gateObjs: [], villageGates: [], arenaGate: null, projectiles: [], zones: [], chests: [], npcs: [], trees: [], decals: [], cooldowns: {}, enemyBolts: [], traps: [],
      heroPoison: null, heroStunUntil: 0, heroSlow: { until: 0, mult: 1 },
      busy: false, dead: false, leaping: false, order: null, path: [], dashUntil: 0, invulnUntil: 0, dashCd: 0,
    });
  }

  private get magicFind() {
    return DIFFICULTIES[this.data_.difficulty].magicFind * (1 + this.data_.stats.magicFind);
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
    // A guest follows the host's area even if it has not unlocked it yet.
    if (this.netArea && AREAS[this.netArea]) d0.area = this.netArea;
    else if (!AREAS[d0.area] || !canEnter(d0.area, d0.tier)) d0.area = "minhau";
    this.area = AREAS[d0.area];
    this.zone = ZONES[this.area.act];
    const firstVisit = !d0.visited.includes(this.area.id);
    if (firstVisit) d0.visited.push(this.area.id);
    this.mapSeed = this.netSeed ?? this.seedFor(this.area.id, this.dungeonRef?.index ?? null);
    if (this.dungeonRef) {
      const dd = this.area.dungeons[this.dungeonRef.index];
      const key = `${this.area.id}:${this.dungeonRef.index}`;
      const level = this.area.level + 3;
      this.map = generateDungeon(this.mapSeed, level, dd.enemies, d0.cleared.includes(key) ? null : dd.boss, dd.theme);
    } else {
      const layout = LAYOUTS[this.area.id];
      this.map = layout ? buildAuthoredMap(this.area.id, layout) : generateMap(this.mapSeed, this.area.id);
    }
    this.grid = new Grid(MAP_W, MAP_H, this.map.blocked);
    this.buildWorld();
    this.buildGates(this.gatesLocked);
    this.buildArenaGate();

    let sp = this.map.spawn;
    if (this.spawnAt) {
      const f = this.grid.nearestFree(Math.floor(this.spawnAt.x / TILE), Math.floor(this.spawnAt.y / TILE), 4);
      if (f) sp = { x: f[0], y: f[1] };
    }
    // Walked in from a neighbouring area: start a few steps inside that road.
    const entry = this.arriveFrom && !this.dungeonRef ? this.map.exits.find((x) => x.side === this.arriveFrom) : undefined;
    if (entry) {
      const inward = { n: [0, 1], s: [0, -1], e: [-1, 0], w: [1, 0] }[entry.side];
      const f = this.grid.nearestFree(entry.x + inward[0] * 7, entry.y + inward[1] * 7, 5);
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
      equipFromInventory: (i) => { d.equipFromInventory(i); sfx.equip(); this.afterItemsChanged(); },
      unequip: (slot) => {
        if (!d.unequip(slot)) this.hud.message(L("Mochila cheia!", "Inventory full!"), "#ff6a5a");
        else sfx.equip();
        this.afterItemsChanged();
      },
      discard: (i) => {
        const it = d.inventory[i];
        d.inventory[i] = null;
        if (it) this.spawnLoot({ kind: "item", amount: 1, item: it }, this.hero.x, this.hero.y);
        this.afterItemsChanged();
      },
      drinkPotion: (k) => this.drinkPotion(k),
      townPortal: () => this.castTownPortal(),
      learn: (sk) => {
        if (d.learn(sk)) {
          this.hud.message(L(`${sk.name} agora no nível ${d.rank(sk)}.`, `${sk.name} is now rank ${d.rank(sk)}.`), "#ffe14d");
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
        if (d.gold < 25) return this.say(L("Ouro insuficiente.", "Not enough gold."));
        if (d.potions[k] >= MAX_POTIONS) return this.say(L("Cinto de poções cheio.", "Potion belt is full."));
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
        if (!d.unequipTo(slot, i)) this.say(L("Esse espaço tem um item de outro tipo.", "That slot holds a different kind of item."));
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
        this.hud.message(L(`Vendeu ${n} ite${n > 1 ? "ns" : "m"} por ${gold} ouro.`, `Sold ${n} item${n > 1 ? "s" : ""} for ${gold} gold.`), "#ffe14d");
        this.afterItemsChanged();
      },
      reroll: () => {
        const cost = this.rerollCost();
        if (d.gold < cost) return this.say(L("Ouro insuficiente.", "Not enough gold."));
        d.gold -= cost;
        this.restockShop(true);
        sfx.buy();
      },
    }, d.def.skills, d.def.resourceColor);
    this.hud.textures = this.textures;
    this.minimap = new Minimap(this.hud.minimap, this.map, this.dungeonRef ? undefined : d.fog[this.area.id]);
    this.propHover = new PropHover(this, this.hud.world);
    this.spawnNpcs();
    this.buildExitTags();
    this.spawnPortalBack();

    this.setupInput();
    this.setupNet();
    setAmbience(this.map.kind === "dungeon" ? "amb_dungeon" : "amb_town");
    setMusic(this.areaMusic());
    this.game.events.on(Phaser.Core.Events.POST_RENDER, this.updateOverlay, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.POST_RENDER, this.updateOverlay, this);
      this.scale.off(Phaser.Scale.Events.RESIZE, this.fitZoom, this);
      document.getElementById("ui")!.innerHTML = "";
    });

    if (!this.dungeonRef && this.area.act === "forest") this.blightAtmosphere();
    if (this.dungeonRef) {
      this.hud.zoneTitle(this.area.dungeons[this.dungeonRef.index].name, L(`${this.area.name} · Masmorra`, `${this.area.name} · Dungeon`));
      this.hud.vignette.classList.add("dungeon");
      this.darkEl = document.createElement("div");
      this.darkEl.className = "darkness";
      document.getElementById("ui")!.prepend(this.darkEl);
    } else if (d.quest.prologueSeen && !this.cinematic) {
      this.hud.zoneTitle(this.area.name, `${this.zone.subtitle} · ${this.zone.name}`);
      // First steps into a new act.
      if (firstVisit && this.area.village && this.area.id !== "minhau")
        this.time.delayedCall(1800, () => this.hud.banner(`${this.zone.subtitle}: ${this.zone.name}`, L("Um novo ato começa", "A new act begins")));
    }
    this.restockShop(false);
    this.spawnQuestObjects();
    this.spawnStepFoes();
    this.buildVillageState();
    this.storyActors(); // after the village state, which clears the decor
    if (this.cinematic) this.awaken();
  }

  /** Act I: a heavy vignette, low fog drifting over the ground and ash falling (lighter once the village is
   * rebuilt); the Wolf Wood is the mistiest. */
  private blightAtmosphere() {
    const clean = this.area.village && this.data_.hasFlag("act1_clean");
    this.hud.vignette.classList.add(clean ? "blight-soft" : "blight");
    const fog = document.createElement("div");
    fog.className = `blight-fog${this.area.id === "wolf_wood" ? " thick" : ""}${clean ? " soft" : ""}`;
    document.getElementById("ui")!.prepend(fog);
    if (clean) return;
    const cam = this.cameras.main;
    const ash = this.add.particles(0, 0, "px", {
      tint: [0x9a9088, 0x6a625c, 0xc8b8a8], speed: { min: 4, max: 14 }, angle: { min: 100, max: 130 }, gravityY: 6,
      lifespan: 6000, scale: { start: 0.9, end: 0.4 }, alpha: { start: 0.7, end: 0 }, frequency: 90, quantity: 1,
      emitZone: { type: "random", source: new Phaser.Geom.Rectangle(-260, -200, 520, 300) } as Phaser.Types.GameObjects.Particles.EmitZoneData,
    }).setDepth(1e6 - 3);
    ash.startFollow(cam.midPoint);
  }

  /** Ground skin and texture: Act I is a blighted land (ash, dead grass) until the village is rebuilt. */
  private areaLook(): { skin: ZoneDef["skin"]; dirt: string } {
    if (this.area.act === "forest" && this.area.village && this.data_.hasFlag("act1_clean")) return { skin: "", dirt: "dirt" };
    return { skin: this.zone.skin, dirt: this.zone.dirt };
  }

  /** Music of this map: Act I has the besieged village (until it is rebuilt) and the woods. */
  private areaMusic(): Track {
    if (this.map.kind === "dungeon") return "dungeon";
    if (this.area.act !== "forest") return "town";
    if (this.area.village) return this.data_.hasFlag("act1_clean") ? "town" : "village_ruin";
    return "forest";
  }

  /** After the prologue (IntroScene): the hero steps out of Aldo's hut into the village and takes over. */
  private awaken() {
    const cam = this.cameras.main;
    const aldo = this.npcs.find((n) => n.id === "aldo");
    this.busy = true;
    this.hero.face(0, 1);
    cam.fadeOut(0);
    cam.fadeIn(1600);
    this.time.delayedCall(900, () => {
      if (aldo) aldo.spr.face(this.hero.x - aldo.spr.x, this.hero.y - aldo.spr.y);
      this.hud.zoneTitle(this.area.name, `${this.zone.subtitle} · ${this.zone.name}`);
    });
    this.time.delayedCall(1800, () => {
      this.busy = false;
      this.cinematic = false;
      this.hud.message(AWAKEN_HINT, "#ffe14d");
    });
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
    const look = this.areaLook();
    const skin = look.skin ? `_${look.skin}` : "";
    const col: number[][] = [];
    for (let y = 0; y < MAP_H; y++) col.push(Array.from({ length: MAP_W }, (_, x) => (m.blocked[y * MAP_W + x] ? 0 : -1)));

    if (m.kind === "dungeon") {
      // Stone floor, brick wall faces where a wall sits above floor, void elsewhere.
      const data: number[][] = [];
      const floor = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && m.grass[y * MAP_W + x];
      for (let y = 0; y < MAP_H; y++)
        data.push(Array.from({ length: MAP_W }, (_, x) => (floor(x, y) ? ((x * 7 + y * 13) % 5 === 0 ? 1 : 0) : floor(x, y + 1) ? 2 : 3)));
      const tm = this.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE });
      const tiles = m.theme && m.theme !== "crypt" ? `dtiles_${m.theme}` : "dtiles";
      tm.createLayer(0, tm.addTilesetImage("dtiles", tiles)!, 0, 0)!.setDepth(-10);
      // Chests and the portal block a tile but are not walls: keep them on the floor visually.
      for (const c of m.chests) data[c.y][c.x] = 0;
    } else {
      this.add.tileSprite(0, 0, W, H, look.dirt).setOrigin(0).setDepth(-20);
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

    for (const p of m.props) this.drawProp(p, skin);
    if (m.kind === "dungeon") this.dungeonLights();

    for (const c of m.chests) {
      const spr = hasSprite("chest")
        ? new KilnSprite(this, c.x * TILE + 8, c.y * TILE + TILE - 2, "chest").setDepth(c.y * TILE + TILE - 2)
        : this.add.sprite(c.x * TILE + 8, c.y * TILE + TILE, "chest_farm", 0).setOrigin(0.5, 1).setDepth(c.y * TILE + TILE - 2);
      if (spr instanceof KilnSprite) spr.play2("idle");
      this.chests.push({ spr, level: c.level, opened: false, safe: c.safe });
    }

    // Checkpoint (travel between areas, or out of a dungeon).
    const pp = m.portal;
    if (!pp) return;
    if (hasSprite("portal")) {
      const portal = new KilnSprite(this, pp.x * TILE + 8, pp.y * TILE + TILE, "portal");
      portal.play2("idle");
      this.portalSpr = portal.setDepth(pp.y * TILE + TILE - 2);
    } else {
      this.portalSpr = this.add.image(pp.x * TILE + 8, pp.y * TILE + TILE + 2, "portal_stone").setOrigin(0.5, 1).setDepth(pp.y * TILE + TILE - 2);
    }
    const swirl = this.portalSwirl = this.add.image(pp.x * TILE + 8, pp.y * TILE + TILE - 11, "swirl").setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(pp.y * TILE + TILE - 1).setVisible(!hasSprite("portal"));
    this.tweens.add({ targets: swirl, scaleX: { from: 0.85, to: 1.05 }, alpha: { from: 0.7, to: 1 }, duration: 700, yoyo: true, repeat: -1 });
  }

  /** One prop of the map (classic Farm RPG art or a SpriteKiln export; authored maps use kind "kiln"). */
  private drawProp(p: Prop, skin: string) {
    const px = p.x * TILE, py = p.y * TILE;
    switch (p.kind) {
      case "kiln":
        this.drawKilnProp(p, skin);
        break;
      case "house": {
        const v = p.frame ?? 0;
        const name = v ? "house" : "barn";
        if (hasSprite(name)) {
          // Pivot = middle of the front wall's base, on the footprint's front tile row.
          kilnImage(this, px + 2.5 * TILE, (p.y + 1) * TILE, name).setDepth((p.y + 1) * TILE - 8);
          break;
        }
        const bottom = (p.y + 1 + v) * TILE;
        this.add.image(px, bottom, "house_farm", `h${v}`).setOrigin(0, 1).setDepth(bottom - 8);
        break;
      }
      case "ruin": {
        // A themed dungeon has its own way down: the farmhouse cellar doors, the butcher's trapdoor, a cave mouth.
        const dg = this.map.dungeons.find((g) => g.x === p.x + 2 && g.y === p.y + 1);
        const dd = dg ? this.area.dungeons[dg.index] : undefined;
        const door = dd?.theme && dd.theme !== "crypt" ? (`${dd.theme}_entrance` as SpriteName) : undefined;
        if (door && hasSprite(door)) {
          const cx = px + 2.5 * TILE, cy = (p.y + 1) * TILE;
          const ent = new KilnSprite(this, cx, cy, door);
          ent.play2("idle");
          ent.setDepth(cy - 8);
          ent.setData("label", L(`${dd!.name} · Entrar`, `${dd!.name} · Enter`));
          break;
        }
        if (hasSprite("crypt")) {
          // Crypt entrance modelled in SpriteKiln, centred on its 5x3 footprint.
          const cx = px + 2.5 * TILE, cy = (p.y + 1) * TILE;
          const crypt = new KilnSprite(this, cx, cy, "crypt");
          crypt.play2("idle");
          crypt.setDepth(cy - 8);
          // Graveyard dressing: a stone yard under the crypt, a dead tree, iron railings and tombstones
          // (offsets in tiles from the crypt's pivot; the doorway in front stays clear).
          if (hasSprite("crypt_floor")) kilnImage(this, cx, cy, "crypt_floor").setDepth(-4);
          const dress: [SpriteName, number, number][] = [
            ["dead_tree", -3.2, -1.9], ["grave_fence", 3.4, -2.0], ["grave_fence", -1.6, -3.1],
            ["tombstone", -3.1, -0.2], ["tombstone", -2.2, 0.7], ["tombstone", 3.2, 0.3],
          ];
          for (const [name, ox, oy] of dress) {
            if (!hasSprite(name)) continue;
            const y = cy + oy * TILE;
            kilnImage(this, cx + ox * TILE, y, name).setDepth(y - 2);
          }
          break;
        }
        // Fallback: the Farm RPG house, darkened, with a glowing doorway.
        const bottom = (p.y + 2) * TILE;
        this.add.image(px, bottom, "house_farm", "h1").setOrigin(0, 1).setDepth(bottom - 8).setTint(0x7a6a7a);
        const glow = this.add.image(px + 2.5 * TILE, (p.y + 1) * TILE - 4, "disc").setTint(0xc06bff).setScale(0.35, 0.25)
          .setBlendMode(Phaser.BlendModes.ADD).setDepth(bottom - 7);
        this.tweens.add({ targets: glow, alpha: { from: 0.4, to: 0.9 }, duration: 900, yoyo: true, repeat: -1 });
        break;
      }
      case "fence_h":
      case "fence_v":
        if (hasSprite(p.kind)) kilnImage(this, px + 8, py + TILE - 3, p.kind).setDepth(py + TILE - 2);
        else this.add.image(px + 8, py + TILE, "fence", p.kind === "fence_h" ? "h" : "v").setOrigin(0.5, 1).setDepth(py + TILE - 2);
        break;
      // SpriteKiln trees (pivot = trunk base) when exported, else the Farm RPG art; both use the biome skin.
      case "tree_big":
        this.trees.push(hasSprite("tree_big")
          ? kilnImage(this, px + TILE, py + TILE - 3, "tree_big", `tree_big${skin}`).setDepth(py + TILE - 3)
          : this.add.image(px + TILE, py + TILE - 1, `tree${skin}`, "big").setOrigin(0.5, 1).setDepth(py + TILE - 3));
        break;
      case "tree_medium":
        this.trees.push(hasSprite("tree_medium")
          ? kilnImage(this, px + 8, py + TILE - 3, "tree_medium", `tree_medium${skin}`).setDepth(py + TILE - 3)
          : this.add.image(px + 8, py + TILE - 1, `tree${skin}`, "medium").setOrigin(0.5, 1).setDepth(py + TILE - 3));
        break;
      case "tree_bush":
        if (hasSprite("bush")) kilnImage(this, px + 8, py + TILE - 3, "bush", `bush${skin}`).setDepth(py + TILE - 4);
        else this.add.image(px + 8, py + TILE, `tree${skin}`, "bush").setOrigin(0.5, 1).setDepth(py + TILE - 4);
        break;
      case "tree_stump":
        if (hasSprite("stump")) kilnImage(this, px + 8, py + TILE - 3, "stump").setDepth(py + TILE - 4);
        else this.add.image(px + 8, py + TILE, "tree", "stump").setOrigin(0.5, 1).setDepth(py + TILE - 4);
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

  /** An authored SpriteKiln prop: pivot at the bottom middle of its tile (decals: the tile centre); a variant
   * frame, a clip, or the idle animation when it has several frames. Falls back to `alt` while missing. */
  private drawKilnProp(p: Prop, skin: string) {
    const name = p.name!;
    if (!hasSprite(name)) {
      // Fallback: a classic prop (trees keep the biome skin), else another SpriteKiln export.
      const alt = p.alt;
      if (!alt) return;
      if (!alt.startsWith("tree_") && hasSprite(alt as SpriteName)) this.drawKilnProp({ ...p, name: alt as SpriteName, alt: undefined, variant: undefined, anim: undefined }, skin);
      else this.drawProp({ ...p, kind: alt }, skin);
      return;
    }
    const meta = kilnMeta(name)!;
    const x = p.x * TILE + 8 + (p.off?.[0] ?? 0), y = (p.floor ? p.y * TILE + 8 : p.y * TILE + TILE - 3) + (p.off?.[1] ?? 0);
    const variants = meta.animations.variants?.directions.s?.frames;
    const clip = p.anim && meta.animations[p.anim] ? p.anim : "idle";
    let obj: Phaser.GameObjects.Image | KilnSprite;
    if (p.variant !== undefined && variants) {
      obj = this.add.image(x, y, name, variants[p.variant % variants.length]).setOrigin(meta.pivot.x / meta.frame_size, meta.pivot.y / meta.frame_size);
    } else if ((meta.animations[clip]?.directions.s?.frames.length ?? 1) > 1 || clip !== "idle") {
      const k = new KilnSprite(this, x, y, name);
      k.play2(clip);
      if (meta.animations[clip]?.loop) k.anims.setProgress((p.x * 7 + p.y * 13) % 10 / 10);
      obj = k;
    } else obj = kilnImage(this, x, y, name);
    obj.setDepth(p.floor ? -6 : y - 2);
    if (p.tree) this.trees.push(obj as Phaser.GameObjects.Image);
  }

  /** Pools of light in a themed dungeon: candles in the cellar, the glowing mushrooms of the cave, the
   * butcher's braziers (warm glows by the meat hooks). */
  private dungeonLights() {
    const glow = (x: number, y: number, color: number, s: number) => {
      const g = this.add.image(x, y, "disc").setTint(color).setBlendMode(Phaser.BlendModes.ADD).setScale(s, s * 0.7).setAlpha(0.5).setDepth(-5);
      this.tweens.add({ targets: g, alpha: 0.28, duration: 700 + Math.random() * 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    };
    for (const p of this.map.props) {
      const x = p.x * TILE + 8, y = p.y * TILE + 8;
      if (p.kind === "candle") glow(x, y, 0xffa040, 0.9);
      else if (p.name === "glow_mushrooms") glow(x, y, 0x40e0d0, 1.3);
      else if (p.name === "flea_nest") glow(x, y, 0x9adf40, 1.0);
      else if (p.name === "meat_hook" && (p.x + p.y) % 3 === 0) glow(x, y + 8, 0xff6030, 1.1);
    }
  }

  /** Name tags on the roads leading into the neighbouring areas. */
  private buildExitTags() {
    const m = this.map;
    for (const ex of m.exits) {
      const el = document.createElement("div");
      el.className = "npc-tag exit-tag";
      const open = canEnter(ex.to, this.data_.tier);
      const arrow = { n: "▲", s: "▼", e: "▶", w: "◀" }[ex.side];
      el.innerHTML = `<div class="nname">${arrow} ${AREAS[ex.to].name}</div>${open ? "" : `<div class="ntitle">${L("Selado", "Sealed")}</div>`}`;
      this.hud.world.appendChild(el);
      const inward = { n: [0, 1], s: [0, -1], e: [-1, 0], w: [1, 0] }[ex.side];
      this.exitTags.push({ el, x: (ex.x + inward[0] * 4) * TILE + 8, y: (ex.y + inward[1] * 4) * TILE + 8 });
    }

  }

  private spawnNpcs() {
    const spots = this.map.npcs;
    if (!spots) return;
    for (const id of npcsOf(this.zone.id)) {
      const [tx, ty] = spots[NPCS[id].role];
      const spr = new KilnSprite(this, tx * TILE + 8, ty * TILE + 10, NPCS[id].sprite);
      spr.play2("idle");
      spr.anims.setProgress(Math.random());
      spr.setDepth(spr.y);
      spr.face(0, 1);
      const tag = document.createElement("div");
      tag.className = "npc-tag";
      this.hud.world.appendChild(tag);
      const marker = hasSprite("npc_marker") ? new KilnSprite(this, spr.x, spr.y - 40, "npc_marker").setDepth(1e6).setVisible(false) : undefined;
      this.npcs.push({ id, spr, tag, marker, home: { x: spr.x, y: spr.y } });
    }
  }

  // ---------------------------------------------------------------- enemies: spawn & scaling

  private spawnEnemies() {
    for (const pack of this.map.packs) if (!this.arenaBarred(pack)) this.spawnPack(pack);
  }

  /** While the story arena is barred its camp stays empty (Lula is not there yet for the hero); a story lair
   * is only there while its quest is being done (the three mutts, until they are purified). */
  private arenaBarred(pack: Pack) {
    const d = this.data_;
    if (pack.quest) return d.currentQuest?.id !== pack.quest || d.quest.status === "available" || (!!pack.unique && d.quest.killed.includes(pack.unique));
    const a = this.map.arena;
    return !!a && this.arenaLocked && pack.x >= a.x0 && pack.x <= a.x1 && pack.y >= a.y0 && pack.y <= a.y1;
  }

  private spawnPack(pack: Pack) {
    const killed = this.data_.quest.killed;
    const campTypes: Record<CampKind, EnemyType[]> = {
      goblin: ["goblin"], bandit: ["bandit"], undead: ["skeleton"], spider: ["spider"], beast: ["wolf"], swamp: ["lizardman"],
    };
    const types = pack.types ?? this.area.mix[pack.faction] ?? campTypes[pack.faction];
    // Forest beast camps are often a wolf pack, led by an alpha from level 3 (Blackfang leads his own).
    const wolves = !pack.types && pack.faction === "beast" && this.area.act === "forest"
      && (pack.unique === "fang" || (pack.x * 7 + pack.y * 13) % 10 < 5);
    for (let i = 0; i < pack.count; i++) {
      let type: EnemyType = types[Math.floor(Math.random() * types.length)];
      let rank: EnemyRank = "normal";
      let unique: UniqueId | undefined;
      if (pack.faction === "bandit" && !pack.types) {
        const brutes = pack.champion ? 2 : pack.level >= 3 ? 1 : 0;
        if (i < brutes) type = "brute";
      }
      if (wolves) type = i === 0 && (pack.level >= 3 || pack.champion) ? "alpha" : "wolf";
      if (pack.unique && i === 0 && !killed.includes(pack.unique)) {
        unique = pack.unique;
        type = UNIQUES[pack.unique].type;
        rank = "boss";
      } else if (pack.champion && i < (pack.faction === "goblin" ? 2 : 1)) rank = "champion";
      // A story lair's boss waits on its own spot (by its bed of bones, clear of the menhirs).
      const jitter = pack.quest ? 0 : 6;
      const tx = pack.x + Math.round((Math.random() - 0.5) * jitter);
      const ty = pack.y + Math.round((Math.random() - 0.5) * jitter);
      const t = this.grid.nearestFree(tx, ty, 4);
      if (t) this.spawnEnemy(t[0] * TILE + 8, t[1] * TILE + 8, pack, type, rank, unique);
    }
  }

  private spawnEnemy(x: number, y: number, pack: Pack, type: EnemyType, rank: EnemyRank, unique?: UniqueId) {
    const boss: UniqueDef | undefined = unique ? UNIQUES[unique] : undefined;
    // A story boss with their own model: drawn untinted, without the type's wounded variants.
    const own = boss?.sprite && hasSprite(boss.sprite) ? boss.sprite : undefined;
    const def: EnemyDef = own ? { ...ENEMIES[type], sprite: own, hurt: undefined, maimed: undefined, tint: undefined } : ENEMIES[type];
    const spr = new KilnSprite(this, x, y, def.sprite);
    this.physics.add.existing(spr);
    spr.setScale(boss ? (own ? boss.spriteScale ?? 1 : boss.scale) : (def.scale ?? 1) * (rank === "champion" ? 1.12 : 1));
    this.setupBody(spr, def.body);
    const tint = boss ? (own ? null : boss.tint ?? null) : rank === "champion" ? 0x9fb8ff : def.tint ?? null;
    if (tint) spr.setTint(tint);
    if (def.alpha) spr.setAlpha(def.alpha);
    const abilities = boss ? boss.abilities : def.abilities;
    const e: Enemy = {
      spr, body: spr.body as Phaser.Physics.Arcade.Body, type, def, rank, unique, pack, boss,
      baseLevel: pack.level, level: 0, hp: 0, maxHp: 0, dmg: [0, 0], speed: def.speed * (0.92 + Math.random() * 0.16), name: "",
      state: "idle", home: new Phaser.Math.Vector2(x, y), nextAttack: 0, slowUntil: 0, stunUntil: 0,
      path: [], repathAt: 0, wanderAt: Math.random() * 3000, aggro: false, tint, active: true,
      abilities, abilityAt: abilities?.map((a) => this.time.now + 2500 + Math.random() * a.cooldown * 0.5),
      dormant: !!def.traits?.ambush && rank !== "boss",
      id: ++this.enemySeq,
    };
    if (e.dormant && def.traits!.ambush!.hidden) spr.setAlpha(0);
    this.byId.set(e.id, e);
    this.setLevel(e, pack.level + this.tierBonus);
    spr.play2("idle");
    spr.anims.setProgress(Math.random());
    if (!def.traits?.noClip) this.physics.add.collider(spr, this.collision);
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
    e.name = e.boss ? e.boss.name : e.rank === "champion" ? L(`${d.name(level)} Campeão`, `${d.name(level)} Champion`) : d.name(level);
  }

  /** Each completed story quest: the world grows stronger and cleared camps are retaken. */
  private worldTierUp() {
    for (const e of this.enemies) if (e.state !== "dead") this.setLevel(e, e.baseLevel + this.tierBonus);
    let respawned = 0;
    for (const pack of this.map.packs) {
      if (this.arenaBarred(pack)) continue;
      const alive = this.enemies.some((e) => e.pack === pack && e.state !== "dead");
      const far = Phaser.Math.Distance.Between(pack.x * TILE, pack.y * TILE, this.hero.x, this.hero.y) > 500;
      if (!alive && far) {
        this.spawnPack(pack);
        respawned++;
      }
    }
    this.hud.banner(L("O perigo cresce...", "Danger grows..."), L(`Inimigos agora são ${this.tierBonus} níveis mais fortes${respawned ? " e acampamentos foram reocupados" : ""}.`, `Enemies are now ${this.tierBonus} levels stronger${respawned ? " and their camps have been retaken" : ""}.`));
  }

  // ---------------------------------------------------------------- input

  private setupInput() {
    this.keys = this.input.keyboard!.addKeys("W,A,S,D,I,C,K,M,N,B,Q,E,R,ONE,TWO,ESC,SHIFT,SPACE") as Record<string, Phaser.Input.Keyboard.Key>;
    const k = this.keys;
    k.I.on("down", () => this.hud.toggle("inv"));
    k.C.on("down", () => this.hud.toggle("chr"));
    k.K.on("down", () => this.hud.toggle("tree"));
    k.M.on("down", () => this.hud.toggleMap());
    k.B.on("down", () => this.castTownPortal());
    k.N.on("down", () => (this.hud.worldMapOpen ? this.hud.closeWorldMap() : !this.dungeonRef && this.openWorldMap(false)));
    k.ESC.on("down", () => {
      if (this.cinematic) return; // the arrival cutscene can only be sped up (cinematic.ts)
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
      if (this.dead || this.hud.dialogActive || this.cinematic) return;
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
      if (this.portalSpr && Phaser.Math.Distance.Between(this.portalSpr.x, this.portalSpr.y - 14, w.x, w.y) < 16) {
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
      const qo = this.questObjs.find((o) => Math.abs(o.spr.x - w.x) < 14 && w.y > o.spr.y - 20 && w.y < o.spr.y + 3);
      if (qo) {
        this.order = { type: "quest", obj: qo };
        return;
      }
      const pet = this.decor.find((o) => Math.abs(o.spr.x - w.x) < 12 && w.y > o.spr.y - 22 && w.y < o.spr.y + 3);
      if (pet) {
        this.say(`${pet.label}: ${pet.lines[Math.floor(Math.random() * pet.lines.length)]}`, "#ffe14d");
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
    this.gateHint(time);
    this.updateArena(time);
    this.updateLair();
    this.updateHoverRing(time);

    if (!this.dead) {
      const regen = d.stats.hpRegen * (this.inTown ? 4 : 1);
      d.hp = Math.min(d.stats.maxHp, d.hp + regen * dt);
      const fury = this.lastHit && time - this.lastHit.t < 3000;
      const mreg = d.cls === "barbarian" ? (fury ? 0 : -2.5) + Math.max(0, d.stats.manaRegen + 1) : d.stats.manaRegen;
      d.mana = Phaser.Math.Clamp(d.mana + mreg * dt, 0, d.stats.maxMana);
    }

    this.updateHover(pw.x, pw.y);
    this.propHover.update(pw.x, pw.y, !!this.hovered || !!this.hoveredNpc || this.hud.anyOpen());
    this.updateLootHover(pw.x, pw.y);
    if (!this.dead) this.updateHero(time, delta, pw);
    this.updateGather(time);
    if (!this.dead) this.updateHeroStatus(time);
    this.updateEnemies(time, delta);
    this.updateTraps(time);
    this.updateExits(time);
    this.updateTownPortal(time);
    if (this.portalSpr && this.area.waypoint && !this.dungeonRef && !this.data_.waypoints.includes(this.area.id)
      && Phaser.Math.Distance.Between(this.hero.x, this.hero.y, this.portalSpr.x, this.portalSpr.y) < 56) this.activateWaypoint();
    this.updateProjectiles(dt);
    this.updateZones(time);
    this.updateBolts(dt);
    this.updateNet(time, dt);
    this.updateLoot();
    this.updateTrees();
    this.updateAura(time);
    this.drawBars();
    this.objPts = this.objectivePoints();
    this.updateObjectiveArrows(time);
    this.updateDecor(time);
    for (const n of this.npcs) n.spr.setDepth(n.spr.y);

    if (time > this.mapAt) {
      this.mapAt = time + 120;
      this.minimap.reveal(this.hero.x, this.hero.y);
      this.minimap.draw(this.hero, this.mapMarkers(), time);
    }
    if (time > this.mapAt - 60) this.fitZoom();
    if (time > this.saveAt) {
      this.saveAt = time + 20000;
      this.saveFog();
      d.save();
    }
    this.hud.update({
      cls: d.cls, level: d.level, xp: d.xp, xpNext: d.xpNext, xpPrev: d.xpPrev, gold: d.gold, hp: d.hp, mana: d.mana,
      absorb: d.absorb, stats: d.stats, potions: d.potions, inventory: d.inventory, equipment: d.equipment,
      ranks: d.ranks, skillPoints: d.skillPoints, cooldowns: this.cooldowns, dashCooldown: this.dashCd, buffs: d.buffs, now: time,
      quest: this.questTracker(),
    });
    const boss = this.enemies.find((e) => e.boss && e.aggro && e.state !== "dead" && Phaser.Math.Distance.Between(e.spr.x, e.spr.y, this.hero.x, this.hero.y) < 340);
    const tgt = this.hovered ?? boss ?? (this.lastHit && time - this.lastHit.t < 2500 && this.lastHit.e.state !== "dead" ? this.lastHit.e : null);
    this.hud.setTarget(tgt ? { name: L(`${tgt.name} (nv ${tgt.level})`, `${tgt.name} (lv ${tgt.level})`), hp: tgt.hp, maxHp: tgt.maxHp, kind: tgt.rank } : null);
  }

  /** Hovered enemy: red tint, a pulsing red outline (WebGL) and a target ring at its feet. */
  private setHovered(e: Enemy | null) {
    const prev = this.hovered;
    if (prev) {
      if (this.hoverGlow) prev.spr.preFX?.remove(this.hoverGlow);
      if (prev.state !== "dead") this.restoreTint(prev);
    }
    this.hoverGlow = undefined;
    this.hoverGlowTween?.stop();
    this.hovered = e;
    if (!e) {
      this.hoverRing?.setVisible(false);
      return;
    }
    e.spr.setTint(0xff9a8a);
    this.hoverGlow = e.spr.preFX?.addGlow(0xff3a2a, 2, 0, false, 0.1, 8);
    if (this.hoverGlow) this.hoverGlowTween = this.tweens.add({ targets: this.hoverGlow, outerStrength: 5, duration: 380, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    this.hoverRing ??= this.add.image(0, 0, "ring").setTint(0xff3a2a).setBlendMode(Phaser.BlendModes.ADD);
    const w = (e.def.body * 2 + 10) / 64 * e.spr.scaleX;
    this.hoverRing.setVisible(true).setScale(w, w * 0.45).setAlpha(0.9);
  }

  /** Keeps the target ring under the hovered enemy, breathing slightly. */
  private updateHoverRing(time: number) {
    const e = this.hovered, ring = this.hoverRing;
    if (!e || !ring) return;
    ring.setPosition(e.spr.x, e.spr.y + 1).setDepth(e.spr.y - 1).setAlpha(0.65 + 0.3 * Math.sin(time / 120));
  }

  private updateHover(wx: number, wy: number) {
    let best: Enemy | null = null, bd = 16;
    for (const e of this.enemies) {
      if (e.state === "dead" || !e.active || e.dormant) continue;
      const dd = Phaser.Math.Distance.Between(e.spr.x, e.spr.y - Math.max(8, e.def.height * 0.4) * e.spr.scaleY, wx, wy);
      if (dd < bd * e.spr.scaleX * (e.type === "brute" ? 1.3 : Math.max(1, e.def.body / 6))) { bd = dd; best = e; }
    }
    if (best !== this.hovered) this.setHovered(best);
    this.hoveredNpc = best ? null : this.npcs.find((n) => !n.hidden && Phaser.Math.Distance.Between(n.spr.x, n.spr.y - 12, wx, wy) < 14) ?? null;
    for (const n of this.npcs) {
      if (n === this.hoveredNpc) n.spr.setTint(0xfff2b0);
      else n.spr.clearTint();
    }
  }

  /** Tooltip when the mouse is over an item icon lying on the ground. */
  private updateLootHover(wx: number, wy: number) {
    const l = this.loot.find((x) => x.ready && x.item && Phaser.Math.Distance.Between(x.img.x, x.img.y, wx, wy) < 9) ?? null;
    const p = this.input.activePointer;
    if (l !== this.tipLoot) {
      if (l) this.hud.showItemTip(l.item!, p.x, p.y);
      else if (this.tipLoot) this.hud.hideTip();
      this.tipLoot = l;
    } else if (l) this.hud.moveItemTip(p.x, p.y);
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
        if ((!this.order || this.order.type === "move") && this.hovered && this.hovered.state !== "dead") {
          // Holding to walk and sweeping over an enemy starts attacking it.
          this.order = { type: "attack", enemy: this.hovered };
        } else if (!this.order || this.order.type === "move") {
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

    if (this.busy || time < this.heroStunUntil) {
      body.setVelocity(0, 0);
      if (!this.busy) this.hero.play2("idle", { timeScale: 0.3 });
      return;
    }

    const speed = BASE_SPEED * (1 + d.stats.moveSpeed) * (time < this.heroSlow.until ? this.heroSlow.mult : 1) * (d.dev ? 2 : 1);
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
      } else if (o.type === "quest") {
        const q = o.obj;
        if (!this.questObjs.includes(q)) this.order = null;
        else if (Phaser.Math.Distance.Between(this.hero.x, this.hero.y, q.spr.x, q.spr.y) < 22) {
          this.order = null;
          this.path = [];
          body.setVelocity(0, 0);
          this.startGather(q);
          return;
        } else if (!this.path.length) this.planPath(q.spr.x, q.spr.y + 6);
      } else if (o.type === "portal" && this.portalSpr) {
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
      } else if (o.type === "talk" && o.npc.hidden) {
        this.order = null;
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
      this.stepT -= delta;
      if (this.stepT <= 0) {
        this.stepT = 330 / (1 + d.stats.moveSpeed);
        sfx.step(this.map.kind === "dungeon");
      }
    } else if (!this.gather) {
      this.hero.play2("idle");
    }
  }

  // ---------------------------------------------------------------- dash

  private dash() {
    if (this.dead || this.busy || this.leaping || this.dashCd > 0 || this.hud.dialogActive || this.time.now < this.heroStunUntil) return;
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
    sfx.dash();
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
    if (this.busy || this.dead || this.leaping || this.time.now < this.dashUntil || this.time.now < this.heroStunUntil) return;
    const rank = d.rank(sk);
    if (!rank) {
      this.say(d.level < sk.reqLevel ? L(`${sk.name} requer nível ${sk.reqLevel}.`, `${sk.name} requires level ${sk.reqLevel}.`) : L(`Aprenda ${sk.name} na árvore de habilidades (K).`, `Learn ${sk.name} in the skill tree (K).`));
      return;
    }
    if ((this.cooldowns[sk.id] ?? 0) > 0) return;
    if (d.mana < sk.cost) {
      this.say(d.cls === "barbarian" ? L("Fúria insuficiente — acerte inimigos para gerar Fúria.", "Not enough Fury — strike enemies to build Fury.") : L(`${d.def.resource} insuficiente!`, `Not enough ${d.def.resource}!`));
      return;
    }
    if (sk.kind === "corpse" && !this.corpsesNear(this.clampTarget(sk, tx, ty), sk.radius!).length) {
      this.say(L("Nenhum cadáver perto do cursor.", "No corpse near the cursor."));
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
    sfx.skill(sk.id, sk.kind === "melee" ? "swing" : sk.projectile?.tex === "fx_arrow" ? "bow" : "cast");
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
    const vs = e.def.faction === "beast" ? d.stats.dmgBeast : e.def.faction === "undead" ? d.stats.dmgUndead : 0;
    const { dmg, crit } = d.rollDamage(sk.dmgMult * mult * (1 + vs));
    const fire = d.stats.fireDmg > 0 ? Math.max(1, Math.round(d.stats.fireDmg * sk.dmgMult * mult * (0.8 + Math.random() * 0.4))) : 0;
    const blow: Blow = {
      kind: sk.death,
      angle: angle ?? Phaser.Math.Angle.Between(this.hero.x, this.hero.y, e.spr.x, e.spr.y),
      big: sk.id === "piercing" || sk.id === "meteor" || sk.id === "explosive",
      toHero: !!sk.heal,
    };
    this.damageEnemy(e, dmg, crit, quiet, blow, fire);
    const heal = dmg * (d.stats.lifeSteal + (sk.heal ?? 0));
    if (heal >= 1) {
      d.hp = Math.min(d.stats.maxHp, d.hp + heal);
      if (sk.heal) this.floatAt(this.hero.x, this.hero.y - 30, `+${Math.round(heal)}`, "heal");
    }
    if (sk.gain) d.mana = Math.min(d.stats.maxMana, d.mana + sk.gain);
    this.lastHit = { e, t: this.time.now };
  }

  /** `fire`: extra fire damage from items, added after physical resistance. */
  private damageEnemy(e: Enemy, dmg: number, crit: boolean, quiet = false, blow: Blow = { kind: "normal", angle: 0 }, fire = 0) {
    if (e.state === "dead") return;
    const tr = e.def.traits;
    if (e.dormant) {
      if (tr?.ambush?.immune) {
        if (!quiet) this.floatAt(e.spr.x, e.spr.y - 30 * e.spr.scaleY, L("Imune", "Immune"), "");
        return;
      }
      this.wake(e);
    }
    const raw = dmg; // a guest reports the raw hit: the host applies the resistance
    const magic = MAGIC_KINDS.has(blow.kind);
    if (tr?.physRes && !magic) {
      dmg = Math.max(1, Math.round(dmg * (1 - tr.physRes)));
      if (!quiet && Math.random() < 0.3) this.emitters.dust.explode(4, e.spr.x, e.spr.y - 14 * e.spr.scaleY);
    }
    if (blow.kind === "burn" || blow.kind === "melt" || fire > 0) e.burnedAt = this.time.now;
    if (fire > 0) {
      dmg += fire;
      if (!quiet || Math.random() < 0.3) this.emitters.fire.explode(4, e.spr.x, e.spr.y - 12 * e.spr.scaleY);
    }
    if (tr?.stealth) e.revealUntil = this.time.now + 1500;
    if (e.proxy) {
      // Guest: the host owns enemy life. Report the hit and show the feedback locally.
      net.send({ t: "hit", id: e.id, dmg: raw, crit, kind: blow.kind, angle: blow.angle, fire });
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

  private killEnemy(e: Enemy, blow: Blow, overkill = false, reward = true) {
    const d = this.data_;
    e.state = "dead";
    e.spr.setAlpha(1);
    const spare = e.unique && !e.proxy && reward ? SPARED[e.unique] : undefined;
    if (!e.proxy) this.onMonsterDeath(e);
    if (!spare) sfx.die(e.def.sprite);
    if (e.rank === "boss") setMusic(this.areaMusic());
    e.body.setVelocity(0, 0);
    e.body.enable = false;
    if (e.def.maimed && !spare) e.spr.setSprite(e.def.maimed);
    this.restoreTint(e);
    e.spr.setDepth(e.spr.y - 6);
    if (this.hovered === e) this.setHovered(null);
    if (spare) {
      // No gore: the cutscene beats them (and counts the quest once it is over).
      if (this.isHost) net.send({ t: "die", id: e.id, kind: "normal", angle: blow.angle, big: false, overkill: false });
      const gap = this.data_.level - e.level;
      this.giveXp(Math.max(1, Math.round((e.def.xp[0] + e.def.xp[1] * e.level) * 8 * (gap > 2 ? Math.max(0.05, 1 - (gap - 2) * 0.15) : 1)
        * DIFFICULTIES[d.difficulty].xp)));
      if (!d.quest.killed.includes(e.unique!)) d.quest.killed.push(e.unique!);
      this.dropLoot(e);
      void (spare === "lula" ? this.lulaDefeat(e) : this.purifyDog(e));
      return;
    }
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

    if (!reward) {
      this.time.delayedCall(1500, () => e.spr.active && this.removeCorpse(e));
      return;
    }
    // Monsters far below the hero give little XP (no farming the first areas); a bit more above it.
    const gap = d.level - e.level;
    const levelMult = gap > 2 ? Math.max(0.05, 1 - (gap - 2) * 0.15) : gap < -2 ? 1.15 : 1;
    const xp = Math.max(1, Math.round((e.def.xp[0] + e.def.xp[1] * e.level) * (e.rank === "boss" ? 8 : e.rank === "champion" ? 2.5 : 1)
      * levelMult * DIFFICULTIES[d.difficulty].xp));
    this.giveXp(xp);
    if (e.unique) {
      if (!d.quest.killed.includes(e.unique)) d.quest.killed.push(e.unique);
      this.hud.banner(L(`${e.name} caiu!`, `${e.name} has fallen!`), this.dungeonRef ? L("Masmorra concluída! Um portal se abriu.", "Dungeon cleared! A portal has opened.") : "");
      sfx.quest();
      this.slowmo(900, 0.3);
      if (this.dungeonRef) {
        const key = `${this.area.id}:${this.dungeonRef.index}`;
        if (!d.cleared.includes(key)) d.cleared.push(key);
        // Exit portal appears where the boss fell.
        const t = this.grid.nearestFree(Math.floor(e.spr.x / TILE), Math.floor(e.spr.y / TILE) - 2, 4);
        if (t && this.portalSpr && this.portalSwirl) {
          this.portalSpr.setPosition(t[0] * TILE + 8, t[1] * TILE + TILE + 2).setDepth(t[1] * TILE + TILE - 2);
          this.portalSwirl.setPosition(t[0] * TILE + 8, t[1] * TILE + TILE - 11).setDepth(t[1] * TILE + TILE - 1);
          this.ringFx(this.portalSpr.x, this.portalSpr.y, 40, 0xc06bff, 600);
        }
        if (this.stepIs("dungeon")) this.questProgress();
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

  /** Death traits: slimes split, a pack that loses its alpha runs away. */
  private onMonsterDeath(e: Enemy) {
    const tr = e.def.traits;
    if (tr?.split && e.rank !== "boss") {
      sfx.monster("split", 0.6);
      for (let k = 0; k < tr.split.count; k++) {
        const t = this.grid.nearestFree(Math.floor(e.spr.x / TILE) + Phaser.Math.Between(-1, 1), Math.floor(e.spr.y / TILE) + Phaser.Math.Between(-1, 1), 2);
        if (!t) continue;
        const m = this.spawnEnemy(e.spr.x, e.spr.y, e.pack, tr.split.type, "normal");
        this.setLevel(m, e.level);
        m.aggro = true;
        m.nextAttack = this.time.now + 600;
        this.tweens.add({ targets: m.spr, x: t[0] * TILE + 8, y: t[1] * TILE + 8, duration: 260, ease: "Quad.easeOut" });
      }
    }
    if (tr?.leader) {
      const pack = this.enemies.filter((m) => m !== e && m.pack === e.pack && m.state !== "dead" && m.def.traits?.pack);
      for (const m of pack) {
        m.fleeUntil = this.time.now + 4000 + Math.random() * 1500;
        m.path = [];
      }
      if (pack.length) this.hud.message(L("A matilha foge sem o alfa!", "The pack flees without its alpha!"), "#ffe14d");
    }
  }

  /** An ambusher springs out (tree comes alive, gargoyle wakes, something bursts from the ground). */
  private wake(e: Enemy) {
    if (!e.dormant) return;
    e.dormant = false;
    e.aggro = true;
    const amb = e.def.traits?.ambush;
    e.nextAttack = this.time.now + 500;
    if (amb?.hidden) this.tweens.add({ targets: e.spr, alpha: e.def.alpha ?? 1, duration: 180 });
    this.emitters.dust.explode(amb?.hidden ? 18 : 10, e.spr.x, e.spr.y);
    if (amb?.immune) this.emitters.smoke.explode(10, e.spr.x, e.spr.y - 16 * e.spr.scaleY);
    sfx.monster(amb?.hidden ? "burrow" : amb?.immune ? "wake_stone" : "wake_tree", 0.6);
    this.shake(100, 0.003);
    if (e.spr.has("emerge")) {
      e.state = "hit";
      e.spr.play2("emerge", { restart: true, onComplete: () => e.state !== "dead" && (e.state = "chase") });
    }
  }

  private removeCorpse(e: Enemy) {
    for (const o of e.remains ?? []) o.destroy();
    e.spr.destroy();
    this.enemies = this.enemies.filter((x) => x !== e);
  }

  private giveXp(xp: number) {
    if (this.cinematic) return; // the opening cutscene's kills give no XP
    const d = this.data_;
    const before = { hp: d.stats.maxHp, dmg: d.stats.dmgMax };
    const ups = d.gainXp(xp);
    if (ups) {
      d.save();
      const unlocked = d.def.skills.filter((sk) => sk.reqLevel > d.level - ups && sk.reqLevel <= d.level && sk.slot !== "primary" && sk.slot !== "secondary");
      this.levelUpFx(ups, [
        L(`+${Math.round(d.stats.maxHp - before.hp)} Vida`, `+${Math.round(d.stats.maxHp - before.hp)} Life`), L(`+${Math.round(d.stats.dmgMax - before.dmg)} Dano`, `+${Math.round(d.stats.dmgMax - before.dmg)} Damage`),
        L(`+${ups} Ponto${ups > 1 ? "s" : ""} de habilidade`, `+${ups} Skill Point${ups > 1 ? "s" : ""}`), L("Vida restaurada", "Life restored"),
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

  /** Level up: the "NÍVEL x" card in the middle of the screen with only the skill points gained, a sound and
   * a small sparkle (no zoom or slow motion). */
  private levelUpFx(ups: number, _gains: string[], _unlocked: SkillDef[]) {
    const h = this.hero;
    sfx.levelUp();
    this.hud.levelUp(this.data_.level, [L(`+${ups} ponto${ups > 1 ? "s" : ""} de habilidade`, `+${ups} skill point${ups > 1 ? "s" : ""}`)], []);
    this.hud.markInventoryDirty();
    this.emitters.gold.explode(12, h.x, h.y - 16);
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
      if (this.cinematic) {
        e.body.setVelocity(0, 0); // the opening cutscene moves them (or keeps them waiting)
        continue;
      }
      const tr = e.def.traits;
      if (e.dormant) {
        e.body.setVelocity(0, 0);
        if (!h.dead && dist < tr!.ambush!.range * e.spr.scaleX && !this.inTownAt(h.x, h.y)) this.wake(e);
        continue;
      }
      if (tr?.stealth) {
        const shown = time < (e.revealUntil ?? 0) || e.state === "attack";
        const a = shown ? 1 : tr.stealth;
        if (Math.abs(e.spr.alpha - a) > 0.02) e.spr.setAlpha(e.spr.alpha + (a - e.spr.alpha) * Math.min(1, delta / 120));
      }
      if (tr?.regen && e.hp < e.maxHp && time - (e.burnedAt ?? -1e9) > 4000) {
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * tr.regen * (e.rank === "boss" ? 0.3 : 1) * (delta / 1000));
        if (Math.random() < 0.02) this.emitters.gold.explode(1, e.spr.x, e.spr.y - 20 * e.spr.scaleY);
      }
      if (time < e.stunUntil) {
        e.body.setVelocity(0, 0);
        if (e.state !== "hit") e.spr.play2("idle", { timeScale: 0.3 });
        e.spr.setTint(0xfff2a0);
        if (Math.random() < 0.04) this.emitters.gold.explode(1, e.spr.x, e.spr.y - 24 * e.spr.scaleY);
        continue;
      }
      if (e.state === "attack" || e.state === "hit") continue;

      const fromHome = Phaser.Math.Distance.Between(e.home.x, e.home.y, e.spr.x, e.spr.y);
      if (h.dead || (!e.raider && (this.inTownAt(h.x, h.y) || fromHome > 320))) {
        if (e.aggro) {
          e.aggro = false;
          e.hp = e.maxHp;
          e.path = [];
          if (e.def.hurt) e.spr.setSprite(e.def.sprite);
        }
      } else if (dist < e.def.aggro * (e.rank === "boss" ? 1.3 : 1) && !this.lairAsleep(e)) {
        // Beasts growl when they spot their prey (not the whole pack at once).
        if (!e.aggro && e.def.faction === "beast" && time > this.growlAt) {
          this.growlAt = time + 2500;
          sfx.monster("growl", 0.45);
        }
        e.aggro = true;
      }

      const slowed = time < e.slowUntil;
      if (slowed) e.spr.setTint(0x9fdfff);
      else if (this.hovered !== e) this.restoreTint(e);
      const speed = e.speed * (slowed ? 0.45 : 1) * (time < (e.hasteUntil ?? 0) ? 1.35 : 1);

      if (e.charging) continue;
      if (time < (e.fleeUntil ?? 0)) {
        // Run straight away from the target.
        const dx = e.spr.x - h.x, dy = e.spr.y - h.y, len = Math.hypot(dx, dy) || 1;
        this.steer(e, e.spr.x + (dx / len) * 40, e.spr.y + (dy / len) * 40, speed * 1.1, time, false);
        continue;
      }
      if (e.aggro && tr?.leader && !e.howled) this.howl(e);
      if (e.aggro && tr?.kite && !e.announced) {
        // A wisp first circles its prey for a while before it dives in.
        e.announced = true;
        e.nextAttack = time + 2000 + Math.random() * 1500;
      }
      if (e.aggro && e.abilities && this.abilityTurn(e, time, dist, h)) continue;
      if (e.aggro && tr?.kite && time < e.nextAttack && dist < tr.kite) {
        // Hover out of reach while the attack recharges.
        const dx = e.spr.x - h.x, dy = e.spr.y - h.y, len = Math.hypot(dx, dy) || 1;
        const side = (e.id % 2 ? 1 : -1) * 0.8;
        this.steer(e, e.spr.x + (dx / len - dy / len * side) * 30, e.spr.y + (dy / len + dx / len * side) * 30, speed * 0.8, time, false);
        continue;
      }
      if (e.aggro) {
        const reach = e.def.reach * e.spr.scaleX;
        if (dist <= reach) {
          e.body.setVelocity(0, 0);
          e.spr.face(h.x - e.spr.x, h.y - e.spr.y);
          if (time >= e.nextAttack) this.enemyAttack(e, time, h);
          else this.standStill(e);
          continue;
        }
        this.steer(e, h.x, h.y, speed, time, !tr?.noClip);
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
          this.standStill(e);
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

  /** Standing still. An awake ambusher's idle is its disguise (a frozen tree), so it sways in a slow walk instead. */
  private standStill(e: Enemy) {
    if (e.def.traits?.ambush && !e.def.traits.ambush.hidden && !e.dormant) e.spr.play2("walk", { timeScale: 0.25 });
    else e.spr.play2("idle");
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
    if (e.def.traits?.explode) return this.selfDestruct(e);
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
      else if (dist <= e.def.hitRange * e.spr.scaleX) {
        this.hurtTarget(target, e);
        // Thorns: melee attackers of the local hero get hurt back.
        const thorns = this.data_.stats.thorns;
        if (!target.remote && thorns > 0 && !this.dead)
          this.damageEnemy(e, Math.max(1, Math.round(thorns * (0.8 + Math.random() * 0.4))), false, true,
            { kind: "normal", angle: Phaser.Math.Angle.Between(t.x, t.y, e.spr.x, e.spr.y) });
      }
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

  /** Will-o'-wisp: swells up and bursts, hurting everyone close (it dies, giving nothing). */
  private selfDestruct(e: Enemy) {
    const ex = e.def.traits!.explode!;
    e.state = "attack";
    e.body.setVelocity(0, 0);
    this.tweens.add({ targets: e.spr, scaleX: e.spr.scaleX * 1.5, scaleY: e.spr.scaleY * 1.5, duration: 450, ease: "Quad.easeIn" });
    const g = this.add.image(e.spr.x, e.spr.y, "disc").setTint(0x9fffe0).setAlpha(0.3).setDepth(-1).setScale(ex.radius / 32, (ex.radius / 32) * 0.62);
    e.spr.play2("attack", { restart: true });
    this.time.delayedCall(480, () => {
      g.destroy();
      if (e.state === "dead") return;
      this.ringFx(e.spr.x, e.spr.y, ex.radius, 0x9fffe0, 260);
      sfx.monster("wisp_burst");
      this.emitters.frost.explode(30, e.spr.x, e.spr.y - 8);
      this.shake(120, 0.005);
      for (const p of this.players()) {
        const pp = this.targetPos(p);
        if (Phaser.Math.Distance.Between(pp.x, pp.y, e.spr.x, e.spr.y) < ex.radius) this.hurtTarget(p, e, ex.mult);
      }
      e.hp = 0;
      this.killEnemy(e, { kind: "shock", angle: 0 }, false, false);
    });
  }

  /** Alpha wolf: a howl that speeds up its pack. */
  private howl(e: Enemy) {
    e.howled = true;
    this.hud.message(L(`${e.name} uiva!`, `${e.name} howls!`), "#ff8a3a");
    sfx.monster("howl");
    this.ringFx(e.spr.x, e.spr.y, 60, 0xffe14d, 500);
    for (const m of this.enemies)
      if (m.pack === e.pack && m.state !== "dead") {
        m.hasteUntil = this.time.now + 7000;
        m.aggro = true;
      }
  }

  private placeTrap(e: Enemy, x: number, y: number, mult: number) {
    if (!this.grid.free(Math.floor(x / TILE), Math.floor(y / TILE))) return;
    const img = this.add.image(x, y, "ring").setTint(0x9e6d32).setScale(0.28, 0.14).setAlpha(0.75).setDepth(-2);
    this.emitters.dust.explode(5, x, y);
    this.traps.push({ img, until: this.time.now + 20000, src: e, mult, armedAt: this.time.now + 500 });
  }

  private updateTraps(time: number) {
    for (const t of this.traps) {
      if (time > t.until) {
        t.img.destroy();
        continue;
      }
      if (time < t.armedAt || this.isGuest) continue;
      for (const p of this.players()) {
        const pp = this.targetPos(p);
        if (Phaser.Math.Distance.Between(pp.x, pp.y, t.img.x, t.img.y) < 9) {
          this.emitters.dust.explode(12, t.img.x, t.img.y);
          this.ringFx(t.img.x, t.img.y, 14, 0x9e6d32, 200);
          sfx.monster("trap");
          this.hurtTarget(p, t.src, t.mult, { slow: [0.5, 2000] });
          t.until = 0;
          t.img.destroy();
          break;
        }
      }
    }
    this.traps = this.traps.filter((t) => t.until > time);
  }

  // ---------------------------------------------------------------- bosses

  /** Runs a ready ability (bosses, the boar's charge, kobold traps); returns true when the monster is busy with it. */
  private abilityTurn(e: Enemy, time: number, dist: number, target: Target): boolean {
    const boss = e.boss;
    if (boss && !e.announced) {
      e.announced = true;
      sfx.boss();
      setMusic("boss");
      this.shake(400, 0.006);
      this.hud.banner(boss.name, L("Chefe", "Boss"));
    }
    const list = e.abilities!;
    // Ordinary monsters use their ability from mid range only (a charge needs a run-up, a dart a gap).
    const minDist = boss ? 0 : e.def.reach * e.spr.scaleX + 20;
    const maxDist = (a: MobAbility) => (a.kind === "charge" ? (boss ? 220 : 160) : boss ? 260 : 150);
    const i = list.findIndex((a, k) => time >= e.abilityAt![k] && dist < maxDist(a) && (dist > minDist || a.kind === "trap"));
    if (i < 0) return false;
    const a = list[i];
    e.abilityAt![i] = time + a.cooldown * (0.85 + Math.random() * 0.3);
    this.useBossAbility(e, a, target);
    return true;
  }

  private useBossAbility(e: Enemy, a: MobAbility, target: Target) {
    const h = this.targetPos(target);
    const frost = e.type === "lich";
    const tint = frost ? 0x7edaf2 : e.def.boltTint && e.type !== "manticore" ? e.def.boltTint : 0xff3a1a;
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
            const voice = { dragon: "fire_breath", ant: "acid", manticore: "spikes" }[e.type as string];
            if (voice) sfx.monster(voice);
            for (let k = 0; k < a.count; k++) this.enemyBolt(e, (k - (a.count - 1) / 2) * 0.22, a.mult, this.targetPos(target));
          } });
        break;
      case "summon":
        e.spr.play2(anim, { restart: true, onComplete: done });
        this.time.delayedCall(400, () => {
          if (e.state === "dead") return;
          this.emitters.shadow.explode(30, e.spr.x, e.spr.y - 10);
          this.hud.message(L(`${e.name} invoca reforços!`, `${e.name} summons reinforcements!`), "#ff8a3a");
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
      case "trap": {
        // Drops a snare a few steps toward the target and backs off.
        e.spr.play2(anim, { restart: true, onComplete: done });
        const ang = Phaser.Math.Angle.Between(e.spr.x, e.spr.y, h.x, h.y);
        const dd = Math.min(40, Phaser.Math.Distance.Between(e.spr.x, e.spr.y, h.x, h.y) * 0.5);
        this.placeTrap(e, e.spr.x + Math.cos(ang) * dd, e.spr.y + Math.sin(ang) * dd, a.mult);
        break;
      }
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
    const sock = e.spr.socket("muzzle") ?? e.spr.socket("mouth") ?? e.spr.socket("spikes");
    const ox = e.spr.x + (sock?.x ?? 0), oy = e.spr.y + (sock?.y ?? -20 * e.spr.scaleY);
    const a = Phaser.Math.Angle.Between(ox, oy, at.x, at.y - 12) + spread;
    const vx = Math.cos(a) * 170, vy = Math.sin(a) * 170;
    const tint = e.type === "lich" ? 0x7edaf2 : e.def.boltTint ?? 0xc06bff;
    if (this.isHost) net.send({ t: "fx", kind: "bolt", x: ox, y: oy, vx, vy, tint });
    this.addBolt(ox, oy, vx, vy, tint, e, mult);
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

  /** Map seed for an area or one of its dungeons (shared with the partner on travel). */
  private seedFor(zone: AreaId, dungeon: number | null) {
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
        this.hud.banner(L("Sessão encerrada", "Session ended"), L("O anfitrião saiu. Você continua sozinho.", "The host has left. You continue alone."));
        net.leave();
        this.time.delayedCall(1500, () => this.restartAt({}));
      } else {
        this.hud.message(L("Seu colega saiu da sessão.", "Your companion left the session."), "#ff8a3a");
        this.renderSession();
      }
    });
    if (this.isHost) {
      net.on("hello", (m) => {
        this.onRemoteState(m.player);
        net.send({ t: "welcome", zone: this.area.id, dungeon: this.dungeonRef?.index ?? null, seed: this.mapSeed,
          x: this.hero.x, y: this.hero.y, difficulty: this.data_.difficulty, tier: this.tier });
        this.hud.banner(L(`${m.player.name} entrou!`, `${m.player.name} has joined!`), L(`Nível ${m.player.level}`, `Level ${m.player.level}`));
        sfx.quest();
        this.renderSession();
      });
      net.on("hit", (m) => {
        const e = this.byId.get(m.id);
        if (!e || e.state === "dead") return;
        e.aggro = true;
        if (m.slow) e.slowUntil = this.time.now + m.slow;
        if (m.stun) e.stunUntil = this.time.now + m.stun;
        if (m.dmg > 0) this.damageEnemy(e, m.dmg, m.crit, false, { kind: m.kind as DeathKind, angle: m.angle }, m.fire ?? 0);
      });
    } else {
      net.on("snap", (m) => this.onSnap(m.e));
      net.on("die", (m) => {
        const e = this.byId.get(m.id);
        if (!e || e.state === "dead") return;
        e.hp = 0;
        this.killEnemy(e, { kind: m.kind as DeathKind, angle: m.angle, big: m.big }, false);
      });
      net.on("hurt", (m) => this.hurtHeroRaw(m.raw, m.level, m));
      net.on("fx", (m) => this.onFx(m));
      net.on("travel", (m) => {
        const d = this.data_;
        d.save();
        this.cameras.main.fadeOut(300, 10, 5, 12);
        this.time.delayedCall(320, () => this.scene.restart({
          hero: d, dungeon: m.dungeon ?? undefined, exitAt: m.exitAt ?? undefined, netSeed: m.seed, netZone: m.zone, from: (m.from ?? undefined) as Side | undefined,
        }));
      });
    }
  }

  /** Invite a friend from the pause menu. */
  private startHosting() {
    this.hud.message(L("Abrindo sessão...", "Opening session..."), "#9fe8ff");
    net.host().then(() => {
      this.setupNet();
      this.hud.banner(L("Sessão aberta!", "Session open!"), L("Copie o link no painel à esquerda e mande para o seu colega.", "Copy the link in the left panel and send it to your companion."));
    }).catch(() => this.hud.message(L("Não foi possível abrir a sessão (sem internet?).", "Could not open the session (no internet?)."), "#ff6a5a"));
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
    const partner = this.remote ? L(`${this.remote.st.name} nv ${this.remote.st.level}`, `${this.remote.st.name} lv ${this.remote.st.level}`) : "";
    if (this.isHost) {
      el.innerHTML = `<div>${L("Sessão multijogador", "Multiplayer session")}</div><div class="code">${net.code}</div>
        <div class="st ${net.peerConnected ? "ok" : ""}">${net.peerConnected ? L(`Conectado: ${partner || "colega"}`, `Connected: ${partner || "companion"}`) : L("Aguardando colega...", "Waiting for companion...")}</div>`;
      const copy = document.createElement("button");
      copy.className = "btn";
      copy.textContent = L("Copiar link de convite", "Copy invite link");
      copy.onclick = () => {
        void navigator.clipboard?.writeText(net.inviteLink());
        copy.textContent = L("Link copiado!", "Link copied!");
      };
      el.appendChild(copy);
    } else {
      el.innerHTML = `<div>${L("Na sessão", "In session")} <b>${net.code}</b></div><div class="st ok">${L(`Anfitrião: ${partner || "conectando..."}`, `Host: ${partner || "connecting..."}`)}</div>`;
    }
    const leave = document.createElement("button");
    leave.className = "btn";
    leave.textContent = L("Sair da sessão", "Leave session");
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
      tag.innerHTML = `<div class="pn">${p.name} ${L("nv", "lv")} ${p.level}</div><div class="pb"><div></div></div>`;
      this.hud.world.appendChild(tag);
      this.remote = { spr, tag, st: p };
      this.renderSession();
    }
    const r = this.remote;
    const prev = r.st;
    r.st = p;
    if (prev.level !== p.level) r.tag.querySelector(".pn")!.textContent = L(`${p.name} nv ${p.level}`, `${p.name} lv ${p.level}`);
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
        e.dormant = false; // the host decides ambushes; the copy just shows the monster
        e.spr.setAlpha(e.def.alpha ?? 1);
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
      difficulty: d.difficulty, slot: d.slot, cls: d.cls, level: d.level, zone: this.area.name, online: net.active,
      quest: d.currentQuest ? L(`Missão: ${d.currentQuest.title}`, `Quest: ${d.currentQuest.title}`) : L("História concluída", "Story complete"),
      onResume: () => this.scene.isPaused() && this.scene.resume(),
      onInvite: net.active ? undefined : () => this.startHosting(),
      onQuit: () => {
        net.leave();
        d.save();
        setAmbience(null);
        setMusic(null);
        // The shutdown handler clears the UI layer: show the menu after it.
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => window.setTimeout(openMainMenu));
        this.scene.stop();
      },
    });
  }

  // ---------------------------------------------------------------- travel

  private usePortal() {
    if (this.isGuest) return this.say(L("Na sessão, só o anfitrião usa o portal.", "In a session, only the host can use the portal."), "#ffe14d");
    sfx.portal();
    if (this.dungeonRef) {
      this.hud.dialog("Portal", null, [L("Um redemoinho de luz roxa leva de volta à superfície.", "A swirl of violet light leads back to the surface.")],
        [{ label: L(`Voltar para ${this.area.name}`, `Return to ${this.area.name}`), action: () => this.restartAt({ exitAt: this.dungeonRef!.index }) }]);
      return;
    }
    this.activateWaypoint();
    this.openWorldMap(true);
  }

  /** B: opens a return portal in front of the hero, at once (the hero keeps doing what they were doing). */
  private castTownPortal() {
    const d = this.data_;
    if (this.dead || this.leaping || this.cinematic || this.hud.dialogActive) return;
    if (this.isGuest) return this.say(L("Na sessão, só o anfitrião abre portais.", "In a session, only the host can open portals."), "#ffe14d");
    // A new portal replaces the one already open (and the way back it offered).
    if (this.townPortal) {
      if (this.townPortal.back) d.portalBack = null;
      const old = this.townPortal.spr;
      this.townPortal = null;
      this.tweens.add({ targets: old, alpha: 0, duration: 250, onComplete: () => old.destroy() });
    }
    // A step in front of the hero, on free ground.
    const dir = { e: [1, 0], w: [-1, 0], n: [0, -1], s: [0, 1], ne: [1, -1], nw: [-1, -1], se: [1, 1], sw: [-1, 1] }[this.hero.dir];
    const t = this.grid.nearestFree(Math.floor((this.hero.x + dir[0] * 26) / TILE), Math.floor((this.hero.y + dir[1] * 26) / TILE), 3)
      ?? [Math.floor(this.hero.x / TILE), Math.floor(this.hero.y / TILE)];
    const spr = this.openPortalSprite(t[0] * TILE + 8, t[1] * TILE + 12, L(`Portal para ${AREAS[d.lastWaypoint].name}`, `Portal to ${AREAS[d.lastWaypoint].name}`));
    this.townPortal = { spr, until: this.time.now + 60000 };
    sfx.portal();
    this.hud.message(L(`Portal aberto para ${AREAS[d.lastWaypoint].name}. Entre nele.`, `Portal open to ${AREAS[d.lastWaypoint].name}. Step into it.`), "#7edaf2");
  }

  private openPortalSprite(x: number, y: number, label: string) {
    let spr: Phaser.GameObjects.Image | KilnSprite;
    if (hasSprite("town_portal")) {
      const k = new KilnSprite(this, x, y, "town_portal");
      k.play2(k.has("open") ? "open" : "idle", { restart: true, onComplete: () => k.active && k.play2("idle") });
      spr = k;
    } else {
      spr = this.add.image(x, y - 14, "swirl").setTint(0x7edaf2).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: spr, scaleX: { from: 0.2, to: 1 }, scaleY: { from: 0.2, to: 1.4 }, duration: 500, ease: "Back.easeOut" });
    }
    spr.setDepth(y).setData("label", label);
    this.ringFx(x, y, 24, 0x7edaf2, 400);
    return spr;
  }

  /** At the last checkpoint: the portal back to where the hero opened the return portal. */
  private spawnPortalBack() {
    const d = this.data_, b = d.portalBack;
    if (!b || this.dungeonRef || this.area.id !== d.lastWaypoint || this.isGuest) return;
    const sp = this.map.spawn;
    const t = this.grid.nearestFree(sp.x + 3, sp.y + 1, 4);
    if (!t) return;
    const where = b.dungeon !== null ? AREAS[b.area].dungeons[b.dungeon]?.name ?? AREAS[b.area].name : AREAS[b.area].name;
    const spr = this.openPortalSprite(t[0] * TILE + 8, t[1] * TILE + 12, L(`Portal de volta: ${where}`, `Portal back: ${where}`));
    this.townPortal = { spr, until: Infinity, back: true };
  }

  /** The return portal: step into it (or click it) to travel; it fades after a minute. */
  private updateTownPortal(time: number) {
    const tp = this.townPortal;
    if (!tp || this.leaving) return;
    const close = () => {
      this.townPortal = null;
      const k = tp.spr;
      if (k instanceof KilnSprite && k.has("close")) k.play2("close", { restart: true, onComplete: () => k.destroy() });
      else this.tweens.add({ targets: k, alpha: 0, duration: 300, onComplete: () => k.destroy() });
    };
    if (time > tp.until) return close();
    const dist = Phaser.Math.Distance.Between(this.hero.x, this.hero.y, tp.spr.x, tp.spr.y);
    // Opened in the hero's path: it only takes them once they have stepped away from it.
    if (dist > 20) tp.armed = true;
    if (this.dead || !tp.armed || dist > 12) return;
    const d = this.data_;
    this.leaving = true;
    close();
    if (tp.back && d.portalBack) {
      // Back to where the portal was opened (a dungeon is rebuilt with the same layout).
      const b = d.portalBack;
      d.portalBack = null;
      d.area = b.area;
      this.restartAt({ dungeon: b.dungeon ?? undefined, spawnAt: { x: b.x, y: b.y + 14 } });
      return;
    }
    d.portalBack = { area: this.area.id, dungeon: this.dungeonRef?.index ?? null, x: tp.spr.x, y: tp.spr.y };
    d.area = d.lastWaypoint;
    this.restartAt({});
  }

  /** First touch of an area's checkpoint: it joins the travel network. */
  private activateWaypoint() {
    const d = this.data_;
    if (this.area.waypoint && !this.dungeonRef) d.lastWaypoint = this.area.id;
    if (!this.area.waypoint || d.waypoints.includes(this.area.id)) return;
    d.waypoints.push(this.area.id);
    d.save();
    sfx.portal();
    if (this.portalSpr) this.ringFx(this.portalSpr.x, this.portalSpr.y, 40, 0xc06bff, 600);
    this.hud.banner(L("Checkpoint ativado", "Checkpoint activated"), L(`${this.area.name} · viaje para cá de qualquer checkpoint`, `${this.area.name} · travel here from any checkpoint`));
  }

  /** Area the current quest points at: the objective while it is active, otherwise the village of whoever
   * gives or takes it back. */
  private questArea(): AreaId | null {
    const d = this.data_;
    const q = d.currentQuest;
    if (!q) return null;
    if (d.quest.status === "active") return d.currentStep!.area;
    const npc = d.quest.status === "ready" ? q.turnIn ?? q.giver : q.giver;
    return ZONES[NPCS[npc].act].village;
  }

  /** Activated checkpoint closest (in areas walked) to an area. */
  private nearestWaypoint(to: AreaId): AreaId | null {
    let best: AreaId | null = null, bd = Infinity;
    for (const w of this.data_.waypoints) {
      const n = routeTo(w, to).length;
      if (n < bd) { bd = n; best = w; }
    }
    return best;
  }

  /** The world map: every area of the three acts. From a checkpoint, a click on another activated checkpoint travels there. */
  private openWorldMap(travel: boolean) {
    const d = this.data_;
    const target = this.questArea();
    this.hud.worldMap({
      current: this.area.id, visited: d.visited, waypoints: d.waypoints, tier: d.tier,
      objective: target, nearest: target ? this.nearestWaypoint(target) : null,
      quest: d.currentQuest?.title ?? null,
      onTravel: travel && !this.isGuest ? (a) => this.travel(a) : undefined,
    });
  }

  private travel(area: AreaId) {
    if (area === this.area.id) return;
    this.data_.area = area;
    this.data_.lastWaypoint = area;
    this.data_.portalBack = null; // the return trip only goes from the checkpoint it arrived at
    this.restartAt({});
  }

  /** Walking off the map along an exit road: load the neighbouring area. */
  private updateExits(time: number) {
    if (this.leaving || this.dead || this.cinematic || this.dungeonRef || this.isGuest) return;
    const tx = this.hero.x / TILE, ty = this.hero.y / TILE;
    for (const ex of this.map.exits) {
      const close = ex.side === "n" ? ty < 2.5 : ex.side === "s" ? ty > MAP_H - 2.5 : ex.side === "w" ? tx < 2.5 : tx > MAP_W - 2.5;
      if (!close || Math.hypot(tx - ex.x, ty - ex.y) > 8) continue;
      if (!canEnter(ex.to, this.data_.tier)) {
        if (time > this.exitHintAt) {
          this.exitHintAt = time + 2500;
          this.say(L(`O caminho para ${AREAS[ex.to].name} está selado. Avance na história.`, `The way to ${AREAS[ex.to].name} is sealed. Advance the story.`), "#ff8a3a");
        }
        const back = { n: [0, 1], s: [0, -1], e: [-1, 0], w: [1, 0] }[ex.side];
        this.heroBody.reset(this.hero.x + back[0] * 12, this.hero.y + back[1] * 12);
        this.order = null;
        this.path = [];
        return;
      }
      this.leaving = true;
      this.data_.area = ex.to;
      this.restartAt({ from: OPPOSITE[ex.side] });
      return;
    }
  }

  private askEnterDungeon(index: number) {
    if (this.isGuest) return this.say(L("Na sessão, só o anfitrião entra nas masmorras.", "In a session, only the host can enter dungeons."), "#ffe14d");
    const dd = this.area.dungeons[index];
    const cleared = this.data_.cleared.includes(`${this.area.id}:${index}`);
    const lvl = this.area.level + 3 + this.tierBonus;
    this.hud.dialog(dd.name, null,
      [L(`Uma casa abandonada. Do porão sobe um ar gelado e um cheiro de morte... (inimigos ~nível ${lvl}${cleared ? ", chefe já derrotado" : ""})`, `An abandoned house. From the cellar rises an icy draft and the stench of death... (enemies ~level ${lvl}${cleared ? ", boss already slain" : ""})`)],
      [{ label: L("Descer na masmorra", "Descend into the dungeon"), action: () => { sfx.portal(); this.restartAt({ dungeon: index }); } }]);
  }

  /** Reloads the scene (new area, dungeon or exit) keeping the hero in memory. */
  private restartAt(opts: { dungeon?: number; exitAt?: number; from?: Side; spawnAt?: { x: number; y: number } }) {
    const d = this.data_;
    if (this.portalSpr instanceof KilnSprite && this.portalSpr.has("activate") && !opts.from) this.portalSpr.play2("activate", { restart: true });
    this.saveFog();
    d.save();
    if (this.isHost) {
      // The partner follows to the same map.
      net.send({ t: "travel", zone: d.area, dungeon: opts.dungeon ?? null, exitAt: opts.exitAt ?? null, from: opts.from ?? null,
        seed: this.seedFor(d.area, opts.dungeon ?? null) });
    }
    this.cameras.main.fadeOut(300, 10, 5, 12);
    this.time.delayedCall(320, () => this.scene.restart({ hero: d, ...opts }));
  }

  /** Keeps what the hero explored of this area for the next visit. */
  private saveFog() {
    if (!this.dungeonRef && this.minimap) this.data_.fog[this.area.id] = this.minimap.exportFog();
  }

  /** Damage roll of an enemy hit (before the victim's armor). */
  private rollEnemyDamage(e: Enemy, mult: number) {
    return (e.dmg[0] + Math.random() * (e.dmg[1] - e.dmg[0])) * mult;
  }

  /** Hit on a player by a monster, with the monster's pack/aura bonus and its on-hit effects. */
  private hurtTarget(t: Target, e: Enemy, mult = 1, extra: HitEffects = {}) {
    mult *= this.packMult(e, t);
    const raw = this.rollEnemyDamage(e, mult);
    const tr = e.def.traits;
    const fx: HitEffects = { ...extra };
    if (tr?.poison) fx.poison = [raw * tr.poison.frac, tr.poison.ms];
    if (tr?.stun && Math.random() < tr.stun.chance) fx.stun = tr.stun.ms;
    if (tr?.slow && Math.random() < tr.slow.chance) fx.slow = [tr.slow.mult, tr.slow.ms];
    if (tr?.drain && e.state !== "dead") {
      e.hp = Math.min(e.maxHp, e.hp + raw * tr.drain);
      this.emitters.blood.explode(4, e.spr.x, e.spr.y - 8);
    }
    if (tr?.stealth) e.revealUntil = this.time.now + 1500;
    if (t.remote) net.send({ t: "hurt", raw, level: e.level, ...fx });
    else this.hurtHeroRaw(raw, e.level, fx);
  }

  /** Damage multiplier from pack hunters around the same target and from a nearby hobgoblin's aura. */
  private packMult(e: Enemy, t: Target) {
    let m = 1;
    const pack = e.def.traits?.pack;
    const p = this.targetPos(t);
    if (pack) {
      let n = 0;
      for (const o of this.enemies)
        if (o !== e && o.state !== "dead" && o.def.traits?.pack && Phaser.Math.Distance.Between(o.spr.x, o.spr.y, p.x, p.y) < 34) n++;
      m *= 1 + pack * Math.min(3, n);
    }
    for (const o of this.enemies) {
      const aura = o.def.traits?.aura;
      if (aura && o !== e && o.state !== "dead" && !o.dormant && o.def.faction === e.def.faction
        && Phaser.Math.Distance.Between(o.spr.x, o.spr.y, e.spr.x, e.spr.y) < aura.radius) {
        m *= 1 + aura.mult;
        break;
      }
    }
    return m;
  }

  private hurtHeroRaw(raw: number, level: number, fx: HitEffects = {}) {
    const d = this.data_;
    if (this.dead || d.dev) return; // dev save: god mode
    if (this.time.now < this.invulnUntil) {
      this.floatAt(this.hero.x, this.hero.y - 30, L("Esquivou", "Dodged"), "heal");
      return;
    }
    this.applyHitEffects(fx);
    this.cancelGather(true);
    let dmg = Math.max(1, Math.round(raw * (1 - armorReduction(d.stats.armor, level))));
    if (d.absorb > 0) {
      const a = Math.min(d.absorb, dmg);
      d.absorb -= a;
      dmg -= a;
      this.emitters.frost.explode(6, this.hero.x, this.hero.y - 14);
      if (!dmg) {
        this.floatAt(this.hero.x, this.hero.y - 30, L("Absorvido", "Absorbed"), "");
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

  /** Poison, stun and slow from a monster's hit on the local hero. */
  private applyHitEffects(fx: HitEffects) {
    const now = this.time.now;
    const keep = 1 - this.data_.stats.statusRes; // shorter effects with resistance
    if (fx.poison && fx.poison[0] > 0) {
      const p = this.heroPoison;
      const dps = Math.max(fx.poison[0], p && now < p.until ? p.dps : 0);
      this.heroPoison = { until: now + fx.poison[1] * keep, dps, next: p && now < p.until ? p.next : now + 1000 };
      this.floatAt(this.hero.x, this.hero.y - 40, L("Envenenado", "Poisoned"), "hurt");
      sfx.monster("poison", 0.5);
    }
    if (fx.stun && now > this.heroStunUntil) {
      this.heroStunUntil = now + fx.stun * keep;
      this.floatAt(this.hero.x, this.hero.y - 40, L("Atordoado", "Stunned"), "hurt");
      sfx.monster("stun");
      this.order = null;
      this.path = [];
    }
    if (fx.slow) {
      this.heroSlow = { until: now + fx.slow[1] * keep, mult: Math.min(fx.slow[0], now < this.heroSlow.until ? this.heroSlow.mult : 1) };
      this.floatAt(this.hero.x, this.hero.y - 40, L("Lento", "Slowed"), "hurt");
    }
  }

  /** Poison ticks and the tint of the hero's status effects. */
  private updateHeroStatus(time: number) {
    const p = this.heroPoison;
    if (p) {
      if (time >= p.until) this.heroPoison = null;
      else if (time >= p.next) {
        p.next += 1000;
        const d = this.data_;
        if (d.dev) return;
        const dmg = Math.max(1, Math.round(p.dps));
        d.hp -= dmg;
        this.floatAt(this.hero.x, this.hero.y - 30, String(dmg), "hurt");
        this.emitters.shadow.explode(4, this.hero.x, this.hero.y - 14);
        if (d.hp <= 0) this.heroDies();
      }
    }
    const tint = time < this.heroStunUntil ? 0xfff2a0 : this.heroPoison ? 0xa0ff90 : time < this.heroSlow.until ? 0x9fdfff : 0;
    if (tint) this.hero.setTint(tint);
    else if (this.hero.isTinted && !this.hero.tintFill) this.hero.clearTint();
    if (time < this.heroStunUntil && Math.random() < 0.06) this.emitters.gold.explode(1, this.hero.x, this.hero.y - 30);
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
      // Back at the nearest activated checkpoint (in a dungeon: its area's, or the closest one).
      const wp = this.area.waypoint && d.waypoints.includes(this.area.id) ? this.area.id : this.nearestWaypoint(this.area.id);
      if (!this.isGuest && (this.dungeonRef || (wp && wp !== this.area.id))) {
        if (wp) d.area = wp;
        this.saveFog();
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
    // Act I: until Marta's tools come back the forge is cold, so she sells no weapons.
    const cold = this.area.act === "forest" && !d.hasFlag("forge_lit");
    const slot = () => (cold ? SLOTS.filter((x) => x !== "weapon")[Math.floor(Math.random() * (SLOTS.length - 1))] : undefined);
    d.shop = rarities.map((r) => (r === "legendary" && Math.random() < 0.6 ? generateItem(d.level, d.def, "epic", slot()) : generateItem(d.level + this.tier, d.def, r, slot())));
    this.hud.refreshShop(d.shop, this.rerollCost());
  }

  private buyItem(i: number) {
    const d = this.data_;
    const it = d.shop[i];
    if (!it) return;
    const price = itemValue(it);
    if (d.gold < price) return this.say(L("Ouro insuficiente.", "Not enough gold."));
    if (!d.addItem(it)) return this.say(L("Mochila cheia!", "Inventory full!"));
    d.gold -= price;
    d.shop[i] = null;
    sfx.buy();
    this.hud.message(L(`Comprou: ${it.name}`, `Bought: ${it.name}`), RARITY_COLOR[it.rarity]);
    this.hud.refreshShop(d.shop, this.rerollCost());
    this.afterItemsChanged();
  }

  // ---------------------------------------------------------------- quests & NPCs

  /** Is the current quest active on a step of this kind? */
  private stepIs<T extends Objective["type"]>(type: T): Extract<Objective, { type: T }> | null {
    const d = this.data_;
    const o = d.quest.status === "active" ? d.currentStep?.objective : undefined;
    return o?.type === type ? (o as Extract<Objective, { type: T }>) : null;
  }

  private questKill(e: Enemy) {
    const d = this.data_;
    const st = d.currentStep;
    if (!st || d.quest.status !== "active") return;
    const o = st.objective;
    // Kill steps tied to the village only count the raiders it brought there.
    if (o.type === "kill" && o.faction === e.def.faction && (!st.spawn || st.area === this.area.id)) this.questProgress();
    else if (o.type === "unique" && e.unique === o.id) this.questProgress();
    else if (o.type === "uniques" && e.unique && o.ids.includes(e.unique)) this.questProgress();
  }

  private questProgress() {
    const d = this.data_;
    const q = d.currentQuest!;
    const st = d.currentStep!;
    d.quest.progress++;
    const count = st.objective.count;
    if (d.quest.progress < count) {
      if (st.objective.type !== "unique") this.hud.message(`${st.goal}: ${d.quest.progress}/${count}`, "#ffe14d");
      return;
    }
    if (d.quest.step < q.steps.length - 1) {
      // On to the next step.
      d.quest.step++;
      d.quest.progress = 0;
      d.quest.taken = [];
      const next = d.currentStep!;
      this.hud.banner(L("Objetivo cumprido", "Objective complete"), next.area === this.area.id ? next.goal : `${next.goal} · ${AREAS[next.area].name}`);
      sfx.quest();
      this.spawnQuestObjects();
      this.spawnStepFoes();
      this.storyActors();
      // The new step may already be done (a boss slain before, a quest object picked up earlier).
      this.checkStepDone();
    } else {
      d.quest.status = "ready";
      this.storyActors();
      const who = q.turnIn ?? q.giver;
      this.hud.banner(L("Missão cumprida!", "Quest complete!"), L(`Volte e fale com ${NPCS[who].name}.`, `Return and speak with ${NPCS[who].name}.`));
    }
    d.save();
  }

  /** Steps that can be already satisfied when they start (story bosses never come back). */
  private checkStepDone() {
    const d = this.data_;
    const o = d.quest.status === "active" ? d.currentStep?.objective : undefined;
    if (o?.type === "unique" && d.quest.killed.includes(o.id)) this.questProgress();
    if (o?.type === "uniques") {
      const n = o.ids.filter((id) => d.quest.killed.includes(id)).length;
      if (n > d.quest.progress) {
        d.quest.progress = n - 1;
        this.questProgress();
      }
    }
  }

  private questTracker() {
    const d = this.data_;
    const q = d.currentQuest;
    if (!q) return null;
    if (d.quest.status === "available") return { title: L("Nova missão", "New quest"), goal: this.speakTo(q.giver), progress: "", ready: false, targets: this.objTargets() };
    if (d.quest.status === "ready") return { title: q.title, goal: this.speakTo(q.turnIn ?? q.giver), progress: "", ready: true, targets: this.objTargets() };
    const st = d.currentStep!;
    const steps = q.steps.length > 1 ? ` (${d.quest.step + 1}/${q.steps.length})` : "";
    return {
      title: q.title + steps,
      goal: st.area === this.area.id ? st.goal : `${st.goal} · ${AREAS[st.area].name}`,
      progress: `${Math.min(d.quest.progress, st.objective.count)}/${st.objective.count}`, ready: false, targets: this.objTargets(),
    };
  }

  /** The tracker's list: each objective with its distance in metres (one tile = one metre). */
  private objTargets() {
    return this.objPts.map((p) => ({ label: p.label, dist: Math.max(1, Math.round(p.dist / TILE)) }));
  }

  // ---------------------------------------------------------------- quest objects & step enemies

  /** Quest objects of the current collect step lying in this area: beams in the ruined huts, chests and a
   * cauldron in the enemy camps. Picked-up ones are counted by the step's progress. */
  private spawnQuestObjects() {
    this.cancelGather(false);
    for (const o of this.questObjs) { o.spr.destroy(); o.glow.destroy(); o.marker?.destroy(); }
    this.questObjs = [];
    const d = this.data_;
    const o = this.stepIs("collect");
    if (!o || this.dungeonRef || d.currentStep!.area !== this.area.id) return;
    const it = QUEST_ITEMS[o.item];
    const left = o.count - d.quest.progress;
    const rand = rng(this.mapSeed ^ 0x5eed);
    const spots: [number, number][] = [];
    // Authored areas say where each object lies (the collapsed huts, the named camps, the goblins' kitchen).
    const fixed = this.map.spots?.[o.item];
    const taken = d.quest.taken ?? [];
    if (fixed) spots.push(...fixed.filter(([x, y]) => !taken.includes(`${this.area.id}:${x},${y}`)));
    else if (it.where === "camps") {
      const camps = [...this.map.packs].sort((a, b) => b.level - a.level);
      for (const p of camps) spots.push([p.x, p.y]);
    } else {
      // Rubble beside the plaza's roads and along the open south trail (the other gates are still barred);
      // never right below a house, where its roof would hide it.
      const t = this.map.town;
      const cx = (t.x0 + t.x1) >> 1, cy = (t.y0 + t.y1) >> 1;
      const underHouse = (x: number, y: number) => this.map.props.some((p) => p.kind === "house" && x >= p.x - 1 && x <= p.x + 6 && y >= p.y - 6 && y <= p.y + 1);
      for (let i = 0; i < 60; i++) {
        const k = 4 + Math.floor(rand() * 6), side = rand() < 0.5 ? -1 : 1, off = rand() < 0.5 ? -3 : 3;
        const [x, y] = [[cx + side * k, cy + off], [cx + off, cy + side * k], [cx + off, t.y1 + 3 + Math.floor(rand() * 5)]][i % 3];
        if (!underHouse(x, y)) spots.push([x, y]);
      }
    }
    for (const [sx, sy] of spots) {
      if (this.questObjs.length >= left) break;
      const f = fixed ? [sx, sy] : this.grid.nearestFree(sx, sy, 3);
      if (!f || (!fixed && this.questObjs.some((q) => Math.hypot(q.tx - f[0], q.ty - f[1]) < 6))) continue;
      const x = f[0] * TILE + 8, y = f[1] * TILE + 12;
      let spr: Phaser.GameObjects.Image | KilnSprite;
      if (hasSprite(it.sprite)) {
        // A KilnSprite so the prop hover (outline glow, breath, name tag, hand cursor) picks it up.
        const k = new KilnSprite(this, x, y, it.sprite);
        k.play2("idle");
        k.setData("hover", { label: L(`${it.name} · clique para pegar`, `${it.name} · click to take`), box: { x: 14, top: -36, bottom: 4 }, glow: 0xffd23d, busy: [] });
        spr = k;
      } else spr = this.add.image(x, y, "chest").setOrigin(0.5, 1).setTint(it.tint);
      spr.setDepth(y);
      // A soft golden ring pulsing under it and a quest "!" bobbing above: it can be interacted with.
      const glow = this.add.image(x, y - 2, "ring").setTint(0xffe14d).setBlendMode(Phaser.BlendModes.ADD).setScale(0.36, 0.2).setAlpha(0.5).setDepth(y - 1);
      this.tweens.add({ targets: glow, alpha: 0.15, scaleX: 0.42, scaleY: 0.24, duration: 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      const my = y - (it.sprite === "oak_beam" ? 22 : 30);
      const marker = hasSprite("npc_marker")
        ? new KilnSprite(this, x, my, "npc_marker").setDepth(1e6)
        : this.add.text(x, my, "!", { fontFamily: "Silkscreen, monospace", fontSize: "14px", color: "#ffe14d", stroke: "#1c0f1a", strokeThickness: 3 }).setOrigin(0.5, 1).setDepth(1e6);
      if (marker instanceof KilnSprite) marker.play2("quest");
      this.tweens.add({ targets: marker, y: my - 3, duration: 600, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      this.questObjs.push({ item: o.item, spr, tx: f[0], ty: f[1], glow, key: `${this.area.id}:${sx},${sy}`, marker });
    }
  }

  /** Next to a quest object: the hero works on it (prying a beam, forcing a chest) with a progress bar. The hero
   * just stands facing it (attack clips look wrong here); the object shakes, dust flies and the ring brightens. */
  private startGather(qo: QuestObj) {
    if (this.gather?.obj === qo) return;
    this.cancelGather(false);
    const it = QUEST_ITEMS[qo.item];
    this.hero.face(qo.spr.x - this.hero.x, qo.spr.y - this.hero.y);
    this.hero.play2("idle");
    const el = document.createElement("div");
    el.className = "gather";
    el.innerHTML = `<div class="gather-label">${it.verb}</div><div class="gather-bar"><i></i></div>`;
    this.hud.world.appendChild(el);
    qo.marker?.setVisible(false);
    qo.glow.setAlpha(0.9);
    const beat = this.time.addEvent({
      delay: 420, loop: true, callback: () => {
        this.emitters.dust.explode(4, qo.spr.x + Phaser.Math.Between(-6, 6), qo.spr.y - 2);
        this.tweens.add({ targets: qo.spr, x: qo.tx * TILE + 8 + 1.2, duration: 45, yoyo: true, repeat: 1 });
        sfx.step(false);
      },
    });
    this.gather = { obj: qo, start: this.time.now, ms: it.ms, el, beat };
  }

  private cancelGather(interrupted: boolean) {
    const g = this.gather;
    if (!g) return;
    this.gather = null;
    g.beat.remove();
    g.el.remove();
    if (this.questObjs.includes(g.obj)) {
      g.obj.marker?.setVisible(true);
      g.obj.spr.x = g.obj.tx * TILE + 8;
    }
    if (interrupted) this.say(L("Interrompido!", "Interrupted!"), "#ff6a5a");
  }

  /** Called every frame while gathering: completes it, or stops when the hero moves away. */
  private updateGather(time: number) {
    const g = this.gather;
    if (!g) return;
    const moved = this.order !== null || this.heroBody.velocity.lengthSq() > 1;
    if (this.dead || moved || !this.questObjs.includes(g.obj)) return this.cancelGather(false);
    const k = Math.min(1, (time - g.start) / g.ms);
    (g.el.querySelector("i") as HTMLElement).style.width = `${Math.round(k * 100)}%`;
    g.obj.glow.setScale(0.36 + k * 0.14, 0.2 + k * 0.08);
    if (k >= 1) {
      this.cancelGather(false);
      this.pickQuestObject(g.obj);
    }
  }

  /** The quest object is in the bag: a flash, it pops up and flies into the hero (the cauldron stays and a
   * bar of soap jumps out of it instead), with the count floating above the hero. */
  private pickQuestObject(qo: QuestObj) {
    const it = QUEST_ITEMS[qo.item];
    this.questObjs = this.questObjs.filter((o) => o !== qo);
    qo.marker?.destroy();
    (this.data_.quest.taken ??= []).push(qo.key);
    const x = qo.spr.x, y = qo.spr.y;
    const flash = this.add.image(x, y - 8, "ring").setTint(0xffe68a).setBlendMode(Phaser.BlendModes.ADD).setScale(0.2).setDepth(y + 1);
    this.tweens.add({ targets: flash, scale: 1.1, alpha: 0, duration: 420, ease: "Cubic.easeOut", onComplete: () => flash.destroy() });
    this.tweens.add({ targets: qo.glow, alpha: 0, duration: 400, onComplete: () => qo.glow.destroy() });
    this.emitters.gold.explode(18, x, y - 8);
    const keep = "keep" in it && it.keep;
    if (keep && qo.spr instanceof KilnSprite) qo.spr.setData("hover", undefined);
    const flier = keep ? this.add.image(x, y - 14, "soap_bar").setDepth(y + 2) : qo.spr;
    if (keep) this.emitters.dust.explode(10, x, y - 14);
    // Up, a little hang in the air, then an arc into the hero shrinking away.
    const sx = flier.scaleX;
    this.tweens.chain({
      targets: flier,
      tweens: [
        { y: y - 26, scaleX: sx * 1.25, scaleY: sx * 1.25, duration: 260, ease: "Back.easeOut" },
        { y: y - 28, duration: 140 },
        {
          x: { getEnd: () => this.hero.x }, y: { getEnd: () => this.hero.y - 14 }, scaleX: sx * 0.2, scaleY: sx * 0.2, alpha: 0.4,
          duration: 320, ease: "Quad.easeIn", onUpdate: () => flier.setDepth(1e5),
        },
      ],
      onComplete: () => {
        flier.destroy();
        this.emitters.gold.explode(10, this.hero.x, this.hero.y - 14);
        const o = this.stepIs("collect");
        const n = Math.min(o ? o.count : 1, this.data_.quest.progress);
        this.floatAt(this.hero.x, this.hero.y - 30, o ? `${it.name} ${n}/${o.count}` : it.name, "quest");
      },
    });
    sfx.coin();
    this.hud.message(L(`Recolhido: ${it.name}`, `Picked up: ${it.name}`), "#ffe14d");
    this.questProgress();
  }

  /** Enemies a step brings into its area (scouts prowling outside the village's south fence). */
  private spawnStepFoes() {
    const d = this.data_;
    const st = d.currentStep;
    if (!st?.spawn || d.quest.status !== "active" || this.dungeonRef || this.isGuest || st.area !== this.area.id) return;
    const left = st.objective.count - d.quest.progress;
    const t = this.map.town;
    const cx = (t.x0 + t.x1) >> 1;
    const pack: Pack = { x: cx, y: t.y1 + 8, level: this.area.level, count: left, champion: false, faction: ENEMIES[st.spawn.type].faction as CampKind };
    for (let i = 0; i < left; i++) {
      const f = this.grid.nearestFree(cx - 10 + Math.floor((i / Math.max(1, left - 1)) * 20), t.y1 + 6 + (i % 3) * 2, 5);
      if (f) this.spawnEnemy(f[0] * TILE + 8, f[1] * TILE + 8, pack, st.spawn.type, i === left - 1 ? "champion" : "normal");
    }
  }

  // ---------------------------------------------------------------- the village changes with the story

  /** Minhau reflects the story flags: the forge smokes, Kira naps under the plaza tree, the three mutts
   * guard the gates, Lula sweeps the square. */
  private buildVillageState() {
    const d = this.data_;
    for (const o of this.villageFx) o.destroy();
    for (const o of this.decor) { this.tweens.killTweensOf(o.spr); o.spr.destroy(); o.tag?.remove(); }
    this.villageFx = [];
    this.decor = [];
    if (this.area.id !== "minhau" || this.dungeonRef) return;
    const spots = this.map.npcs;
    if (!spots) return;
    const at = (k: keyof typeof spots, dx: number, dy: number) => ({ x: (spots[k][0] + dx) * TILE + 8, y: (spots[k][1] + dy) * TILE + 10 });
    // Marta's smithy: its chimney beside it, both burning once the forge is lit.
    const smithyProp = this.map.props.find((p) => p.name === "smithy");
    if (smithyProp && hasSprite("smithy")) {
      const sx = smithyProp.x * TILE + 8 + (smithyProp.off?.[0] ?? 0), sy = smithyProp.y * TILE + TILE - 3;
      const lit = d.hasFlag("forge_lit");
      if (lit) {
        const forge = new KilnSprite(this, sx, sy, "smithy");
        forge.play2(forge.has("lit") ? "lit" : "idle");
        this.villageFx.push(forge.setDepth(sy - 1));
      }
      if (hasSprite("forge_chimney")) {
        const ch = new KilnSprite(this, sx + 40, sy - 16, "forge_chimney");
        ch.play2(lit && ch.has("lit") ? "lit" : "idle");
        this.villageFx.push(ch.setDepth(sy - 16));
      }
    }
    if (d.hasFlag("forge_lit") && !hasSprite("forge_chimney")) {
      // Clean smoke from the roof of the smithy (the authored smithy, or the house next to Marta).
      const m = at("shop", 0, 0);
      const smithy = this.map.props.find((p) => p.name === "smithy");
      const house = smithy ? { x: smithy.x * TILE + 8, y: smithy.y * TILE + TILE } : this.map.props.filter((p) => p.kind === "house")
        .map((p) => ({ x: (p.x + 2.5) * TILE, y: (p.y + 1) * TILE }))
        .sort((a, b) => Phaser.Math.Distance.Between(a.x, a.y, m.x, m.y) - Phaser.Math.Distance.Between(b.x, b.y, m.x, m.y))[0];
      if (house) this.villageFx.push(this.time.addEvent({ delay: 420, loop: true, callback: () => {
        const puff = this.add.image(house.x + (Math.random() - 0.5) * 4, house.y - 80, "disc")
          .setTint(Math.random() < 0.5 ? 0xc8c4c0 : 0x9a9490).setAlpha(0.95).setScale(0.18).setDepth(1e6 - 2);
        this.tweens.add({ targets: puff, y: puff.y - 34, x: puff.x + 10 + Math.random() * 8, scale: 0.45, alpha: 0, duration: 2600,
          ease: "Sine.easeOut", onComplete: () => puff.destroy() });
      } }));
    }
    const pet = (name: SpriteName, p: { x: number; y: number }, tint: number | null, scale: number, lines: string[], label: string,
      opts: { title?: string; wander?: number; speed?: number; rests?: string[]; walk?: string; dust?: boolean } = {}) => {
      const spr = new KilnSprite(this, p.x, p.y, name);
      if (tint !== null && !hasSprite(name)) spr.setTint(tint);
      spr.setScale(hasSprite(name) ? 1 : scale);
      spr.play2("idle");
      spr.face(0, 1);
      spr.setDepth(spr.y);
      let tag: HTMLDivElement | undefined;
      if (opts.title) {
        tag = document.createElement("div");
        tag.className = "npc-tag";
        tag.innerHTML = `<div class="nname">${label}</div><div class="ntitle">${opts.title}</div>`;
        this.hud.world.appendChild(tag);
      }
      const wander = opts.wander
        ? { home: { x: p.x, y: p.y }, r: opts.wander, speed: opts.speed ?? 40, rests: opts.rests ?? ["idle"], at: this.time.now + 800 + Math.random() * 3000, walking: false,
          walk: opts.walk ?? "walk", dust: opts.dust, dustAt: 0 }
        : undefined;
      this.decor.push({ spr, lines, label, tag, wander });
    };
    if (d.hasFlag("kira_home")) {
      const p = at("leader", -6, 6);
      pet("kira", p, 0xffffff, 1.3, [L("Lady Kira boceja, pisca três vezes e volta a olhar uma joaninha.", "Lady Kira yawns, blinks three times and goes back to watching a ladybug.")], "Lady Kira",
        { title: L("Guardiã da Corte", "Court Guardian"), wander: 6, speed: 30, rests: ["idle", "tilt", "sit", "lie"] });
      // She naps where the flowers grow.
      const kira = this.decor[this.decor.length - 1].spr;
      if (kira.has("nap")) kira.play2("nap");
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        this.villageFx.push(this.add.image(p.x + Math.cos(a) * (12 + (i % 3) * 5), p.y + Math.sin(a) * 7, "crops", 100).setOrigin(0.5, 1).setTint(0xffffff).setDepth(p.y - 2));
      }
    }
    if (d.hasFlag("dogs_home")) {
      const t = this.map.town;
      const cx = (t.x0 + t.x1) >> 1;
      const dogs: [SpriteName, number, string][] = [["dog_caramelo", 0xe0a050, "Caramelo"], ["dog_trovao", 0x8a8aa8, "Trovão"], ["dog_mancha", 0xd8d0c8, "Mancha"]];
      dogs.forEach(([name, tint, label], i) => pet(name, { x: (cx - 3 + i * 3) * TILE + 8, y: (t.y1 - 2) * TILE }, tint, 1.1,
        [L(`${label} abana o rabo e volta a vigiar o portão.`, `${label} wags its tail and goes back to guarding the gate.`)], label,
        { title: L("Vigia do Portão", "Gate Watchdog"), wander: 8, speed: 46, rests: ["idle", "sit", "bark", "idle"] }));
      for (const o of this.decor.slice(-3)) if (o.spr.has("sit")) o.spr.play2("sit");
    }
    if (d.hasFlag("polvo_broom")) {
      // His own model sweeps with the broom clips; the older stand-in is a tinted bandit.
      const own = hasSprite("polvo");
      // He sweeps his way around the square: pushes the broom to a dirty spot, sweeps it, moves on.
      pet(own ? "polvo" : "polvo_broom", at("leader", 3, 3), 0xff9a3a, 1, [
        L("\"Isso é perseguição política! ...Tá, tá, já vou varrer.\"", "\"This is political persecution! ...Fine, fine, I'm sweeping.\""),
      ], L("Lula", "Lula"), { title: L("O Reciclador", "The Recycler"), wander: 7, speed: 22, dust: true,
        walk: own ? "broom_walk" : "walk", rests: [own ? "broom_idle" : "idle"] });
      const sweeper = this.decor[this.decor.length - 1].spr;
      if (own && sweeper.has("broom_idle")) sweeper.play2("broom_idle");
    }
  }

  // ---------------------------------------------------------------- Act I: the village gates

  /** The village exits stay closed until the scouts at the fence are dealt with (the first quest is done). */
  private get gatesLocked() {
    return this.map.gates.length > 0 && !this.isGuest && this.data_.quest.index === 0;
  }

  /** Exit gates of the village: closed (and solid) until the first quest is done. */
  private buildGates(locked: boolean) {
    if (!this.map.gates.length) return;
    if (locked)
      for (const g of this.map.gates) {
        this.grid.blocked[g.y * MAP_W + g.x] = true;
        this.collision.putTileAt(0, g.x, g.y);
      }
    if (hasSprite("village_gate")) {
      // One gate per gap, pivot on the middle tile; leaves swing outwards (s = north, e = west, w = east).
      for (const [x, y, fx, fy] of this.gateExits()) {
        const spr = new KilnSprite(this, x * TILE + 8, y * TILE + TILE - 3, "village_gate");
        spr.face(fx, fy);
        spr.play2(locked ? "closed" : "opened");
        this.villageGates.push(spr.setDepth(y * TILE + TILE - 5));
      }
      return;
    }
    if (!locked) return;
    for (const g of this.map.gates) {
      const px = g.x * TILE + 8, py = g.y * TILE + TILE;
      const img = hasSprite(g.kind) ? kilnImage(this, px, py - 3, g.kind) : this.add.image(px, py, "fence", g.kind === "fence_h" ? "h" : "v").setOrigin(0.5, 1);
      this.gateObjs.push(img.setDepth(py - 2).setTint(0xd8b890));
    }
  }

  /** Middle tile of the north, west and east gaps, with the direction each gate faces. */
  private gateExits(): [number, number, number, number][] {
    if (this.map.gateSpots) return this.map.gateSpots;
    const t = this.map.town;
    const cx = (t.x0 + t.x1) >> 1, cy = (t.y0 + t.y1) >> 1;
    return [[cx, t.y0, 0, 1], [t.x0, cy, 1, 0], [t.x1, cy, -1, 0]];
  }

  private openGates() {
    for (const g of this.map.gates) {
      this.grid.blocked[g.y * MAP_W + g.x] = false;
      this.collision.removeTileAt(g.x, g.y);
    }
    for (const spr of this.villageGates) {
      spr.play2("open", {
        restart: true,
        onEvent: (ev) => ev === "unbar" && this.emitters.dust.explode(6, spr.x, spr.y - 6),
        onComplete: () => spr.play2("opened"),
      });
    }
    for (const img of this.gateObjs) {
      this.emitters.dust.explode(6, img.x, img.y - 4);
      this.tweens.add({ targets: img, alpha: 0, y: img.y + 4, duration: 400, onComplete: () => img.destroy() });
    }
    this.gateObjs = [];
    this.hud.banner(L("Os portões foram abertos!", "The gates are open!"), L("Explore a floresta e cumpra as missões.", "Explore the forest and complete your quests."));
  }

  /** Bumping into a closed exit explains why it is closed. */
  private gateHint(time: number) {
    if (!this.gatesLocked || time < this.gateHintAt) return;
    const near = this.map.gates.some((g) => Phaser.Math.Distance.Between(g.x * TILE + 8, g.y * TILE + 8, this.hero.x, this.hero.y) < 20);
    if (!near) return;
    this.gateHintAt = time + 4000;
    this.say(L("Os portões estão fechados enquanto os goblins rondam a cerca. Ajude o Rei Aldo.", "The gates stay shut while goblins prowl the fence. Help King Aldo."), "#ffe14d");
  }

  // ---------------------------------------------------------------- Act I: Lula's customs house

  /** The arena is barred until its quest is taken (King Aldo sends the hero after Lula). */
  private get arenaLocked() {
    const a = this.map.arena;
    if (!a || this.dungeonRef || this.isGuest) return false;
    const qi = QUESTS.findIndex((q) => q.id === a.quest);
    const q = this.data_.quest;
    return q.index < qi || (q.index === qi && q.status === "available");
  }

  /** The barricade stays up (and solid) until the hero breaks it in Lula's introduction. */
  private get arenaClosed() {
    const a = this.map.arena;
    if (!a || this.dungeonRef) return false;
    const qi = QUESTS.findIndex((q) => q.id === a.quest);
    return this.arenaLocked || (this.data_.quest.index === qi && !this.data_.hasFlag("polvo_met"));
  }

  private buildArenaGate() {
    const a = this.map.arena;
    if (!a) return;
    const closed = this.arenaClosed;
    const x = a.gate.x * TILE + 8, y = a.gate.y * TILE + TILE - 2;
    if (closed)
      for (const t of a.gateTiles) {
        this.grid.blocked[t.y * MAP_W + t.x] = true;
        this.collision.putTileAt(0, t.x, t.y);
      }
    if (hasSprite("customs_gate")) {
      const g = new KilnSprite(this, x, y, "customs_gate");
      g.play2(closed ? "idle" : g.has("opened") ? "opened" : "idle");
      if (!closed && !g.has("opened")) g.setVisible(false);
      g.setDepth(y);
      if (closed) this.arenaGate = g;
      else this.blockGateWreck();
      return;
    }
    if (!closed) return;
    // Stand-in: rotten barricades across the gap.
    this.arenaGate = a.gateTiles.filter((_, i) => i % 2 === 0).map((t) =>
      (hasSprite("rotten_barricade") ? kilnImage(this, t.x * TILE + 8, t.y * TILE + TILE - 2, "rotten_barricade") : this.add.image(t.x * TILE + 8, t.y * TILE + TILE, "fence", "h").setOrigin(0.5, 1))
        .setDepth(t.y * TILE + TILE - 2));
  }

  /** Breaks the barricade: the gap opens for good. */
  private breakArenaGate() {
    const a = this.map.arena!;
    for (const t of a.gateTiles) {
      this.grid.blocked[t.y * MAP_W + t.x] = false;
      this.collision.removeTileAt(t.x, t.y);
    }
    const g = this.arenaGate;
    this.arenaGate = null;
    if (g instanceof KilnSprite && g.has("opened")) this.blockGateWreck();
    const x = a.gate.x * TILE + 8, y = a.gate.y * TILE + 8;
    this.emitters.dust.explode(24, x, y);
    sfx.hit(true);
    if (g instanceof KilnSprite) {
      if (g.has("open")) g.play2("open", { restart: true, onComplete: () => g.has("opened") && g.play2("opened") });
      else this.tweens.add({ targets: g, alpha: 0, duration: 400, onComplete: () => g.destroy() });
    } else if (g)
      for (const img of g) this.tweens.add({ targets: img, alpha: 0, y: img.y + 6, angle: Phaser.Math.Between(-30, 30), duration: 450, onComplete: () => img.destroy() });
  }

  /** The broken barricade's carts and raised bar still fill the gap's sides: only its middle two tiles pass. */
  private blockGateWreck() {
    const a = this.map.arena!;
    const mid = a.gateTiles.indexOf(a.gate);
    a.gateTiles.forEach((t, i) => {
      const off = i - mid;
      if (off === 0 || off === 1) return;
      this.grid.blocked[t.y * MAP_W + t.x] = true;
      this.collision.putTileAt(0, t.x, t.y);
    });
  }

  /** Bumping into the barricade explains it; walking up to it with the quest taken plays Lula's entrance. */
  private updateArena(time: number) {
    const a = this.map.arena;
    if (!a || !this.arenaGate || this.cinematic || this.dead) return;
    const near = Phaser.Math.Distance.Between(a.gate.x * TILE + 8, a.gate.y * TILE + 8, this.hero.x, this.hero.y) < (this.arenaLocked ? 34 : 46);
    if (!near) return;
    if (this.arenaLocked) {
      if (time < this.gateHintAt) return;
      this.gateHintAt = time + 4000;
      this.say(L("A barricada da Alfândega Real está trancada. Os capangas do Lula não deixam ninguém passar... ainda.", "The Royal Customs House barricade is shut. Lula's thugs let no one through... yet."), "#ffe14d");
      return;
    }
    if (this.arenaClosed) void this.polvoIntro();
  }

  /** Lula's entrance: the hero smashes the barricade, the camera finds the demagogue on his podium of carts
   * making a speech to his men, and he jumps down to fight. */
  private async polvoIntro() {
    const a = this.map.arena!;
    const ui0 = document.getElementById("ui")!;
    this.cinematic = true;
    this.busy = true;
    this.order = null;
    this.path = [];
    this.cancelGather(false);
    this.heroBody.setVelocity(0, 0);
    this.hero.play2("idle");
    const cam = this.cameras.main;
    const setSpeed = (f: number) => { this.time.timeScale = f; this.tweens.timeScale = f; };
    let finished = false;
    const ui = new CinematicUi(() => finish(), { onSpeed: setSpeed });
    const dir = new Director(this, ui);
    ui0.classList.add("cinematic");
    const name = L("Lula", "Lula");
    const polvo = this.enemies.find((e) => e.unique === "polvo" && e.state !== "dead");
    const inside = (e: Enemy) => e.spr.x >= a.x0 * TILE && e.spr.x <= (a.x1 + 1) * TILE && e.spr.y >= a.y0 * TILE && e.spr.y <= (a.y1 + 1) * TILE;
    const men = this.enemies.filter((e) => e.state !== "dead" && e !== polvo && inside(e));
    const sx = a.stage.x * TILE + 8, sy = a.stage.y * TILE + 10;
    const gx = a.gate.x * TILE + 8, gy = a.gate.y * TILE + 8;
    const finish = () => {
      if (finished) return;
      finished = true;
      dir.ended = true;
      setSpeed(1);
      ui.close();
      ui0.classList.remove("cinematic");
      if (this.arenaGate) this.breakArenaGate();
      if (polvo && polvo.state !== "dead") {
        polvo.spr.play2("idle");
        polvo.spr.setPosition(sx, sy + 26);
        polvo.body.reset(sx, sy + 26);
      }
      for (const e of [polvo, ...men]) if (e && e.state !== "dead") e.aggro = true;
      cam.pan(this.hero.x, this.hero.y, 400, "Sine.easeInOut", true);
      this.time.delayedCall(420, () => cam.startFollow(this.hero, true, 0.2, 0.2));
      this.busy = false;
      this.cinematic = false;
      this.data_.quest.flags.push("polvo_met");
      this.data_.save();
      this.hud.banner(UNIQUES.polvo.name, L("O falso presidente da Alfândega Real", "The false president of the Royal Customs House"));
    };
    // Lula up on his podium, his men turned to the barricade.
    if (polvo) {
      polvo.spr.setPosition(sx, sy);
      polvo.body.reset(sx, sy);
      polvo.spr.face(0, 1);
      polvo.spr.setDepth(sy + 30);
    }
    for (const e of men) e.spr.face(gx - e.spr.x, gy - e.spr.y);
    cam.stopFollow();
    this.hero.face(gx - this.hero.x, gy - this.hero.y);
    await dir.wait(400);
    if (dir.ended) return;
    await dir.anim(this.hero, "attack", 0.8);
    if (dir.ended) return;
    this.breakArenaGate();
    cam.shake(180, 0.004);
    await dir.wait(500);
    if (dir.ended) return;
    await dir.pan(sx, sy + 12, 1500);
    if (dir.ended) return;
    if (polvo?.spr.has("speech")) polvo.spr.play2("speech");
    const lines: [string, string][] = [
      [L("Companheiros e companheiras! Olhem só quem arrombou a minha barricada...", "Comrades! Look who just broke down my barricade..."), "polvo_1"],
      [L("O cachorrinho do rei careca! Veio cobrar imposto de quem cobra imposto?", "The bald king's lapdog! Come to tax the taxman?"), "polvo_2"],
      [L("Nunca antes na história deste reino um pedágio foi tão justo. Aqui quem manda é o povo...", "Never before in this kingdom's history has a toll been so fair. Here, the people rule..."), "polvo_3"],
      [L("...e o povo sou eu! Rapaziada, taxem esse aí!", "...and the people is me! Boys, tax that one!"), "polvo_4"],
    ];
    for (const [text, key] of lines) {
      await dir.line(key, name, text, 2400);
      if (dir.ended) return;
    }
    ui.hideText();
    // He jumps down from the carts.
    if (polvo && polvo.state !== "dead") {
      polvo.spr.play2(polvo.spr.has("walk") ? "walk" : "idle");
      await new Promise<void>((r) => this.tweens.chain({
        targets: polvo.spr,
        tweens: [
          { y: sy - 10, duration: 220, ease: "Quad.easeOut" },
          { y: sy + 26, duration: 300, ease: "Quad.easeIn" },
        ],
        onComplete: () => r(),
      }));
      if (dir.ended) return;
      polvo.body.reset(sx, sy + 26);
      this.emitters.dust.explode(14, sx, sy + 26);
      cam.shake(160, 0.004);
      sfx.hit(true);
      polvo.spr.play2("idle");
    }
    await dir.wait(500);
    finish();
  }

  /** A letterboxed cutscene in the world: the hero and the monsters freeze, holding Space speeds it up and
   * skipping ends it at once. `body` checks `dir.ended` after each await; `done` sets the final state either way. */
  private cutscene(body: (dir: Director) => Promise<void>, done: () => void) {
    // One at a time (two mutts can fall to the same blow): the next waits for the last to end.
    const run = this.cineQueue.then(() => (this.scene.isActive() ? this.playCutscene(body, done) : undefined));
    this.cineQueue = run.catch(() => undefined);
    return run;
  }

  private async playCutscene(body: (dir: Director) => Promise<void>, done: () => void) {
    const ui0 = document.getElementById("ui")!;
    this.cinematic = true;
    this.busy = true;
    this.order = null;
    this.path = [];
    this.cancelGather(false);
    this.heroBody.setVelocity(0, 0);
    this.hero.play2("idle");
    const cam = this.cameras.main;
    const setSpeed = (f: number) => { this.time.timeScale = f; this.tweens.timeScale = f; };
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      dir.ended = true;
      setSpeed(1);
      ui.close();
      ui0.classList.remove("cinematic");
      done();
      cam.pan(this.hero.x, this.hero.y, 400, "Sine.easeInOut", true);
      this.time.delayedCall(420, () => cam.startFollow(this.hero, true, 0.2, 0.2));
      this.busy = false;
      this.cinematic = false;
    };
    const ui = new CinematicUi(() => finish(), { onSpeed: setSpeed });
    const dir = new Director(this, ui);
    ui0.classList.add("cinematic");
    cam.stopFollow();
    try {
      await body(dir);
    } finally {
      finish(); // even if a step throws, the game never stays stuck in a cutscene
    }
  }

  /** Lula beaten: he begs and haggles, his men run off, and the king's sentence finds him: a broom. He sweeps
   * his way out of his own customs house (to the village square, where he is found later). */
  private async lulaDefeat(e: Enemy) {
    const name = L("Lula", "Lula");
    const spr = e.spr;
    const x = spr.x, y = spr.y;
    const men = this.enemies.filter((m) => m !== e && m.state !== "dead" && Phaser.Math.Distance.Between(m.spr.x, m.spr.y, x, y) < 260);
    const a = this.map.arena;
    const out = a ? { x: a.gate.x * TILE + 8, y: (a.gate.y + 3) * TILE } : { x: x, y: y + 160 };
    const flee = (m: Enemy) => {
      if (m.state === "dead") return;
      m.state = "dead";
      m.body.enable = false;
      const ang = Math.atan2(m.spr.y - this.hero.y, m.spr.x - this.hero.x);
      m.spr.face(Math.cos(ang), Math.sin(ang));
      m.spr.play2(m.spr.has("walk") ? "walk" : "idle", { timeScale: 1.6 });
      this.tweens.add({ targets: m.spr, x: m.spr.x + Math.cos(ang) * 140, y: m.spr.y + Math.sin(ang) * 140, alpha: 0, duration: 1400, onComplete: () => this.removeCorpse(m) });
    };
    const leave = () => { if (spr.active) this.removeCorpse(e); };
    await this.cutscene(async (dir) => {
      spr.face(this.hero.x - x, this.hero.y - y);
      this.hero.face(x - this.hero.x, y - this.hero.y);
      spr.play2(spr.has("hit") ? "hit" : "idle");
      this.slowmo(600, 0.3);
      await dir.pan(x, y - 10, 700);
      if (dir.ended) return;
      if (spr.has("speech")) spr.play2("speech");
      await dir.line("lula_beg_1", name, L("Pera, pera, companheiro! Não precisa disso... vamos sentar e negociar.", "Wait, wait, comrade! No need for that... let's sit down and negotiate."), 2600);
      if (dir.ended) return;
      await dir.line("lula_beg_2", name, L("Meio a meio no pedágio! Tá bom: setenta, trinta. Noventa, dez!", "Half the toll! Fine: seventy, thirty. Ninety, ten!"), 2600);
      if (dir.ended) return;
      for (const m of men) flee(m);
      await dir.line("lula_beg_3", name, L("Rapaziada? ...Rapaziada! Voltem aqui, eu sou o presidente!", "Boys? ...Boys! Come back, I'm the president!"), 2400);
      if (dir.ended) return;
      await dir.say("lula_sentence", L("O Rei Aldo não quer mártires. Quer o chão da praça limpo.", "King Aldo wants no martyrs. He wants the square's floor clean."), 2600);
      if (dir.ended) return;
      // The broom drops in front of him: from now on it is his sceptre.
      this.ringFx(x, y, 26, 0xffd23d, 500);
      this.emitters.gold.explode(14, x, y - 10);
      sfx.quest();
      spr.play2(spr.has("broom_idle") ? "broom_idle" : "idle");
      await dir.line("lula_broom", name, L("Uma vassoura?! Eu, varrendo chão?! ...Isso é golpe! É golpe!", "A broom?! Me, sweeping floors?! ...This is a coup! A coup!"), 2800);
      if (dir.ended) return;
      dir.ui.hideText();
      await dir.walk(spr, [out], 50, spr.has("broom_walk") ? "broom_walk" : "walk");
      if (dir.ended) return;
      await new Promise<void>((r) => this.tweens.add({ targets: spr, alpha: 0, duration: 500, onComplete: () => r() }));
    }, () => {
      for (const m of men) flee(m);
      leave();
      this.hud.banner(L("Lula foi deposto!", "Lula has been deposed!"), L("Volte ao Rei Aldo", "Return to King Aldo"));
      this.questKill(e);
      this.data_.save();
    });
  }

  /** The village animals stroll around: a walk to a free spot near home, then a rest (sit, nap, bark...). */
  private updateDecor(time: number) {
    if (this.cinematic) return;
    const t = this.map.town;
    for (const o of this.decor) {
      const w = o.wander;
      if (!w) continue;
      const s = o.spr;
      // Dust kicked up by the broom, in front of his feet, whether he walks or stands sweeping.
      if (w.dust && time > w.dustAt && s.current.startsWith("broom")) {
        w.dustAt = time + 260 + Math.random() * 260;
        const v = s.dir.includes("e") ? 6 : s.dir.includes("w") ? -6 : 0;
        this.emitters.dust.explode(2, s.x + v, s.y + 2);
      }
      if (w.walking || time < w.at) continue;
      const tx = Phaser.Math.Clamp(Math.round(w.home.x / TILE + (Math.random() * 2 - 1) * w.r), t.x0 + 1, t.x1 - 1);
      const ty = Phaser.Math.Clamp(Math.round(w.home.y / TILE + (Math.random() * 2 - 1) * w.r * 0.7), t.y0 + 1, t.y1 - 1);
      const sx = Math.floor(s.x / TILE), sy = Math.floor(s.y / TILE);
      if (!this.grid.free(tx, ty) || !this.grid.lineFree(sx, sy, tx, ty)) { w.at = time + 500; continue; }
      const x = tx * TILE + 8, y = ty * TILE + 10;
      const dist = Phaser.Math.Distance.Between(s.x, s.y, x, y);
      if (dist < 12) { w.at = time + 1000; continue; }
      w.walking = true;
      s.face(x - s.x, y - s.y);
      s.play2(s.has(w.walk) ? w.walk : "walk");
      this.tweens.add({
        targets: s, x, y, duration: (dist / w.speed) * 1000,
        onUpdate: () => s.setDepth(s.y),
        onComplete: () => {
          w.walking = false;
          w.at = this.time.now + 2500 + Math.random() * 5000;
          const rest = w.rests[Math.floor(Math.random() * w.rests.length)];
          if (!s.has(rest)) return s.play2("idle");
          // Lying down ends in the nap loop and a bark goes back to idle; a sit or a head tilt holds its last frame.
          const next = rest === "lie" && s.has("nap") ? "nap" : rest === "bark" ? "idle" : null;
          s.play2(rest, { restart: true, onComplete: next ? () => s.active && s.play2(next) : undefined });
          if (rest === "lie") w.at += 4000;
        },
      });
    }
  }

  /** Lady Kira sits in her rocky clearing of the Wolf Wood while the hero comes to her rescue, watching a
   * ladybug as the pack closes in; once the pack is dead she trots off home (to the village square). */
  private storyActors() {
    const d = this.data_;
    const want = this.area.id === "wolf_wood" && !this.dungeonRef && d.currentQuest?.id === "kira" && d.quest.status === "active";
    const k = this.kiraSpr;
    if (want === !!k) return;
    if (k) {
      this.kiraSpr = undefined;
      this.decor = this.decor.filter((o) => o.spr !== k);
      k.face(1, 1);
      k.play2(k.has("run") ? "run" : "walk");
      this.tweens.add({ targets: k, x: k.x + 120, y: k.y + 120, alpha: 0, duration: 1600, onComplete: () => k.destroy() });
      return;
    }
    const spr = new KilnSprite(this, 34 * TILE + 8, 38 * TILE + 8, "kira");
    if (!hasSprite("kira")) spr.setTint(0xffffff).setScale(1.3);
    spr.face(1, 1);
    spr.play2(spr.has("tilt") ? "tilt" : "idle");
    spr.setDepth(spr.y);
    this.kiraSpr = spr;
    this.decor.push({ spr, label: "Lady Kira", lines: [L("Lady Kira observa uma joaninha, alheia aos lobos que a cercam.", "Lady Kira watches a ladybug, oblivious to the wolves around her.")] });
  }

  // ---------------------------------------------------------------- Act I: the three mutts' stone circle

  private static readonly DOGS: Record<string, { normal: SpriteName; line: [string, string] }> = {
    caramelo: { normal: "dog_caramelo", line: [L("Caramelo sacode a peste do pelo. O rabo volta a abanar.", "Caramelo shakes the plague out of his fur. His tail wags again."), "dog_caramelo_free"] },
    trovao: { normal: "dog_trovao", line: [L("Trovão pisca, confuso... e solta um uivo de alegria.", "Trovão blinks, confused... and lets out a howl of joy."), "dog_trovao_free"] },
    mancha: { normal: "dog_mancha", line: [L("Mancha larga o osso podre e lambe a sua mão.", "Mancha drops the rotten bone and licks your hand."), "dog_mancha_free"] },
  };

  /** A lair's bosses sleep until the hero walks into the ring (their entrance plays then). */
  private lairAsleep(e: Enemy) {
    return !!e.pack?.quest && !this.data_.hasFlag("dogs_met");
  }

  /** Walking into the stone circle with the quest on plays the mutts' entrance (once). */
  private updateLair() {
    const l = this.map.lair, d = this.data_;
    if (!l || this.cinematic || this.dead || this.dungeonRef || d.hasFlag("dogs_met")) return;
    if (d.currentQuest?.id !== l.quest || d.quest.status !== "active") return;
    if (Math.hypot(this.hero.x / TILE - l.x, this.hero.y / TILE - l.y) > l.r + 1.5) return;
    void this.dogsIntro();
  }

  /** The mutts' entrance: the stench of the dumped scraps, then each corrupted dog rears and howls in turn. */
  private async dogsIntro() {
    const l = this.map.lair!;
    const dogs = (["caramelo", "trovao", "mancha"] as const)
      .map((id) => this.enemies.find((e) => e.unique === id && e.state !== "dead"))
      .filter((e): e is Enemy => !!e);
    const cx = l.x * TILE + 8, cy = l.y * TILE + 8;
    const intro: Record<string, [string, string]> = {
      caramelo: [L("Caramelo, o mais rápido dos celeiros. Agora só pele, ossos e espinhos.", "Caramelo, fastest of the barns. Now just skin, bones and spikes."), "dogs_caramelo"],
      trovao: [L("Trovão. O uivo dele espantava lobos; agora chama a peste.", "Trovão. His howl used to scare off wolves; now it calls the plague."), "dogs_trovao"],
      mancha: [L("Mancha nunca soltava um osso. Agora não solta mais nada.", "Mancha never let go of a bone. Now he lets go of nothing."), "dogs_mancha"],
    };
    await this.cutscene(async (dir) => {
      this.hero.face(cx - this.hero.x, cy - this.hero.y);
      await dir.pan(cx, cy, 1400);
      if (dir.ended) return;
      await dir.say("dogs_stench", L("O fedor de carne podre... os restos que os capangas do Lula despejaram no Cruzamento.", "The stench of rotten meat... the scraps Lula's thugs dumped at the Crossing."), 2800);
      if (dir.ended) return;
      for (const dog of dogs) {
        await dir.pan(dog.spr.x, dog.spr.y - 8, 700);
        if (dir.ended) return;
        dog.spr.face(this.hero.x - dog.spr.x, this.hero.y - dog.spr.y);
        sfx.monster("howl", 0.8);
        this.ringFx(dog.spr.x, dog.spr.y, 34, 0x8aff5a, 700);
        this.cameras.main.shake(220, 0.003);
        const howl = dir.anim(dog.spr, dog.spr.has("howl") ? "howl" : "attack");
        const [text, key] = intro[dog.unique!];
        await Promise.all([howl, dir.say(key, text, 2400)]);
        if (dir.ended) return;
        dog.spr.play2("idle");
      }
      await dir.say("dogs_medal", L("Derrube-os sem matá-los. O medalhão do Rei cuida do resto.", "Bring them down without killing them. The King's medallion will do the rest."), 2600);
    }, () => {
      const d = this.data_;
      if (!d.hasFlag("dogs_met")) d.quest.flags.push("dogs_met");
      for (const dog of dogs) if (dog.state !== "dead") { dog.aggro = true; dog.spr.play2("idle"); }
      setMusic("boss");
      this.hud.banner(L("Os Três Vira-Latas", "The Three Mutts"), L("Caramelo, Trovão e Mancha, corrompidos pela peste", "Caramelo, Trovão and Mancha, corrupted by the plague"));
      d.save();
    });
  }

  /** A mutt beaten: it collapses, the plague leaves it in a green burst, and it gets up as the old barn dog,
   * shakes itself off and runs home to the village gates. */
  private async purifyDog(e: Enemy) {
    const info = GameScene.DOGS[e.unique!];
    const spr = e.spr;
    const x = spr.x, y = spr.y;
    let freed = false;
    const free = () => {
      if (freed || !spr.active) return;
      freed = true;
      spr.setSprite(info.normal);
      spr.clearTint();
      spr.setScale(hasSprite(info.normal) ? 1 : 1.1);
      if (!hasSprite(info.normal)) spr.setTint((UNIQUES[e.unique!] as UniqueDef).tint ?? 0xffffff);
      spr.play2("idle");
    };
    const runHome = () => {
      if (!spr.active) return;
      const l = this.map.lair;
      const to = l ? { x: l.mouth.x * TILE + 8, y: (l.mouth.y + 6) * TILE } : { x, y: y + 200 };
      spr.face(to.x - spr.x, to.y - spr.y);
      spr.play2(spr.has("run") ? "run" : "walk");
      this.tweens.add({
        targets: spr, x: to.x, y: to.y, duration: (Phaser.Math.Distance.Between(spr.x, spr.y, to.x, to.y) / 110) * 1000,
        onUpdate: () => spr.setDepth(spr.y),
        onComplete: () => this.tweens.add({ targets: spr, alpha: 0, duration: 400, onComplete: () => this.removeCorpse(e) }),
      });
    };
    await this.cutscene(async (dir) => {
      this.slowmo(500, 0.3);
      await dir.pan(x, y - 6, 600);
      if (dir.ended) return;
      await dir.anim(spr, "death");
      if (dir.ended) return;
      // The plague bursts out of it.
      sfx.monster("poison", 0.8);
      this.ringFx(x, y, 40, 0x8aff5a, 900);
      this.discFx(x, y, 30, 0x5aff3a, 900);
      this.emitters.dust.explode(18, x, y);
      spr.setTintFill(0xd8ffd0);
      await dir.wait(260);
      if (dir.ended) return;
      free();
      await dir.wait(200);
      if (dir.ended) return;
      await dir.anim(spr, "shake");
      if (dir.ended) return;
      spr.face(this.hero.x - x, this.hero.y - y);
      cine.play("bark", 0.7);
      const bark = dir.anim(spr, "bark");
      await Promise.all([bark, dir.say(info.line[1], info.line[0], 2600)]);
    }, () => {
      free();
      runHome();
      this.questKill(e);
      const left = (["caramelo", "trovao", "mancha"] as const).filter((id) => !this.data_.quest.killed.includes(id)).length;
      this.hud.banner(L(`${e.name.split(",")[0]} foi purificado!`, `${e.name.split(",")[0]} has been purified!`),
        left ? L(`Faltam ${left}`, `${left} to go`) : L("Volte ao Caçador Ivo", "Return to Hunter Ivo"));
      if (!left) setMusic(this.areaMusic());
      this.data_.save();
    });
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
    const shop = npc.role === "shop" ? [{ label: L("Ver mercadorias", "Browse wares"), action: () => { done(); this.hud.openShop(d.shop, this.rerollCost()); } }] : [];
    const st = d.quest.status;
    if (q && (st === "ready" ? (q.turnIn ?? q.giver) === n.id : q.giver === n.id)) {
      if (st === "available") {
        this.hud.dialog(npc.name, pic, q.intro, [{ label: L(`Aceitar: ${q.title}`, `Accept: ${q.title}`), action: () => { this.acceptQuest(); done(); } }, ...shop], done);
      } else if (st === "active") {
        const step = d.currentStep!;
        this.hud.dialog(npc.name, pic, [`${step.goal}: ${d.quest.progress}/${step.objective.count}. ${npc.idle[0]}`], shop, done);
      } else {
        this.hud.dialog(npc.name, pic, q.done, [{ label: L("Receber recompensa", "Claim reward"), action: () => { this.completeQuest(); done(); } }], done);
      }
      return;
    }
    if (shop.length) {
      const cold = npc.act === "forest" && !d.hasFlag("forge_lit");
      this.hud.dialog(npc.name, pic, [cold
        ? L("Sem minhas ferramentas a forja não acende. Por enquanto só tenho couro e trapo para vender.", "Without my tools the forge won't light. For now I only have leather and rags to sell.")
        : L("Precisa de aço novo? Tenho o melhor da região. Também compro o que você achar por aí.", "Need fresh steel? I forge the finest in the region. I'll also buy whatever you find out there.")], shop, done);
      return;
    }
    if (!q && npc.role === "leader") {
      this.hud.dialog(npc.name, pic, EPILOGUE, [], done);
      return;
    }
    const who = q ? NPCS[d.quest.status === "ready" ? q.turnIn ?? q.giver : q.giver] : null;
    const hint = who ? L(` (${who.name} precisa de você.)`, ` (${who.name} needs you.)`) : "";
    this.hud.dialog(npc.name, pic, [npc.idle[Math.floor(Math.random() * npc.idle.length)] + hint], [], done);
  }

  private acceptQuest() {
    const d = this.data_;
    const q = d.currentQuest!;
    d.quest.status = "active";
    d.quest.step = 0;
    d.quest.progress = 0;
    d.quest.taken = [];
    this.hud.message(L(`Nova missão: ${q.title}`, `New quest: ${q.title}`), "#ffe14d");
    this.spawnQuestObjects();
    this.spawnStepFoes();
    this.storyActors();
    this.checkStepDone();
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
      if (it.name) item.name = it.name;
      if (d.addItem(item)) this.hud.message(L(`Recompensa: ${item.name}`, `Reward: ${item.name}`), RARITY_COLOR[item.rarity]);
      else this.spawnLoot({ kind: "item", amount: 1, item }, this.hero.x, this.hero.y);
    }
    this.hud.message(L(`+${r.xp} XP · +${r.gold} ouro · +${r.potions} poções`, `+${r.xp} XP · +${r.gold} gold · +${r.potions} potion${r.potions === 1 ? "" : "s"}`), "#ffe14d");
    sfx.quest();
    this.emitters.gold.explode(40, this.hero.x, this.hero.y - 14);
    d.quest = { ...d.quest, index: d.quest.index + 1, status: "available", step: 0, progress: 0 };
    for (const f of r.flags ?? []) if (!d.hasFlag(f)) d.quest.flags.push(f);
    this.restockShop(true);
    if (r.flags?.length) {
      d.recalc();
      this.buildVillageState();
    }
    this.giveXp(r.xp);
    this.afterItemsChanged();
    if (this.map.gates.length && !this.gatesLocked && (this.gateObjs.length || this.villageGates.length)) this.openGates();
    if (q.note) this.time.delayedCall(400, () => this.hud.dialog(q.note!.title, null, q.note!.lines));
    for (const z of ZONE_ORDER) if (ZONES[z].unlockAt === d.tier) this.hud.banner(L(`${ZONES[z].name}: caminho aberto!`, `${ZONES[z].name}: the way is open!`), L("Siga a estrada marcada no mapa (N).", "Follow the road marked on the map (N)."));
    if (d.tier === ZONES.swamp.unlockAt || d.tier === ZONES.peaks.unlockAt) for (const t of this.exitTags) t.el.querySelector(".ntitle")?.remove();
    if (d.currentQuest) {
      this.worldTierUp();
      const g = NPCS[d.currentQuest.giver];
      this.hud.message(L(`Próximo: fale com ${g.name} (${AREAS[ZONES[g.act].village].name}).`, `Next: speak with ${g.name} (${AREAS[ZONES[g.act].village].name}).`), "#ffe14d");
    } else {
      this.worldTierUp();
      this.time.delayedCall(600, () => this.hud.dialog(L("Epílogo", "Epilogue"), null, EPILOGUE));
    }
  }

  private mapMarkers(): MapMarker[] {
    const d = this.data_;
    const out: MapMarker[] = [];
    const h = this.hero;
    for (const e of this.enemies) {
      if (e.state === "dead" || e.dormant) continue;
      if (e.unique) continue;
      if (Phaser.Math.Distance.Between(h.x, h.y, e.spr.x, e.spr.y) > 420) continue;
      out.push({ x: e.spr.x, y: e.spr.y, color: e.rank === "champion" ? "#6f8cff" : e.def.faction === "bandit" ? "#ff8a3a" : "#ff3a3a", size: e.type === "brute" ? 4 : 3 });
    }
    for (const l of this.loot) if (l.kind === "item" && l.item!.rarity !== "normal") out.push({ x: l.img.x, y: l.img.y, color: RARITY_COLOR[l.item!.rarity], size: 2 });
    if (this.stepIs("chests"))
      for (const c of this.chests) if (!c.opened) out.push({ x: c.spr.x, y: c.spr.y, color: "#ffe14d", size: 4 });
    for (const o of this.questObjs) out.push({ x: o.spr.x, y: o.spr.y, color: "#ffe14d", size: 5, ring: true });
    const one = this.stepIs("unique"), many = this.stepIs("uniques");
    if (one || many) {
      for (const e of this.enemies) if (e.unique && e.state !== "dead" && (one ? e.unique === one.id : many!.ids.includes(e.unique)))
        out.push({ x: e.spr.x, y: e.spr.y, color: "#ff3a1a", size: 5, ring: true });
    }
    if (this.stepIs("dungeon") && d.currentStep!.area === this.area.id)
      for (const dg of this.map.dungeons) out.push({ x: dg.x * TILE + 8, y: dg.y * TILE, color: "#c06bff", size: 5, ring: true });
    // Quest in another area: mark the road that leads there and, when it is faster, this area's checkpoint.
    const target = this.questArea();
    if (target && target !== this.area.id && !this.dungeonRef) {
      const next = routeTo(this.area.id, target)[1];
      const ex = this.map.exits.find((x) => x.to === next);
      if (ex) out.push({ x: ex.x * TILE + 8, y: ex.y * TILE + 8, color: "#ffe14d", size: 5, ring: true, glyph: "»" });
      const wp = this.nearestWaypoint(target);
      if (this.portalSpr && wp && wp !== this.area.id && routeTo(wp, target).length < routeTo(this.area.id, target).length)
        out.push({ x: this.portalSpr.x, y: this.portalSpr.y, color: "#c06bff", size: 5, ring: true });
    }
    if (this.portalSpr && !this.dungeonRef) out.push({ x: this.portalSpr.x, y: this.portalSpr.y, color: "#c06bff", size: 4 });
    if (this.remote) out.push({ x: this.remote.spr.x, y: this.remote.spr.y, color: "#9fe8ff", size: 5 });
    for (const n of this.npcs) {
      const mark = this.npcMark(n);
      out.push({ x: n.spr.x, y: n.spr.y, color: mark === "?" ? "#7bea6a" : "#ffe14d", size: 4, glyph: mark || undefined });
    }
    return out;
  }

  /** "Speak with X (village)" for the quest tracker; the village is left out when the hero is there. */
  private speakTo(id: NpcId) {
    const n = NPCS[id], v = ZONES[n.act].village;
    const where = v === this.area.id ? "" : ` · ${AREAS[v].name}`;
    return L(`Fale com ${n.name}${where}`, `Speak with ${n.name}${where}`);
  }

  private npcMark(n: Npc): "" | "!" | "?" {
    const d = this.data_;
    const q = d.currentQuest;
    if (!q) return "";
    if (d.quest.status === "ready") return (q.turnIn ?? q.giver) === n.id ? "?" : "";
    return q.giver === n.id && d.quest.status === "available" ? "!" : "";
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

  /** How far item drops have grown with the hero's level: 0 at level 1, 1 from level 15. */
  private get dropGrowth() {
    return Phaser.Math.Clamp((this.data_.level - 1) / 14, 0, 1);
  }

  private dropLoot(e: Enemy) {
    const d = this.data_;
    const x = e.spr.x, y = e.spr.y;
    const lvl = e.level;
    const rich = e.def.faction === "bandit" ? 1.6 : 1;
    if (Math.random() < (e.rank === "normal" ? 0.5 : 1) * (e.type === "brute" ? 2 : 1)) {
      const amt = Math.round(lvl * (2 + Math.random() * 5) * rich * (e.rank === "boss" ? 12 : e.rank === "champion" ? 3 : e.type === "brute" ? 2 : 1));
      this.spawnLoot({ kind: "gold", amount: amt }, x, y);
    }
    if (Math.random() < (e.rank === "normal" ? 0.08 : 0.5)) this.spawnLoot({ kind: Math.random() < 0.65 ? "potion_hp" : "potion_mp", amount: 1 }, x, y);
    // Items are scarce early and get more frequent as the hero levels (t: 0 at level 1, 1 from level 15).
    // Normal kills: 1 in 50 at level 1, ~1 in 14 at 15; champions 35% -> 75%; bosses 1-2 -> 2-3.
    const t = this.dropGrowth;
    let items = e.rank === "boss" ? 1 + (Math.random() < 0.5 + 0.5 * t ? 1 : 0) + (Math.random() < 0.5 * t ? 1 : 0)
      : e.rank === "champion" ? (Math.random() < 0.35 + 0.4 * t ? 1 : 0) + (Math.random() < 0.15 * t ? 1 : 0)
      : Math.random() < 0.02 + 0.05 * t ? 1 : 0;
    if (e.type === "brute" && e.rank === "normal" && Math.random() < 0.08 + 0.12 * t) items++;
    items += e.def.traits?.loot ?? 0;
    if (e.chestLevel) this.chestLoot(x, y, e.chestLevel);
    // Rarity is capped by the hero's level (see maxRarityFor).
    for (let i = 0; i < items; i++) {
      let r: Rarity = rollRarity((e.rank === "boss" ? 3 : e.rank === "champion" || e.type === "brute" ? 1.8 : 1) * this.magicFind, d.level);
      if (e.rank === "boss" && i === 0) r = capRarity(Math.random() < 0.5 ? "unique" : "rare", d.level);
      this.spawnLoot({ kind: "item", amount: 1, item: generateItem(lvl, d.def, r, undefined, i === 0 ? e.unique : undefined) }, x, y);
    }
  }

  private openChest(c: Chest) {
    c.opened = true;
    const lvl = c.level + this.tierBonus;
    // Some chests are mimics: it bites back, and drops the chest's loot when it dies.
    if (!c.safe && !this.isGuest && !this.cinematic && Math.random() < MIMIC_CHANCE) {
      c.spr.setVisible(false);
      const pack: Pack = { x: Math.floor(c.spr.x / TILE), y: Math.floor(c.spr.y / TILE), level: lvl, count: 1, champion: false, faction: "goblin" };
      const m = this.spawnEnemy(c.spr.x, c.spr.y - 2, pack, "mimic", "normal");
      this.setLevel(m, lvl);
      m.chestLevel = lvl;
      m.aggro = true;
      m.nextAttack = this.time.now + 350;
      m.spr.face(this.hero.x - m.spr.x, this.hero.y - m.spr.y);
      this.shake(160, 0.006);
      this.emitters.dust.explode(14, c.spr.x, c.spr.y);
      this.hud.message(L("É um Mímico!", "It's a Mimic!"), "#ff8a3a");
      sfx.monster("mimic", 0.9);
      return;
    }
    sfx.chest();
    if (c.spr instanceof KilnSprite) c.spr.play2("open", { restart: true, onComplete: () => (c.spr as KilnSprite).play2("opened") });
    else c.spr.setFrame(1);
    this.emitters.gold.explode(14, c.spr.x, c.spr.y - 8);
    this.chestLoot(c.spr.x, c.spr.y + 4, lvl);
  }

  /** A chest's contents (also what a mimic drops). */
  private chestLoot(x: number, y: number, lvl: number) {
    const d = this.data_;
    this.spawnLoot({ kind: "gold", amount: Math.round(lvl * (6 + Math.random() * 10)) }, x, y);
    const n = 1 + (Math.random() < 0.1 + 0.25 * this.dropGrowth ? 1 : 0);
    for (let i = 0; i < n; i++) this.spawnLoot({ kind: "item", amount: 1, item: generateItem(lvl, d.def, rollRarity(1.6 * this.magicFind, d.level)) }, x, y);
    if (Math.random() < 0.6) this.spawnLoot({ kind: "potion_hp", amount: 1 }, x, y);
    if (this.stepIs("chests")) this.questProgress();
  }

  private spawnLoot(l: { kind: Loot["kind"]; amount: number; item?: Item }, x: number, y: number) {
    if (l.kind === "gold") l = { ...l, amount: Math.round(l.amount * (1 + this.data_.stats.goldFind)) };
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
          lab.style.color = RARITY_COLOR[l.item!.rarity];
          // Hovering the label shows the full tooltip (icon, stats, comparison).
          lab.onmouseenter = (ev) => this.hud.showItemTip(l.item!, ev.clientX, ev.clientY);
          lab.onmousemove = (ev) => this.hud.moveItemTip(ev.clientX, ev.clientY);
          lab.onmouseleave = () => this.hud.hideTip();
          lab.onmousedown = (ev) => {
            ev.stopPropagation();
            if (!this.dead) this.order = { type: "pickup", loot };
          };
          lab.oncontextmenu = (ev) => ev.preventDefault();
          this.hud.world.appendChild(lab);
          loot.label = lab;
          this.labelLoot(loot);
          const rar = l.item!.rarity;
          if (rar !== "normal" && rar !== "magic") {
            this.emitters.gold.explode(12, tx, ty);
            this.hud.message(L(`${l.item!.name} caiu no chão!`, `${l.item!.name} dropped!`), RARITY_COLOR[rar]);
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
      this.floatAt(l.img.x, l.img.y - 6, L(`+${l.amount} ouro`, `+${l.amount} gold`), "");
    } else if (l.kind === "item") {
      if (!d.addItem(l.item!)) {
        this.hud.message(L("Mochila cheia!", "Inventory full!"), "#ff6a5a");
        return;
      }
      this.hud.message(L(`Pegou: ${l.item!.name}`, `Picked up: ${l.item!.name}`), RARITY_COLOR[l.item!.rarity]);
      this.afterItemsChanged();
    } else {
      const k = l.kind === "potion_hp" ? "hp" : "mp";
      if (d.potions[k] >= MAX_POTIONS) {
        this.hud.message(L("Cinto de poções cheio.", "Potion belt is full."), "#ff6a5a");
        return;
      }
      d.potions[k]++;
    }
    l.img.destroy();
    l.label?.remove();
    this.hud.hideTip();
    l.beam?.destroy();
    this.loot = this.loot.filter((x) => x !== l);
  }

  /** Ground label text with the better/worse arrow against the current equipment. */
  private labelLoot(l: Loot) {
    if (!l.label || !l.item) return;
    const c = compareItem(l.item, this.data_.equipment);
    l.label.innerHTML = `${c === "same" ? "" : `<span class="cmp-mark ${c}">${COMPARE_MARK[c]}</span> `}${l.item.name.replace(/[&<>]/g, "")}`;
  }

  private afterItemsChanged() {
    for (const l of this.loot) this.labelLoot(l);
    this.hud.markInventoryDirty();
    this.data_.save();
  }

  private drinkPotion(k: "hp" | "mp") {
    const d = this.data_;
    if (this.dead || d.potions[k] <= 0) return;
    if (k === "hp" && d.hp >= d.stats.maxHp) return;
    if (k === "mp" && d.mana >= d.stats.maxMana) return;
    d.potions[k]--;
    sfx.potion();
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

  /** Points the current quest leads to in this area, nearest first: its objects or targets, the NPC to talk
   * to, or the road towards the area where it happens. */
  private objectivePoints(): ObjPoint[] {
    const d = this.data_, q = d.currentQuest, h = this.hero;
    if (!q) return [];
    const pts = (list: { x: number; y: number; label: string }[], max = 8): ObjPoint[] =>
      list.map((p) => ({ ...p, dist: Math.hypot(p.x - h.x, p.y - h.y) })).sort((a, b) => a.dist - b.dist).slice(0, max);
    const live = this.enemies.filter((e) => e.state !== "dead");
    const foes = (list: Enemy[], max?: number) => pts(list.map((e) => ({ x: e.spr.x, y: e.spr.y, label: e.name })), max);
    if (d.quest.status !== "active") {
      const id = d.quest.status === "ready" ? q.turnIn ?? q.giver : q.giver;
      const n = this.npcs.find((n) => n.id === id);
      if (n) return pts([{ x: n.spr.x, y: n.spr.y, label: NPCS[id].name }]);
    } else if (d.currentStep!.area === this.area.id) {
      if (this.questObjs.length) return pts(this.questObjs.map((o) => ({ x: o.spr.x, y: o.spr.y, label: QUEST_ITEMS[o.item].name })));
      const one = this.stepIs("unique"), many = this.stepIs("uniques");
      if (one || many) {
        const bosses = foes(live.filter((e) => e.unique && (one ? e.unique === one.id : many!.ids.includes(e.unique))));
        if (bosses.length) return bosses;
        const a = this.map.arena;
        if (a && a.quest === q.id) return pts([{ x: a.gate.x * TILE + 8, y: a.gate.y * TILE + 8, label: L("Alfândega Real", "Royal Customs House") }]);
      }
      const kill = this.stepIs("kill");
      if (kill) return foes(live.filter((e) => e.def.faction === kill.faction), 3);
      if (this.stepIs("dungeon"))
        return this.dungeonRef ? foes(live.filter((e) => e.boss))
          : pts(this.map.dungeons.map((g) => ({ x: g.x * TILE + 8, y: g.y * TILE, label: L("Entrada da masmorra", "Dungeon entrance") })));
      if (this.stepIs("chests")) return pts(this.chests.filter((c) => !c.opened).map((c) => ({ x: c.spr.x, y: c.spr.y, label: L("Baú", "Chest") })));
      return [];
    }
    const target = this.questArea();
    if (!target || target === this.area.id || this.dungeonRef) return [];
    const ex = this.map.exits.find((x) => x.to === routeTo(this.area.id, target)[1]);
    return ex ? pts([{ x: ex.x * TILE + 8, y: ex.y * TILE + 8, label: L(`Estrada para ${AREAS[ex.to].name}`, `Road to ${AREAS[ex.to].name}`) }]) : [];
  }

  /** Pulsing arrows at the screen edge, one per objective that is off screen. */
  private updateObjectiveArrows(time: number) {
    const g = (this.objArrow ??= this.add.graphics().setDepth(1e6 + 2));
    g.clear();
    if (this.cinematic || this.dead || this.hud.anyOpen()) return;
    const cam = this.cameras.main, v = cam.worldView, z = cam.zoom, u = 1 / z;
    // Inset from the screen edges, in world px (more at the bottom, where the action bar sits).
    const x0 = v.x + 44 * u, x1 = v.right - 44 * u, y0 = v.y + 50 * u, y1 = v.bottom - 140 * u;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const pulse = Math.sin(time / 160);
    for (const p of this.objPts) {
      if (p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1) continue;
      const a = Math.atan2(p.y - cy, p.x - cx), c = Math.cos(a), s = Math.sin(a);
      // Where the ray from the centre towards the objective leaves the inset rectangle.
      const k = Math.min((x1 - x0) / 2 / Math.max(Math.abs(c), 1e-4), (y1 - y0) / 2 / Math.max(Math.abs(s), 1e-4)) + pulse * 3 * u;
      const ax = cx + c * k, ay = cy + s * k;
      const pt = (f: number, l: number) => ({ x: ax + c * f * u - s * l * u, y: ay + s * f * u + c * l * u });
      const tri = [pt(22, 0), pt(-11, 16), pt(-4, 0), pt(-11, -16)];
      g.fillStyle(0x000000, 0.45).fillCircle(ax, ay, 26 * u);
      g.lineStyle(2 * u, 0xffd23d, 0.35 + 0.25 * pulse).strokeCircle(ax, ay, 26 * u);
      g.fillStyle(0xffd23d, 1).fillPoints(tri, true);
      g.lineStyle(3 * u, 0x2a1a08, 1).strokePoints(tri, true);
    }
  }

  private drawBars() {
    const g = this.bars;
    g.clear();
    for (const e of this.enemies) {
      if (e.state === "dead" || !e.active || e.dormant || e.hp >= e.maxHp) continue;
      const w = e.rank === "boss" ? 24 : e.type === "brute" ? 18 : 14;
      const top = e.type === "brute" ? 40 : Math.max(26, e.def.height * 0.85);
      const x = Math.round(e.spr.x - w / 2), y = Math.round(e.spr.y - top * e.spr.scaleY);
      g.fillStyle(0x1c0f1a).fillRect(x - 1, y - 1, w + 2, 4);
      g.fillStyle(e.rank === "boss" ? 0xe1a227 : e.rank === "champion" ? 0x6f8cff : 0xc13a2b)
        .fillRect(x, y, Math.max(1, Math.round((w * e.hp) / e.maxHp)), 2);
    }
  }

  private floatAt(wx: number, wy: number, text: string, cls: string) {
    if (this.cinematic) return; // no damage/XP numbers during the opening cutscene
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
    for (const t of this.exitTags) place(t.el, t.x, t.y);
    if (this.remote) {
      const r = this.remote;
      place(r.tag, r.spr.x, r.spr.y - 34);
      const bar = r.tag.querySelector(".pb div") as HTMLElement | null;
      if (bar) bar.style.width = `${Math.max(0, r.st.hp / r.st.maxHp) * 100}%`;
    }
    for (const n of this.npcs) {
      const mark = n.hidden ? "" : this.npcMark(n);
      if (n.marker) {
        n.marker.setVisible(!!mark);
        if (mark) n.marker.play2(mark === "?" ? "ready" : "quest");
        // Just above the name tag.
        n.marker.setPosition(n.spr.x, n.spr.y - 30 - n.tag.offsetHeight / cam.zoom - 2);
      }
      const info = NPCS[n.id];
      const html = `${mark && !n.marker ? `<div class="mark${mark === "?" ? " ready" : ""}">${mark}</div>` : ""}`
        + `<div class="nname"><img class="nicon" src="${npcIcon(info.icon)}">${info.name}</div><div class="ntitle">${info.title}</div>`;
      if (n.tag.dataset.html !== html) {
        n.tag.innerHTML = html;
        n.tag.dataset.html = html;
      }
      if (n.hidden) n.tag.style.display = "none";
      else place(n.tag, n.spr.x, n.spr.y - 30);
    }
    for (const o of this.decor) if (o.tag) place(o.tag, o.spr.x, o.spr.y - 26);
    if (this.gather) place(this.gather.el, this.hero.x, this.hero.y - 34);
  }
}

