import { nicheById } from "@/lib/niches";

/**
 * Pre-audit opportunity score (0-100) for a discovered business. A full website audit later
 * replaces it with the audit-based score. Three parts, as in the brief:
 *  - Budget potential (0-40): niche value, +4 for an established review footprint
 *  - Urgency of gaps (0-35): no website, weak reputation, thin discoverability, no social presence
 *  - Reachability (0-25): direct phone, email, and a website to find a contact form on
 * Everything here is a heuristic from public listing data, and says so in the UI.
 */
export interface ProspectSignals {
  niche?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  googleRating?: number | null;
  reviewCount?: number | null;
  instagramUrl?: string | null;
  linkedinUrl?: string | null;
}

export type ProspectFlag = "NO_WEBSITE" | "LOW_RATING" | "FEW_REVIEWS" | "NO_PHONE" | "NO_SOCIAL";

export const FLAG_LABEL: Record<ProspectFlag, string> = {
  NO_WEBSITE: "Needs website",
  LOW_RATING: "Low rating",
  FEW_REVIEWS: "Few reviews",
  NO_PHONE: "No direct phone",
  NO_SOCIAL: "No social link found",
};

export function scoreProspect(s: ProspectSignals): { score: number; flags: ProspectFlag[]; breakdown: { budget: number; urgency: number; reach: number } } {
  const flags: ProspectFlag[] = [];

  let budget = nicheById(s.niche)?.value ?? 18;
  if ((s.reviewCount ?? 0) >= 200) budget += 4;
  budget = Math.min(40, budget);

  let urgency = 0;
  if (!s.website) {
    flags.push("NO_WEBSITE");
    urgency += 30;
  }
  if (s.googleRating != null && s.reviewCount != null && s.reviewCount >= 10 && s.googleRating < 4.0) {
    flags.push("LOW_RATING");
    urgency += 10;
  }
  if (s.reviewCount != null && s.reviewCount < 15) {
    flags.push("FEW_REVIEWS");
    urgency += 8;
  }
  if (!s.instagramUrl && !s.linkedinUrl) {
    flags.push("NO_SOCIAL");
    urgency += 5;
  }
  urgency = Math.min(35, urgency);

  let reach = 0;
  if (s.phone) reach += 12;
  else flags.push("NO_PHONE");
  if (s.email) reach += 8;
  if (s.website) reach += 5;
  reach = Math.min(25, reach);

  return { score: Math.max(0, Math.min(100, budget + urgency + reach)), flags, breakdown: { budget, urgency, reach } };
}
