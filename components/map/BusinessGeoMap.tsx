"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { HUBS } from "@/lib/hubs";
import { placeOf } from "@/lib/client";
import { telHref, waLink } from "@/lib/outreach";
import { FLAG_LABEL, type ProspectFlag } from "@/lib/leads/score";
import { PIPELINE_STAGES, type BusinessDTO, type PipelineStage } from "@/lib/types";

/** Emerald = paying client, Pink/Crimson = meeting booked or proposal out (hot), Amber = pitched, Slate = uncontacted (or lost). Values come from the active theme. */
const STAGE_TOKEN: Record<PipelineStage, string> = {
  LEAD: "slate",
  PITCH_SENT: "amber",
  MEETING_BOOKED: "crimson",
  PROPOSAL_SHARED: "crimson",
  CLOSED_WON: "emerald",
  CLOSED_LOST: "slate",
};

/** Resolve a theme colour token (e.g. "gold") to an rgb() string usable in SVG attributes and inline HTML. */
function themeColor(token: string, fallback = "128,128,128"): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--c-${token}`).trim();
  const parts = raw.split(/\s+/).filter(Boolean);
  return `rgb(${parts.length === 3 ? parts.join(",") : fallback})`;
}

const stageLabel = (k: string) => PIPELINE_STAGES.find((s) => s.key === k)?.label ?? k;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

export default function BusinessGeoMap({
  businesses,
  onOpen,
}: {
  businesses: BusinessDTO[];
  onOpen: (id: string) => void;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const fitKey = useRef("");
  const ringsRef = useRef<L.LayerGroup | null>(null);
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  // Bumps whenever the user switches theme so map colours are redrawn.
  const [themeTick, setThemeTick] = useState(0);

  useEffect(() => {
    const obs = new MutationObserver(() => setThemeTick((n) => n + 1));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, { zoomControl: true }).setView([30, 10], 2);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    // Market rings and labels (labels shown at city zoom only).
    const hubLabels = L.layerGroup();
    for (const h of HUBS) {
      // Labels only from city zoom, so the world view is not covered in text.
      L.marker([h.lat, h.lng], {
        interactive: false,
        icon: L.divIcon({ className: "", html: "", iconSize: [0, 0] }),
      })
        .bindTooltip(h.name, { permanent: true, direction: "center", className: "hub-label" })
        .addTo(hubLabels);
    }

    const syncLabels = () => {
      if (map.getZoom() >= 6) hubLabels.addTo(map);
      else map.removeLayer(hubLabels);
    };
    map.on("zoomend", syncLabels);
    syncLabels();

    ringsRef.current = L.layerGroup().addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 50);
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const rings = ringsRef.current;
    if (!rings) return;
    rings.clearLayers();
    const accent = themeColor("gold");
    for (const h of HUBS) {
      L.circle([h.lat, h.lng], { radius: h.radiusM, color: accent, weight: 1, opacity: 0.45, fillColor: accent, fillOpacity: 0.04, interactive: false }).addTo(rings);
    }
  }, [themeTick]);

  useEffect(() => {
    const layer = layerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;
    layer.clearLayers();
    const accent = themeColor("gold");
    const outline = themeColor("obsidian");
    const pts: L.LatLngExpression[] = [];
    for (const b of businesses) {
      if (b.latitude == null || b.longitude == null) continue;
      const color = themeColor(STAGE_TOKEN[b.pipelineStage]);
      const m = L.circleMarker([b.latitude, b.longitude], {
        radius: 7,
        color: outline,
        weight: 1.5,
        fillColor: color,
        fillOpacity: b.pipelineStage === "CLOSED_LOST" ? 0.45 : 0.95,
      });
      const popup = document.createElement("div");
      popup.innerHTML = `<div style="font-weight:600;margin-bottom:2px">${esc(b.name)}</div>
        <div style="opacity:.7">${esc(b.industry ?? "Business")} · ${esc(placeOf(b))}</div>
        <div style="margin-top:4px"><span style="color:${color}">●</span> ${esc(stageLabel(b.pipelineStage))}</div>
        ${b.googleRating != null ? `<div style="margin-top:2px">${b.googleRating.toFixed(1)} ★${b.reviewCount != null ? ` (${b.reviewCount})` : ""}</div>` : ""}
        ${b.flags.length ? `<div style="margin-top:4px;opacity:.85">${b.flags.filter((f) => f !== "NO_PHONE").map((f) => esc(FLAG_LABEL[f as ProspectFlag] ?? f)).join(" · ")}</div>` : ""}
        ${b.phone ? `<div style="margin-top:4px"><a href="${esc(telHref(b.phone, b.country) ?? "#")}">${esc(b.phone)}</a></div>` : ""}
        ${b.website ? `<div style="margin-top:2px"><a target="_blank" rel="noreferrer" href="${esc(/^https?:/i.test(b.website) ? b.website : `https://${b.website}`)}">Website ↗</a></div>` : ""}
        ${waLink(b.whatsapp, `Hi, is this ${b.name}?`, b.country) ? `<a target="_blank" rel="noreferrer" href="${esc(waLink(b.whatsapp, `Hi, is this ${b.name}?`, b.country) ?? "#")}" style="display:inline-block;margin-top:6px;margin-right:6px;background:${accent};color:${outline};border-radius:6px;padding:3px 9px;font-size:11px;font-weight:600;text-decoration:none">Send WhatsApp pitch</a>` : ""}
        <button style="margin-top:6px;border:1px solid ${accent};color:${accent};border-radius:6px;padding:2px 8px;font-size:11px;background:transparent;cursor:pointer">Open offer & CRM</button>`;
      popup.querySelector("button")?.addEventListener("click", () => onOpenRef.current(b.id));
      m.bindPopup(popup);
      m.addTo(layer);
      pts.push([b.latitude, b.longitude]);
    }
    // Only re-fit the view when the businesses change, not when the theme does.
    const key = businesses.map((b) => b.id).join(",");
    if (pts.length > 0 && fitKey.current !== key) {
      fitKey.current = key;
      map.fitBounds(L.latLngBounds(pts as L.LatLngTuple[]).pad(0.15), { maxZoom: 12 });
    }
  }, [businesses, themeTick]);

  return <div ref={elRef} className="h-[68vh] w-full overflow-hidden rounded-xl border border-cream/10" />;
}
