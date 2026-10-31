import { MAP_H, MAP_W, TILE, type WorldMap } from "../world/mapgen";

const PX = 4; // canvas pixels per tile
const REVEAL = 13; // tiles revealed around the hero
const CELL = 2; // tiles per cell of the saved exploration grid
const GW = MAP_W / CELL, GH = MAP_H / CELL;

export interface MapMarker {
  x: number; // world px
  y: number;
  color: string;
  size?: number;
  ring?: boolean; // pulsing quest marker
  glyph?: string;
  /** A small picture instead of the dot (the partner's head), in a dark disc ringed with `color`. */
  img?: CanvasImageSource;
}

/** Minimap colours per ground skin (zones) or dungeon: grass shades, path, obstacle, outline. */
const PALETTES: Record<string, { grass: string[]; dirt: string[]; block: string; edge: string; tree: string[] }> = {
  "": { grass: ["#4f9a37", "#4a9334", "#55a23b"], dirt: ["#a57a4f", "#9c7349", "#ad8256"], block: "#3a3128", edge: "#2f5a22", tree: ["#245a20", "#2f6e28"] },
  blight: { grass: ["#5d5a3c", "#57533a", "#635f40"], dirt: ["#6e6258", "#665a51", "#75695e"], block: "#2a2622", edge: "#3a3826", tree: ["#2f2c22", "#3d3a2c"] },
  swamp: { grass: ["#34503c", "#2f4a37", "#3a5742"], dirt: ["#5a4a36", "#544431", "#61503a"], block: "#1e2a22", edge: "#22362b", tree: ["#1d3326", "#264030"] },
  snow: { grass: ["#ccd8ea", "#c4d1e4", "#d4def0"], dirt: ["#7487a8", "#6c7fa0", "#7b8fb0"], block: "#4a5878", edge: "#a6b6d0", tree: ["#3a5a4a", "#4a6a5a"] },
  dungeon: { grass: ["#4a3e3a", "#463a36", "#4f433e"], dirt: ["#4a3e3a", "#463a36", "#4f433e"], block: "#1a1418", edge: "#6a5a54", tree: ["#2a2024", "#33282c"] },
};
const BUILDING = /house|hut|smithy|lodge|barn|tent|castle_wall|cellar_entrance|butcher_entrance|cave_entrance|crypt|chimney|carriage|cart/;
const WATER = /pool|puddle|well|fountain|basin/;
const FIRE = /fire|campfire|hearth|candle|candelabrum/;
const ROCK = /rock|boulder|stone|stalagmite|rubble|tombstone/;

