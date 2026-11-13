import { countSameDomain, getCatalogue, getEmailTargets, saveAuditToBusiness, saveResearch } from "@/lib/db/repo";
import { getRates } from "@/lib/pricing";
import { runAudit } from "@/lib/audit/run-audit";
import { baselineTechStack } from "@/lib/audit/pitch";
import { searchConfigured } from "@/lib/search/providers";
import type { AuditResult, BusinessDTO, ServiceDef } from "@/lib/types";
import { findingsFor } from "./compose";
import { researchBusiness, type Research } from "./research";
import { draftFor, getProfile, pricesFor } from "./send";

/**
 * Research + personal draft for a list of businesses, shared by the review screen and the automatic
 * queue. Research = a full website audit (if it has a site and none is saved) plus one web search for
 * its listings and social pages. Both are saved, so they are never repeated.
 */
export interface Draft {
  id: string;
  name: string;
  to: string | null;
  skip?: string;
  subject?: string;
  body?: string;
  ai?: boolean;
  /** The main area pitched, named in the follow-up. */
  focus?: string;
  notes?: { audited: boolean; mobileScore: number | null; listings: string[]; socials: string[]; about: string | null; findings: string[] };
}

const MAILBOX = /@(gmail|googlemail|yahoo|ymail|outlook|hotmail|live|icloud|me|aol|rediffmail|zoho|zohomail|protonmail|proton|gmx|web|t-online|btinternet|sky|yandex|mail)\.[a-z.]+$/i;

/**
 * An address we can trust to reach this business: on the business's own website domain, or a general
 * mailbox (Gmail, Outlook…). Without a website we can't compare, so it is used as it is.
 */
const SUFFIX = new Set(["com", "co", "net", "org", "info", "biz", "io", "uk", "in", "ae", "de", "us", "au", "nz", "ca", "sg", "za", "ie", "nl", "pt", "eu", "ltd", "plc", "ac", "gov", "edu", "me", "online", "site", "shop", "store", "london", "dental", "clinic"]);

/** The name part of a domain: "mail.example.co.uk" → "example", "exceldent.co" → "exceldent". */
function brandOf(domain: string): string {
  const parts = domain.toLowerCase().split(".").filter(Boolean);
  while (parts.length > 1 && SUFFIX.has(parts[parts.length - 1])) parts.pop();
  return parts[parts.length - 1] ?? "";
}

