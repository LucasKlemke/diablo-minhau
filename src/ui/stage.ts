import type Phaser from "phaser";
import type { ClassId } from "../data/classes";
import { drawKiln, kilnMeta } from "../kiln";
import { L } from "../i18n";

// Night backdrop for the main and pause menus (Diablo II/III style): ruins against the moon, a dark tree
// line, a small campfire and the player's heroes, drawn from their SpriteKiln sprites. The main hero stands
// large on a stone pedestal; the other saved heroes wait behind it in the dark.

export interface StageOpts {
  textures: Phaser.Textures.TextureManager;
  /** Horizontal position of the main hero, as a fraction of the screen width. */
  heroX: number;
  /** Draw the campfire next to the hero, on this side (-1 left, 1 right). */
  fire?: -1 | 1;
  /** Ground line of the hero, as a fraction of the screen height. */
  heroY?: number;
}

interface Ember { x: number; y: number; vx: number; vy: number; life: number }

export interface Stage {
  /** The hero on the pedestal (null: an empty pedestal) and the ones waiting behind it. */
  set(main: ClassId | null, others: ClassId[]): void;
  /** The main hero plays its cast animation once. */
  cast(): void;
  destroy(): void;
}

export function heroStage(canvas: HTMLCanvasElement, opts: StageOpts): Stage {
  const ctx = canvas.getContext("2d")!;
  let W = 0, H = 0, S = 4;
  const resize = () => {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
    S = Math.max(3, Math.min(12, Math.round(H / 75)));
  };
  resize();
  window.addEventListener("resize", resize);

  let main: ClassId | null = null;
  let others: ClassId[] = [];
  let clip: { anim: string; at: number; until: number } | null = null;
  let swapAt = -1e9; // fade-in of a newly chosen hero
  const embers: Ember[] = [];
  const t0 = performance.now();
  let raf = 0;
  const stars = Array.from({ length: 80 }, () => ({ x: Math.random(), y: Math.random() * 0.5, r: Math.random() * 1.4 + 0.3, p: Math.random() * 6 }));
  const trees = Array.from({ length: 40 }, (_, i) => ({ x: i / 39 + (Math.random() - 0.5) * 0.03, h: 0.12 + Math.random() * 0.16, w: 0.03 + Math.random() * 0.03 }));
  const clouds = Array.from({ length: 6 }, (_, i) => ({ x: Math.random(), y: 0.08 + i * 0.05, w: 0.25 + Math.random() * 0.25, s: 0.4 + Math.random() * 0.6 }));

  const heroAt = () => ({ x: W * opts.heroX, y: H * (opts.heroY ?? 0.86) });
  const fireAt = () => ({ x: W * opts.heroX + (opts.fire ?? -1) * 34 * S, y: heroAt().y + 3 * S });

  function draw() {
    if (!canvas.isConnected && performance.now() - t0 > 500) return destroy(); // the menu was removed
    const now = performance.now() - t0;
    const flick = 0.85 + 0.15 * Math.sin(now / 90) * Math.sin(now / 37 + 1);
    const h = heroAt();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;

    // Sky, stars, moon and drifting clouds.
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#05070f");
    sky.addColorStop(0.5, "#151628");
    sky.addColorStop(1, "#0a0608");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    for (const s of stars) {
      ctx.globalAlpha = 0.35 + 0.4 * Math.sin(now / 900 + s.p);
      ctx.fillStyle = "#cfd8ff";
      ctx.fillRect(s.x * W, s.y * H, s.r, s.r);
    }
    ctx.globalAlpha = 1;
    const mx = W * 0.82, my = H * 0.17;
    const moon = ctx.createRadialGradient(mx, my, 2, mx, my, H * 0.16);
    moon.addColorStop(0, "rgba(235,238,255,0.95)");
    moon.addColorStop(0.18, "rgba(200,210,255,0.4)");
    moon.addColorStop(1, "rgba(200,210,255,0)");
    ctx.fillStyle = moon;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(40,42,60,0.55)";
    for (const c of clouds) {
      const x = ((c.x + now / 1e6 * c.s * 8) % 1.4) * W - 0.2 * W;
      ctx.beginPath();
      ctx.ellipse(x, c.y * H, c.w * W * 0.5, H * 0.018, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ruined towers and the tree line.
    ctx.fillStyle = "#0c0d16";
    const base = H * 0.62;
    for (const [fx, fw, fh] of [[0.58, 0.035, 0.3], [0.63, 0.06, 0.18], [0.91, 0.04, 0.36], [0.95, 0.05, 0.22], [0.3, 0.03, 0.14]]) {
      const x = fx * W, w = fw * W, top = base - fh * H;
      ctx.fillRect(x, top, w, base - top);
      // Broken battlements.
      for (let i = 0; i < 4; i++) if ((i + Math.round(fx * 10)) % 3) ctx.fillRect(x + (i * w) / 4, top - H * 0.015, w / 6, H * 0.015);
    }
    ctx.fillStyle = "#06080d";
    for (const t of trees) {
      const x = t.x * W, sway = Math.sin(now / 1800 + t.x * 20) * 3;
      ctx.beginPath();
      ctx.moveTo(x - t.w * W, base + H * 0.04);
      ctx.lineTo(x + sway, base - t.h * H);
      ctx.lineTo(x + t.w * W, base + H * 0.04);
      ctx.fill();
    }
    const ground = ctx.createLinearGradient(0, base, 0, H);
    ground.addColorStop(0, "#07080b");
    ground.addColorStop(1, "#120b0b");
    ctx.fillStyle = ground;
    ctx.fillRect(0, base + H * 0.03, W, H);

    // Fire and moon light on the ground.
    const f = fireAt();
    if (opts.fire) {
      const glowR = H * 0.5 * flick;
      const g = ctx.createRadialGradient(f.x, f.y, 4, f.x, f.y, glowR);
      g.addColorStop(0, "rgba(255,150,60,0.5)");
      g.addColorStop(0.4, "rgba(150,70,30,0.25)");
      g.addColorStop(1, "rgba(20,10,10,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(f.x, f.y, glowR, glowR * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Heroes waiting behind, in the dark.
    others.forEach((c, i) => {
      const side = i % 2 ? 1 : -1, row = Math.floor(i / 2);
      const x = h.x + side * (20 + row * 14) * S * 0.75;
      const y = h.y - (14 + row * 6) * S * 0.4;
      ctx.save();
      ctx.filter = "brightness(0.45) saturate(0.6)";
      drawKiln(ctx, opts.textures, c, "idle", side < 0 ? "se" : "sw", now + i * 300, x, y, Math.max(2, Math.round(S * 0.6)));
      ctx.restore();
    });

    // Pedestal.
    ctx.fillStyle = "#1d1a22";
    ctx.beginPath();
    ctx.ellipse(h.x, h.y + S * 2, 17 * S, 5 * S, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2c2832";
    ctx.beginPath();
    ctx.ellipse(h.x, h.y, 16 * S, 4.4 * S, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(255,190,90,${0.35 + 0.15 * Math.sin(now / 600)})`;
    ctx.lineWidth = Math.max(2, S / 3);
    ctx.beginPath();
    ctx.ellipse(h.x, h.y, 13 * S, 3.4 * S, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Fire (beside the pedestal) and the main hero, back to front.
    const drawHero = () => {
      if (!main) return;
      const c = clip && now < clip.until ? clip : null;
      ctx.save();
      ctx.globalAlpha = Math.min(1, (now - swapAt) / 350);
      ctx.shadowColor = "rgba(255,200,120,0.35)";
      ctx.shadowBlur = 30;
      drawKiln(ctx, opts.textures, main, c ? c.anim : "idle", "s", c ? now - c.at : now, h.x, h.y, S);
      ctx.restore();
    };
    if (opts.fire) {
      if (f.y < h.y) { drawFire(f.x, f.y, now, flick); drawHero(); } else { drawHero(); drawFire(f.x, f.y, now, flick); }
      if (Math.random() < 0.4) embers.push({ x: f.x + (Math.random() - 0.5) * 6 * S, y: f.y - 6 * S, vx: (Math.random() - 0.5) * 0.6, vy: -0.8 - Math.random() * 1.4, life: 1 });
    } else drawHero();
    if (!main) {
      ctx.font = `${Math.round(S * 2.4)}px Silkscreen, monospace`;
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(236,227,207,0.5)";
      ctx.fillText(L("Nenhum herói ainda", "No heroes yet"), h.x, h.y - 12 * S);
    }

    // Embers and a warm light near the fire.
    for (const e of embers) {
      e.x += e.vx + Math.sin(now / 300 + e.y) * 0.3;
      e.y += e.vy;
      e.life -= 0.008;
      ctx.globalAlpha = Math.max(0, e.life);
      ctx.fillStyle = e.life > 0.6 ? "#ffd27a" : "#ff7a2a";
      ctx.fillRect(e.x, e.y, 2, 2);
    }
    ctx.globalAlpha = 1;
    for (let i = embers.length - 1; i >= 0; i--) if (embers[i].life <= 0) embers.splice(i, 1);
    if (opts.fire) {
      ctx.globalCompositeOperation = "lighter";
      const warm = ctx.createRadialGradient(f.x, f.y - 8 * S, 4, f.x, f.y - 8 * S, H * 0.35 * flick);
      warm.addColorStop(0, "rgba(255,140,50,0.18)");
      warm.addColorStop(1, "rgba(255,140,50,0)");
      ctx.fillStyle = warm;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "source-over";
    }

    // Vignette.
    const vig = ctx.createRadialGradient(h.x, H * 0.6, H * 0.25, h.x, H * 0.6, H * 1.05);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.8)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
    raf = requestAnimationFrame(draw);
  }

  function drawFire(x: number, y: number, now: number, flick: number) {
    const k = Math.max(2, Math.round(S * 0.7));
    if (kilnMeta("campfire") && drawKiln(ctx, opts.textures, "campfire", "idle", "s", now, x, y, k)) return;
    for (const [col, r, hh] of [["#c1272d", 6, 14], ["#fe6607", 4.5, 10], ["#fbbe71", 3, 7]] as [string, number, number][]) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(x - r * k, y);
      ctx.quadraticCurveTo(x + Math.sin(now / 110) * k, y - hh * k * flick, x + r * k, y);
      ctx.fill();
    }
  }

  function destroy() {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
  }

  raf = requestAnimationFrame(draw);
  return {
    set(m, o) {
      if (m !== main) swapAt = performance.now() - t0;
      main = m;
      others = o;
      clip = null;
    },
    cast() {
      if (!main) return;
      const a = kilnMeta(main)?.animations.cast;
      const dur = a ? Object.values(a.directions)[0]!.durations.reduce((s, v) => s + v, 0) : 0;
      const now = performance.now() - t0;
      clip = { anim: "cast", at: now, until: now + dur };
    },
    destroy,
  };
}
