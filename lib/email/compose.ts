import { nicheById } from "@/lib/niches";
import type { AuditResult, BusinessDTO, Gap } from "@/lib/types";
import type { Research } from "./research";

/**
 * Personal cold emails built only from what we actually checked about each business (listing data,
 * the website audit, a web search). The shape follows what gets replies:
 *  - a first line about something specific to them (their site, where they're listed);
 *  - ONE main opportunity, tied to what matters for their type of business (bookings, enquiries…);
 *  - a small first step (three recommendations), not a list of services;
 *  - affordable without sounding cheap, and no prices or invented numbers;
 *  - proof only from a matching industry; a postal address and a working opt-out.
 * Plain text on purpose: it reads like a person wrote it and lands in the inbox more often.
 */
export interface SenderProfile {
  senderName: string;
  /** e.g. "Founder"; signed as "Founder, Kreatif Atelier". */
  senderTitle: string;
  companyName: string;
  website: string;
  /** One sentence about the company, e.g. "a digital studio that builds websites and runs marketing for growing businesses". */
  about: string;
  /** Kept for older saved profiles; emails never show prices. */
  startingPrice: string;
  websitePrice: string;
  /** Kept for older saved profiles; the offer is now "three specific recommendations". */
  freeOffer: string;
  phone: string;
  /** A real recent project, finishing "Recently, …", e.g. "we rebuilt the website for a packaging manufacturer in India". */
  recentWork: string;
  /** Comma-separated words: the project above is mentioned only to businesses whose industry matches one. */
  recentWorkMatch: string;
  /** A real client quote with who said it. Empty = no testimonial line (never invented). */
  testimonial: string;
  /** Comma-separated countries that are never emailed (e.g. strict cold-email rules). */
  skipCountries: string;
  /** Business postal address for the signature (required by US CAN-SPAM for commercial email). */
  address: string;
}

export const DEFAULT_PROFILE: SenderProfile = {
  senderName: "Anwesha Mulge",
  senderTitle: "Founder",
  companyName: "Kreatif Atelier",
  website: "https://www.kreatifatelier.com",
  about: "a creative and digital growth studio that designs websites, brand content and marketing for growing businesses",
  startingPrice: "",
  websitePrice: "",
  freeOffer: "",
  recentWork: "we rebuilt the website and produced a 12-page premium company profile for a B2B packaging manufacturer in India",
  recentWorkMatch: "manufactur, factory, industrial, packag, wholesale, supplier, printing, b2b",
  testimonial: "",
  phone: "",
  address: "",
  skipCountries: "Germany",
};

export interface Finding {
  key: string;
  /** What we saw, as part of a sentence ("your homepage has no description for Google…"). */
  lack: string;
  /** The first step we'd take, as a noun phrase ("a clearer Google listing for your homepage"). */
  step: string;
}

/** Most commercially important first: a missing website or a broken enquiry path beats a meta tag. */
const PRIORITY: Record<string, number> = {
  website: 100, down: 95, leads: 90, mobile: 85, speed: 80, whatsapp: 70, https: 65, rating: 60, reviews: 55,
  local: 52, social: 45, seo: 40, pixels: 35, analytics: 30, growth: 10,
};

