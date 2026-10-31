import { CLASSES, rankMult, SLOT_KEY, type ClassId, type SkillDef } from "../data/classes";
import { COMPARE_MARK, compareItem, itemLines, itemStats, itemValue, RARITIES, RARITY_COLOR, RARITY_LABEL, SLOT_LABEL, SLOTS, type Item, type Rarity, type Slot } from "../data/items";
import { formatStat, STAT_LABEL, type Stats } from "../data/stats";
import { isMuted, sfx, toggleMute } from "../game/audio";
import { coins, iconUrl } from "./icons";
import { L, locale } from "../i18n";
import { drawKiln, type Dir } from "../kiln";
import type Phaser from "phaser";
import { AREAS, canEnter, exitsOf, LINKS, ZONES, type AreaId } from "../data/zones";

/** A quest's reward as it is promised (items are only their rarity and slot until they are made). */
export interface RewardView { xp: number; gold: number; potions: number; items: { rarity: Rarity; slot?: Slot; name?: string }[] }

/** The reward as a row of chips: XP, gold, potions and the items in their rarity colour. */
export function rewardHtml(r: RewardView) {
  const items = r.items.map((it) => {
    const icon = it.slot && it.slot !== "weapon" ? `<img class="icon" src="${iconUrl(it.slot)}">` : "<b>◆</b>";
    const name = it.name ?? `${RARITY_LABEL[it.rarity]}${it.slot ? ` · ${SLOT_LABEL[it.slot]}` : ""}`;
    return `<span class="rw" style="color:${RARITY_COLOR[it.rarity]}">${icon}${esc(name)}</span>`;
  });
  return `<div class="rewards"><span class="rw xp">✦ ${r.xp.toLocaleString(locale())} XP</span><span class="rw gold">${coins(r.gold)}</span>`
    + (r.potions ? `<span class="rw"><img class="icon" src="${iconUrl("potion_hp")}">×${r.potions}</span>` : "") + items.join("") + "</div>";
}

/** What the world map shows (see Hud.worldMap). */
export interface WorldMapView {
  current: AreaId;
  visited: AreaId[];
  waypoints: AreaId[];
  tier: number;
  /** Area the current quest points at, and the activated checkpoint closest to it. */
  objective: AreaId | null;
  nearest: AreaId | null;
  quest: string | null;
  /** Opened from a checkpoint: clicking another activated checkpoint travels there. */
  onTravel?: (a: AreaId) => void;
}

const root = () => document.getElementById("ui")!;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", html = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** What the HUD reads from the hero every frame. */
export interface HeroView {
  cls: ClassId;
  level: number;
  xp: number;
  xpNext: number;
  xpPrev: number;
  gold: number;
  hp: number;
  mana: number;
  absorb: number;
  stats: Stats;
  potions: { hp: number; mp: number };
  inventory: (Item | null)[];
  equipment: Partial<Record<Slot, Item>>;
  ranks: Record<string, number>;
  skillPoints: number;
  cooldowns: Record<string, number>;
  dashCooldown: number;
  buffs: { id: string; until: number }[];
  /** Harmful effects on the hero (shown after the buffs, with a red frame). */
  debuffs: { kind: "poison" | "slow" | "stun"; until: number }[];
  now: number;
  quest: { title: string; goal: string; progress: string; ready: boolean; targets?: { label: string; dist: number }[]; reward?: RewardView } | null;
}

export interface HudActions {
  equipFromInventory(index: number): void;
  unequip(slot: Slot): void;
  discard(index: number): void;
  drinkPotion(kind: "hp" | "mp"): void;
  townPortal(): void;
  learn(skill: SkillDef): void;
  buy(index: number): void;
  sell(index: number): void;
  buyPotion(kind: "hp" | "mp"): void;
  buyBack(index: number): void;
  reroll(): void;
  move(from: number, to: number): void;
  unequipTo(slot: Slot, index: number): void;
  sellMany(indices: number[]): void;
}

/** An item picked up with the left button, waiting to be dropped somewhere. */
type Pick = { kind: "inv"; i: number } | { kind: "eq"; slot: Slot };

export const skillIconUrl = (id: string) => `assets/icons/skills/${id}.png`;
/** Skill icon generated with Antigravity; falls back to the skill name when missing. */
const skillIcon = (sk: SkillDef | string) =>
  `<img class="sicon" src="${skillIconUrl(typeof sk === "string" ? sk : sk.id)}" onload="this.parentElement.classList.add('has-icon')" onerror="this.remove()">`;

/** Debuff tiles: a glyph and a name. */
const DEBUFF = {
  poison: ["☠", L("Envenenado", "Poisoned")],
  slow: ["❄", L("Lento", "Slowed")],
  stun: ["✦", L("Atordoado", "Stunned")],
} as const;

const DOLL_DIRS: Dir[] = ["s", "sw", "w", "nw", "n", "ne", "e", "se"];

export class Hud {
  readonly world = el("div", "world");
  readonly minimap = el("canvas", "minimap interactive");
  private orbHp = el("div", "orb hp");
  private orbMp = el("div", "orb");
  private xp = el("div", "xpbar");
  private skillEls: HTMLDivElement[] = [];
  private top = el("div", "topinfo");
  private tracker = el("div", "tracker");
  private buffsEl = el("div", "buffs");
  private target = el("div", "target");
  private log = el("div", "log");
  private inv = el("div", "panel inv-panel interactive");
  private chr = el("div", "panel char-panel interactive");
  private tree = el("div", "panel tree-panel interactive");
  private shop = el("div", "panel shop-panel interactive");
  private tip = el("div", "tooltip");
  readonly vignette = el("div", "vignette");
  private bTree = el("button", "btn", L("Habilidades (K)", "Skills (K)"));
  private hero!: HeroView;
  private invDirty = true;
  private dialogOpen: HTMLDivElement | null = null;
  private shopStock: (Item | null)[] = [];
  /** Items sold to the vendor this visit, newest first: they can be bought back for what they fetched. */
  shopBuyback: Item[] = [];
  private shopVendor: { name: string; title: string; portrait: HTMLCanvasElement | null } = { name: "", title: "", portrait: null };
  private shopOpen = false;
  private rerollCost = 0;
  private pick: Pick | null = null;
  private selected = new Set<number>();
  private ghost = el("img", "ghost-item icon");
  private spAlert = el("button", "sp-alert interactive");
  private lvlBadge = el("div", "lvl-badge");
  private zoneName = "";
  /** Last HTML written to the parts redrawn every frame (skips identical rewrites). */
  private cache: Record<string, string> = {};
  /** Phaser's textures, to draw the hero in the equipment window (set by the game scene). */
  textures?: Phaser.Textures.TextureManager;
  /** The animated hero between the equipment slots (Diablo style); clicking turns them around. */
  private doll = el("canvas", "doll-canvas");
  /** Inventory tab: gear in the backpack, or the consumables (potions). */
  private invTab: "gear" | "items" = "gear";
  private dollDir = 0;
  private dollRaf = 0;

