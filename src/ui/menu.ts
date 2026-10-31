import type Phaser from "phaser";
import { CLASSES, type ClassId } from "../data/classes";
import { showCampfire } from "./campfire";
import { heroStage } from "./stage";
import { L, lang, locale, setLang, type Lang } from "../i18n";
import { drawKiln } from "../kiln";
import { DIFFICULTIES, type Difficulty } from "../data/difficulty";
import { QUESTS } from "../data/quests";
import { AREAS, ZONES } from "../data/zones";
import { HeroData, type SlotInfo } from "../game/hero";
import { saveSettings, settings, SOUND_CHANNELS, type SoundChannel } from "../game/settings";
import { cine, isMuted, setMusic, sfx, toggleMute } from "../game/audio";

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
const fmtDate = (t: number) => (t ? new Date(t).toLocaleString(locale(), { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

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
  { id: "prologue", name: L("Prólogo: A Queda da Corte", "Prologue: The Fall of the Court"), desc: L("A noite em que Jimmy voltou da tempestade, e o despertar dez anos depois.", "The night Jimmy came back from the storm, and the awakening ten years later.") },
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
  setMusic("menu");
  const m = screen();
  m.classList.add("tm");
  m.innerHTML += `<canvas class="tm-canvas"></canvas>
    <aside class="tm-side"><div class="tm-arch">
      <div class="tm-logo"><h1><small>Chronicles of</small><span>Minhau</span></h1><div class="tm-sub">${L("Um RPG de ação", "An action RPG")}</div></div>
      <div class="tm-buttons mm-buttons"></div>
      <div class="tm-lang">${(["en", "pt"] as Lang[]).map((l) => `<button data-l="${l}" class="${l === lang ? "on" : ""}">${l.toUpperCase()}</button>`).join("")}</div>
      <div class="tm-foot">SpriteKiln · Farm RPG 16x16 · Antigravity</div>
    </div></aside>
    <div class="tm-info"></div>
    <div class="tm-roster"></div>`;
  const stage = menuTextures ? heroStage(m.querySelector(".tm-canvas")!, { textures: menuTextures, heroX: 0.62, fire: -1 }) : null;
  const list = m.querySelector(".tm-buttons") as HTMLElement;
  m.querySelectorAll<HTMLButtonElement>(".tm-lang button").forEach((b) => (b.onclick = () => setLang(b.dataset.l as Lang)));
  const info = m.querySelector(".tm-info") as HTMLElement;
  const roster = m.querySelector(".tm-roster") as HTMLElement;
  const play = (s: SlotInfo) => {
    const h = HeroData.load(s.slot);
    if (h) onStart(h, SOLO);
  };

  const renderStage = () => stage?.set(chosen?.cls ?? null, filled.filter((s) => s !== chosen).map((s) => s.cls));

  const renderInfo = () => {
    if (!chosen) {
      info.innerHTML = `<div class="tm-name">${L("Bem-vindo, viajante", "Welcome, traveler")}</div><div class="tm-line">${L("Crie seu primeiro herói para começar a lenda.", "Create your first hero to begin the legend.")}</div>`;
      return;
    }
    const c = CLASSES[chosen.cls], d = DIFFICULTIES[chosen.difficulty], q = QUESTS[chosen.quest];
    info.innerHTML = `<div class="tm-slot">${L("Espaço", "Slot")} ${chosen.slot + 1}</div><div class="tm-name">${esc(c.name)}</div>
      <div class="tm-lvl">${L("Nível", "Level")} ${chosen.level} · <span style="color:${d.color}">${d.name}</span></div>
      <div class="tm-line">${esc((chosen.area && AREAS[chosen.area]?.name) || ZONES[chosen.zone]?.name || "")}</div>
      <div class="tm-line">${q ? `${L("Missão", "Quest")}: ${esc(q.title)}` : L("História concluída", "Story complete")}</div>
      <div class="tm-line dim">${fmtTime(chosen.playtime)} ${L("jogados", "played")} · ${fmtDate(chosen.savedAt)}</div>`;
  };

  const renderRoster = () => {
    roster.innerHTML = "";
    slots.forEach((s, i) => {
      const card = el("button", `tm-card${s ? "" : " empty"}${s && s === chosen ? " on" : ""}`);
      if (s) {
        card.appendChild(heroPic(s.cls, 64));
        card.insertAdjacentHTML("beforeend", `<div><b>${esc(CLASSES[s.cls].name)}${s.dev ? ` <em class="tm-dev">DEV</em>` : ""}</b><span>${L("Nível", "Level")} ${s.level}</span>
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
        card.innerHTML = `<div class="tm-plus">+</div><div><b>${L("Novo herói", "New Hero")}</b><span>${L("Espaço", "Slot")} ${i + 1}</span></div>`;
        card.onclick = () => { sfx.click(); showClassSelect(portraits, i, onStart); };
      }
      roster.appendChild(card);
    });
  };

  const renderButtons = () => {
    list.innerHTML = "";
    if (chosen) {
      const s = chosen;
      list.appendChild(button(`${L("Jogar", "Play")}<small>${CLASSES[s.cls].name} · ${L("Nível", "Level")} ${s.level}</small>`, () => play(s), "mbtn primary"));
    }
    list.append(
      button(L("Novo Jogo", "New Game"), () => showSlots(portraits, "new", onStart)),
      button(L("Carregar Jogo", "Load Game"), () => showSlots(portraits, "load", onStart)),
      button(L("Multijogador", "Multiplayer"), () => showMultiplayer(portraits, onStart)),
      button(L("Cinemáticas", "Cinematics"), renderCinematics),
      button(L("Opções", "Options"), () => showOptions(() => showMainMenu(portraits, onStart))),
      button(L("Controles", "Controls"), () => showControls(() => showMainMenu(portraits, onStart))),
    );
    // Development only: a new hero in the first free slot with god mode, 10x damage and double speed.
    if (import.meta.env.DEV) {
      const free = slots.findIndex((s) => !s);
      list.appendChild(button(`${L("Save de dev", "Dev save")}<small>${free < 0 ? L("Sem espaço livre", "No free slot")
        : L("Godmode · dano x10 · velocidade x2", "God mode · 10x damage · 2x speed")}</small>`, () => {
        if (free < 0) return;
        sfx.click();
        showClassSelect(portraits, free, onStart, true);
      }));
    }
  };

  function renderCinematics() {
    list.innerHTML = `<div class="tm-head">${L("Cinemáticas", "Cinematics")}</div>`;
    for (const c of CINEMATICS) {
      list.appendChild(button(`${esc(c.name)}<small>${esc(c.desc)}</small>`, () => {
        stage?.destroy();
        m.remove();
        playCinematic?.(c.id);
      }));
    }
    list.appendChild(button(L("Voltar", "Back"), renderButtons));
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
    card.innerHTML = `<div class="sc-num">${L("Espaço", "Slot")} ${i + 1}</div><div class="sc-empty">— ${L("vazio", "empty")} —</div>`;
    return card;
  }
  const c = CLASSES[info.cls];
  const diff = DIFFICULTIES[info.difficulty];
  const quest = QUESTS[info.quest];
  card.innerHTML = `<div class="sc-num">${L("Espaço", "Slot")} ${i + 1}</div><div class="sc-pic"></div>
    <div class="sc-info"><div class="sc-name">${esc(c.name)} <span>${L("Nível", "Level")} ${info.level}</span></div>
    <div class="sc-diff" style="color:${diff.color}">${diff.name}</div>
    <div class="sc-line">${esc((info.area && AREAS[info.area]?.name) || ZONES[info.zone]?.name || "")} · ${quest ? `${L("Missão", "Quest")}: ${esc(quest.title)}` : L("História concluída", "Story complete")}</div>
    <div class="sc-line dim">${fmtTime(info.playtime)} ${L("jogados", "played")} · ${fmtDate(info.savedAt)}</div></div>`;
  card.querySelector(".sc-pic")!.appendChild(portraitOf(portraits, info.cls, 72));
  return card;
}

function showSlots(portraits: Portraits, mode: "new" | "load", onStart: OnStart) {
  const m = screen();
  const box = el("div", "mm-panel");
  box.innerHTML = `<h2>${mode === "new" ? L("Novo Jogo — escolha um espaço", "New Game — Choose a Slot") : L("Carregar Jogo", "Load Game")}</h2>`;
  const slots = HeroData.slots();
  const grid = el("div", "slot-list");
  slots.forEach((info, i) => {
    const card = slotCard(info, i, portraits);
    const actions = el("div", "sc-actions");
    if (mode === "load") {
      if (info) {
        actions.append(
          button(L("Jogar", "Play"), () => {
            const h = HeroData.load(i);
            if (h) onStart(h, SOLO);
          }, "mbtn small primary"),
          button(L("Apagar", "Delete"), () => confirmBox(L(`Apagar o personagem do espaço ${i + 1}? Isso não pode ser desfeito.`, `Delete the character in slot ${i + 1}? This cannot be undone.`), () => {
            HeroData.deleteSlot(i);
            showSlots(portraits, mode, onStart);
          }), "mbtn small danger"),
        );
      }
    } else {
      actions.append(button(info ? L("Sobrescrever", "Overwrite") : L("Criar personagem", "Create Character"), () => {
        const go = () => showClassSelect(portraits, i, onStart);
        if (info) confirmBox(L(`O espaço ${i + 1} já tem um ${CLASSES[info.cls].name} nível ${info.level}. Sobrescrever?`, `Slot ${i + 1} already holds a level ${info.level} ${CLASSES[info.cls].name}. Overwrite?`), go);
        else go();
      }, info ? "mbtn small danger" : "mbtn small primary"));
    }
    card.appendChild(actions);
    grid.appendChild(card);
  });
  box.appendChild(grid);
  box.appendChild(button(L("Voltar", "Back"), () => showMainMenu(portraits, onStart)));
  m.appendChild(box);
}

/** New game: pick class and difficulty around the campfire. `mode` starts it hosting or joining a session. */
function showClassSelect(portraits: Portraits, slot: number, onStart: OnStart, dev = false, mode: StartMode = SOLO,
  onBack = () => showSlots(portraits, "new", onStart)) {
  if (!menuTextures) return;
  showCampfire({
    textures: menuTextures, slot,
    onStart: (cls, difficulty) => {
      const h = HeroData.create(slot, cls, difficulty);
      if (dev) { h.dev = true; h.save(); }
      onStart(h, mode);
    },
    onBack,
  });
}

/** Online with a brand-new hero: create it in the first free slot, then host or join with it. */
export function createHeroFor(portraits: Portraits, onStart: OnStart, mode: StartMode, onBack: () => void) {
  const free = HeroData.slots().findIndex((x) => !x);
  if (free < 0) return false;
  showClassSelect(portraits, free, onStart, false, mode, onBack);
  return true;
}

function confirmBox(text: string, onYes: () => void) {
  const ov = el("div", "confirm interactive");
  const b = el("div", "mm-panel small");
  b.innerHTML = `<p>${esc(text)}</p>`;
  const row = el("div", "row");
  row.append(button(L("Sim", "Yes"), () => { ov.remove(); onYes(); }, "mbtn small danger"), button(L("Cancelar", "Cancel"), () => ov.remove(), "mbtn small"));
  b.appendChild(row);
  ov.appendChild(b);
  root().appendChild(ov);
}

/** Host a session or join a friend's code, with one of your saved characters. */
export function showMultiplayer(portraits: Portraits, onStart: OnStart, code = "", error = "") {
  const m = screen();
  const box = el("div", "mm-panel");
  const slots = HeroData.slots();
  box.innerHTML = `<h2>${L("Multijogador", "Multiplayer")}</h2>
    <div class="sub">${L("Cooperativo para 2 jogadores. Cada um usa o próprio personagem salvo; o anfitrião conduz as viagens.", "Co-op for 2 players. Each brings their own saved character; the host leads the travels.")}</div>
    ${error ? `<div class="mp-error">${esc(error)}</div>` : ""}`;
  const pick = el("div", "mp-pick");
  pick.innerHTML = `<div class='mp-label'>${L("Personagem", "Character")}</div>`;
  // -1: a new hero, created before the session opens (a new game played together from the start).
  let chosen = slots.findIndex(Boolean);
  const canCreate = slots.some((x) => !x);
  if (canCreate) {
    const b = el("button", `mp-slot new${chosen < 0 ? " on" : ""}`);
    b.innerHTML = `<div class="tm-plus">+</div><span>${L("Novo herói", "New Hero")}<small>${L("começar uma nova partida", "start a new game")}</small></span>`;
    b.onclick = () => {
      chosen = -1;
      pick.querySelectorAll(".mp-slot").forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
    };
    pick.appendChild(b);
  }
  slots.forEach((info, i) => {
    if (!info) return;
    const b = el("button", `mp-slot${i === chosen ? " on" : ""}`);
    b.appendChild(portraitOf(portraits, info.cls, 40));
    b.insertAdjacentHTML("beforeend", `<span>${esc(CLASSES[info.cls].name)} ${L("nv", "lv")} ${info.level}<small>${L("espaço", "slot")} ${i + 1} · ${DIFFICULTIES[info.difficulty].name}</small></span>`);
    b.onclick = () => {
      chosen = i;
      pick.querySelectorAll(".mp-slot").forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
    };
    pick.appendChild(b);
  });
  box.appendChild(pick);

  const back = () => showMultiplayer(portraits, onStart, (join.querySelector(".mp-code") as HTMLInputElement).value.trim().toUpperCase());
  /** Starts with the chosen hero, or creates one first. */
  const go = (mode: StartMode) => {
    if (chosen < 0) {
      if (!createHeroFor(portraits, onStart, mode, back))
        showMultiplayer(portraits, onStart, "", L("Todos os espaços estão ocupados.", "All slots are taken."));
      return;
    }
    const h = HeroData.load(chosen);
    if (h) onStart(h, mode);
  };
  const host = el("div", "mp-sec");
  host.innerHTML = `<div class='mp-label'>${L("Hospedar", "Host")}</div><div class='sub'>${L("Crie uma sessão e mande o link para o seu colega.", "Create a session and send the link to your friend.")}</div>`;
  host.appendChild(button(L("Hospedar sessão", "Host Session"), () => go({ kind: "host" }), "mbtn primary"));
  const join = el("div", "mp-sec");
  join.innerHTML = `<div class='mp-label'>${L("Entrar", "Join")}</div><div class='sub'>${L("Digite o código que o anfitrião enviou.", "Enter the code the host sent you.")}</div>
    <input class="mp-code" maxlength="5" placeholder="${L("CÓDIGO", "CODE")}" value="${esc(code)}">`;
  join.appendChild(button(L("Entrar na sessão", "Join Session"), () => {
    const c = (join.querySelector(".mp-code") as HTMLInputElement).value.trim().toUpperCase();
    if (c.length === 5) go({ kind: "join", code: c });
  }, "mbtn primary"));
  const row = el("div", "mp-row");
  row.append(host, join);
  box.appendChild(row);
  box.appendChild(button(L("Voltar", "Back"), () => showMainMenu(portraits, onStart)));
  m.appendChild(box);
}

/** Session lobby. The host sees the code, the invite link, who joined and starts the game; the guest waits
 * for the host. Returns a function that updates the partner line. */
export function showLobby(o: { host: boolean; code: string; link?: string; me: string; onStart?: () => void; onCancel: () => void }) {
  const m = screen();
  const box = el("div", "mm-panel small lobby");
  box.innerHTML = `<h2>${L("Multijogador", "Multiplayer")}</h2>
    <div class="lb-code">${L("Sessão", "Session")} <b>${esc(o.code)}</b></div>
    <div class="lb-players"><div class="lb-p on">${esc(o.me)}<small>${o.host ? L("anfitrião", "host") : L("você", "you")}</small></div><div class="lb-p partner"></div></div>
    <div class="sub lb-hint"></div>`;
  if (o.link) {
    const copy = button(L("Copiar link de convite", "Copy invite link"), () => {
      void navigator.clipboard?.writeText(o.link!);
      copy.innerHTML = L("Link copiado!", "Link copied!");
    });
    box.appendChild(copy);
  }
  const start = o.onStart ? button(L("Começar", "Start"), o.onStart, "mbtn primary") : null;
  if (start) box.appendChild(start);
  box.appendChild(button(L("Cancelar", "Cancel"), o.onCancel));
  m.appendChild(box);
  const partner = box.querySelector(".lb-p.partner") as HTMLElement;
  const hint = box.querySelector(".lb-hint") as HTMLElement;
  const set = (who: string | null) => {
    partner.classList.toggle("on", !!who);
    partner.innerHTML = who ? `${esc(who)}<small>${o.host ? L("colega", "companion") : L("anfitrião", "host")}</small>`
      : `<span class="lb-dots">${L("aguardando colega", "waiting for companion")}</span>`;
    hint.textContent = o.host
      ? who ? L("Tudo pronto. Comece quando quiser.", "All set. Start whenever you like.")
        : L("Mande o link ao colega. Você também pode começar agora: ele entra depois.", "Send the link to your companion. You can also start now: they can join later.")
      : L("Aguardando o anfitrião começar a partida...", "Waiting for the host to start the game...");
  };
  set(null);
  return set;
}

/** Connecting / waiting screen with a cancel button. */
export function showWaiting(text: string, onCancel: () => void) {
  const m = screen();
  const box = el("div", "mm-panel small");
  box.innerHTML = `<h2>${L("Multijogador", "Multiplayer")}</h2><div class="mp-wait">${esc(text)}</div>`;
  box.appendChild(button(L("Cancelar", "Cancel"), onCancel));
  m.appendChild(box);
}

const CHANNEL_NAME: Record<SoundChannel, [string, string]> = {
  music: ["Música", "Music"],
  combat: ["Efeitos sonoros", "Sound Effects"],
  ambience: ["Ambiente", "Ambience"],
  steps: ["Passos", "Footsteps"],
  ui: ["Interface e itens", "Interface and Items"],
  cinematic: ["Cinemáticas e história", "Cutscenes and Story"],
};
/** A sound of the channel, played when its slider is let go (music and ambience are heard already). */
const CHANNEL_PREVIEW: Partial<Record<SoundChannel, () => void>> = {
  combat: () => sfx.hit(true),
  steps: () => sfx.step(false),
  ui: () => sfx.coin(),
  cinematic: () => cine.play("bell"),
};

/** Options in three sections: sound (general volume and one per channel), graphics and game. */
export function showOptions(onBack: () => void) {
  const m = screen();
  const box = el("div", "mm-panel");
  box.innerHTML = `<h2>${L("Opções", "Options")}</h2>`;
  const form = el("div", "options");
  const pct = (v: number) => Math.round(v * 100);
  const slider = (key: string, name: string, v: number) => `<label>${name}
    <span class="vol"><input type="range" min="0" max="100" value="${pct(v)}" data-k="${key}"><output>${pct(v)}%</output></span></label>`;
  const check = (key: string, on: boolean, name: string) => `<label><input type="checkbox" ${on ? "checked" : ""} data-k="${key}"> ${name}</label>`;
  form.innerHTML = `
    <h3>${L("Som", "Sound")}</h3>
    ${slider("volume", L("Volume geral", "Master Volume"), settings.volume)}
    ${SOUND_CHANNELS.map((c) => slider(c, L(...CHANNEL_NAME[c]), settings.channels[c])).join("")}
    ${check("mute", isMuted(), L("Silenciar tudo", "Mute All"))}
    <h3>${L("Gráficos", "Graphics")}</h3>
    ${check("lighting", settings.lighting, L("Iluminação e sombras dinâmicas", "Dynamic Lights and Shadows"))}
    ${check("shake", settings.shake, L("Tremor de tela", "Screen Shake"))}
    <label>${L("Zoom da câmera", "Camera Zoom")} <select data-k="zoom">
      ${["auto", 2, 3, 4].map((z) => `<option value="${z}" ${settings.zoom === z ? "selected" : ""}>${z === "auto" ? L("Automático", "Automatic") : `${z}x`}</option>`).join("")}
    </select></label>
    <h3>${L("Jogo", "Game")}</h3>
    ${check("damageNumbers", settings.damageNumbers, L("Números de dano", "Damage Numbers"))}
    <label>Idioma / Language <select data-k="lang">
      <option value="en" ${lang === "en" ? "selected" : ""}>English</option>
      <option value="pt" ${lang === "pt" ? "selected" : ""}>Português</option>
    </select></label>`;
  form.oninput = form.onchange = (ev) => {
    const t = ev.target as HTMLInputElement;
    const k = t.dataset.k!;
    if (t.type === "range") {
      const v = Number(t.value) / 100;
      if (k === "volume") settings.volume = v;
      else settings.channels[k as SoundChannel] = v;
      (t.nextElementSibling as HTMLOutputElement).value = `${t.value}%`;
      if (ev.type === "change") CHANNEL_PREVIEW[k as SoundChannel]?.();
      saveSettings();
      return;
    }
    switch (k) {
      case "mute": if (t.checked !== isMuted()) toggleMute(); break;
      case "shake": settings.shake = t.checked; break;
      case "lighting": settings.lighting = t.checked; break;
      case "damageNumbers": settings.damageNumbers = t.checked; break;
      case "zoom": settings.zoom = t.value === "auto" ? "auto" : (Number(t.value) as 2 | 3 | 4); break;
      case "lang": saveSettings(); setLang(t.value as Lang); return; // reloads the game (progress is saved)
    }
    saveSettings();
  };
  box.appendChild(form);
  box.appendChild(button(L("Voltar", "Back"), onBack));
  m.appendChild(box);
}

export function showControls(onBack: () => void) {
  const m = screen();
  const box = el("div", "mm-panel");
  const rows: [string, string][] = [
    [L("Clique esquerdo", "Left Click"), L("Mover · atacar · falar · pegar itens · entrar em casas e portais", "Move · attack · talk · pick up items · enter houses and portals")],
    [L("Shift + clique", "Shift + Click"), L("Atacar parado", "Attack in place")], [L("Clique direito", "Right Click"), L("Habilidade secundária", "Secondary skill")],
    ["Q · E · R", L("Habilidades da árvore", "Skill tree abilities")], [L("Espaço", "Space"), L("Esquiva (invulnerável por um instante)", "Dodge (briefly invulnerable)")],
    ["WASD", L("Mover", "Move")], ["1 · 2", L("Poção de vida · recurso", "Health potion · resource potion")], ["I · C · K", L("Inventário · personagem · habilidades", "Inventory · character · skills")],
    ["M", L("Ampliar o minimapa", "Enlarge minimap")], ["Esc", L("Fechar janelas · menu de pausa", "Close windows · pause menu")],
  ];
  box.innerHTML = `<h2>${L("Controles", "Controls")}</h2><div class="controls">${rows.map(([k, v]) => `<div><kbd>${k}</kbd><span>${v}</span></div>`).join("")}</div>`;
  box.appendChild(button(L("Voltar", "Back"), onBack));
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
      <div class="tm-logo"><h1><small>Chronicles of</small><span>Minhau</span></h1><div class="tm-sub">${L("Menu do jogo (Esc)", "Game Menu (Esc)")}</div></div>
      <div class="tm-buttons mm-buttons"></div>
    </div></aside>
    <div class="tm-info right">
      <div class="tm-slot">${L("Configuração atual", "Current Setup")}</div>
      <div class="tm-name">${esc(CLASSES[opts.cls].name)}</div>
      <div class="tm-lvl">${L("Nível", "Level")} ${opts.level} · ${L("Espaço", "Slot")} ${opts.slot + 1}</div>
      <div class="tm-line">${esc(opts.zone)}</div>
      <div class="tm-line">${esc(opts.quest)}</div>
      <div class="tm-line">${opts.online ? L("Partida em grupo (online)", "Party game (online)") : L("Partida particular", "Private game")}</div>
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
    button(L("Opções", "Options"), () => showOptions(back)),
    button(L("Controles", "Controls"), () => showControls(back)),
  );
  if (opts.onInvite) list.appendChild(button(L("Convidar amigo", "Invite Friend"), () => { close(); opts.onInvite!(); }));
  list.append(button(L("Salvar e sair", "Save and Quit"), () => { close(); opts.onQuit(); }, "mbtn danger"));
  m.querySelector(".tm-return")!.appendChild(button(L("Voltar ao jogo", "Return to Game"), () => { close(); opts.onResume(); }, "mbtn primary"));
}

export const closeMenus = () => root().querySelector(".mm")?.remove();

let reopen: (() => void) | null = null;
/** Boot registers how to show the main menu, so the game can return to it. */
export const registerMainMenu = (fn: () => void) => (reopen = fn);
export const openMainMenu = () => reopen?.();