function gapFinding(g: Gap, wa: boolean): Finding | null {
  if (g.status === "UNVERIFIABLE") return null;
  switch (g.id) {
    case "site-unreachable":
      return { key: "down", lack: "your website didn't load when I tried to open it", step: "getting the site reliably back online" };
    case "mobile-speed": {
      const score = g.evidence.match(/score (\d+)/)?.[1];
      return { key: "speed", lack: `your site is slow on phones${score ? ` (Google's mobile speed score is ${score}/100)` : ""}, and many visitors leave before a slow page finishes loading`, step: "speeding up the mobile site" };
    }
    case "no-https":
      return { key: "https", lack: "the site isn't on HTTPS, so browsers label it \"Not secure\"", step: "securing the site with HTTPS" };
    case "no-viewport":
      return { key: "mobile", lack: "the site isn't built for phones, so mobile visitors see a shrunken desktop page", step: "a mobile-friendly layout" };
    case "no-analytics":
      return { key: "analytics", lack: "there's no analytics on the site, so you can't see where your customers come from", step: "simple tracking of where enquiries come from" };
    case "no-ad-pixels":
      return { key: "pixels", lack: "there's no ad tracking on the site, so past visitors can't be reached again with ads", step: "ad tracking so visitors can be re-engaged" };
    case "no-lead-capture":
      return { key: "leads", lack: `the homepage has no enquiry form, ${wa ? "WhatsApp button" : "call button"} or chat, so an interested visitor has no quick way to reach you`, step: "a direct enquiry path on the homepage" };
    case "no-whatsapp":
      return wa ? { key: "whatsapp", lack: "there's no WhatsApp button on the site, which is how many customers prefer to ask questions", step: "one-tap WhatsApp enquiries" } : null;
    case "no-local-schema":
      return { key: "local", lack: "Google can't read your address, opening hours and business type from the site's code", step: "making your business details readable to Google" };
    case "no-meta-desc":
      return { key: "seo-desc", lack: "your homepage has no description for Google, so search results show whatever text Google picks", step: "a clearer Google listing for your homepage" };
    case "no-title":
      return { key: "seo-title", lack: "your homepage has no page title, so Google shows a generic one in search results", step: "a clearer Google listing for your homepage" };
    case "title-length":
      return { key: "seo-titlelen", lack: "your homepage title gets cut off in Google results", step: "a clearer Google listing for your homepage" };
    case "no-h1":
      return { key: "seo-h1", lack: "your homepage has no main heading, which makes it harder for Google to tell what you offer", step: "clearer homepage structure for Google" };
    case "noindex":
      return { key: "seo-noindex", lack: "your homepage is set to be hidden from Google search", step: "making your homepage visible in Google" };
    case "no-sitemap":
      return { key: "seo-sitemap", lack: "there's no sitemap, so Google may miss some of your pages", step: "helping Google find all your pages" };
    case "alt-text":
      return { key: "seo-alt", lack: "many images on the site have no text description, so they don't show up in Google image search", step: "describing your images for Google" };
    case "no-instagram":
      return { key: "social", lack: "the website doesn't link to an Instagram page", step: "a steady Instagram presence linked from your site" };
    default:
      return null;
  }
}

/** What a customer would type into Google for this kind of business. */
const SEARCH_TERM: Record<string, string> = {
  cafe: "a cafe", bakery: "a bakery", restaurant: "a restaurant", bar: "a bar", salon: "a salon", medspa: "a skin clinic",
  boutique: "a boutique", fitness: "a gym", dental: "a dentist", clinic: "a clinic", realestate: "property", architecture: "an architect",
  interior: "an interior designer", jewelry: "a jeweller", furniture: "furniture", factory: "a manufacturer", industrial_supply: "a supplier",
};

/** "Hospitality (Restaurant)" → "restaurant"; "Manufacturing" → "manufacturing". */
function kindOf(b: BusinessDTO): string | null {
  if (!b.industry) return null;
  const k = (b.industry.match(/\(([^)]+)\)/)?.[1] ?? b.industry).toLowerCase().trim();
  // "Retail (Bag)" is a bag shop, not a bag.
  return /^retail|^shop/i.test(b.industry) && !/shop|store/.test(k) ? `${k} shop` : k;
}

/** WhatsApp is how customers message businesses almost everywhere except North America. */
const usesWhatsApp = (country: string | null) => !["United States", "Canada"].includes(country ?? "");

/** The one result this kind of business cares about most, used to frame the main opportunity. */
export function goalFor(b: BusinessDTO): { type: string; goal: string } {
  const t = `${b.niche ?? ""} ${kindOf(b) ?? ""} ${b.industry ?? ""}`.toLowerCase();
  if (/cafe|bakery|restaurant|bar|pub|hotel|hospitality|food/.test(t)) return { type: "a restaurant or cafe", goal: "table bookings, group bookings and repeat visits" };
  if (/salon|medspa|spa|fitness|gym|dental|dentist|clinic|doctor|beauty|health/.test(t)) return { type: "an appointment-based business", goal: "booked appointments" };
  if (/realestate|estate|architect|interior/.test(t)) return { type: "a project-based business", goal: "qualified project enquiries" };
  if (/boutique|jewel|furniture|shop|retail|clothes|fashion/.test(t)) return { type: "a store", goal: "store visits and product enquiries" };
  if (/factory|industrial|manufactur|wholesale|supplier|packag/.test(t)) return { type: "a manufacturer or supplier", goal: "enquiries from buyers and distributors" };
  return { type: "a business like yours", goal: "new customer enquiries" };
}

const priorityOf = (key: string) => PRIORITY[key] ?? (key.startsWith("seo") ? PRIORITY.seo - (key === "seo-noindex" ? -50 : key === "seo-alt" ? 10 : 0) : 0);

/** Everything we confirmed, most important first. Unverifiable items are never included. */
export function findingsFor(b: BusinessDTO, audit: AuditResult | null, research: Research | null = null): Finding[] {
  const social = research?.socials;
  const hasSocialOnWeb = !!(social?.instagram || social?.facebook || social?.linkedin);
  const where = b.locality && b.locality !== b.city ? `${b.locality}, ${b.city}` : b.city;
  const kind = kindOf(b);
  const what = (b.niche && SEARCH_TERM[b.niche]) || (kind ? `${/^[aeiou]/.test(kind) ? "an" : "a"} ${kind}` : "a business like yours");
  const wa = usesWhatsApp(b.country);
  const out: Finding[] = [];
  const add = (f: Finding | null) => f && !out.some((o) => o.key === f.key) && out.push(f);
  if (!b.website) {
    add({ key: "website", lack: `I couldn't find a website for ${b.name}, so people searching Google for ${what} in ${where === "Unspecified" ? "your area" : where} are likely finding competitors first`, step: "a simple, fast website built around how customers contact you" });
  }
  for (const g of (audit?.gaps ?? []).slice().sort((x, y) => y.weight - x.weight)) {
    // The research found their Instagram, so "no Instagram link on the site" becomes a smaller point.
    if (g.id === "no-instagram" && social?.instagram) {
      add({ key: "social", lack: "your Instagram isn't linked from your website, so site visitors never see it", step: "connecting your Instagram to the website" });
      continue;
    }
    add(gapFinding(g, wa));
  }
  if (b.flags.includes("LOW_RATING") && b.googleRating != null) {
    add({ key: "rating", lack: `your Google rating is ${b.googleRating.toFixed(1)}★, which can make new customers hesitate`, step: "a simple review-request routine" });
  } else if (b.flags.includes("FEW_REVIEWS")) {
    add({ key: "reviews", lack: `you have only ${b.reviewCount ?? "a few"} Google reviews`, step: "a simple review-request routine" });
  }
  if (!b.instagramUrl && !b.linkedinUrl && !hasSocialOnWeb && (b.flags.includes("NO_SOCIAL") || !audit)) {
    add({ key: "social", lack: "I couldn't find an active Instagram or LinkedIn page for the business", step: "a steady social presence" });
  }
  if (!out.length && b.website) {
    add({ key: "growth", lack: "there's room to turn more of your website visitors into enquiries", step: "a clearer path from your homepage to an enquiry" });
  }
  return out.sort((x, y) => priorityOf(y.key) - priorityOf(x.key));
}

/** Same business always gets the same wording; different businesses get different wording (and subject lines, to compare). */
function pick<T>(seed: string, options: T[]): T {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return options[h % options.length];
}

const listText = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : xs[0]);
const domainOf = (url: string) => url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/.*$/, "");

