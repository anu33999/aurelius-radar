import { TIER_LABEL, formatMoney, tierPrices, websiteBuildMultiplier, type TierKey } from "@/lib/pricing";
import { recommendTier } from "@/lib/leads/plan";
import type { BusinessDTO } from "@/lib/types";

export interface Quote {
  currency: string;
  tier: TierKey;
  tierLabel: string;
  monthly: number;
  monthlyDisplay: string;
  /** Approximate USD, empty when the currency is already USD. */
  usdDisplay: string;
  websiteBuild: number | null;
  websiteBuildDisplay: string | null;
  /** One-line summary, e.g. "Gold ₹50,000/mo + ₹75,000 website build". */
  summary: string;
}

/** Asking price for a prospect in its own country's currency, from the user's price list (data/pricing.json). Pure. */
export function quoteFor(b: Pick<BusinessDTO, "niche" | "reviewCount" | "website" | "country">, perUSD: Record<string, number>): Quote {
  const { currency, tiers } = tierPrices(b.country, perUSD);
  const rec = recommendTier(b);
  const t = tiers.find((x) => x.tier === rec.tier) ?? tiers[0];
  const silver = tiers[0];
  const build = !b.website ? silver.monthly * websiteBuildMultiplier() : null;
  const monthlyDisplay = `${formatMoney(t.monthly, currency)}/mo`;
  const websiteBuildDisplay = build != null ? formatMoney(build, currency) : null;
  return {
    currency,
    tier: t.tier,
    tierLabel: TIER_LABEL[t.tier],
    monthly: t.monthly,
    monthlyDisplay,
    usdDisplay: currency === "USD" ? "" : `≈ ${formatMoney(t.monthlyUSD, "USD")}/mo`,
    websiteBuild: build,
    websiteBuildDisplay,
    summary: `${TIER_LABEL[t.tier]} ${monthlyDisplay}${websiteBuildDisplay ? ` + ${websiteBuildDisplay} website build (one-off)` : ""}`,
  };
}