export function emailFitsBusiness(email: string, website: string | null): boolean {
  if (MAILBOX.test(email) || !website) return true;
  const site = website.replace(/^https?:\/\/(www\.)?/i, "").replace(/[/:?#].*$/, "").toLowerCase();
  // Compare the name part of each domain, so exceldent.co and exceldent.co.uk (same business,
  // different ending) match, while doctorrichardlondon.com for wimpolestreetdental.com does not.
  return brandOf(email.split("@")[1] ?? "") === brandOf(site);
}

export const ADDRESS_NEEDED = "Add your business postal address in company details first (US law, CAN-SPAM)";

/**
 * Chains and national brands have marketing teams and aren't a fit for a first-step pitch: several
 * branches in the directory on one domain, or a website address that points to one location's page.
 */
async function looksLikeChain(b: BusinessDTO): Promise<boolean> {
  if (!b.website) return false;
  const url = b.website.replace(/^https?:\/\/(www\.)?/i, "").toLowerCase();
  const domain = url.replace(/\/.*$/, "");
  const path = url.slice(domain.length).replace(/\/$/, "");
  const citySlug = b.city.toLowerCase().replace(/[^a-z]+/g, "-");
  if (/\/(locations?|restaurants?|stores?|branches|clinics?|hotels?)\//.test(`${path}/`) || (citySlug.length > 2 && path.includes(citySlug))) return true;
  return (await countSameDomain(domain)) >= 3;
}

/** Searches are spaced out to stay under the search plan's per-minute limit. */
const SEARCH_SPACING_MS = 2200;

function parse<T>(raw: string | null): T | null {
  try {
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function auditAndSave(b: BusinessDTO, catalogue: ServiceDef[]): Promise<AuditResult | null> {
  try {
    let audit = await runAudit({ input: b.website!, catalogue });
    // The listed site won't load but their email is on another domain of theirs (exceldent.co →
    // exceldent.co.uk): they've probably moved, so audit that one rather than call the site broken.
    const emailDomain = b.email?.split("@")[1]?.toLowerCase();
    const siteDomain = b.website!.replace(/^https?:\/\/(www\.)?/i, "").replace(/[/:?#].*$/, "").toLowerCase();
    if (audit.baseline?.fetchError && emailDomain && emailDomain !== siteDomain && !MAILBOX.test(b.email!)) {
      const moved = await runAudit({ input: `https://${emailDomain}`, catalogue }).catch(() => null);
      if (moved?.baseline && !moved.baseline.fetchError) audit = moved;
    }
    const codes = [...audit.match.quickWins, ...audit.match.coreGrowth].map((m) => m.service.code);
    await saveAuditToBusiness({
      businessId: b.id,
      name: b.name,
      website: audit.website,
      techStack: baselineTechStack(audit.baseline),
      matchedServiceCodes: codes,
      readinessScore: audit.readinessScore,
      opportunityScore: audit.opportunityScore,
      pitchSummary: audit.pitch.coldEmail.subject,
      auditJson: JSON.stringify(audit),
      instagramUrl: audit.baseline?.social.instagram ?? null,
      linkedinUrl: audit.baseline?.social.linkedin ?? null,
      whatsapp: audit.baseline?.widgets.whatsappNumber ?? null,
    });
    return audit;
  } catch {
    return null;
  }
}

export async function researchAndDraft(ids: string[]): Promise<Draft[]> {
  const [targets, profile, rates, { services }] = await Promise.all([getEmailTargets(ids), getProfile(), getRates(), getCatalogue()]);
  const canSearch = searchConfigured();
  let nextSearchAt = 0;
  const out = new Map<string, Draft>();
  let next = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next < targets.length) {
        const { business: b, auditJson, researchJson } = targets[next++];
        if (!b.email) { out.set(b.id, { id: b.id, name: b.name, to: null, skip: "No email address" }); continue; }
        if (b.emailStatus === "SENT" || b.emailStatus === "SENDING" || b.emailStatus === "OPTED_OUT") {
          out.set(b.id, { id: b.id, name: b.name, to: b.email, skip: b.emailStatus === "OPTED_OUT" ? "Asked not to be emailed" : "Already sent" });
          continue;
        }
        if (!emailFitsBusiness(b.email, b.website)) {
          out.set(b.id, { id: b.id, name: b.name, to: b.email, skip: "Email address is on another company's domain, may not reach this business" });
          continue;
        }
        if (await looksLikeChain(b)) {
          out.set(b.id, { id: b.id, name: b.name, to: b.email, skip: "Looks like a chain or national brand (several locations), not a fit" });
          continue;
        }
        if (b.country === "United States" && !profile.address.trim()) {
          out.set(b.id, { id: b.id, name: b.name, to: b.email, skip: ADDRESS_NEEDED });
          continue;
        }
        const saved = parse<AuditResult>(auditJson);
        const savedResearch = parse<Research>(researchJson);
        const [audit, research] = await Promise.all([
          // Audits made before feature detection are redone, so we never suggest something the site already has.
          (!saved || (saved.baseline && !saved.baseline.fetchError && !saved.baseline.features) || (saved.baseline?.fetchError && b.email && !MAILBOX.test(b.email) && !b.website!.includes(b.email.split("@")[1]))) && b.website ? auditAndSave(b, services) : Promise.resolve(saved),
          !savedResearch && canSearch
            ? (async () => {
                const wait = Math.max(0, nextSearchAt - Date.now());
                nextSearchAt = Math.max(Date.now(), nextSearchAt) + SEARCH_SPACING_MS;
                await new Promise((res) => setTimeout(res, wait));
                try {
                  const found = await researchBusiness(b);
                  await saveResearch(b.id, found);
                  return found;
                } catch {
                  return null;
                }
              })()
            : Promise.resolve(savedResearch),
        ]);
        const d = await draftFor(b, audit, profile, pricesFor(b, profile, rates.perUSD), research);
        out.set(b.id, {
          id: b.id,
          name: b.name,
          to: b.email,
          subject: d.subject,
          body: d.body,
          ai: d.ai,
          focus: d.focus,
          notes: {
            audited: !!audit,
            mobileScore: audit?.baseline?.performance.mobileScore ?? null,
            listings: research?.listings ?? [],
            socials: Object.entries(research?.socials ?? {}).filter(([, v]) => v).map(([k]) => k),
            about: research?.about ?? audit?.baseline?.metaDescription ?? null,
            findings: findingsFor(b, audit, research).map((f) => f.lack),
          },
        });
      }
    }),
  );
  return targets.map((t) => out.get(t.business.id)!).filter(Boolean);
}
