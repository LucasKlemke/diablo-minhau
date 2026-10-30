import type Phaser from "phaser";
import { CLASSES, CLASS_ORDER, SLOT_KEY, type ClassId } from "../data/classes";
import { DIFFICULTIES, DIFFICULTY_ORDER, type Difficulty } from "../data/difficulty";
import { sfx } from "../game/audio";
import { drawKiln, kilnMeta, type Dir } from "../kiln";
import { skillIconUrl } from "./hud";
import { L } from "../i18n";

// Character selection around a campfire at night (Diablo IV style): the four heroes, drawn from their
// SpriteKiln sprites, idle around the fire; clicking one focuses the camera on it and opens its panel.

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Where each hero sits around the fire (offset in "hero px", x4 at the default scale) and where it looks. */
const SEATS: Record<ClassId, { x: number; y: number; dir: Dir }> = {
  barbarian: { x: -44, y: 6, dir: "e" },
  archer: { x: -22, y: -14, dir: "se" },
  mage: { x: 22, y: -14, dir: "sw" },
  sorcerer: { x: 44, y: 6, dir: "w" },
};

const R_LIFE = L("Vida", "Life"), R_DMG = L("Dano", "Damage"), R_RANGE = L("Alcance", "Range"), R_CPLX = L("Complexidade", "Complexity");
/** 1–5 ratings shown as bars in the class panel. */
const RATINGS: Record<ClassId, [string, number][]> = {
  barbarian: [[R_LIFE, 5], [R_DMG, 4], [R_RANGE, 1], [R_CPLX, 2]],
  archer: [[R_LIFE, 3], [R_DMG, 4], [R_RANGE, 5], [R_CPLX, 3]],
  mage: [[R_LIFE, 2], [R_DMG, 5], [R_RANGE, 4], [R_CPLX, 4]],
  sorcerer: [[R_LIFE, 3], [R_DMG, 4], [R_RANGE, 4], [R_CPLX, 5]],
};

const TAGLINE: Record<ClassId, string> = {
  barbarian: L("Fúria, aço e sangue. Entra no meio da horda e sai sozinho.", "Fury, steel and blood. Wades into the horde and walks out alone."),
  archer: L("Olhos de águia e flechas que não erram. A morte vem de longe.", "Eagle eyes and arrows that never miss. Death comes from afar."),
  mage: L("Fogo, gelo e raio. Frágil como vidro, devastador como uma tempestade.", "Fire, frost and lightning. Fragile as glass, devastating as a storm."),
  sorcerer: L("Magia proibida. Drena a vida dos inimigos e faz seus cadáveres explodirem.", "Forbidden magic. Drains the life of foes and makes their corpses explode."),
};

interface Ember { x: number; y: number; vx: number; vy: number; life: number }

export interface CampfireOpts {
  textures: Phaser.Textures.TextureManager;
  slot: number;
  onStart: (cls: ClassId, difficulty: Difficulty) => void;
  onBack: () => void;
}

