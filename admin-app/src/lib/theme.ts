export const THEME_KEY = "admin-theme";
export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];

function valid(value: string | null): value is Theme {
  return THEMES.includes(value as Theme);
}

export function readTheme(): Theme {
  return valid(localStorage.getItem(THEME_KEY)) ? localStorage.getItem(THEME_KEY) as Theme : "system";
}

function systemMedia(): MediaQueryList {
  if (typeof window.matchMedia === "function") return window.matchMedia("(prefers-color-scheme: dark)");
  return { matches: false, addEventListener() {}, removeEventListener() {} } as unknown as MediaQueryList;
}

function prefersDark(media?: MediaQueryList) {
  return (media ?? systemMedia()).matches;
}

export function applyTheme(theme: Theme, persist = true, media?: MediaQueryList): void {
  const resolved = theme === "system" ? (prefersDark(media) ? "dark" : "light") : theme;
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.dataset.theme = resolved;
  if (persist) localStorage.setItem(THEME_KEY, theme);
}

export function createThemeController(media = systemMedia()) {
  let current: Theme = readTheme();
  const onChange = () => { if (current === "system") applyTheme(current, false, media); };
  const subscribe = () => {
    if (current === "system") media.addEventListener("change", onChange);
  };
  const unsubscribe = () => media.removeEventListener("change", onChange);
  applyTheme(current, false, media);
  subscribe();
  return {
    get theme() { return current; },
    set(theme: Theme) {
      unsubscribe();
      current = theme;
      applyTheme(theme);
      subscribe();
    },
    destroy() { unsubscribe(); },
  };
}
