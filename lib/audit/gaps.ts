import type { Baseline, Gap, GapStatus, ServiceDef, ServiceMatchGroup } from "@/lib/types";

/**
 * Turns the public-markup baseline into ranked commercial gaps.
 *
 * Honesty rule: a gap is only CONFIRMED when the evidence is directly observable in public
 * markup or a measurement. Things that depend on private data (ad accounts, email flows,
 * Google Business Profile rank, social engagement) are LIKELY or UNVERIFIABLE and say so.
 */
export function computeGaps(b: Baseline): Gap[] {
  const gaps: Gap[] = [];
  const add = (g: Omit<Gap, "status"> & { status: GapStatus }) => gaps.push(g);

  if (b.fetchError && !b.finalUrl) {
    add({
      id: "site-unreachable",
      title: "Website could not be fetched",
      status: "CONFIRMED",
      evidence: `Fetch failed: ${b.fetchError}. Audit is limited to what could be measured.`,
      impact: "If the site is also unreachable for customers or ad traffic, every paid click is wasted.",
      weight: 100,
      tags: ["web", "security"],
      quickWin: true,
    });
    return gaps;
  }

  const p = b.performance;
  if (p.mobileScore !== null) {
    if (p.mobileScore < 50) {
      add({
        id: "mobile-speed",
        title: "Slow mobile load is likely suppressing paid-ad conversion",
        status: "CONFIRMED",
        evidence: `Mobile PageSpeed score ${p.mobileScore}/100${p.lcpSeconds !== null ? `, LCP ${p.lcpSeconds}s` : ""}${p.tbtMs !== null ? `, TBT ${p.tbtMs}ms` : ""}. ${p.note}`,
        impact: "Slow mobile pages waste ad spend: visitors leave before the page is usable, raising CPA.",
        weight: 90,
        tags: ["speed", "mobile", "cro", "web"],
        quickWin: true,
      });
    } else if (p.mobileScore < 80) {
      add({
        id: "mobile-speed",
        title: "Mobile performance has room to improve",
        status: "CONFIRMED",
        evidence: `Mobile PageSpeed score ${p.mobileScore}/100${p.lcpSeconds !== null ? `, LCP ${p.lcpSeconds}s` : ""}. ${p.note}`,
        impact: "Moderate speed drag on conversion and organic ranking.",
        weight: 55,
        tags: ["speed", "mobile", "seo"],
        quickWin: false,
      });
    }
  } else {
    add({
      id: "mobile-speed-unmeasured",
      title: "Mobile speed could not be measured",
      status: "UNVERIFIABLE",
      evidence: p.note,
      impact: "Run PageSpeed Insights manually before pitching a speed engagement.",
      weight: 10,
      tags: ["speed"],
      quickWin: false,
    });
  }

  if (!b.https) {
    add({
      id: "no-https",
      title: "Site is not served over HTTPS",
      status: "CONFIRMED",
      evidence: "Final URL does not use HTTPS.",
      impact: "Browser warnings and lost trust at checkout and on lead forms; a ranking and ad-quality negative.",
      weight: 85,
      tags: ["web", "security", "seo"],
      quickWin: true,
    });
  }
  if (!b.viewportMeta) {
    add({
      id: "no-viewport",
      title: "No mobile viewport tag",
      status: "CONFIRMED",
      evidence: "No <meta name=\"viewport\"> found in the page head.",
      impact: "Page renders as a shrunken desktop layout on phones, where most paid traffic lands.",
      weight: 80,
      tags: ["mobile", "web", "cro"],
      quickWin: true,
    });
  }

  const t = b.tracking;
  const anyPixel = t.metaPixel || t.googleAds || t.tiktokPixel || t.linkedinInsight;
  if (!t.ga4 && !t.gtm) {
    add({
      id: "no-analytics",
      title: "No analytics or tag manager detected in public markup",
      status: "LIKELY",
      evidence: "Neither GA4 (G-…) nor Google Tag Manager was found in the HTML. Tags injected server-side or after consent may not appear in a markup scan.",
      impact: "Without conversion tracking, ad spend cannot be optimised against revenue.",
      weight: 85,
      tags: ["tracking", "analytics"],
      quickWin: true,
    });
  } else if (!anyPixel) {
    add({
      id: "no-ad-pixels",
      title: "No ad pixels detected in public markup",
      status: t.gtm ? "UNVERIFIABLE" : "LIKELY",
      evidence: t.gtm
        ? "Tracking pixel not detected in public markup. A GTM container is present, so pixels may be loaded inside it and cannot be seen from outside."
        : "Tracking pixel not detected in public markup (Meta Pixel, Google Ads tag, TikTok, LinkedIn Insight). This does not prove they run no ads.",
      impact: "If paid campaigns run without pixels or CAPI, retargeting and optimisation signals are lost.",
      weight: t.gtm ? 35 : 70,
      tags: ["tracking", "meta-ads", "performance-ads", "analytics"],
      quickWin: true,
    });
  }
  if (t.metaPixel) {
    add({
      id: "capi-unverifiable",
      title: "Meta Conversions API status",
      status: "UNVERIFIABLE",
      evidence: "A browser Meta Pixel is present. Whether server-side Conversions API is configured cannot be seen from public markup.",
      impact: "Browser-only pixels lose a meaningful share of conversions to ad blockers and iOS privacy limits.",
      weight: 30,
      tags: ["tracking", "meta-ads"],
      quickWin: false,
    });
  }

  if (b.formCount === 0 && !b.widgets.whatsapp && !b.widgets.liveChat && !b.features?.booking) {
    add({
      id: "no-lead-capture",
      title: "No lead form, WhatsApp link or chat widget found on the page",
      status: "LIKELY",
      evidence: "The scanned page has no multi-field form, wa.me link or chat widget. Other pages may have them.",
      impact: "Visitors with buying intent have no low-friction way to enquire.",
      weight: 75,
      tags: ["lead-gen", "forms", "whatsapp", "automation", "crm"],
      quickWin: true,
    });
  } else {
    if (!b.widgets.whatsapp) {
      add({
        id: "no-whatsapp",
        title: "No WhatsApp entry point detected",
        status: "LIKELY",
        evidence: "No wa.me / WhatsApp API link in the scanned page.",
        impact: "WhatsApp is a leading enquiry channel in the UK/EU, Middle East, Latin America, Africa and South Asia (less so in the US and Canada), so its absence matters most for businesses selling in those markets.",
        weight: 30,
        tags: ["whatsapp", "automation", "lead-gen"],
        quickWin: true,
      });
    }
    if (!b.widgets.crm && b.formCount > 0) {
      add({
        id: "no-crm-integration",
        title: "Lead forms with no visible CRM / email platform",
        status: "UNVERIFIABLE",
        evidence: "Forms exist but no CRM or ESP script (HubSpot, Zoho, Klaviyo, Mailchimp) is visible. Forms may post to a back-end CRM.",
        impact: "Leads emailed to an inbox are followed up slowly and inconsistently.",
        weight: 30,
        tags: ["crm", "automation", "lead-gen"],
        quickWin: false,
      });
    }
  }

  if (b.ecommerce) {
    add({
      id: "abandoned-cart",
      title: "Automated abandoned-cart / re-engagement flows",
      status: "UNVERIFIABLE",
      evidence: "Storefront signals found, but email and WhatsApp flows run outside the site and cannot be inspected publicly. Ask during discovery.",
      impact: "Recovering even a small share of abandoned carts is typically the cheapest revenue available to a DTC brand.",
      weight: 60,
      tags: ["abandoned-cart", "email", "whatsapp", "lifecycle", "automation"],
      quickWin: true,
    });
  }

  // SEO
  if (!b.title) {
    add({ id: "no-title", title: "Missing page title", status: "CONFIRMED", evidence: "No <title> tag found.", impact: "Weak search snippets and unclear relevance for non-branded queries.", weight: 60, tags: ["seo", "technical-seo"], quickWin: true });
  } else if (b.title.length > 65 || b.title.length < 15) {
    add({ id: "title-length", title: "Title tag length is off", status: "CONFIRMED", evidence: `Title is ${b.title.length} characters ("${b.title.slice(0, 60)}${b.title.length > 60 ? "…" : ""}").`, impact: "Truncated or thin titles reduce click-through from search results.", weight: 25, tags: ["seo", "technical-seo"], quickWin: true });
  }
  if (!b.metaDescription) {
    add({ id: "no-meta-desc", title: "Missing meta description", status: "CONFIRMED", evidence: "No meta description on the scanned page.", impact: "Search engines write the snippet for you, usually worse than a deliberate pitch.", weight: 35, tags: ["seo", "technical-seo"], quickWin: true });
  }
  if (b.h1Count === 0) {
    add({ id: "no-h1", title: "No H1 heading on the page", status: "CONFIRMED", evidence: "Zero <h1> elements found.", impact: "Weak topical signal and poor page structure.", weight: 30, tags: ["seo", "technical-seo"], quickWin: true });
  }
  if (b.robotsNoindex) {
    add({ id: "noindex", title: "Page is marked noindex", status: "CONFIRMED", evidence: "meta robots contains noindex on the scanned page.", impact: "If unintended, the page cannot appear in search at all.", weight: 95, tags: ["seo", "technical-seo"], quickWin: true });
  }
  if (b.sitemap === "not_found") {
    add({ id: "no-sitemap", title: "No XML sitemap found", status: "CONFIRMED", evidence: "robots.txt lists no sitemap and /sitemap.xml did not return one.", impact: "Slower and less complete indexing of commercial pages.", weight: 35, tags: ["seo", "technical-seo"], quickWin: true });
  }
  const hasLocalSchema = b.structuredData.some((x) => /LocalBusiness|Organization|Store|Restaurant|ProfessionalService/i.test(x));
  if (!hasLocalSchema) {
    add({ id: "no-local-schema", title: "No Organization / LocalBusiness structured data", status: "CONFIRMED", evidence: `Structured data types found: ${b.structuredData.join(", ") || "none"}.`, impact: "Missed rich results and weaker local and entity signals.", weight: 50, tags: ["local-seo", "schema", "seo"], quickWin: false });
  }
  add({
    id: "gbp-rank",
    title: "Google Business Profile and local pack rank",
    status: "UNVERIFIABLE",
    evidence: "Local pack position depends on the searcher's location and cannot be measured from here. Check the Maps link in this audit.",
    impact: "High-intent local searches are often won or lost in the map pack.",
    weight: 40,
    tags: ["local-seo", "reviews"],
    quickWin: false,
  });
  if (b.imageCount > 0 && b.imagesMissingAlt / b.imageCount > 0.3) {
    add({ id: "alt-text", title: "Many images lack alt text", status: "CONFIRMED", evidence: `${b.imagesMissingAlt} of ${b.imageCount} images have no alt text.`, impact: "Lost image-search traffic and accessibility gaps.", weight: 20, tags: ["seo", "technical-seo"], quickWin: true });
  }

  // Social / video
  const socialLinks = Object.values(b.social).filter(Boolean).length;
  if (!b.social.instagram) {
    add({ id: "no-instagram", title: "No Instagram link on the website", status: "CONFIRMED", evidence: "The scanned page links to no Instagram profile.", impact: "Visitors cannot validate the brand socially; short-form discovery is not feeding the site.", weight: 40, tags: ["social", "video", "reels", "content"], quickWin: true });
  }
  add({
    id: "reels-strategy",
    title: "Organic video / Reels consistency versus competitors",
    status: "UNVERIFIABLE",
    evidence:
      socialLinks > 0
        ? `Social profiles linked: ${Object.entries(b.social).filter(([, v]) => v).map(([k]) => k).join(", ")}. Posting cadence and engagement require a manual look (platforms block automated reads).`
        : "No social links found to inspect. Posting cadence and engagement cannot be measured from here.",
    impact: "Consistent short-form video is the main low-cost discovery channel for consumer and increasingly B2B brands.",
    weight: 45,
    tags: ["video", "reels", "social", "content"],
    quickWin: false,
  });

  return gaps.sort((a, c) => c.weight - a.weight);
}

