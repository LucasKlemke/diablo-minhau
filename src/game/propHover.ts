import Phaser from "phaser";
import { KilnSprite } from "../kiln";

// Mouse-over feedback for interactive props (portal, chests, crypt entrances): a pulsing outline glow,
// a small "breath", the SpriteKiln `hover` clip when the prop has one, a name tag and a hand cursor.

interface PropKind {
  label: string;
  /** Hit box around the sprite's pivot (ground point), in world px. */
  box: { x: number; top: number; bottom: number };
  glow: number;
  /** Clips during which hovering must not interrupt the animation. */
  busy: string[];
  /** The prop no longer reacts (an opened chest). */
  spent?: string[];
}

const KINDS: Record<string, PropKind> = {
  portal: { label: "Portal de Pedra", box: { x: 16, top: -44, bottom: 4 }, glow: 0xd08aff, busy: ["activate"] },
  chest: { label: "Baú", box: { x: 10, top: -16, bottom: 4 }, glow: 0xffd23d, busy: ["open"], spent: ["open", "opened"] },
  crypt: { label: "Entrada da Masmorra", box: { x: 40, top: -70, bottom: 10 }, glow: 0xc06bff, busy: [] },
};

export class PropHover {
  private current: KilnSprite | null = null;
  private glow?: Phaser.FX.Glow;
  private tweens: Phaser.Tweens.Tween[] = [];
  private tag = document.createElement("div");

  constructor(private scene: Phaser.Scene, world: HTMLElement) {
    this.tag.className = "prop-tag";
    world.appendChild(this.tag);
    scene.game.events.on(Phaser.Core.Events.POST_RENDER, this.place, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.game.events.off(Phaser.Core.Events.POST_RENDER, this.place, this);
      this.clear();
      this.tag.remove();
    });
  }

  /** `blocked`: something else is under the cursor (an enemy, an NPC). */
  update(wx: number, wy: number, blocked: boolean) {
    const next = blocked ? null : this.find(wx, wy);
    if (next === this.current) return;
    this.clear();
    if (next) this.enter(next);
  }

  private find(wx: number, wy: number): KilnSprite | null {
    for (const o of this.scene.children.list) {
      if (!(o instanceof KilnSprite) || !o.visible) continue;
      const k = KINDS[o.spriteName];
      if (!k || k.spent?.includes(o.current)) continue;
      const dx = Math.abs(wx - o.x), dy = wy - o.y;
      if (dx <= k.box.x * o.scaleX && dy >= k.box.top * o.scaleY && dy <= k.box.bottom) return o;
    }
    return null;
  }

  private enter(spr: KilnSprite) {
    const k = KINDS[spr.spriteName];
    this.current = spr;
    this.scene.input.setDefaultCursor("pointer");
    // Outline glow (WebGL only) that breathes in and out.
    this.glow = spr.preFX?.addGlow(k.glow, 3, 0, false, 0.1, 10);
    if (this.glow) this.tweens.push(this.scene.tweens.add({ targets: this.glow, outerStrength: 7, duration: 450, yoyo: true, repeat: -1, ease: "Sine.easeInOut" }));
    const sy = spr.scaleY;
    this.tweens.push(this.scene.tweens.add({ targets: spr, scaleY: sy * 1.03, duration: 380, yoyo: true, repeat: -1, ease: "Sine.easeInOut" }));
    if (spr.has("hover") && !k.busy.includes(spr.current)) spr.play2("hover", { restart: true });
    this.tag.textContent = k.label;
    this.tag.style.display = "block";
  }

  private clear() {
    const spr = this.current;
    this.current = null;
    for (const t of this.tweens) t.stop();
    this.tweens = [];
    this.scene.input.setDefaultCursor("default");
    this.tag.style.display = "none";
    if (!spr || !spr.active) return;
    if (this.glow) spr.preFX?.remove(this.glow);
    this.glow = undefined;
    spr.setScale(spr.scaleX); // undo the breath
    if (spr.current === "hover") spr.play2("idle", { restart: true });
  }

  /** Keeps the name tag above the hovered prop. */
  private place() {
    const spr = this.current;
    if (!spr) return;
    const cam = this.scene.cameras.main;
    const k = KINDS[spr.spriteName];
    const sx = (spr.x - cam.worldView.x) * cam.zoom, sy = (spr.y + k.box.top * spr.scaleY - 4 - cam.worldView.y) * cam.zoom;
    this.tag.style.transform = `translate(${Math.round(sx)}px, ${Math.round(sy)}px) translate(-50%, -100%)`;
  }
}