  constructor(private actions: HudActions, private skills: SkillDef[], resourceColor: string) {
    const r = root();
    r.appendChild(this.world);
    r.appendChild(this.vignette);
    r.appendChild(this.top);
    r.appendChild(this.tracker);
    r.appendChild(this.target);
    r.appendChild(this.log);

    const buttons = el("div", "buttons");
    const bInv = el("button", "btn", L("Inventário (I)", "Inventory (I)"));
    bInv.onclick = () => this.toggle("inv");
    const bChr = el("button", "btn", L("Personagem (C)", "Character (C)"));
    bChr.onclick = () => this.toggle("chr");
    this.bTree.onclick = () => this.toggle("tree");
    const bMute = el("button", "btn", isMuted() ? "🔇" : "🔊");
    bMute.title = L("Som", "Sound");
    bMute.onclick = () => (bMute.textContent = toggleMute() ? "🔇" : "🔊");
    buttons.append(bChr, this.bTree, bInv, bMute);
    r.appendChild(buttons);
    r.appendChild(this.minimap);
    this.minimap.title = L("Minimapa (M para ampliar)", "Minimap (M to enlarge)");
    this.minimap.onclick = () => this.minimap.classList.toggle("big");

    const hud = el("div", "hud interactive");
    this.orbHp.innerHTML = `<div class="fill"></div><div class="shield"></div><div class="val"></div>`;
    this.orbMp.innerHTML = `<div class="fill"></div><div class="val"></div>`;
    (this.orbMp.querySelector(".fill") as HTMLElement).style.background =
      `radial-gradient(circle at 35% 30%, #fff8, ${resourceColor} 45%, #0008)`;
    const center = el("div", "bar-center");
    // Buffs and debuffs: a row just above the skill bar.
    center.appendChild(this.buffsEl);
    const row = el("div", "skills");
    const active = skills.filter((s) => s.slot !== "passive");
    for (const sk of active) {
      const s = el("div", "slot") as HTMLDivElement;
      s.innerHTML = `${skillIcon(sk)}<span class="key">${SLOT_KEY[sk.slot]}</span><span class="sname">${esc(sk.name)}</span><div class="cd"></div><span class="count"></span>`;
      s.onmouseenter = (e) => this.showSkillTip(sk, e.clientX, e.clientY);
      s.onmousemove = (e) => this.moveTip(e.clientX, e.clientY);
      s.onmouseleave = () => this.hideTip();
      this.skillEls.push(s);
      row.appendChild(s);
    }
    const dash = el("div", "slot dash") as HTMLDivElement;
    dash.innerHTML = `${skillIcon("dash")}<span class="key">${L("Espaço", "Space")}</span><span class="sname">${L("Esquiva", "Dodge")}</span><div class="cd"></div>`;
    this.skillEls.push(dash);
    row.appendChild(dash);
    (["hp", "mp"] as const).forEach((k, i) => {
      const s = el("div", "slot") as HTMLDivElement;
      s.innerHTML = `<img class="icon" src="${iconUrl(k === "hp" ? "potion_hp" : "potion_mp")}"><span class="key">${i + 1}</span><span class="count"></span>`;
      s.style.cursor = "pointer";
      s.onclick = () => actions.drinkPotion(k);
      this.skillEls.push(s);
      row.appendChild(s);
    });
    const tp = el("div", "slot") as HTMLDivElement;
    tp.innerHTML = `<img class="icon" src="${iconUrl("town_portal")}"><span class="key">B</span><span class="sname">${L("Portal", "Portal")}</span>`;
    tp.title = L("Portal de retorno (B): volta ao último checkpoint", "Return portal (B): back to the last checkpoint");
    tp.style.cursor = "pointer";
    tp.onclick = () => actions.townPortal();
    row.appendChild(tp);
    this.xp.innerHTML = `<div class="fill"></div>`;
    center.append(this.xp, row);
    hud.append(this.lvlBadge, this.orbHp, center, this.orbMp);
    r.appendChild(hud);

    r.appendChild(this.inv);
    r.appendChild(this.chr);
    r.appendChild(this.tree);
    r.appendChild(this.shop);
    r.appendChild(this.tip);
    r.appendChild(this.ghost);
    this.spAlert.onclick = () => this.toggle("tree", true);
    hud.appendChild(this.spAlert);
    window.addEventListener("mousemove", (e) => {
      this.ghost.style.left = `${e.clientX + 6}px`;
      this.ghost.style.top = `${e.clientY + 6}px`;
    });
  }

  get dialogActive() {
    return !!this.dialogOpen;
  }

  toggle(which: "inv" | "chr" | "tree", force?: boolean) {
    const p = which === "inv" ? this.inv : which === "chr" ? this.chr : this.tree;
    if (which !== "inv" && force !== false && !p.classList.contains("open")) {
      this.closeShop();
      (which === "tree" ? this.chr : this.tree).classList.remove("open");
    }
    const was = p.classList.contains("open");
    p.classList.toggle("open", force);
    if (p.classList.contains("open") !== was) sfx.panel(!was);
    this.invDirty = true;
    this.hideTip();
  }

  private worldEl: HTMLDivElement | null = null;

  get worldMapOpen() {
    return !!this.worldEl;
  }

  closeWorldMap() {
    this.worldEl?.remove();
    this.worldEl = null;
  }

