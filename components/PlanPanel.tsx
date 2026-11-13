"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { Plan } from "@/lib/leads/plan";
import type { Kit } from "@/lib/leads/kit";
import { gmailLink, waLink } from "@/lib/outreach";
import type { BusinessDTO } from "@/lib/types";
import { Badge, CopyButton, InfoBox, Spinner } from "./ui";

/** Recommended services, suggested price in the prospect's currency, and a ready-to-send outreach kit. */
export function PlanPanel({ b }: { b: BusinessDTO }) {
  const [data, setData] = useState<{ plan: Plan; kit: Kit; catalogueIsStarter: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"whatsapp" | "instagram" | "email" | "linkedin" | "battle" | "proposal">("whatsapp");

  useEffect(() => {
    setData(null);
    setError(null);
    api<{ plan: Plan; kit: Kit; catalogueIsStarter: boolean }>(`/api/plan?businessId=${b.id}`).then(setData).catch((e) => setError(e instanceof Error ? e.message : "Could not build the plan"));
  }, [b.id, b.website, b.country, b.niche, b.matchedServiceIds.join(","), b.googleRating, b.reviewCount]);

  if (error) return <InfoBox tone="amber">{error}</InfoBox>;
  if (!data) return <Spinner label="Building offer…" />;
  const { plan, kit } = data;
  const wa = waLink(b.whatsapp, kit.whatsapp, b.country);

  const TABS = [
    ["whatsapp", "WhatsApp"],
    ["instagram", "Instagram DM"],
    ["email", "Email"],
    ["linkedin", "LinkedIn"],
    ["battle", "Objections"],
    ["proposal", "1-page proposal"],
  ] as const;
  const text =
    tab === "whatsapp" ? kit.whatsapp : tab === "instagram" ? kit.instagramDm : tab === "email" ? `Subject: ${kit.email.subject}\n\n${kit.email.body}` : tab === "linkedin" ? kit.linkedin : tab === "proposal" ? kit.proposal : "";

  return (
    <div className="space-y-4">
      <div>
        <label className="label">Best services to offer</label>
        <ul className="space-y-1.5">
          {plan.services.map((s) => (
            <li key={s.code} className="rounded-lg border border-cream/10 bg-obsidian p-2.5 text-[13px]">
              <div className="flex items-center gap-2">
                <Badge tone="gold">{s.code}</Badge>
                <span className="font-medium">{s.name}</span>
                <span className="ml-auto text-[11px] text-cream/45">{s.practiceArea}</span>
              </div>
              {s.why.length > 0 && <p className="mt-1 text-[12px] text-cream/60">{s.why.join(" · ")}</p>}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <label className="label">Suggested monthly retainer ({plan.currency})</label>
        <div className="grid gap-2 sm:grid-cols-3">
          {plan.tiers.map((t) => {
            const rec = t.tier === plan.recommendedTier;
            return (
              <div key={t.tier} className={`rounded-lg border p-3 ${rec ? "border-gold bg-gold/10" : "border-cream/10 bg-obsidian"}`}>
                <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-cream/60">
                  {t.label}
                  {rec && <Badge tone="gold">Start here</Badge>}
                </div>
                <div className="mt-1 text-lg font-semibold">{t.display}</div>
                {t.displayUSD && <div className="text-[11px] text-cream/50">{t.displayUSD} / month</div>}
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[12px] text-cream/60">{plan.tierReason}</p>
        {plan.websiteBuild && <p className="mt-1 text-[12px] text-cream/75">No website found: one-time website build ≈ <b>{plan.websiteBuild.display}</b> (in addition to, or instead of, the retainer).</p>}
        <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[11px] text-cream/45">
          {plan.caveats.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      </div>

      <div>
        <label className="label">Outreach kit</label>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {TABS.map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-full border px-2.5 py-1 text-xs ${tab === k ? "border-gold bg-gold text-onaccent" : "border-cream/20 text-cream/70"}`}>
              {label}
            </button>
          ))}
        </div>
        {tab === "battle" ? (
          <div className="space-y-2">
            {kit.battleCard.map((o, i) => (
              <div key={i} className="rounded-lg border border-cream/10 bg-obsidian p-2.5 text-[13px]">
                <div className="font-medium text-gold">“{o.objection}”</div>
                <p className="mt-1 text-cream/80">{o.response}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-cream/10 bg-obsidian">
            <p className="whitespace-pre-wrap p-3 text-[13px] leading-relaxed text-cream/90">{text}</p>
            <div className="flex flex-wrap gap-2 border-t border-cream/10 p-2">
              <CopyButton text={text} label="Copy" />
              {tab === "whatsapp" && (wa ? <a className="btn-gold !py-1 text-xs" href={wa} target="_blank" rel="noreferrer">Send on WhatsApp ↗</a> : <span className="self-center text-[11px] text-cream/45">Not confirmed on WhatsApp (no WhatsApp listed on OpenStreetMap or linked on their site), so no link. Copy the message if you confirm it another way.</span>)}
              {tab === "email" && b.email && <a className="btn-gold !py-1 text-xs" href={gmailLink(b.email, kit.email.subject, kit.email.body) ?? undefined} target="_blank" rel="noreferrer">Open in Gmail ↗</a>}
              {tab === "email" && b.email && <a className="btn-ghost !py-1 text-xs" href={`mailto:${b.email}?subject=${encodeURIComponent(kit.email.subject)}&body=${encodeURIComponent(kit.email.body)}`}>Open in mail app</a>}
              {tab === "email" && !b.email && <span className="self-center text-[11px] text-cream/45">No email on file. Add one in the CRM card, or run "Find phones from websites", which also collects emails.</span>}
            </div>
          </div>
        )}
        <p className="mt-1 text-[11px] text-cream/40">Drafts use only listing data we hold about this business. Nothing is sent automatically.</p>
      </div>
    </div>
  );
}
