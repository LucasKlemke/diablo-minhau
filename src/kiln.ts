import Phaser from "phaser";

// Phaser runtime for SpriteKiln exports (atlas PNG + Aseprite-style JSON with a `spritekiln` block).
// Builds one Phaser animation per clip x rendered direction, flips mirrored directions, fires the
// clip's gameplay events (hit, release, step_l...) and reads per-frame sockets.

export type Dir = "s" | "se" | "e" | "ne" | "n" | "nw" | "w" | "sw";
const DIRS_BY_ANGLE: Dir[] = ["e", "se", "s", "sw", "w", "nw", "n", "ne"];

interface DirClip {
  frames: string[];
  durations: number[];
  events: Record<string, string[]>;
  sockets?: Record<string, ([number, number, number] | null)[]>;
}
interface KilnMeta {
  name: string;
  frame_size: number;
  pivot: { x: number; y: number };
  directions: Dir[];
  animations: Record<string, { loop: boolean; directions: Partial<Record<Dir, DirClip>> }>;
  mirrors?: Partial<Record<Dir, Dir>>;
}

const metas = new Map<string, KilnMeta>();

export const SPRITES = [
  "barbarian", "archer", "mage", "sorcerer", "goblin", "goblin_hurt", "goblin_maimed", "bandit", "bandit_brute",
  "npc_elder", "npc_smith", "npc_hunter", "skeleton", "spider", "troll", "lich", "chest", "portal", "crypt",
  "house", "barn", "fence_h", "fence_v", "tree_big", "tree_medium", "bush", "stump", "campfire",
  "crypt_floor", "tombstone", "dead_tree", "grave_fence", "village_gate", "npc_marker",
  // monsters of inimmigos.md
  "wolf", "boar", "wasp", "slime", "worg_rider", "ent", "mimic", "kobold", "zombie", "ghoul", "lizardman", "cultist",
  "leech", "wisp", "ghost", "gargoyle", "orc", "hobgoblin", "armor", "bat", "ant", "beetle", "centipede", "manticore", "dragon",
  // villagers of Acts II and III
  "npc_healer", "npc_merchant", "npc_boatman", "npc_captain", "npc_dwarf", "npc_seer",
  "town_portal",
  // Act I (rewrite): characters of the prologue and the village, and their props
  "npc_aldo", "aldo_young", "sarah_young", "jimmy_pup", "lisa", "jimmynelson", "royal_guard", "kira", "dog_caramelo", "dog_trovao", "dog_mancha", "polvo_broom",
  "castle_floor", "castle_column", "castle_throne", "castle_carpet", "castle_lily_vase", "castle_tapestry", "castle_gate", "castle_window", "golden_bowl",
  "straw_bed", "hearth", "wash_basin", "dry_fountain", "canvas_tent", "ruined_hut", "oak_beam", "goblin_cauldron", "tool_chest", "forge_chimney",
  "castle_wall_back", "castle_wall_side", "castle_banner", "castle_candelabrum",
  "hut_floor", "hut_wall_back", "hut_wall_side", "hut_table", "hut_stool", "hut_shelf", "hanging_herbs", "hut_rug", "hut_door", "firewood", "hut_candle", "royal_chest",
  "jimmynelson_carry",
  // Act I desolation: gore and the burning castle, the ruined village, the dead woods and the old road
  "blood_splat", "gore_chunks", "guard_remains", "fire_large", "fire_small", "fire_wall", "castle_column_broken", "castle_tapestry_burning",
  "castle_banner_burning", "castle_throne_broken", "castle_rubble", "scorch_mark", "castle_floor_cracked",
  "aldo_hut", "smithy", "hunter_lodge", "burned_house", "patched_house", "palisade_h", "palisade_v", "rubble_pile", "broken_cart",
  "cold_campfire", "dead_crops", "scorched_ground", "refugee_bedroll", "crow", "grave_mound", "well_broken",
  "twisted_tree", "burnt_tree", "dead_bush", "mossy_rock", "wolf_den", "trash_fire", "bone_hang", "rotten_barricade", "goblin_tent",
  "skull_stake", "junk_throne", "looted_carriage", "toll_post", "podium_carts", "torn_banner_pole", "road_stones",
  // Act I dungeons (the abandoned house's cellar, the butcher's cellar, the bat cave), their entrances, Lula's barricade
  "cellar_barrels", "cellar_rack", "cellar_sacks", "cellar_stairs", "cobweb_floor", "flea_nest", "cellar_beam",
  "meat_hook", "butcher_block", "butcher_table", "bone_pile", "blood_drain", "cage",
  "stalagmite", "cave_boulder", "guano_pile", "glow_mushrooms", "cave_puddle", "ogre_bed",
  "cellar_entrance", "butcher_entrance", "cave_entrance", "customs_gate",
  "polvo",
  // The three mutts, plague-corrupted (they turn back into dog_* when beaten), and their stone circle
  "dog_caramelo_demon", "dog_trovao_demon", "dog_mancha_demon", "standing_stone", "offal_pile", "plague_pool", "gnawed_bones",
  // The mage's spell effects
  "fx_fireball", "fx_meteor", "fx_frost_nova", "fx_lightning", "fx_arcane_shield",
  // The sorcerer's spell effects
  "fx_shadowbolt", "fx_soul_drain", "fx_plague", "fx_corpse_blast", "fx_blood_pact",
  // The barbarian's effects and his Berserker Rage look
  "fx_cleave", "fx_whirlwind", "fx_leap_impact", "fx_quake", "fx_war_roar", "barbarian_berserk",
  // The archer's effects
  "fx_arrow", "fx_piercing_arrow", "fx_explosive_arrow", "fx_arrow_fan", "fx_arrow_rain",
] as const;
/** Optional variants: when their export is missing they fall back to the base sprite instead of a placeholder
 * (KilnSprite and kilnImage resolve them on their own, see resolveSprite). */
