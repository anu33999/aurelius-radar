/**
 * Offline self-test for the pure logic (no database, network or API keys needed).
 * Run: npm run selftest
 */
import assert from "node:assert/strict";
import { classifyByRules, matchServiceCodes, tagsFromText } from "../lib/ai/classify-intent";
import { applyHtmlSignals } from "../lib/audit/analyze";
import { computeGaps, matchServices, scoreAudit } from "../lib/audit/gaps";
import { generatePitch } from "../lib/audit/pitch";
import { assertPublicHost, normaliseUrl } from "../lib/audit/safe-fetch";
import { buildQuery, matchesWebsiteMode } from "../lib/search/overpass";
import { extractContacts } from "../lib/enrich/contacts";
import { sameBusinessName } from "../lib/search/places";
import { phoneFrom, pickPhone } from "../lib/enrich/web-phone";
import { buildTinyfishUrl, withSiteOperators } from "../lib/search/providers";
import { niceRound, tierPrices } from "../lib/pricing";
import { scoreProspect } from "../lib/leads/score";
import { buildPlan } from "../lib/leads/plan";
import { buildKit } from "../lib/leads/kit";
import { composeColdEmail, composeFollowUp, DEFAULT_PROFILE, findingsFor } from "../lib/email/compose";
import { addBusinessDays } from "../lib/email/inbox";
import { emailFitsBusiness } from "../lib/email/pipeline";
import { isGmailBlock, skippedCountries } from "../lib/email/send";
import { emailsInHtml, pickEmailFromHits, pickOwnEmail } from "../lib/enrich/email-finder";
import { readResearch } from "../lib/email/research";
import { gmailLink, internationalDigits, waLink } from "../lib/outreach";
import { needsFollowUp } from "../components/CrmTab";
import { authorFrom, canonicalUrl, dateFromUrl } from "../lib/search/social-radar";
import { parseCatalogue } from "../lib/services/catalogue-import";
import { STARTER_CATALOGUE } from "../lib/services/starter-catalogue";
import { COUNTRIES, HUBS, nearestHub } from "../lib/hubs";
import type { AuditResult, Baseline } from "../lib/types";