export function doNotPitch(b: Baseline): { area: string; reason: string }[] {
  const out: { area: string; reason: string }[] = [];
  if (b.performance.mobileScore !== null && b.performance.mobileScore >= 85) {
    out.push({ area: "Core Web Vitals / speed engineering", reason: `Mobile PageSpeed is already ${b.performance.mobileScore}/100. Pitching speed work here would burn trust.` });
  }
  if (b.tracking.ga4 && b.tracking.gtm) {
    out.push({ area: "Basic GA4 / GTM setup", reason: "GA4 and GTM are both present. Only pitch tracking if you find specific event or consent gaps in discovery." });
  }
  if (b.widgets.whatsapp && b.formCount > 0) {
    out.push({ area: "Basic lead-capture build", reason: "Forms and WhatsApp entry points already exist. Pitch qualification and routing improvements, not a rebuild." });
  }
  if (!b.ecommerce) {
    out.push({ area: "Abandoned-cart and checkout CRO", reason: "No storefront or cart signals found. Cart-recovery work is irrelevant to a non-transactional site." });
  }
  if (b.cms && /Shopify|WordPress|Webflow|Next\.js|Framer/i.test(b.cms.name) && b.viewportMeta && (b.performance.mobileScore ?? 0) >= 70) {
    out.push({ area: "Full website rebuild", reason: `The ${b.cms.name} site is mobile-ready and performs acceptably. Lead with targeted optimisation, not a rebuild.` });
  }
  if (b.structuredData.some((x) => /LocalBusiness|Organization/i.test(x)) && b.sitemap === "found") {
    out.push({ area: "Foundational technical SEO audit", reason: "Structured data and sitemap are in place. Position SEO around content and non-branded demand instead." });
  }
  return out;
}