const VARIANT_OF: Partial<Record<string, SpriteName>> = {
  goblin_hurt: "goblin", goblin_maimed: "goblin",
  npc_aldo: "npc_elder", aldo_young: "npc_elder", sarah_young: "npc_seer", jimmy_pup: "wolf", lisa: "wolf", jimmynelson: "troll",
  royal_guard: "bandit", jimmynelson_carry: "jimmynelson", kira: "wolf", dog_caramelo: "wolf", dog_trovao: "wolf", dog_mancha: "wolf", polvo_broom: "bandit", polvo: "bandit",
  dog_caramelo_demon: "wolf", dog_trovao_demon: "wolf", dog_mancha_demon: "wolf",
};
/** Props modelled in SpriteKiln; while missing, the game falls back to its older art. */
const OPTIONAL = new Set<string>([
  "chest", "portal", "crypt", "house", "barn", "fence_h", "fence_v", "tree_big", "tree_medium", "bush", "stump", "campfire",
  "crypt_floor", "tombstone", "dead_tree", "grave_fence", "village_gate", "npc_marker", "town_portal",
  "castle_floor", "castle_column", "castle_throne", "castle_carpet", "castle_lily_vase", "castle_tapestry", "castle_gate", "castle_window", "golden_bowl",
  "straw_bed", "hearth", "wash_basin", "dry_fountain", "canvas_tent", "ruined_hut", "oak_beam", "goblin_cauldron", "tool_chest", "forge_chimney",
  "castle_wall_back", "castle_wall_side", "castle_banner", "castle_candelabrum",
  "hut_floor", "hut_wall_back", "hut_wall_side", "hut_table", "hut_stool", "hut_shelf", "hanging_herbs", "hut_rug", "hut_door", "firewood", "hut_candle", "royal_chest",
  // Act I desolation: gore and the burning castle, the ruined village, the dead woods and the old road
  "blood_splat", "gore_chunks", "guard_remains", "fire_large", "fire_small", "fire_wall", "castle_column_broken", "castle_tapestry_burning",
  "castle_banner_burning", "castle_throne_broken", "castle_rubble", "scorch_mark", "castle_floor_cracked",
  "aldo_hut", "smithy", "hunter_lodge", "burned_house", "patched_house", "palisade_h", "palisade_v", "rubble_pile", "broken_cart",
  "cold_campfire", "dead_crops", "scorched_ground", "refugee_bedroll", "crow", "grave_mound", "well_broken",
  "twisted_tree", "burnt_tree", "dead_bush", "mossy_rock", "wolf_den", "trash_fire", "bone_hang", "rotten_barricade", "goblin_tent",
  "skull_stake", "junk_throne", "looted_carriage", "toll_post", "podium_carts", "torn_banner_pole", "road_stones",
  // Act I dungeons (the abandoned house's cellar, the butcher's cellar, the bat cave), their entrances, Lula's barricade
  "cellar_barrels", "cellar_rack", "cellar_sacks", "cellar_stairs", "cobweb_floor", "flea_nest", "cellar_beam",
  "meat_hook", "butcher_block", "butcher_table", "bone_pile", "blood_drain", "cage",
  "stalagmite", "cave_boulder", "guano_pile", "glow_mushrooms", "cave_puddle", "ogre_bed",
  "cellar_entrance", "butcher_entrance", "cave_entrance", "customs_gate",
  "standing_stone", "offal_pile", "plague_pool", "gnawed_bones",
  "fx_fireball", "fx_meteor", "fx_frost_nova", "fx_lightning", "fx_arcane_shield",
  "fx_shadowbolt", "fx_soul_drain", "fx_plague", "fx_corpse_blast", "fx_blood_pact",
  "fx_cleave", "fx_whirlwind", "fx_leap_impact", "fx_quake", "fx_war_roar", "barbarian_berserk",
  "fx_arrow", "fx_piercing_arrow", "fx_explosive_arrow", "fx_arrow_fan", "fx_arrow_rain",
]);
const available = new Set<string>();
export const hasSprite = (name: SpriteName) => available.has(name);
/** The sprite to draw for `name`: itself when exported, else the base sprite it is a variant of. */
export const resolveSprite = (name: SpriteName): SpriteName => (available.has(name) ? name : VARIANT_OF[name] ?? name);
export type SpriteName = (typeof SPRITES)[number];

