// Player options, kept in localStorage.
export interface Settings {
  volume: number; // 0..1
  shake: boolean;
  damageNumbers: boolean;
  zoom: "auto" | 2 | 3 | 4;
}

const KEY = "diablo-minhau:settings";
const DEFAULTS: Settings = { volume: 0.7, shake: true, damageNumbers: true, zoom: "auto" };

export const settings: Settings = (() => {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { ...DEFAULTS };
  }
})();

const listeners: (() => void)[] = [];
export const onSettingsChange = (fn: () => void) => listeners.push(fn);

export function saveSettings() {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
  for (const fn of listeners) fn();
}
