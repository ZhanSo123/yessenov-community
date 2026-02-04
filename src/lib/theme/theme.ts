export type ThemeMode = "light" | "dark";

const storageKey = "theme";

const isBrowser = () => typeof window !== "undefined";

export const getStoredTheme = (): ThemeMode | null => {
  if (!isBrowser()) {
    return null;
  }
  const stored = window.localStorage.getItem(storageKey);
  if (stored === "light" || stored === "dark") {
    return stored;
  }
  return null;
};

export const setStoredTheme = (theme: ThemeMode) => {
  if (!isBrowser()) {
    return;
  }
  window.localStorage.setItem(storageKey, theme);
};

export const applyTheme = (theme: ThemeMode) => {
  if (!isBrowser()) {
    return;
  }
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
};
