import Phaser from "phaser";
import type { DeathKind } from "../data/classes";
import type { KilnSprite } from "../kiln";

// Skill-specific enemy deaths built from the enemy's current SpriteKiln frame:
// cut in half, frozen and shattered, impaled, burnt to a crisp, electrocuted, soul ripped out,
// melted, crushed flat or blown to pieces. Works for any enemy sprite.

type Emitter = Phaser.GameObjects.Particles.ParticleEmitter;

export interface DeathCtx {
  scene: Phaser.Scene;
  emitters: Record<"blood" | "fire" | "frost" | "shadow" | "smoke" | "dust", Emitter>;
  splat(x: number, y: number, n: number): void;
  gibs(x: number, y: number, n: number, tint?: number): void;
  addDecal(img: Phaser.GameObjects.Image): void;
  ringFx(x: number, y: number, radius: number, tint: number, ms: number): void;
  hero: { x: number; y: number };
}

export interface DeathResult {
  /** The body stays on the ground (and can be used by Corpse Explosion). */
  corpse: boolean;
  /** Spread a blood pool under the body. */
  pool: boolean;
  /** Extra objects to fade out with the corpse. */
  remains: Phaser.GameObjects.GameObject[];
}

/** A still copy of the sprite's current frame. */
function frameCopy(scene: Phaser.Scene, s: KilnSprite) {
  return scene.add.image(s.x, s.y, s.texture.key, s.frame.name)
    .setOrigin(s.originX, s.originY).setFlipX(s.flipX).setScale(s.scaleX, s.scaleY).setDepth(s.depth);
}

/** Geometry mask whose polygon (px around the pivot, unscaled) follows `img`. */
function polyMask(scene: Phaser.Scene, img: Phaser.GameObjects.Image, pts: [number, number][]) {
  const g = scene.make.graphics({ x: img.x, y: img.y }, false);
  g.fillStyle(0xffffff);
  g.fillPoints(pts.map(([x, y]) => new Phaser.Math.Vector2(x, y)), true);
  g.setScale(img.scaleX, img.scaleY);
  img.setMask(g.createGeometryMask());
  return g;
}

const lerpColor = (a: number, b: number, t: number) => {
  const c = Phaser.Display.Color.Interpolate.ColorWithColor(
    Phaser.Display.Color.ValueToColor(a), Phaser.Display.Color.ValueToColor(b), 100, Math.round(t * 100));
  return Phaser.Display.Color.GetColor(c.r, c.g, c.b);
};

/** Blood droplets flying along `angle`, each leaving a splat where it lands. */
function spray(ctx: DeathCtx, x: number, y: number, angle: number, n: number, spread = 0.45) {
  const { scene } = ctx;
  for (let i = 0; i < n; i++) {
    const a = angle + (Math.random() - 0.5) * spread * 2;
    const dist = 14 + Math.random() * 34;
    const tx = x + Math.cos(a) * dist, ty = y + Math.sin(a) * dist * 0.6 + 12;
    const d = scene.add.image(x, y, "px").setTint(Math.random() < 0.5 ? 0x8a0f1a : 0xc1272d).setDepth(y + 30)
      .setScale(Math.random() < 0.3 ? 1.5 : 1);
    scene.tweens.add({ targets: d, x: tx, duration: 260 + Math.random() * 160 });
    scene.tweens.add({
      targets: d, y: { from: y, to: ty }, duration: 260 + Math.random() * 160, ease: (t: number) => t + Math.sin(t * Math.PI) * -0.8,
      onComplete: () => {
        d.destroy();
        if (Math.random() < 0.6) ctx.splat(tx, ty, 1);
      },
    });
  }
}

/**
 * Plays the death for `kind`. `angle` points from the killer to the victim (radians),
 * `height` is the victim's body height in px (unscaled).
 */
