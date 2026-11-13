import { classifyBatch, matchServiceCodes, type Candidate } from "@/lib/ai/classify-intent";
import { generateLeadPitch } from "./lead-pitch";
import { searchConfigured, webSearch, type SearchHit, type TimeRange } from "./providers";
import { getCatalogue, insertNewLeads, type LeadInput } from "@/lib/db/repo";
import type { Platform } from "@/lib/types";

/**
 * Active Social Intent Radar.
 * Uses a web search API with domain operators to find people publicly asking for marketing,
 * web or automation help. Nothing is posted automatically: the drafts are for manual use,
 * which keeps this within each platform's rules.
 */

interface RadarQuery {
  platform: Platform;
  query: string;
  domains: string[];
}

export const RADAR_QUERIES: RadarQuery[] = [
  // A. Reddit
  { platform: "REDDIT", domains: ["reddit.com"], query: 'site:reddit.com ("looking for a digital marketing agency" OR "need a web developer" OR "redesign our website")' },
  { platform: "REDDIT", domains: ["reddit.com"], query: 'site:reddit.com ("recommend an agency for ads" OR "hiring social media manager" OR "need marketing automation")' },
  { platform: "REDDIT", domains: ["reddit.com"], query: 'site:reddit.com ("looking to hire SEO" OR "agency recommendations for ecommerce")' },
  // B. X / Twitter
  { platform: "TWITTER", domains: ["x.com", "twitter.com"], query: 'site:x.com OR site:twitter.com ("looking for a web designer" OR "need a marketing agency" OR "who built your landing page" OR "looking to hire agency") -filter:replies' },
  { platform: "TWITTER", domains: ["x.com", "twitter.com"], query: 'site:x.com ("need a rebrand" OR "need someone to run Meta ads" OR "looking for marketing automation")' },
  // C. LinkedIn
  { platform: "LINKEDIN", domains: ["linkedin.com"], query: 'site:linkedin.com/posts ("looking for a marketing agency" OR "recommend a web agency" OR "seeking social media agency" OR "RFP marketing")' },
];

const URL_PATTERNS: Record<Platform, RegExp> = {
  REDDIT: /^https?:\/\/(www\.|old\.)?reddit\.com\/r\/[^/]+\/comments\/[a-z0-9]+/i,
  TWITTER: /^https?:\/\/(www\.|mobile\.)?(x|twitter)\.com\/[^/]+\/status\/\d+/i,
  LINKEDIN: /^https?:\/\/([a-z]+\.)?linkedin\.com\/(posts\/|feed\/update\/)/i,
};

/** Normalise so the same post is not stored twice under different URL shapes. */
export function canonicalUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    u.search = "";
    let host = u.hostname.replace(/^(www\.|old\.|mobile\.)/, "");
    if (host === "twitter.com") host = "x.com";
    let p = u.pathname.replace(/\/+$/, "");
    if (host === "reddit.com") {
      const m = p.match(/^(\/r\/[^/]+\/comments\/[a-z0-9]+)/i);
      if (m) p = m[1];
    }
    return `https://${host}${p}`;
  } catch {
    return url;
  }
}

export function authorFrom(platform: Platform, url: string, content: string): string | null {
  try {
    const u = new URL(url);
    if (platform === "TWITTER") {
      const h = u.pathname.split("/")[1];
      return h ? `@${h}` : null;
    }
    if (platform === "LINKEDIN") {
      const m = u.pathname.match(/\/posts\/([^_/]+)_/);
      return m ? m[1].replace(/-/g, " ") : null;
    }
    const m = content.match(/\bu\/([A-Za-z0-9_-]{3,20})\b/);
    if (m) return `u/${m[1]}`;
    const sub = u.pathname.match(/^\/r\/([^/]+)/);
    return sub ? `r/${sub[1]} (author not shown)` : null;
  } catch {
    return null;
  }
}