/** The terrain of the minimap: ground with some grain, outlined paths, obstacles, roofs, trees, water and fires. */
function paintTerrain(b: CanvasRenderingContext2D, map: WorldMap, skin: string) {
  const pal = PALETTES[map.kind === "dungeon" ? "dungeon" : skin] ?? PALETTES[""];
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
  const grass = (x: number, y: number) => !at(x, y) || map.grass[y * MAP_W + x];
  const hash = (x: number, y: number) => ((x * 73856093) ^ (y * 19349663)) >>> 0;
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      const g = grass(x, y), ramp = g ? pal.grass : pal.dirt;
      b.fillStyle = ramp[hash(x, y) % ramp.length];
      b.fillRect(x * PX, y * PX, PX, PX);
      // A speck of grain, and a darker rim where grass meets the path (dungeons: where floor meets wall).
      b.fillStyle = ramp[(hash(x, y) >> 3) % ramp.length];
      b.fillRect(x * PX + (hash(x, y) % 3), y * PX + ((hash(x, y) >> 5) % 3), 1, 1);
      if (map.kind !== "dungeon" && g) {
        b.fillStyle = pal.edge;
        if (!grass(x, y - 1)) b.fillRect(x * PX, y * PX, PX, 1);
        if (!grass(x, y + 1)) b.fillRect(x * PX, y * PX + PX - 1, PX, 1);
        if (!grass(x - 1, y)) b.fillRect(x * PX, y * PX, 1, PX);
        if (!grass(x + 1, y)) b.fillRect(x * PX + PX - 1, y * PX, 1, PX);
      }
    }
  // Dungeon walls: everything that is not floor, lit on the edge facing the room.
  if (map.kind === "dungeon")
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        if (grass(x, y) && !map.blocked[y * MAP_W + x]) continue;
        b.fillStyle = pal.block;
        b.fillRect(x * PX, y * PX, PX, PX);
        if (at(x, y + 1) && grass(x, y + 1)) {
          b.fillStyle = pal.edge;
          b.fillRect(x * PX, y * PX + PX - 1, PX, 1);
        }
      }

  const dot = (x: number, y: number, r: number, color: string) => {
    b.fillStyle = color;
    b.beginPath();
    b.arc(x, y, r, 0, Math.PI * 2);
    b.fill();
  };
  const roofs: { x: number; y: number }[] = [];
  for (const p of map.props) {
    const name = p.name ?? p.kind;
    const cx = (p.x + 0.5) * PX, cy = (p.y + 0.5) * PX;
    if (p.tree || name.startsWith("tree") || /tree|bush/.test(name)) {
      const big = /big|twisted|burnt|dead_tree/.test(name);
      dot(cx + (big ? PX / 2 : 0), cy - PX * 0.4, PX * (big ? 1.3 : 0.9), pal.tree[0]);
      dot(cx + (big ? PX / 2 : 0) - PX * 0.25, cy - PX * 0.7, PX * (big ? 0.6 : 0.4), pal.tree[1]);
    } else if (p.kind === "house" || BUILDING.test(name)) roofs.push({ x: p.x, y: p.y });
    else if (p.kind.startsWith("fence") || /fence|palisade|barricade/.test(name)) {
      b.fillStyle = "#6b3a1f";
      b.fillRect(p.x * PX, cy - 1, PX, 2);
    } else if (WATER.test(name) && !name.includes("dry")) dot(cx, cy, PX * 0.8, "#3f7fb8");
    else if (FIRE.test(name)) dot(cx, cy, PX * 0.5, "#ff9a3a");
    else if (p.kind === "stone" || ROCK.test(name)) dot(cx, cy, PX * 0.45, "#8a8478");
  }
  // Roofs: the blocked tiles around each building, flood-filled a few tiles out.
  for (const r of roofs) {
    const seen = new Set<number>();
    const stack = [[r.x, r.y]];
    while (stack.length) {
      const [x, y] = stack.pop()!;
      const i = y * MAP_W + x;
      if (!at(x, y) || seen.has(i) || Math.abs(x - r.x) > 4 || Math.abs(y - r.y) > 4) continue;
      seen.add(i);
      if (!map.blocked[i] && !(x === r.x && y === r.y)) continue;
      b.fillStyle = "#9a4a2a";
      b.fillRect(x * PX, y * PX, PX, PX);
      b.fillStyle = "#b5532e";
      b.fillRect(x * PX, y * PX, PX, PX - 1);
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
  }
}

/** Explored-area minimap drawn into the HUD canvas: terrain, fog of war, hero and markers. */
export class Minimap {
  private base = document.createElement("canvas");
  private fog = document.createElement("canvas");
  private fogCtx: CanvasRenderingContext2D;
  private ctx: CanvasRenderingContext2D;
  /** Explored cells, saved per area (exportFog) so the map is remembered on the next visit. */
  private explored = new Uint8Array(GW * GH);

  constructor(private canvas: HTMLCanvasElement, map: WorldMap, fog?: string, skin = "") {
    this.ctx = canvas.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = false;

    this.base.width = this.fog.width = MAP_W * PX;
    this.base.height = this.fog.height = MAP_H * PX;
    paintTerrain(this.base.getContext("2d")!, map, skin);
    this.fogCtx = this.fog.getContext("2d")!;
    this.fogCtx.fillStyle = "#0c070a";
    this.fogCtx.fillRect(0, 0, this.fog.width, this.fog.height);
    // The village is always known.
    const t = map.town;
    this.fogCtx.clearRect(t.x0 * PX, t.y0 * PX, (t.x1 - t.x0 + 1) * PX, (t.y1 - t.y0 + 2) * PX);
    if (fog) this.importFog(fog);
  }

  /** The explored cells as a base64 bitset. */
  exportFog(): string {
    const bytes = new Uint8Array(Math.ceil(this.explored.length / 8));
    this.explored.forEach((v, i) => v && (bytes[i >> 3] |= 1 << (i & 7)));
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  }

