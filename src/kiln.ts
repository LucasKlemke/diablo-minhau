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
  "npc_elder", "npc_smith", "npc_hunter", "skeleton", "spider", "troll", "lich",
] as const;
/** Optional variants: when their export is missing they fall back to the base sprite instead of a placeholder. */
const VARIANT_OF: Partial<Record<string, SpriteName>> = { goblin_hurt: "goblin", goblin_maimed: "goblin" };
const available = new Set<string>();
export const hasSprite = (name: SpriteName) => available.has(name);
export type SpriteName = (typeof SPRITES)[number];

export function preloadKiln(scene: Phaser.Scene) {
  for (const name of SPRITES) {
    const base = `assets/sprites/${name}/${name}`;
    scene.load.atlas(name, `${base}.png`, `${base}.json`);
    scene.load.json(`${name}:kiln`, `${base}.json`);
  }
}

/** Placeholder look per sprite while SpriteKiln renders are missing. */
const PLACEHOLDER: Record<SpriteName, { body: number; head: number; h: number }> = {
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
};

function makePlaceholder(scene: Phaser.Scene, name: SpriteName) {
  const p = PLACEHOLDER[name];
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
    } else if (VARIANT_OF[name]) {
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

export class KilnSprite extends Phaser.GameObjects.Sprite {
  meta: KilnMeta;
  spriteName: SpriteName;
  dir: Dir = "s";
  current = "";
  private clip?: DirClip;
  private opts: PlayOpts = {};
  private flipped = false;

  constructor(scene: Phaser.Scene, x: number, y: number, name: SpriteName) {
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
    if (this.current) this.playClip(this.current, this.opts, true);
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
