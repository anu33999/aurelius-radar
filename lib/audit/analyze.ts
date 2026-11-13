import * as cheerio from "cheerio";
import { safeFetch, normaliseUrl, assertPublicHost } from "./safe-fetch";
import type { Baseline } from "@/lib/types";

const SOCIAL_HOSTS: Record<keyof Baseline["social"], RegExp> = {
  instagram: /(^|\.)instagram\.com$/i,
  linkedin: /(^|\.)linkedin\.com$/i,
  x: /(^|\.)(x|twitter)\.com$/i,
  youtube: /(^|\.)(youtube\.com|youtu\.be)$/i,
  facebook: /(^|\.)(facebook\.com|fb\.com)$/i,
};

function detectCms(html: string, $: cheerio.CheerioAPI): Baseline["cms"] {
  const generator = $('meta[name="generator"]').attr("content") ?? "";
  if (/cdn\.shopify\.com|Shopify\.theme|myshopify\.com/i.test(html)) return { name: "Shopify", evidence: "Shopify CDN/theme markers in markup" };
  if (/wp-content|wp-includes/i.test(html) || /wordpress/i.test(generator)) {
    const woo = /woocommerce/i.test(html);
    return { name: woo ? "WordPress + WooCommerce" : "WordPress", evidence: "wp-content paths / generator tag" };
  }
  if (/webflow/i.test(html) || /webflow/i.test(generator)) return { name: "Webflow", evidence: "Webflow markers in markup" };
  if (/wixstatic\.com|wix\.com/i.test(html)) return { name: "Wix", evidence: "Wix static assets" };
  if (/squarespace/i.test(html) || /static1\.squarespace\.com/i.test(html)) return { name: "Squarespace", evidence: "Squarespace assets" };
  if (/_next\/static|__NEXT_DATA__/i.test(html)) return { name: "Next.js (custom)", evidence: "_next/static assets" };
  if (/cdn\.bigcommerce\.com/i.test(html)) return { name: "BigCommerce", evidence: "BigCommerce CDN" };
  if (/magento|mage\/cookies/i.test(html)) return { name: "Magento", evidence: "Magento markers" };
  if (/framer\.com|framerusercontent/i.test(html)) return { name: "Framer", evidence: "Framer assets" };
  if (generator) return { name: generator, evidence: "meta generator tag" };
  return null;
}

