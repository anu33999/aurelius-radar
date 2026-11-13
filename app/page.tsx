"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { BusinessDTO } from "@/lib/types";
import { AuditTab } from "@/components/AuditTab";
import { RadarTab } from "@/components/RadarTab";
import { DirectoryTab } from "@/components/DirectoryTab";
import { CrmTab } from "@/components/CrmTab";
import { ShortlistTab } from "@/components/ShortlistTab";
import { OutreachTab } from "@/components/OutreachTab";
import { MapTab } from "@/components/MapTab";
import { ErrorBox } from "@/components/ui";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";

const TABS = [
  { key: "audit", label: "Single Prospect Audit" },
  { key: "radar", label: "Social Intent Radar" },
  { key: "directory", label: "International Directory" },
  { key: "outreach", label: "Outreach" },
  { key: "crm", label: "Client CRM & Pipeline" },
  { key: "map", label: "Global Map" },
  { key: "shortlist", label: "Shortlist" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function Home() {
  const [tab, setTab] = useState<TabKey>("audit");
  const [businesses, setBusinesses] = useState<BusinessDTO[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [crmOpenId, setCrmOpenId] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<{ name: string; website: string | null; id: string } | null>(null);

  const reload = useCallback(async () => {
    try {
      // Loaded in pages of 1,000 so a large directory never exceeds the platform's response size limit.
      const all: BusinessDTO[] = [];
      for (let offset = 0; ; offset += 1000) {
        const res = await api<{ businesses: BusinessDTO[]; hasMore: boolean }>(`/api/businesses?offset=${offset}&limit=1000`);
        all.push(...res.businesses);
        if (!res.hasMore) break;
      }
      setBusinesses(all);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load businesses");
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Optimistic update so in-place edits feel instant; reload on failure.
  const patch = useCallback(
    async (id: string, p: Partial<BusinessDTO>) => {
      setBusinesses((prev) => prev.map((b) => (b.id === id ? { ...b, ...p } : b)));
      try {
        await api("/api/businesses", { method: "PATCH", body: JSON.stringify({ id, ...p }) });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
        reload();
      }
    },
    [reload],
  );

  function startAudit(b: BusinessDTO) {
    setPrefill({ name: b.name, website: b.website, id: b.id });
    setTab("audit");
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-[900] border-b border-gold/20 bg-obsidian/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3">
          <div>
            <div className="h-serif text-xl tracking-wide text-gold">AURELIUS RADAR</div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-cream/45">Kreatif Atelier · International client intelligence</div>
          </div>
          <nav className="flex flex-wrap gap-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`rounded-lg px-3.5 py-2 text-sm transition ${tab === t.key ? "bg-gold text-onaccent" : "text-cream/70 hover:text-gold"}`}
              >
                {t.label}
                {t.key === "shortlist" && businesses.some((b) => b.shortlisted) && <span className="ml-1.5 rounded-full bg-cream/15 px-1.5 text-[11px]">{businesses.filter((b) => b.shortlisted).length}</span>}
              </button>
            ))}
          </nav>
          <ThemeSwitcher />
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-5 py-6">
        {error && (
          <div className="mb-4">
            <ErrorBox>{error}</ErrorBox>
          </div>
        )}
        {/* Audit, Radar and Directory stay mounted (just hidden) so a running audit, scan or import keeps going and keeps its results while you look at other tabs. */}
        <div className={tab === "audit" ? "" : "hidden"}><AuditTab businesses={businesses} prefill={prefill} onSaved={reload} /></div>
        <div className={tab === "radar" ? "" : "hidden"}><RadarTab /></div>
        <div className={tab === "directory" ? "" : "hidden"}>
          <DirectoryTab
            businesses={businesses}
            reload={reload}
            onUpdated={(b) => setBusinesses((prev) => prev.map((x) => (x.id === b.id ? b : x)))}
            onAudit={startAudit}
            onToggleStar={(b) => patch(b.id, { shortlisted: !b.shortlisted })}
            onPlan={(b) => {
              setCrmOpenId(b.id);
              setTab("crm");
            }}
          />
        </div>
        {tab === "outreach" && <OutreachTab />}
        {tab === "crm" && <CrmTab key={crmOpenId ?? "crm"} businesses={businesses} patch={patch} onAudit={startAudit} reload={reload} initialOpenId={crmOpenId} />}
        {tab === "shortlist" && (
          <ShortlistTab
            businesses={businesses}
            patch={patch}
            onAudit={startAudit}
            onPlan={(b) => {
              setCrmOpenId(b.id);
              setTab("crm");
            }}
          />
        )}
        {tab === "map" && (
          <MapTab
            businesses={businesses}
            onOpen={(id) => {
              setCrmOpenId(id);
              setTab("crm");
            }}
          />
        )}
      </main>
    </div>
  );
}
