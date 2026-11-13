"use client";

/** Plain download links: the server builds the file, the browser saves it. */
export function ExportButtons({ scope, params = {} }: { scope: "directory" | "crm" | "shortlist" | "catalogue"; params?: Record<string, string | undefined> }) {
  const qs = (format: string) => {
    const sp = new URLSearchParams({ scope, format });
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    return `/api/export?${sp.toString()}`;
  };
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-cream/50">{scope === "catalogue" ? "Download catalogue" : "Download this list"}</span>
      <a className="btn-ghost !py-1 text-xs" href={qs("xlsx")} download>Excel</a>
      <a className="btn-ghost !py-1 text-xs" href={qs("pdf")} download>PDF</a>
    </div>
  );
}