async function fetchPageSpeed(url: string): Promise<Baseline["performance"]> {
  const key = process.env.PAGESPEED_API_KEY ? `&key=${process.env.PAGESPEED_API_KEY}` : "";
  const api = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&category=performance${key}`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45000);
    const res = await fetch(api, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`PageSpeed API ${res.status}`);
    const data = (await res.json()) as {
      lighthouseResult?: {
        categories?: { performance?: { score?: number } };
        audits?: Record<string, { numericValue?: number }>;
      };
    };
    const lr = data.lighthouseResult;
    const score = lr?.categories?.performance?.score;
    return {
      source: "PageSpeed Insights",
      mobileScore: typeof score === "number" ? Math.round(score * 100) : null,
      lcpSeconds: lr?.audits?.["largest-contentful-paint"]?.numericValue != null ? Math.round(lr.audits["largest-contentful-paint"].numericValue! / 100) / 10 : null,
      cls: lr?.audits?.["cumulative-layout-shift"]?.numericValue != null ? Math.round(lr.audits["cumulative-layout-shift"].numericValue! * 1000) / 1000 : null,
      tbtMs: lr?.audits?.["total-blocking-time"]?.numericValue != null ? Math.round(lr.audits["total-blocking-time"].numericValue!) : null,
      note: "Lab data from a single mobile PageSpeed Insights run; field data may differ.",
    };
  } catch (e) {
    return {
      source: "unavailable",
      mobileScore: null,
      lcpSeconds: null,
      cls: null,
      tbtMs: null,
      note: `Core Web Vitals could not be measured (${e instanceof Error ? e.message : "unknown error"}). Treat as unverifiable.`,
    };
  }
}

/** Extracts every markup-derived signal from the page HTML into the baseline (exported for testing). */
export function applyHtmlSignals(base: Baseline, html: string, url: string): void {
  const $ = cheerio.load(html);
  base.cms = detectCms(html, $);
  base.viewportMeta = $('meta[name="viewport"]').length > 0;
  base.title = $("title").first().text().trim() || null;
  base.metaDescription = $('meta[name="description"]').attr("content")?.trim() || null;
  base.h1Count = $("h1").length;
  base.canonical = $('link[rel="canonical"]').length > 0;
  base.robotsNoindex = /noindex/i.test($('meta[name="robots"]').attr("content") ?? "");

  const types = new Set<string>();
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($(el).contents().text());
      const walk = (node: unknown) => {
        if (Array.isArray(node)) node.forEach(walk);
        else if (node && typeof node === "object") {
          const t = (node as Record<string, unknown>)["@type"];
          if (typeof t === "string") types.add(t);
          else if (Array.isArray(t)) t.forEach((x) => typeof x === "string" && types.add(x));
          const graph = (node as Record<string, unknown>)["@graph"];
          if (graph) walk(graph);
        }
      };
      walk(parsed);
    } catch {
      /* ignore malformed JSON-LD */
    }
  });
  base.structuredData = [...types];

  base.tracking = {
    metaPixel: /fbq\(|connect\.facebook\.net\/[^"']*fbevents\.js/i.test(html),
    gtm: /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]{4,}/i.test(html),
    ga4: /G-[A-Z0-9]{6,}|googletagmanager\.com\/gtag\/js/i.test(html),
    googleAds: /AW-\d{6,}/i.test(html),
    tiktokPixel: /analytics\.tiktok\.com|ttq\.load/i.test(html),
    linkedinInsight: /snap\.licdn\.com|_linkedin_partner_id/i.test(html),
    heatmap: /hotjar\.com/i.test(html) ? "Hotjar" : /clarity\.ms/i.test(html) ? "Microsoft Clarity" : null,
  };

  const chat = [
    [/tawk\.to/i, "Tawk.to"],
    [/intercom/i, "Intercom"],
    [/drift\.com|js\.driftt/i, "Drift"],
    [/crisp\.chat/i, "Crisp"],
    [/livechatinc|livechat/i, "LiveChat"],
    [/tidio/i, "Tidio"],
    [/zopim|zendesk/i, "Zendesk"],
    [/freshchat|freshworks/i, "Freshchat"],
    [/gupshup|wati\.io|interakt/i, "WhatsApp chat tool"],
  ] as const;
  base.widgets.liveChat = chat.find(([re]) => re.test(html))?.[1] ?? null;
  base.widgets.whatsapp = /wa\.me\/|api\.whatsapp\.com|whatsapp:\/\//i.test(html);
  base.widgets.whatsappNumber = /(?:wa\.me\/|api\.whatsapp\.com\/send\/?\?phone=|whatsapp:\/\/send\?phone=)(?:%2B|\+)?(\d{7,15})/i.exec(html)?.[1] ?? null;
  const crm = [
    [/hs-scripts\.com|hubspot/i, "HubSpot"],
    [/zoho(?:crm|forms|salesiq)|salesiq\.zoho/i, "Zoho"],
    [/salesforce|pardot/i, "Salesforce"],
    [/klaviyo/i, "Klaviyo"],
    [/mailchimp/i, "Mailchimp"],
  ] as const;
  base.widgets.crm = crm.find(([re]) => re.test(html))?.[1] ?? null;

  // What the site already offers, read from links, embeds and visible wording.
  // Spaces between tags, so text from neighbouring elements doesn't run together ("book a tableprivate hire").
  const text = cheerio.load(html.replace(/</g, " <"))("body").text().replace(/\s+/g, " ").toLowerCase();
  const booking = [
    [/opentable\./i, "OpenTable"], [/resy\.com/i, "Resy"], [/sevenrooms\.com/i, "SevenRooms"], [/exploretock\.com|tock\.com/i, "Tock"],
    [/designmynight\.com/i, "DesignMyNight"], [/resdiary\.com/i, "ResDiary"], [/quandoo\./i, "Quandoo"], [/thefork\./i, "TheFork"],
    [/dineout|eazydiner/i, "Dineout"], [/fresha\.com/i, "Fresha"], [/booksy\.com/i, "Booksy"], [/calendly\.com/i, "Calendly"],
    [/setmore\.com/i, "Setmore"], [/practo\.com/i, "Practo"], [/mindbodyonline|mindbody\.io/i, "Mindbody"], [/zenoti\.com/i, "Zenoti"],
    [/squareup\.com\/appointments|square\.site\/book/i, "Square Appointments"], [/acuityscheduling\.com/i, "Acuity"], [/simplybook\./i, "SimplyBook"],
  ] as const;
  base.features = {
    booking: booking.find(([re]) => re.test(html))?.[1] ?? (/\b(book a table|book now|reserve a table|make a reservation|book an appointment|book online|book your)\b/.test(text) ? "booking link" : null),
    events: /\b(private hire|private dining|venue hire|private events?|functions|group bookings?|events? enquir|weddings?)\b/.test(text),
    newsletter: /mailchimp|klaviyo|list-manage\.com|sendinblue|brevo|convertkit|\bnewsletter\b|\bsubscribe\b/i.test(html),
    ordering: [[/deliveroo\./i, "Deliveroo"], [/ubereats\./i, "Uber Eats"], [/just-eat\.|justeat/i, "Just Eat"], [/swiggy\.com/i, "Swiggy"], [/zomato\.com/i, "Zomato"], [/doordash\./i, "DoorDash"]].find(([re]) => (re as RegExp).test(html))?.[1] as string ?? (/\border online\b/.test(text) ? "online ordering" : null),
    menu: /\bmenus?\b/.test(text),
  };

  base.formCount = $("form").filter((_, el) => $(el).find("input, textarea, select").length > 1).length;
  base.ecommerce =
    /add[- ]to[- ]cart|addtocart|\/cart\b|\/checkout\b|woocommerce|cdn\.shopify\.com|"@type"\s*:\s*"Product"/i.test(html);

  const base_ = base.finalUrl ?? url;
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    let abs: URL;
    try {
      abs = new URL(href, base_);
    } catch {
      return;
    }
    for (const key of Object.keys(SOCIAL_HOSTS) as (keyof Baseline["social"])[]) {
      if (!base.social[key] && SOCIAL_HOSTS[key].test(abs.hostname) && abs.pathname.length > 1) {
        if (/sharer|intent\/tweet|share\?/i.test(abs.toString())) continue;
        base.social[key] = abs.toString();
      }
    }
  });

  base.scriptCount = $("script[src]").length;
  const imgs = $("img");
  base.imageCount = imgs.length;
  base.imagesMissingAlt = imgs.filter((_, el) => !($(el).attr("alt") ?? "").trim()).length;
}

export async function analyseWebsite(inputUrl: string, businessName: string): Promise<Baseline> {
  const url = normaliseUrl(inputUrl);
  const origin = new URL(url).origin;
  const q = encodeURIComponent(businessName);

  const base: Baseline = {
    inputUrl,
    finalUrl: null,
    fetchedAt: new Date().toISOString(),
    httpStatus: null,
    fetchError: null,
    https: url.startsWith("https://"),
    cms: null,
    viewportMeta: false,
    title: null,
    metaDescription: null,
    h1Count: 0,
    canonical: false,
    robotsNoindex: false,
    sitemap: "unknown",
    structuredData: [],
    tracking: { metaPixel: false, gtm: false, ga4: false, googleAds: false, tiktokPixel: false, linkedinInsight: false, heatmap: null },
    widgets: { liveChat: null, whatsapp: false, crm: null },
    features: { booking: null, events: false, newsletter: false, ordering: null, menu: false },
    formCount: 0,
    ecommerce: false,
    social: { instagram: null, linkedin: null, x: null, youtube: null, facebook: null },
    performance: { source: "unavailable", mobileScore: null, lcpSeconds: null, cls: null, tbtMs: null, note: "Not run." },
    pageWeightKb: null,
    scriptCount: 0,
    imageCount: 0,
    imagesMissingAlt: 0,
    links: {
      metaAdLibrary: `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=IN&q=${q}&search_type=keyword_unordered`,
      googleAdsTransparency: `https://adstransparency.google.com/?region=IN&query=${q}`,
      googleMaps: `https://www.google.com/maps/search/${q}`,
    },
  };

  // Run PageSpeed in parallel with the page fetch - it is the slowest step.
  const perfPromise: Promise<Baseline["performance"]> = assertPublicHost(new URL(url).hostname).then(
    () => fetchPageSpeed(url),
    (e: unknown) => ({
      source: "unavailable" as const,
      mobileScore: null,
      lcpSeconds: null,
      cls: null,
      tbtMs: null,
      note: `Not measured: ${e instanceof Error ? e.message : "host not allowed"}.`,
    }),
  );

  let html = "";
  try {
    const res = await safeFetch(url);
    base.httpStatus = res.status;
    base.finalUrl = res.finalUrl;
    base.https = res.finalUrl.startsWith("https://");
    base.pageWeightKb = Math.round(res.bytes / 1024);
    html = res.text;
    if (res.status >= 400) base.fetchError = `Site responded with HTTP ${res.status}`;
  } catch (e) {
    base.fetchError = e instanceof Error ? e.message : "Fetch failed";
  }

  if (html) applyHtmlSignals(base, html, url);

  // Sitemap: check robots.txt for a Sitemap line, then /sitemap.xml.
  if (base.finalUrl) {
    const siteOrigin = new URL(base.finalUrl).origin || origin;
    try {
      const robots = await safeFetch(`${siteOrigin}/robots.txt`, { timeoutMs: 6000, maxBytes: 200_000 });
      if (robots.status === 200 && /sitemap:/i.test(robots.text)) base.sitemap = "found";
    } catch {
      /* fall through */
    }
    if (base.sitemap !== "found") {
      try {
        const sm = await safeFetch(`${siteOrigin}/sitemap.xml`, { timeoutMs: 6000, maxBytes: 200_000 });
        base.sitemap = sm.status === 200 && /<urlset|<sitemapindex/i.test(sm.text) ? "found" : "not_found";
      } catch {
        base.sitemap = "unknown";
      }
    }
  }

  base.performance = await perfPromise;
  return base;
}