/** X and LinkedIn embed the post time in the numeric id (snowflake style). */
export function dateFromUrl(platform: Platform, url: string): Date | null {
  try {
    if (platform === "TWITTER") {
      const m = url.match(/status\/(\d{10,})/);
      if (m) return new Date(Number((BigInt(m[1]) >> 22n) + 1288834974657n));
    }
    if (platform === "LINKEDIN") {
      const m = url.match(/(?:activity|ugcPost|share)[-:](\d{16,})/);
      if (m) return new Date(Number(BigInt(m[1]) >> 22n));
    }
  } catch {
    /* ignore */
  }
  return null;
}

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface RadarOptions {
  window: "day" | "week";
  platforms?: Platform[];
  maxQueries?: number;
}

export interface RadarSummary {
  queriesRun: number;
  rawHits: number;
  afterUrlFilter: number;
  afterRecency: number;
  classified: number;
  kept: number;
  created: number;
  duplicates: number;
  classifier: "AI" | "RULES";
  errors: string[];
}

export async function runRadarScan(opts: RadarOptions): Promise<RadarSummary> {
  if (!searchConfigured()) {
    throw new Error("No search provider configured. Set TINYFISH_API_KEY, TAVILY_API_KEY or BRAVE_API_KEY in .env to run live scans.");
  }
  const timeRange: TimeRange = opts.window;
  const maxAgeMs = (opts.window === "day" ? 1 : 7) * 24 * 3600 * 1000;
  const queries = RADAR_QUERIES.filter((q) => !opts.platforms || opts.platforms.includes(q.platform)).slice(0, opts.maxQueries ?? 99);

  const errors: string[] = [];
  const seen = new Map<string, { platform: Platform; hit: SearchHit }>();
  let rawHits = 0;
  let queriesRun = 0;

  for (const q of queries) {
    try {
      const hits = await webSearch(q.query, { includeDomains: q.domains, timeRange, maxResults: 12 });
      queriesRun++;
      rawHits += hits.length;
      for (const hit of hits) {
        if (!URL_PATTERNS[q.platform].test(hit.url)) continue;
        const key = canonicalUrl(hit.url);
        if (!seen.has(key)) seen.set(key, { platform: q.platform, hit: { ...hit, url: key } });
      }
    } catch (e) {
      errors.push(`${q.platform}: ${e instanceof Error ? e.message : "search failed"}`);
    }
  }

  const afterUrlFilter = seen.size;
  const now = Date.now();
  const candidates: { platform: Platform; hit: SearchHit; postedAt: Date | null }[] = [];
  for (const { platform, hit } of seen.values()) {
    const postedAt = parseDate(hit.publishedDate) ?? dateFromUrl(platform, hit.url);
    if (postedAt && now - postedAt.getTime() > maxAgeMs) continue; // known to be too old
    candidates.push({ platform, hit, postedAt });
  }
  const afterRecency = candidates.length;

  const input: Candidate[] = candidates.map((c) => ({ platform: c.platform, title: c.hit.title, content: c.hit.content, url: c.hit.url }));
  const results = await classifyBatch(input);
  const classifier: "AI" | "RULES" = results.some((r) => r.by === "AI") ? "AI" : "RULES";

  const { services } = await getCatalogue();
  const sender = process.env.SENDER_NAME || "Kreatif Atelier";

  const leads: LeadInput[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const r = results[i];
    if (r.category === "REJECT") continue;
    const c = candidates[i];
    const codes = matchServiceCodes(r.serviceTags, services, 3);
    const svcs = services.filter((s) => codes.includes(s.code));
    const pitch = await generateLeadPitch({
      platform: c.platform,
      title: c.hit.title,
      content: c.hit.content,
      painPoint: r.painPoint,
      tags: r.serviceTags,
      services: svcs,
      sender,
    });
    leads.push({
      platform: c.platform,
      sourceUrl: c.hit.url,
      authorHandle: authorFrom(c.platform, c.hit.url, c.hit.content),
      postTitle: c.hit.title || null,
      postContent: c.hit.content,
      postedAt: c.postedAt,
      painPoint: r.painPoint,
      matchedServices: codes,
      intentCategory: r.category,
      classifiedBy: r.by,
      confidence: r.confidence,
      pitchDraft: pitch,
    });
  }

  const { created, duplicates } = await insertNewLeads(leads);
  return {
    queriesRun,
    rawHits,
    afterUrlFilter,
    afterRecency,
    classified: results.length,
    kept: leads.length,
    created,
    duplicates,
    classifier,
    errors,
  };
}
