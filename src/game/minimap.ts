import { MAP_H, MAP_W, TILE, type WorldMap } from "../world/mapgen";

const PX = 2; // canvas pixels per tile
const REVEAL = 13; // tiles revealed around the hero

export interface MapMarker {
  x: number; // world px
  y: number;
  color: string;
  size?: number;
  ring?: boolean; // pulsing quest marker
  glyph?: string;
}

/** Explored-area minimap drawn into the HUD canvas: terrain, fog of war, hero and markers. */
export class Minimap {
  private base = document.createElement("canvas");
  private fog = document.createElement("canvas");
  private fogCtx: CanvasRenderingContext2D;
  private ctx: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement, map: WorldMap) {
    canvas.width = MAP_W * PX;
    canvas.height = MAP_H * PX;
    this.ctx = canvas.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = false;

    this.base.width = this.fog.width = MAP_W * PX;
    this.base.height = this.fog.height = MAP_H * PX;
    const b = this.base.getContext("2d")!;
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        const i = y * MAP_W + x;
        b.fillStyle = map.grass[i] ? ((x + y) % 7 ? "#4f9a37" : "#4a9334") : "#a57a4f";
        b.fillRect(x * PX, y * PX, PX, PX);
      }
    for (const p of map.props) {
      let c = "";
      if (p.kind.startsWith("tree_big") || p.kind === "tree_medium") c = "#245a20";
      else if (p.kind === "house") {
        b.fillStyle = "#b5532e";
        b.fillRect(p.x * PX, (p.y - 2) * PX, 5 * PX, 3 * PX);
        continue;
      } else if (p.kind.startsWith("fence")) c = "#6b3a1f";
      if (!c) continue;
      b.fillStyle = c;
      b.fillRect(p.x * PX, p.y * PX, PX * (p.kind === "tree_big" ? 2 : 1), PX);
    }
    this.fogCtx = this.fog.getContext("2d")!;
    this.fogCtx.fillStyle = "#0c070a";
    this.fogCtx.fillRect(0, 0, this.fog.width, this.fog.height);
    // The village is always known.
    const t = map.town;
    this.fogCtx.clearRect(t.x0 * PX, t.y0 * PX, (t.x1 - t.x0 + 1) * PX, (t.y1 - t.y0 + 2) * PX);
  }

  reveal(wx: number, wy: number) {
    const f = this.fogCtx;
    f.save();
    f.globalCompositeOperation = "destination-out";
    const g = f.createRadialGradient((wx / TILE) * PX, (wy / TILE) * PX, 0, (wx / TILE) * PX, (wy / TILE) * PX, REVEAL * PX);
    g.addColorStop(0, "rgba(0,0,0,1)");
    g.addColorStop(0.75, "rgba(0,0,0,1)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    f.fillStyle = g;
    f.beginPath();
    f.arc((wx / TILE) * PX, (wy / TILE) * PX, REVEAL * PX, 0, Math.PI * 2);
    f.fill();
    f.restore();
  }

  draw(hero: { x: number; y: number }, markers: MapMarker[], time: number) {
    const c = this.ctx;
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.drawImage(this.base, 0, 0);
    c.drawImage(this.fog, 0, 0);
    const pulse = 0.5 + 0.5 * Math.sin(time / 180);
    for (const m of markers) {
      const x = (m.x / TILE) * PX, y = (m.y / TILE) * PX;
      if (m.ring) {
        c.strokeStyle = m.color;
        c.lineWidth = 2;
        c.beginPath();
        c.arc(x, y, 6 + pulse * 5, 0, Math.PI * 2);
        c.stroke();
      }
      if (m.glyph) {
        c.font = "bold 14px monospace";
        c.textAlign = "center";
        c.fillStyle = "#1c0f1a";
        c.fillText(m.glyph, x + 1, y - 3);
        c.fillStyle = m.color;
        c.fillText(m.glyph, x, y - 4);
      }
      const s = m.size ?? 3;
      c.fillStyle = m.color;
      c.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
    }
    // Hero: white with a dark rim, always on top.
    const hx = (hero.x / TILE) * PX, hy = (hero.y / TILE) * PX;
    c.fillStyle = "#1c0f1a";
    c.fillRect(hx - 3, hy - 3, 6, 6);
    c.fillStyle = "#ffffff";
    c.fillRect(hx - 2, hy - 2, 4, 4);
  }
}
