import { analyseWebsite } from "./analyze";
import { computeGaps, matchServices, scoreAudit } from "./gaps";
import { baselineTechStack, generatePitch } from "./pitch";
import { searchConfigured, resolveOfficialWebsite } from "@/lib/search/providers";
import type { AuditResult, ServiceDef } from "@/lib/types";

export function looksLikeUrl(input: string): boolean {
  const t = input.trim();
  return /^https?:\/\//i.test(t) || /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(t);
}

export async function runAudit(args: {
  input: string;
  catalogue: ServiceDef[];
  monthlyBudget?: string | null;
}): Promise<AuditResult> {
  const warnings: string[] = [];
  const raw = args.input.trim();
  let businessName = raw;
  let website: string | null = null;

  if (looksLikeUrl(raw)) {
    website = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      const host = new URL(website).hostname.replace(/^www\./, "");
      businessName = host.split(".")[0].replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    } catch {
      /* keep raw */
    }
  } else if (searchConfigured()) {
    website = await resolveOfficialWebsite(raw);
    if (!website) warnings.push(`Could not find an official website for "${raw}". Enter the URL directly for a full audit.`);
  } else {
    warnings.push("Business name given without a website. Enter a URL, or configure a search key (TINYFISH_API_KEY, TAVILY_API_KEY or BRAVE_API_KEY) so the site can be looked up automatically.");
  }

  const baseline = website ? await analyseWebsite(website, businessName) : null;
  const gaps = baseline ? computeGaps(baseline) : [];
  const match = matchServices(gaps, args.catalogue, baseline);
  const topOpportunities = gaps.filter((g) => g.status !== "UNVERIFIABLE").slice(0, 5);
  const scores = scoreAudit(gaps, baseline);

  const { pitch, warnings: pitchWarnings } = await generatePitch(
    { businessName, website, baseline, gaps, match },
    args.monthlyBudget,
  );
  warnings.push(...pitchWarnings);

  return {
    businessName,
    website,
    baseline,
    gaps,
    topOpportunities,
    match,
    pitch,
    readinessScore: scores.readiness,
    opportunityScore: scores.opportunity,
    warnings,
  };
}

export { baselineTechStack };
