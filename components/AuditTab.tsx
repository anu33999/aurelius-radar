"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { AuditResult, BusinessDTO, Gap, GapStatus } from "@/lib/types";
import { Badge, CopyBlock, ErrorBox, InfoBox, SectionTitle, Spinner } from "./ui";
import { CatalogueImport } from "./CatalogueImport";
import { gmailLink, telHref, waLink } from "@/lib/outreach";

const SUBTABS = [
  { key: "baseline", label: "1 · Current Stack & Baseline" },
  { key: "gaps", label: "2 · Revenue & Conversion Gaps" },
  { key: "match", label: "3 · Aurelius Service Match" },
  { key: "pitch", label: "4 · Pitch & Outreach" },
] as const;
type SubTab = (typeof SUBTABS)[number]["key"];

const STATUS_TONE: Record<GapStatus, "crimson" | "amber" | "slate"> = {
  CONFIRMED: "crimson",
  LIKELY: "amber",
  UNVERIFIABLE: "slate",
};
const STATUS_LABEL: Record<GapStatus, string> = {
  CONFIRMED: "Confirmed Issue",
  LIKELY: "Likely Opportunity",
  UNVERIFIABLE: "Unverifiable Online",
};

export function AuditTab({
  businesses,
  prefill,
  onSaved,
}: {
  businesses: BusinessDTO[];
  prefill: { name: string; website: string | null; id: string } | null;
  onSaved: () => void;
}) {
  const [input, setInput] = useState("");
  const [budget, setBudget] = useState("");
  const [businessId, setBusinessId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [starter, setStarter] = useState(false);
  const [sub, setSub] = useState<SubTab>("baseline");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (prefill) {
      setInput(prefill.website || prefill.name);
      setBusinessId(prefill.id);
    }
  }, [prefill]);

  async function run() {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const res = await api<{ audit: AuditResult; business: BusinessDTO | null; catalogueIsStarter: boolean }>("/api/audit", {
        method: "POST",
        body: JSON.stringify({ input, businessId, monthlyBudget: budget || undefined }),
      });
      setAudit(res.audit);
      setStarter(res.catalogueIsStarter);
      setSub("baseline");
      if (res.business) {
        setBusinessId(res.business.id);
        setSaved(true);
        onSaved();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Audit failed");
    } finally {
      setLoading(false);
    }
  }

  async function reopen(id: string) {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ audit: AuditResult | null }>(`/api/audit?businessId=${id}`);
      if (res.audit) {
        setAudit(res.audit);
        setBusinessId(id);
        setInput(res.audit.website ?? res.audit.businessName);
        setSub("baseline");
      } else setError("That business has no saved audit yet.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load audit");
    } finally {
      setLoading(false);
    }
  }

  const audited = businesses.filter((b) => b.lastAuditedAt);

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <SectionTitle sub="Enter a brand name (looked up via your search API) or paste a website URL. Public markup and a PageSpeed run only; nothing is logged in to.">
          Deep Commercial Audit
        </SectionTitle>
        <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
          <div>
            <label className="label">Business name or website</label>
            <input
              className="input"
              placeholder="e.g. The Thickshake Factory, or https://example.com"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setBusinessId(undefined);
              }}
              onKeyDown={(e) => e.key === "Enter" && !loading && run()}
            />
          </div>
          <div>
            <label className="label">Proposed monthly budget (optional)</label>
            <input className="input" placeholder="e.g. ₹60,000" value={budget} onChange={(e) => setBudget(e.target.value)} />
          </div>
          <div className="flex items-end">
            <button className="btn-gold w-full" disabled={loading || !input.trim()} onClick={run}>
              {loading ? "Auditing…" : "Run audit"}
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-cream/60">
          {audited.length > 0 && (
            <label className="flex items-center gap-2">
              Re-open a saved audit:
              <select className="input !w-auto !py-1" defaultValue="" onChange={(e) => reopen(e.target.value)}>
                <option value="">Choose…</option>
                {audited.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <CatalogueImport />
        </div>
        {loading && (
          <div className="mt-3">
            <Spinner label="Fetching the site, checking sitemap and structured data, and running PageSpeed (up to ~45s)…" />
          </div>
        )}
        {error && (
          <div className="mt-3">
            <ErrorBox>{error}</ErrorBox>
          </div>
        )}
      </div>

      {audit && (
        <>
          {starter && (
            <InfoBox tone="amber">
              Service matching is using the <b>starter catalogue</b>, not your real 206 services. Import the real catalogue (button above) so matches use your exact service names and codes.
            </InfoBox>
          )}
          {audit.warnings.map((w, i) => (
            <InfoBox key={i} tone="amber">
              {w}
            </InfoBox>
          ))}

          <ProfileCard audit={audit} business={businesses.find((x) => x.id === businessId) ?? null} saved={saved} />

          <div className="flex flex-wrap gap-1.5 rounded-xl border border-cream/10 bg-matte p-1.5">
            {SUBTABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setSub(t.key)}
                className={`flex-1 rounded-lg px-3 py-2 text-sm transition ${sub === t.key ? "bg-gold text-onaccent shadow" : "text-cream/70 hover:bg-cream/5 hover:text-gold"}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {sub === "baseline" && <Baseline a={audit} />}
          {sub === "gaps" && <Gaps a={audit} />}
          {sub === "match" && <Match a={audit} />}
          {sub === "pitch" && <Pitch a={audit} />}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Fact({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "good" | "bad" | "muted" }) {
  const c = tone === "good" ? "text-emerald" : tone === "bad" ? "text-crimson" : tone === "muted" ? "text-cream/50" : "text-cream";
  return (
    <div className="rounded-lg bg-obsidian/70 p-3.5">
      <div className="text-[11px] uppercase tracking-wider text-gold/80">{label}</div>
      <div className={`mt-1 text-sm ${c}`}>{value}</div>
    </div>
  );
}

function ProfileCard({ audit, business, saved }: { audit: AuditResult; business: BusinessDTO | null; saved: boolean }) {
  const bl = audit.baseline;
  const site = bl?.finalUrl ?? audit.website;
  const social = bl ? (Object.entries(bl.social) as [string, string | null][]).filter(([, v]) => v) : [];
  const phone = business?.phone ?? null;
  const country = business?.country ?? null;
  const links: { label: string; href: string; strong?: boolean }[] = [];
  if (site) links.push({ label: "Website", href: site, strong: true });
  for (const [k, v] of social) links.push({ label: k.charAt(0).toUpperCase() + k.slice(1), href: v as string });
  if (business?.instagramUrl && !social.some(([k]) => k === "instagram")) links.push({ label: "Instagram", href: business.instagramUrl });
  if (business?.linkedinUrl && !social.some(([k]) => k === "linkedin")) links.push({ label: "LinkedIn", href: business.linkedinUrl });
  if (bl) {
    links.push({ label: "Google Maps", href: bl.links.googleMaps });
    links.push({ label: "Meta Ad Library", href: bl.links.metaAdLibrary });
    links.push({ label: "Google Ads Transparency", href: bl.links.googleAdsTransparency });
  }
  const phoneHref = telHref(phone, country);
  const wa = waLink(business?.whatsapp ?? (bl?.widgets.whatsappNumber ? `+${bl.widgets.whatsappNumber}` : null), `Hi, is this ${audit.businessName}?`, country);
  if (phoneHref) links.push({ label: `Call ${phone}`, href: phoneHref });
  if (wa) links.push({ label: "WhatsApp", href: wa });
  if (business?.email) links.push({ label: "Email", href: `mailto:${business.email}` });
  const gm = gmailLink(business?.email, audit.pitch.coldEmail.subject, audit.pitch.coldEmail.body);
  if (gm) links.push({ label: "Gmail", href: gm });

  return (
    <div className="card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="h-serif text-2xl text-cream">{audit.businessName}</h2>
          {site && (
            <a className="mt-1 inline-block text-sm text-gold underline-offset-2 hover:underline" href={site} target="_blank" rel="noreferrer">
              {site.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")} ↗
            </a>
          )}
        </div>
        <div className="flex items-center gap-4">
          <Score label="Opportunity" value={audit.opportunityScore} accent />
          <Score label="Readiness" value={audit.readinessScore} />
          {saved && <Badge tone="emerald">Saved to CRM</Badge>}
        </div>
      </div>
      {links.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {links.map((l) => (
            <a
              key={l.label + l.href}
              href={l.href}
              target={l.href.startsWith("http") ? "_blank" : undefined}
              rel="noreferrer"
              className={l.strong ? "btn-gold !py-1.5 text-xs" : "btn-ghost !py-1.5 text-xs"}
            >
              {l.label}
              {l.href.startsWith("http") ? " ↗" : ""}
            </a>
          ))}
        </div>
      )}
      {bl && social.length === 0 && <p className="mt-3 text-xs text-cream/50">No social profiles are linked from the website. Search for them by hand before pitching.</p>}
    </div>
  );
}

function Score({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="text-center">
      <div className={`h-serif text-3xl leading-none ${accent ? "text-gold" : "text-cream"}`}>{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wider text-cream/50">{label}</div>
    </div>
  );
}

function Collapsible({ title, hint, children, defaultOpen = false }: { title: string; hint?: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
        <span>
          <span className="h-serif text-base text-cream">{title}</span>
          {hint && <span className="ml-3 text-xs text-cream/50">{hint}</span>}
        </span>
        <span className="text-gold transition group-open:rotate-180" aria-hidden>▾</span>
      </summary>
      <div className="border-t border-cream/10 px-5 py-5">{children}</div>
    </details>
  );
}

function Baseline({ a }: { a: AuditResult }) {
  const b = a.baseline;
  if (!b) return <InfoBox tone="amber">No website was available to inspect, so there is no baseline. Enter the URL directly.</InfoBox>;
  const t = b.tracking;
  const yn = (v: boolean, yes: string, no: string) => (v ? <span>{yes}</span> : <span>{no}</span>);
  const tags: [string, boolean][] = [
    ["GA4", t.ga4],
    ["Tag Manager", t.gtm],
    ["Meta Pixel", t.metaPixel],
    ["Google Ads tag", t.googleAds],
    ["TikTok Pixel", t.tiktokPixel],
    ["LinkedIn Insight", t.linkedinInsight],
  ];
  return (
    <div className="space-y-5">
      {b.fetchError && <ErrorBox>{b.fetchError}</ErrorBox>}

      <section className="card p-5">
        <SectionTitle sub="What stands out first. Everything comes from public markup; 'not detected' is not proof something is unused.">At a glance</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Platform" value={b.cms ? b.cms.name : "Not identified"} tone={b.cms ? undefined : "muted"} />
          <Fact label="Mobile speed" value={b.performance.mobileScore !== null ? `${b.performance.mobileScore}/100` : "Not measured"} tone={b.performance.mobileScore === null ? "muted" : b.performance.mobileScore >= 80 ? "good" : b.performance.mobileScore < 50 ? "bad" : undefined} />
          <Fact label="Secure (HTTPS)" value={yn(b.https, "Yes ✓", "No")} tone={b.https ? "good" : "bad"} />
          <Fact label="Mobile-ready" value={yn(b.viewportMeta, "Yes ✓", "Viewport tag missing")} tone={b.viewportMeta ? "good" : "bad"} />
          <Fact label="Contact forms" value={b.formCount > 0 ? `${b.formCount} found` : "None found"} tone={b.formCount > 0 ? "good" : "muted"} />
          <Fact label="WhatsApp" value={yn(b.widgets.whatsapp, "Detected ✓", "Not detected")} tone={b.widgets.whatsapp ? "good" : "muted"} />
          <Fact label="Live chat" value={b.widgets.liveChat ?? "Not detected"} tone={b.widgets.liveChat ? "good" : "muted"} />
          <Fact label="Online store" value={b.ecommerce ? "Detected" : "Not detected"} tone={b.ecommerce ? undefined : "muted"} />
        </div>
      </section>

      <section className="card p-5">
        <SectionTitle sub="Pixel and tag presence from public markup. Server-side setups (CAPI) are invisible from outside.">Ad & tracking tags</SectionTitle>
        <div className="flex flex-wrap gap-2">
          {tags.filter(([, on]) => on).map(([name]) => (
            <Badge key={name} tone="emerald">{name} ✓</Badge>
          ))}
          {t.heatmap && <Badge tone="emerald">{t.heatmap} ✓</Badge>}
          {tags.every(([, on]) => !on) && <span className="text-sm text-cream/60">No ad or analytics tags detected in public markup.</span>}
        </div>
        {tags.some(([, on]) => !on) && (
          <p className="mt-3 text-xs text-cream/50">Not detected: {tags.filter(([, on]) => !on).map(([n]) => n).join(", ")}. Conversions API cannot be verified from outside.</p>
        )}
      </section>

      <Collapsible title="Search engine visibility" hint="title, description, sitemap, structured data">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Title tag" value={b.title ? `${b.title.slice(0, 70)}${b.title.length > 70 ? "…" : ""} (${b.title.length})` : "Missing"} tone={b.title ? undefined : "bad"} />
          <Fact label="Meta description" value={b.metaDescription ? `Present (${b.metaDescription.length} chars)` : "Missing"} tone={b.metaDescription ? "good" : "bad"} />
          <Fact label="H1 headings" value={b.h1Count} tone={b.h1Count === 1 ? "good" : "muted"} />
          <Fact label="Canonical tag" value={b.canonical ? "Present" : "Not found"} tone="muted" />
          <Fact label="XML sitemap" value={b.sitemap === "found" ? "Found ✓" : b.sitemap === "not_found" ? "Not found" : "Could not check"} tone={b.sitemap === "found" ? "good" : b.sitemap === "not_found" ? "bad" : "muted"} />
          <Fact label="Structured data" value={b.structuredData.length ? b.structuredData.join(", ") : "None detected"} tone={b.structuredData.length ? "good" : "muted"} />
          <Fact label="Indexing" value={b.robotsNoindex ? "noindex set" : "Indexable"} tone={b.robotsNoindex ? "bad" : "good"} />
          <Fact label="Images missing alt text" value={`${b.imagesMissingAlt} / ${b.imageCount}`} tone="muted" />
        </div>
      </Collapsible>

      <Collapsible title="Technical details" hint="speed metrics, page weight, CRM">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="LCP (mobile)" value={b.performance.lcpSeconds !== null ? `${b.performance.lcpSeconds}s` : "n/a"} tone="muted" />
          <Fact label="CLS" value={b.performance.cls !== null ? b.performance.cls : "n/a"} tone="muted" />
          <Fact label="Total blocking time" value={b.performance.tbtMs !== null ? `${b.performance.tbtMs}ms` : "n/a"} tone="muted" />
          <Fact label="Page HTML weight" value={b.pageWeightKb !== null ? `${b.pageWeightKb} KB · ${b.scriptCount} scripts` : "n/a"} tone="muted" />
          <Fact label="CRM / email platform" value={b.widgets.crm ?? "Not visible"} tone={b.widgets.crm ? "good" : "muted"} />
        </div>
        <p className="mt-3 text-xs text-cream/50">{b.performance.note}</p>
      </Collapsible>
    </div>
  );
}

function GapCard({ g }: { g: Gap }) {
  return (
    <div className="rounded-lg bg-obsidian/70 p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONE[g.status]}>{STATUS_LABEL[g.status]}</Badge>
        {g.quickWin && <Badge tone="gold">Quick win</Badge>}
        <span className="text-sm font-medium text-cream">{g.title}</span>
      </div>
      <p className="mt-2 text-[13px] text-cream/75">
        <span className="text-gold/80">Evidence: </span>
        {g.evidence}
      </p>
      <p className="mt-1 text-[13px] text-cream/75">
        <span className="text-gold/80">Why it costs money: </span>
        {g.impact}
      </p>
    </div>
  );
}

function Gaps({ a }: { a: AuditResult }) {
  const groups: GapStatus[] = ["CONFIRMED", "LIKELY", "UNVERIFIABLE"];
  return (
    <div className="space-y-5">
      <section className="card p-5">
        <SectionTitle sub="Ranked by commercial impact. Unverifiable items are excluded from this list.">The 5 biggest revenue opportunities</SectionTitle>
        {a.topOpportunities.length === 0 ? (
          <InfoBox>No confirmed or likely gaps were found from public data. Use the discovery questions to look deeper.</InfoBox>
        ) : (
          <ol className="space-y-3">
            {a.topOpportunities.map((g, i) => (
              <li key={g.id} className="flex gap-3">
                <span className="h-serif flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gold/50 text-gold">{i + 1}</span>
                <div className="flex-1">
                  <GapCard g={g} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
      {groups.map((s) => {
        const list = a.gaps.filter((g) => g.status === s);
        if (!list.length) return null;
        return (
          <Collapsible key={s} title={`${STATUS_LABEL[s]} (${list.length})`} hint={s === "UNVERIFIABLE" ? "cannot be checked from outside" : "full list"}>
            <div className="space-y-2.5">{list.map((g) => <GapCard key={g.id} g={g} />)}</div>
          </Collapsible>
        );
      })}
    </div>
  );
}

function Match({ a }: { a: AuditResult }) {
  const m = a.match;
  const list = (items: AuditResult["match"]["quickWins"]) =>
    items.length === 0 ? (
      <p className="text-sm text-cream/50">Nothing mapped here.</p>
    ) : (
      <ul className="space-y-2">
        {items.map(({ service, because }) => (
          <li key={service.code} className="rounded-lg border border-cream/10 bg-obsidian p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="gold">{service.code}</Badge>
              <span className="text-sm font-medium">{service.name}</span>
              <Badge tone="cream">{service.practiceArea}</Badge>
              {service.isAI && <Badge tone="emerald">AI-powered</Badge>}
            </div>
            {service.summary && <p className="mt-1.5 text-[13px] text-cream/70">{service.summary}</p>}
            <p className="mt-1.5 text-[12px] text-gold/80">Matched because: {because}</p>
          </li>
        ))}
      </ul>
    );
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <section>
        <SectionTitle sub="Immediate ROI, small scope.">Quick wins</SectionTitle>
        {list(m.quickWins)}
      </section>
      <section>
        <SectionTitle sub="3 to 6 month scale work.">Core growth</SectionTitle>
        {list(m.coreGrowth)}
      </section>
      <section>
        <SectionTitle sub="Pitching these would burn trust.">What NOT to pitch</SectionTitle>
        {m.doNotPitch.length === 0 ? (
          <p className="text-sm text-cream/50">No explicit exclusions detected. Use judgement from discovery.</p>
        ) : (
          <ul className="space-y-2">
            {m.doNotPitch.map((d) => (
              <li key={d.area} className="rounded-lg border border-crimson/30 bg-crimson/5 p-3">
                <div className="text-sm font-medium text-errtext">{d.area}</div>
                <p className="mt-1 text-[13px] text-cream/70">{d.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Pitch({ a }: { a: AuditResult }) {
  const p = a.pitch;
  const pr = p.proposal;
  const proposalText = `1-PAGE COMMERCIAL PROPOSAL: ${a.businessName}

SCOPE OF WORK
${pr.scope.map((s) => `- ${s}`).join("\n")}

DELIVERABLES
${pr.deliverables.map((s) => `- ${s}`).join("\n")}

KPIs
${pr.kpis.map((s) => `- ${s}`).join("\n")}

SLA
${pr.sla.map((s) => `- ${s}`).join("\n")}

COMMERCIALS
${pr.commercials}`;
  const pieces: { key: string; label: string; title: string; text: string }[] = [
    { key: "email", label: "Cold email", title: `Executive cold email · Subject: ${p.coldEmail.subject}`, text: `Subject: ${p.coldEmail.subject}\n\n${p.coldEmail.body}` },
    { key: "wa", label: "WhatsApp", title: "Founder WhatsApp / Telegram DM", text: p.whatsapp },
    { key: "li", label: "LinkedIn", title: "LinkedIn InMail", text: p.linkedinInMail },
    { key: "call", label: "Call script", title: "Cold call script", text: p.coldCallScript },
    { key: "disc", label: "Discovery questions", title: "Discovery call questions", text: p.discoveryQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n") },
    { key: "prop", label: "Proposal", title: "1-page commercial proposal", text: proposalText },
  ];
  const [open, setOpen] = useState("email");
  const cur = pieces.find((x) => x.key === open) ?? pieces[0];
  return (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="flex flex-wrap items-center gap-6">
          <div className="h-serif text-4xl text-gold">{p.score.total}<span className="text-base text-cream/50">/100</span></div>
          <div>
            <div className="text-sm font-medium">Pitch quality score</div>
            <div className="text-xs text-cream/55">Drafted by {p.generatedBy === "AI" ? "AI" : "templates (set ANTHROPIC_API_KEY for AI drafts)"}</div>
          </div>
          <div className="ml-auto flex flex-wrap gap-4 text-xs text-cream/70">
            {p.score.rubric.map((r) => (
              <span key={r.criterion} title={r.note}>{r.criterion}: <b className="text-gold">{r.points}/{r.max}</b></span>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {pieces.map((x) => (
          <button key={x.key} onClick={() => setOpen(x.key)} className={`rounded-full border px-3.5 py-1.5 text-sm transition ${open === x.key ? "border-gold bg-gold text-onaccent" : "border-cream/20 text-cream/75 hover:border-gold/60 hover:text-gold"}`}>
            {x.label}
          </button>
        ))}
      </div>
      <CopyBlock title={cur.title} text={cur.text} />
    </div>
  );
}
