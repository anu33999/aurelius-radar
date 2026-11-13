import { inLocation } from "@/lib/studio";
import fs from "node:fs";
import path from "node:path";
import { askJson, aiEnabled } from "@/lib/ai/anthropic";
import type { AuditResult, Baseline, Gap, PitchPack, ServiceMatchGroup } from "@/lib/types";

interface ProofConfig {
  senderName: string;
  senderTitle: string;
  website: string;
  points: { text: string; named: boolean }[];
}

function loadProof(): ProofConfig {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), "data", "proof.json"), "utf8");
    return JSON.parse(raw) as ProofConfig;
  } catch {
    return { senderName: "Team Kreatif Atelier", senderTitle: "Aurelius", website: "https://www.kreatifatelier.com", points: [] };
  }
}

/** Short, plain-language observation for a gap. Never overstates unverifiable items. */
function observation(g: Gap): string {
  switch (g.id) {
    case "mobile-speed":
      return g.evidence.split(". ")[0] + ", which tends to push up cost per acquisition on mobile ad traffic";
    case "no-viewport":
      return "your site has no mobile viewport tag, so phones may get a shrunken desktop layout";
    case "no-analytics":
      return "I couldn't see GA4 or Google Tag Manager in your site's public markup";
    case "no-ad-pixels":
      return "I couldn't see any ad pixel (Meta, Google Ads, TikTok, LinkedIn) in your public markup";
    case "no-lead-capture":
      return "the page I looked at has no enquiry form, WhatsApp link or chat widget";
    case "no-whatsapp":
      return "there is no WhatsApp entry point on the page I looked at";
    case "abandoned-cart":
      return "it looks like a transactional store, and I can't tell whether cart-recovery flows are running";
    case "no-local-schema":
      return "there's no Organization or LocalBusiness structured data, which weakens local and entity signals";
    case "no-sitemap":
      return "I couldn't find an XML sitemap";
    case "no-meta-desc":
      return "the page has no meta description";
    case "no-instagram":
      return "your site doesn't link to an Instagram profile";
    default:
      return g.title.charAt(0).toLowerCase() + g.title.slice(1);
  }
}

function pickObservations(gaps: Gap[]): Gap[] {
  const confirmed = gaps.filter((g) => g.status === "CONFIRMED");
  const likely = gaps.filter((g) => g.status === "LIKELY");
  return [...confirmed, ...likely].slice(0, 3);
}

function servicesLine(match: ServiceMatchGroup): string {
  const names = [...match.quickWins, ...match.coreGrowth].slice(0, 3).map((m) => m.service.name);
  return names.join(", ");
}

