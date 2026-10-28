import type Phaser from "phaser";
import { CLASSES, type ClassId } from "../data/classes";
import { showCampfire } from "./campfire";
import { heroStage } from "./stage";
import { drawKiln } from "../kiln";
import { DIFFICULTIES, type Difficulty } from "../data/difficulty";
import { QUESTS } from "../data/quests";
import { ZONES } from "../data/zones";
import { HeroData, type SlotInfo } from "../game/hero";
import { saveSettings, settings } from "../game/settings";
import { isMuted, sfx, toggleMute } from "../game/audio";

// Main menu, save slots, new game (class + difficulty), options, controls and the in-game pause menu.

type Portraits = Partial<Record<ClassId, HTMLCanvasElement>>;

/** Phaser's textures, so menus can draw SpriteKiln sprites (set by Boot). */
let menuTextures: Phaser.Textures.TextureManager | null = null;
export const setMenuTextures = (t: Phaser.Textures.TextureManager) => (menuTextures = t);

/** How a game starts from the menu: alone, hosting a session, or joining one with a code. */
export type StartMode = { kind: "solo" } | { kind: "host" } | { kind: "join"; code: string };
type OnStart = (hero: HeroData, mode: StartMode) => void;
const SOLO: StartMode = { kind: "solo" };

const root = () => document.getElementById("ui")!;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", html = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

function button(label: string, onClick: () => void, cls = "mbtn") {
  const b = el("button", cls, label);
  b.onclick = () => {
    sfx.click();
    onClick();
  };
  return b;
}

