/** Presentation only: never serialize these values into molecular/project state. */
export type Theme = "light" | "dark";
export const WORKSPACE_STORAGE_KEY = "molweave-workspace-v1";

export const BRAND_COLORS = {
  graphite: "#171A1F", steel: "#2B3038", ash: "#F4F1EB", ember: "#C94F2D",
  spark: "#FFB35C", tempered: "#6C8490", mist: "#DCE3E6",
} as const;

const light = {
  bg: BRAND_COLORS.ash,
  surface: "#FFFFFF",
  "surface-muted": "#EAE6DF",
  "surface-hover": "#E0DDD6",
  text: BRAND_COLORS.graphite,
  "text-soft": "#555B63",
  "text-faint": "#555B63",
  border: "#D1CBC2",
  "border-strong": "#817B72",
  brand: "#A33C20",
  "brand-strong": "#833018",
  accent: BRAND_COLORS.ember,
  "accent-strong": "#833018",
  "accent-soft": "#F8E6DB",
  action: BRAND_COLORS.ember,
  "action-hover": "#A33C20",
  "on-action": "#FFFFFF",
  focus: "#A33C20",
  dirty: "#A33C20",
  success: "#226540",
  "success-soft": "#E5F1E9",
  info: "#285C7C",
  "info-soft": "#E4EFF5",
  warning: "#795306",
  "warning-soft": "#FFF1CE",
  "warning-border": "#967315",
  danger: "#AC3038",
  "danger-soft": "#FBE6E7",
  "on-danger": "#FFFFFF",
  overlay: "rgb(23 26 31 / 56%)",
  shadow: "0 12px 38px rgb(23 26 31 / 16%)",
  "shadow-small": "0 5px 18px rgb(23 26 31 / 10%)",
  "shadow-inset": "0 1px 3px rgb(23 26 31 / 14%)",
  "viewer-background": BRAND_COLORS.ash,
};

export const THEME_TOKENS: Record<Theme, Record<keyof typeof light, string>> = {
  light,
  dark: {
    bg: BRAND_COLORS.graphite,
    surface: "#22262D",
    "surface-muted": BRAND_COLORS.steel,
    "surface-hover": "#383E47",
    text: BRAND_COLORS.ash,
    "text-soft": "#BAC4CB",
    "text-faint": "#BAC4CB",
    border: "#444B55",
    "border-strong": "#7D8793",
    brand: BRAND_COLORS.spark,
    "brand-strong": "#FFD09A",
    accent: BRAND_COLORS.spark,
    "accent-strong": "#FFD09A",
    "accent-soft": "#493127",
    action: BRAND_COLORS.spark,
    "action-hover": "#FFD09A",
    "on-action": BRAND_COLORS.graphite,
    focus: BRAND_COLORS.spark,
    dirty: BRAND_COLORS.spark,
    success: "#9DD6B3",
    "success-soft": "#243D31",
    info: "#A9CCE3",
    "info-soft": "#253947",
    warning: "#F0D086",
    "warning-soft": "#3E3422",
    "warning-border": "#B89B56",
    danger: "#FFABB0",
    "danger-soft": "#492A31",
    "on-danger": BRAND_COLORS.graphite,
    overlay: "rgb(10 12 15 / 68%)",
    shadow: "0 14px 42px rgb(0 0 0 / 38%)",
    "shadow-small": "0 5px 18px rgb(0 0 0 / 24%)",
    "shadow-inset": "0 1px 3px rgb(0 0 0 / 24%)",
    "viewer-background": BRAND_COLORS.graphite,
  },
};

/** Vite injects this before first paint; the viewer consumes the same values. */
export function themeStyles(): string {
  const declarations = (tokens: Record<string, string>) =>
    Object.entries(tokens).map(([name, value]) => `--${name}:${value}`).join(";");
  const primitives = Object.fromEntries(Object.entries(BRAND_COLORS).map(([key, value]) => [`neistra-${key}`, value]));
  return `:root{${declarations(primitives)};${declarations(light)};color-scheme:light;background:var(--bg);color:var(--text)}:root[data-theme="dark"]{${declarations(THEME_TOKENS.dark)};color-scheme:dark}`;
}

export function themeInitializationScript(): string {
  return `(()=>{let theme="light";try{const saved=JSON.parse(localStorage.getItem(${JSON.stringify(WORKSPACE_STORAGE_KEY)})||"null");if(saved?.state?.theme==="dark")theme="dark"}catch{}document.documentElement.dataset.theme=theme;document.querySelector('meta[name="theme-color"]').content=theme==="dark"?${JSON.stringify(THEME_TOKENS.dark.bg)}:${JSON.stringify(THEME_TOKENS.light.bg)}})();`;
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_TOKENS[theme].bg);
}
