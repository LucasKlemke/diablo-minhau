// Game language: English by default, Portuguese as an option. Texts are written side by side with
// `L(pt, en)`, so data tables can be translated where they are defined. The language is read once at
// startup; switching it saves and reloads the page so every table is rebuilt in the new language.

export type Lang = "en" | "pt";

const KEY = "diablo-minhau:lang";

export const lang: Lang = (() => {
  try {
    return localStorage.getItem(KEY) === "pt" ? "pt" : "en";
  } catch {
    return "en";
  }
})();

/** The text in the current language. */
export const L = (pt: string, en: string) => (lang === "pt" ? pt : en);

export function setLang(next: Lang) {
  if (next === lang) return;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* ignore */
  }
  location.reload();
}

/** Locale for numbers and dates. */
export const locale = () => (lang === "pt" ? "pt-BR" : "en-US");
