import type { AuditResult, BusinessDTO } from "@/lib/types";

/**
 * "What they have / what they're missing", from facts we hold. Listing data only unless the business
 * has been audited, in which case website findings are added. "Missing" means "not found in the
 * source we checked", never proof that the business lacks it.
 */
export interface Snapshot {
  has: string[];
  missing: string[];
  fromAudit: boolean;
}

export function listingSnapshot(b: BusinessDTO): Snapshot {
  const has: string[] = [];
  const missing: string[] = [];
  if (b.website) has.push(`Website (${b.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "")})`);
  else missing.push("No website listed");
  if (b.phone) has.push("Phone number");
  else missing.push("No phone number listed");
  if (b.email) has.push("Email address");
  if (b.googleRating != null) has.push(`Google rating ${b.googleRating.toFixed(1)}★${b.reviewCount != null ? ` (${b.reviewCount} reviews)` : ""}`);
  if (b.flags.includes("LOW_RATING")) missing.push("Rating below 4.0 (reputation work needed)");
  if (b.flags.includes("FEW_REVIEWS")) missing.push("Few Google reviews");
  if (b.instagramUrl) has.push("Instagram page");
  if (b.linkedinUrl) has.push("LinkedIn page");
  if (b.flags.includes("NO_SOCIAL") && !b.instagramUrl && !b.linkedinUrl) missing.push("No Instagram or LinkedIn link found");
  return { has, missing, fromAudit: false };
}

export function snapshotWithAudit(b: BusinessDTO, audit: AuditResult | null): Snapshot {
  const base = listingSnapshot(b);
  const bl = audit?.baseline;
  if (!audit || !bl || bl.fetchError) return base;
  const has = [...base.has];
  const missing = [...base.missing];
  if (bl.cms) has.push(`${bl.cms.name} site`);
  if (bl.ecommerce) has.push("Online store");
  if (bl.tracking.metaPixel) has.push("Meta Pixel detected");
  if (bl.tracking.ga4) has.push("Google Analytics 4 detected");
  if (bl.tracking.gtm) has.push("Google Tag Manager detected");
  if (bl.widgets.whatsapp) has.push("WhatsApp contact");
  if (bl.widgets.liveChat) has.push(`Live chat (${bl.widgets.liveChat})`);
  if (bl.formCount > 0) has.push("Contact/enquiry form");
  if (bl.performance.mobileScore != null) has.push(`Mobile speed score ${bl.performance.mobileScore}`);
  for (const g of audit.gaps) {
    if (g.status === "UNVERIFIABLE") continue;
    missing.push(`${g.title}${g.status === "LIKELY" ? " (likely)" : ""}`);
  }
  return { has, missing: [...new Set(missing)].slice(0, 10), fromAudit: true };
}
