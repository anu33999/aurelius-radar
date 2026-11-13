import { FLAG_LABEL, type ProspectFlag } from "./score";
import type { Plan } from "./plan";
import type { BusinessDTO } from "@/lib/types";
import { TIER_LABEL } from "@/lib/pricing";

/**
 * Outreach kit generated from facts we actually hold about the business. It never invents
 * statistics, results or claims about the prospect: observations are limited to listing data
 * (no website found, rating, review count) and are phrased as "I couldn't find..." not as accusations.
 */
export interface Kit {
  whatsapp: string;
  instagramDm: string;
  email: { subject: string; body: string };
  linkedin: string;
  battleCard: { objection: string; response: string }[];
  proposal: string;
}

function observation(b: BusinessDTO): string | null {
  if (!b.website) return `I couldn't find a website for ${b.name}`;
  if (b.flags.includes("LOW_RATING") && b.googleRating != null) return `${b.name} shows a ${b.googleRating.toFixed(1)}★ rating on Google, which is worth a look`;
  if (b.flags.includes("FEW_REVIEWS") && b.reviewCount != null) return `${b.name} has only ${b.reviewCount} Google reviews, which limits how often it appears in local search`;
  if (b.flags.includes("NO_SOCIAL")) return `I couldn't find an active Instagram or LinkedIn page for ${b.name}`;
  return null;
}

export function buildKit(b: BusinessDTO, plan: Plan, sender: string, studio: string): Kit {
  const obs = observation(b);
  const top = plan.services.slice(0, 3).map((s) => s.name.toLowerCase());
  const topLine = top.length ? top.join(", ") : "a few quick wins";
  const tier = plan.tiers.find((t) => t.tier === plan.recommendedTier);
  const intro = obs ? `${obs}.` : `I had a look at ${b.name} online and saw a few things that could be improved.`;

  const who = sender && sender !== studio ? `${sender} from ${studio}` : `the team at ${studio}`;
  const whoShort = sender && sender !== studio ? sender : studio;
  const whatsapp = `Hi, this is ${who}. ${intro}\n\n• What I'd look at first: ${topLine}\n• Takes about 15 minutes to walk through\n• No obligation\n\nWould it be okay to send a short breakdown?`;
  const instagramDm = `Hey! Love what ${b.name} is doing. ${obs ? obs + ". " : ""}I help local businesses with ${topLine}. Happy to send a couple of free, specific ideas if that's useful. No pitch, just ideas.`;
  const email = {
    subject: obs ? `A quick note about ${b.name}` : `Ideas for ${b.name}`,
    body: `Hi,\n\n${intro} For businesses like yours the biggest levers are usually ${topLine}.\n\nI'm writing from ${studio}. We run marketing, web and automation work for commercial brands, remotely. I can send a one-page breakdown of what I'd prioritise for ${b.name}, with the quick wins first. Worth a 15-minute call this week?\n\nBest,\n${whoShort}`,
  };
  const linkedin = `Hi, I came across ${b.name} and ${obs ? obs.charAt(0).toLowerCase() + obs.slice(1) : "had a few ideas on growth"}. This is ${who}; we help businesses with ${topLine}. Open to me sending a short, specific breakdown?`;

  const battleCard = [
    { objection: "We already have an agency.", response: "That's fine, and I'm not asking you to switch. A second set of eyes often finds quick wins an incumbent has stopped seeing. If I send a short review and it adds nothing, you've lost two minutes." },
    { objection: "It's too expensive.", response: `Fair. Let's start with the one thing that matters most for ${b.name} rather than the whole package. We can scope a small first phase so you see the effect before committing to more.` },
    { objection: "Send me some information.", response: "Happy to. So I send the right thing, what's the one area you most want to improve this quarter: more enquiries, more bookings, or more online sales?" },
    { objection: "Now isn't a good time.", response: "No problem. When would be better? I'll note it and send a short summary in the meantime so it's there when you're ready." },
    { objection: "How do I know it will work for us?", response: "I can't promise results before seeing your numbers, and I'd be wary of anyone who does. What I can do is show you exactly what I'd change, how we'd measure it, and the first 30 days of work, so you can judge it." },
    { objection: "We do it all ourselves.", response: "That's a strength. Many of our clients keep their in-house team and use us for specialist pieces such as tracking, ads or automation. Is there one area that is eating the most of your time?" },
  ];

  const deliver = plan.services.map((s) => `- ${s.name} (${s.code})`).join("\n") || "- Scope to be agreed after discovery";
  const price = tier ? `${TIER_LABEL[tier.tier]} retainer: ${tier.display} per month${tier.displayUSD ? ` (${tier.displayUSD})` : ""}` : "";
  const proposal = `COMMERCIAL PROPOSAL (1 page): ${b.name}\nPrepared by ${studio}\n\nWHY NOW\n${obs ? obs + "." : "Opportunities were identified from public information about the business."} Findings are from public listings only and should be confirmed with you.\n\nSCOPE\n${deliver}\n\nHOW WE MEASURE (targets agreed after discovery, none promised in advance)\n- Qualified enquiries / bookings per month\n- Cost per enquiry or acquisition (CPA)\n- Return on ad spend (ROAS), where paid ads are in scope\n- Pipeline or revenue influenced, where tracking allows\n\nTIMELINE\n- Weeks 1-2: access, tracking and quick wins\n- Days 30 / 60 / 90: reviews against the agreed measures\n\nINVESTMENT\n${price}${plan.websiteBuild ? `\nWebsite build (one-time, if required): ${plan.websiteBuild.display}` : ""}\nAd spend, if any, is paid directly by you to the platform.\n\nNEXT STEP\nA 20-minute discovery call to confirm scope and priorities.`;

  return { whatsapp, instagramDm, email, linkedin, battleCard, proposal };
}

export { FLAG_LABEL };
export type { ProspectFlag };