const fmtTime = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, "0")}min` : `${m}min`;
};
const fmtDate = (t: number) => (t ? new Date(t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

/** A fresh copy of a class portrait (canvases can only live in one place in the DOM). */
function portraitOf(portraits: Portraits, cls: ClassId, size = 96) {
  const src = portraits[cls];
  const c = document.createElement("canvas");
  c.width = c.height = size;
  c.className = "pix";
  if (src) {
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, size, size);
  }
  return c;
}

/** Full-screen menu layer with the ember background; `render` fills its content. */
function screen(): HTMLDivElement {
  root().querySelector(".mm")?.remove();
  const m = el("div", "mm interactive");
  m.innerHTML = `<div class="embers">${Array.from({ length: 28 }, (_, i) =>
    `<i style="left:${(i * 37) % 100}%;animation-delay:${(i * 0.37) % 6}s;animation-duration:${5 + (i % 5)}s"></i>`).join("")}</div>`;
  root().appendChild(m);
  return m;
}

/** Boot registers how to replay a cutscene from the Cinematics menu. */
let playCinematic: ((id: "prologue") => void) | null = null;
export const registerCinematics = (fn: (id: "prologue") => void) => (playCinematic = fn);

const CINEMATICS: { id: "prologue"; name: string; desc: string }[] = [
  { id: "prologue", name: "Prólogo: A Horda de Grumm", desc: "Os tambores na floresta e a vila Minhau ao entardecer." },
];

/** A SpriteKiln hero drawn into a small canvas (roster cards). */
function heroPic(cls: ClassId, size: number) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  c.className = "pix";
  if (menuTextures) drawKiln(c.getContext("2d")!, menuTextures, cls, "idle", "s", 0, size / 2, size * 0.86, Math.max(1, Math.round(size / 40)));
  return c;
}

/** Title screen (Diablo II style): a gothic side panel with the menu, and the player's heroes in a night scene. */
export function showMainMenu(portraits: Portraits, onStart: OnStart) {
  const slots = HeroData.slots();
  const filled = slots.filter((s): s is SlotInfo => !!s);
  let chosen: SlotInfo | null = [...filled].sort((a, b) => b.savedAt - a.savedAt)[0] ?? null;
  const m = screen();
  m.classList.add("tm");
  m.innerHTML += `<canvas class="tm-canvas"></canvas>
    <aside class="tm-side"><div class="tm-arch">
      <div class="tm-logo"><h1>Diablo<span>Minhau</span></h1><div class="tm-sub">Um RPG de ação</div></div>
      <div class="tm-buttons mm-buttons"></div>
      <div class="tm-foot">SpriteKiln · Farm RPG 16x16 · Antigravity</div>
    </div></aside>
    <div class="tm-info"></div>
    <div class="tm-roster"></div>`;
  const stage = menuTextures ? heroStage(m.querySelector(".tm-canvas")!, { textures: menuTextures, heroX: 0.62, fire: -1 }) : null;
  const list = m.querySelector(".tm-buttons") as HTMLElement;
  const info = m.querySelector(".tm-info") as HTMLElement;
  const roster = m.querySelector(".tm-roster") as HTMLElement;
  const play = (s: SlotInfo) => {
    const h = HeroData.load(s.slot);
    if (h) onStart(h, SOLO);
  };

  const renderStage = () => stage?.set(chosen?.cls ?? null, filled.filter((s) => s !== chosen).map((s) => s.cls));

  const renderInfo = () => {
    if (!chosen) {
      info.innerHTML = `<div class="tm-name">Bem-vindo, viajante</div><div class="tm-line">Crie seu primeiro herói para começar a lenda.</div>`;
      return;
    }
    const c = CLASSES[chosen.cls], d = DIFFICULTIES[chosen.difficulty], q = QUESTS[chosen.quest];
    info.innerHTML = `<div class="tm-slot">Espaço ${chosen.slot + 1}</div><div class="tm-name">${esc(c.name)}</div>
      <div class="tm-lvl">Nível ${chosen.level} · <span style="color:${d.color}">${d.name}</span></div>
      <div class="tm-line">${esc(ZONES[chosen.zone]?.name ?? "")}</div>
      <div class="tm-line">${q ? `Missão: ${esc(q.title)}` : "História concluída"}</div>
      <div class="tm-line dim">${fmtTime(chosen.playtime)} jogados · ${fmtDate(chosen.savedAt)}</div>`;
  };

  const renderRoster = () => {
    roster.innerHTML = "";
    slots.forEach((s, i) => {
      const card = el("button", `tm-card${s ? "" : " empty"}${s && s === chosen ? " on" : ""}`);
      if (s) {
        card.appendChild(heroPic(s.cls, 64));
        card.insertAdjacentHTML("beforeend", `<div><b>${esc(CLASSES[s.cls].name)}</b><span>Nível ${s.level}</span>
          <span style="color:${DIFFICULTIES[s.difficulty].color}">${DIFFICULTIES[s.difficulty].name}</span></div>`);
        card.onclick = () => {
          if (chosen === s) return;
          sfx.coin();
          chosen = s;
          renderAll();
          stage?.cast();
        };
        card.ondblclick = () => play(s);
      } else {
        card.innerHTML = `<div class="tm-plus">+</div><div><b>Novo herói</b><span>Espaço ${i + 1}</span></div>`;
        card.onclick = () => { sfx.click(); showClassSelect(portraits, i, onStart); };
      }
      roster.appendChild(card);
    });
  };

  const renderButtons = () => {
    list.innerHTML = "";
    if (chosen) {
      const s = chosen;
      list.appendChild(button(`Jogar<small>${CLASSES[s.cls].name} · Nível ${s.level}</small>`, () => play(s), "mbtn primary"));
    }
    list.append(
      button("Novo Jogo", () => showSlots(portraits, "new", onStart)),
      button("Carregar Jogo", () => showSlots(portraits, "load", onStart)),
      button("Multijogador", () => showMultiplayer(portraits, onStart)),
      button("Cinemáticas", renderCinematics),
      button("Opções", () => showOptions(() => showMainMenu(portraits, onStart))),
      button("Controles", () => showControls(() => showMainMenu(portraits, onStart))),
    );
  };

  function renderCinematics() {
    list.innerHTML = `<div class="tm-head">Cinemáticas</div>`;
    for (const c of CINEMATICS) {
      list.appendChild(button(`${esc(c.name)}<small>${esc(c.desc)}</small>`, () => {
        stage?.destroy();
        m.remove();
        playCinematic?.(c.id);
      }));
    }
    list.appendChild(button("Voltar", renderButtons));
  }

  function renderAll() {
    renderStage();
    renderInfo();
    renderRoster();
    renderButtons();
  }
  renderAll();
}

function slotCard(info: SlotInfo | null, i: number, portraits: Portraits) {
  const card = el("div", `slot-card${info ? "" : " empty"}`);
  if (!info) {
    card.innerHTML = `<div class="sc-num">Espaço ${i + 1}</div><div class="sc-empty">— vazio —</div>`;
    return card;
  }
  const c = CLASSES[info.cls];
  const diff = DIFFICULTIES[info.difficulty];
  const quest = QUESTS[info.quest];
  card.innerHTML = `<div class="sc-num">Espaço ${i + 1}</div><div class="sc-pic"></div>
    <div class="sc-info"><div class="sc-name">${esc(c.name)} <span>Nível ${info.level}</span></div>
    <div class="sc-diff" style="color:${diff.color}">${diff.name}</div>
    <div class="sc-line">${esc(ZONES[info.zone]?.name ?? "")} · ${quest ? `Missão: ${esc(quest.title)}` : "História concluída"}</div>
    <div class="sc-line dim">${fmtTime(info.playtime)} jogados · ${fmtDate(info.savedAt)}</div></div>`;
  card.querySelector(".sc-pic")!.appendChild(portraitOf(portraits, info.cls, 72));
  return card;
}

function showSlots(portraits: Portraits, mode: "new" | "load", onStart: OnStart) {
  const m = screen();
  const box = el("div", "mm-panel");
  box.innerHTML = `<h2>${mode === "new" ? "Novo Jogo — escolha um espaço" : "Carregar Jogo"}</h2>`;
  const slots = HeroData.slots();
  const grid = el("div", "slot-list");
  slots.forEach((info, i) => {
    const card = slotCard(info, i, portraits);
    const actions = el("div", "sc-actions");
    if (mode === "load") {
      if (info) {
        actions.append(
          button("Jogar", () => {
            const h = HeroData.load(i);
            if (h) onStart(h, SOLO);
          }, "mbtn small primary"),
          button("Apagar", () => confirmBox(`Apagar o personagem do espaço ${i + 1}? Isso não pode ser desfeito.`, () => {
            HeroData.deleteSlot(i);
            showSlots(portraits, mode, onStart);
          }), "mbtn small danger"),
        );
      }
    } else {
      actions.append(button(info ? "Sobrescrever" : "Criar personagem", () => {
        const go = () => showClassSelect(portraits, i, onStart);
        if (info) confirmBox(`O espaço ${i + 1} já tem um ${CLASSES[info.cls].name} nível ${info.level}. Sobrescrever?`, go);
        else go();
      }, info ? "mbtn small danger" : "mbtn small primary"));
    }
    card.appendChild(actions);
    grid.appendChild(card);
  });
  box.appendChild(grid);
  box.appendChild(button("Voltar", () => showMainMenu(portraits, onStart)));
  m.appendChild(box);
}

/** New game: pick class and difficulty around the campfire. */
function showClassSelect(portraits: Portraits, slot: number, onStart: OnStart) {
  if (!menuTextures) return;
  showCampfire({
    textures: menuTextures, slot,
    onStart: (cls, difficulty) => onStart(HeroData.create(slot, cls, difficulty), SOLO),
    onBack: () => showSlots(portraits, "new", onStart),
  });
}

function confirmBox(text: string, onYes: () => void) {
  const ov = el("div", "confirm interactive");
  const b = el("div", "mm-panel small");
  b.innerHTML = `<p>${esc(text)}</p>`;
  const row = el("div", "row");
  row.append(button("Sim", () => { ov.remove(); onYes(); }, "mbtn small danger"), button("Cancelar", () => ov.remove(), "mbtn small"));
  b.appendChild(row);
  ov.appendChild(b);
  root().appendChild(ov);
}

/** Host a session or join a friend's code, with one of your saved characters. */
export function showMultiplayer(portraits: Portraits, onStart: OnStart, code = "", error = "") {
  const m = screen();
  const box = el("div", "mm-panel");
  const slots = HeroData.slots();
  box.innerHTML = `<h2>Multijogador</h2>
    <div class="sub">Cooperativo para 2 jogadores. Cada um usa o próprio personagem salvo; o anfitrião conduz as viagens.</div>
    ${error ? `<div class="mp-error">${esc(error)}</div>` : ""}`;
  if (!slots.some(Boolean)) {
    box.appendChild(el("div", "sub", "Crie um personagem em Novo Jogo antes de jogar online."));
    box.appendChild(button("Voltar", () => showMainMenu(portraits, onStart)));
    m.appendChild(box);
    return;
  }
  const pick = el("div", "mp-pick");
  pick.innerHTML = "<div class='mp-label'>Personagem</div>";
  let chosen = slots.findIndex(Boolean);
  slots.forEach((info, i) => {
    if (!info) return;
    const b = el("button", `mp-slot${i === chosen ? " on" : ""}`);
    b.appendChild(portraitOf(portraits, info.cls, 40));
    b.insertAdjacentHTML("beforeend", `<span>${esc(CLASSES[info.cls].name)} nv ${info.level}<small>espaço ${i + 1} · ${DIFFICULTIES[info.difficulty].name}</small></span>`);
    b.onclick = () => {
      chosen = i;
      pick.querySelectorAll(".mp-slot").forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
    };
    pick.appendChild(b);
  });
  box.appendChild(pick);

  const load = () => HeroData.load(chosen);
  const host = el("div", "mp-sec");
  host.innerHTML = "<div class='mp-label'>Hospedar</div><div class='sub'>Crie uma sessão e mande o link para o seu colega.</div>";
  host.appendChild(button("Hospedar sessão", () => {
    const h = load();
    if (h) onStart(h, { kind: "host" });
  }, "mbtn primary"));
  const join = el("div", "mp-sec");
  join.innerHTML = `<div class='mp-label'>Entrar</div><div class='sub'>Digite o código que o anfitrião enviou.</div>
    <input class="mp-code" maxlength="5" placeholder="CÓDIGO" value="${esc(code)}">`;
  join.appendChild(button("Entrar na sessão", () => {
    const c = (join.querySelector(".mp-code") as HTMLInputElement).value.trim().toUpperCase();
    const h = load();
    if (c.length === 5 && h) onStart(h, { kind: "join", code: c });
  }, "mbtn primary"));
  const row = el("div", "mp-row");
  row.append(host, join);
  box.appendChild(row);
  box.appendChild(button("Voltar", () => showMainMenu(portraits, onStart)));
  m.appendChild(box);
}

/** Connecting / waiting screen with a cancel button. */
export function showWaiting(text: string, onCancel: () => void) {
  const m = screen();
  const box = el("div", "mm-panel small");
  box.innerHTML = `<h2>Multijogador</h2><div class="mp-wait">${esc(text)}</div>`;
  box.appendChild(button("Cancelar", onCancel));
  m.appendChild(box);
}

export function showOptions(onBack: () => void) {
  const m = screen();
  const box = el("div", "mm-panel");
  box.innerHTML = "<h2>Opções</h2>";
  const form = el("div", "options");
  form.innerHTML = `
    <label>Volume <input type="range" min="0" max="100" value="${Math.round(settings.volume * 100)}" data-k="volume"></label>
    <label><input type="checkbox" ${isMuted() ? "checked" : ""} data-k="mute"> Silenciar tudo</label>
    <label><input type="checkbox" ${settings.shake ? "checked" : ""} data-k="shake"> Tremor de tela</label>
    <label><input type="checkbox" ${settings.damageNumbers ? "checked" : ""} data-k="damageNumbers"> Números de dano</label>
    <label>Zoom da câmera <select data-k="zoom">
      ${["auto", 2, 3, 4].map((z) => `<option value="${z}" ${settings.zoom === z ? "selected" : ""}>${z === "auto" ? "Automático" : `${z}x`}</option>`).join("")}
    </select></label>`;
  form.oninput = form.onchange = (ev) => {
    const t = ev.target as HTMLInputElement;
    switch (t.dataset.k) {
      case "volume": settings.volume = Number(t.value) / 100; break;
      case "mute": if (t.checked !== isMuted()) toggleMute(); break;
      case "shake": settings.shake = t.checked; break;
      case "damageNumbers": settings.damageNumbers = t.checked; break;
      case "zoom": settings.zoom = t.value === "auto" ? "auto" : (Number(t.value) as 2 | 3 | 4); break;
    }
    saveSettings();
  };
  box.appendChild(form);
  box.appendChild(button("Voltar", onBack));
  m.appendChild(box);
}

export function showControls(onBack: () => void) {
  const m = screen();
  const box = el("div", "mm-panel");
  const rows: [string, string][] = [
    ["Clique esquerdo", "Mover · atacar · falar · pegar itens · entrar em casas e portais"],
    ["Shift + clique", "Atacar parado"], ["Clique direito", "Habilidade secundária"],
    ["Q · E · R", "Habilidades da árvore"], ["Espaço", "Esquiva (invulnerável por um instante)"],
    ["WASD", "Mover"], ["1 · 2", "Poção de vida · recurso"], ["I · C · K", "Inventário · personagem · habilidades"],
    ["M", "Ampliar o minimapa"], ["Esc", "Fechar janelas · menu de pausa"],
  ];
  box.innerHTML = `<h2>Controles</h2><div class="controls">${rows.map(([k, v]) => `<div><kbd>${k}</kbd><span>${v}</span></div>`).join("")}</div>`;
  box.appendChild(button("Voltar", onBack));
  m.appendChild(box);
}

/** In-game menu (Diablo III style): the hero on a pedestal, game options on the left, the session on the right. */
export function showPauseMenu(opts: {
  onResume: () => void; onQuit: () => void; onInvite?: () => void; difficulty: Difficulty; slot: number;
  cls: ClassId; level: number; zone: string; quest: string; online: boolean;
}) {
  const m = screen();
  m.classList.add("tm", "pause");
  const d = DIFFICULTIES[opts.difficulty];
  m.innerHTML += `<canvas class="tm-canvas"></canvas>
    <aside class="tm-side slim"><div class="tm-arch">
      <div class="tm-logo"><h1>Diablo<span>Minhau</span></h1><div class="tm-sub">Menu do jogo (Esc)</div></div>
      <div class="tm-buttons mm-buttons"></div>
    </div></aside>
    <div class="tm-info right">
      <div class="tm-slot">Configuração atual</div>
      <div class="tm-name">${esc(CLASSES[opts.cls].name)}</div>
      <div class="tm-lvl">Nível ${opts.level} · Espaço ${opts.slot + 1}</div>
      <div class="tm-line">${esc(opts.zone)}</div>
      <div class="tm-line">${esc(opts.quest)}</div>
      <div class="tm-line">${opts.online ? "Partida em grupo (online)" : "Partida particular"}</div>
      <div class="tm-diff" style="--c:${d.color}"><b>${d.name}</b><span>${esc(d.desc)}</span></div>
    </div>
    <div class="tm-return"></div>`;
  const stage = menuTextures ? heroStage(m.querySelector(".tm-canvas")!, { textures: menuTextures, heroX: 0.55, heroY: 0.78, fire: 1 }) : null;
  stage?.set(opts.cls, []);
  const list = m.querySelector(".tm-buttons") as HTMLElement;
  const back = () => showPauseMenu(opts);
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !m.isConnected || !m.querySelector(".tm-return")) return;
    close();
    opts.onResume();
  };
  const close = () => { window.removeEventListener("keydown", onKey); stage?.destroy(); m.remove(); };
  window.setTimeout(() => window.addEventListener("keydown", onKey));
  list.append(
    button("Opções", () => showOptions(back)),
    button("Controles", () => showControls(back)),
  );
  if (opts.onInvite) list.appendChild(button("Convidar amigo", () => { close(); opts.onInvite!(); }));
  list.append(button("Salvar e sair", () => { close(); opts.onQuit(); }, "mbtn danger"));
  m.querySelector(".tm-return")!.appendChild(button("Voltar ao jogo", () => { close(); opts.onResume(); }, "mbtn primary"));
}

export const closeMenus = () => root().querySelector(".mm")?.remove();

let reopen: (() => void) | null = null;
/** Boot registers how to show the main menu, so the game can return to it. */
export const registerMainMenu = (fn: () => void) => (reopen = fn);
export const openMainMenu = () => reopen?.();
