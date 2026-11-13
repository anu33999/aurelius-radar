import type { Config } from "tailwindcss";

// Colours are CSS variables (see app/globals.css) so the whole UI can switch theme at runtime.
const v = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        obsidian: v("obsidian"), // page background / input background
        matte: v("matte"), // cards
        matte2: v("matte2"),
        cream: v("cream"), // main text (and subtle borders at low opacity)
        gold: v("gold"), // accent
        goldDim: v("golddim"),
        onaccent: v("onaccent"), // text on top of the accent colour
        emerald: v("emerald"),
        amber: v("amber"),
        slate: v("slate"),
        crimson: v("crimson"),
        errtext: v("errtext"),
        warntext: v("warntext"),
      },
      fontFamily: {
        serif: ["Georgia", "Cambria", "Times New Roman", "serif"],
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