/** First line: something specific we actually looked at. */
function opener(b: BusinessDTO, audit: AuditResult | null, research: Research | null): string {
  const listed = research?.listings.slice(0, 2) ?? [];
  const praise =
    b.googleRating != null && b.googleRating >= 4.3 && (b.reviewCount ?? 0) >= 10
      ? ` Your ${b.googleRating.toFixed(1)}★ rating from ${b.reviewCount} reviews says a lot about how your customers feel.`
      : "";
  if (b.website && audit?.baseline && !audit.baseline.fetchError) {
    const site = domainOf(b.website);
    return `${pick(b.id + "o", [`I spent a few minutes on ${site}`, `I was looking through ${site}`, `I had a look at ${site}`])}${listed.length ? ` and your ${listText(listed)} listing${listed.length > 1 ? "s" : ""}` : ""}.${praise}`;
  }
  if (listed.length) return `I came across ${b.name} on ${listText(listed)}.${praise}`;
  const where = b.locality && b.locality !== b.city ? `${b.locality}, ${b.city}` : b.city;
  const k = kindOf(b);
  const niche = nicheById(b.niche)?.label.toLowerCase() ?? (k ? (k.endsWith("shop") ? `${k}s` : `${k} businesses`) : "local businesses");
  return `I came across ${b.name} while looking at ${niche} in ${where === "Unspecified" ? "your area" : where}.${praise}`;
}