function templatePitch(a: Pick<AuditResult, "businessName" | "website" | "gaps" | "match">, monthlyBudget?: string | null): Omit<PitchPack, "score"> {
  const proof = loadProof();
  const obs = pickObservations(a.gaps);
  const first = obs[0];
  const usableProof = proof.points.find((p) => !/TODO/i.test(p.text))?.text;
  const proofSentence = usableProof ?? "We build and run growth systems for commercial brands for clients across several markets.";
  const sig = `${proof.senderName}\n${proof.senderTitle}\n${proof.website}`;
  const obsBullets = obs.map((o) => `- ${observation(o)}`).join("\n");
  const fix = servicesLine(a.match) || "a short list of quick fixes";
  const name = a.businessName;

  const coldEmail = {
    subject: first ? `A quick observation on ${name}'s ${first.tags.includes("speed") ? "mobile speed" : first.tags.includes("tracking") ? "tracking" : "website"}` : `A quick note on ${name}'s growth stack`,
    body: `Hi ${name} team,

I looked at ${a.website ?? "your website"} and noticed a few things worth flagging:

${obsBullets || "- Nothing alarming on the surface, but there are a couple of conversion opportunities worth a conversation."}

Why it matters: each of these quietly leaks revenue, either by wasting paid traffic or by losing enquiries that were already interested.

What we'd suggest: start with ${fix}. These can be scoped as a short, low-risk first engagement.

${proofSentence}

Would you be open to a 15-minute call this week? I'll bring a one-page summary of what I found.

${sig}`,
  };

  const whatsapp = `Hi! Quick note on ${name}'s website:
${obs.map((o) => `• ${observation(o)}`).join("\n") || "• A couple of quick conversion wins I spotted"}
Happy to send a 1-page breakdown. Worth a 15-min call this week? – ${proof.senderName}`;

  const linkedinInMail = `Hi, I was reviewing ${name}'s digital presence and one thing stood out: ${first ? observation(first) : "there's some untapped conversion headroom"}. For teams at your stage that is usually where paid and organic spend quietly underperforms. We've put together a short teardown with the quick wins first. Open to me sending it over? – ${proof.senderName}, ${proof.senderTitle}`;

  const coldCallScript = `OPENER (10s): "Hi, this is ${proof.senderName} from Kreatif Atelier${inLocation()}. I'm calling because I was on ${name}'s website and noticed something specific. Do you have 30 seconds?"

OBSERVATION: "${first ? observation(first).charAt(0).toUpperCase() + observation(first).slice(1) : "I saw a couple of conversion gaps"}."

BRIDGE: "Most businesses we speak to didn't realise it was costing them enquiries or ad efficiency. We fix that for commercial brands."

ASK: "I can send a one-page teardown and we can walk through it in 15 minutes. Does tomorrow or Thursday work better?"

IF NOT NOW: "No problem. Can I send the summary on WhatsApp so you can look when convenient?"`;

  const discoveryQuestions = [
    "Where does most of your revenue or pipeline come from today, and what share is paid versus organic or referral?",
    "What are you spending monthly on paid media, and which platforms? What ROAS or CPA are you trying to hold?",
    "How do you currently track a lead or sale from first click to closed revenue?",
    "How quickly do enquiries get a response, and who handles them (WhatsApp, calls, CRM)?",
    "Do you run any email or WhatsApp flows for abandoned carts, repeat purchase or lead nurture?",
    "Who owns the website and tracking today, and what has been tried and dropped?",
    "What would make this a clear win in 90 days?",
    "What is the decision process and who else needs to be involved?",
  ];

  const q = [...a.match.quickWins, ...a.match.coreGrowth];
  const proposal = {
    scope: q.length ? q.map((m) => `${m.service.name} (${m.service.practiceArea}): ${m.because}`) : ["Scope to be defined after the discovery call."],
    deliverables: [
      "Audit readout and prioritised 90-day roadmap",
      ...a.match.quickWins.slice(0, 3).map((m) => `${m.service.name}: implemented and documented`),
      "Monthly performance report with commentary",
    ],
    kpis: ["ROAS (paid channels)", "Cost per acquisition / cost per lead", "Landing-page and checkout conversion rate", "Non-branded organic visibility and target keyword rank", "Lead response time"],
    sla: ["Quick wins delivered within the agreed sprint window", "Weekly status update; monthly review call", "Response to client queries within one business day"],
    commercials: monthlyBudget
      ? `Proposed monthly retainer / budget: ${monthlyBudget}. Final scope and fees to be confirmed after discovery.`
      : "Monthly retainer or project fee to be set after the discovery call, based on confirmed scope. No figure has been assumed in this draft.",
  };

  return { generatedBy: "TEMPLATE", coldEmail, whatsapp, linkedinInMail, coldCallScript, discoveryQuestions, proposal };
}

/** Deterministic rubric so the score is explainable and identical for AI and template drafts. */
export function scorePitch(
  pack: Omit<PitchPack, "score">,
  gaps: Gap[],
  businessName: string,
): PitchPack["score"] {
  const proof = loadProof();
  const confirmed = gaps.filter((g) => g.status === "CONFIRMED").length;
  const likely = gaps.filter((g) => g.status === "LIKELY").length;

  let research = Math.min(40, Math.round(10 * (confirmed + likely * 0.5)));
  const nameInEmail = pack.coldEmail.body.toLowerCase().includes(businessName.toLowerCase().split(" ")[0]);
  const note: string[] = [`${confirmed} confirmed and ${likely} likely observations available`];
  if (!nameInEmail) {
    research = Math.max(0, research - 10);
    note.push("email does not reference the business by name (-10)");
  }

  const usable = proof.points.filter((p) => !/TODO/i.test(p.text)).length;
  const proofPts = Math.min(30, usable * 10);

  const ctaEmail = /(call|chat|reply|book|slot|walk through|meet)/i.test(pack.coldEmail.body);
  const ctaWa = /(call|chat|reply|book|breakdown)/i.test(pack.whatsapp);
  const timeBoxed = /(15[- ]minute|15-min|this week|tomorrow)/i.test(pack.coldEmail.body + pack.whatsapp);
  const cta = (ctaEmail ? 15 : 0) + (ctaWa ? 10 : 0) + (timeBoxed ? 5 : 0);

  return {
    total: Math.min(100, research + proofPts + cta),
    rubric: [
      { criterion: "Research depth", points: research, max: 40, note: note.join("; ") },
      {
        criterion: "Commercial proof",
        points: proofPts,
        max: 30,
        note: usable > 0 ? `${usable} usable proof point(s) in data/proof.json` : "No usable proof points yet. Add real, cleared outcomes to data/proof.json (placeholders marked TODO earn nothing).",
      },
      { criterion: "Clear CTA", points: cta, max: 30, note: `${ctaEmail ? "email CTA" : "no email CTA"}, ${ctaWa ? "WhatsApp CTA" : "no WhatsApp CTA"}, ${timeBoxed ? "time-boxed ask" : "no time-boxed ask"}` },
    ],
  };
}

