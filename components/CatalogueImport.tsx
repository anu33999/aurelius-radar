"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/client";
import { ExportButtons } from "./ExportButtons";

/** Imports the real service catalogue (JSON, CSV or the architecture HTML) into the Service table. */
export function CatalogueImport() {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  async function onFile(file: File) {
    setBusy(true);
    setMsg(null);
    try {
      const text = await file.text();
      const res = await api<{ imported: number; practiceAreas: number }>("/api/catalogue", {
        method: "POST",
        body: JSON.stringify({ text, filename: file.name }),
      });
      setMsg(`Imported ${res.imported} services across ${res.practiceAreas} practice areas. Re-run the audit to use them.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  }

  return (
    <span className="flex flex-wrap items-center gap-3">
      <input ref={ref} type="file" accept=".json,.csv,.html,.htm" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      <button className="btn-ghost !py-1 text-xs" disabled={busy} onClick={() => ref.current?.click()}>
        {busy ? "Importing…" : "Import service catalogue (JSON / CSV / HTML)"}
      </button>
      <ExportButtons scope="catalogue" />
      {msg && <span className="text-xs text-gold">{msg}</span>}
    </span>
  );
}
