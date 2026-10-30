// Game sound effects: ElevenLabs samples from public/assets/sfx (scripts/gen-sfx.mjs),
// with a tiny WebAudio synth as fallback while a sample is missing or still loading.
import { onSettingsChange, settings } from "./settings";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = (() => {
  try {
    return localStorage.getItem("diablo-minhau:mute") === "1";
  } catch {
    return false;
  }
})();

function ac() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.5 * settings.volume;
    onSettingsChange(() => master && (master.gain.value = 0.5 * settings.volume));
    master.connect(ctx.destination);
    loadSamples(ctx);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

const SAMPLE_NAMES = [
  "hit_01", "hit_02", "hit_03", "hit_crit", "hurt_01", "hurt_02", "hurt_03", "coin_01", "coin_02", "buy",
  "drop_rare", "drop_epic", "drop_legendary", "drop_unique", "levelUp", "quest", "portal", "boss",
  ...[1, 2, 3, 4].flatMap((i) => [`step_grass_0${i}`, `step_stone_0${i}`]),
  "swing_01", "swing_02", "swing_03", "bow_shot", "cast", "potion", "chest_open",
  "die_goblin", "die_skeleton", "die_spider", "die_troll", "die_lich", "die_bandit",
  ...["wolf", "boar", "wasp", "slime", "worg_rider", "ent", "mimic", "kobold", "zombie", "ghoul", "lizardman", "cultist", "leech",
    "wisp", "ghost", "gargoyle", "orc", "hobgoblin", "armor", "bat", "ant", "beetle", "centipede", "manticore", "dragon"].map((m) => `die_${m}`),
  ...["howl", "wisp_burst", "mimic", "trap", "wake_tree", "wake_stone", "burrow", "split", "poison", "stun", "fire_breath", "acid",
    "spikes", "growl"].map((m) => `mon_${m}`),
  ...["cleave", "warcry", "leap", "berserk", "quake", "arrow", "multishot", "explosive", "rain", "piercing",
    "firebolt", "frostnova", "chain", "shield", "meteor", "shadowbolt", "drain", "plague", "corpse", "bloodpact"].map((s) => `skill_${s}`),
  "dash", "ui_click", "ui_open", "ui_close", "equip", "amb_town", "amb_dungeon",
  ...["drums", "fire", "night", "laugh_01", "laugh_02", "laugh_03", "cheer", "grumm", "bell", "ambush", "title",
    // Act I prologue
    "bark", "pee", "thunder", "gate_break", "roar", "choke", "glass", "chains", "blaze", "hearth", "heartbeat",
    "gore", "rend", "column_fall", "fire_whoosh", "scream"].map((s) => `cine_${s}`),
];
const STEPS = (surface: string) => [1, 2, 3, 4].map((i) => `step_${surface}_0${i}`);
const DEATH: Record<string, string> = { bandit_brute: "die_bandit" };
const samples: Record<string, AudioBuffer> = {};