export function showCampfire(opts: CampfireOpts) {
  const root = document.getElementById("ui")!;
  root.querySelector(".mm")?.remove();
  root.querySelector(".cf")?.remove();
  const wrap = document.createElement("div");
  wrap.className = "cf mm interactive";
  wrap.innerHTML = `<canvas class="cf-canvas"></canvas>
    <div class="cf-title"><div class="cf-sub">${L("Espaço", "Slot")} ${opts.slot + 1}</div><div class="cf-h">${L("Escolha seu herói", "Choose Your Hero")}</div></div>
    <div class="cf-hint">${L("Clique em um herói ao redor da fogueira", "Click a hero around the campfire")}</div>
    <aside class="cf-panel"></aside>
    <nav class="cf-bar"></nav>
    <button class="cf-back mbtn small">${L("Voltar", "Back")}</button>`;
  root.appendChild(wrap);
  const canvas = wrap.querySelector("canvas")!;
  const ctx = canvas.getContext("2d")!;
  const panel = wrap.querySelector(".cf-panel") as HTMLElement;
  const bar = wrap.querySelector(".cf-bar") as HTMLElement;
  (wrap.querySelector(".cf-back") as HTMLButtonElement).onclick = () => close(opts.onBack);

  let W = 0, H = 0, S = 4;
  const resize = () => {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
    S = Math.max(2, Math.min(6, Math.round(H / 200)));
  };
  resize();
  window.addEventListener("resize", resize);

  let selected: ClassId | null = null;
  let hovered: ClassId | null = null;
  let difficulty: Difficulty = "normal";
  /** Per-hero clip and when it started (the chosen hero plays its cast once). */
  const clips: Record<string, { anim: string; at: number; until: number }> = {};
  const cam = { x: W / 2, y: H / 2, z: 1 }; // starts framing the whole camp
  const embers: Ember[] = [];
  const t0 = performance.now();
  let raf = 0;

  // Static backdrop: stars and a ragged tree line, generated once.
  const stars = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random() * 0.45, r: Math.random() * 1.4 + 0.3, p: Math.random() * 6 }));
  const trees = Array.from({ length: 34 }, (_, i) => ({ x: i / 33 + (Math.random() - 0.5) * 0.03, h: 0.18 + Math.random() * 0.2, w: 0.035 + Math.random() * 0.03 }));

  const fireAt = () => ({ x: W / 2, y: H * 0.64 });
  const seatAt = (c: ClassId) => {
    const f = fireAt();
    return { x: f.x + SEATS[c].x * S, y: f.y + SEATS[c].y * S };
  };
  // World → screen with the focus camera.
  const toScreen = (x: number, y: number) => ({ x: (x - cam.x) * cam.z + W / 2, y: (y - cam.y) * cam.z + H / 2 });

  const heroBox = (c: ClassId) => {
    const p = toScreen(seatAt(c).x, seatAt(c).y);
    const s = S * cam.z;
    return { x0: p.x - 12 * s, x1: p.x + 12 * s, y0: p.y - 34 * s, y1: p.y + 4 * s };
  };
  const hit = (mx: number, my: number) =>
    CLASS_ORDER.find((c) => { const b = heroBox(c); return mx >= b.x0 && mx <= b.x1 && my >= b.y0 && my <= b.y1; }) ?? null;

  canvas.onmousemove = (e) => {
    hovered = hit(e.clientX, e.clientY);
    canvas.style.cursor = hovered ? "pointer" : "default";
  };
  canvas.onclick = (e) => {
    const c = hit(e.clientX, e.clientY);
    if (c) select(c);
    else if (selected) select(null);
  };
  const onKey = (e: KeyboardEvent) => {
    const i = selected ? CLASS_ORDER.indexOf(selected) : -1;
    if (e.key === "ArrowRight") select(CLASS_ORDER[(i + 1) % CLASS_ORDER.length]);
    else if (e.key === "ArrowLeft") select(CLASS_ORDER[(i + CLASS_ORDER.length - 1) % CLASS_ORDER.length]);
    else if (e.key === "Enter" && selected) start();
    else if (e.key === "Escape") selected ? select(null) : close(opts.onBack);
  };
  window.addEventListener("keydown", onKey);

  function close(then: () => void) {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    window.removeEventListener("keydown", onKey);
    wrap.remove();
    then();
  }

  function start() {
    if (!selected) return;
    sfx.levelUp();
    const cls = selected;
    close(() => opts.onStart(cls, difficulty));
  }

  function select(c: ClassId | null) {
    if (c === selected) return;
    selected = c;
    if (c) {
      sfx.coin();
      const meta = kilnMeta(c);
      const cast = meta?.animations.cast;
      const dur = cast ? Object.values(cast.directions)[0]!.durations.reduce((a, b) => a + b, 0) : 0;
      const now = performance.now() - t0;
      clips[c] = { anim: "cast", at: now, until: now + dur };
    }
    wrap.classList.toggle("focused", !!c);
    renderPanel();
    renderBar();
  }

  function renderBar() {
    bar.innerHTML = "";
    for (const c of CLASS_ORDER) {
      const b = document.createElement("button");
      b.className = `cf-cls${c === selected ? " on" : ""}`;
      const pic = document.createElement("canvas");
      pic.width = pic.height = 56;
      const pctx = pic.getContext("2d")!;
      drawKiln(pctx, opts.textures, c, "idle", "s", 0, 28, 46, 1.2);
      b.appendChild(pic);
      b.insertAdjacentHTML("beforeend", `<span>${esc(CLASSES[c].name)}</span>`);
      b.onclick = () => select(c);
      bar.appendChild(b);
    }
  }

  function renderPanel() {
    if (!selected) {
      panel.classList.remove("open");
      return;
    }
    const c = CLASSES[selected];
    const shown = c.skills.filter((s) => s.slot !== "primary").slice(0, 5);
    panel.innerHTML = `
      <div class="cf-ph"><div class="cf-name">${esc(c.name)}</div><div class="cf-res" style="color:${c.resourceColor}">${esc(c.resource)}</div></div>
      <div class="cf-tag">${esc(TAGLINE[selected])}</div>
      <div class="cf-desc">${esc(c.desc)}</div>
      <div class="cf-sec">${L("Estilo de jogo", "Playstyle")}</div>
      <div class="cf-skills">${shown.map((s) => `
        <div class="cf-skill"><img class="pix" src="${skillIconUrl(s.id)}" onerror="this.style.visibility='hidden'">
          <div><b>${esc(s.name)}</b> <span class="cf-key">${SLOT_KEY[s.slot]}${s.reqLevel > 1 ? ` · ${L("nv", "lv")} ${s.reqLevel}` : ""}</span><br>${esc(s.desc)}</div></div>`).join("")}
      </div>
      <div class="cf-sec">${L("Atributos", "Attributes")}</div>
      <div class="cf-bars">${RATINGS[selected].map(([k, v]) => `<div><span>${k}</span><i>${"<b></b>".repeat(v)}${"<em></em>".repeat(5 - v)}</i></div>`).join("")}</div>
      <div class="cf-sec">${L("Dificuldade", "Difficulty")}</div>
      <div class="cf-diff">${DIFFICULTY_ORDER.map((d) => `<button data-d="${d}" class="${d === difficulty ? "on" : ""}" style="--c:${DIFFICULTIES[d].color}" title="${esc(DIFFICULTIES[d].desc)}">${DIFFICULTIES[d].name}</button>`).join("")}</div>
      <div class="cf-ddesc">${esc(DIFFICULTIES[difficulty].desc)}</div>
      <button class="mbtn primary cf-go">${L("Começar como", "Begin as")} ${esc(c.name)}</button>`;
    panel.querySelectorAll<HTMLButtonElement>(".cf-diff button").forEach((b) => (b.onclick = () => {
      difficulty = b.dataset.d as Difficulty;
      sfx.coin();
      renderPanel();
    }));
    (panel.querySelector(".cf-go") as HTMLButtonElement).onclick = start;
    panel.classList.add("open");
  }

  // ---------- drawing ----------
  function draw() {
    const now = performance.now() - t0;
    const f = fireAt();
    // Camera: frame the whole camp, or zoom on the chosen hero (kept left of centre, the panel is on the right).
    const tgt = selected ? { x: seatAt(selected).x + 70 * S / 4 * 0.9, y: seatAt(selected).y - 14 * S, z: 1.7 } : { x: W / 2, y: H / 2, z: 1 };
    cam.x += (tgt.x - cam.x) * 0.08;
    cam.y += (tgt.y - cam.y) * 0.08;
    cam.z += (tgt.z - cam.z) * 0.08;
    const flick = 0.85 + 0.15 * Math.sin(now / 90) * Math.sin(now / 37 + 1);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Sky.
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#070a14");
    sky.addColorStop(0.55, "#141225");
    sky.addColorStop(1, "#0b0709");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    for (const s of stars) {
      ctx.globalAlpha = 0.4 + 0.4 * Math.sin(now / 900 + s.p);
      ctx.fillStyle = "#cfd8ff";
      ctx.fillRect(s.x * W, s.y * H, s.r, s.r);
    }
    ctx.globalAlpha = 1;
    // Moon.
    const moon = ctx.createRadialGradient(W * 0.78, H * 0.16, 2, W * 0.78, H * 0.16, H * 0.12);
    moon.addColorStop(0, "rgba(230,235,255,0.9)");
    moon.addColorStop(0.25, "rgba(200,210,255,0.35)");
    moon.addColorStop(1, "rgba(200,210,255,0)");
    ctx.fillStyle = moon;
    ctx.fillRect(0, 0, W, H);

    // World layer (moves with the camera).
    ctx.setTransform(cam.z, 0, 0, cam.z, W / 2 - cam.x * cam.z, H / 2 - cam.y * cam.z);
    // Tree line silhouettes.
    ctx.fillStyle = "#06080d";
    for (const t of trees) {
      const x = t.x * W, base = H * 0.52, sway = Math.sin(now / 1800 + t.x * 20) * 3;
      ctx.beginPath();
      ctx.moveTo(x - t.w * W, base);
      ctx.lineTo(x + sway, base - t.h * H);
      ctx.lineTo(x + t.w * W, base);
      ctx.fill();
    }
    ctx.fillRect(-W, H * 0.52 - 1, W * 3, H);
    // Ground lit by the fire.
    const glowR = H * 0.55 * flick;
    const ground = ctx.createRadialGradient(f.x, f.y, 4, f.x, f.y, glowR);
    ground.addColorStop(0, "rgba(255,150,60,0.55)");
    ground.addColorStop(0.35, "rgba(150,70,30,0.35)");
    ground.addColorStop(1, "rgba(20,10,10,0)");
    ctx.fillStyle = ground;
    ctx.beginPath();
    ctx.ellipse(f.x, f.y, glowR, glowR * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();

    // Heroes and the fire, back to front.
    const things: { y: number; draw: () => void }[] = CLASS_ORDER.map((c) => ({
      y: seatAt(c).y,
      draw: () => {
        const p = seatAt(c);
        const clip = clips[c] && now < clips[c].until ? clips[c] : null;
        const t = clip ? now - clip.at : now + CLASS_ORDER.indexOf(c) * 170;
        const focus = c === selected || c === hovered;
        ctx.save();
        if (selected && c !== selected) ctx.filter = "brightness(0.4) saturate(0.6)";
        if (focus) {
          ctx.shadowColor = c === selected ? "rgba(255,200,90,0.95)" : "rgba(255,220,150,0.8)";
          ctx.shadowBlur = 18;
        }
        drawKiln(ctx, opts.textures, c, clip ? clip.anim : "idle", c === selected && !clip ? "s" : SEATS[c].dir, t, p.x, p.y, S);
        ctx.restore();
      },
    }));
    things.push({ y: f.y, draw: () => drawFire(f.x, f.y, now, flick) });
    things.sort((a, b) => a.y - b.y).forEach((t) => t.draw());

    // Warm light over everything near the fire.
    ctx.globalCompositeOperation = "lighter";
    const warm = ctx.createRadialGradient(f.x, f.y - 10 * S, 4, f.x, f.y - 10 * S, H * 0.38 * flick);
    warm.addColorStop(0, "rgba(255,140,50,0.22)");
    warm.addColorStop(1, "rgba(255,140,50,0)");
    ctx.fillStyle = warm;
    ctx.fillRect(f.x - H, f.y - H, H * 2, H * 2);
    ctx.globalCompositeOperation = "source-over";

    // Embers.
    if (Math.random() < 0.5) embers.push({ x: f.x + (Math.random() - 0.5) * 10 * S, y: f.y - 8 * S, vx: (Math.random() - 0.5) * 0.6, vy: -1 - Math.random() * 1.5, life: 1 });
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

    // Name over the hovered or chosen hero.
    for (const c of [hovered, selected]) {
      if (!c) continue;
      const p = seatAt(c);
      ctx.font = `${Math.round(5 * S / cam.z * 0.9)}px Silkscreen, monospace`;
      ctx.textAlign = "center";
      ctx.fillStyle = "#1c0f1a";
      ctx.fillText(CLASSES[c].name.toUpperCase(), p.x + 1, p.y - 36 * S + 1);
      ctx.fillStyle = "#ffe9b0";
      ctx.fillText(CLASSES[c].name.toUpperCase(), p.x, p.y - 36 * S);
    }

    // Vignette.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const vig = ctx.createRadialGradient(W / 2, H * 0.6, H * 0.25, W / 2, H * 0.6, H * 0.95);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.75)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
    raf = requestAnimationFrame(draw);
  }

  /** The SpriteKiln campfire when exported, or a drawn fallback. */
  function drawFire(x: number, y: number, now: number, flick: number) {
    if (kilnMeta("campfire") && drawKiln(ctx, opts.textures, "campfire", "idle", "s", now, x, y, S)) return;
    const k = S * 1.6; // the drawn fallback is a bit bigger than a hero tile
    ctx.fillStyle = "#3a2418";
    for (const a of [-0.4, 0.4]) {
      ctx.save();
      ctx.translate(x, y - 2 * k);
      ctx.rotate(a);
      ctx.fillRect(-9 * k, -1.5 * k, 18 * k, 3 * k);
      ctx.restore();
    }
    for (let i = 0; i < 9; i++) {
      const ang = (i / 9) * Math.PI * 2;
      ctx.fillStyle = "#4a4a58";
      ctx.fillRect(x + Math.cos(ang) * 10 * k - 1.5 * k, y + Math.sin(ang) * 4 * k - 1.5 * k, 3 * k, 3 * k);
    }
    for (const [col, r, h] of [["#c1272d", 6, 16], ["#fe6607", 4.5, 12], ["#fbbe71", 3, 8], ["#fff4d0", 1.5, 4]] as [string, number, number][]) {
      ctx.fillStyle = col;
      for (let k = -1; k <= 1; k++) {
        const hh = h * k * (0.7 + 0.3 * Math.sin(now / 80 + k * 2.1)) * flick;
        ctx.beginPath();
        ctx.moveTo(x + (k * 3 - r) * k, y - 2 * k);
        ctx.quadraticCurveTo(x + k * 3 * k + Math.sin(now / 110 + k) * 2 * k, y - hh, x + (k * 3 + r) * k, y - 2 * k);
        ctx.fill();
      }
    }
  }

  renderBar();
  renderPanel();
  raf = requestAnimationFrame(draw);
}
