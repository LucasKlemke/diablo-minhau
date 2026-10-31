// Player options, kept in localStorage.

/** Sound channels with a volume of their own (on top of the general volume). */
export type SoundChannel = "music" | "ambience" | "combat" | "steps" | "ui" | "cinematic";
export const SOUND_CHANNELS: SoundChannel[] = ["music", "combat", "ambience", "steps", "ui", "cinematic"];

export interface Settings {
  volume: number; // 0..1, general
  channels: Record<SoundChannel, number>; // 0..1 each
  shake: boolean;
  /** Dynamic lights and shadows (WebGL). */
  lighting: boolean;
  damageNumbers: boolean;
  zoom: "auto" | 2 | 3 | 4 | 5;
}

const KEY = "diablo-minhau:settings";
const DEFAULT_CHANNELS = Object.fromEntries(SOUND_CHANNELS.map((c) => [c, 1])) as Record<SoundChannel, number>;
const DEFAULTS: Settings = { volume: 0.7, channels: DEFAULT_CHANNELS, shake: true, lighting: true, damageNumbers: true, zoom: "auto" };

export const settings: Settings = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return { ...DEFAULTS, ...saved, channels: { ...DEFAULT_CHANNELS, ...saved.channels } };
  } catch {
    return { ...DEFAULTS, channels: { ...DEFAULT_CHANNELS } };
  }
})();

const listeners: (() => void)[] = [];
export const onSettingsChange = (fn: () => void) => listeners.push(fn);
export const offSettingsChange = (fn: () => void) => {
  const i = listeners.indexOf(fn);
  if (i >= 0) listeners.splice(i, 1);
};

export function saveSettings() {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
  for (const fn of listeners) fn();
}
