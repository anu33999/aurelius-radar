"use client";

import { CatalogueImport } from "./CatalogueImport";
import { useCallback, useEffect, useState } from "react";
import { api, fmtDate } from "@/lib/client";
import type { Platform, ServiceDef, SocialLeadDTO } from "@/lib/types";
import { StarButton } from "./StarButton";
import { Badge, CopyButton, ErrorBox, InfoBox, SectionTitle, Spinner } from "./ui";

interface Summary {
  queriesRun: number;
  rawHits: number;
  afterUrlFilter: number;
  afterRecency: number;
  classified: number;
  kept: number;
  created: number;
  duplicates: number;
  classifier: "AI" | "RULES";
  errors: string[];
}

const PLATFORMS: { key: Platform; label: string }[] = [
  { key: "REDDIT", label: "Reddit" },
  { key: "TWITTER", label: "X / Twitter" },
  { key: "LINKEDIN", label: "LinkedIn" },
];

export function RadarTab() {
  const [leads, setLeads] = useState<SocialLeadDTO[]>([]);
  const [services, setServices] = useState<ServiceDef[]>([]);
  const [config, setConfig] = useState<{ searchConfigured: boolean; searchProvider: string | null; aiEnabled: boolean } | null>(null);
  const [window_, setWindow] = useState<"day" | "week">("week");
  const [platforms, setPlatforms] = useState<Platform[]>(["REDDIT", "TWITTER", "LINKEDIN"]);
  const [fPlatform, setFPlatform] = useState("");
  const [fCategory, setFCategory] = useState("");
  const [fStatus, setFStatus] = useState("NEW");
  const [scanning, setScanning] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (fPlatform) qs.set("platform", fPlatform);
      if (fCategory) qs.set("category", fCategory);
      if (fStatus) qs.set("status", fStatus);
      const res = await api<{ leads: SocialLeadDTO[]; config: { searchConfigured: boolean; searchProvider: string | null; aiEnabled: boolean } }>(`/api/radar?${qs}`);
      setLeads(res.leads);
      setConfig(res.config);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load leads");
    }
  }, [fPlatform, fCategory, fStatus]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api<{ services: ServiceDef[] }>("/api/catalogue").then((r) => setServices(r.services)).catch(() => undefined);
  }, []);

  async function scan() {
    setScanning(true);
    setError(null);
    setSummary(null);
    try {
      const res = await api<{ summary: Summary }>("/api/radar", { method: "POST", body: JSON.stringify({ window: window_, platforms }) });
      setSummary(res.summary);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  async function star(id: string, shortlisted: boolean) {
    setLeads((ls) => ls.map((x) => (x.id === id ? { ...x, shortlisted } : x)));
    await api("/api/radar", { method: "PATCH", body: JSON.stringify({ id, shortlisted }) }).catch(load);
  }

  async function setStatus(id: string, status: string) {
    await api("/api/radar", { method: "PATCH", body: JSON.stringify({ id, status }) });
    load();
  }

  const name = (code: string) => services.find((s) => s.code === code)?.name ?? code;

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <SectionTitle sub="Searches public Reddit, X and LinkedIn posts for people asking for agencies, developers, SEO or growth help, then filters out freelancers and job hunters.">
          Social Intent Radar
        </SectionTitle>
        <div className="mb-3"><CatalogueImport /></div>

        {config && !config.searchConfigured && (
          <div className="mb-3">
            <InfoBox tone="amber">
              No search provider is configured, so live scans are disabled. Add <code>TINYFISH_API_KEY</code>, <code>TAVILY_API_KEY</code> or <code>BRAVE_API_KEY</code> to <code>.env</code> and restart.
            </InfoBox>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="label">Recency window</label>
            <select className="input !w-auto" value={window_} onChange={(e) => setWindow(e.target.value as "day" | "week")}>
              <option value="day">Past 24 hours</option>
              <option value="week">Past 7 days</option>
            </select>
          </div>
          <div>
            <label className="label">Platforms</label>
            <div className="flex gap-2">
              {PLATFORMS.map((p) => {
                const on = platforms.includes(p.key);
                return (
                  <button
                    key={p.key}
                    onClick={() => setPlatforms(on ? platforms.filter((x) => x !== p.key) : [...platforms, p.key])}
                    className={`rounded-lg border px-3 py-2 text-sm ${on ? "border-gold bg-gold/15 text-gold" : "border-cream/15 text-cream/60"}`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
          <button className="btn-gold" disabled={scanning || platforms.length === 0 || (config ? !config.searchConfigured : false)} onClick={scan}>
            {scanning ? "Scanning…" : "Scan now"}
          </button>
          <div className="flex gap-2 text-xs">
            <Badge tone={config?.searchConfigured ? "emerald" : "amber"}>Search: {config?.searchConfigured ? config.searchProvider : "not configured"}</Badge>
            <Badge tone={config?.aiEnabled ? "emerald" : "slate"}>Classifier: {config?.aiEnabled ? "AI" : "rule-based fallback"}</Badge>
          </div>
        </div>

        {scanning && (
          <div className="mt-3">
            <Spinner label="Running search queries and classifying posts (this can take a minute)…" />
          </div>
        )}
        {summary && (
          <div className="mt-4 rounded-lg border border-cream/10 bg-obsidian p-3 text-[13px] text-cream/80">
            <b className="text-gold">Last scan:</b> {summary.queriesRun} queries → {summary.rawHits} results → {summary.afterUrlFilter} real post URLs → {summary.afterRecency} within the window → {summary.kept} classified as buyers or advice-seekers ({summary.classifier === "AI" ? "AI" : "rules"}) → <b>{summary.created} new</b>, {summary.duplicates} already saved.
            {summary.errors.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-errtext">
                {summary.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        {error && (
          <div className="mt-3">
            <ErrorBox>{error}</ErrorBox>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <select className="input !w-auto" value={fPlatform} onChange={(e) => setFPlatform(e.target.value)}>
          <option value="">All platforms</option>
          {PLATFORMS.map((p) => (
            <option key={p.key} value={p.key}>{p.label}</option>
          ))}
        </select>
        <select className="input !w-auto" value={fCategory} onChange={(e) => setFCategory(e.target.value)}>
          <option value="">All intent</option>
          <option value="BUYER_HIRING">Buyer / hiring</option>
          <option value="ADVICE_SEEKING">Advice seeking</option>
        </select>
        <select className="input !w-auto" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="">Any status</option>
          <option value="NEW">New</option>
          <option value="CONTACTED">Contacted</option>
          <option value="ARCHIVED">Archived</option>
        </select>
        <span className="self-center text-sm text-cream/50">{leads.length} lead(s)</span>
      </div>

      {leads.length === 0 ? (
        <InfoBox>No leads yet. Run a scan, or adjust the filters.</InfoBox>
      ) : (
        <div className="space-y-4">
          {leads.map((l) => (
            <LeadCard key={l.id} lead={l} serviceName={name} onStatus={(s) => setStatus(l.id, s)} onStar={(v) => star(l.id, v)} onChanged={load} />
          ))}
        </div>
      )}
    </div>
  );
}

function LeadCard({
  lead,
  serviceName,
  onStatus,
  onStar,
  onChanged,
}: {
  lead: SocialLeadDTO;
  serviceName: (code: string) => string;
  onStatus: (s: string) => void;
  onStar: (v: boolean) => void;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<"comment" | "dm">("comment");
  const [busy, setBusy] = useState(false);
  const plat = PLATFORMS.find((p) => p.key === lead.platform)?.label ?? lead.platform;
  const draft = lead.pitchDraft;

  async function regenerate() {
    setBusy(true);
    try {
      await api("/api/radar", { method: "PATCH", body: JSON.stringify({ id: lead.id, regenerate: true }) });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="gold">{plat}</Badge>
        <Badge tone={lead.intentCategory === "BUYER_HIRING" ? "emerald" : "amber"}>
          {lead.intentCategory === "BUYER_HIRING" ? "Buyer · hiring" : "Advice seeking"}
        </Badge>
        {lead.confidence !== null && <Badge tone="cream">{lead.confidence}% · {lead.classifiedBy === "AI" ? "AI" : "rules"}</Badge>}
        <span className="text-xs text-cream/50">{lead.authorHandle ?? "author unknown"} · {fmtDate(lead.postedAt)}</span>
        <div className="ml-auto flex gap-2">
          <StarButton on={lead.shortlisted} onToggle={() => onStar(!lead.shortlisted)} label="Select" />
          <a className="btn-ghost !py-1 text-xs" href={lead.sourceUrl} target="_blank" rel="noreferrer">Open post ↗</a>
          {lead.status !== "CONTACTED" && <button className="btn-ghost !py-1 text-xs" onClick={() => onStatus("CONTACTED")}>Mark contacted</button>}
          {lead.status !== "ARCHIVED" && <button className="btn-ghost !py-1 text-xs" onClick={() => onStatus("ARCHIVED")}>Archive</button>}
          {lead.status !== "NEW" && <button className="btn-ghost !py-1 text-xs" onClick={() => onStatus("NEW")}>Restore</button>}
        </div>
      </div>

      {lead.postTitle && <h4 className="mt-2 text-sm font-medium text-cream">{lead.postTitle}</h4>}
      <p className="mt-1 line-clamp-4 text-[13px] text-cream/70">{lead.postContent}</p>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-cream/10 bg-obsidian p-3 text-[13px]">
          <div className="text-[11px] uppercase tracking-wider text-gold/80">Identified pain point</div>
          <p className="mt-1 text-cream/85">{lead.painPoint ?? "Not extracted"}</p>
        </div>
        <div className="rounded-lg border border-cream/10 bg-obsidian p-3 text-[13px]">
          <div className="text-[11px] uppercase tracking-wider text-gold/80">Matched Aurelius services</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {lead.matchedServices.length === 0 ? <span className="text-cream/50">None matched</span> : lead.matchedServices.map((c) => <Badge key={c} tone="cream">{c} · {serviceName(c)}</Badge>)}
          </div>
        </div>
      </div>

      {draft && (
        <div className="mt-3 rounded-lg border border-cream/10 bg-obsidian">
          <div className="flex items-center gap-2 border-b border-cream/10 px-3 py-2">
            <button onClick={() => setMode("comment")} className={`rounded px-2 py-1 text-xs ${mode === "comment" ? "bg-gold text-onaccent" : "text-cream/70"}`}>Option 1 · Public comment</button>
            <button onClick={() => setMode("dm")} className={`rounded px-2 py-1 text-xs ${mode === "dm" ? "bg-gold text-onaccent" : "text-cream/70"}`}>Option 2 · Casual DM</button>
            <span className="ml-auto text-[11px] text-cream/40">{draft.generatedBy === "AI" ? "AI draft" : "template draft"}</span>
            <button className="btn-ghost !px-2 !py-1 text-xs" disabled={busy} onClick={regenerate}>{busy ? "…" : "Regenerate"}</button>
            <CopyButton text={mode === "comment" ? draft.comment : draft.dm} label="Copy 1-click" />
          </div>
          <p className="whitespace-pre-wrap p-3 text-[13px] leading-relaxed text-cream/90">{mode === "comment" ? draft.comment : draft.dm}</p>
        </div>
      )}
      <p className="mt-2 text-[11px] text-cream/40">Drafts are for you to review and post manually. Nothing is ever sent or posted automatically.</p>
    </div>
  );
}