export function preloadKiln(scene: Phaser.Scene) {
  for (const name of SPRITES) {
    const base = `assets/sprites/${name}/${name}`;
    scene.load.atlas(name, `${base}.png`, `${base}.json`);
    scene.load.json(`${name}:kiln`, `${base}.json`);
  }
}

/** Placeholder look per sprite while SpriteKiln renders are missing. */
const PLACEHOLDER: Partial<Record<SpriteName, { body: number; head: number; h: number }>> = {
  campfire: { body: 0x5d351f, head: 0xfe6607, h: 12 },
  barbarian: { body: 0xc13a2b, head: 0xeaab86, h: 30 },
  archer: { body: 0x5dab3d, head: 0xeaab86, h: 30 },
  mage: { body: 0x2c60d5, head: 0xeaab86, h: 30 },
  sorcerer: { body: 0x8d44ac, head: 0x41344f, h: 30 },
  goblin: { body: 0x7a4a2a, head: 0x7ab041, h: 22 },
  goblin_hurt: { body: 0x7a4a2a, head: 0x7ab041, h: 22 },
  goblin_maimed: { body: 0x7a4a2a, head: 0x7ab041, h: 22 },
  bandit: { body: 0x5d351f, head: 0xc13a2b, h: 30 },
  bandit_brute: { body: 0x4a2a1a, head: 0xeaab86, h: 40 },
  npc_elder: { body: 0x7a4a2a, head: 0xf8f1dc, h: 28 },
  npc_smith: { body: 0xc13a2b, head: 0xeaab86, h: 30 },
  npc_hunter: { body: 0x9e6d32, head: 0xeaab86, h: 30 },
  skeleton: { body: 0x5d4f6c, head: 0xe6d6ad, h: 30 },
  spider: { body: 0x2a2038, head: 0x8d44ac, h: 14 },
  troll: { body: 0x4f6a5a, head: 0x7a9a80, h: 46 },
  lich: { body: 0x1e2978, head: 0xe6d6ad, h: 40 },
  chest: { body: 0x9e6d32, head: 0x9e6d32, h: 10 },
  portal: { body: 0x6a6478, head: 0xc06bff, h: 40 },
  crypt: { body: 0x41344f, head: 0x41344f, h: 40 },
  house: { body: 0xb5502a, head: 0xb5502a, h: 40 },
  barn: { body: 0xb5502a, head: 0xb5502a, h: 40 },
  fence_h: { body: 0x7a3a22, head: 0x7a3a22, h: 12 },
  fence_v: { body: 0x7a3a22, head: 0x7a3a22, h: 12 },
  tree_big: { body: 0x3f8a2e, head: 0x3f8a2e, h: 46 },
  tree_medium: { body: 0x3f8a2e, head: 0x3f8a2e, h: 40 },
  bush: { body: 0x3f8a2e, head: 0x3f8a2e, h: 12 },
  stump: { body: 0x7a3a22, head: 0x7a3a22, h: 10 },
  crypt_floor: { body: 0x41344f, head: 0x41344f, h: 4 },
  tombstone: { body: 0x6a6480, head: 0x6a6480, h: 12 },
  dead_tree: { body: 0x4a3a30, head: 0x4a3a30, h: 40 },
  grave_fence: { body: 0x4b5266, head: 0x4b5266, h: 14 },
  village_gate: { body: 0x7a3a22, head: 0x7a3a22, h: 20 },
  npc_marker: { body: 0xffe14d, head: 0xffe14d, h: 10 },
  wolf: { body: 0x6a6a72, head: 0x8a8a92, h: 14 },
  boar: { body: 0x5d351f, head: 0x7a4a2a, h: 16 },
  wasp: { body: 0xe1a227, head: 0x2a2038, h: 10 },
  slime: { body: 0x5dab3d, head: 0x8fd060, h: 10 },
  worg_rider: { body: 0x41344f, head: 0x7ab041, h: 30 },
  ent: { body: 0x7a4a2a, head: 0x3f8a2e, h: 34 },
  mimic: { body: 0x9e6d32, head: 0xc13a2b, h: 14 },
  kobold: { body: 0xb5502a, head: 0xd07a3a, h: 22 },
  zombie: { body: 0x5d4f3c, head: 0x8aa070, h: 30 },
  ghoul: { body: 0x6a6480, head: 0xc0c8b0, h: 28 },
  lizardman: { body: 0x3f8a6e, head: 0x5dab8d, h: 32 },
  cultist: { body: 0x7a1420, head: 0x2a1020, h: 30 },
  leech: { body: 0x4a4a2a, head: 0x7a1420, h: 8 },
  wisp: { body: 0x9fffe0, head: 0xe0fff8, h: 12 },
  ghost: { body: 0xc8d8f0, head: 0xe8f0ff, h: 30 },
  gargoyle: { body: 0x6a6a72, head: 0x8a8a92, h: 30 },
  orc: { body: 0x5d351f, head: 0x5d8a2e, h: 36 },
  hobgoblin: { body: 0x4b5266, head: 0xd0603a, h: 32 },
  armor: { body: 0x8a92a0, head: 0x5a6070, h: 36 },
  bat: { body: 0x41344f, head: 0x5d4f6c, h: 12 },
  ant: { body: 0xa03a20, head: 0xc0502a, h: 14 },
  beetle: { body: 0x1e4a5a, head: 0x2a6a7a, h: 14 },
  centipede: { body: 0xa05a20, head: 0xc07a3a, h: 12 },
  manticore: { body: 0xc08a40, head: 0x5d351f, h: 48 },
  dragon: { body: 0xc13a2b, head: 0xe0603a, h: 46 },
  npc_healer: { body: 0x5d6a3a, head: 0xeaab86, h: 28 },
  npc_merchant: { body: 0x8d44ac, head: 0xeaab86, h: 30 },
  npc_boatman: { body: 0x9e6d32, head: 0xeaab86, h: 30 },
  npc_captain: { body: 0x2c60d5, head: 0xeaab86, h: 30 },
  npc_dwarf: { body: 0x7a4a2a, head: 0xe0664a, h: 24 },
  npc_seer: { body: 0xe8ebee, head: 0xeaab86, h: 28 },
  town_portal: { body: 0x5bc8f0, head: 0xe8ebee, h: 32 },
};

