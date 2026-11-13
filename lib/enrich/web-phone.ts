import { internationalDigits } from "@/lib/outreach";
import { webSearch, type SearchHit } from "@/lib/search/providers";
import { sameBusinessName } from "@/lib/search/places";

/**
 * Phone numbers from public web search results (listing sites, store locators, the business's own
 * pages). Less certain than Google Places, so the rules are strict and the result is stored with
 * phoneSource "WEB_SEARCH" and shown as "verify before calling":
 *  - only results that name the same business count;
 *  - a number must be a valid phone for the business's country (dates, PIN codes, prices fail);
 *  - if the results show several different numbers (a chain's branches), one is taken only when it
 *    appears next to this branch's own street or area; otherwise nothing is saved.
 */
export interface WebPhoneInput {
  name: string;
  city: string;
  country: string | null;
  locality: string | null;
  address: string | null;
}

const CANDIDATE = /(?:\+|00)?\d[\d\s().-]{7,18}\d/g;

/** Allowed total digit counts (country code included) per calling code; run-together or clipped numbers fail. */
const LENGTHS: Record<string, number[]> = {
  "1": [11], "44": [12, 11], "353": [10, 11, 12], "31": [11], "49": [10, 11, 12, 13, 14], "971": [11, 12],
  "65": [10], "61": [11], "64": [10, 11], "27": [11], "91": [12],
};

/** Valid international digits for this country, or null. Placeholder numbers (8888888888) are rejected. */
export function phoneFrom(raw: string, country: string | null): string | null {
  const d = internationalDigits(raw, country);
  if (!d || d.length < 10 || d.length > 13) return null;
  if (/(\d)\1{6,}/.test(d)) return null;
  const cc = Object.keys(LENGTHS).find((c) => d.startsWith(c));
  if (cc && !LENGTHS[cc].includes(d.length)) return null;
  // UK London numbers (020) are always 44 + 10 digits.
  if (d.startsWith("4420") && d.length !== 12) return null;
  return `+${d}`;
}

/** Street / area words of this branch, used to pick the right number when a chain has several. */
function placeWords(b: WebPhoneInput): string[] {
  return `${b.locality ?? ""} ${b.address ?? ""}`
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 5 && !["road", "street", "nagar", "lane", "floor", "india", "building", b.city.toLowerCase()].includes(w));
}

export function pickPhone(b: WebPhoneInput, hits: SearchHit[]): string | null {
  const found = new Map<string, { count: number; nearBranch: boolean }>();
  const words = placeWords(b);
  for (const h of hits) {
    const text = `${h.title} ${h.content}`;
    if (!sameBusinessName(b.name, h.title) && !text.toLowerCase().includes(b.name.toLowerCase())) continue;
    for (const m of text.matchAll(CANDIDATE)) {
      const phone = phoneFrom(m[0], b.country);
      if (!phone) continue;
      const around = text.slice(Math.max(0, (m.index ?? 0) - 160), (m.index ?? 0) + 40).toLowerCase();
      const e = found.get(phone) ?? { count: 0, nearBranch: false };
      e.count++;
      e.nearBranch ||= words.some((w) => around.includes(w));
      found.set(phone, e);
    }
  }
  if (found.size === 0) return null;
  if (found.size === 1) return [...found.keys()][0];
  const near = [...found.entries()].filter(([, e]) => e.nearBranch);
  return near.length === 1 ? near[0][0] : null;
}

export async function findPhoneOnWeb(b: WebPhoneInput): Promise<string | null> {
  const where = [b.locality, b.city !== "Unspecified" ? b.city : null].filter(Boolean).join(" ");
  const hits = await webSearch(`"${b.name}" ${where} phone number`, { maxResults: 10 });
  return pickPhone(b, hits);
}