  /** The map of the whole region: areas joined by roads, checkpoints, the quest's area. */
  worldMap(v: WorldMapView) {
    this.closeWorldMap();
    const CW = 170, CH = 64, GX = 40, GY = 26;
    const known = new Set<AreaId>(v.visited);
    const seen = new Set<AreaId>(known);
    for (const a of known) for (const n of Object.values(exitsOf(a))) seen.add(n);
    const ids = (Object.keys(AREAS) as AreaId[]).filter((a) => seen.has(a));
    const xs = ids.map((a) => AREAS[a].pos[0]), ys = ids.map((a) => AREAS[a].pos[1]);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const at = (a: AreaId) => ({ x: (AREAS[a].pos[0] - minX) * (CW + GX) + 90, y: (AREAS[a].pos[1] - minY) * (CH + GY) + 10 });
    const w = (Math.max(...xs) - minX + 1) * (CW + GX) + 90, h = (Math.max(...ys) - minY + 1) * (CH + GY) + 10;
    let lines = "";
    for (const [a, b] of LINKS) {
      if (!seen.has(a) || !seen.has(b) || (!known.has(a) && !known.has(b))) continue;
      const p = at(a), q = at(b);
      const locked = !canEnter(a, v.tier) || !canEnter(b, v.tier);
      lines += `<line x1="${p.x + CW / 2}" y1="${p.y + CH / 2}" x2="${q.x + CW / 2}" y2="${q.y + CH / 2}" class="${locked ? "locked" : ""}"/>`;
    }
    // Act names beside their first row.
    let acts = "";
    for (const z of Object.values(ZONES)) {
      if (!seen.has(z.village)) continue;
      acts += `<div class="wm-act" style="top:${at(z.village).y + CH / 2 - 10}px">${esc(z.subtitle)}</div>`;
    }
    let cells = "";
    for (const a of ids) {
      const def = AREAS[a];
      const p = at(a);
      const isKnown = known.has(a);
      const wp = v.waypoints.includes(a);
      const travel = !!v.onTravel && wp && a !== v.current;
      const cls = ["wm-area", `act-${def.act}`, isKnown ? "" : "unknown", a === v.current ? "here" : "", a === v.objective ? "goal" : "",
        travel ? "travel" : "", canEnter(a, v.tier) ? "" : "sealed"].filter(Boolean).join(" ");
      const tags = [
        a === v.current ? `<span class="wm-here">${L("Você está aqui", "You are here")}</span>` : "",
        a === v.objective && v.quest ? `<span class="wm-goal">◆ ${esc(v.quest)}</span>` : "",
        a === v.nearest && a !== v.objective && v.objective ? `<span class="wm-near">${L("Checkpoint mais próximo", "Nearest checkpoint")}</span>` : "",
      ].join("");
      const wpIcon = def.waypoint ? `<i class="wm-wp ${wp ? "on" : ""}" title="Checkpoint"></i>` : "";
      const name = isKnown ? esc(def.name) : "???";
      const lvl = isKnown ? `<small>${def.village ? L("Vila", "Village") : `${L("Nível", "Level")} ${def.level}+`}${canEnter(a, v.tier) ? "" : ` · ${L("Selado", "Sealed")}`}</small>` : "";
      cells += `<div class="${cls}" data-area="${a}" style="left:${p.x}px;top:${p.y}px;width:${CW}px;height:${CH}px">${wpIcon}<b>${name}</b>${lvl}${tags}</div>`;
    }
    const help = v.onTravel ? L("Clique numa área com checkpoint aceso (◆ roxo) para viajar.", "Click an area with a lit checkpoint (purple ◆) to travel.")
      : L("Use um checkpoint (◆) para viajar entre áreas. N fecha o mapa.", "Use a checkpoint (◆) to travel between areas. N closes the map.");
    const box = el("div", "worldmap", `<div class="wm-panel"><h3>${L("Mapa do Mundo", "World Map")}</h3>
      <div class="wm-scroll"><div class="wm-board" style="width:${w}px;height:${h}px"><svg width="${w}" height="${h}">${lines}</svg>${acts}${cells}</div></div>
      <div class="wm-help">${help}</div><button class="btn wm-close">${L("Fechar", "Close")}</button></div>`);
    box.querySelector(".wm-close")!.addEventListener("click", () => this.closeWorldMap());
    box.addEventListener("click", (e) => {
      if (e.target === box) this.closeWorldMap();
      const cell = (e.target as HTMLElement).closest(".wm-area.travel") as HTMLElement | null;
      if (cell && v.onTravel) {
        this.closeWorldMap();
        v.onTravel(cell.dataset.area as AreaId);
      }
    });
    root().appendChild(box);
    this.worldEl = box;
    // The whole board fits on screen (scaled down if needed): no scrolling.
    const sc = box.querySelector(".wm-scroll") as HTMLElement;
    const board = box.querySelector(".wm-board") as HTMLElement;
    const k = Math.min(1, (window.innerWidth - 80) / w, (window.innerHeight - 190) / h);
    board.style.transform = `scale(${k})`;
    sc.style.width = `${Math.ceil(w * k)}px`;
    sc.style.height = `${Math.ceil(h * k)}px`;
  }

  closeAll() {
    this.closeWorldMap();
    this.dropPick();
    this.closeShop();
    this.inv.classList.remove("open");
    this.chr.classList.remove("open");
    this.tree.classList.remove("open");
    this.minimap.classList.remove("big");
    this.hideTip();
  }

  /** True when any window (panel, shop, dialog, big map) is open. */
  anyOpen() {
    return !!this.dialogOpen || this.shopOpen || !!this.pick || this.minimap.classList.contains("big") || !!this.worldEl
      || [this.inv, this.chr, this.tree].some((p) => p.classList.contains("open"));
  }

  toggleMap() {
    this.minimap.classList.toggle("big");
  }

  markInventoryDirty() {
    this.invDirty = true;
  }

