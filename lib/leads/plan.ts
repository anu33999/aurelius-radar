import { nicheById } from "@/lib/niches";
import { TIER_LABEL, TIER_ORDER, formatMoney, tierPrices, websiteBuildMultiplier, type Rates, type TierKey } from "@/lib/pricing";
import type { BusinessDTO, ServiceDef } from "@/lib/types";

/**
 * Offer planner: which services to lead with for a prospect, why, and what to ask, in the prospect's
 * own currency. Everything is derived from the listing data we hold (niche, missing website, review
 * footprint, saved audit matches), and each recommendation says which signal triggered it.
 */

/** primary tags are what the signal is really about (and the only ones shown as a reason); secondary tags add a smaller score boost. */
type Signal = { primary: string[]; secondary: string[]; weight: number; reason: string };

const NICHE_TAGS: Record<string, string[]> = {
  cafe: ["social", "video", "local-seo"],
  bakery: ["social", "video", "local-seo"],
  restaurant: ["social", "video", "local-seo", "performance-ads"],
  bar: ["social", "video", "performance-ads"],
  salon: ["social", "video", "performance-ads", "local-seo"],
  medspa: ["performance-ads", "video", "web", "cro"],
  boutique: ["social", "performance-ads", "email", "video"],
  fitness: ["social", "performance-ads", "lead-gen", "video"],
  dental: ["local-seo", "performance-ads", "web", "cro"],
  clinic: ["local-seo", "web", "performance-ads", "cro"],
  realestate: ["performance-ads", "lead-gen", "video", "crm"],
  architecture: ["branding", "web", "video", "seo"],
  interior: ["branding", "web", "video", "social"],
  jewelry: ["performance-ads", "web", "email", "cro"],
  furniture: ["performance-ads", "web", "email", "cro"],
  factory: ["web", "seo", "lead-gen", "branding"],
  industrial_supply: ["web", "seo", "lead-gen", "crm"],
};

export interface PlanService {
  code: string;
  name: string;
  practiceArea: string;
  why: string[];
}

export interface Plan {
  services: PlanService[];
  currency: string;
  tiers: { tier: TierKey; label: string; monthly: number; monthlyUSD: number; display: string; displayUSD: string }[];
  recommendedTier: TierKey;
  tierReason: string;
  websiteBuild: { amount: number; display: string } | null;
  rates: { source: Rates["source"]; asOf: string | null };
  caveats: string[];
}

export function recommendTier(b: Pick<BusinessDTO, "niche" | "reviewCount" | "website" | "country">): { tier: TierKey; reason: string } {
  const value = nicheById(b.niche)?.value ?? 18;
  const established = (b.reviewCount ?? 0) >= 200;
  // Businesses with no website or almost no reviews are usually earlier-stage and spend less.
  const score = value + (established ? 4 : 0) - (!b.website ? 6 : 0) - (b.reviewCount != null && b.reviewCount < 15 ? 4 : 0);
  if (score >= 36) return { tier: "gold", reason: "High-ticket niche with room to grow: open at Gold and keep Platinum for when paid ads and lead-gen scale." };
  if (score >= 22) return { tier: "silver", reason: b.website ? "Mid-budget profile: open at Silver, with Gold as the natural upsell once results show." : "No website yet suggests an earlier-stage business: open at Silver plus the one-off website build, and move to Gold once enquiries grow." };
  return { tier: "silver", reason: "Smaller typical budget: open at Silver, or a one-off project first." };
}

