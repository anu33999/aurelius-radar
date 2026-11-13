"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { api, placeOf } from "@/lib/client";
import { NICHES, NICHE_GROUPS } from "@/lib/niches";
import WorldClock from "@/components/WorldClock";
import { FLAG_LABEL, type ProspectFlag } from "@/lib/leads/score";
import { gmailLink, telHref, waLink } from "@/lib/outreach";
import { COUNTRIES, HUBS, HUB_NAMES, REGIONS } from "@/lib/hubs";
import { PIPELINE_STAGES, type BusinessDTO } from "@/lib/types";
import { StarButton } from "./StarButton";
import { recommendServices } from "@/lib/leads/plan";
import { snapshotWithAudit } from "@/lib/leads/snapshot";
import type { AuditResult, ServiceDef } from "@/lib/types";
import { quoteFor } from "@/lib/leads/quote";
import { CatalogueImport } from "./CatalogueImport";
import { ExportButtons } from "./ExportButtons";
import { EmailCampaign } from "./EmailCampaign";
import { Badge, ErrorBox, InfoBox, SectionTitle, Spinner } from "./ui";

const stageLabel = (k: string) => PIPELINE_STAGES.find((s) => s.key === k)?.label ?? k;

export function DirectoryTab({
  businesses,
  reload,
  onAudit,
  onPlan,
  onToggleStar,
  onUpdated,
}: {
  businesses: BusinessDTO[];
  reload: () => void;
  onUpdated: (b: BusinessDTO) => void;
  onAudit: (b: BusinessDTO) => void;
  onPlan: (b: BusinessDTO) => void;
  onToggleStar: (b: BusinessDTO) => void;
}) {
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [industry, setIndustry] = useState("");
  const [hub, setHub] = useState(HUB_NAMES[0]);
  const [customCity, setCustomCity] = useState("");
  const [niche, setNiche] = useState("");
  const [webMode, setWebMode] = useState<"any" | "with" | "without" | "bare">("any");
  const [radiusKm, setRadiusKm] = useState("25");
  const [fNiche, setFNiche] = useState("");
  const [fFlag, setFFlag] = useState("");
  const [fContact, setFContact] = useState<"" | "phone" | "whatsapp" | "nophone">("");
  const [fEmail, setFEmail] = useState<"" | "email" | "noemail" | "gmail" | "notemailed" | "emailed" | "replied">("");
  // Tick boxes: chosen businesses for bulk email.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [campaign, setCampaign] = useState(false);
  const toggleSel = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  // Auto-email: queue every filtered business with an email; each is researched, written and sent
  // with no review step. Runs while this page is open, and once a day on the server otherwise.
  const [queue, setQueue] = useState<{ queued: number; configured: boolean; sentToday: number; dailyLimit: number; replies?: number; paused?: string | null } | null>(null);
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoMsg, setAutoMsg] = useState<string | null>(null);
  const stopAuto = useRef(false);
  useEffect(() => {
    api<{ queued: number; configured: boolean; sentToday: number; dailyLimit: number; replies?: number; paused?: string | null }>("/api/email/queue").then(setQueue).catch(() => undefined);
  }, []);
  async function runQueue() {
    setAutoRunning(true);
    stopAuto.current = false;
    const total = { sent: 0, failed: 0, skipped: 0 };
    try {
      for (;;) {
        setAutoMsg(`Researching and emailing… ${total.sent} sent${total.failed ? `, ${total.failed} failed` : ""} so far. Keep this tab open; it pauses if you close it and the server continues once a day.`);
        const r = await api<{ sent: number; failed: number; skipped: number; replies?: number; followUps?: number; queued: number; stopped: string | null }>("/api/email/run", { method: "POST" });
        total.sent += r.sent;
        total.failed += r.failed;
        total.skipped += r.skipped;
        setQueue((q) => (q ? { ...q, queued: r.queued, sentToday: q.sentToday + r.sent } : q));
        if (r.stopped || !r.queued || stopAuto.current || r.sent + r.failed + r.skipped === 0) {
          setAutoMsg(`${total.sent} personal emails sent${r.followUps ? `, ${r.followUps} follow-ups` : ""}${r.replies ? `, ${r.replies} new replies found` : ""}${total.failed ? `, ${total.failed} failed` : ""}. ${r.queued} still queued.${r.stopped ? ` ${r.stopped}` : ""}`);
          break;
        }
      }
    } catch (e) {
      setAutoMsg(e instanceof Error ? e.message : "Auto-email stopped");
    } finally {
      setAutoRunning(false);
      reload();
    }
  }
  async function autoEmailAll() {
    const targets = rows.filter((b) => b.email && b.emailStatus !== "SENT" && b.emailStatus !== "OPTED_OUT");
    const sentBefore = rows.filter((b) => b.emailStatus === "SENT").length;
    if (!targets.length) {
      window.alert(sentBefore ? `All ${sentBefore} businesses with an email in this list were already emailed. Nobody gets the same email twice.` : "Nobody in this list has an email address.");
      return;
    }
    if (!queue?.configured) {
      window.alert("Gmail sending isn't set up yet. Add GMAIL_USER and GMAIL_APP_PASSWORD in Vercel and redeploy first.");
      return;
    }
    const perDay = queue.dailyLimit;
    if (!window.confirm(`Automatically email all ${targets.length} businesses in this list that have an email?${sentBefore ? ` (${sentBefore} already emailed are skipped.)` : ""}\n\nEach one is researched (website audit + web search), gets its own personal email, and is sent with NO review step, from your Gmail.\n\nAt most ${perDay} a day, so this takes about ${Math.ceil(targets.length / perDay)} day(s). Nobody is emailed twice. You can stop or clear the queue at any time.`)) return;
    try {
      const r = await api<{ added: number; queued: number }>("/api/email/queue", { method: "POST", body: JSON.stringify({ ids: targets.map((b) => b.id) }) });
      setQueue((q) => (q ? { ...q, queued: r.queued } : q));
      runQueue();
    } catch (e) {
      setAutoMsg(e instanceof Error ? e.message : "Could not queue");
    }
  }
  async function resumeSending() {
    setAutoMsg("Sending a test email to yourself to check Gmail…");
    try {
      const r = await api<{ ok: boolean; message: string }>("/api/email/resume", { method: "POST" });
      setAutoMsg(r.message);
      if (r.ok) setQueue((q) => (q ? { ...q, paused: null } : q));
      api<{ queued: number; configured: boolean; sentToday: number; dailyLimit: number; replies?: number; paused?: string | null }>("/api/email/queue").then(setQueue).catch(() => undefined);
    } catch (e) {
      setAutoMsg(e instanceof Error ? e.message : "Could not check Gmail");
    }
  }
  async function clearQueue() {
    if (!window.confirm("Remove everyone from the auto-email queue? Nothing more will be sent automatically.")) return;
    stopAuto.current = true;
    await api("/api/email/queue", { method: "DELETE" }).catch(() => undefined);
    setQueue((q) => (q ? { ...q, queued: 0 } : q));
    setAutoMsg("Auto-email queue cleared.");
  }
  // Audits run right here, in the row, so the table keeps its place, filters and order.
  const [auditing, setAuditing] = useState<Set<string>>(new Set());
  async function auditHere(b: BusinessDTO) {
    if (!b.website) return onAudit(b);
    setAuditing((s) => new Set(s).add(b.id));
    try {
      const r = await api<{ audit: AuditResult; business: BusinessDTO | null }>("/api/audit", { method: "POST", body: JSON.stringify({ input: b.website, businessId: b.id }) });
      if (r.business) onUpdated(r.business);
      setAudits((a) => ({ ...a, [b.id]: r.audit }));
      setOpen(b.id);
    } catch (e) {
      setError(`Audit of ${b.name} failed: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setAuditing((s) => { const n = new Set(s); n.delete(b.id); return n; });
    }
  }
  const [open, setOpen] = useState<string | null>(null);
  const [catalogue, setCatalogue] = useState<ServiceDef[]>([]);
  const [perUSD, setPerUSD] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    api<{ perUSD: Record<string, number> }>("/api/rates").then((r) => setPerUSD(r.perUSD)).catch(() => undefined);
  }, []);
  const [audits, setAudits] = useState<Record<string, AuditResult | null>>({});
  useEffect(() => {
    api<{ services: ServiceDef[] }>("/api/catalogue").then((r) => setCatalogue(r.services)).catch(() => undefined);
  }, []);
  function toggle(b: BusinessDTO) {
    const next = open === b.id ? null : b.id;
    setOpen(next);
    if (next && b.lastAuditedAt && !(b.id in audits)) {
      api<{ audit: AuditResult | null }>(`/api/audit?businessId=${b.id}`).then((r) => setAudits((a) => ({ ...a, [b.id]: r.audit }))).catch(() => setAudits((a) => ({ ...a, [b.id]: null })));
    }
  }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  // Read websites for published phone / email / WhatsApp, one batch per request until none are left.
  const [enrichLeft, setEnrichLeft] = useState<number | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [enrichMsg, setEnrichMsg] = useState<string | null>(null);
  const stopEnrich = useRef(false);
  useEffect(() => {
    api<{ remaining: number }>("/api/enrich").then((r) => setEnrichLeft(r.remaining)).catch(() => undefined);
  }, [businesses.length]);
  // Google Places lookups for businesses with no phone. Billed per lookup by Google, so it asks first.
  const [gLeft, setGLeft] = useState<{ configured: boolean; remaining: number } | null>(null);
  const [gRunning, setGRunning] = useState(false);
  const [gMsg, setGMsg] = useState<string | null>(null);
  const stopG = useRef(false);
  useEffect(() => {
    api<{ configured: boolean; remaining: number }>("/api/enrich/places").then(setGLeft).catch(() => undefined);
  }, [businesses.length]);
  async function googleLookup() {
    if (!gLeft) return;
    if (!window.confirm(`Look up ${gLeft.remaining} businesses with no phone on Google?\n\nGoogle bills each lookup to your Google Cloud account (after its monthly free allowance). You can stop at any time.`)) return;
    setGRunning(true);
    stopG.current = false;
    const total = { lookups: 0, matched: 0, phones: 0 };
    try {
      for (;;) {
        const r = await api<{ lookups: number; matched: number; phones: number; remaining: number; error: string | null }>("/api/enrich/places", { method: "POST", body: JSON.stringify({ size: 50 }) });
        total.lookups += r.lookups;
        total.matched += r.matched;
        total.phones += r.phones;
        setGLeft((g) => (g ? { ...g, remaining: r.remaining } : g));
        setGMsg(`${total.lookups} Google lookups: ${total.matched} matched, ${total.phones} phone numbers added. ${r.remaining} left.${r.error ? ` Stopped: ${r.error}` : ""}`);
        if (r.error || r.remaining === 0 || r.lookups === 0 || stopG.current) break;
      }
    } catch (e) {
      setGMsg(e instanceof Error ? e.message : "Google lookup failed");
    } finally {
      setGRunning(false);
      reload();
    }
  }

  // Phones read from web search results (one search credit per business); saved as "web · verify".
  const [wLeft, setWLeft] = useState<{ configured: boolean; provider: string | null; remaining: number } | null>(null);
  const [wRunning, setWRunning] = useState(false);
  const [wMsg, setWMsg] = useState<string | null>(null);
  const stopW = useRef(false);
  useEffect(() => {
    api<{ configured: boolean; provider: string | null; remaining: number }>("/api/enrich/web").then(setWLeft).catch(() => undefined);
  }, [businesses.length]);
  async function webLookup() {
    if (!wLeft) return;
    const n = window.prompt(
      `Search the web for phone numbers of businesses with no phone?\n\n${wLeft.remaining} are waiting. Each one uses one ${wLeft.provider ?? "search"} credit. Numbers found this way are marked "web · verify". It runs at about 27 a minute (the search plan's limit), so 100 take about 4 minutes.\n\nHow many to do now?`,
      String(Math.min(100, wLeft.remaining)),
    );
    const limit = Math.min(Number(n) || 0, wLeft.remaining);
    if (limit <= 0) return;
    setWRunning(true);
    stopW.current = false;
    const total = { searched: 0, phones: 0 };
    try {
      while (total.searched < limit) {
        const r = await api<{ searched: number; phones: number; remaining: number; error: string | null }>("/api/enrich/web", { method: "POST", body: JSON.stringify({ size: Math.min(100, limit - total.searched) }) });
        total.searched += r.searched;
        total.phones += r.phones;
        setWLeft((w) => (w ? { ...w, remaining: r.remaining } : w));
        setWMsg(`${total.searched} businesses searched: ${total.phones} phone numbers found (marked "web · verify"). ${r.remaining} left.${r.error ? ` Stopped: ${r.error}` : ""}`);
        if (r.error || r.remaining === 0 || r.searched === 0 || stopW.current) break;
      }
    } catch (e) {
      setWMsg(e instanceof Error ? e.message : "Web search failed");
    } finally {
      setWRunning(false);
      reload();
    }
  }

  // Email finder: business websites first (free), then web search for those with no website (search credits).
  const [eLeft, setELeft] = useState<{ sites: number; web: number; searchConfigured: boolean } | null>(null);
  const [eRunning, setERunning] = useState<"site" | "web" | null>(null);
  const [eMsg, setEMsg] = useState<string | null>(null);
  const stopE = useRef(false);
  useEffect(() => {
    api<{ sites: number; web: number; searchConfigured: boolean }>("/api/enrich/email").then(setELeft).catch(() => undefined);
  }, [businesses.length]);
  async function findEmails(mode: "site" | "web") {
    if (mode === "web" && !window.confirm(`Search the web for emails of ${eLeft?.web ?? 0} businesses with no website?\n\nEach uses one search credit and it runs at about 27 a minute. You can stop at any time.`)) return;
    setERunning(mode);
    stopE.current = false;
    const total = { checked: 0, emails: 0 };
    try {
      for (;;) {
        const r = await api<{ checked: number; emails: number; remaining: number; error: string | null }>("/api/enrich/email", { method: "POST", body: JSON.stringify({ mode }) });
        total.checked += r.checked;
        total.emails += r.emails;
        setELeft((x) => (x ? { ...x, [mode === "site" ? "sites" : "web"]: r.remaining } : x));
        setEMsg(`${total.checked} ${mode === "site" ? "websites read" : "businesses searched"}: ${total.emails} emails found. ${r.remaining} left.${r.error ? ` Stopped: ${r.error}` : ""}`);
        if (r.error || r.remaining === 0 || r.checked === 0 || stopE.current) break;
      }
    } catch (e) {
      setEMsg(e instanceof Error ? e.message : "Email finder stopped");
    } finally {
      setERunning(null);
      reload();
    }
  }

  async function enrich() {
    setEnriching(true);
    stopEnrich.current = false;
    const total = { checked: 0, phones: 0, emails: 0, whatsapp: 0 };
    try {
      for (;;) {
        const r = await api<{ checked: number; phones: number; emails: number; whatsapp: number; remaining: number }>("/api/enrich", { method: "POST" });
        total.checked += r.checked;
        total.phones += r.phones;
        total.emails += r.emails;
        total.whatsapp += r.whatsapp;
        setEnrichLeft(r.remaining);
        setEnrichMsg(`Checked ${total.checked} websites: ${total.phones} phone numbers, ${total.emails} emails and ${total.whatsapp} WhatsApp numbers found. ${r.remaining} left.`);
        if (r.remaining === 0 || r.checked === 0 || stopEnrich.current) break;
      }
    } catch (e) {
      setEnrichMsg(e instanceof Error ? e.message : "Could not read the websites");
    } finally {
      setEnriching(false);
      reload();
    }
  }

  const industries = useMemo(() => [...new Set(businesses.map((b) => b.industry).filter(Boolean) as string[])].sort(), [businesses]);

  // Countries present in the data (presets plus anything imported via "any city").
  const countries = useMemo(() => [...new Set([...COUNTRIES, ...(businesses.map((b) => b.country).filter(Boolean) as string[])])].sort(), [businesses]);
  const regionOf = (c: string | null) => HUBS.find((h) => h.country === c)?.region ?? null;
  // Cities in the data, narrowed to the chosen country, with how many businesses each has.
  const cities = useMemo(() => {
    const n = new Map<string, number>();
    for (const b of businesses) if (!country || b.country === country) n.set(b.city, (n.get(b.city) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [businesses, country]);
  useEffect(() => {
    if (city && !cities.some(([c]) => c === city)) setCity("");
  }, [cities, city]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return businesses.filter((b) => {
      if (country && b.country !== country) return false;
      if (city && b.city !== city) return false;
      if (region && regionOf(b.country) !== region) return false;
      if (industry && b.industry !== industry) return false;
      if (fNiche && b.niche !== fNiche) return false;
      if (fFlag && !b.flags.includes(fFlag)) return false;
      if (fContact === "phone" && !b.phone) return false;
      if (fContact === "whatsapp" && !b.whatsapp) return false;
      if (fContact === "nophone" && (b.phone || b.whatsapp)) return false;
      if (fEmail === "email" && !b.email) return false;
      if (fEmail === "noemail" && b.email) return false;
      if (fEmail === "gmail" && !/@gmail\.com$/i.test(b.email ?? "")) return false;
      if (fEmail === "notemailed" && (!b.email || b.emailStatus === "SENT" || b.emailStatus === "OPTED_OUT")) return false;
      if (fEmail === "emailed" && b.emailStatus !== "SENT") return false;
      if (fEmail === "replied" && !b.repliedAt) return false;
      if (needle && !`${b.name} ${b.industry ?? ""} ${b.website ?? ""} ${b.city} ${b.country ?? ""}`.toLowerCase().includes(needle)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businesses, q, region, country, city, industry, fNiche, fFlag, fContact, fEmail]);

  // Drawing thousands of rows at once makes the tab sluggish: filters cover everything, the table shows a page at a time.
  const PAGE = 200;
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [q, region, country, city, industry, fNiche, fFlag, fContact, fEmail]);
  const shownRows = rows.slice(0, shown);
  const allShownSelected = shownRows.length > 0 && shownRows.every((b) => selected.has(b.id));
  const selectedList = useMemo(() => businesses.filter((b) => selected.has(b.id)), [businesses, selected]);

  async function discover(custom?: string) {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const res = await api<{ found: number; created: number; skipped: number; place: string; provider: string }>("/api/discover", {
        method: "POST",
        body: JSON.stringify({ ...(custom ? { city: custom } : { hub }), niche: niche || null, websiteMode: webMode, radiusKm: radiusKm ? Number(radiusKm) : null }),
      });
      setMsg(`${res.place}: ${res.found} real listings found via ${res.provider}, ${res.created} added, ${res.skipped} already in the directory.`);
      if (custom) setCustomCity("");
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Discovery failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <WorldClock />
      <div className="card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <CatalogueImport />
          <ExportButtons scope="directory" params={{ country, city, niche: fNiche }} />
        </div>
        <SectionTitle sub="Real businesses to pitch, by market and niche: North America, Europe, the Middle East, Asia-Pacific, India and beyond. Import live listings by market or any city, or add your own.">
          International Prospect Directory
        </SectionTitle>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">Market</label>
            <select className="input !w-auto" value={hub} onChange={(e) => setHub(e.target.value)}>
              {REGIONS.map((r) => (
                <optgroup key={r} label={r}>
                  {HUBS.filter((h) => h.region === r).map((h) => (
                    <option key={h.name} value={h.name}>{h.name}, {h.country}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Niche</label>
            <select className="input !w-auto" value={niche} onChange={(e) => setNiche(e.target.value)}>
              <option value="">Any commercial business</option>
              {NICHE_GROUPS.map((g) => (
                <optgroup key={g} label={g}>
                  {NICHES.filter((n) => n.group === g).map((n) => (
                    <option key={n.id} value={n.id}>{n.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Online presence</label>
            <select className="input !w-auto" value={webMode} onChange={(e) => setWebMode(e.target.value as typeof webMode)}>
              <option value="any">Everyone (with or without a website)</option>
              <option value="without">No website yet</option>
              <option value="bare">No website and no social links (new businesses)</option>
              <option value="with">Only with a website</option>
            </select>
          </div>
          <div>
            <label className="label">Radius</label>
            <select className="input !w-auto" value={radiusKm} onChange={(e) => setRadiusKm(e.target.value)}>
              <option value="">City centre only</option>
              <option value="10">10 km</option>
              <option value="25">25 km (city + suburbs)</option>
              <option value="50">50 km (whole metro area)</option>
            </select>
          </div>
          <button className="btn-gold" disabled={busy} onClick={() => discover()}>
            {busy ? "Importing…" : niche ? "Find prospects" : "Import market"}
          </button>
          <div className="flex items-end gap-2 md:ml-4">
            <div>
              <label className="label">Or any city</label>
              <input className="input !w-56" placeholder="e.g. Lisbon, Portugal" value={customCity} onChange={(e) => setCustomCity(e.target.value)} onKeyDown={(e) => e.key === "Enter" && customCity.trim() && !busy && discover(customCity)} />
            </div>
            <button className="btn-ghost" disabled={busy || !customCity.trim()} onClick={() => discover(customCity)}>Import city</button>
          </div>
          <button className="btn-ghost" onClick={() => setShowAdd((v) => !v)}>
            {showAdd ? "Close form" : "+ Add business"}
          </button>
          {enriching ? (
            <button className="btn-ghost" onClick={() => (stopEnrich.current = true)} title="Stops after the current batch">Stop finding contacts</button>
          ) : (
            <button className="btn-ghost" disabled={!enrichLeft} onClick={enrich} title="Reads each business's own website for the phone, email and WhatsApp it publishes">
              Find phones from websites{enrichLeft != null ? ` (${enrichLeft})` : ""}
            </button>
          )}
          {eRunning ? (
            <button className="btn-ghost" onClick={() => (stopE.current = true)}>Stop finding emails</button>
          ) : (
            <>
              <button className="btn-ghost" disabled={!eLeft?.sites} onClick={() => findEmails("site")} title="Reads each website's homepage, contact, about and imprint pages for an email (free)">
                Find emails on websites{eLeft ? ` (${eLeft.sites})` : ""}
              </button>
              {eLeft?.searchConfigured && (
                <button className="btn-ghost" disabled={!eLeft.web} onClick={() => findEmails("web")} title="Searches the web for an email for businesses with no website; one search credit each">
                  Find emails via web search ({eLeft.web})
                </button>
              )}
            </>
          )}
          {wLeft?.configured &&
            (wRunning ? (
              <button className="btn-ghost" onClick={() => (stopW.current = true)} title="Stops after the current batch">Stop web search</button>
            ) : (
              <button className="btn-ghost" disabled={!wLeft.remaining} onClick={webLookup} title="Searches the web for each business with no phone; uses one search credit each">
                Find phones via web search ({wLeft.remaining})
              </button>
            ))}
          {gLeft?.configured &&
            (gRunning ? (
              <button className="btn-ghost" onClick={() => (stopG.current = true)} title="Stops after the current batch">Stop Google lookups</button>
            ) : (
              <button className="btn-ghost" disabled={!gLeft.remaining} onClick={googleLookup} title="Looks each business with no phone up on Google Maps; billed per lookup by Google">
                Find phones on Google ({gLeft.remaining})
              </button>
            ))}
        </div>
        {busy && (
          <div className="mt-3">
            <Spinner label="Querying OpenStreetMap (this can take up to a minute for large cities)…" />
          </div>
        )}
        {msg && <p className="mt-3 text-sm text-gold">{msg}</p>}
        {enriching && (
          <div className="mt-3">
            <Spinner label="Reading websites for phone numbers, emails and WhatsApp (about 60 sites per minute)…" />
          </div>
        )}
        {enrichMsg && <p className="mt-3 text-sm text-gold">{enrichMsg}</p>}
        {gRunning && (
          <div className="mt-3">
            <Spinner label="Looking businesses up on Google Maps…" />
          </div>
        )}
        {gMsg && <p className="mt-3 text-sm text-gold">{gMsg}</p>}
        {wRunning && (
          <div className="mt-3">
            <Spinner label="Searching the web for phone numbers…" />
          </div>
        )}
        {wMsg && <p className="mt-3 text-sm text-gold">{wMsg}</p>}
        {eRunning && <div className="mt-3"><Spinner label={eRunning === "site" ? "Reading websites for email addresses…" : "Searching the web for email addresses…"} /></div>}
        {eMsg && <p className="mt-3 text-sm text-gold">{eMsg}</p>}
        {error && (
          <div className="mt-3">
            <ErrorBox>{error}</ErrorBox>
          </div>
        )}
        <p className="mt-3 text-xs text-cream/45">
          OpenStreetMap is community-maintained and its coverage varies by country: imported records only contain what OSM holds (often no phone or email) and should be verified before outreach. A niche search also finds businesses with no website, which are the highest-margin pitches. Add a Google Places key to include ratings and review counts.
        </p>
        {showAdd && <AddForm onDone={() => { setShowAdd(false); reload(); }} />}
      </div>

      <div className="flex flex-wrap gap-3">
        <input className="input !w-64" placeholder="Search name, industry, city, country…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input !w-auto" value={region} onChange={(e) => setRegion(e.target.value)}>
          <option value="">All regions</option>
          {REGIONS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <select className="input !w-auto" value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="">All countries</option>
          {countries.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select className="input !w-auto" value={city} onChange={(e) => setCity(e.target.value)}>
          <option value="">All cities</option>
          {cities.map(([c, n]) => (
            <option key={c} value={c}>{c} ({n})</option>
          ))}
        </select>
        <select className="input !w-auto" value={industry} onChange={(e) => setIndustry(e.target.value)}>
          <option value="">All industries</option>
          {industries.map((i) => (
            <option key={i}>{i}</option>
          ))}
        </select>
        <select className="input !w-auto" value={fNiche} onChange={(e) => setFNiche(e.target.value)}>
          <option value="">All niches</option>
          {NICHES.map((n) => (
            <option key={n.id} value={n.id}>{n.label}</option>
          ))}
        </select>
        <select className="input !w-auto" value={fFlag} onChange={(e) => setFFlag(e.target.value)}>
          <option value="">Any opportunity</option>
          {(Object.keys(FLAG_LABEL) as ProspectFlag[]).map((f) => (
            <option key={f} value={f}>{FLAG_LABEL[f]}</option>
          ))}
        </select>
        <select className="input !w-auto" value={fContact} onChange={(e) => setFContact(e.target.value as typeof fContact)}>
          <option value="">Any contact</option>
          <option value="phone">Has a phone number</option>
          <option value="whatsapp">On WhatsApp (confirmed)</option>
          <option value="nophone">No phone number</option>
        </select>
        <select className="input !w-auto" value={fEmail} onChange={(e) => setFEmail(e.target.value as typeof fEmail)}>
          <option value="">Any email</option>
          <option value="email">Email present</option>
          <option value="noemail">Email not present</option>
          <option value="gmail">Gmail address only</option>
          <option value="notemailed">Has email, not emailed yet</option>
          <option value="emailed">Already emailed</option>
          <option value="replied">Replied</option>
        </select>
        <span className="self-center text-sm text-cream/50">{rows.length} of {businesses.length}</span>
      </div>

      {(selected.size > 0 || rows.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button className="btn-ghost !py-1 text-xs" onClick={() => setSelected(new Set(rows.map((b) => b.id)))}>Tick all {rows.length} filtered</button>
          {selected.size > 0 && (
            <>
              <span className="text-cream/70">{selected.size} ticked ({selectedList.filter((b) => b.email).length} with email)</span>
              <button className="btn-gold !py-1 text-xs" disabled={!selectedList.some((b) => b.email)} onClick={() => setCampaign(true)}>Email ticked businesses</button>
              <button className="btn-ghost !py-1 text-xs" onClick={() => setSelected(new Set())}>Clear ticks</button>
            </>
          )}
        </div>
      )}
      <div className="card flex flex-wrap items-center gap-3 p-3 text-sm">
        <span className="font-medium text-gold">Auto-email</span>
        {autoRunning ? (
          <button className="btn-ghost !py-1 text-xs" onClick={() => (stopAuto.current = true)}>Pause</button>
        ) : (
          <button className="btn-gold !py-1 text-xs" disabled={!rows.some((b) => b.email && b.emailStatus !== "SENT" && b.emailStatus !== "OPTED_OUT")} onClick={autoEmailAll} title="Researches each business and sends it a personal email, no review step">
            Email everyone in this list ({rows.filter((b) => b.email && b.emailStatus !== "SENT" && b.emailStatus !== "OPTED_OUT").length} with email)
          </button>
        )}
        {queue && (
          <span className="text-cream/60">
            {queue.queued} queued · {queue.sentToday}/{queue.dailyLimit} sent today{queue.replies ? ` · ${queue.replies} replied` : ""}{!queue.configured && " · Gmail not set up"}
          </span>
        )}
        {queue?.paused ? (
          <>
            <p className="w-full rounded bg-amber/10 px-2 py-1.5 text-amber">⏸ {queue.paused}</p>
            <button className="btn-ghost !py-1 text-xs" onClick={resumeSending} title="Sends one test email to yourself; if Gmail accepts it, sending resumes">Check Gmail & resume</button>
          </>
        ) : (
          !autoRunning && !!queue?.queued && queue.configured && <button className="btn-ghost !py-1 text-xs" onClick={runQueue}>Resume sending</button>
        )}
        {!!queue?.queued && <button className="btn-ghost !py-1 text-xs" onClick={clearQueue}>Clear queue</button>}
        <span className="text-xs text-cream/40">Filter by country or city first, then press the button. Use “Email ticked businesses” instead to review emails before they go.</span>
        {autoRunning && <div className="w-full"><Spinner label={autoMsg ?? "Starting…"} /></div>}
        {!autoRunning && autoMsg && <p className="w-full text-gold">{autoMsg}</p>}
      </div>
      {campaign && <EmailCampaign businesses={selectedList} onClose={() => setCampaign(false)} onDone={reload} />}

      {businesses.length === 0 ? (
        <InfoBox>The directory is empty. Import a market or any city from OpenStreetMap, or add a business to start.</InfoBox>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b border-cream/10 text-[11px] uppercase tracking-wider text-gold/80">
              <tr>
                <th className="py-2.5 pl-3">
                  <input type="checkbox" aria-label="Tick all rows shown" checked={allShownSelected} onChange={() => setSelected((s) => { const n = new Set(s); for (const b of shownRows) { if (allShownSelected) n.delete(b.id); else n.add(b.id); } return n; })} />
                </th>
                <th className="px-2 py-2.5">#</th>
                <th className="px-3 py-2.5">Business</th>
                <th className="px-3 py-2.5">Industry</th>
                <th className="px-3 py-2.5">Location</th>
                <th className="px-3 py-2.5">Contact</th>
                <th className="px-3 py-2.5">Signals</th>
                <th className="px-3 py-2.5">Stage</th>
                <th className="px-3 py-2.5">Opp.</th>
                <th className="px-3 py-2.5">Suggested price</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {shownRows.map((b, i) => (
                <Fragment key={b.id}>
                <tr className={`border-b border-cream/5 hover:bg-cream/[0.04] ${selected.has(b.id) ? "bg-gold/[0.06]" : ""}`}>
                  <td className="py-2.5 pl-3"><input type="checkbox" aria-label={`Tick ${b.name}`} checked={selected.has(b.id)} onChange={() => toggleSel(b.id)} /></td>
                  <td className="px-2 py-2.5 text-xs text-cream/40">{i + 1}</td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium">{b.name}</div>
                    {b.website && (
                      <a className="text-xs text-gold hover:underline" href={/^https?:/i.test(b.website) ? b.website : `https://${b.website}`} target="_blank" rel="noreferrer">
                        {b.website.replace(/^https?:\/\//, "").slice(0, 38)}
                      </a>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-cream/75">{b.industry ?? "-"}</td>
                  <td className="px-3 py-2.5 text-cream/75">{placeOf(b)}</td>
                  <td className="px-3 py-2.5 text-cream/75">
                    <div className="flex flex-col gap-0.5">
                      {b.phone ? (
                        <span>
                          <a className="hover:text-gold" href={telHref(b.phone, b.country) ?? undefined}>{b.phone}</a>
                          {b.phoneSource === "WEB_SEARCH" && <span className="ml-1.5 rounded bg-amber/15 px-1 text-[10px] text-amber" title="Read from web search results. Confirm it before relying on it.">web · verify</span>}
                        </span>
                      ) : (
                        <span className="text-cream/35">no phone</span>
                      )}
                      {/* Only a confirmed WhatsApp number gets a link; a phone number alone may not be on WhatsApp. */}
                      {waLink(b.whatsapp, "", b.country) && (
                        <a className="text-[11px] text-emerald hover:underline" href={waLink(b.whatsapp, `Hi, is this ${b.name}?`, b.country) ?? undefined} target="_blank" rel="noreferrer" title="Listed on OpenStreetMap or linked from their website">WhatsApp ✓</a>
                      )}
                      {b.email && (
                        <span className="flex items-center gap-1.5 text-[11px]">
                          <a className="max-w-[170px] truncate text-cream/60 hover:text-gold" href={`mailto:${b.email}`} title={b.email}>{b.email}</a>
                          {b.emailSource === "WEB_SEARCH" && <span className="rounded bg-amber/15 px-1 text-[10px] text-amber" title="Read from web search results">web</span>}
                          <a className="text-gold hover:underline" href={gmailLink(b.email, `Quick idea for ${b.name}`) ?? undefined} target="_blank" rel="noreferrer" title="Open a draft in Gmail">Gmail ↗</a>
                        </span>
                      )}
                      {b.emailStatus === "SENT" && <span className="text-[11px] text-emerald" title={b.emailedAt ?? ""}>Emailed ✓ {b.emailedAt ? new Date(b.emailedAt).toLocaleDateString() : ""}{b.followUpSentAt ? " · followed up" : ""}</span>}
                      {b.repliedAt && <span className="text-[11px] font-medium text-gold">Replied ✓ {new Date(b.repliedAt).toLocaleDateString()}</span>}
                      {b.emailStatus === "OPTED_OUT" && <span className="text-[11px] text-cream/40">Do not email</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex max-w-[210px] flex-wrap gap-1">
                      {b.googleRating != null && <Badge tone="cream">{b.googleRating.toFixed(1)} ★{b.reviewCount != null ? ` (${b.reviewCount})` : ""}</Badge>}
                      {b.flags.filter((f) => f !== "NO_PHONE").map((f) => (
                        <Badge key={f} tone={f === "NO_WEBSITE" ? "crimson" : f === "NO_SOCIAL" ? "slate" : "amber"}>{FLAG_LABEL[f as ProspectFlag] ?? f}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2.5"><Badge tone={b.pipelineStage === "LEAD" ? "slate" : b.pipelineStage === "PITCH_SENT" ? "amber" : b.pipelineStage === "CLOSED_LOST" ? "crimson" : "emerald"}>{stageLabel(b.pipelineStage)}</Badge></td>
                  <td className="px-3 py-2.5 text-cream/75">{b.opportunityScore ?? "-"}</td>
                  <td className="px-3 py-2.5 text-xs">
                    {perUSD ? (() => {
                      const q = quoteFor(b, perUSD);
                      return (
                        <div className="min-w-[130px]" title="Your asking price from data/pricing.json, in this prospect's currency">
                          <div className="font-medium text-cream">{q.tierLabel} · {q.monthlyDisplay}</div>
                          {q.websiteBuildDisplay && <div className="text-cream/65">+ {q.websiteBuildDisplay} website build</div>}
                          {q.usdDisplay && <div className="text-cream/40">{q.usdDisplay}</div>}
                        </div>
                      );
                    })() : <span className="text-cream/30">…</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex justify-end gap-1.5">
                      <button className="btn-ghost !py-1 text-xs" onClick={() => toggle(b)} aria-expanded={open === b.id}>{open === b.id ? "Hide" : "Details"}</button>
                      <StarButton on={b.shortlisted} onToggle={() => onToggleStar(b)} label="Select" />
                      <button className="btn-gold !py-1 text-xs" onClick={() => onPlan(b)} title="Recommended services, price and outreach kit">Offer</button>
                      <button className="btn-ghost !py-1 text-xs" disabled={auditing.has(b.id)} onClick={() => auditHere(b)} title={b.website ? "Audits the website here; the table stays where it is" : "No website: opens the audit tab to search by name"}>
                        {auditing.has(b.id) ? "Auditing…" : b.lastAuditedAt ? "Re-audit" : "Audit"}
                      </button>
                    </div>
                  </td>
                </tr>
                {open === b.id && (() => {
                  const snap = snapshotWithAudit(b, audits[b.id] ?? null);
                  const pitch = recommendServices(b, catalogue).slice(0, 4);
                  return (
                    <tr className="border-b border-cream/10 bg-obsidian/60">
                      <td colSpan={12} className="px-4 py-4">
                        <div className="grid gap-4 md:grid-cols-3">
                          <div>
                            <div className="label">Already has</div>
                            {snap.has.length ? <ul className="space-y-1 text-[13px]">{snap.has.map((x) => <li key={x} className="text-emerald">✓ <span className="text-cream/85">{x}</span></li>)}</ul> : <p className="text-[13px] text-cream/50">Nothing confirmed yet.</p>}
                          </div>
                          <div>
                            <div className="label">Missing</div>
                            {snap.missing.length ? <ul className="space-y-1 text-[13px]">{snap.missing.map((x) => <li key={x} className="text-crimson">✗ <span className="text-cream/85">{x}</span></li>)}</ul> : <p className="text-[13px] text-cream/50">No gaps found in the data we hold.</p>}
                            {b.lastAuditedAt && <button className="mt-2 text-[11px] text-gold hover:underline" onClick={() => onAudit(b)}>Open in the audit tab ↗</button>}
                            {!snap.fromAudit && <p className="mt-2 text-[11px] text-cream/45">{b.website ? "Run an audit for website, tracking and conversion gaps." : "Based on listing data only."}</p>}
                          </div>
                          <div>
                            <div className="label">What we can pitch</div>
                            <ul className="space-y-1.5 text-[13px]">
                              {pitch.map((s) => (
                                <li key={s.code}>
                                  <span className="font-medium text-gold">{s.name}</span>
                                  <div className="text-[11px] text-cream/55">{s.why[0]}</div>
                                </li>
                              ))}
                            </ul>
                            <button className="btn-gold mt-2 !py-1 text-xs" onClick={() => onPlan(b)}>Full offer, price & outreach</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })()}
                </Fragment>
              ))}
            </tbody>
          </table>
          {rows.length > shown && (
            <div className="flex items-center justify-center gap-3 border-t border-cream/10 p-3 text-sm">
              <span className="text-cream/50">Showing {shown} of {rows.length}</span>
              <button className="btn-ghost !py-1 text-xs" onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, rows.length - shown)} more</button>
              <button className="btn-ghost !py-1 text-xs" onClick={() => setShown(rows.length)}>Show all</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AddForm({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ name: "", website: "", industry: "", phone: "", email: "", city: "", country: "", address: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/businesses", {
        method: "POST",
        body: JSON.stringify({
          ...f,
          city: f.city.trim() || "Unspecified",
          country: f.country.trim() || null,
          website: f.website || null,
          industry: f.industry || null,
          phone: f.phone || null,
          email: f.email || null,
          address: f.address || null,
        }),
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 grid gap-3 border-t border-cream/10 pt-4 md:grid-cols-3">
      <div><label className="label">Name *</label><input className="input" value={f.name} onChange={set("name")} /></div>
      <div><label className="label">Website</label><input className="input" value={f.website} onChange={set("website")} placeholder="https://" /></div>
      <div><label className="label">Industry</label><input className="input" value={f.industry} onChange={set("industry")} placeholder="DTC E-Commerce, SaaS…" /></div>
      <div><label className="label">Phone</label><input className="input" value={f.phone} onChange={set("phone")} /></div>
      <div><label className="label">Email</label><input className="input" value={f.email} onChange={set("email")} /></div>
      <div><label className="label">City</label><input className="input" value={f.city} onChange={set("city")} placeholder="London" /></div>
      <div>
        <label className="label">Country</label>
        <input className="input" list="country-list" value={f.country} onChange={set("country")} placeholder="United Kingdom" />
        <datalist id="country-list">{COUNTRIES.map((c) => <option key={c} value={c} />)}</datalist>
      </div>
      <div><label className="label">Address</label><input className="input" value={f.address} onChange={set("address")} /></div>
      <div className="flex items-end">
        <button className="btn-gold w-full" disabled={busy || !f.name.trim()} onClick={save}>{busy ? "Saving…" : "Save business"}</button>
      </div>
      {error && <div className="md:col-span-3"><ErrorBox>{error}</ErrorBox></div>}
    </div>
  );
}