export function playDeath(ctx: DeathCtx, spr: KilnSprite, kind: DeathKind, angle: number, height: number, opts: { toHero?: boolean; big?: boolean } = {}): DeathResult {
  const { scene, emitters } = ctx;
  const s = spr.scaleX;
  const cx = spr.x, cy = spr.y - height * 0.5 * s;
  const remains: Phaser.GameObjects.GameObject[] = [];
  const fs = spr.meta.frame_size;
  const px = spr.meta.pivot.x, py = spr.meta.pivot.y;

  switch (kind) {
    case "slice": {
      // Cut in half along a slanted line through the waist; the top flies off, the legs topple.
      spr.anims.pause();
      spr.setVisible(false);
      const cut = -height * (0.45 + Math.random() * 0.1);
      const slope = (Math.random() - 0.5) * 0.8;
      const w = fs;
      const top = frameCopy(scene, spr), bottom = frameCopy(scene, spr);
      const mTop = polyMask(scene, top, [[-w, -py - 2], [w, -py - 2], [w, cut + slope * w], [-w, cut - slope * w]]);
      const mBot = polyMask(scene, bottom, [[-w, cut - slope * w], [w, cut + slope * w], [w, fs - py + 2], [-w, fs - py + 2]]);
      remains.push(top, bottom, mTop, mBot);
      const away = Math.cos(angle) >= 0 ? 1 : -1;
      const sync = (img: Phaser.GameObjects.Image, g: Phaser.GameObjects.Graphics) => () => g.setPosition(img.x, img.y).setRotation(img.rotation);
      // Top half: launched up and away, spinning, then lands on its side.
      const landX = top.x + Math.cos(angle) * (14 + Math.random() * 10), landY = top.y + 4 + Math.sin(angle) * 8;
      scene.tweens.add({ targets: top, x: landX, rotation: away * (1.3 + Math.random() * 0.6), duration: 520, ease: "Quad.easeOut", onUpdate: sync(top, mTop) });
      scene.tweens.add({
        targets: top, y: { from: top.y, to: landY - cut * s * 0.2 }, duration: 520,
        ease: (t: number) => t + Math.sin(t * Math.PI) * -1.4, onUpdate: sync(top, mTop),
        onComplete: () => {
          top.setDepth(landY - 4);
          ctx.splat(landX, landY, 2);
          emitters.blood.explode(10, landX, landY - 4);
        },
      });
      // Legs: stand a moment, fountain blood, then fall over.
      scene.tweens.add({ targets: bottom, rotation: -away * (1.2 + Math.random() * 0.3), delay: 380, duration: 330, ease: "Quad.easeIn", onUpdate: sync(bottom, mBot) });
      const stump = () => {
        const r = bottom.rotation, yy = cut * s;
        return { x: bottom.x - yy * Math.sin(r), y: bottom.y + yy * Math.cos(r) };
      };
      scene.time.addEvent({ delay: 55, repeat: 14, callback: () => {
        const p = stump();
        emitters.blood.explode(5, p.x, p.y);
      } });
      emitters.blood.explode(26, cx, cy);
      spray(ctx, cx, cy, angle, 10);
      ctx.splat(cx, spr.y, 3);
      return { corpse: true, pool: true, remains };
    }

    case "freeze": {
      // Frozen solid, ice crackles, then the statue shatters into shards.
      spr.anims.pause();
      spr.setTint(0x8fd8f2);
      const ice = frameCopy(scene, spr).setTint(0x7edaf2).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD).setDepth(spr.depth + 1);
      scene.tweens.add({ targets: ice, alpha: 0.6, duration: 160 });
      emitters.frost.explode(14, cx, cy);
      const hold = 450 + Math.random() * 300;
      scene.tweens.add({ targets: spr, x: spr.x + 1, duration: 40, yoyo: true, repeat: Math.floor(hold / 80), delay: 120 });
      scene.time.delayedCall(hold, () => {
        spr.setVisible(false);
        ice.destroy();
        emitters.frost.explode(36, cx, cy);
        ctx.ringFx(spr.x, spr.y, 26 * s, 0x9fe8ff, 260);
        const cell = 6;
        for (let y = -height; y < 0; y += cell)
          for (let x = -12; x < 12; x += cell) {
            if (Math.random() < 0.15) continue;
            // Origin at the cell's centre so each shard spins around itself.
            const shard = scene.add.image(spr.x + (x + cell / 2) * s, spr.y + (y + cell / 2) * s, spr.texture.key, spr.frame.name)
              .setOrigin((px + x + cell / 2) / fs, (py + y + cell / 2) / fs).setScale(s).setDepth(spr.depth + 2)
              .setTint(0x7fcff0);
            if (Math.random() < 0.55) shard.setTintFill(Math.random() < 0.5 ? 0xd6f3ff : 0xa8e4f8);
            shard.setCrop(px + x, py + y, cell, cell);
            const a = Math.atan2(y + height * 0.5, x) + (Math.random() - 0.5) * 0.8;
            const dist = 10 + Math.random() * 30;
            const groundY = spr.y + Math.sin(a) * dist * 0.5 + 2;
            scene.tweens.add({ targets: shard, x: shard.x + Math.cos(a) * dist, angle: (Math.random() - 0.5) * 540, duration: 420 + Math.random() * 200 });
            scene.tweens.add({
              targets: shard, y: { from: shard.y, to: groundY }, duration: 420 + Math.random() * 200,
              ease: (t: number) => t + Math.sin(t * Math.PI) * -1.2,
              onComplete: () => shard.setDepth(-2),
            });
            remains.push(shard);
          }
        ctx.splat(spr.x, spr.y, 2);
        const frost = scene.add.image(spr.x, spr.y, "disc").setTint(0x9fe8ff).setAlpha(0.6).setDepth(-3).setScale(0.6 * s, 0.35 * s);
        ctx.addDecal(frost);
      });
      remains.push(ice);
      return { corpse: false, pool: false, remains };
    }

    case "pierce": {
      // Impaled: knocked back along the shot, arrows stuck in the body, blood sprayed out the back.
      const n = 1 + Math.floor(Math.random() * (opts.big ? 4 : 2));
      const kx = Math.cos(angle) * (opts.big ? 22 : 12), ky = Math.sin(angle) * (opts.big ? 14 : 8);
      const arrows: Phaser.GameObjects.Image[] = [];
      for (let i = 0; i < n; i++) {
        const oy = -height * (0.35 + Math.random() * 0.35) * s, ox = (Math.random() - 0.5) * 6;
        const a = angle + (Math.random() - 0.5) * 0.3;
        const arrow = scene.add.image(spr.x + ox - Math.cos(a) * 3, spr.y + oy - Math.sin(a) * 3, "fx_arrow_px")
          .setRotation(a).setDepth(spr.depth + 1);
        arrows.push(arrow);
      }
      remains.push(...arrows);
      scene.tweens.add({ targets: [spr, ...arrows], x: `+=${kx}`, y: `+=${ky}`, duration: 170, ease: "Quad.easeOut" });
      spray(ctx, cx + kx, cy + ky, angle, opts.big ? 18 : 10, 0.35);
      emitters.blood.explode(12, cx, cy);
      spr.play2("death", { restart: true });
      scene.time.delayedCall(500, () => arrows.forEach((a) => a.setDepth(spr.y - 5)));
      return { corpse: true, pool: true, remains };
    }

    case "burn": {
      // Set ablaze, charred black while falling, smoke and an ash stain.
      spr.play2("death", { restart: true, timeScale: 0.7 });
      scene.time.addEvent({ delay: 60, repeat: 18, callback: () => {
        emitters.fire.explode(3, spr.x + (Math.random() - 0.5) * 12 * s, spr.y - Math.random() * height * s);
        if (Math.random() < 0.4) emitters.smoke.explode(1, spr.x, spr.y - height * s);
      } });
      scene.tweens.addCounter({ from: 0, to: 1, duration: 1000, onUpdate: (tw) => spr.setTint(lerpColor(0xff8a3a, 0x2a1a14, tw.getValue() ?? 0)) });
      if (opts.big) ctx.gibs(cx, cy, 5, 0x2a1a14);
      const ash = scene.add.image(spr.x, spr.y + 1, "disc").setTint(0x1c0f1a).setAlpha(0).setDepth(-3).setScale(0.5 * s, 0.3 * s);
      scene.tweens.add({ targets: ash, alpha: 0.75, duration: 900 });
      ctx.addDecal(ash);
      return { corpse: true, pool: false, remains };
    }

    case "shock": {
      // Electrocuted: flickers between bright and skeletal dark, twitches, then drops smoking.
      spr.anims.pause();
      let on = false;
      const ox = spr.x;
      scene.time.addEvent({ delay: 45, repeat: 12, callback: () => {
        on = !on;
        if (on) spr.setTintFill(0xe8f6ff);
        else spr.setTint(0x30304a);
        spr.x = ox + (Math.random() - 0.5) * 2;
        emitters.frost.explode(3, spr.x + (Math.random() - 0.5) * 14, cy + (Math.random() - 0.5) * height * s);
      } });
      scene.time.delayedCall(600, () => {
        spr.x = ox;
        spr.setTint(0x3a3a50);
        spr.play2("death", { restart: true });
        for (let i = 0; i < 6; i++) scene.time.delayedCall(i * 150, () => emitters.smoke.explode(2, spr.x, spr.y - height * 0.6 * s));
      });
      return { corpse: true, pool: true, remains };
    }

    case "soul": {
      // The body withers as its glowing soul is torn out (and flies into the caster when draining).
      spr.play2("death", { restart: true });
      scene.tweens.addCounter({ from: 0, to: 1, duration: 600, onUpdate: (tw) => spr.setTint(lerpColor(0xffffff, 0x7a6a8a, tw.getValue() ?? 0)) });
      const ghost = frameCopy(scene, spr).setTint(0x5dff3d).setAlpha(0.85).setBlendMode(Phaser.BlendModes.ADD).setDepth(1e5);
      emitters.shadow.explode(16, cx, cy);
      if (opts.toHero) {
        scene.tweens.add({ targets: ghost, x: ctx.hero.x, y: ctx.hero.y, scale: 0.4 * s, alpha: 0.2, duration: 650, ease: "Quad.easeIn",
          onComplete: () => { emitters.shadow.explode(10, ctx.hero.x, ctx.hero.y - 14); ghost.destroy(); } });
      } else {
        scene.tweens.add({ targets: ghost, y: ghost.y - 36, alpha: 0, scaleX: s * 0.6, scaleY: s * 1.3, duration: 1200, ease: "Sine.easeOut", onComplete: () => ghost.destroy() });
      }
      return { corpse: true, pool: true, remains };
    }

    case "melt": {
      // Dissolves into bubbling green goo.
      spr.anims.pause();
      scene.tweens.addCounter({ from: 0, to: 1, duration: 500, onUpdate: (tw) => spr.setTint(lerpColor(0xffffff, 0x5dff3d, tw.getValue() ?? 0)) });
      scene.tweens.add({ targets: spr, scaleY: s * 0.1, scaleX: s * 1.6, alpha: 0.6, duration: 1100, ease: "Quad.easeIn", onComplete: () => spr.setVisible(false) });
      scene.time.addEvent({ delay: 90, repeat: 12, callback: () => emitters.shadow.explode(3, spr.x + (Math.random() - 0.5) * 16, spr.y - 2) });
      const goo = scene.add.image(spr.x, spr.y + 1, "disc").setTint(0x2c6226).setAlpha(0.85).setDepth(-3).setScale(0.1);
      scene.tweens.add({ targets: goo, scaleX: 0.75 * s, scaleY: 0.42 * s, duration: 1100 });
      ctx.addDecal(goo);
      ctx.splat(spr.x, spr.y, 1);
      return { corpse: false, pool: false, remains };
    }

    case "crush": {
      // Flattened by the impact.
      spr.anims.pause();
      scene.tweens.add({ targets: spr, scaleY: s * 0.28, scaleX: s * 1.45, duration: 80, ease: "Quad.easeOut" });
      spr.setTint(0xd09090);
      for (let i = 0; i < 6; i++) spray(ctx, spr.x, spr.y - 4, (i / 6) * Math.PI * 2, 3, 0.5);
      ctx.gibs(cx, spr.y - 6, 3);
      ctx.splat(spr.x, spr.y, 4);
      return { corpse: true, pool: true, remains };
    }

    case "gib": {
      // Blown to pieces.
      spr.setVisible(false);
      ctx.gibs(cx, cy, opts.big ? 14 : 10);
      for (let i = 0; i < 8; i++) spray(ctx, cx, cy, (i / 8) * Math.PI * 2, 3, 0.4);
      ctx.splat(spr.x, spr.y, 4);
      return { corpse: false, pool: true, remains };
    }

    default: {
      spr.play2("death", { restart: true });
      return { corpse: true, pool: true, remains };
    }
  }
}