function loadSamples(a: AudioContext) {
  for (const name of SAMPLE_NAMES) {
    fetch(`${import.meta.env.BASE_URL}assets/sfx/${name}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
      .then((b) => a.decodeAudioData(b))
      .then((buf) => {
        samples[name] = buf;
        if (name === wantAmbience) playAmbience();
      })
      .catch(() => {});
  }
}

/** Plays one of the named samples at random; false when none is loaded yet (caller falls back to the synth). */
function sample(names: string[], vol = 1) {
  if (muted) return true;
  const a = ac();
  const loaded = names.filter((n) => samples[n]);
  if (!loaded.length) return false;
  const src = a.createBufferSource();
  src.buffer = samples[loaded[Math.floor(Math.random() * loaded.length)]];
  src.playbackRate.value = 0.95 + Math.random() * 0.1;
  const g = a.createGain();
  g.gain.value = vol;
  src.connect(g).connect(master!);
  src.start();
  return true;
}

// Looping background ambience; switches with the zone and follows the mute toggle.
let wantAmbience: string | null = null;
let ambience: { name: string; src: AudioBufferSourceNode } | null = null;

function playAmbience() {
  if (ambience?.name === wantAmbience && !muted) return;
  ambience?.src.stop();
  ambience = null;
  if (muted || !wantAmbience || !samples[wantAmbience]) return;
  const a = ac();
  const src = a.createBufferSource();
  src.buffer = samples[wantAmbience];
  src.loop = true;
  const g = a.createGain();
  g.gain.value = 0.35;
  src.connect(g).connect(master!);
  src.start();
  ambience = { name: wantAmbience, src };
}

export function setAmbience(name: "amb_town" | "amb_dungeon" | null) {
  wantAmbience = name;
  playAmbience();
}

// Background music (public/assets/music, scripts/gen-music.mjs): one track at a time, cross-faded on change.
// A track with several files plays them in turn.
export type Track = "menu" | "town" | "dungeon" | "boss" | "court" | "attack" | "aldo" | "village_ruin" | "forest";
const TRACK_FILES: Record<Track, string[]> = {
  menu: ["menu"],
  town: ["town_01", "town_02"],
  dungeon: ["dungeon"],
  boss: ["boss"],
  // Act I: the prologue (court lute, Jimmynelson's attack, Aldo's hut), the besieged village and the woods.
  court: ["court"],
  attack: ["attack"],
  aldo: ["aldo"],
  village_ruin: ["village_ruin"],
  forest: ["forest"],
};
const MUSIC_VOL = 0.35;
const tracks: Partial<Record<Track, HTMLAudioElement>> = {};
let wantMusic: Track | null = null;

function musicVolume() {
  return muted ? 0 : MUSIC_VOL * settings.volume;
}

function fade(el: HTMLAudioElement, to: number, ms = 1200) {
  const from = el.volume, t0 = performance.now();
  if (to > 0 && el.paused) void el.play().catch(() => {});
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    el.volume = from + (to - from) * k;
    if (k < 1 && (el.dataset.target === String(to))) requestAnimationFrame(step);
    else if (to === 0 && k >= 1) el.pause();
  };
  el.dataset.target = String(to);
  requestAnimationFrame(step);
}

export function setMusic(name: Track | null) {
  if (name === wantMusic) return;
  wantMusic = name;
  for (const [n, el] of Object.entries(tracks)) if (n !== name && !el.paused) fade(el, 0);
  if (!name) return;
  let el = tracks[name];
  if (!el) {
    const files = TRACK_FILES[name].map((f) => `${import.meta.env.BASE_URL}assets/music/${f}.mp3`);
    let i = 0;
    const audio = (el = tracks[name] = new Audio(files[0]));
    audio.loop = files.length === 1;
    audio.volume = 0;
    audio.addEventListener("ended", () => {
      audio.src = files[(i = (i + 1) % files.length)];
      void audio.play().catch(() => {});
    });
  }
  // The boss theme restarts each fight; town and dungeon resume where they left off.
  if (name === "boss") el.currentTime = 0;
  fade(el, musicVolume());
}

// Browsers block audio until the first click or key: start the wanted track then.
const unlock = () => {
  const el = wantMusic && tracks[wantMusic];
  if (el?.paused && !muted) void el.play().catch(() => {});
};
window.addEventListener("pointerdown", unlock, { once: true });
window.addEventListener("keydown", unlock, { once: true });

onSettingsChange(() => {
  const el = wantMusic && tracks[wantMusic];
  if (el) el.volume = musicVolume();
});

export const isMuted = () => muted;
export function toggleMute() {
  muted = !muted;
  playAmbience();
  const el = wantMusic && tracks[wantMusic];
  if (el) fade(el, musicVolume(), 300);
  try {
    localStorage.setItem("diablo-minhau:mute", muted ? "1" : "0");
  } catch {
    /* ignore */
  }
  return muted;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = "square", vol = 0.2, slideTo?: number) {
  if (muted) return;
  const a = ac();
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, a.currentTime + start);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, a.currentTime + start + dur);
  g.gain.setValueAtTime(0, a.currentTime + start);
  g.gain.linearRampToValueAtTime(vol, a.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + start + dur);
  o.connect(g).connect(master!);
  o.start(a.currentTime + start);
  o.stop(a.currentTime + start + dur + 0.05);
}

function noise(start: number, dur: number, vol = 0.2, lowpass = 800) {
  if (muted) return;
  const a = ac();
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = lowpass;
  const g = a.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master!);
  src.start(a.currentTime + start);
}

/** Opening cutscene sounds (cine_* samples): one-shots and fading loops. */
export const cine = {
  /** One of the samples cine_<name> (or cine_<name>_01..03 at random). */
  play(name: string, vol = 1) {
    sample([`cine_${name}`, ...[1, 2, 3].map((i) => `cine_${name}_0${i}`)], vol);
  },
  /** Starts a looping sample; the returned function fades it out. */
  loop(name: string, vol = 1, fadeIn = 0.8) {
    if (muted || !samples[`cine_${name}`]) return (_fade = 0) => {};
    const a = ac();
    const src = a.createBufferSource();
    src.buffer = samples[`cine_${name}`];
    src.loop = true;
    const g = a.createGain();
    g.gain.setValueAtTime(0, a.currentTime);
    g.gain.linearRampToValueAtTime(vol, a.currentTime + fadeIn);
    src.connect(g).connect(master!);
    src.start();
    let stopped = false;
    return (fade = 0.8) => {
      if (stopped) return;
      stopped = true;
      g.gain.cancelScheduledValues(a.currentTime);
      g.gain.setValueAtTime(g.gain.value, a.currentTime);
      g.gain.linearRampToValueAtTime(0, a.currentTime + fade);
      src.stop(a.currentTime + fade + 0.05);
    };
  },
};

export const sfx = {
  levelUp() {
    if (sample(["levelUp"])) return;
    // Rising arpeggio + shimmering chord.
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.07, 0.25, "square", 0.12));
    [1047, 1319, 1568].forEach((f) => tone(f, 0.38, 0.9, "triangle", 0.1));
    tone(130, 0.0, 0.6, "sawtooth", 0.08, 260);
    noise(0.35, 0.5, 0.08, 4000);
  },
  drop(rarity: string) {
    if (["rare", "epic", "legendary", "unique"].includes(rarity) && sample([`drop_${rarity}`])) return;
    const tiers: Record<string, number[]> = {
      rare: [880, 1175], epic: [784, 988, 1319], legendary: [659, 880, 1109, 1480], unique: [523, 784, 1047, 1568],
    };
    (tiers[rarity] ?? []).forEach((f, i) => tone(f, i * 0.09, 0.45, "triangle", 0.14));
  },
  coin() {
    if (sample(["coin_01", "coin_02"], 0.7)) return;
    tone(1568, 0, 0.06, "square", 0.06);
    tone(2093, 0.05, 0.1, "square", 0.05);
  },
  hit(crit = false) {
    if (sample(crit ? ["hit_crit"] : ["hit_01", "hit_02", "hit_03"], crit ? 0.9 : 0.6)) return;
    noise(0, crit ? 0.12 : 0.06, crit ? 0.18 : 0.08, crit ? 1800 : 900);
    if (crit) tone(220, 0, 0.12, "sawtooth", 0.08, 110);
  },
  hurt() {
    if (sample(["hurt_01", "hurt_02", "hurt_03"], 0.7)) return;
    tone(180, 0, 0.12, "sawtooth", 0.1, 90);
  },
  portal() {
    if (sample(["portal"])) return;
    tone(220, 0, 0.6, "sine", 0.12, 880);
    noise(0, 0.5, 0.06, 2500);
  },
  boss() {
    if (sample(["boss"])) return;
    tone(70, 0, 1.2, "sawtooth", 0.18, 45);
    noise(0, 1.0, 0.15, 400);
  },
  quest() {
    if (sample(["quest"])) return;
    [784, 988, 1175, 1568].forEach((f, i) => tone(f, i * 0.1, 0.3, "triangle", 0.12));
  },
  buy() {
    if (sample(["buy"], 0.8)) return;
    tone(1319, 0, 0.08, "square", 0.07);
    tone(1760, 0.07, 0.12, "square", 0.07);
  },
  // Sample-only sounds: silent until their file loads.
  step(stone: boolean) {
    sample(STEPS(stone ? "stone" : "grass"), 0.25);
  },
  swing() {
    sample(["swing_01", "swing_02", "swing_03"], 0.5);
  },
  bow() {
    sample(["bow_shot"], 0.6);
  },
  cast() {
    sample(["cast"], 0.5);
  },
  potion() {
    sample(["potion"], 0.7);
  },
  chest() {
    sample(["chest_open"], 0.8);
  },
  /** A skill's own sound, or the generic swing/bow/cast one until it loads. */
  skill(id: string, generic: "swing" | "bow" | "cast") {
    if (!sample([`skill_${id}`], 0.6)) sfx[generic]();
  },
  dash() {
    sample(["dash"], 0.5);
  },
  click() {
    if (!sample(["ui_click"], 0.6)) sfx.coin();
  },
  panel(open: boolean) {
    sample([open ? "ui_open" : "ui_close"], 0.5);
  },
  equip() {
    sample(["equip"], 0.6);
  },
  die(sprite: string) {
    sample([DEATH[sprite] ?? `die_${sprite}`], 0.7);
  },
  /** Monster mechanics (mon_* samples): howl, ambush, trap, poison... */
  monster(name: string, vol = 0.7) {
    sample([`mon_${name}`], vol);
  },
};
