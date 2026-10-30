import Phaser from "phaser";
import type { DeathKind } from "../data/classes";
import type { Stats } from "../data/stats";

// Elemental particles: the burst where an elemental hit lands, the status an enemy (or the hero) carries
// while burning, chilled, electrified or poisoned, the glow of an elemental weapon and projectile trails.

export type Element = "fire" | "cold" | "lightning" | "poison" | "shadow";
/** Extra elemental damage of one hit (from items), added after physical resistance. */
export type ElemDmg = Partial<Record<Exclude<Element, "shadow">, number>>;

/** The stat that adds each element's damage to every hit. */
export const ELEM_STAT = { fire: "fireDmg", cold: "coldDmg", lightning: "lightningDmg", poison: "poisonDmg" } as const satisfies
  Record<keyof ElemDmg, keyof Stats>;

export const ELEMENT_OF: Partial<Record<DeathKind, Element>> = {
  burn: "fire", freeze: "cold", shock: "lightning", melt: "poison", soul: "shadow",
};

export const ELEM_COLOR: Record<Element, number> = {
  fire: 0xfe6607, cold: 0x7edaf2, lightning: 0xfff27a, poison: 0x7bea6a, shadow: 0xa45dff,
};

/** Elements the hero's gear adds to every hit. */
export const weaponElements = (s: Stats): Element[] =>
  (Object.keys(ELEM_STAT) as (keyof ElemDmg)[]).filter((k) => s[ELEM_STAT[k]] > 0);

type Emitter = Phaser.GameObjects.Particles.ParticleEmitter;
type Cfg = Phaser.Types.GameObjects.Particles.ParticleEmitterConfig;

export class ElementFx {
  private burst: Record<Element, Emitter>;
  private drift: Record<Element, Emitter>;

  constructor(private scene: Phaser.Scene) {
    this.makeTextures();
    const em = (tex: string, cfg: Cfg) => scene.add.particles(0, 0, tex, { emitting: false, ...cfg }).setDepth(1e6 - 1);
    const add = Phaser.BlendModes.ADD;
    this.burst = {
      fire: em("fx_ember", { tint: [0xfe6607, 0xfbbe71, 0xfbf1d5, 0x902308], speed: { min: 30, max: 95 }, angle: { min: 200, max: 340 },
        lifespan: { min: 250, max: 520 }, gravityY: -90, scale: { start: 1.2, end: 0 }, blendMode: add }),
      cold: em("fx_shard", { tint: [0xe8faff, 0x7edaf2, 0x3a8fd0], speed: { min: 40, max: 110 }, lifespan: { min: 220, max: 480 },
        gravityY: 160, rotate: { min: 0, max: 360 }, scale: { start: 1.1, end: 0.3 } }),
      lightning: em("fx_spark", { tint: [0xffffff, 0xfff27a, 0x9fe8ff], speed: { min: 70, max: 170 }, lifespan: { min: 90, max: 220 },
        gravityY: 0, scale: { start: 1, end: 0 }, rotate: { min: 0, max: 360 }, blendMode: add }),
      poison: em("fx_bubble", { tint: [0x7bea6a, 0x3f9b3a, 0xc8ff7a], speed: { min: 20, max: 60 }, lifespan: { min: 300, max: 600 },
        gravityY: -30, scale: { start: 0.6, end: 1.2 }, alpha: { start: 1, end: 0 } }),
      shadow: em("fx_ember", { tint: [0xa45dff, 0x5dff3d, 0x310e8b], speed: { min: 20, max: 70 }, lifespan: { min: 300, max: 600 },
        gravityY: -50, scale: { start: 1.3, end: 0 }, blendMode: add }),
    };
    this.drift = {
      fire: em("fx_ember", { tint: [0xfe6607, 0xfbbe71, 0xfbf1d5], speedX: { min: -8, max: 8 }, speedY: { min: -40, max: -18 },
        lifespan: { min: 350, max: 650 }, scale: { start: 1, end: 0 }, blendMode: add }),
      cold: em("fx_flake", { tint: [0xffffff, 0xbfefff], speedX: { min: -6, max: 6 }, speedY: { min: 8, max: 22 },
        lifespan: { min: 500, max: 900 }, alpha: { start: 1, end: 0 }, rotate: { min: 0, max: 90 } }),
      lightning: em("fx_spark", { tint: [0xffffff, 0xfff27a], speed: { min: 20, max: 60 }, lifespan: { min: 60, max: 140 },
        scale: { start: 1, end: 0.2 }, rotate: { min: 0, max: 360 }, blendMode: add }),
      poison: em("fx_bubble", { tint: [0x7bea6a, 0xc8ff7a], speedX: { min: -5, max: 5 }, speedY: { min: -25, max: -10 },
        lifespan: { min: 400, max: 750 }, scale: { start: 0.4, end: 1 }, alpha: { start: 0.9, end: 0 } }),
      shadow: em("fx_ember", { tint: [0xa45dff, 0x5dff3d], speedX: { min: -10, max: 10 }, speedY: { min: -30, max: -12 },
        lifespan: { min: 400, max: 700 }, scale: { start: 1, end: 0 }, blendMode: add }),
    };
  }