export function matchServices(gaps: Gap[], catalogue: ServiceDef[], b: Baseline | null): ServiceMatchGroup {
  const used = new Set<string>();
  const quickWins: ServiceMatchGroup["quickWins"] = [];
  const coreGrowth: ServiceMatchGroup["coreGrowth"] = [];

  const actionable = gaps.filter((g) => g.status !== "UNVERIFIABLE" || g.weight >= 40);
  for (const gap of actionable) {
    // Score each service by tag overlap with the gap.
    const scored = catalogue
      .map((svc) => ({ svc, hits: svc.tags.filter((t) => gap.tags.includes(t)).length }))
      .filter((x) => x.hits > 0)
      .sort((a, c) => c.hits - a.hits || a.svc.code.localeCompare(c.svc.code));
    const top = scored.find((x) => !used.has(x.svc.code));
    if (!top) continue;
    used.add(top.svc.code);
    const because = `${gap.title} (${gap.status.toLowerCase()})`;
    if (gap.quickWin) quickWins.push({ service: top.svc, because });
    else coreGrowth.push({ service: top.svc, because });
  }

  return {
    quickWins: quickWins.slice(0, 6),
    coreGrowth: coreGrowth.slice(0, 6),
    doNotPitch: b ? doNotPitch(b) : [],
  };
}

export function scoreAudit(gaps: Gap[], b: Baseline | null): { readiness: number; opportunity: number } {
  if (!b) return { readiness: 0, opportunity: 0 };
  // Opportunity: how much commercial headroom exists (confirmed weighs full, likely half).
  const raw = gaps.reduce((sum, g) => sum + (g.status === "CONFIRMED" ? g.weight : g.status === "LIKELY" ? g.weight * 0.5 : g.weight * 0.15), 0);
  const opportunity = Math.max(0, Math.min(100, Math.round(raw / 4)));
  // Readiness: how ready the business is to buy/benefit - it has a working site and some stack to build on.
  let readiness = 30;
  if (b.finalUrl && !b.fetchError) readiness += 15;
  if (b.https) readiness += 5;
  if (b.tracking.ga4 || b.tracking.gtm) readiness += 10;
  if (b.tracking.metaPixel || b.tracking.googleAds) readiness += 10;
  if (b.ecommerce || b.formCount > 0) readiness += 10;
  if (Object.values(b.social).filter(Boolean).length >= 2) readiness += 10;
  if (b.widgets.crm) readiness += 10;
  return { readiness: Math.min(100, readiness), opportunity };
}