  update(h: HeroView) {
    this.hero = h;
    const s = h.stats;
    const set = (orb: HTMLElement, v: number, max: number) => {
      (orb.querySelector(".fill") as HTMLElement).style.height = `${Math.max(0, Math.min(1, v / max)) * 100}%`;
      orb.querySelector(".val")!.textContent = `${Math.ceil(v)}/${Math.round(max)}`;
    };
    set(this.orbHp, h.hp, s.maxHp);
    (this.orbHp.querySelector(".shield") as HTMLElement).style.opacity = h.absorb > 0 ? "1" : "0";
    this.vignette.classList.toggle("low", h.hp > 0 && h.hp / s.maxHp < 0.3);
    set(this.orbMp, h.mana, s.maxMana);
    (this.xp.firstChild as HTMLElement).style.width = `${((h.xp - h.xpPrev) / (h.xpNext - h.xpPrev)) * 100}%`;
    // Top right, over the minimap (Diablo IV style): zone, gold and the clock.
    const clock = new Date().toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });
    const top = `<span class="zl">${esc(this.zoneName)}</span><span class="gold">${coins(h.gold)}</span><span class="clock">${clock}</span>`;
    if (this.cache.top !== top) this.top.innerHTML = this.cache.top = top;
    const lvl = `<b>${h.level}</b>`;
    if (this.cache.lvl !== lvl) {
      this.lvlBadge.innerHTML = this.cache.lvl = lvl;
      this.lvlBadge.title = `${CLASSES[h.cls].name} · ${L("Nível", "Level")} ${h.level}`;
    }
    this.bTree.innerHTML = h.skillPoints ? `${L("Habilidades (K)", "Skills (K)")} <span class="badge">${h.skillPoints}</span>` : L("Habilidades (K)", "Skills (K)");
    const showAlert = h.skillPoints > 0 && !this.tree.classList.contains("open");
    this.spAlert.style.display = showAlert ? "block" : "none";
    if (showAlert) {
      const txt = L(`★ ${h.skillPoints} ponto${h.skillPoints > 1 ? "s" : ""} de habilidade para gastar — clique aqui`, `★ ${h.skillPoints} skill point${h.skillPoints > 1 ? "s" : ""} to spend — click here`);
      if (this.spAlert.textContent !== txt) this.spAlert.textContent = txt;
    }

    const q = h.quest;
    const tr = q
      ? `<div class="qt">${esc(q.title)} <i>◆</i></div><div class="${q.ready ? "qready" : ""}">${q.ready ? esc(q.goal) : `${esc(q.goal)} ${q.progress}`}</div>`
        + (q.targets?.length ? `<ul class="qtargets">${q.targets.map((t) => `<li>${esc(t.label)} <b>${t.dist} m</b></li>`).join("")}</ul>` : "")
        + (q.reward ? `<div class="qreward">${rewardHtml(q.reward)}</div>` : "")
      : "";
    if (this.cache.tr !== tr) this.tracker.innerHTML = this.cache.tr = tr;

    const buffs = h.buffs
      .map((b) => {
        const sk = this.skills.find((x) => x.id === b.id);
        return sk ? `<div class="buff">${skillIcon(sk)}<span>${Math.ceil((b.until - h.now) / 1000)}s</span><em>${esc(sk.name)}</em></div>` : "";
      }).join("")
      + h.debuffs.map((b) => {
        const [glyph, name] = DEBUFF[b.kind];
        return `<div class="buff debuff ${b.kind}"><b>${glyph}</b><span>${Math.max(1, Math.ceil((b.until - h.now) / 1000))}s</span><em>${name}</em></div>`;
      }).join("");
    if (this.cache.buffs !== buffs) this.buffsEl.innerHTML = this.cache.buffs = buffs;

    const active = this.skills.filter((x) => x.slot !== "passive");
    active.forEach((sk, i) => {
      const e = this.skillEls[i];
      const rank = h.ranks[sk.id] ?? 0;
      const cd = e.querySelector(".cd") as HTMLElement;
      const left = h.cooldowns[sk.id] ?? 0;
      cd.style.height = sk.cooldown && left > 0 ? `${(left / sk.cooldown) * 100}%` : "0";
      e.classList.toggle("locked", rank === 0);
      e.style.opacity = rank > 0 && h.mana < sk.cost ? "0.45" : "1";
      (e.querySelector(".count") as HTMLElement).textContent = rank === 0 ? `${L("nv", "lv")} ${sk.reqLevel}` : sk.cost ? String(sk.cost) : "";
    });
    const dash = this.skillEls[active.length];
    (dash.querySelector(".cd") as HTMLElement).style.height = `${Math.max(0, h.dashCooldown / 1200) * 100}%`;
    (this.skillEls[active.length + 1].querySelector(".count") as HTMLElement).textContent = String(h.potions.hp);
    (this.skillEls[active.length + 2].querySelector(".count") as HTMLElement).textContent = String(h.potions.mp);

    if (this.invDirty) {
      this.invDirty = false;
      if (this.inv.classList.contains("open")) this.renderInventory();
      if (this.chr.classList.contains("open")) this.renderCharacter();
      if (this.tree.classList.contains("open")) this.renderTree();
      if (this.shopOpen) this.renderShop();
    }
  }

  private slotEl(item: Item | null | undefined, cls = "slot"): HTMLDivElement {
    const d = el("div", cls) as HTMLDivElement;
    if (item) {
      d.classList.add(`r-${item.rarity}`);
      d.innerHTML = `<img class="icon" src="${iconUrl(item.icon)}">`;
      // Better/worse than what is equipped in that slot.
      if (this.hero && !Object.values(this.hero.equipment).includes(item)) {
        const c = compareItem(item, this.hero.equipment);
        if (c !== "same") d.insertAdjacentHTML("beforeend", `<span class="cmp-mark ${c}">${COMPARE_MARK[c]}</span>`);
      }
      d.onmouseenter = (e) => this.showTip(item, e.clientX, e.clientY);
      d.onmousemove = (e) => this.moveTip(e.clientX, e.clientY);
      d.onmouseleave = () => this.hideTip();
    }
    return d;
  }

  private dropPick() {
    this.pick = null;
    this.ghost.style.display = "none";
    this.invDirty = true;
  }

  private setPick(p: Pick, item: Item) {
    this.pick = p;
    this.ghost.src = iconUrl(item.icon);
    this.ghost.style.display = "block";
    this.hideTip();
    this.invDirty = true;
  }

  /** Drop the picked item on a backpack cell or an equipment slot. */
  private placeAt(target: Pick) {
    const p = this.pick;
    const h = this.hero;
    if (!p) return;
    if (target.kind === "inv") {
      if (p.kind === "inv") this.actions.move(p.i, target.i);
      else this.actions.unequipTo(p.slot, target.i);
    } else if (p.kind === "inv") {
      const it = h.inventory[p.i];
      if (it && it.slot === target.slot) this.actions.equipFromInventory(p.i);
    }
    this.selected.clear();
    this.dropPick();
  }

  private renderInventory() {
    const h = this.hero;
    const p = this.pick;
    const c = CLASSES[h.cls], s = h.stats;
    // Diablo IV layout: the hero's sheet on the left, the figure among its equipment, then the bag in tabs.
    this.inv.innerHTML = "";
    const n = (v: number) => Math.round(v).toLocaleString(locale());
    const val = (k: keyof Stats) => formatStat(k, s[k]).split(" ")[0].replace(/^\+/, "");
    const big = (icon: Parameters<typeof iconUrl>[0], label: string, v: string) =>
      `<div class="inv-big"><i><img src="${iconUrl(icon)}"></i><div><span>${label}</span><b>${v}</b></div></div>`;
    const attr = (label: string, v: string) => `<div class="inv-attr"><span>${label}</span><b>${v}</b></div>`;
    const xpPct = Math.round(((h.xp - h.xpPrev) / Math.max(1, h.xpNext - h.xpPrev)) * 100);
    const side = el("div", "inv-side", `<div class="inv-id"><i class="inv-lvl"><span>${h.level}</span></i><b>${esc(c.name)}</b>
        <span>${L("Experiência", "Experience")} ${xpPct}%</span></div>
      ${big("axe", L("Dano", "Damage"), `${n((s.dmgMin + s.dmgFlat) * (1 + s.dmgPct))}–${n((s.dmgMax + s.dmgFlat) * (1 + s.dmgPct))}`)}
      ${big("armor", STAT_LABEL.armor, n(s.armor))}
      ${big("potion_hp", STAT_LABEL.maxHp, n(s.maxHp))}
      <div class="inv-attrs">${attr(L("Vel. de ataque", "Attack speed"), val("attackSpeed"))}${attr(L("Crítico", "Critical"), val("crit"))}
        ${attr(L("Vel. de movimento", "Move speed"), val("moveSpeed"))}${attr(L("Roubo de vida", "Life steal"), val("lifeSteal"))}
        ${attr(L("Vida/s", "Life/s"), s.hpRegen.toFixed(1))}${attr(STAT_LABEL.maxMana, n(s.maxMana))}</div>`);
    const top = el("div", "inv-top");
    const eq = el("div", "equip doll");
    const stage = el("div", "doll-stage");
    stage.appendChild(this.doll);
    eq.appendChild(stage);
    const close = el("button", "shop-x inv-x", "✕");
    close.title = L("Fechar (I)", "Close (I)");
    close.onclick = () => { this.inv.classList.remove("open"); this.closeShop(); this.hideTip(); };
    top.append(side, eq, close);
    this.doll.onclick = () => { this.dollDir = (this.dollDir + 1) % DOLL_DIRS.length; };
    this.doll.title = L("Clique para girar", "Click to rotate");
    this.startDoll();
    for (const slot of SLOTS) {
      const it = h.equipment[slot];
      const d = this.slotEl(it);
      if (!it) d.innerHTML = `<span class="slotname">${SLOT_LABEL[slot]}</span>`;
      if (p?.kind === "eq" && p.slot === slot) d.classList.add("picked");
      if (p?.kind === "inv" && h.inventory[p.i]?.slot === slot) d.classList.add("drop-ok");
      const target: Pick = { kind: "eq", slot };
      d.onclick = () => {
        if (this.pick) this.placeAt(target);
        else if (it) this.setPick(target, it);
      };
      d.oncontextmenu = (e) => {
        e.preventDefault();
        if (it) { this.hideTip(); this.actions.unequip(slot); }
      };
      this.dragSource(d, it, target);
      this.dropTarget(d, target);
      d.style.gridArea = slot;
      eq.appendChild(d);
    }
    this.inv.appendChild(top);
    const tabs = el("div", "inv-tabs", `<span class="inv-tabname">${this.invTab === "gear" ? L("Equipamento", "Equipment") : L("Consumíveis", "Consumables")}</span>`);
    for (const [t, icon, title] of [["gear", "armor", L("Equipamento", "Equipment")], ["items", "potion_hp", L("Consumíveis", "Consumables")]] as const) {
      const b = el("button", `inv-tab${this.invTab === t ? " on" : ""}`, `<img src="${iconUrl(icon)}">`);
      b.title = title;
      b.onclick = () => { this.invTab = t; this.invDirty = true; };
      tabs.appendChild(b);
    }
    this.inv.appendChild(tabs);
    const foot = el("div", "inv-foot", `${coins(h.gold)}<span class="inv-pots"><img src="${iconUrl("potion_hp")}">${h.potions.hp}
      <img src="${iconUrl("potion_mp")}">${h.potions.mp}</span>`);
    if (this.invTab === "items") {
      const cons = el("div", "grid bag");
      for (const k of ["hp", "mp"] as const) {
        const d = el("div", "slot r-consumable", `<img class="icon" src="${iconUrl(k === "hp" ? "potion_hp" : "potion_mp")}"><span class="count">${h.potions[k]}</span>`);
        d.title = k === "hp" ? L("Poção de vida (1)", "Health potion (1)") : L("Poção de recurso (2)", "Resource potion (2)");
        d.onclick = () => this.actions.drinkPotion(k);
        cons.appendChild(d);
      }
      while (cons.childElementCount < h.inventory.length) cons.appendChild(el("div", "slot"));
      this.inv.append(cons, foot);
      return;
    }
    const grid = el("div", "grid bag");
    h.inventory.forEach((it, i) => {
      const d = this.slotEl(it);
      if (p?.kind === "inv" && p.i === i) d.classList.add("picked");
      if (this.selected.has(i)) d.classList.add("sel");
      const target: Pick = { kind: "inv", i };
      d.onclick = (e) => {
        this.hideTip();
        if ((e.ctrlKey || e.metaKey || e.shiftKey) && it) {
          // Multi-select (to sell several at once).
          if (this.selected.has(i)) this.selected.delete(i);
          else this.selected.add(i);
          this.invDirty = true;
        } else if (this.pick) this.placeAt(target);
        else if (it) this.setPick(target, it);
      };
      d.oncontextmenu = (e) => {
        e.preventDefault();
        if (!it) return;
        this.hideTip();
        this.selected.delete(i);
        if (this.shopOpen) this.actions.sell(i);
        else this.actions.equipFromInventory(i);
      };
      this.dragSource(d, it, target);
      this.dropTarget(d, target);
      grid.appendChild(d);
    });
    this.inv.appendChild(grid);
    this.inv.appendChild(foot);

    // Drop the selection of items that no longer exist.
    for (const i of [...this.selected]) if (!h.inventory[i]) this.selected.delete(i);
    if (this.selected.size) {
      const items = [...this.selected].map((i) => h.inventory[i]!);
      const gold = items.reduce((a, it) => a + Math.round(itemValue(it) / 4), 0);
      const bar = el("div", "sel-bar");
      bar.appendChild(el("span", "", L(`${items.length} selecionado${items.length > 1 ? "s" : ""}`, `${items.length} selected`)));
      if (this.shopOpen) {
        const sell = el("button", "btn primary", `${L("Vender", "Sell")} ${coins(gold)}`);
        sell.onclick = () => {
          this.actions.sellMany([...this.selected]);
          this.selected.clear();
        };
        bar.appendChild(sell);
      }
      const clear = el("button", "btn", L("Limpar", "Clear"));
      clear.onclick = () => { this.selected.clear(); this.invDirty = true; };
      bar.appendChild(clear);
      this.inv.appendChild(bar);
    }
    this.inv.appendChild(el("div", "hint", this.pick
      ? L("Clique num espaço para colocar o item · Esc cancela", "Click a slot to place the item · Esc cancels")
      : this.shopOpen
        ? L("Clique: mover · Clique direito: VENDER · Ctrl/Shift+clique: selecionar vários", "Click: move · Right click: SELL · Ctrl/Shift+click: select several")
        : L("Clique: mover · Clique direito: equipar · Ctrl/Shift+clique: selecionar vários", "Click: move · Right click: equip · Ctrl/Shift+click: select several")));
  }

  /** Animates the hero figure while the equipment window is open. */
  private startDoll() {
    if (this.dollRaf) return;
    const t0 = performance.now();
    const W = 150, H = 196;
    this.doll.width = W;
    this.doll.height = H;
    const ctx = this.doll.getContext("2d")!;
    const frame = () => {
      if (!this.doll.isConnected || !this.inv.classList.contains("open")) {
        this.dollRaf = 0;
        return;
      }
      const t = performance.now() - t0;
      ctx.clearRect(0, 0, W, H);
      const bg = ctx.createRadialGradient(W / 2, H * 0.55, 6, W / 2, H * 0.55, H * 0.7);
      bg.addColorStop(0, "#3a2a24");
      bg.addColorStop(1, "#0e080b");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.beginPath();
      ctx.ellipse(W / 2, H - 22, 40, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(200,150,62,${0.35 + 0.15 * Math.sin(t / 600)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(W / 2, H - 22, 34, 8, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (this.textures && this.hero) drawKiln(ctx, this.textures, this.hero.cls, "idle", DOLL_DIRS[this.dollDir], t, W / 2, H - 22, 4);
      this.dollRaf = requestAnimationFrame(frame);
    };
    this.dollRaf = requestAnimationFrame(frame);
  }

  /** HTML drag & drop as an alternative to click-to-pick. */
  private dragSource(d: HTMLElement, it: Item | null | undefined, from: Pick) {
    if (!it) return;
    d.draggable = true;
    d.ondragstart = (e) => {
      this.pick = from;
      this.hideTip();
      e.dataTransfer?.setData("text/plain", "item");
    };
    d.ondragend = () => {
      if (this.pick) this.dropPick();
    };
  }

  private dropTarget(d: HTMLElement, target: Pick) {
    d.ondragover = (e) => e.preventDefault();
    d.ondrop = (e) => {
      e.preventDefault();
      if (this.pick) this.placeAt(target);
    };
  }

  private renderCharacter() {
    const h = this.hero;
    const s = h.stats;
    const c = CLASSES[h.cls];
    const rows: [string, string][] = [
      [L("Classe", "Class"), c.name], [L("Nível", "Level"), String(h.level)], [L("Experiência", "Experience"), `${h.xp} / ${h.xpNext}`],
      [STAT_LABEL.maxHp, String(Math.round(s.maxHp))], [c.resource, String(Math.round(s.maxMana))],
      [L("Dano", "Damage"), `${Math.round((s.dmgMin + s.dmgFlat) * (1 + s.dmgPct))}–${Math.round((s.dmgMax + s.dmgFlat) * (1 + s.dmgPct))}`],
      [STAT_LABEL.armor, String(Math.round(s.armor))],
      [STAT_LABEL.attackSpeed, `${Math.round(s.attackSpeed * 100)}%`],
      [STAT_LABEL.moveSpeed, `${Math.round(s.moveSpeed * 100)}%`],
      [STAT_LABEL.crit, `${Math.round(s.crit * 100)}%`],
      [STAT_LABEL.lifeSteal, `${Math.round(s.lifeSteal * 100)}%`],
      [STAT_LABEL.hpRegen, s.hpRegen.toFixed(1)],
      [STAT_LABEL.manaRegen, s.manaRegen.toFixed(1)],
      // Item-only stats: listed when the hero has some.
      ...(["fireDmg", "coldDmg", "lightningDmg", "poisonDmg", "thorns", "dmgBeast", "dmgUndead", "statusRes", "goldFind", "magicFind"] as const).filter((k) => s[k] > 0)
        .map((k): [string, string] => [STAT_LABEL[k], k.endsWith("Dmg") || k === "thorns" ? String(Math.round(s[k])) : `${Math.round(s[k] * 100)}%`]),
    ];
    this.chr.innerHTML = `<h3>${esc(c.name)}</h3><div class="stats">${rows
      .map(([a, b]) => `<div class="row"><span>${a}</span><span>${b}</span></div>`).join("")}</div>`;
  }

  private renderTree() {
    const h = this.hero;
    this.tree.innerHTML = `<h3>${L("Habilidades", "Skills")}</h3><div class="points">${L("Pontos disponíveis", "Points available")}: <b>${h.skillPoints}</b></div>`;
    const list = el("div", "tree");
    const sorted = [...this.skills].sort((a, b) => a.reqLevel - b.reqLevel);
    for (const sk of sorted) {
      const rank = h.ranks[sk.id] ?? 0;
      const lockedLvl = h.level < sk.reqLevel;
      const row = el("div", `tnode${rank ? " learned" : ""}${lockedLvl ? " lvl-locked" : ""}`);
      const pips = Array.from({ length: sk.maxRank }, (_, i) => `<i class="${i < rank ? "on" : ""}"></i>`).join("");
      row.innerHTML = `<div class="tkey">${skillIcon(sk)}<span>${SLOT_KEY[sk.slot]}</span></div>
        <div class="tbody"><div class="tname">${esc(sk.name)} <span class="treq">${lockedLvl ? `${L("requer nível", "requires level")} ${sk.reqLevel}` : ""}</span></div>
        <div class="tdesc">${esc(sk.desc)}</div><div class="pips">${pips}</div></div>`;
      const can = h.skillPoints > 0 && !lockedLvl && rank < sk.maxRank;
      const b = el("button", "btn plus", "+");
      b.disabled = !can;
      b.onclick = () => this.actions.learn(sk);
      row.appendChild(b);
      row.onmouseenter = (e) => this.showSkillTip(sk, e.clientX, e.clientY);
      row.onmousemove = (e) => this.moveTip(e.clientX, e.clientY);
      row.onmouseleave = () => this.hideTip();
      list.appendChild(row);
    }
    this.tree.appendChild(list);
    this.tree.appendChild(el("div", "hint", L("Cada ponto aumenta o poder da habilidade (+20% dano, +25% bônus).", "Each point increases the skill's power (+20% damage, +25% bonus).")));
  }

  private showSkillTip(sk: SkillDef, x: number, y: number) {
    const rank = this.hero?.ranks[sk.id] ?? 0;
    const r = Math.max(1, rank);
    const lines: string[] = [];
    if (sk.dmgMult) lines.push(L(`Dano: ${Math.round(sk.dmgMult * rankMult(r) * 100)}% da arma`, `Damage: ${Math.round(sk.dmgMult * rankMult(r) * 100)}% of weapon`));
    if (sk.cost) lines.push(`${L("Custo", "Cost")}: ${sk.cost}`);
    if (sk.cooldown) lines.push(`${L("Recarga", "Cooldown")}: ${(sk.cooldown / 1000).toFixed(1)}s`);
    if (sk.passive) for (const [k, v] of Object.entries(sk.passive)) lines.push(formatStat(k as keyof Stats, (v as number) * r));
    this.tip.innerHTML = `<div class="tcard"><div class="tname" style="color:#ffe14d">${esc(sk.name)}</div>
      <div class="tbase">${SLOT_KEY[sk.slot]} · ${L("nível", "rank")} ${rank}/${sk.maxRank} · ${L("requer nível", "requires level")} ${sk.reqLevel}</div>
      <div>${esc(sk.desc)}</div>${lines.map((l) => `<div class="aff">${l}</div>`).join("")}</div>`;
    this.tip.style.display = "flex";
    this.moveTip(x, y);
  }

  /** Item tooltip, also used for items lying on the ground. */
  showItemTip(item: Item, x: number, y: number) {
    this.showTip(item, x, y);
  }

  moveItemTip(x: number, y: number) {
    this.moveTip(x, y);
  }

  /** One item's card in the tooltip: icon, name, base line, stats and affixes. */
  private tipCard(item: Item, label = "") {
    const lines = itemLines(item).map((l) => `<div>${l}</div>`).join("");
    const aff = item.affixes.map((a) => `<div class="aff">${formatStat(a.k, a.v)}</div>`).join("");
    return `${label ? `<div class="tlabel">${label}</div>` : ""}<div class="thead"><img class="ticon r-${item.rarity}" src="${iconUrl(item.icon)}"><div>
      <div class="tname" style="color:${RARITY_COLOR[item.rarity]}">${esc(item.name)}</div>
      <div class="tbase">${item.rarity === "normal" ? "" : esc(item.base) + " · "}${RARITY_LABEL[item.rarity]} · ${SLOT_LABEL[item.slot]} · ${L("nv", "lv")} ${item.ilvl}</div>
      </div></div>${lines}${aff}`;
  }

  /** Item tooltip; for an item not worn, the equipped one of that slot sits beside it (Diablo style) with the difference. */
  private showTip(item: Item, x: number, y: number) {
    const eq = this.hero.equipment[item.slot];
    let cmp = "";
    if (eq && eq !== item) {
      const a = itemStats(item), b = itemStats(eq);
      const keys = new Set([...Object.keys(a), ...Object.keys(b)] as (keyof Stats)[]);
      const diffs: string[] = [];
      for (const k of keys) {
        const d = (a[k] ?? 0) - (b[k] ?? 0);
        if (Math.abs(d) < 0.001) continue;
        const txt = formatStat(k, Math.abs(d)).replace(/^\+/, "");
        diffs.push(`<span style="color:${d > 0 ? "#7bea6a" : "#ff6a5a"}">${d > 0 ? "+" : "−"}${txt}</span>`);
      }
      if (diffs.length) cmp = `<div class="cmp">${L("Comparado ao equipado", "Compared to equipped")}:<br>${diffs.join("<br>")}</div>`;
    }
    const inShop = this.shopStock.includes(item);
    const price = this.shopOpen
      ? `<div class="price">${inShop ? L("Preço", "Price") : L("Venda", "Sell")}: ${coins(inShop ? itemValue(item) : Math.round(itemValue(item) / 4))}</div>` : "";
    const c = Object.values(this.hero.equipment).includes(item) ? "same" : compareItem(item, this.hero.equipment);
    const verdict = c === "same" ? "" : `<div class="verdict ${c}">${COMPARE_MARK[c]} ${c === "up" ? (eq ? L("Melhor que o equipado", "Better than equipped") : L("Espaço vazio: melhor que nada", "Empty slot: better than nothing")) : L("Pior que o equipado", "Worse than equipped")}</div>`;
    const worn = Object.values(this.hero.equipment).includes(item);
    const main = `<div class="tcard">${this.tipCard(item, worn ? L("Equipado", "Equipped") : "")}${verdict}${cmp}${price}</div>`;
    const side = eq && !worn ? `<div class="tcard worn">${this.tipCard(eq, L("Equipado agora", "Currently equipped"))}</div>` : "";
    this.tip.innerHTML = main + side;
    this.tip.style.display = "flex";
    this.moveTip(x, y);
  }

  private moveTip(x: number, y: number) {
    const w = this.tip.offsetWidth, hgt = this.tip.offsetHeight;
    this.tip.style.left = `${x + 16 + w > window.innerWidth ? x - w - 16 : x + 16}px`;
    this.tip.style.top = `${Math.max(8, Math.min(window.innerHeight - hgt - 8, y - hgt / 2))}px`;
  }

  hideTip() {
    this.tip.style.display = "none";
  }

  /**
   * Dialogue box: pages through `lines`, then shows `choices`.
   * Closing without a choice calls `onClose`. `extra` (HTML, e.g. a quest's reward) is shown under the last page.
   */
  dialog(speaker: string, portrait: HTMLCanvasElement | null, lines: string[], choices: { label: string; action: () => void }[] = [],
    onClose?: () => void, extra = "") {
    this.dialogOpen?.remove();
    this.closeAll();
    const box = el("div", "dialog interactive");
    const pic = el("div", "dpic");
    if (portrait) pic.appendChild(portrait);
    else pic.style.display = "none";
    const body = el("div", "dbody");
    const name = el("div", "dname", esc(speaker));
    const text = el("div", "dtext");
    const more = el("div", "dextra", extra);
    const btns = el("div", "dbtns");
    body.append(name, text, more, btns);
    box.append(pic, body);
    root().appendChild(box);
    this.dialogOpen = box;
    let page = 0;
    const close = (cb?: () => void) => {
      box.remove();
      if (this.dialogOpen === box) this.dialogOpen = null;
      (cb ?? onClose)?.();
    };
    const render = () => {
      text.textContent = lines[page];
      more.style.display = extra && page === lines.length - 1 ? "" : "none";
      btns.innerHTML = "";
      if (page < lines.length - 1) {
        const b = el("button", "btn", L("Continuar ▸", "Continue ▸"));
        b.onclick = () => { page++; render(); };
        btns.appendChild(b);
      } else {
        for (const c of choices) {
          const b = el("button", "btn primary", esc(c.label));
          b.onclick = () => close(c.action);
          btns.appendChild(b);
        }
        const b = el("button", "btn", choices.length ? L("Agora não", "Not now") : L("Fechar", "Close"));
        b.onclick = () => close();
        btns.appendChild(b);
      }
    };
    render();
  }

  closeDialog() {
    this.dialogOpen?.remove();
    this.dialogOpen = null;
  }

  // ---------- Shop ----------
  openShop(stock: (Item | null)[], rerollCost: number, vendor = this.shopVendor) {
    this.shopVendor = vendor;
    this.shopOpen = true;
    this.shopStock = stock;
    this.rerollCost = rerollCost;
    this.chr.classList.remove("open");
    this.tree.classList.remove("open");
    this.shop.classList.add("open");
    this.inv.classList.add("open");
    this.invDirty = true;
  }

  refreshShop(stock: (Item | null)[], rerollCost: number) {
    this.shopStock = stock;
    this.rerollCost = rerollCost;
    this.invDirty = true;
  }

  closeShop() {
    if (!this.shopOpen) return;
    this.shopOpen = false;
    this.shop.classList.remove("open");
    this.invDirty = true;
  }

  /** Vendor window (Diablo IV style): the vendor, the wares as rows with their price, potions, buyback and gold. */
  private renderShop() {
    const gold = this.hero.gold, v = this.shopVendor;
    this.shop.innerHTML = "";
    const head = el("div", "shop-head");
    const pic = el("div", "shop-pic");
    if (v.portrait) pic.appendChild(v.portrait);
    head.append(pic, el("div", "shop-who", `<div class="shop-name">${esc(v.name)}</div><div class="shop-title">${esc(v.title)}</div>`));
    const x = el("button", "shop-x", "✕");
    x.title = L("Fechar loja", "Close Shop");
    x.onclick = () => { this.closeShop(); this.inv.classList.remove("open"); };
    head.appendChild(x);
    this.shop.appendChild(head);

    const row = (icon: HTMLElement, name: string, sub: string, price: number, buy: () => void, color = "") => {
      const r = el("button", `shop-item${price > gold ? " poor" : ""}`);
      const item = (icon as HTMLElement & { item?: Item }).item;
      if (item) {
        r.onmouseenter = (e) => this.showTip(item, e.clientX, e.clientY);
        r.onmousemove = (e) => this.moveTip(e.clientX, e.clientY);
        r.onmouseleave = () => this.hideTip();
      }
      r.append(icon, el("div", "si-text", `<div class="si-name"${color ? ` style="color:${color}"` : ""}>${name}</div><div class="si-sub">${sub}</div>`),
        el("div", "si-price", coins(price)));
      r.onclick = () => { this.hideTip(); buy(); };
      return r;
    };
    const list = el("div", "shop-list wares");
    this.shopStock.forEach((it, i) => {
      if (!it) return;
      list.appendChild(row(Object.assign(this.slotEl(it), { item: it }), esc(it.name), `${RARITY_LABEL[it.rarity]} · ${SLOT_LABEL[it.slot]}`, itemValue(it),
        () => this.actions.buy(i), RARITY_COLOR[it.rarity]));
    });
    if (!list.childElementCount) list.appendChild(el("div", "shop-empty", L("Tudo vendido. Renove o estoque ou volte mais tarde.", "Sold out. Restock or come back later.")));
    this.shop.appendChild(el("div", "shop-sec", L("Mercadorias", "Wares")));
    this.shop.appendChild(list);

    this.shop.appendChild(el("div", "shop-sec", L("Consumíveis", "Consumables")));
    const potions = el("div", "shop-list short");
    for (const k of ["hp", "mp"] as const) {
      const icon = el("div", "slot", `<img class="icon" src="${iconUrl(k === "hp" ? "potion_hp" : "potion_mp")}">`);
      potions.appendChild(row(icon, k === "hp" ? L("Poção de vida", "Health Potion") : L("Poção de recurso", "Resource Potion"),
        L("Vai para o cinto (teclas 1 e 2)", "Goes to your belt (keys 1 and 2)"), 25, () => this.actions.buyPotion(k)));
    }
    this.shop.appendChild(potions);

    this.shop.appendChild(el("div", "shop-sec", L("Recomprar", "Buyback")));
    const back = el("div", "shop-buyback");
    for (let i = 0; i < 6; i++) {
      const it = this.shopBuyback[i];
      const d = this.slotEl(it);
      if (it) {
        d.insertAdjacentHTML("beforeend", `<span class="count">${Math.round(itemValue(it) / 4)}</span>`);
        d.onclick = () => { this.hideTip(); this.actions.buyBack(i); };
      }
      back.appendChild(d);
    }
    this.shop.appendChild(back);

    const foot = el("div", "shop-foot");
    const rr = el("button", "btn", `${L("Renovar estoque", "Restock")} ${coins(this.rerollCost)}`);
    rr.onclick = () => this.actions.reroll();
    foot.append(el("div", "shop-gold", coins(gold)), rr);
    this.shop.appendChild(foot);

    // Quick sell: everything of one rarity in the backpack (equipped items are never sold).
    const inv = this.hero.inventory;
    const byRarity = new Map<Rarity, number[]>();
    inv.forEach((it, i) => it && byRarity.set(it.rarity, [...(byRarity.get(it.rarity) ?? []), i]));
    if (byRarity.size) {
      const quick = el("div", "quick-sell");
      quick.appendChild(el("div", "mp-label", L("Vender tudo da raridade", "Sell all of a rarity")));
      for (const r of RARITIES) {
        const idx = byRarity.get(r);
        if (!idx) continue;
        const total = idx.reduce((a, i) => a + Math.round(itemValue(inv[i]!) / 4), 0);
        const b = el("button", "btn", `<span style="color:${RARITY_COLOR[r]}">${RARITY_LABEL[r]}</span> ×${idx.length} ${coins(total)}`);
        b.title = L(`Vender ${idx.length} ${RARITY_LABEL[r].toLowerCase()} por ${total} ouro`, `Sell ${idx.length} ${RARITY_LABEL[r].toLowerCase()} for ${total} gold`);
        b.onclick = () => {
          // Valuable rarities ask for a second click.
          if ((r === "epic" || r === "legendary" || r === "unique") && b.dataset.armed !== "1") {
            b.dataset.armed = "1";
            b.innerHTML = L(`Confirmar: vender ${idx.length} ${RARITY_LABEL[r]}?`, `Confirm: sell ${idx.length} ${RARITY_LABEL[r]}?`);
            return;
          }
          this.actions.sellMany(idx);
        };
        quick.appendChild(b);
      }
      this.shop.appendChild(quick);
    }
    this.shop.appendChild(el("div", "hint", L("Clique para comprar · clique direito num item da mochila para vender (¼ do valor)", "Click to buy · right-click a backpack item to sell (¼ of its value)")));
  }

  // ---------- Big moments ----------
  /** Level-up showcase: flash, rays, big number, stat gains and newly unlocked skills. */
  levelUp(level: number, gains: string[], unlocked: SkillDef[]) {
    const flash = el("div", "flash");
    root().appendChild(flash);
    setTimeout(() => flash.remove(), 700);
    const box = el("div", "levelup");
    box.innerHTML = `<div class="rays"></div><div class="lv-label">${L("NÍVEL", "LEVEL")}</div><div class="lv-num">${level}</div>
      <div class="lv-gains">${gains.map((g) => `<span>${esc(g)}</span>`).join("")}</div>
      ${unlocked.map((s) => `<div class="lv-skill">${skillIcon(s)}<div><b>${L("Nova habilidade!", "New skill!")}</b><br>${esc(s.name)} <span class="lv-key">[${SLOT_KEY[s.slot]}]</span></div></div>`).join("")}`;
    root().appendChild(box);
    setTimeout(() => box.classList.add("out"), 3400);
    setTimeout(() => box.remove(), 4000);
  }

  /** Quest turned in: what was gained, the items as real slots (hover for their stats). Closes on click or after a while. */
  questComplete(title: string, r: RewardView, items: Item[]) {
    this.questDone?.remove();
    const box = el("div", "quest-done interactive");
    box.innerHTML = `<div class="qd-label">${L("Missão concluída", "Quest complete")}</div><div class="qd-title">${esc(title)}</div>
      ${rewardHtml({ ...r, items: [] })}`;
    if (items.length) {
      const row = el("div", "qd-items");
      for (const it of items) {
        const cell = el("div", "qd-item");
        cell.append(this.slotEl(it), el("span", "", `<b style="color:${RARITY_COLOR[it.rarity]}">${esc(it.name)}</b><small>${RARITY_LABEL[it.rarity]} · ${SLOT_LABEL[it.slot]}</small>`));
        row.appendChild(cell);
      }
      box.appendChild(row);
    }
    const ok = el("button", "btn primary", L("Ótimo!", "Great!"));
    const close = () => {
      this.hideTip();
      box.classList.add("out");
      setTimeout(() => box.remove(), 400);
      if (this.questDone === box) this.questDone = undefined;
    };
    ok.onclick = close;
    box.appendChild(ok);
    root().appendChild(box);
    this.questDone = box;
    setTimeout(() => box.isConnected && !box.matches(":hover") && close(), 9000);
  }
  private questDone?: HTMLDivElement;

  /** Full-width zone title card. */
  zoneTitle(name: string, sub: string) {
    this.zoneName = name;
    const t = el("div", "zone-title", `<div class="zt-sub">${esc(sub)}</div><div class="zt-name">${esc(name)}</div>`);
    root().appendChild(t);
    setTimeout(() => t.remove(), 3600);
  }

  setTarget(t: { name: string; hp: number; maxHp: number; kind: "normal" | "champion" | "boss" } | null) {
    if (!t) {
      this.target.style.display = "none";
      return;
    }
    this.target.style.display = "block";
    this.target.className = `target ${t.kind}`;
    this.target.innerHTML = `<div class="name">${esc(t.name)}${t.kind === "champion" ? " (Elite)" : ""}</div>
      <div class="bar"><i class="end l"></i><div style="width:${Math.max(0, t.hp / t.maxHp) * 100}%"></div><i class="end r"></i></div>`;
  }

  message(text: string, color = "#ece3cf") {
    const d = el("div", "", esc(text));
    d.style.color = color;
    this.log.appendChild(d);
    setTimeout(() => d.remove(), 4000);
    while (this.log.children.length > 6) this.log.firstChild!.remove();
  }

  banner(text: string, sub = "") {
    const b = el("div", "banner", esc(text) + (sub ? `<div class="bsub">${esc(sub)}</div>` : ""));
    root().appendChild(b);
    setTimeout(() => b.remove(), 3200);
  }

  private deathEl?: HTMLDivElement;

  /** `note`: an extra line (in a session, that the partner can revive you). */
  showDeath(onRespawn: () => void, note = "") {
    const d = el("div", "death interactive");
    d.innerHTML = `<h2>${L("Você morreu", "You have died")}</h2><div>${L("Você perde 10% do seu ouro.", "You lose 10% of your gold.")}</div>`
      + (note ? `<div class="death-note">${esc(note)}</div>` : "");
    const b = el("button", "btn", L("Renascer no checkpoint", "Respawn at Checkpoint"));
    b.onclick = () => {
      this.hideDeath();
      onRespawn();
    };
    d.appendChild(b);
    root().appendChild(d);
    this.deathEl = d;
  }

  hideDeath() {
    this.deathEl?.remove();
    this.deathEl = undefined;
  }

  /** A floating text at screen coordinates. */
  float(x: number, y: number, text: string, cls = "") {
    // Damage numbers (plain, crit, hurt) bounce off to one side; heals and quest notes just rise.
    const bounce = cls === "" || cls === "crit" || cls === "hurt";
    const f = el("div", `float ${cls}${bounce ? " dmg" : ""}`, esc(text));
    f.style.left = `${x}px`;
    f.style.top = `${y}px`;
    if (bounce) f.style.setProperty("--dx", `${Math.round((Math.random() < 0.5 ? -1 : 1) * (10 + Math.random() * 16))}px`);
    this.world.appendChild(f);
    setTimeout(() => f.remove(), bounce ? 1000 : 900);
    return f;
  }
}