function makePlaceholder(scene: Phaser.Scene, name: SpriteName) {
  const p = PLACEHOLDER[name] ?? { body: 0x8a8a92, head: 0xeaab86, h: 28 };
  const size = 48;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const frames = 4;
  for (let f = 0; f < frames; f++) {
    const ox = f * size;
    const bob = f % 2;
    const top = 40 - p.h + bob;
    g.fillStyle(0x1c0f1a);
    g.fillRoundedRect(ox + 15, top + p.h * 0.38 - 1, 18, p.h * 0.62 + 2, 4);
    g.fillCircle(ox + 24, top + p.h * 0.22, p.h * 0.24 + 1);
    g.fillStyle(p.body);
    g.fillRoundedRect(ox + 16, top + p.h * 0.38, 16, p.h * 0.62, 3);
    g.fillStyle(p.head);
    g.fillCircle(ox + 24, top + p.h * 0.22, p.h * 0.24);
  }
  g.generateTexture(name, size * frames, size);
  g.destroy();
  const tex = scene.textures.get(name);
  const names: string[] = [];
  for (let f = 0; f < frames; f++) {
    tex.add(`f${f}`, 0, f * size, 0, size, size);
    names.push(`f${f}`);
  }
  const clip = (ms: number[], events: Record<string, string[]> = {}): DirClip => ({
    frames: ms.map((_, i) => names[i % frames]), durations: ms, events,
  });
  const dirs: Partial<Record<Dir, DirClip>> = {};
  const all = (c: DirClip) => Object.fromEntries((["s", "se", "e", "ne", "n"] as Dir[]).map((d) => [d, c]));
  Object.assign(dirs, {});
  metas.set(name, {
    name, frame_size: size, pivot: { x: 24, y: 41 }, directions: ["s", "se", "e", "ne", "n"],
    mirrors: { sw: "se", w: "e", nw: "ne" },
    animations: {
      idle: { loop: true, directions: all(clip([400, 400])) },
      walk: { loop: true, directions: all(clip([120, 120, 120, 120])) },
      attack: { loop: false, directions: all(clip([150, 60, 120, 120], { "1": ["hit", "release"] })) },
      cast: { loop: false, directions: all(clip([200, 80, 150, 120], { "1": ["hit", "release"] })) },
      hit: { loop: false, directions: all(clip([90, 90])) },
      death: { loop: false, directions: all(clip([120, 600])) },
    },
  });
}