let passed = 0;
const t = async (name: string, fn: () => void | Promise<void>) => {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    console.error(`FAIL  ${name}\n      ${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
  }
};

const blank = (): Baseline => ({
  inputUrl: "https://shop.example.com", finalUrl: "https://shop.example.com/", fetchedAt: new Date().toISOString(), httpStatus: 200, fetchError: null,
  https: true, cms: null, viewportMeta: false, title: null, metaDescription: null, h1Count: 0, canonical: false, robotsNoindex: false,
  sitemap: "not_found", structuredData: [],
  tracking: { metaPixel: false, gtm: false, ga4: false, googleAds: false, tiktokPixel: false, linkedinInsight: false, heatmap: null },
  widgets: { liveChat: null, whatsapp: false, crm: null }, formCount: 0, ecommerce: false,
  social: { instagram: null, linkedin: null, x: null, youtube: null, facebook: null },
  performance: { source: "PageSpeed Insights", mobileScore: 32, lcpSeconds: 6.1, cls: 0.2, tbtMs: 900, note: "Lab data." },
  pageWeightKb: 400, scriptCount: 30, imageCount: 10, imagesMissingAlt: 8,
  links: { metaAdLibrary: "", googleAdsTransparency: "", googleMaps: "" },
});

async function main() {
  console.log("Intent classifier (rules)");
  const c = (title: string, content = "") => classifyByRules({ platform: "REDDIT", title, content, url: "" });
  await t("buyer: looking for an agency", () => assert.equal(c("Looking for a digital marketing agency for my D2C brand").category, "BUYER_HIRING"));
  await t("buyer: recommend a developer", () => assert.equal(c("Can anyone recommend a good web developer for our Shopify redesign?").category, "BUYER_HIRING"));
  await t("buyer: hiring social media manager", () => assert.equal(c("Hiring a social media manager for our clinic").category, "BUYER_HIRING"));
  await t("advice: traffic but no sales", () => assert.equal(c("We get traffic but no sales, why?").category, "ADVICE_SEEKING"));
  await t("reject: freelancer self-promo", () => assert.equal(c("[FOR HIRE] I will build your Shopify store, DM me for rates").category, "REJECT"));
  await t("reject: agency promo", () => assert.equal(c("We offer full-service digital marketing. Book a free audit").category, "REJECT"));
  await t("reject: job hunter", () => assert.equal(c("Fresher looking for a job in digital marketing, open to opportunities").category, "REJECT"));
  const sellers = [
    "I'm a freelance digital marketer helping brands grow. DM me for rates",
    "We help ecommerce brands scale with Meta ads. Book a free audit today",
    "Looking for clients! I build websites and run SEO for small businesses",
    "Our agency offers web design, SEO and social media management. Packages starting at $499",
    "Hey founders, struggling with low conversions? I can help you fix your funnel. Check out my portfolio",
    "Top 10 best digital marketing agencies in London 2026",
    "We're hiring a social media manager. Full-time position, apply now",
    "5 tips to fix your landing page conversion rate 🧵",
    "[FOR HIRE] Shopify developer available for projects",
    "Accepting new clients this month, limited slots available. Whatsapp me for details",
    "I run a web design agency and we have 3 slots open for new projects",
    "Agency owner here. We specialize in performance ads for D2C brands, happy to help",
  ];
  sellers.forEach((txt, i) => {
    t(`reject seller #${i + 1}`, () => assert.equal(c(txt).category, "REJECT", txt));
  });
  const buyers = [
    "Need a marketing agency for my SaaS startup, any recommendations?",
    "Looking for someone to run Meta ads for our clothing store. Budget is flexible.",
    "Can anyone recommend a good web developer for our Shopify redesign?",
    "We get traffic but no sales on our store, my ads aren't working. What are we doing wrong?",
    "Hiring a freelancer to set up marketing automation (Zapier + HubSpot) for my consultancy",
  ];
  buyers.forEach((txt, i) => {
    t(`keep buyer #${i + 1}`, () => assert.notEqual(c(txt).category, "REJECT", txt));
  });
  await t("reject: unrelated", () => assert.equal(c("What is your favourite coffee?").category, "REJECT"));

  console.log("Service tagging and matching");
  await t("tags from text", () => {
    const tags = tagsFromText("Need a Shopify website and Meta ads, conversion rate is low");
    for (const x of ["web", "performance-ads", "cro"]) assert.ok(tags.includes(x), `missing ${x}`);
  });
  await t("matchServiceCodes returns catalogue codes", () => {
    const codes = matchServiceCodes(["performance-ads"], STARTER_CATALOGUE);
    assert.ok(codes.length > 0 && codes.every((x) => STARTER_CATALOGUE.some((s) => s.code === x)));
  });

  console.log("Social radar helpers");
  await t("canonicalUrl strips query/www/old and twitter->x", () => {
    assert.equal(canonicalUrl("https://old.reddit.com/r/smallbusiness/comments/abc123/title_here/?utm=1"), "https://reddit.com/r/smallbusiness/comments/abc123");
    assert.equal(canonicalUrl("https://twitter.com/foo/status/123?s=20"), "https://x.com/foo/status/123");
  });
  await t("X snowflake date", () => {
    const d = dateFromUrl("TWITTER", "https://x.com/someone/status/1234567890123456789");
    assert.ok(d && d.getUTCFullYear() === 2020, `got ${d?.toISOString()}`);
    const recent = dateFromUrl("TWITTER", "https://x.com/someone/status/1850000000000000000");
    assert.ok(recent && recent.getUTCFullYear() === 2024);
  });
  await t("LinkedIn activity id date", () => {
    const d = dateFromUrl("LINKEDIN", "https://www.linkedin.com/posts/jane-doe_hiring-activity-7123456789012345678-AbCd");
    assert.ok(d && d.getUTCFullYear() >= 2023 && d.getUTCFullYear() <= 2026, `got ${d?.toISOString()}`);
  });
  await t("author extraction", () => {
    assert.equal(authorFrom("TWITTER", "https://x.com/acme_ceo/status/1", ""), "@acme_ceo");
    assert.equal(authorFrom("LINKEDIN", "https://www.linkedin.com/posts/jane-doe_x-activity-1", ""), "jane doe");
  });

  console.log("Audit: HTML signals, gaps, matching, pitch");
  const weak = blank();
  applyHtmlSignals(weak, `<html><head><title>Hi</title></head><body><h2>Shop</h2><a href="/cart">cart</a><img src=a.jpg><img src=b.jpg alt="x"></body></html>`, "https://shop.example.com");
  await t("detects missing viewport/meta and storefront", () => {
    assert.equal(weak.viewportMeta, false);
    assert.equal(weak.metaDescription, null);
    assert.equal(weak.ecommerce, true);
    assert.equal(weak.imagesMissingAlt, 1);
  });
  const strong = blank();
  applyHtmlSignals(strong, `<html><head><title>Acme Roasters | Specialty Coffee in Hyderabad</title><meta name="viewport" content="width=device-width"><meta name="description" content="Fresh coffee."><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"LocalBusiness"}]}</script><script src="https://www.googletagmanager.com/gtag/js?id=G-ABC123XYZ"></script><script>fbq('init','1')</script></head><body><h1>Acme</h1><a href="https://www.instagram.com/acme">ig</a><a href="https://wa.me/919999999999">wa</a><form><input><input></form></body></html>`, "https://acme.example.com");
  await t("detects tracking, schema, social, whatsapp, forms", () => {
    assert.equal(strong.tracking.ga4, true);
    assert.equal(strong.tracking.metaPixel, true);
    assert.ok(strong.structuredData.includes("LocalBusiness"));
    assert.ok(strong.social.instagram);
    assert.equal(strong.widgets.whatsapp, true);
    assert.equal(strong.widgets.whatsappNumber, "919999999999");
    assert.equal(strong.formCount, 1);
  });

  weak.tracking = { ...weak.tracking };
  const gaps = computeGaps(weak);
  await t("weak site: confirmed speed + viewport gaps ranked high", () => {
    const ids = gaps.map((g) => g.id);
    assert.ok(ids.includes("mobile-speed") && ids.includes("no-viewport"));
    assert.equal(gaps.find((g) => g.id === "mobile-speed")?.status, "CONFIRMED");
  });
  await t("pixel absence is LIKELY, never CONFIRMED", () => {
    const g = gaps.find((x) => x.id === "no-ad-pixels" || x.id === "no-analytics");
    assert.ok(g && g.status !== "CONFIRMED");
    assert.match(g!.evidence, /not detected in public markup|couldn't|not found|were found|Neither GA4/i);
  });
  await t("GTM present -> pixel gap is UNVERIFIABLE", () => {
    const b = blank();
    b.tracking.gtm = true;
    b.tracking.ga4 = true;
    const g = computeGaps(b).find((x) => x.id === "no-ad-pixels");
    assert.equal(g?.status, "UNVERIFIABLE");
  });
  await t("abandoned-cart only for storefronts, and unverifiable", () => {
    assert.equal(gaps.find((g) => g.id === "abandoned-cart")?.status, "UNVERIFIABLE");
    assert.equal(computeGaps(strong).some((g) => g.id === "abandoned-cart"), false);
  });
  const match = matchServices(gaps, STARTER_CATALOGUE, weak);
  await t("service match groups populated, no duplicates", () => {
    assert.ok(match.quickWins.length > 0);
    const codes = [...match.quickWins, ...match.coreGrowth].map((m) => m.service.code);
    assert.equal(new Set(codes).size, codes.length);
  });
  await t("do-not-pitch: fast site is excluded from speed pitch", () => {
    const fast = blank();
    fast.performance.mobileScore = 95;
    assert.ok(matchServices(computeGaps(fast), STARTER_CATALOGUE, fast).doNotPitch.some((d) => /speed|Web Vitals/i.test(d.area)));
  });
  await t("scores within 0-100; weak site has more opportunity", () => {
    const a = scoreAudit(gaps, weak);
    const b = scoreAudit(computeGaps(strong), strong);
    assert.ok(a.opportunity >= 0 && a.opportunity <= 100 && a.readiness <= 100);
    assert.ok(a.opportunity > b.opportunity, `${a.opportunity} vs ${b.opportunity}`);
  });
  await t("pitch (template): has all assets, honest score, no invented price", async () => {
    const { pitch } = await generatePitch({ businessName: "Shop Example", website: "https://shop.example.com", baseline: weak, gaps, match });
    assert.equal(pitch.generatedBy, "TEMPLATE");
    assert.ok(pitch.coldEmail.body.includes("Shop Example") && pitch.whatsapp && pitch.linkedinInMail && pitch.coldCallScript);
    assert.ok(pitch.discoveryQuestions.length >= 6);
    assert.match(pitch.proposal.commercials, /No figure has been assumed/);
    const proof = pitch.score.rubric.find((r) => r.criterion === "Commercial proof");
    assert.equal(proof?.points, 0, "placeholder proof (TODO) must earn no points");
    assert.equal(pitch.score.total, pitch.score.rubric.reduce((s, r) => s + r.points, 0));
    assert.ok(!/₹|\$\d|Rs\.? ?\d/.test(pitch.coldEmail.body), "template must not invent prices");
  });

  console.log("Catalogue import");
  await t("JSON array", () => {
    const s = parseCatalogue(JSON.stringify([{ code: "X-1", name: "Meta Ads", division: "Paid media" }, { code: "X-2", name: "Technical SEO audit", division: "SEO" }, { code: "X-3", name: "Shopify build", division: "Technology" }]));
    assert.equal(s.length, 3);
    assert.ok(s[0].tags.includes("performance-ads") || s[0].tags.includes("meta-ads"));
  });
  await t("CSV with quoted commas", () => {
    const s = parseCatalogue(`code,name,practice area,description\nA-1,"Email, lifecycle flows",Digital marketing,"Welcome, win-back"\nA-2,Local SEO,SEO,GBP\nA-3,Reels,Production,video`, "x.csv");
    assert.equal(s.length, 3);
    assert.equal(s[0].name, "Email, lifecycle flows");
  });
  await t("HTML with embedded JSON", () => {
    const html = `<html><body><script>const DATA = {"divisions":[{"name":"SEO","services":[{"code":"S1","name":"Technical SEO"},{"code":"S2","name":"Local SEO"},{"code":"S3","name":"Schema markup"}]}]};</script></body></html>`;
    assert.equal(parseCatalogue(html, "arch.html").length, 3);
  });

  console.log("SSRF guard");
  for (const host of ["localhost", "127.0.0.1", "10.0.0.5", "192.168.1.1", "169.254.169.254", "172.16.0.1", "[::1]", "foo.internal"]) {
    await t(`blocks ${host}`, async () => {
      await assert.rejects(() => assertPublicHost(host));
    });
  }
  await t("normaliseUrl adds https and rejects other schemes", () => {
    assert.equal(normaliseUrl("example.com"), "https://example.com/");
    assert.throws(() => normaliseUrl("file:///etc/passwd"));
    assert.throws(() => normaliseUrl("ftp://example.com"));
  });

  console.log("TinyFish provider");
  await t("buildTinyfishUrl maps recency and site operators", () => {
    const u = new URL(buildTinyfishUrl("need a web agency", { includeDomains: ["reddit.com"], timeRange: "week" }));
    assert.equal(u.origin, "https://api.search.tinyfish.ai");
    assert.equal(u.searchParams.get("recency_minutes"), "10080");
    assert.equal(u.searchParams.get("query"), "(site:reddit.com) need a web agency");
    assert.equal(new URL(buildTinyfishUrl("x", { timeRange: "day" })).searchParams.get("recency_minutes"), "1440");
    assert.equal(new URL(buildTinyfishUrl("x", {})).searchParams.has("recency_minutes"), false);
  });
  await t("withSiteOperators leaves queries that already use site:", () => {
    assert.equal(withSiteOperators("site:x.com hiring", ["x.com"]), "site:x.com hiring");
    assert.equal(withSiteOperators("q", ["a.com", "b.com"]), "(site:a.com OR site:b.com) q");
  });

  console.log("Pricing, plan and outreach kit");
  const fx = { USD: 1, GBP: 0.8, EUR: 0.9, AED: 3.6725, INR: 84, CAD: 1.4, AUD: 1.5, SGD: 1.3, NZD: 1.6, ZAR: 18 };
  await t("niceRound gives clean numbers", () => {
    assert.equal(niceRound(1500), 1500);
    assert.equal(niceRound(1163), 1150);
    assert.equal(niceRound(27300), 27500);
  });
  await t("prices are in the prospect's own currency", () => {
    const uk = tierPrices("United Kingdom", fx);
    assert.equal(uk.currency, "GBP");
    assert.equal(uk.tiers[0].monthly, 1200); // 1500 * 0.8
    const ae = tierPrices("United Arab Emirates", fx);
    assert.equal(ae.currency, "AED");
    assert.ok(Math.abs(ae.tiers[0].monthly - 5500) <= 50);
    const us = tierPrices("United States", fx);
    assert.deepEqual(us.tiers.map((x) => x.monthly), [1500, 3000, 5000]);
    const india = tierPrices("India", fx);
    assert.equal(india.currency, "INR");
    assert.deepEqual(india.tiers.map((x) => x.monthly), [25000, 50000, 100000]);
    assert.equal(tierPrices(null, fx).currency, "USD");
    assert.equal(tierPrices("Atlantis", fx).currency, "USD");
  });
  const base = {
    id: "x", name: "Test Dental", industry: "Dental & implant clinics", website: null as string | null, phone: "+44 20 7946 0123", email: null, address: null,
    city: "London", locality: null, state: null, country: "United Kingdom", latitude: 51.5, longitude: -0.12, niche: "dental", googleRating: 3.8 as number | null,
    reviewCount: 40 as number | null, googlePlaceId: null, instagramUrl: null, linkedinUrl: null, whatsapp: null as string | null, phoneSource: null as string | null, emailSource: null as string | null, flags: ["NO_WEBSITE", "LOW_RATING", "NO_SOCIAL"], shortlisted: false, lastContactedAt: null as string | null,
    source: "OSM", estimatedRevenue: null, techStack: null, pipelineStage: "LEAD" as const, priority: "MEDIUM" as const, monthlyBudget: null, notes: null, pitchSummary: null,
    matchedServiceIds: [] as string[], readinessScore: null, opportunityScore: null, lastAuditedAt: null, emailedAt: null as string | null, emailStatus: null as string | null, repliedAt: null as string | null, followUpSentAt: null as string | null, createdAt: "", updatedAt: "", noteCount: 0,
  };
  const rates = { perUSD: fx, source: "built-in fallback estimates" as const, asOf: null };
  await t("plan recommends web + local SEO for a dental clinic with no website, priced in GBP", () => {
    const plan = buildPlan(base, STARTER_CATALOGUE, rates);
    assert.equal(plan.currency, "GBP");
    assert.ok(plan.services.length > 0 && plan.services.length <= 6);
    assert.ok(plan.websiteBuild && plan.websiteBuild.amount === 2400);
    assert.equal(plan.recommendedTier, "silver"); // no website => earlier-stage, open at Silver + build
    const est = buildPlan({ ...base, website: "https://lumen.example", flags: [], reviewCount: 250, googleRating: 4.6 }, STARTER_CATALOGUE, rates);
    assert.equal(est.recommendedTier, "gold"); // established high-ticket niche
    assert.equal(est.websiteBuild, null);
    assert.ok(plan.services[0].why.some((w) => /website/i.test(w)), "top pick for a site-less business should be about the website");
    assert.ok(plan.services.every((x) => x.why.length > 0));
  });
  await t("kit only states facts we hold and never promises results", () => {
    const plan = buildPlan(base, STARTER_CATALOGUE, rates);
    const kit = buildKit(base, plan, "Aritra", "Kreatif Atelier");
    assert.match(kit.whatsapp, /couldn't find a website/);
    assert.ok(!/guarantee|\d+% |10x|double your/i.test(JSON.stringify(kit)));
    assert.ok(kit.battleCard.length >= 5 && kit.proposal.includes("GBP") === false);
    assert.match(kit.proposal, /£/);
  });
  await t("prospect score rewards reachable, high-value, under-served businesses", () => {
    const hi = scoreProspect({ niche: "dental", website: null, phone: "+1 212 555 0100", reviewCount: 250, googleRating: 3.7 });
    const lo = scoreProspect({ niche: "cafe", website: "https://x.com", phone: null, reviewCount: 500, googleRating: 4.8, instagramUrl: "https://instagram.com/x" });
    assert.ok(hi.score > lo.score);
    assert.ok(hi.flags.includes("NO_WEBSITE") && hi.flags.includes("LOW_RATING"));
  });
  await t("Gmail drafts: valid address only, subject and body encoded", () => {
    const g = gmailLink("hello@cafe.in", "Quick idea & more", "Line 1\nLine 2") as string;
    assert.ok(g.startsWith("https://mail.google.com/mail/?view=cm&fs=1&to=hello%40cafe.in"));
    assert.ok(g.includes("su=Quick+idea+%26+more") && g.includes("body=Line+1%0ALine+2"));
    assert.equal(gmailLink("not-an-email"), null);
    assert.equal(gmailLink(null), null);
  });

  await t("WhatsApp links need a safe country code", () => {
    assert.equal(internationalDigits("+44 20 7946 0123"), "442079460123");
    assert.equal(internationalDigits("020 7946 0123", "United Kingdom"), "442079460123");
    assert.equal(internationalDigits("020 7946 0123", null), null);
    assert.ok(waLink("+91 98765 43210", "Hi there")?.startsWith("https://wa.me/919876543210?text=Hi%20there"));
  });
  await t("48h follow-up rule", () => {
    const now = Date.now();
    const h = (n: number) => new Date(now - n * 3600000).toISOString();
    assert.equal(needsFollowUp({ ...base, pipelineStage: "PITCH_SENT", lastContactedAt: h(60) }, now), true);
    assert.equal(needsFollowUp({ ...base, pipelineStage: "PITCH_SENT", lastContactedAt: h(10) }, now), false);
    assert.equal(needsFollowUp({ ...base, pipelineStage: "LEAD", lastContactedAt: null }, now), false);
    assert.equal(needsFollowUp({ ...base, pipelineStage: "CLOSED_WON", lastContactedAt: null }, now), false);
  });

  console.log("Hubs");
  await t("nearestHub labels Midtown Manhattan coordinates", () => assert.equal(nearestHub(40.7549, -73.984)?.name, "New York"));
  await t("nearestHub returns null in the middle of the ocean", () => assert.equal(nearestHub(0, -30), null));
  await t("markets are international, unique and have valid coordinates", () => {
    assert.ok(COUNTRIES.length >= 10);
    assert.equal(new Set(HUBS.map((h) => h.name)).size, HUBS.length);
    for (const h of HUBS) assert.ok(Math.abs(h.lat) <= 90 && Math.abs(h.lng) <= 180 && h.radiusM > 0, h.name);
    // Every market needs a real time zone for the world clock (an invalid one throws here).
    for (const h of HUBS) assert.ok(h.tz && new Intl.DateTimeFormat("en", { timeZone: h.tz }).format(0), h.name);
    assert.ok(HUBS.some((h) => h.region !== "India") && HUBS.filter((h) => h.region === "India").length < HUBS.length / 2);
  });

  await t("Google match: names must agree (chains' other branches are rejected by distance in lookupPlace)", () => {
    assert.ok(sameBusinessName("Cafe Coffee Day", "Café Coffee Day - Koregaon Park"));
    assert.ok(sameBusinessName("Tata Motors Ltd", "Tata Motors Limited Plant"));
    assert.ok(!sameBusinessName("Blue Tokai Coffee", "Starbucks Coffee"));
    assert.ok(!sameBusinessName("", "Anything"));
  });

  await t("web-search phones: same business, valid number, chains need the branch's area", () => {
    const b = { name: "Blue Tokai Coffee Roasters", city: "Pune", country: "India", locality: "Koregaon Park", address: null };
    const hit = (title: string, content: string) => ({ title, content, url: "https://x.test", publishedDate: null });
    assert.equal(phoneFrom("2024-11-05", "India"), null);
    assert.equal(phoneFrom("8888888888", "India"), null);
    assert.equal(phoneFrom("+91 92059 31188", "India"), "+919205931188");
    assert.equal(phoneFrom("020 7253 3232", "United Kingdom"), "+442072533232");
    assert.equal(phoneFrom("+44 20 3932 11000", "United Kingdom"), null);
    assert.equal(phoneFrom("020 8124 613", "United Kingdom"), null);
    assert.equal(pickPhone(b, [hit("Blue Tokai Coffee Roasters | Pune", "Call +91 92059 31188")]), "+919205931188");
    assert.equal(pickPhone(b, [hit("Starbucks Pune", "Call +91 92059 31188")]), null);
    const chain = [hit("Blue Tokai Coffee Roasters | Aeromall", "Phone +91 92059 31188"), hit("Blue Tokai Coffee Roasters | KOPA Mall", "Koregaon Park Pune 411001. +918796554602")];
    assert.equal(pickPhone(b, chain), "+918796554602");
    assert.equal(pickPhone({ ...b, locality: null }, chain), null);
  });

  await t("website contacts: only explicit tel/mailto/schema/WhatsApp sources", () => {
    const html = `<a href="tel:+91%2098765%2043210">Call</a><a href="mailto:hello@cafe.in">Mail</a>
      <script type="application/ld+json">{"telephone":"+44 20 7946 0958"}</script>
      <a href="https://wa.me/919876543210">WA</a><a href="/contact-us">Contact</a>
      <p>Order 2024-11-05 12345678, call us maybe</p><img src="logo@2x.png">`;
    const c = extractContacts(html);
    assert.equal(c.phone, "+91 98765 43210");
    assert.equal(c.email, "hello@cafe.in");
    assert.equal(c.whatsapp, "+919876543210");
    assert.equal(c.contactUrl, "/contact-us");
    const none = extractContacts("<p>Call 020 7946 0958 or write to us</p><a href=\"mailto:you@example.com\">x</a>");
    assert.equal(none.phone, null);
    assert.equal(none.email, null);
  });

  await t("website modes: query + filter find no-website / no-social businesses", () => {
    const hub = HUBS[0];
    assert.ok(buildQuery(hub, 50, null, "without").includes('[!"website"]'));
    assert.ok(buildQuery(hub, 50, null, "any").includes('["amenity"'));
    assert.ok(!buildQuery(hub, 50, null, "any").includes('["website"]'));
    assert.ok(buildQuery(hub, 50, null, "bare").includes('[!"contact:instagram"]'));
    assert.ok(buildQuery(hub, 50, null, "with").includes('["website"]'));
    assert.equal(matchesWebsiteMode({ website: null, instagramUrl: null }, "bare"), true);
    assert.equal(matchesWebsiteMode({ website: null, instagramUrl: "x" }, "bare"), false);
    assert.equal(matchesWebsiteMode({ website: "a.com" }, "without"), false);
    assert.equal(matchesWebsiteMode({ website: "a.com" }, "any"), true);
  });

  await t("cold email: short, one verified opportunity, three areas, one-page plan, no prices, opt-out", () => {
    const prices = { starting: "£1,500/month", website: "£2,400" };
    const e = composeColdEmail(base, null, DEFAULT_PROFILE, prices);
    assert.ok(e.body.includes("I couldn't find a website for Test Dental"));
    assert.ok(!/losing|costing you|revenue/i.test(e.body), "no assumed losses");
    assert.ok(e.body.includes("I'm Anwesha Mulge, founder of Kreatif Atelier"));
    assert.ok(e.body.includes("For Test Dental, I'd explore three areas:"));
    assert.equal(e.body.split("\n").filter((l) => l.startsWith("- ")).length, 3);
    assert.ok(e.body.includes("high-quality work at cost-effective prices"));
    assert.ok(e.body.includes("one-page plan outlining three opportunities specifically for Test Dental"));
    const words = e.body.split("Best regards,")[0].split(/\s+/).filter(Boolean).length;
    assert.ok(words <= 220, `about 150 words before the signature (got ${words})`);
    assert.ok(!e.body.includes("£1,500") && !e.body.includes("£2,400"), "no prices in the email");
    assert.ok(e.body.includes("no thanks"));
    assert.ok(!/!|amazing|guarantee|low[- ]cost|cheap/i.test(e.body + e.subject));
    // Packaging project is proof for manufacturers only.
    assert.ok(!e.body.includes("Recently, we rebuilt the website"));
    assert.ok(composeColdEmail({ ...base, niche: "factory", industry: "Manufacturing" }, null, DEFAULT_PROFILE, prices).body.includes("Recently, we rebuilt the website"));
    const withQuote = composeColdEmail(base, null, { ...DEFAULT_PROFILE, testimonial: '"Great work." — Asha, Test Co' }, prices);
    assert.ok(withQuote.body.includes('As one of our clients put it: "Great work." — Asha, Test Co'));
    assert.equal(composeColdEmail(base, null, DEFAULT_PROFILE, prices).body, e.body);
  });

  await t("cold email: acknowledges what the site already has and never suggests it again", () => {
    const html = `<html><head><title>Cafe</title><meta name="viewport" content="width=device-width"></head><body><h1>Cafe</h1><a href="https://www.opentable.co.uk/r/x">Book a table</a>
      <p>Private hire and events</p><form><input name="a"><input name="b"></form><a href="/menu">Menu</a><p>Subscribe to our newsletter</p></body></html>`;
    const bl: Baseline = { inputUrl: "https://cafe.example", finalUrl: "https://cafe.example", fetchedAt: "", httpStatus: 200, fetchError: null, https: true, cms: null, viewportMeta: true, title: null, metaDescription: null, h1Count: 0, canonical: false, robotsNoindex: false, sitemap: "found", structuredData: [], tracking: { metaPixel: false, gtm: false, ga4: false, googleAds: false, tiktokPixel: false, linkedinInsight: false, heatmap: null }, widgets: { liveChat: null, whatsapp: false, crm: null }, formCount: 0, ecommerce: false, social: { instagram: null, linkedin: null, x: null, youtube: null, facebook: null }, performance: { source: "unavailable", mobileScore: 90, lcpSeconds: null, cls: null, tbtMs: null, note: "" }, pageWeightKb: null, scriptCount: 0, imageCount: 0, imagesMissingAlt: 0, links: { metaAdLibrary: "", googleAdsTransparency: "", googleMaps: "" } };
    applyHtmlSignals(bl, html, "https://cafe.example");
    assert.equal(bl.features?.booking, "OpenTable");
    assert.ok(bl.features?.events && bl.features.newsletter && bl.features.menu);
    const gaps = computeGaps(bl);
    assert.ok(!gaps.some((g) => g.id === "no-lead-capture"), "a booking link counts as a way to get in touch");
    const cafe = { ...base, name: "Test Cafe", niche: "cafe", website: "https://cafe.example", flags: [] as string[], googleRating: null, reviewCount: null };
    const audit = { businessName: "Test Cafe", website: cafe.website, baseline: bl, gaps, topOpportunities: [], match: { quickWins: [], coreGrowth: [], strategic: [] }, pitch: {} as never, readinessScore: 0, opportunityScore: 0, warnings: [] } as unknown as AuditResult;
    const e = composeColdEmail(cafe, audit, DEFAULT_PROFILE, { starting: "", website: null });
    assert.ok(e.body.includes("already lets visitors book a table, enquire about private events and subscribe for updates"));
    assert.ok(e.body.includes("private hire and group options"));
    assert.ok(!/add online table booking|Online booking:/i.test(e.body), "never suggests booking they already have");
    assert.ok(e.body.includes("make more of your email list"));
    const fu = composeFollowUp(cafe, e.subject, e.focus, DEFAULT_PROFILE);
    assert.ok(fu.subject.startsWith("Re: ") && fu.body.includes("Just following up") && fu.body.includes("no thanks"));
    assert.ok(addBusinessDays(new Date("2026-10-30T10:00:00"), 4).getDay() === 4, "Friday + 4 working days = Thursday");
  });

  await t("email finder: own-domain or mailbox addresses, decoded and de-obfuscated, never junk or listing sites", () => {
    const html = `<a href="mailto:Info@Cafe-Berlin.de?subject=x">Mail</a><a href="/cdn-cgi/l/email-protection#2a43444c456a4b4e4f04494547">x</a>
      <p>Impressum: kontakt [at] cafe-berlin [dot] de · Fotos: photo@wixpress.com · sentry@sentry.io</p>`;
    const found = emailsInHtml(html);
    assert.ok(found.includes("info@cafe-berlin.de") && found.includes("kontakt@cafe-berlin.de"));
    assert.ok(found.includes("info@ade.com"), "Cloudflare-protected address decoded");
    assert.ok(!found.some((e) => /wixpress|sentry/.test(e)));
    assert.equal(pickOwnEmail(["sales@other.com", "kontakt@cafe-berlin.de", "info@cafe-berlin.de"], "https://www.cafe-berlin.de/"), "kontakt@cafe-berlin.de");
    assert.equal(pickOwnEmail(["owner.cafe@gmail.com"], "https://cafe-berlin.de"), "owner.cafe@gmail.com");
    assert.equal(pickOwnEmail(["sales@other.com"], "https://cafe-berlin.de"), null);
    const hits = [
      { title: "Roop Corner, Pune - Justdial", url: "https://justdial.com/x", content: "Roop Corner bag shop. Email: roopcorner.pune@gmail.com. Listing help: support@justdial.com", publishedDate: null },
      { title: "Other Shop", url: "https://x.com", content: "other@gmail.com", publishedDate: null },
    ];
    assert.equal(pickEmailFromHits("Roop Corner", hits), "roopcorner.pune@gmail.com");
    assert.equal(pickEmailFromHits("Roop Corner", [...hits, { title: "Roop Corner", url: "https://y.com", content: "roop2@gmail.com", publishedDate: null }]), null, "two different addresses: not sure, keep none");
  });

  await t("only email addresses that belong to the business", () => {
    assert.equal(emailFitsBusiness("info@vitalife.in", "https://www.vitalife.in/"), true);
    assert.equal(emailFitsBusiness("sales@shop.example.co.uk", "https://example.co.uk"), true);
    assert.equal(emailFitsBusiness("owner@gmail.com", "https://cafe.de"), true);
    assert.equal(emailFitsBusiness("sandip.pawar@linkintime.co.in", "https://www.birlasoft.com"), false);
    assert.equal(emailFitsBusiness("someone@other.com", null), true);
    assert.equal(emailFitsBusiness("someone@other.co.uk", "https://example.co.uk"), false, "a shared country ending is not a match");
    assert.equal(emailFitsBusiness("info@exceldent.co.uk", "http://exceldent.co/"), true, "same name, different ending");
    assert.equal(emailFitsBusiness("info@elineorthodontics.co.uk", "https://elineorthodontics.com/"), true);
    assert.equal(emailFitsBusiness("info@doctorrichardlondon.com", "https://wimpolestreetdental.com/"), false);
    assert.equal(emailFitsBusiness("info@example.co.uk", "https://www.example.co.uk/menu"), true);
  });

  await t("Gmail blocks pause sending; ordinary bounces don't", () => {
    assert.ok(isGmailBlock("Data command failed: 550-5.4.5 Daily user sending limit exceeded."));
    assert.ok(isGmailBlock("Invalid login: 534-5.7.9 Please log in with your web browser and then try again."));
    assert.ok(isGmailBlock("Invalid login: 534-5.7.14 <https://accounts.google.com/signin/continue>"));
    assert.ok(!isGmailBlock("550 5.1.1 The email account that you tried to reach does not exist."));
    assert.deepEqual(skippedCountries({ ...DEFAULT_PROFILE }), ["Germany"]);
  });

  await t("research: listings + socials read only from results naming the business", () => {
    const hits = [
      { title: "Test Dental - Justdial", url: "https://www.justdial.com/London/Test-Dental", content: "Test Dental, implant clinic in London. Open 9-7.", publishedDate: null },
      { title: "Test Dental (@testdental) • Instagram", url: "https://www.instagram.com/testdental/", content: "", publishedDate: null },
      { title: "Other Clinic - Zomato", url: "https://www.zomato.com/other", content: "Other Clinic", publishedDate: null },
    ];
    const r = readResearch("Test Dental", hits);
    assert.deepEqual(r.listings, ["Justdial"]);
    assert.ok(r.socials.instagram);
    assert.ok(r.about?.includes("implant clinic"));
    // Research found Instagram, so the email doesn't claim they have no social pages.
    assert.ok(!findingsFor(base, null, r).some((f) => f.key === "social"));
    assert.ok(findingsFor(base, null, null).some((f) => f.key === "social"));
    assert.ok(composeColdEmail(base, null, DEFAULT_PROFILE, { starting: "x", website: null }, r).body.includes("I came across Test Dental on Justdial"));
  });

  console.log(`\n${passed} checks passed${process.exitCode ? " (with failures)" : ""}`);
}

main();
