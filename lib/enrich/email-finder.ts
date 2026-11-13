import * as cheerio from "cheerio";
import { safeFetch } from "@/lib/audit/safe-fetch";
import { webSearch, type SearchHit } from "@/lib/search/providers";
import { sameBusinessName } from "@/lib/search/places";

/**
 * Email addresses a business publishes, found two ways:
 *  1. its own website: homepage, then contact / about / imprint pages (German sites must list an email
 *     in their Impressum). Reads mailto links, schema.org, Cloudflare-protected addresses, "name [at]
 *     domain" spellings and plain text, keeping only addresses on the site's own domain or a common
 *     mailbox provider (many small businesses use Gmail);
 *  2. web search, for businesses with no website: an address is kept only when the result names this
 *     business and exactly one plausible address appears (listing sites' own addresses are ignored).
 */
const JUNK = /(example\.|sentry|wixpress|\.png$|\.jpe?g$|\.gif$|\.webp$|\.svg$|@2x|domain\.com|email\.com|yourcompany|yourdomain|noreply|no-reply|donotreply|privacy@|abuse@|postmaster@|webmaster@|wordpress|godaddy|squarespace|shopify|cloudflare|\.wix|user@|name@|test@)/i;
const FREE_MAIL = /@(gmail|googlemail|yahoo|ymail|outlook|hotmail|live|icloud|me|aol|rediffmail|zoho|protonmail|gmx|web|t-online|btinternet|sky)\.[a-z.]+$/i;
const LISTING_DOMAINS = /@(justdial|indiamart|sulekha|zomato|swiggy|tripadvisor|yelp|practo|tradeindia|yellowpages|yell|facebook|instagram|google|booking|opentable|thefork|quandoo|magicpin|dineout|houzz|fresha|treatwell|booksy)\./i;
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}/gi;

const domainOf = (url: string) => url.replace(/^https?:\/\/(www\.)?/i, "").replace(/[/:?#].*$/, "").toLowerCase();

/** Cloudflare "email protection" hides addresses as hex with an XOR key in the first byte. */
function decodeCf(hex: string): string | null {
  try {
    const key = parseInt(hex.slice(0, 2), 16);
    let out = "";
    for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
    return /@/.test(out) ? out : null;
  } catch {
    return null;
  }
}

/** Every candidate address on a page, most explicit sources first. */
export function emailsInHtml(html: string): string[] {
  const out: string[] = [];
  const push = (e: string | null | undefined) => {
    if (!e) return;
    let v = e.trim().toLowerCase().replace(/^mailto:/, "");
    try {
      v = decodeURIComponent(v);
    } catch {
      /* keep */
    }
    v = v.replace(/[?#].*$/, "").replace(/[.,;:)]+$/, "");
    if (/^[^@\s]+@[^@\s]+\.[a-z]{2,24}$/i.test(v) && !JUNK.test(v) && !out.includes(v)) out.push(v);
  };
  for (const m of html.matchAll(/href\s*=\s*["']mailto:([^"'?#]+)/gi)) push(m[1]);
  for (const m of html.matchAll(/"email"\s*:\s*"(?:mailto:)?([^"\s]+@[^"\s]+)"/gi)) push(m[1]);
  for (const m of html.matchAll(/data-cfemail\s*=\s*["']([0-9a-f]+)["']/gi)) push(decodeCf(m[1]));
  for (const m of html.matchAll(/\/cdn-cgi\/l\/email-protection#([0-9a-f]+)/gi)) push(decodeCf(m[1]));
  const text = cheerio.load(html.replace(/</g, " <"))("body").text().replace(/\s+/g, " ");
  // "info [at] shop [dot] de", "info(at)shop.de", "info @ shop . de"
  const deobfuscated = text
    .replace(/\s*[[({]\s*(at|ät|@)\s*[\])}]\s*/gi, "@")
    .replace(/\s*[[({]\s*(dot|punkt|\.)\s*[\])}]\s*/gi, ".")
    .replace(/(\w)\s+@\s+(\w)/g, "$1@$2");
  for (const m of deobfuscated.matchAll(EMAIL)) push(m[0]);
  return out;
}

/** Addresses that belong to this business: same domain as its website, or a common mailbox provider. */
export function pickOwnEmail(candidates: string[], website: string): string | null {
  const site = domainOf(website);
  const root = site.split(".").slice(-2).join(".");
  const own = candidates.filter((e) => {
    const d = e.split("@")[1];
    return d === site || d.endsWith(`.${root}`) || d === root;
  });
  const free = candidates.filter((e) => FREE_MAIL.test(e));
  // Prefer a general inbox (info@, hello@, contact@…) over a personal one.
  const general = (xs: string[]) => xs.find((e) => /^(info|hello|contact|kontakt|office|mail|enquir|inquir|admin|reservations?|booking|sales|team|studio|post)/.test(e)) ?? xs[0];
  return (own.length ? general(own) : free.length ? general(free) : null) ?? null;
}

const CONTACT_LINK = /(contact|kontakt|contacto|contatti|reach-us|get-in-touch|about|ueber-uns|uber-uns|about-us|impressum|imprint|legal|team)/i;
const GUESS_PATHS = ["/contact", "/contact-us", "/kontakt", "/impressum", "/imprint", "/about", "/about-us"];

/** Homepage, then up to 4 contact-type pages on the same site; stops at the first own address. */
export async function findEmailOnSite(website: string): Promise<string | null> {
  const home = await safeFetch(website, { timeoutMs: 9000, maxBytes: 1_500_000, maxRedirects: 4 });
  const host = new URL(home.finalUrl).hostname;
  let found = pickOwnEmail(emailsInHtml(home.text), home.finalUrl);
  if (found) return found;
  const $ = cheerio.load(home.text);
  const links = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const label = $(el).text();
    if (!CONTACT_LINK.test(href) && !CONTACT_LINK.test(label)) return;
    try {
      const u = new URL(href, home.finalUrl);
      if (u.hostname === host && /^https?:$/.test(u.protocol)) links.add(u.toString().replace(/#.*$/, ""));
    } catch {
      /* ignore */
    }
  });
  if (links.size === 0) for (const p of GUESS_PATHS) links.add(new URL(p, home.finalUrl).toString());
  for (const url of [...links].slice(0, 4)) {
    try {
      const page = await safeFetch(url, { timeoutMs: 8000, maxBytes: 1_500_000, maxRedirects: 3 });
      found = pickOwnEmail(emailsInHtml(page.text), home.finalUrl);
      if (found) return found;
    } catch {
      /* next page */
    }
  }
  return null;
}

/** From web results: only results naming this business, only one distinct plausible address, never a listing site's own. */
export function pickEmailFromHits(name: string, hits: SearchHit[]): string | null {
  const found = new Set<string>();
  const lname = name.toLowerCase();
  for (const h of hits) {
    const text = `${h.title} ${h.content}`;
    if (!sameBusinessName(name, h.title) && !text.toLowerCase().includes(lname)) continue;
    for (const m of text.matchAll(EMAIL)) {
      const e = m[0].toLowerCase().replace(/[.,;:)]+$/, "");
      if (!JUNK.test(e) && !LISTING_DOMAINS.test(e)) found.add(e);
    }
  }
  return found.size === 1 ? [...found][0] : null;
}

export async function findEmailOnWeb(b: { name: string; city: string; locality: string | null }): Promise<string | null> {
  const where = [b.locality, b.city !== "Unspecified" ? b.city : null].filter(Boolean).join(" ");
  return pickEmailFromHits(b.name, await webSearch(`"${b.name}" ${where} email`, { maxResults: 10 }));
}
