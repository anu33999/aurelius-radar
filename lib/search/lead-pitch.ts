import { inLocation } from "@/lib/studio";
import { askJson, aiEnabled } from "@/lib/ai/anthropic";
import type { LeadPitch, ServiceDef } from "@/lib/types";

const TIPS: Record<string, string> = {
  web: "check mobile load speed first (PageSpeed Insights), then look at whether the page has one clear call to action above the fold",
  "performance-ads": "make sure conversion tracking is actually firing before changing creative or budgets, otherwise the algorithm optimises blind",
  seo: "start with what already ranks on page 2 in Search Console; improving those pages is usually faster than writing new ones",
  "local-seo": "claim and fully complete the Google Business Profile, then work on getting recent reviews with the service keyword in them",
  social: "pick one format you can sustain weekly rather than posting everywhere; consistency beats breadth",
  video: "batch-shoot a month of short videos in one session and reuse the same hook structure so it stays sustainable",
  automation: "map the manual steps first on paper; most automations that fail are automating a process that was never defined",
  crm: "agree what counts as a qualified lead before choosing the tool, otherwise the CRM just stores noise",
  email: "set up the abandoned-cart and welcome flows before any broadcast campaigns; they usually earn the most for the least effort",
  cro: "watch a few session recordings and look at where mobile visitors drop; fix the biggest drop-off before testing anything else",
  branding: "write down who it is for and what you do better than the alternative in one sentence before touching visuals",
  "lead-gen": "measure response time to enquiries; slow follow-up quietly kills more leads than weak targeting",
  tracking: "check GA4 events and your ad platform's conversion count against actual orders for a week; mismatches usually explain 'ads not working'",
  pr: "give journalists a specific local or data angle rather than a company announcement",
  ai: "start with one narrow job the assistant must do well (like qualifying enquiries) before expanding it",
};

function templateLead(args: { platform: string; painPoint: string | null; tags: string[]; services: ServiceDef[]; sender: string }): LeadPitch {
  const tips = args.tags.map((t) => TIPS[t]).filter(Boolean).slice(0, 2);
  const tipText = tips.length
    ? tips.map((t, i) => `${i + 1}) ${t}.`).join(" ")
    : "1) Pin down the single metric that matters (enquiries, orders, or ROAS) and check it is being tracked accurately before changing anything else.";
  const comment = `Happy to share what usually helps in a situation like this. ${tipText} If you can share what you've tried so far and roughly where the drop-off is, I can be more specific.`;
  const svc = args.services[0]?.name;
  const dm = `Hi, saw your post and thought I could help${svc ? ` (this is the kind of thing we do with ${svc.toLowerCase()})` : ""}. I run a small digital studio${inLocation()}. No pressure at all: if useful, I can take a quick look and send a few specific suggestions. – ${args.sender}`;
  return { comment, dm, generatedBy: "TEMPLATE" };
}

export async function generateLeadPitch(args: {
  platform: string;
  title: string;
  content: string;
  painPoint: string | null;
  tags: string[];
  services: ServiceDef[];
  sender: string;
}): Promise<LeadPitch> {
  const fallback = templateLead(args);
  if (!aiEnabled()) return fallback;
  try {
    const out = await askJson<{ comment: string; dm: string }>(
      `You draft replies to public posts for a digital marketing studio (Kreatif Atelier, a remote studio serving international clients; write in plain international English). Rules: the public comment must be genuinely useful on its own with 2-3 concrete, specific suggestions tailored to the post, no sales pitch, no links, no brand name, no emojis. The DM must be short (max 60 words), casual, offer a quick look with no pressure, and mention the studio once. Never invent facts about the poster's business. Plain text only. Output ONLY JSON: {"comment":string,"dm":string}`,
      JSON.stringify({
        platform: args.platform,
        post: { title: args.title.slice(0, 200), content: args.content.slice(0, 1200) },
        painPoint: args.painPoint,
        relevantServices: args.services.map((s) => s.name),
        sender: args.sender,
      }),
      1200,
    );
    if (out.comment && out.dm) return { comment: out.comment, dm: out.dm, generatedBy: "AI" };
  } catch {
    /* fall back */
  }
  return fallback;
}