/** After preload: register metas, create placeholders for missing sprites, build Phaser animations. */
export function setupKiln(scene: Phaser.Scene): SpriteName[] {
  const missing: SpriteName[] = [];
  for (const name of SPRITES) {
    const json = scene.cache.json.get(`${name}:kiln`);
    if (json?.spritekiln && scene.textures.exists(name)) {
      metas.set(name, json.spritekiln as KilnMeta);
      available.add(name);
    } else if (VARIANT_OF[name] || OPTIONAL.has(name)) {
      continue;
    } else {
      if (scene.textures.exists(name)) scene.textures.remove(name);
      makePlaceholder(scene, name);
      missing.push(name);
    }
    const meta = metas.get(name)!;
    for (const [anim, a] of Object.entries(meta.animations)) {
      for (const [dir, c] of Object.entries(a.directions) as [Dir, DirClip][]) {
        const key = `${name}:${anim}:${dir}`;
        if (scene.anims.exists(key)) continue;
        scene.anims.create({
          key,
          frameRate: 1000, // 1 ms base; per-frame `duration` adds the real timing
          repeat: a.loop ? -1 : 0,
          frames: c.frames.map((f, i) => ({ key: name, frame: f, duration: Math.max(0, c.durations[i] - 1) })),
        });
      }
    }
  }
  return missing;
}

