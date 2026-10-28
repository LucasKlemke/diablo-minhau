import Phaser from "phaser";

// Biome skins built at boot from the Farm RPG art: every greenish pixel is remapped by brightness
// onto another ramp (murky swamp, snow), so tiles, trees and plants keep their shapes and shading.

const RAMPS: Record<"swamp" | "snow", string[]> = {
  swamp: ["#141c18", "#22362b", "#34503c", "#4d6a4a", "#6c845a", "#8a9a6a"],
  snow: ["#4a5878", "#7487a8", "#a6b6d0", "#ccd8ea", "#e6eef8", "#ffffff"],
};

const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** Adds `<key>_<skin>` textures for each source key, copying its frames. */
export function makeSkins(scene: Phaser.Scene, keys: string[]) {
  for (const skin of ["swamp", "snow"] as const) {
    const ramp = RAMPS[skin].map(hex);
    for (const key of keys) {
      const src = scene.textures.get(key);
      const img = src.getSourceImage() as HTMLImageElement;
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height);
      const p = data.data;
      for (let i = 0; i < p.length; i += 4) {
        if (p[i + 3] === 0) continue;
        const r = p[i], g = p[i + 1], b = p[i + 2];
        if (!(g > r + 6 && g >= b)) continue; // only foliage greens
        const l = (0.3 * r + 0.59 * g + 0.11 * b - 40) / 170;
        const k = Math.max(0, Math.min(ramp.length - 1, Math.round(l * (ramp.length - 1))));
        [p[i], p[i + 1], p[i + 2]] = ramp[k];
      }
      ctx.putImageData(data, 0, 0);
      const out = scene.textures.addCanvas(`${key}_${skin}`, c)!;
      // Copy named and numbered frames (atlas regions, spritesheet cells).
      for (const name of src.getFrameNames()) {
        const f = src.get(name);
        out.add(name, 0, f.cutX, f.cutY, f.cutWidth, f.cutHeight);
      }
    }
  }
}

