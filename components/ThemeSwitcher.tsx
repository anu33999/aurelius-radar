"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_THEME, THEMES, THEME_STORAGE_KEY } from "@/lib/themes";

export function ThemeSwitcher() {
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cur = document.documentElement.dataset.theme;
    if (cur && THEMES.some((t) => t.id === cur)) setTheme(cur);
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  function choose(id: string) {
    setTheme(id);
    document.documentElement.dataset.theme = id;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, id);
    } catch {
      /* storage unavailable: theme still applies for this visit */
    }
    setOpen(false);
  }

  const current = THEMES.find((t) => t.id === theme) ?? THEMES[0];

  return (
    <div ref={ref} className="relative ml-auto">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="btn-ghost !py-1.5 text-xs" title={`Colour theme: ${current.label}`}
      >
        <Swatch colors={current.swatch} />
        Theme
      </button>
      {open && (
        <ul role="listbox" aria-label="Colour theme" className="absolute right-0 top-full z-[1000] mt-2 w-64 rounded-xl border border-cream/15 bg-matte p-1.5 shadow-2xl">
          {THEMES.map((t) => (
            <li key={t.id}>
              <button
                role="option"
                aria-selected={t.id === theme}
                onClick={() => choose(t.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition ${t.id === theme ? "bg-gold/15 text-gold" : "text-cream/80 hover:bg-cream/5"}`}
              >
                <Swatch colors={t.swatch} />
                <span className="flex-1">{t.label}</span>
                <span className="text-[10px] uppercase tracking-wider text-cream/45">{t.mode}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Swatch({ colors }: { colors: [string, string, string] }) {
  return (
    <span className="inline-flex overflow-hidden rounded-full border border-cream/25" aria-hidden>
      {colors.map((c, i) => (
        <span key={i} className="h-4 w-3" style={{ background: c }} />
      ))}
    </span>
  );
}
