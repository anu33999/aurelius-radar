"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { PIPELINE_STAGES, type BusinessDTO, type PipelineStage } from "@/lib/types";
import { Badge, InfoBox, SectionTitle } from "./ui";
import { NICHES } from "@/lib/niches";

const BusinessGeoMap = dynamic(() => import("./map/BusinessGeoMap"), {
  ssr: false,
  loading: () => <div className="flex h-[68vh] items-center justify-center rounded-xl border border-cream/10 text-sm text-cream/50">Loading map…</div>,
});

export function MapTab({ businesses, onOpen }: { businesses: BusinessDTO[]; onOpen: (id: string) => void }) {
  const [stages, setStages] = useState<PipelineStage[]>(PIPELINE_STAGES.map((s) => s.key));
  const [niche, setNiche] = useState("");
  const [country, setCountry] = useState("");
  const countries = useMemo(() => [...new Set(businesses.map((b) => b.country).filter(Boolean) as string[])].sort(), [businesses]);
  const shown = useMemo(() => businesses.filter((b) => stages.includes(b.pipelineStage) && (!niche || b.niche === niche) && (!country || b.country === country)), [businesses, stages, niche, country]);
  const located = shown.filter((b) => b.latitude != null && b.longitude != null).length;
  const missing = businesses.filter((b) => b.latitude == null || b.longitude == null).length;

  return (
    <div className="space-y-4">
      <SectionTitle sub="Prospects around the world, coloured by pipeline stage. Zoom into any market to see individual businesses.">Global Prospect Map</SectionTitle>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <Badge tone="emerald">● Paying client</Badge>
        <Badge tone="crimson">● Meeting booked / proposal</Badge>
        <Badge tone="amber">● Pitch sent</Badge>
        <Badge tone="slate">● Uncontacted</Badge>
        <span className="mx-1 text-cream/30">|</span>
        {PIPELINE_STAGES.map((s) => {
          const on = stages.includes(s.key);
          return (
            <button key={s.key} onClick={() => setStages(on ? stages.filter((x) => x !== s.key) : [...stages, s.key])} className={`rounded-full border px-2.5 py-1 ${on ? "border-gold/60 text-gold" : "border-cream/15 text-cream/40"}`}>
              {s.label}
            </button>
          );
        })}
        <select className="input !w-auto !py-1 text-xs" value={niche} onChange={(e) => setNiche(e.target.value)}>
          <option value="">All niches</option>
          {NICHES.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
        </select>
        <select className="input !w-auto !py-1 text-xs" value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="">All countries</option>
          {countries.map((c) => <option key={c}>{c}</option>)}
        </select>
        <span className="ml-auto text-cream/50">{located} on map</span>
      </div>
      {missing > 0 && <InfoBox>{missing} business(es) have no coordinates and are not shown. Imported OpenStreetMap listings include coordinates; manually added ones do not.</InfoBox>}
      <BusinessGeoMap businesses={shown} onOpen={onOpen} />
    </div>
  );
}
