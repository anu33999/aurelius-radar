import { askJson, aiEnabled } from "./anthropic";
import type { IntentCategory, ServiceDef } from "@/lib/types";

export interface Candidate {
  platform: string;
  title: string;
  content: string;
  url: string;
}

export interface Classification {
  category: IntentCategory | "REJECT";
  painPoint: string | null;
  serviceTags: string[];
  confidence: number;
  by: "AI" | "RULES";
  reason: string;
}

/* ------------------------------------------------------------------ */
/* keyword -> matcher tags                                             */
/* ------------------------------------------------------------------ */

const TAG_KEYWORDS: [string, RegExp][] = [
  ["web", /\b(website|web ?site|web developer|web designer|landing page|redesign|shopify|wordpress|webflow|web app)\b/i],
  ["performance-ads", /\b(meta ads|facebook ads|instagram ads|google ads|ppc|paid (social|media|ads)|roas|cpa|ad spend|run ads|ads? (agency|manager))\b/i],
  ["seo", /\b(seo|search engine|organic traffic|rank(ing)? on google|backlinks?)\b/i],
  ["local-seo", /\b(google business|gbp|local seo|near me|google maps)\b/i],
  ["social", /\b(social media|instagram|community manager|content calendar|linkedin content)\b/i],
  ["video", /\b(reels?|short[- ]form|video editor|video content|youtube|tiktok|videographer)\b/i],
  ["automation", /\b(automation|automate|zapier|make\.com|n8n|workflow|whatsapp (api|bot|automation))\b/i],
  ["crm", /\b(crm|hubspot|zoho|salesforce|lead (tracking|management)|pipeline)\b/i],
  ["email", /\b(email marketing|klaviyo|mailchimp|newsletter|abandoned cart|drip)\b/i],
  ["cro", /\b(conversion rate|conversions?|cro|bounce rate|checkout|landing page converts?|traffic but no (sales|conversions?))\b/i],
  ["branding", /\b(brand(ing)?|rebrand|logo|identity|packaging|brand strategy)\b/i],
  ["lead-gen", /\b(lead gen|leads?|b2b leads?|outbound|cold email|appointment setting|demand gen)\b/i],
  ["tracking", /\b(tracking|ga4|google analytics|pixel|attribution|conversion api|capi|gtm)\b/i],
  ["pr", /\b(press|pr agency|media coverage|journalists?)\b/i],
  ["ai", /\b(ai (agent|chatbot|assistant)|chatbot|gpt)\b/i],
];

export function tagsFromText(text: string): string[] {
  const tags = new Set<string>();
  for (const [tag, re] of TAG_KEYWORDS) if (re.test(text)) tags.add(tag);
  return [...tags];
}