export function dirFromVector(dx: number, dy: number): Dir {
  const a = Math.atan2(dy, dx);
  const i = Math.round(a / (Math.PI / 4));
  return DIRS_BY_ANGLE[(i + 8) % 8];
}

export interface PlayOpts {
  timeScale?: number;
  onEvent?: (event: string) => void;
  onComplete?: () => void;
  restart?: boolean;
}

/** A static SpriteKiln prop as a plain image (first `idle` frame), placed by its pivot.
 * `texture` may be a biome skin of the atlas (see makeSkins). */
export function kilnImage(scene: Phaser.Scene, x: number, y: number, name: SpriteName, texture: string = resolveSprite(name)) {
  name = resolveSprite(name);
  const m = metas.get(name)!;
  const frame = m.animations.idle.directions.s!.frames[0];
  return scene.add.image(x, y, texture, frame).setOrigin(m.pivot.x / m.frame_size, m.pivot.y / m.frame_size);
}

export class KilnSprite extends Phaser.GameObjects.Sprite {
  meta: KilnMeta;
  spriteName: SpriteName;
  dir: Dir = "s";
  current = "";
  private clip?: DirClip;
  private opts: PlayOpts = {};
  private flipped = false;

  constructor(scene: Phaser.Scene, x: number, y: number, name: SpriteName) {
    name = resolveSprite(name);
    super(scene, x, y, name);
    this.spriteName = name;
    this.meta = metas.get(name)!;
    this.setOrigin(this.meta.pivot.x / this.meta.frame_size, this.meta.pivot.y / this.meta.frame_size);
    this.on(Phaser.Animations.Events.ANIMATION_UPDATE, (_a: unknown, frame: Phaser.Animations.AnimationFrame) =>
      this.fire(frame.index - 1),
    );
    this.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      const cb = this.opts.onComplete;
      this.opts.onComplete = undefined;
      cb?.();
    });
    scene.add.existing(this);
  }

  /** Swaps to another sprite with the same clips (e.g. a wounded variant), keeping the clip progress. */
  setSprite(name: SpriteName) {
    if (name === this.spriteName || !available.has(name)) return;
    this.spriteName = name;
    this.meta = metas.get(name)!;
    // The new sprite may lack the clip being played (a demon dog's death on the purified dog): fall back to idle.
    if (this.current && this.has(this.current)) this.playClip(this.current, this.opts, true);
    else if (this.current) this.playClip((this.current = "idle"), {}, false);
    else this.setTexture(name);
  }

  has(anim: string) {
    return !!this.meta.animations[anim];
  }

  face(dx: number, dy: number) {
    if (dx === 0 && dy === 0) return;
    const d = dirFromVector(dx, dy);
    if (d !== this.dir) {
      this.dir = d;
      if (this.current && this.anims.isPlaying) this.playClip(this.current, { ...this.opts, restart: false }, true);
    }
  }

  play2(anim: string, opts: PlayOpts = {}) {
    if (!this.has(anim)) anim = "idle";
    if (anim === this.current && !opts.restart && this.anims.isPlaying) {
      if (opts.timeScale) this.anims.timeScale = opts.timeScale;
      return;
    }
    this.playClip(anim, opts, false);
  }

  private playClip(anim: string, opts: PlayOpts, keepProgress: boolean) {
    const a = this.meta.animations[anim];
    let d: Dir = this.dir;
    let flip = false;
    if (!a.directions[d]) {
      const m = this.meta.mirrors?.[d];
      if (m && a.directions[m]) {
        d = m;
        flip = true;
      } else d = (Object.keys(a.directions)[0] as Dir) ?? "s";
    }
    const progress = keepProgress ? this.anims.currentFrame?.index ?? 1 : 1;
    this.current = anim;
    this.clip = a.directions[d];
    this.opts = opts;
    this.flipped = flip;
    this.setFlipX(flip);
    this.anims.play({ key: `${this.spriteName}:${anim}:${d}`, startFrame: keepProgress ? progress - 1 : 0 });
    this.anims.timeScale = opts.timeScale ?? 1;
    if (!keepProgress) this.fire(0);
  }

  private fire(i: number) {
    const evs = this.clip?.events[String(i)];
    if (evs && this.opts.onEvent) for (const e of evs) this.opts.onEvent(e);
  }

  /** Socket offset in px from the pivot for the current frame (null if absent). */
  socket(name: string): { x: number; y: number } | null {
    const s = this.clip?.sockets?.[name]?.[(this.anims.currentFrame?.index ?? 1) - 1];
    if (!s) return null;
    return { x: (this.flipped ? -s[0] : s[0]) * this.scaleX, y: s[1] * this.scaleY };
  }
}

