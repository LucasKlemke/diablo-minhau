import Phaser from "phaser";
import { hasSprite, kilnImage, KilnSprite, type SpriteName } from "../kiln";
import { CinematicUi } from "../ui/cinematic";

// Small toolkit for cutscenes played in the engine (IntroScene now, in-game scenes later): every step is a
// promise on the scene clock, so holding the speed-up button (CinematicUi) runs the whole timeline faster.

export class Director {
  /** Set when the scene was skipped or left: timelines check it after each await and stop. */
  ended = false;

  constructor(readonly scene: Phaser.Scene, readonly ui: CinematicUi) {}

  wait(ms: number) {
    return new Promise<void>((r) => this.scene.time.delayedCall(ms, () => r()));
  }

  /** Narration line. */
  say(key: string, text: string, hold = 2600) {
    return this.ui.say(key, text, hold, (ms) => this.wait(ms));
  }

  /** A character's line, with their name above it. */
  line(key: string, speaker: string, text: string, hold = 2600) {
    return this.ui.say(key, text, hold, (ms) => this.wait(ms), speaker);
  }

  /** A SpriteKiln character standing at x, y (falls back to its base sprite while its export is missing). */
  actor(name: SpriteName, x: number, y: number, face: [number, number] = [0, 1], opts: { tint?: number; scale?: number } = {}) {
    const a = new KilnSprite(this.scene, x, y, name);
    a.face(face[0], face[1]);
    a.play2("idle");
    a.setDepth(y);
    // Tint and scale only dress up the stand-in sprite; the real export already has the right look.
    if (!hasSprite(name)) {
      if (opts.tint !== undefined) a.setTint(opts.tint);
      if (opts.scale !== undefined) a.setScale(opts.scale);
    }
    return a;
  }

  /** A SpriteKiln prop, or `fallback` while its export is missing. */
  prop(name: SpriteName, x: number, y: number, fallback: () => Phaser.GameObjects.GameObject & { setDepth(d: number): unknown }) {
    const o = hasSprite(name) ? kilnImage(this.scene, x, y, name) : fallback();
    o.setDepth(y);
    return o;
  }

  /** Walks an actor through points at `speed` px/s, facing where it goes; resolves on arrival. */
  async walk(a: KilnSprite, pts: { x: number; y: number }[], speed = 60, anim = "walk", timeScale = 1) {
    a.play2(anim, { timeScale });
    for (const p of pts) {
      a.face(p.x - a.x, p.y - a.y);
      const ms = (Phaser.Math.Distance.Between(a.x, a.y, p.x, p.y) / speed) * 1000;
      await new Promise<void>((r) => this.scene.tweens.add({
        targets: a, x: p.x, y: p.y, duration: ms, onUpdate: () => a.setDepth(a.y), onComplete: () => r(),
      }));
    }
    // carry_walk -> carry_idle, walk -> idle.
    const rest = anim.replace("walk", "idle");
    a.play2(a.has(rest) ? rest : "idle");
  }

  /** Plays a one-shot animation and resolves when it ends (or at once if the actor lacks it). */
  anim(a: KilnSprite, name: string, timeScale = 1) {
    if (!a.has(name)) return Promise.resolve();
    return new Promise<void>((r) => a.play2(name, { restart: true, timeScale, onComplete: () => r() }));
  }

  pan(x: number, y: number, ms: number, ease = "Sine.easeInOut") {
    this.scene.cameras.main.pan(x, y, ms, ease);
    return this.wait(ms);
  }

  fadeOut(ms: number, r = 0, g = 0, b = 0) {
    this.scene.cameras.main.fadeOut(ms, r, g, b);
    return this.wait(ms);
  }

  fadeIn(ms: number) {
    this.scene.cameras.main.fadeIn(ms);
    return this.wait(ms);
  }
}