export function matchServiceCodes(tags: string[], catalogue: ServiceDef[], limit = 3): string[] {
  return catalogue
    .map((s) => ({ s, hits: s.tags.filter((t) => tags.includes(t)).length }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits || a.s.code.localeCompare(b.s.code))
    .slice(0, limit)
    .map((x) => x.s.code);
}

/* ------------------------------------------------------------------ */
/* rule-based classifier (fallback and pre-filter)                     */
/* ------------------------------------------------------------------ */

/**
 * Seller detection. The radar only wants people who NEED marketing/web/automation help, so
 * anything that reads like a freelancer, agency, consultant or recruiter advertising themselves
 * is rejected. Signals are weighted: one strong signal (2) or two weak ones (1+1) reject a post.
 */
const SELLER_SIGNALS: { name: string; weight: 1 | 2; re: RegExp }[] = [
  { name: "for-hire tag", weight: 2, re: /(\[for hire\]|\[offer\]|\[services?\]|\bfor hire\b|#forhire|\bavailable for (hire|work|projects|freelance)\b|\bhire me\b)/i },
  { name: "offers services", weight: 2, re: /\b(we|i)('ll| will| can)? ?(help|helps|specialize|specialise|build|design|create|manage|grow|scale|offer|offers|provide|provides|deliver|delivers|run|do)\b[^.!?\n]{0,70}\b(brands?|businesses|founders|clients|startups|companies|ecommerce stores?|your (business|brand|website|store|socials?|ads?|leads))\b/i },
  { name: "agency/studio self-reference", weight: 2, re: /\b(my|our) (own )?(agency|studio|services|case stud(y|ies))\b/i },
  { name: "mentions own clients", weight: 1, re: /\b(my|our) (clients|customers' campaigns|team of)\b/i },
  { name: "we are an agency", weight: 2, re: /\b(we('| a)re|i('| a)m) (an?|the) ([a-z-]+ ){0,3}(agency|studio|consultancy|consultant|freelancer|marketer|copywriter|developer|designer)\b|\bagency (owner|founder)\b|\bfounder of (an? )?[a-z ]{0,25}(agency|studio)\b/i },
  { name: "looking for clients", weight: 2, re: /\b(looking for|seeking|searching for|need|want|get(ting)?) (new |more |paying |potential |serious |genuine |long[- ]term )?(clients?|projects|gigs|freelance (work|projects)|businesses to work with|brands to work with)\b/i },
  { name: "taking bookings", weight: 2, re: /\b(accepting|taking|open (for|to)) (new )?(clients|projects|bookings|orders)\b|\b(slots|spots) (available|open|left)\b|\blimited (slots|spots)\b/i },
  { name: "call to contact", weight: 2, re: /\b(dm|message|pm|inbox|whatsapp|email) (me|us)\b[^.!?\n]{0,30}\b(for|to (get|know|discuss|book|start|learn)|if you (need|want|re looking|are looking|'re looking))\b|\bcontact (me|us) (at|on|for|today)\b|\blink in (bio|comments?)\b/i },
  { name: "booking CTA", weight: 2, re: /\b(book|schedule|claim|grab|get) (a |your )?(free )?(call|consultation|consult|audit|strategy session|discovery call|demo|slot|mockup)\b|\bfree (audit|consultation|strategy call|mockup|quote)\b/i },
  { name: "pricing pitch", weight: 2, re: /\b(starting|starts|start|packages?|plans?|only|just) (at|from)? ?[$₹€£]\s?\d|\b(starting|packages?) (at|from)\b/i },
  { name: "portfolio/credentials", weight: 1, re: /\b(check out|visit|see) (my|our) (portfolio|work|services|profile)\b|\bportfolio\b|\bi have \d+\+? years?\b|\b\d+\+? years? (of )?experience\b|\bhelped \d+\+? ?(brands|clients|businesses|companies|startups)\b/i },
  { name: "offers to help the reader", weight: 1, re: /\b(i|we) can help (you|your)\b|\blet (me|us) help\b|\bhappy to help\b|\bhere to help\b|\bwe specialize\b|\bi specialise\b/i },
  { name: "freelancer identity", weight: 1, re: /\b(freelance|freelancer|digital marketer|seo (expert|specialist|consultant)|ppc (expert|specialist)|social media (manager|marketer)|growth (marketer|hacker)|copywriter|video editor|graphic designer|web designer)\b[^.!?\n]{0,40}\b(here|with|offering|helping)\b/i },
  { name: "job ad", weight: 2, re: /\b(apply (now|here|via|at)|send (your )?(cv|resume)|job description|full[- ]time (role|position)|part[- ]time (role|position)|salary|we are hiring|we're hiring|join our team|careers? page|years of experience required|(stipend|ctc)\b)/i },
  { name: "listicle/promo", weight: 2, re: /\b(top|best) \d+\b.*\b(agencies|companies|firms)\b|\b\d+ (best|top) (digital marketing|seo|web design|ppc) (agencies|companies|firms)\b|\b(list of|ranking of) (the )?(best|top)\b/i },
  { name: "educational thread", weight: 1, re: /(^|\n)\s*(\d+\s+(tips|ways|mistakes|lessons|things)|how i (grew|got|made|scaled)|here'?s (how|what)|thread|🧵|the ultimate guide|a (complete|quick) guide)/i },
];

export function sellerSignals(text: string): { score: number; names: string[] } {
  let score = 0;
  const names: string[] = [];
  for (const sig of SELLER_SIGNALS) {
    if (sig.re.test(text)) {
      score += sig.weight;
      names.push(sig.name);
    }
  }
  return { score, names };
}

export const looksLikeSeller = (text: string) => sellerSignals(text).score >= 2;

const JOB_HUNTER =
  /(looking for (a )?(job|work|opportunit|full[- ]time role|internship)|open to (work|opportunities)|seeking (a )?(position|role|employment)|my resume|i('| a)m (a )?(fresher|graduate) looking)/i;
/** The author is speaking about their own situation or asking the community. */
const FIRST_PERSON_OR_ASK = /\?|\b(i|i'm|i've|i'd|we|we're|we've|we'd|my|our|me|us)\b/i;
const BUYER =
  /((looking|searching|hunting|in need|need|want|seeking|searching) (for )?(an? |the |some(one)? )?(good |reliable |affordable |experienced |trusted |top |best )?(digital marketing |marketing |web(site)? |ad(s)? |seo |social media |branding |creative |full[- ]service )?(agency|agencies|developer|designer|freelancer|consultant|expert|specialist|manager|team|company|studio|someone))|(who (built|designed|made) (your|this) (landing page|website|site))|(can (anyone|someone) (recommend|suggest)|any(one)? recommend|recommendations? for)\b.*\b(agency|developer|designer|freelancer|marketer|seo)|(hiring (a |an |the )?(social media|marketing|web|seo|ppc|automation|freelancer|agency|consultant|contractor|developer|designer|marketer|specialist))|(\b(want|need|looking|plan(ning)?) to hire (a |an |the )?(freelancer|agency|consultant|contractor|developer|designer|marketer|specialist|someone))|(\brfp\b)|(need (someone|somebody) to (run|build|set up|manage|design|automate))|(redesign (our|my) (website|site))|(need a (rebrand|website|landing page|logo))/i;
const ADVICE =
  /(traffic but (no|few|low) (sales|conversions|leads)|low conversion|conversion rate (is|has|dropped)|sales (are )?(flat|stagnant|plateau)|plateau(ed)?|ads? (aren't|are not|stopped|isn't|not) working|roas (is|dropped|has)|high cpa|bounce rate|why (is|are) (my|our) (website|ads|sales|traffic)|not getting (leads|sales|enquiries|conversions)|marketing (isn't|is not) working|burning (money|cash) on ads|how (do|can) i (get|increase|improve) (leads|sales|conversions))/i;

function firstSentenceMatching(text: string, re: RegExp): string | null {
  const sentences = text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/);
  const hit = sentences.find((s) => re.test(s));
  return hit ? hit.slice(0, 240) : null;
}

export function classifyByRules(c: Candidate): Classification {
  const text = `${c.title}\n${c.content}`;
  const seller = sellerSignals(text);
  if (seller.score >= 2) {
    return { category: "REJECT", painPoint: null, serviceTags: [], confidence: 90, by: "RULES", reason: `Seller, not a buyer (${seller.names.join(", ")})` };
  }
  if (JOB_HUNTER.test(text)) return { category: "REJECT", painPoint: null, serviceTags: [], confidence: 85, by: "RULES", reason: "Looks like a job seeker" };
  const tags = tagsFromText(text);
  const ownVoice = FIRST_PERSON_OR_ASK.test(text);
  if (ownVoice && BUYER.test(text)) {
    return { category: "BUYER_HIRING", painPoint: firstSentenceMatching(text, BUYER) ?? c.title.slice(0, 200), serviceTags: tags, confidence: seller.score === 1 ? 45 : 62, by: "RULES", reason: "Hiring/recommendation language" };
  }
  if (ownVoice && /\b(my|our|i|we)\b/i.test(text) && ADVICE.test(text) && seller.score === 0) {
    return { category: "ADVICE_SEEKING", painPoint: firstSentenceMatching(text, ADVICE) ?? c.title.slice(0, 200), serviceTags: tags, confidence: 55, by: "RULES", reason: "Describes their own conversion or growth problem" };
  }
  return { category: "REJECT", painPoint: null, serviceTags: [], confidence: 60, by: "RULES", reason: "No buying or advice-seeking signal" };
}

/* ------------------------------------------------------------------ */
/* AI classifier                                                       */
/* ------------------------------------------------------------------ */

const SYSTEM = `You classify public social posts for a digital marketing agency's lead radar.
The agency wants ONLY people who NEED marketing, web, SEO, ads, automation, branding or content help. It does NOT want people who SELL those services.
For each post return one category:
- BUYER_HIRING: the author (a business owner, founder, marketer or manager) is explicitly looking to hire or get recommendations for an agency, freelancer or contractor for marketing, web, SEO, ads, automation, branding or content for their own business.
- ADVICE_SEEKING: the author is a business owner/founder asking about THEIR OWN poor conversions, plateaued growth, ads or marketing not working, so they are a warm prospect.
- REJECT: everything else, in particular:
  * freelancers, agencies, consultants, developers or marketers advertising, offering or promoting services, "for hire" posts, portfolios, free audits, "DM me", pricing, case studies, "we help brands...", "I can help you...", or replies offering help
  * posts looking for CLIENTS or projects
  * job ads and recruiters hiring employees, job hunters, students
  * educational threads, tips, listicles, "best agencies" lists, news, tool talk, generic discussion
Judge who is speaking: the author must be the one with the need. If the author is the one selling or teaching, REJECT, even if the post mentions agencies, ads or SEO.
Extract the single clearest pain point in one sentence (quote-free paraphrase), and pick service tags from this list only: web, performance-ads, seo, local-seo, social, video, automation, crm, email, cro, branding, lead-gen, tracking, pr, ai.
Be strict: when unsure, REJECT. Output ONLY a JSON array, one object per post, in input order:
[{"i":number,"category":"BUYER_HIRING"|"ADVICE_SEEKING"|"REJECT","painPoint":string|null,"serviceTags":string[],"confidence":0-100,"reason":string}]`;

export async function classifyBatch(items: Candidate[]): Promise<Classification[]> {
  const rules = items.map(classifyByRules);
  if (!aiEnabled() || items.length === 0) return rules;

  const out: Classification[] = [...rules];
  // Posts the rules already identify as sellers are final: the AI cannot promote them, and they cost no tokens.
  const eligible = items.map((_, i) => i).filter((i) => !looksLikeSeller(`${items[i].title}\n${items[i].content}`));
  const size = 10;
  for (let start = 0; start < eligible.length; start += size) {
    const idxs = eligible.slice(start, start + size);
    const slice = idxs.map((i) => items[i]);
    try {
      const payload = slice.map((c, k) => ({ i: k, platform: c.platform, title: c.title.slice(0, 200), content: c.content.slice(0, 900) }));
      const res = await askJson<
        { i: number; category: string; painPoint: string | null; serviceTags: string[]; confidence: number; reason: string }[]
      >(SYSTEM, JSON.stringify(payload), 3000);
      for (const r of res) {
        if (typeof r.i !== "number" || r.i < 0 || r.i >= idxs.length) continue;
        const idx = idxs[r.i];
        const cat = r.category === "BUYER_HIRING" || r.category === "ADVICE_SEEKING" ? r.category : "REJECT";
        out[idx] = {
          category: cat,
          painPoint: r.painPoint ?? null,
          serviceTags: Array.isArray(r.serviceTags) ? r.serviceTags.filter((t) => typeof t === "string") : [],
          confidence: Math.max(0, Math.min(100, Math.round(r.confidence ?? 50))),
          by: "AI",
          reason: r.reason ?? "",
        };
      }
    } catch {
      // keep rule-based results for this slice
    }
  }
  return out;
}
