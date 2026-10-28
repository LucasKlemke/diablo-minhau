import { CLASSES, CLASS_ORDER, type ClassId } from "../data/classes";
import { DIFFICULTIES, DIFFICULTY_ORDER, type Difficulty } from "../data/difficulty";
import { QUESTS } from "../data/quests";
import { ZONES } from "../data/zones";
import { HeroData, type SlotInfo } from "../game/hero";
import { saveSettings, settings } from "../game/settings";
import { isMuted, sfx, toggleMute } from "../game/audio";

// Main menu, save slots, new game (class + difficulty), options, controls and the in-game pause menu.

type Portraits = Partial<Record<ClassId, HTMLCanvasElement>>;

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
    sfx.coin();
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

export function showMainMenu(portraits: Portraits, onStart: OnStart) {
  const slots = HeroData.slots();
  const latest = slots.filter((s): s is SlotInfo => !!s).sort((a, b) => b.savedAt - a.savedAt)[0];
  const m = screen();
  const box = el("div", "mm-title");
  box.innerHTML = `<div class="mm-heroes"></div><h1>Diablo Minhau</h1><div class="sub">Um RPG de ação na vila de Minhau</div>`;
  const heroes = box.querySelector(".mm-heroes")!;
  for (const c of CLASS_ORDER) heroes.appendChild(portraitOf(portraits, c, 112));
  const list = el("div", "mm-buttons");
  if (latest) {
    const c = button(`Continuar<small>${CLASSES[latest.cls].name} · Nível ${latest.level} · ${DIFFICULTIES[latest.difficulty].name}</small>`, () => {
      const h = HeroData.load(latest.slot);
      if (h) onStart(h, SOLO);
    }, "mbtn primary");
    list.appendChild(c);
  }
  list.append(
    button("Novo Jogo", () => showSlots(portraits, "new", onStart)),
    button("Carregar Jogo", () => showSlots(portraits, "load", onStart)),
    button("Multijogador<small>jogue com um amigo pela internet</small>", () => showMultiplayer(portraits, onStart)),
    button("Opções", () => showOptions(() => showMainMenu(portraits, onStart))),
    button("Controles", () => showControls(() => showMainMenu(portraits, onStart))),
  );
  box.appendChild(list);
  box.appendChild(el("div", "mm-foot", "Sprites feitos com SpriteKiln · Terreno: Farm RPG 16x16 · Ícones gerados com Antigravity"));
  m.appendChild(box);
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

function showClassSelect(portraits: Portraits, slot: number, onStart: OnStart) {
  const m = screen();
  const box = el("div", "mm-panel wide");
  box.innerHTML = "<h2>Escolha sua classe</h2>";
  const grid = el("div", "classes");
  for (const id of CLASS_ORDER) {
    const c = CLASSES[id];
    const card = el("button", "class-card");
    const pic = el("div", "portrait");
    pic.appendChild(portraitOf(portraits, id, 96));
    card.appendChild(pic);
    card.appendChild(el("h2", "", c.name));
    card.appendChild(el("p", "", esc(c.desc)));
    card.appendChild(el("p", "", `<b style="color:${c.resourceColor}">${c.resource}</b> · ${c.skills.length} habilidades`));
    card.onclick = () => {
      sfx.coin();
      showDifficulty(portraits, slot, id, onStart);
    };
    grid.appendChild(card);
  }
  box.appendChild(grid);
  box.appendChild(button("Voltar", () => showSlots(portraits, "new", onStart)));
  m.appendChild(box);
}

function showDifficulty(portraits: Portraits, slot: number, cls: ClassId, onStart: OnStart) {
  const m = screen();
  const box = el("div", "mm-panel");
  box.innerHTML = `<h2>Dificuldade</h2><div class="sub">${esc(CLASSES[cls].name)} · espaço ${slot + 1}</div>`;
  const grid = el("div", "diff-list");
  for (const id of DIFFICULTY_ORDER) {
    const d = DIFFICULTIES[id];
    const b = el("button", `diff-card${id === "normal" ? " rec" : ""}`);
    b.innerHTML = `<div class="dn" style="color:${d.color}">${d.name}${id === "normal" ? " <small>(recomendado)</small>" : ""}</div>
      <div class="dd">${esc(d.desc)}</div>
      <div class="ds">Vida dos inimigos ×${d.enemyHp} · Dano ×${d.enemyDmg} · XP ×${d.xp} · Loot ×${d.magicFind}</div>`;
    b.onclick = () => {
      sfx.levelUp();
      onStart(HeroData.create(slot, cls, id as Difficulty), SOLO);
    };
    grid.appendChild(b);
  }
  box.appendChild(grid);
  box.appendChild(button("Voltar", () => showClassSelect(portraits, slot, onStart)));
  m.appendChild(box);
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

/** In-game pause menu. */
export function showPauseMenu(opts: { onResume: () => void; onQuit: () => void; onInvite?: () => void; difficulty: Difficulty; slot: number }) {
  const m = screen();
  m.classList.add("pause");
  const box = el("div", "mm-panel small");
  const d = DIFFICULTIES[opts.difficulty];
  box.innerHTML = `<h2>Pausado</h2><div class="sub">Espaço ${opts.slot + 1} · <span style="color:${d.color}">${d.name}</span></div>`;
  const list = el("div", "mm-buttons");
  const back = () => showPauseMenu(opts);
  list.append(
    button("Continuar", () => { m.remove(); opts.onResume(); }, "mbtn primary"),
    button("Opções", () => showOptions(back)),
    button("Controles", () => showControls(back)),
  );
  if (opts.onInvite) list.appendChild(button("Convidar amigo (multijogador)", () => { m.remove(); opts.onInvite!(); }));
  list.append(
    button("Salvar e sair para o menu", () => { m.remove(); opts.onQuit(); }),
  );
  box.appendChild(list);
  m.appendChild(box);
}

export const closeMenus = () => root().querySelector(".mm")?.remove();

let reopen: (() => void) | null = null;
/** Boot registers how to show the main menu, so the game can return to it. */
export const registerMainMenu = (fn: () => void) => (reopen = fn);
export const openMainMenu = () => reopen?.();
