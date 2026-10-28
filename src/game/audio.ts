// Tiny WebAudio synth for game feedback: no audio files needed.
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
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export const isMuted = () => muted;
export function toggleMute() {
  muted = !muted;
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

export const sfx = {
  levelUp() {
    // Rising arpeggio + shimmering chord.
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.07, 0.25, "square", 0.12));
    [1047, 1319, 1568].forEach((f) => tone(f, 0.38, 0.9, "triangle", 0.1));
    tone(130, 0.0, 0.6, "sawtooth", 0.08, 260);
    noise(0.35, 0.5, 0.08, 4000);
  },
  drop(rarity: string) {
    const tiers: Record<string, number[]> = {
      rare: [880, 1175], epic: [784, 988, 1319], legendary: [659, 880, 1109, 1480], unique: [523, 784, 1047, 1568],
    };
    (tiers[rarity] ?? []).forEach((f, i) => tone(f, i * 0.09, 0.45, "triangle", 0.14));
  },
  coin() {
    tone(1568, 0, 0.06, "square", 0.06);
    tone(2093, 0.05, 0.1, "square", 0.05);
  },
  hit(crit = false) {
    noise(0, crit ? 0.12 : 0.06, crit ? 0.18 : 0.08, crit ? 1800 : 900);
    if (crit) tone(220, 0, 0.12, "sawtooth", 0.08, 110);
  },
  hurt() {
    tone(180, 0, 0.12, "sawtooth", 0.1, 90);
  },
  portal() {
    tone(220, 0, 0.6, "sine", 0.12, 880);
    noise(0, 0.5, 0.06, 2500);
  },
  boss() {
    tone(70, 0, 1.2, "sawtooth", 0.18, 45);
    noise(0, 1.0, 0.15, 400);
  },
  quest() {
    [784, 988, 1175, 1568].forEach((f, i) => tone(f, i * 0.1, 0.3, "triangle", 0.12));
  },
  buy() {
    tone(1319, 0, 0.08, "square", 0.07);
    tone(1760, 0.07, 0.12, "square", 0.07);
  },
};
