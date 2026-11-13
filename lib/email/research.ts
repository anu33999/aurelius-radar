import { webSearch, type SearchHit } from "@/lib/search/providers";
import { sameBusinessName } from "@/lib/search/places";

/**
 * Research done before each cold email: one web search for the business, read for where it is
 * listed (Zomato, Justdial, IndiaMART…), which social pages it already has, and a line on what it
 * does. Used to make the email personal and to avoid telling a business it lacks something it has.
 */
export interface Research {
  listings: string[];
  socials: { instagram: string | null; facebook: string | null; linkedin: string | null };
  about: string | null;
  sources: string[];
}

const LISTING_SITES: [RegExp, string][] = [
  [/zomato\.com/, "Zomato"], [/swiggy\.com/, "Swiggy"], [/justdial\.com/, "Justdial"], [/indiamart\.com/, "IndiaMART"],
  [/tradeindia\.com/, "TradeIndia"], [/tripadvisor\./, "Tripadvisor"], [/yelp\./, "Yelp"], [/practo\.com/, "Practo"],
  [/magicpin\.in/, "magicpin"], [/opentable\./, "OpenTable"], [/booksy\.com/, "Booksy"], [/fresha\.com/, "Fresha"],
  [/treatwell\./, "Treatwell"], [/houzz\./, "Houzz"], [/yellowpages\.|yell\.com/, "Yellow Pages"], [/sulekha\.com/, "Sulekha"],
];

export function readResearch(name: string, hits: SearchHit[]): Research {
  const r: Research = { listings: [], socials: { instagram: null, facebook: null, linkedin: null }, about: null, sources: [] };
  const lname = name.toLowerCase();
  for (const h of hits) {
    const text = `${h.title} ${h.content}`.toLowerCase();
    if (!sameBusinessName(name, h.title) && !text.includes(lname)) continue;
    const url = h.url.toLowerCase();
    let used = false;
    if (/instagram\.com\/(?!p\/|reel\/|explore\/)[\w.]+/.test(url) && !r.socials.instagram) { r.socials.instagram = h.url; used = true; }
    if (/facebook\.com\/(?!sharer|groups\/)[\w.-]+/.test(url) && !r.socials.facebook) { r.socials.facebook = h.url; used = true; }
    if (/linkedin\.com\/company\//.test(url) && !r.socials.linkedin) { r.socials.linkedin = h.url; used = true; }
    for (const [re, label] of LISTING_SITES) if (re.test(url) && !r.listings.includes(label)) { r.listings.push(label); used = true; }
    if (!r.about && h.content && !/instagram|facebook|linkedin/.test(url)) {
      const s = h.content.replace(/\s+/g, " ").trim();
      if (s.length > 40) { r.about = s.slice(0, 220); used = true; }
    }
    if (used) r.sources.push(h.url);
  }
  return r;
}

export async function researchBusiness(b: { name: string; city: string; locality: string | null }): Promise<Research> {
  const where = [b.locality, b.city !== "Unspecified" ? b.city : null].filter(Boolean).join(" ");
  const hits = await webSearch(`"${b.name}" ${where}`, { maxResults: 10 });
  return readResearch(b.name, hits);
}