/** Procedural ground, dungeon and effect textures. */
export function makeWorldTextures(scene: Phaser.Scene) {
  const canvas = (key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d")!;
    draw(ctx);
    scene.textures.addCanvas(key, c);
  };
  const speckle = (ctx: CanvasRenderingContext2D, base: string, dots: string[], n: number, seed: number) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 16, 16);
    let s = seed;
    const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = dots[Math.floor(r() * dots.length)];
      ctx.fillRect(Math.floor(r() * 15), Math.floor(r() * 16), 1 + Math.floor(r() * 2), 1);
    }
  };
  canvas("mud", 16, 16, (ctx) => speckle(ctx, "#4a3a2c", ["#3a2c22", "#5a4836", "#2f3a2a"], 9, 3));
  canvas("rock", 16, 16, (ctx) => speckle(ctx, "#8a8e9a", ["#767a88", "#a2a6b2", "#c8ccd8"], 10, 7));

  // Dungeon tileset: 0-1 floor, 2 wall face (bricks), 3 wall top (void).
  canvas("dtiles", 64, 16, (ctx) => {
    for (const ox of [0, 16]) {
      ctx.fillStyle = "#3a3440";
      ctx.fillRect(ox, 0, 16, 16);
      ctx.fillStyle = "#2c2732";
      ctx.fillRect(ox, 7, 16, 1);
      ctx.fillRect(ox, 15, 16, 1);
      ctx.fillRect(ox + (ox ? 4 : 10), 0, 1, 7);
      ctx.fillRect(ox + (ox ? 12 : 3), 8, 1, 7);
      ctx.fillStyle = "#463f4e";
      ctx.fillRect(ox + 1, 1, 3, 1);
      ctx.fillRect(ox + 9, 10, 2, 1);
    }
    ctx.fillStyle = "#5a4e5e";
    ctx.fillRect(32, 0, 16, 16);
    ctx.fillStyle = "#3c3242";
    for (const y of [3, 7, 11, 15]) ctx.fillRect(32, y, 16, 1);
    for (const [x, y] of [[36, 0], [44, 4], [38, 8], [46, 12]]) ctx.fillRect(x, y, 1, 3);
    ctx.fillStyle = "#6e6274";
    ctx.fillRect(32, 0, 16, 1);
    ctx.fillStyle = "#120c12";
    ctx.fillRect(48, 0, 16, 16);
  });

  // Portal: a stone arch with a swirling core drawn separately.
  canvas("portal", 24, 32, (ctx) => {
    ctx.fillStyle = "#1c0f1a";
    ctx.fillRect(1, 6, 22, 26);
    ctx.fillStyle = "#6a6478";
    ctx.fillRect(2, 7, 5, 24);
    ctx.fillRect(17, 7, 5, 24);
    ctx.fillRect(2, 4, 20, 5);
    ctx.fillStyle = "#8e88a0";
    ctx.fillRect(3, 8, 2, 22);
    ctx.fillRect(18, 8, 2, 22);
    ctx.fillRect(4, 5, 16, 2);
    ctx.fillStyle = "#c06bff";
    ctx.fillRect(11, 2, 2, 3);
  });
  canvas("swirl", 16, 22, (ctx) => {
    const g = ctx.createRadialGradient(8, 11, 1, 8, 11, 10);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.35, "#c06bff");
    g.addColorStop(1, "rgba(80,20,160,0.2)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(8, 11, 7, 10, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  // Darkness around the hero in dungeons (transparent centre).
  canvas("light", 256, 256, (ctx) => {
    const g = ctx.createRadialGradient(128, 128, 30, 128, 128, 128);
    g.addColorStop(0, "rgba(6,3,8,0)");
    g.addColorStop(0.55, "rgba(6,3,8,0.35)");
    g.addColorStop(1, "rgba(6,3,8,0.94)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  });
  // Light pillar for level-ups and great drops.
  canvas("beam", 16, 128, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 16, 0);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 16, 128);
    ctx.globalCompositeOperation = "destination-in";
    const v = ctx.createLinearGradient(0, 0, 0, 128);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(0.7, "rgba(0,0,0,0.9)");
    v.addColorStop(1, "rgba(0,0,0,1)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, 16, 128);
  });
  // Dungeon decor: bones and candles (3 variants each).
  canvas("bones", 48, 16, (ctx) => {
    ctx.fillStyle = "#1c0f1a";
    for (const ox of [0, 16, 32]) ctx.fillRect(ox + 3, 9, 10, 4);
    ctx.fillStyle = "#e6d6ad";
    ctx.fillRect(4, 10, 8, 1); ctx.fillRect(3, 9, 2, 3); ctx.fillRect(11, 10, 2, 2);
    ctx.fillRect(20, 9, 5, 3); ctx.fillStyle = "#1c0f1a"; ctx.fillRect(21, 10, 1, 1); ctx.fillRect(23, 10, 1, 1);
    ctx.fillStyle = "#e6d6ad"; ctx.fillRect(34, 11, 9, 1); ctx.fillRect(37, 9, 1, 4); ctx.fillRect(40, 9, 1, 4);
  });
  canvas("candle", 48, 16, (ctx) => {
    for (const ox of [0, 16, 32]) {
      ctx.fillStyle = "#1c0f1a";
      ctx.fillRect(ox + 6, 7, 4, 8);
      ctx.fillStyle = "#e6d6ad";
      ctx.fillRect(ox + 7, 8, 2, 6);
      ctx.fillStyle = "#ffc23d";
      ctx.fillRect(ox + 7, 5, 2, 2);
      ctx.fillStyle = "#fff4b0";
      ctx.fillRect(ox + 7, 6, 1, 1);
    }
  });
  for (const key of ["bones", "candle"]) {
    const t = scene.textures.get(key);
    for (let i = 0; i < 3; i++) t.add(i, 0, i * 16, 0, 16, 16);
  }
}
