"use client";

import { useCallback, useEffect, useState } from "react";
import { api, fmtDate, placeOf } from "@/lib/client";
import { FLAG_LABEL, type ProspectFlag } from "@/lib/leads/score";
import { gmailLink, telHref, waLink } from "@/lib/outreach";
import type { BusinessDTO, SocialLeadDTO } from "@/lib/types";
import { Badge, CopyButton, ErrorBox, InfoBox, SectionTitle } from "./ui";
import { quoteFor } from "@/lib/leads/quote";
import { CatalogueImport } from "./CatalogueImport";
import { ExportButtons } from "./ExportButtons";
import { StarButton } from "./StarButton";

/** Everything the user has starred: businesses from the directory/CRM and posts from the radar. */
export function ShortlistTab({
  businesses,
  patch,
  onAudit,
  onPlan,
}: {
  businesses: BusinessDTO[];
  patch: (id: string, p: Partial<BusinessDTO>) => Promise<void>;
  onAudit: (b: BusinessDTO) => void;
  onPlan: (b: BusinessDTO) => void;
}) {
  const [posts, setPosts] = useState<SocialLeadDTO[]>([]);
  const [error, setError] = useState<string | null>(null);
  const picked = businesses.filter((b) => b.shortlisted);
  const [perUSD, setPerUSD] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    api<{ perUSD: Record<string, number> }>("/api/rates").then((r) => setPerUSD(r.perUSD)).catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    try {
      setPosts((await api<{ leads: SocialLeadDTO[] }>("/api/radar?shortlisted=1")).leads);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load shortlisted posts");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function unstarPost(id: string) {
    setPosts((p) => p.filter((x) => x.id !== id));
    await api("/api/radar", { method: "PATCH", body: JSON.stringify({ id, shortlisted: false }) }).catch(load);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle sub="Everything you starred in the Directory, CRM and Radar, in one place.">Shortlist</SectionTitle>
        <div className="flex flex-wrap items-center gap-3">
          <CatalogueImport />
          <ExportButtons scope="shortlist" />
        </div>
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}

      <section>
        <h4 className="mb-2 text-sm font-medium text-gold">Businesses ({picked.length})</h4>
        {picked.length === 0 ? (
          <InfoBox>No businesses yet. Click ☆ Shortlist on a row in the International Directory or on a CRM card.</InfoBox>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {picked.map((b) => (
              <div key={b.id} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{b.name}</div>
                    <div className="text-xs text-cream/55">{placeOf(b)}{b.industry ? ` · ${b.industry}` : ""}</div>
                  </div>
                  <StarButton on onToggle={() => patch(b.id, { shortlisted: false })} />
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {b.googleRating != null && <Badge tone="cream">{b.googleRating.toFixed(1)} ★{b.reviewCount != null ? ` (${b.reviewCount})` : ""}</Badge>}
                  {b.flags.filter((f) => f !== "NO_PHONE").map((f) => (
                    <Badge key={f} tone={f === "NO_WEBSITE" ? "crimson" : f === "NO_SOCIAL" ? "slate" : "amber"}>{FLAG_LABEL[f as ProspectFlag] ?? f}</Badge>
                  ))}
                  {b.opportunityScore != null && <Badge tone="gold">Opportunity {b.opportunityScore}</Badge>}
                </div>
                {perUSD && <div className="mt-2 text-xs text-cream/75">Suggested: <b className="text-gold">{quoteFor(b, perUSD).summary}</b></div>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="btn-gold !py-1 text-xs" onClick={() => onPlan(b)}>Offer & outreach</button>
                  <button className="btn-ghost !py-1 text-xs" onClick={() => onAudit(b)}>Audit</button>
                  {b.phone && <a className="btn-ghost !py-1 text-xs" href={telHref(b.phone, b.country) ?? undefined}>Call</a>}
                  {waLink(b.whatsapp, `Hi, is this ${b.name}?`, b.country) && (
                    <a className="btn-ghost !py-1 text-xs" href={waLink(b.whatsapp, `Hi, is this ${b.name}?`, b.country) ?? undefined} target="_blank" rel="noreferrer">WhatsApp ↗</a>
                  )}
                  {gmailLink(b.email) && <a className="btn-ghost !py-1 text-xs" href={gmailLink(b.email, `Quick idea for ${b.name}`) ?? undefined} target="_blank" rel="noreferrer">Gmail ↗</a>}
                  {b.website && <a className="btn-ghost !py-1 text-xs" href={/^https?:/i.test(b.website) ? b.website : `https://${b.website}`} target="_blank" rel="noreferrer">Website ↗</a>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h4 className="mb-2 text-sm font-medium text-gold">Posts ({posts.length})</h4>
        {posts.length === 0 ? (
          <InfoBox>No posts yet. Click ☆ Shortlist on a lead in the Social Intent Radar.</InfoBox>
        ) : (
          <div className="space-y-3">
            {posts.map((l) => (
              <div key={l.id} className="card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="gold">{l.platform}</Badge>
                  <Badge tone={l.intentCategory === "BUYER_HIRING" ? "emerald" : "amber"}>{l.intentCategory === "BUYER_HIRING" ? "Buyer · hiring" : "Advice seeking"}</Badge>
                  <span className="text-xs text-cream/50">{l.authorHandle ?? "author unknown"} · {fmtDate(l.postedAt)}</span>
                  <div className="ml-auto flex gap-2">
                    <a className="btn-ghost !py-1 text-xs" href={l.sourceUrl} target="_blank" rel="noreferrer">Open post ↗</a>
                    <StarButton on onToggle={() => unstarPost(l.id)} />
                  </div>
                </div>
                {l.postTitle && <h5 className="mt-2 text-sm font-medium">{l.postTitle}</h5>}
                <p className="mt-1 line-clamp-3 text-[13px] text-cream/70">{l.postContent}</p>
                {l.painPoint && <p className="mt-2 text-[12px] text-cream/60"><b className="text-gold/90">Pain point:</b> {l.painPoint}</p>}
                {l.pitchDraft && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <CopyButton text={l.pitchDraft.comment} label="Copy public comment" />
                    <CopyButton text={l.pitchDraft.dm} label="Copy DM" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