/** Draws the first idle frame facing the camera onto a canvas (menu portraits). */
export function portrait(scene: Phaser.Scene, name: SpriteName, scale = 2): HTMLCanvasElement {
  const meta = metas.get(name)!;
  const clip = meta.animations.idle?.directions.s ?? Object.values(meta.animations)[0].directions.s!;
  const frame = scene.textures.getFrame(name, clip.frames[0]);
  const c = document.createElement("canvas");
  c.width = c.height = meta.frame_size * scale;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(frame.source.image as CanvasImageSource, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight,
    0, 0, frame.cutWidth * scale, frame.cutHeight * scale);
  return c;
}

/** Has a sprite's metadata (real export or placeholder) been registered? */
export const kilnMeta = (name: string) => metas.get(name);

/**
 * Draws one frame of a clip onto a 2D canvas, outside Phaser (menus): the frame shown at time `t` (ms),
 * its pivot at (x, y), scaled by `scale`. Left-facing directions are mirrored like in game.
 */
export function drawKiln(ctx: CanvasRenderingContext2D, textures: Phaser.Textures.TextureManager, name: string,
  anim: string, dir: Dir, t: number, x: number, y: number, scale: number): boolean {
  const meta = metas.get(name);
  const a = meta?.animations[anim] ?? meta?.animations.idle;
  if (!meta || !a) return false;
  let d = dir;
  let flip = false;
  if (!a.directions[d]) {
    const m = meta.mirrors?.[d];
    if (m && a.directions[m]) { d = m; flip = true; } else d = Object.keys(a.directions)[0] as Dir;
  }
  const clip = a.directions[d]!;
  const total = clip.durations.reduce((s, v) => s + v, 0);
  let k = 0;
  for (let acc = t % total; acc >= clip.durations[k] && k < clip.durations.length - 1; k++) acc -= clip.durations[k];
  const f = textures.getFrame(name, clip.frames[k]);
  if (!f) return false;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(Math.round(x), Math.round(y));
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(f.source.image as CanvasImageSource, f.cutX, f.cutY, f.cutWidth, f.cutHeight,
    -meta.pivot.x * scale, -meta.pivot.y * scale, f.cutWidth * scale, f.cutHeight * scale);
  ctx.restore();
  return true;
}