/** Proof is only mentioned to businesses in a matching industry; a packaging project means nothing to a steakhouse. */
export function proofMatches(b: BusinessDTO, p: SenderProfile): boolean {
  const words = p.recentWorkMatch.split(",").map((w) => w.trim().toLowerCase()).filter(Boolean);
  const text = `${b.niche ?? ""} ${b.industry ?? ""} ${b.name}`.toLowerCase();
  return !!p.recentWork.trim() && (words.length === 0 || words.some((w) => text.includes(w)));
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** What the site already offers, in customer terms ("book a table", "enquire about private events"). */
export function existingFeatures(b: BusinessDTO, audit: AuditResult | null): string[] {
  const bl = audit?.baseline;
  if (!bl || bl.fetchError || !bl.features) return [];
  const t = goalFor(b).type;
  const out: string[] = [];
  if (bl.features.booking) out.push(t === "a restaurant or cafe" ? "book a table" : t === "an appointment-based business" ? "book an appointment" : "book online");
  if (bl.features.events) out.push("enquire about private events");
  if (bl.features.ordering) out.push("order online");
  if (bl.formCount > 0 && !bl.features.events) out.push("send an enquiry");
  if (bl.widgets.whatsapp) out.push("message you on WhatsApp");
  if (bl.features.newsletter) out.push("subscribe for updates");
  return out;
}

/** The main opportunity, said plainly and without assuming they're losing money. Only for big, verified issues. */
const OPPORTUNITY: Record<string, (ctx: { n: string; site: string; what: string; where: string; score: string | null }) => string> = {
  website: ({ n, what, where }) => `I couldn't find a website for ${n}. A simple, well-made site would give people searching for ${what} in ${where} a direct way to find you and get in touch.`,
  // No "your site is down": a failed check from our server may just be the site blocking automated visitors.
  https: () => `The site isn't on HTTPS yet, so some browsers show a "Not secure" label next to it. It's a quick thing to fix, and it helps visitors trust the site.`,
  mobile: () => `The site isn't fully set up for phones, so there may be an opportunity to make it easier to use on mobile, where most visitors now browse.`,
  speed: ({ score }) => `The site loads slowly on phones${score ? ` (Google's mobile score is ${score}/100)` : ""}, so there may be an opportunity to make it faster for the many visitors who browse on mobile.`,
  leads: () => `I couldn't see an enquiry form, booking link or chat on the homepage, so there may be an opportunity to give interested visitors a quicker way to get in touch.`,
};

interface Area { key: string; text: string }

/** Three areas to explore: one from the main opportunity, two from what matters for their type of business (never something they already have). */
export function areasFor(b: BusinessDTO, mainKey: string | null, audit: AuditResult | null): string[] {
  const feat = audit?.baseline?.features;
  const tracking = audit?.baseline?.tracking;
  const hasTracking = !!(tracking?.ga4 || tracking?.gtm);
  const { type, goal } = goalFor(b);
  const first: Record<string, Area> = {
    website: { key: "web", text: `Website: a simple, fast site that shows what you offer and makes it easy to ${type === "a restaurant or cafe" ? "book a table" : type === "an appointment-based business" ? "book an appointment" : "get in touch"}.` },
    down: { key: "web", text: "Website reliability: make sure the site loads quickly and dependably for every visitor." },
    https: { key: "web", text: "Website trust: secure the site with HTTPS and tidy up the details visitors notice first." },
    mobile: { key: "web", text: "Mobile experience: make the site easy to read and use on any phone." },
    speed: { key: "web", text: "Mobile speed: make the site load faster on phones, where most visitors browse." },
    leads: { key: "enquiry", text: `Enquiry path: a clear route from the homepage to ${type === "a restaurant or cafe" ? "a booking or enquiry" : "an enquiry"}.` },
  };
  const enquiryFromFeatures: Area = feat?.events
    ? { key: "enquiry", text: "Enquiry optimisation: make the journey from discovering your private hire and group options to sending an enquiry as straightforward as possible." }
    : feat?.booking
      ? { key: "enquiry", text: `Booking journey: make the path from your homepage to a confirmed ${type === "a restaurant or cafe" ? "table" : "booking"} as short and clear as possible.` }
      : { key: "enquiry", text: `Enquiry optimisation: make it as easy as possible for interested visitors to turn into ${goal}.` };
  const pool: Record<string, Area[]> = {
    "a restaurant or cafe": [
      { key: "retention", text: feat?.newsletter ? "Customer retention: make more of your email list with targeted campaigns around upcoming events, seasonal offers and new menus, to encourage repeat visits." : "Customer retention: a simple email or WhatsApp list for events, seasonal offers and new menus, to encourage repeat visits." },
      { key: "measure", text: hasTracking ? "Marketing measurement: review your conversion tracking to see which channels bring bookings and enquiries, and what could be improved." : "Marketing measurement: set up tracking so you can see which channels bring bookings and enquiries." },
      { key: "content", text: "Visual content: photos and short videos of your food and space that make people want to visit." },
    ],
    "an appointment-based business": [
      ...(feat?.booking ? [] : [{ key: "booking", text: "Online booking: let new clients book an appointment from your website and Google listing at any time." }]),
      { key: "retention", text: "Client retention: friendly reminders and follow-ups that bring clients back for their next visit." },
      { key: "reviews", text: "Reputation: a simple routine for collecting Google reviews from happy clients." },
      { key: "measure", text: "Marketing measurement: see which channels bring booked appointments." },
    ],
    "a project-based business": [
      { key: "portfolio", text: "Portfolio: a clear showcase of your best recent projects, with photos and short stories." },
      { key: "qualify", text: "Qualified enquiries: an enquiry form that captures budget and timeline, so every lead is easier to follow up." },
      { key: "measure", text: "Marketing measurement: see which channels bring your best enquiries." },
    ],
    "a store": [
      { key: "catalogue", text: "Product discovery: a simple online catalogue of your best products, so people can browse before visiting." },
      { key: "retention", text: "Customer retention: emails or WhatsApp updates about new arrivals and offers, to bring customers back." },
      { key: "content", text: "Social content: regular posts and reels that show new products." },
    ],
    "a manufacturer or supplier": [
      { key: "catalogue", text: "Product catalogue: clear product pages with specifications that buyers can share internally." },
      { key: "profile", text: "Company profile: a professional profile for buyers and distributors that builds trust before the first call." },
      { key: "qualify", text: "Buyer enquiries: an enquiry form that captures quantities and requirements up front." },
    ],
    "a business like yours": [
      { key: "retention", text: "Customer retention: simple follow-ups that bring customers back." },
      { key: "content", text: "Social content: regular posts that show what you do." },
      { key: "measure", text: "Marketing measurement: see which channels bring new customers." },
    ],
  };
  const out: Area[] = [mainKey && first[mainKey] ? first[mainKey] : enquiryFromFeatures];
  for (const a of pool[type] ?? pool["a business like yours"]) {
    if (out.length >= 3) break;
    if (!out.some((o) => o.key === a.key)) out.push(a);
  }
  return out.slice(0, 3).map((a) => a.text);
}

export interface Prices {
  starting: string;
  website: string | null;
}

function introLine(p: SenderProfile): string {
  return p.senderTitle.trim()
    ? `I'm ${p.senderName}, ${p.senderTitle.trim().toLowerCase()} of ${p.companyName}, ${p.about}.`
    : `I'm ${p.senderName} from ${p.companyName}, ${p.about}.`;
}

function signature(p: SenderProfile, site: string): string[] {
  return [
    p.senderName,
    ...(p.senderTitle.trim() ? [`${p.senderTitle.trim()}, ${p.companyName}`] : p.senderName.includes(p.companyName) ? [] : [p.companyName]),
    site,
    ...(p.phone ? [p.phone] : []),
    ...(p.address ? [p.address] : []),
  ];
}

const OPT_OUT = `P.S. If this isn't relevant, just reply "no thanks" and I won't write again.`;

/**
 * Short (about 150 words): a specific opening, one verified opportunity (two at most), a brief intro,
 * three areas to explore, cost-effective positioning, and a one-page plan as the offer.
 */
export function composeColdEmail(b: BusinessDTO, audit: AuditResult | null, p: SenderProfile, _prices: Prices, research: Research | null = null): { subject: string; body: string; focus: string } {
  const n = b.name;
  const site = p.website.replace(/\/$/, "");
  const where = b.locality && b.locality !== b.city ? `${b.locality}, ${b.city}` : b.city === "Unspecified" ? "your area" : b.city;
  const kind = kindOf(b);
  const what = (b.niche && SEARCH_TERM[b.niche]) || (kind ? `${/^[aeiou]/.test(kind) ? "an" : "a"} ${kind}` : "a business like yours");
  const { goal } = goalFor(b);
  const score = (audit?.gaps.find((g) => g.id === "mobile-speed")?.evidence.match(/score (\d+)/)?.[1]) ?? null;
  const big = findingsFor(b, audit, research).filter((x) => x.key in OPPORTUNITY);
  const main = big[0] ?? null;
  const has = existingFeatures(b, audit);
  const ctx = { n, site: b.website ? domainOf(b.website) : "", what, where, score };

  let insight: string;
  if (main) {
    insight = `${has.length ? `I noticed your website already lets visitors ${listText(has)}. ` : ""}${OPPORTUNITY[main.key](ctx)}`;
    if (big[1]) insight += ` ${OPPORTUNITY[big[1].key](ctx).replace(/^The site/, "Separately, the site")}`;
  } else if (has.length) {
    insight = `I noticed your website already lets visitors ${listText(has)}. There may be an opportunity to connect these touchpoints more effectively, helping turn more interest into ${goal}${/repeat/.test(goal) ? "" : " and encouraging customers to come back"}.`;
  } else {
    insight = `There may be an opportunity to turn more of the people who find ${n} online into ${goal}.`;
  }
  const areas = areasFor(b, main?.key ?? null, audit);
  const focus = areas[0].split(":")[0].toLowerCase();
  const subjectsByType: Record<string, string> = {
    "a restaurant or cafe": audit?.baseline?.features?.events ? `An idea for ${n}'s event enquiries` : `An idea for ${n}'s bookings`,
    "an appointment-based business": `An idea for ${n}'s appointment bookings`,
    "a manufacturer or supplier": `An idea for ${n}'s buyer enquiries`,
  };
  const subject = pick(b.id + "s", [
    subjectsByType[goalFor(b).type] ?? `An idea for ${n}'s customer enquiries`,
    `A thought on ${n}'s online customer journey`,
    `A growth opportunity for ${n}`,
  ]);
  const lines = [
    pick(b.id + "g", [`Hi ${n} team,`, `Hello ${n} team,`]),
    "",
    opener(b, audit, research),
    "",
    insight,
    "",
    introLine(p),
    "",
    `For ${n}, I'd explore three areas:`,
    ...areas.map((a) => `- ${a}`),
    "",
    `We focus on high-quality work at cost-effective prices, with transparent, clearly scoped projects. Rather than proposing a large, expensive overhaul, we'd prioritise the changes most relevant to your goals and budget.`,
    ...(proofMatches(b, p) ? [`Recently, ${p.recentWork.trim().replace(/\.$/, "")}.`] : []),
    ...(p.testimonial.trim() ? [`As one of our clients put it: ${p.testimonial.trim()}`] : []),
    "",
    `Would it be helpful if I sent you a one-page plan outlining three opportunities specifically for ${n}, along with our recommended priorities?`,
    "",
    "Best regards,",
    ...signature(p, site),
    "",
    OPT_OUT,
  ];
  return { subject, body: lines.join("\n"), focus };
}

/** One short follow-up in the same thread, sent once if there's no reply. */
export function composeFollowUp(b: BusinessDTO, originalSubject: string, focus: string | null, p: SenderProfile): { subject: string; body: string } {
  const site = p.website.replace(/\/$/, "");
  return {
    subject: /^re:/i.test(originalSubject) ? originalSubject : `Re: ${originalSubject}`,
    body: [
      `Hi ${b.name} team,`,
      "",
      `Just following up on my note from last week${focus ? ` about ${focus}` : ""} for ${b.name}. I'm happy to send the one-page plan if it would be useful, and if now isn't the right time, no problem at all.`,
      "",
      "Best regards,",
      ...signature(p, site),
      "",
      OPT_OUT,
    ].join("\n"),
  };
}