/** Which services to lead with for a prospect, each with the signals that triggered it. Pure: no prices or network. */
export function recommendServices(b: BusinessDTO, catalogue: ServiceDef[]): PlanService[] {
  const signals: Signal[] = [];
  const auditCodes = new Set(b.matchedServiceIds);

  if (!b.website) signals.push({ primary: ["web"], secondary: ["seo", "local-seo"], weight: 5, reason: "No website found for this business" });
  if (b.flags.includes("LOW_RATING")) signals.push({ primary: ["reputation"], secondary: ["local-seo"], weight: 4, reason: `Google rating of ${b.googleRating?.toFixed(1)} is below 4.0` });
  if (b.flags.includes("FEW_REVIEWS")) signals.push({ primary: ["reputation", "local-seo"], secondary: ["social"], weight: 3, reason: "Thin review footprint limits local discovery" });
  if (b.flags.includes("NO_SOCIAL")) signals.push({ primary: ["social"], secondary: ["video"], weight: 2, reason: "No Instagram or LinkedIn page found" });
  const nicheTags = b.niche ? NICHE_TAGS[b.niche] : undefined;
  if (nicheTags) signals.push({ primary: nicheTags, secondary: [], weight: 2.5, reason: `Common growth lever for ${nicheById(b.niche)?.label.toLowerCase()}` });
  if (signals.length === 0) signals.push({ primary: ["web", "performance-ads", "seo"], secondary: [], weight: 1, reason: "General starting point: run an audit to sharpen this" });

  const scored = catalogue
    .map((s) => {
      let score = auditCodes.has(s.code) ? 6 : 0;
      // A business with no website needs the build itself first, ahead of services that merely touch the web.
      if (!b.website && /website|web build|web builds|redesign|next\.js/i.test(s.name)) score += 4;
      const why: string[] = auditCodes.has(s.code) ? ["Matched to gaps found in the website audit"] : [];
      for (const sig of signals) {
        if (s.tags.some((t) => sig.primary.includes(t))) {
          score += sig.weight;
          why.push(sig.reason);
        } else if (s.tags.some((t) => sig.secondary.includes(t))) {
          score += sig.weight * 0.3;
        }
      }
      return { s, score, why };
    })
    .filter((x) => x.score > 0)
    .sort((a, c) => c.score - a.score || a.s.code.localeCompare(c.s.code));

  // Keep the offer varied: at most 2 services per practice area, 6 in total.
  const perArea = new Map<string, number>();
  const picked: typeof scored = [];
  for (const x of scored) {
    const n = perArea.get(x.s.practiceArea) ?? 0;
    if (n >= 2) continue;
    perArea.set(x.s.practiceArea, n + 1);
    picked.push(x);
    if (picked.length === 6) break;
  }
  const ranked = picked.map(({ s, why }) => ({ code: s.code, name: s.name, practiceArea: s.practiceArea, why: why.length ? [...new Set(why)].slice(0, 2) : ["Supports the main fixes above"] }));

  return ranked;
}

export function buildPlan(b: BusinessDTO, catalogue: ServiceDef[], rates: Rates): Plan {
  const ranked = recommendServices(b, catalogue);
  const { currency, tiers } = tierPrices(b.country, rates.perUSD);
  const priced = tiers.map((t) => ({ ...t, display: formatMoney(t.monthly, currency), displayUSD: currency === "USD" ? "" : `≈ ${formatMoney(t.monthlyUSD, "USD")}` }));
  const rec = recommendTier(b);
  const silver = tiers[0];
  const websiteBuild = !b.website ? { amount: silver.monthly * websiteBuildMultiplier(), display: formatMoney(silver.monthly * websiteBuildMultiplier(), currency) } : null;

  const caveats = [
    "Starting suggestions from your own price list (data/pricing.json), not a market quote. Adjust after the discovery call.",
    rates.source === "live (ECB via frankfurter)" ? `Exchange rates: live, ${rates.asOf ?? "latest"}.` : "Exchange rates are built-in estimates (live feed unreachable).",
  ];
  if (!b.country) caveats.push("No country set on this business, so prices are shown in USD.");
  if (catalogue.length < 100) caveats.push("Service suggestions use the starter catalogue. Import your real 206-service list for exact matches.");

  return { services: ranked, currency, tiers: priced, recommendedTier: rec.tier, tierReason: rec.reason, websiteBuild, rates: { source: rates.source, asOf: rates.asOf }, caveats };
}

export { TIER_ORDER, TIER_LABEL };
