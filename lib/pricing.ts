import raw from "@/data/pricing.json";

export type TierKey = "silver" | "gold" | "platinum";
export const TIER_ORDER: TierKey[] = ["silver", "gold", "platinum"];
export const TIER_LABEL: Record<TierKey, string> = { silver: "Silver", gold: "Gold", platinum: "Platinum" };

interface MarketCfg {
  currency: string;
  multiplier: number;
}
const cfg = raw as unknown as {
  globalUSD: Record<TierKey, number>;
  indiaINR: Record<TierKey, number>;
  websiteBuildMultiplier: number;
  markets: Record<string, MarketCfg>;
  defaultMarket: MarketCfg;
  fallbackPerUSD: Record<string, number>;
};

export interface Rates {
  perUSD: Record<string, number>;
  source: "live (ECB via frankfurter)" | "built-in fallback estimates";
  asOf: string | null;
}

export function marketFor(country: string | null | undefined): MarketCfg & { isIndia: boolean } {
  const m = (country && cfg.markets[country]) || cfg.defaultMarket;
  return { ...m, isIndia: country === "India" };
}

/** Round to a clean sales number (about 2-3 significant figures), never below 10. */
export function niceRound(n: number): number {
  if (n <= 0) return 0;
  const mag = Math.pow(10, Math.floor(Math.log10(n)) - 2);
  const step = mag * 5; // 1500 -> 50, 25,000 -> 500, 27,000 -> 500
  return Math.max(10, Math.round(n / step) * step);
}

export interface TierPrice {
  tier: TierKey;
  label: string;
  monthly: number;
  monthlyUSD: number;
}

export function tierPrices(country: string | null | undefined, perUSD: Record<string, number>): { currency: string; tiers: TierPrice[] } {
  const m = marketFor(country);
  const usdRate = perUSD[m.currency] ?? 1;
  const tiers = TIER_ORDER.map((tier) => {
    let monthly: number;
    if (m.isIndia) monthly = cfg.indiaINR[tier];
    else monthly = niceRound(cfg.globalUSD[tier] * m.multiplier * usdRate);
    const monthlyUSD = Math.round(monthly / usdRate / 10) * 10;
    return { tier, label: TIER_LABEL[tier], monthly, monthlyUSD };
  });
  return { currency: m.currency, tiers };
}

export const websiteBuildMultiplier = () => cfg.websiteBuildMultiplier;

let cache: { at: number; rates: Rates } | null = null;
const TTL = 12 * 3600 * 1000;

/** Live ECB rates (free, no key) cached for 12h; falls back to built-in estimates if unreachable. */
export async function getRates(): Promise<Rates> {
  if (cache && Date.now() - cache.at < TTL) return cache.rates;
  const wanted = Object.keys(cfg.fallbackPerUSD).filter((c) => c !== "USD" && c !== "AED");
  for (const base of ["https://api.frankfurter.dev/v1/latest", "https://api.frankfurter.app/latest"]) {
    try {
      const res = await fetch(`${base}?base=USD&symbols=${wanted.join(",")}`, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) continue;
      const data = (await res.json()) as { rates?: Record<string, number>; date?: string };
      if (!data.rates || Object.keys(data.rates).length < wanted.length - 1) continue;
      const rates: Rates = { perUSD: { ...cfg.fallbackPerUSD, ...data.rates, USD: 1, AED: 3.6725 }, source: "live (ECB via frankfurter)", asOf: data.date ?? null };
      cache = { at: Date.now(), rates };
      return rates;
    } catch {
      /* try next endpoint */
    }
  }
  return { perUSD: cfg.fallbackPerUSD, source: "built-in fallback estimates", asOf: null };
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString()}`;
  }
}
