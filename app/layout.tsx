import type { Metadata } from "next";
import "./globals.css";
import { DEFAULT_THEME, THEMES, THEME_STORAGE_KEY } from "@/lib/themes";

export const metadata: Metadata = {
  title: "Aurelius Radar | Kreatif Atelier",
  description: "International client intelligence and social intent radar for Kreatif Atelier / Aurelius",
};

// Applies the saved theme before first paint so there is no flash of the wrong colours.
const themeScript = `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var ok=${JSON.stringify(THEMES.map((x) => x.id))};document.documentElement.dataset.theme=ok.indexOf(t)>-1?t:${JSON.stringify(DEFAULT_THEME)}}catch(e){document.documentElement.dataset.theme=${JSON.stringify(DEFAULT_THEME)}}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme={DEFAULT_THEME} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
