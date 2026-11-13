/** Colour themes. The actual colour values live in app/globals.css ([data-theme="..."] blocks). */
export interface ThemeDef {
  id: string;
  label: string;
  mode: "dark" | "light";
  /** Preview swatch only: [page, card, accent]. */
  swatch: [string, string, string];
}

export const THEMES: ThemeDef[] = [
  { id: "sunset", label: "Electric Sunset", mode: "dark", swatch: ["#1A0B3A", "#2C125C", "#FF8A65"] },
  { id: "cyber", label: "Cyber Neon", mode: "dark", swatch: ["#050A24", "#0A1440", "#00E5FF"] },
  { id: "citrus", label: "Citrus & Mint", mode: "light", swatch: ["#ECF7FF", "#FFFFFF", "#D94608"] },
  { id: "studio", label: "Modern Studio", mode: "dark", swatch: ["#142478", "#1F36A0", "#FFAA6E"] },
  { id: "maroon", label: "Maroon Velvet", mode: "dark", swatch: ["#1C080E", "#2C0E16", "#E996A5"] },
  { id: "blush", label: "Blush & Maroon", mode: "light", swatch: ["#FDF5F6", "#FFFFFF", "#801830"] },
  { id: "midnight", label: "Midnight Blue", mode: "dark", swatch: ["#080E1C", "#0E182E", "#60A5FA"] },
  { id: "sky", label: "Cloud & Azure", mode: "light", swatch: ["#F1F6FD", "#FFFFFF", "#1D4ED8"] },
];

export const DEFAULT_THEME = "sunset";
export const THEME_STORAGE_KEY = "aurelius-theme";
