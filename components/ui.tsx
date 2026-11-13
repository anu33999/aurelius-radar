"use client";

import { useState } from "react";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn-ghost !px-2.5 !py-1 text-xs"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      }}
    >
      {done ? "Copied ✓" : label}
    </button>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-gold">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
      {label}
    </span>
  );
}

const TONES: Record<string, string> = {
  gold: "border-gold/40 bg-gold/10 text-gold",
  emerald: "border-emerald/40 bg-emerald/10 text-emerald",
  amber: "border-amber/40 bg-amber/10 text-amber",
  slate: "border-slate/40 bg-slate/10 text-slate",
  crimson: "border-crimson/40 bg-crimson/10 text-crimson",
  cream: "border-cream/15 bg-cream/5 text-cream/80",
};

export function Badge({ tone = "cream", children }: { tone?: keyof typeof TONES; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export function SectionTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-3">
      <h3 className="h-serif text-lg text-cream">{children}</h3>
      {sub && <p className="mt-0.5 text-xs text-cream/55">{sub}</p>}
    </div>
  );
}

export function ErrorBox({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-crimson/40 bg-crimson/10 p-3 text-sm text-errtext">{children}</div>;
}

export function InfoBox({ children, tone = "gold" }: { children: React.ReactNode; tone?: "gold" | "amber" }) {
  const cls = tone === "gold" ? "border-gold/30 bg-gold/5 text-cream/85" : "border-amber/40 bg-amber/10 text-warntext";
  return <div className={`rounded-lg border p-3 text-sm ${cls}`}>{children}</div>;
}

export function CopyBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-cream/10 bg-obsidian">
      <div className="flex items-center justify-between border-b border-cream/10 px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wider text-gold">{title}</span>
        <CopyButton text={text} />
      </div>
      <pre className="whitespace-pre-wrap break-words p-3 font-sans text-[13px] leading-relaxed text-cream/90">{text}</pre>
    </div>
  );
}