const AI_SYSTEM = `You write B2B outreach for Kreatif Atelier (Aurelius practice), a digital marketing and brand studio selling remotely to commercial businesses in international markets (US, Canada, UK, Europe, Middle East, Asia-Pacific, Australia). Write in clear international English, avoid local slang and idioms, never assume the prospect's country beyond what the audit shows, and do not mention the studio's own location unless asked.
Rules:
- Use ONLY facts in the audit JSON and proof points provided. Never invent statistics, clients, results, prices or competitor claims.
- Items marked UNVERIFIABLE or LIKELY must be phrased as questions or "I couldn't see..." - never as confirmed failures. Never claim a business runs no ads just because a pixel was not detected.
- Do not invent prices. Use the commercials note provided.
- Tone: peer-to-peer, specific, concise, no hype. Plain text only, no markdown.
- Output ONLY a JSON object, no commentary.`;

export async function generatePitch(
  a: Pick<AuditResult, "businessName" | "website" | "baseline" | "gaps" | "match">,
  monthlyBudget?: string | null,
): Promise<{ pitch: PitchPack; warnings: string[] }> {
  const fallback = templatePitch(a, monthlyBudget);
  const warnings: string[] = [];
  let pack: Omit<PitchPack, "score"> = fallback;

  if (aiEnabled()) {
    try {
      const proof = loadProof();
      const payload = {
        business: a.businessName,
        website: a.website,
        topGaps: a.gaps.slice(0, 8).map((g) => ({ title: g.title, status: g.status, evidence: g.evidence })),
        quickWins: a.match.quickWins.map((m) => ({ service: m.service.name, because: m.because })),
        coreGrowth: a.match.coreGrowth.map((m) => ({ service: m.service.name, because: m.because })),
        doNotPitch: a.match.doNotPitch,
        proofPoints: proof.points.map((p) => p.text),
        sender: { name: proof.senderName, title: proof.senderTitle, website: proof.website },
        commercialsNote: fallback.proposal.commercials,
      };
      const out = await askJson<Omit<PitchPack, "score" | "generatedBy">>(
        AI_SYSTEM,
        `Write the full outreach pack for this prospect. JSON shape:
{"coldEmail":{"subject":string,"body":string},"whatsapp":string,"linkedinInMail":string,"coldCallScript":string,"discoveryQuestions":string[],"proposal":{"scope":string[],"deliverables":string[],"kpis":string[],"sla":string[],"commercials":string}}
Cold email structure: Problem, Observation, Solution, Proof, then a clear CTA. WhatsApp: punchy, exactly 3 bullet insights. Proposal KPIs must include ROAS, CPA, conversion rate and search rank.

AUDIT:\n${JSON.stringify(payload, null, 2)}`,
        5000,
      );
      if (out.coldEmail?.body && out.whatsapp && out.proposal?.scope) {
        pack = { generatedBy: "AI", ...out, discoveryQuestions: out.discoveryQuestions ?? fallback.discoveryQuestions } as Omit<PitchPack, "score">;
      } else {
        warnings.push("AI pitch response was incomplete; template used.");
      }
    } catch (e) {
      warnings.push(`AI pitch generation failed (${e instanceof Error ? e.message : "error"}); template used.`);
    }
  }

  return { pitch: { ...pack, score: scorePitch(pack, a.gaps, a.businessName) }, warnings };
}

export function baselineTechStack(b: Baseline | null): string | null {
  if (!b) return null;
  const parts: string[] = [];
  if (b.cms) parts.push(b.cms.name);
  if (b.tracking.ga4) parts.push("GA4");
  if (b.tracking.gtm) parts.push("GTM");
  if (b.tracking.metaPixel) parts.push("Meta Pixel");
  if (b.tracking.googleAds) parts.push("Google Ads tag");
  if (b.tracking.tiktokPixel) parts.push("TikTok Pixel");
  if (b.tracking.linkedinInsight) parts.push("LinkedIn Insight");
  if (b.widgets.crm) parts.push(b.widgets.crm);
  if (b.widgets.liveChat) parts.push(b.widgets.liveChat);
  return parts.length ? parts.join(", ") : null;
}