  private importFog(fog: string) {
    try {
      const bin = atob(fog);
      for (let i = 0; i < this.explored.length; i++) if (bin.charCodeAt(i >> 3) & (1 << (i & 7))) this.explored[i] = 1;
    } catch {
      return;
    }
    const f = this.fogCtx;
    for (let i = 0; i < this.explored.length; i++)
      if (this.explored[i]) f.clearRect((i % GW) * CELL * PX, Math.floor(i / GW) * CELL * PX, CELL * PX, CELL * PX);
  }

  reveal(wx: number, wy: number) {
    const cx = wx / TILE / CELL, cy = wy / TILE / CELL, r = (REVEAL * 0.75) / CELL;
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(GH - 1, Math.ceil(cy + r)); y++)
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(GW - 1, Math.ceil(cx + r)); x++)
        if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) this.explored[y * GW + x] = 1;
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

  /**
   * Draws the map around the hero, `view` world px across (the part of the world on screen), or the whole map
   * when the minimap is enlarged (M). The canvas follows its on-screen size so tiles and markers stay crisp.
   */
  draw(hero: { x: number; y: number }, markers: MapMarker[], time: number, view: number) {
    const cv = this.canvas, c = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    const size = Math.max(64, Math.round(cv.clientWidth * dpr));
    if (cv.width !== size || cv.height !== size) {
      cv.width = cv.height = size;
      c.imageSmoothingEnabled = false;
    }
    const whole = cv.classList.contains("big");
    const side = whole ? Math.max(MAP_W, MAP_H) * TILE : view;
    const left = whole ? 0 : hero.x - side / 2, top = whole ? 0 : hero.y - side / 2;
    const k = size / side; // display px per world px
    const toX = (wx: number) => (wx - left) * k, toY = (wy: number) => (wy - top) * k;
    const u = dpr; // marker scale, CSS px

    c.fillStyle = "#0c070a";
    c.fillRect(0, 0, size, size);
    const src = (v: number) => (v / TILE) * PX;
    c.drawImage(this.base, src(left), src(top), src(side), src(side), 0, 0, size, size);
    c.drawImage(this.fog, src(left), src(top), src(side), src(side), 0, 0, size, size);
    const pulse = 0.5 + 0.5 * Math.sin(time / 180);
    for (const m of markers) {
      let x = toX(m.x), y = toY(m.y);
      const out = x < 0 || y < 0 || x > size || y > size;
      // Off the zoomed view only the quest rings matter: they wait on the edge, pointing the way.
      if (out && !m.ring) continue;
      if (out) {
        x = Math.max(6 * u, Math.min(size - 6 * u, x));
        y = Math.max(6 * u, Math.min(size - 6 * u, y));
      }
      if (m.ring) {
        c.strokeStyle = m.color;
        c.lineWidth = 2 * u;
        c.beginPath();
        c.arc(x, y, (out ? 3 + pulse * 2 : 6 + pulse * 5) * u, 0, Math.PI * 2);
        c.stroke();
        if (out) continue;
      }
      if (m.glyph) {
        c.font = `bold ${Math.round(14 * u)}px monospace`;
        c.textAlign = "center";
        c.fillStyle = "#1c0f1a";
        c.fillText(m.glyph, x + u, y - 3 * u);
        c.fillStyle = m.color;
        c.fillText(m.glyph, x, y - 4 * u);
      }
      if (m.img) {
        const r = 11 * u;
        c.fillStyle = "#1c0f1a";
        c.beginPath();
        c.arc(x, y, r + 1.5 * u, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = m.color;
        c.lineWidth = 1.5 * u;
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.stroke();
        c.drawImage(m.img, Math.round(x - r + u), Math.round(y - r + u), (r - u) * 2, (r - u) * 2);
        continue;
      }
      const s = (m.size ?? 3) * u;
      c.fillStyle = m.color;
      c.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
    }
    // Hero: white with a dark rim, always on top.
    const hx = toX(hero.x), hy = toY(hero.y);
    c.fillStyle = "#1c0f1a";
    c.fillRect(hx - 4 * u, hy - 4 * u, 8 * u, 8 * u);
    c.fillStyle = "#ffffff";
    c.fillRect(hx - 3 * u, hy - 3 * u, 6 * u, 6 * u);
  }
}
