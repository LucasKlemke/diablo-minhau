import { CLASSES, type ClassId } from "../data/classes";
import { L } from "../i18n";

// Cutscene overlay shared by the cutscenes (game/cutscene.ts): letterbox bars, typewriter narration or a
// character's line with their name (optional voice files in assets/vo/intro_<key>.mp3) and a title card. Holding Space, Enter
// or the mouse button speeds the scene up; skipping it outright is only allowed in dev builds.

/** How much faster the cutscene runs while the player holds the button. */
export const FAST = 3;

export class CinematicUi {
  private wrap = document.createElement("div");
  private text: HTMLDivElement;
  private lineEl: HTMLDivElement;
  private speakerEl: HTMLDivElement;
  private titleEl: HTMLDivElement;
  private typing?: number;
  private voice?: HTMLAudioElement;
  private speed = 1;
  private listeners: [string, EventListener][] = [];

  /** `onSpeed` gets 1 or FAST as the player holds/releases. */
  constructor(onSkip: () => void, opts: { instantBars?: boolean; onSpeed?: (factor: number) => void } = {}) {
    const dev = import.meta.env.DEV;
    this.wrap.className = `intro interactive${opts.instantBars ? " instant" : ""}`;
    this.wrap.innerHTML = `<div class="lb top"></div><div class="lb bottom"></div><div class="intro-text"><div class="intro-speaker"></div><div class="intro-line"></div></div>
      <div class="intro-title"></div><div class="intro-skip"><span class="ff">▸▸</span> ${L("Segure <kbd>Espaço</kbd> para acelerar", "Hold <kbd>Space</kbd> to speed up")}${dev ? ` · <button>${L("Pular (Esc)", "Skip (Esc)")}</button>` : ""}</div>`;
    document.getElementById("ui")!.appendChild(this.wrap);
    this.text = this.wrap.querySelector(".intro-text")!;
    this.lineEl = this.wrap.querySelector(".intro-line")!;
    this.speakerEl = this.wrap.querySelector(".intro-speaker")!;
    this.titleEl = this.wrap.querySelector(".intro-title")!;
    const hint = this.wrap.querySelector(".intro-skip") as HTMLElement;
    const skipBtn = hint.querySelector("button");
    if (skipBtn) skipBtn.onclick = (e) => { e.stopPropagation(); onSkip(); };
    const set = (fast: boolean) => {
      const f = fast ? FAST : 1;
      if (f === this.speed) return;
      this.speed = f;
      hint.classList.toggle("on", fast);
      if (this.voice) this.voice.playbackRate = Math.min(f, 2);
      opts.onSpeed?.(f);
    };
    const hold = (e: KeyboardEvent) => e.key === " " || e.key === "Enter";
    this.on("keydown", (e) => {
      const k = e as KeyboardEvent;
      if (hold(k)) { k.preventDefault(); set(true); } else if (k.key === "Escape" && dev) onSkip();
    });
    this.on("keyup", (e) => hold(e as KeyboardEvent) && set(false));
    this.on("pointerdown", (e) => e.target !== skipBtn && set(true));
    this.on("pointerup", () => set(false));
    this.on("blur", () => set(false));
  }

  private on(type: string, fn: EventListener) {
    window.addEventListener(type, fn);
    this.listeners.push([type, fn]);
  }

  /** Types a line (narration, or spoken by `speaker`); resolves after `hold` ms (or the time the line needs
   * to be read). `wait` is the game clock. */
  say(key: string, line: string, hold: number, wait: (ms: number) => Promise<void>, speaker?: string) {
    window.clearInterval(this.typing);
    this.lineEl.textContent = "";
    this.speakerEl.textContent = speaker ?? "";
    this.text.classList.toggle("spoken", !!speaker);
    this.text.classList.add("on");
    let i = 0;
    this.typing = window.setInterval(() => {
      i += this.speed;
      this.lineEl.textContent = line.slice(0, i);
      if (i >= line.length) window.clearInterval(this.typing);
    }, 32);
    this.voice?.pause();
    this.voice = new Audio(`${import.meta.env.BASE_URL}assets/vo/intro_${key}.mp3`);
    this.voice.playbackRate = Math.min(this.speed, 2);
    this.voice.play().catch(() => undefined); // the narrator is optional
    return wait(Math.max(hold, line.length * 32 + 900));
  }

  hideText() {
    this.text.classList.remove("on");
  }

  title(cls: ClassId) {
    this.titleEl.innerHTML = `<div class="it-name">Chronicles of Minhau</div><div class="it-cls">${CLASSES[cls].name}</div>`;
    this.titleEl.classList.add("on");
  }

  /** Opens the bars (outro) and removes the overlay. */
  close(animated = true) {
    window.clearInterval(this.typing);
    for (const [type, fn] of this.listeners) window.removeEventListener(type, fn);
    this.listeners = [];
    this.voice?.pause();
    if (!animated) return this.wrap.remove();
    this.wrap.classList.add("closing");
    window.setTimeout(() => this.wrap.remove(), 900);
  }
}