  /** Burst where an elemental hit lands; `big` for strong blows. */
  impact(el: Element, x: number, y: number, big = false) {
    this.burst[el].explode(big ? 22 : 10, x, y);
    if (el === "fire") this.drift.fire.explode(big ? 6 : 3, x, y);
    if (el === "cold") this.drift.cold.explode(big ? 6 : 3, x, y - 4);
    if (el === "lightning") {
      for (let i = 0; i < (big ? 3 : 2); i++) {
        const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 10;
        this.arc(x, y, x + Math.cos(a) * r, y + Math.sin(a) * r * 0.7, 1);
      }
    }
  }

  /** Status on a body (`w` wide, `h` tall, feet at x,y): emits a particle now and then; call every frame. */
  status(el: Element, x: number, y: number, w: number, h: number, rate = 1) {
    if (Math.random() > 0.18 * rate) return;
    const px = x + (Math.random() - 0.5) * w, py = y - Math.random() * h;
    if (el === "lightning") {
      this.drift.lightning.explode(2, px, py);
      if (Math.random() < 0.25) this.arc(px, py, px + (Math.random() - 0.5) * 12, py + (Math.random() - 0.5) * 10, 1);
    } else if (el === "cold") this.drift.cold.explode(1, px, y - h - 2 + Math.random() * 4);
    else this.drift[el].explode(1, px, py);
  }

  /** A particle along a projectile's flight. */
  trail(el: Element, x: number, y: number) {
    if (Math.random() < 0.5) (el === "cold" ? this.burst.cold : this.drift[el]).explode(1, x, y);
  }

  /** Glow on an elemental weapon: a particle now and then at the weapon socket. */
  weapon(els: Element[], x: number, y: number) {
    if (!els.length || Math.random() > 0.3) return;
    const el = els[Math.floor(Math.random() * els.length)];
    this.drift[el].explode(1, x + (Math.random() - 0.5) * 4, y + (Math.random() - 0.5) * 4);
  }

  /** Short jagged lightning arc. */
  arc(x1: number, y1: number, x2: number, y2: number, width = 1.5) {
    const g = this.scene.add.graphics().setDepth(1e6).setBlendMode(Phaser.BlendModes.ADD);
    const steps = 4;
    const pts = [new Phaser.Math.Vector2(x1, y1)];
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      pts.push(new Phaser.Math.Vector2(x1 + (x2 - x1) * t + (Math.random() - 0.5) * 6, y1 + (y2 - y1) * t + (Math.random() - 0.5) * 6));
    }
    pts.push(new Phaser.Math.Vector2(x2, y2));
    g.lineStyle(width + 1.5, 0x9fe8ff, 0.5).strokePoints(pts);
    g.lineStyle(width, 0xffffff, 1).strokePoints(pts);
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 120, onComplete: () => g.destroy() });
  }

  private makeTextures() {
    const t = this.scene.textures;
    if (t.exists("fx_ember")) return;
    const g = this.scene.make.graphics({ x: 0, y: 0 }, false);
    const tex = (key: string, w: number, h: number, draw: () => void) => {
      g.clear();
      draw();
      g.generateTexture(key, w, h);
    };
    tex("fx_ember", 3, 3, () => g.fillStyle(0xffffff, 0.6).fillRect(0, 1, 3, 1).fillRect(1, 0, 1, 3).fillStyle(0xffffff).fillRect(1, 1, 1, 1));
    tex("fx_shard", 4, 2, () => g.fillStyle(0xffffff).fillRect(0, 0, 3, 1).fillRect(1, 1, 3, 1));
    tex("fx_flake", 5, 5, () => g.fillStyle(0xffffff).fillRect(2, 0, 1, 5).fillRect(0, 2, 5, 1).fillStyle(0xffffff, 0.5)
      .fillRect(1, 1, 1, 1).fillRect(3, 3, 1, 1).fillRect(3, 1, 1, 1).fillRect(1, 3, 1, 1));
    tex("fx_spark", 4, 1, () => g.fillStyle(0xffffff).fillRect(0, 0, 4, 1));
    tex("fx_bubble", 4, 4, () => g.fillStyle(0xffffff).fillRect(1, 0, 2, 1).fillRect(1, 3, 2, 1).fillRect(0, 1, 1, 2).fillRect(3, 1, 1, 2).fillRect(1, 1, 1, 1));
    g.destroy();
  }
}
