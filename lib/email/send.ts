import nodemailer from "nodemailer";
import { aiEnabled, askJson } from "@/lib/ai/anthropic";
import { getSetting, setSetting } from "@/lib/db/repo";
import { formatMoney, tierPrices, websiteBuildMultiplier } from "@/lib/pricing";
import type { AuditResult, BusinessDTO } from "@/lib/types";
import { composeColdEmail, DEFAULT_PROFILE, findingsFor, type Prices, type SenderProfile } from "./compose";
import type { Research } from "./research";

/**
 * Sending goes through the user's own Gmail with a Google "app password" (GMAIL_USER and
 * GMAIL_APP_PASSWORD in Vercel). A daily cap protects the Gmail account: Gmail suspends sending for
 * accounts that send too much too fast, and cold email at volume lands in spam.
 */
export const gmailUser = () => process.env.GMAIL_USER?.trim() || null;
/** The address emails are sent from: FROM_ADDRESS (an alias such as outreach@kreatifatelier.com) or the login itself. */
export const fromAddress = () => process.env.FROM_ADDRESS?.trim() || gmailUser()!;
export const emailConfigured = () => !!(gmailUser() && process.env.GMAIL_APP_PASSWORD?.trim());
/**
 * Emails per day. A sending account builds trust slowly, and Gmail blocks accounts that suddenly send a
 * lot of cold email, so each new account starts at 50/day for its first two weeks, then
 * 75. After a block the pace drops back to 20 for a week. Changing GMAIL_USER starts the ramp again for
 * the new account. EMAIL_DAILY_LIMIT in Vercel overrides all of this.
 */
export async function dailyLimit(): Promise<number> {
  const fixed = Number(process.env.EMAIL_DAILY_LIMIT);
  if (fixed > 0) return fixed;
  const user = gmailUser() ?? "";
  let start = await getSetting<{ user?: string; at?: string }>("senderStart", {});
  if (start.user !== user) {
    start = { user, at: new Date().toISOString() };
    await setSetting("senderStart", start);
  }
  const block = await getSetting<{ user?: string; at?: string }>("lastGmailBlock", {});
  const sinceBlock = block.at && block.user === user ? (Date.now() - new Date(block.at).getTime()) / 86400_000 : Infinity;
  if (sinceBlock < 7) return 20;
  const age = (Date.now() - new Date(start.at!).getTime()) / 86400_000;
  return age < 14 ? 50 : 75;
}

/** Gmail refusing to send: daily limit hit, or the account asked to confirm a sign-in in the browser. */
export const isGmailBlock = (msg: string) => /5\.4\.5|sending limit|534|5\.7\.\d+|invalid login|please log in|web browser|auth/i.test(msg);

export interface SendingPause {
  until: string;
  reason: string;
}

/** When Gmail blocks, all sending stops for 24 hours. Retrying every few minutes can keep the block on longer. */
export async function pauseSending(reason: string): Promise<SendingPause> {
  const pause = { until: new Date(Date.now() + 24 * 3600_000).toISOString(), reason, user: gmailUser() ?? "" };
  await setSetting("sendingPause", pause);
  await setSetting("lastGmailBlock", { at: new Date().toISOString(), user: gmailUser() ?? "" });
  return pause;
}

export async function activePause(): Promise<SendingPause | null> {
  // A pause belongs to the account that was blocked; switching to another account isn't paused.
  const p = await getSetting<Partial<SendingPause> & { user?: string }>("sendingPause", {});
  return p.until && new Date(p.until).getTime() > Date.now() && (!p.user || p.user === (gmailUser() ?? "")) ? (p as SendingPause) : null;
}

export async function clearPause(): Promise<void> {
  await setSetting("sendingPause", {});
}

export function pauseMessage(p: SendingPause): string {
  const login = /534|log in|browser|invalid login/i.test(p.reason);
  return `${login ? "Gmail asked you to confirm a sign-in" : "Gmail's daily sending limit was reached"}, so sending is paused until ${new Date(p.until).toLocaleString("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} (India time).${login ? " Open Gmail in your browser and approve any security prompt." : ""}`;
}

export const skippedCountries = (p: SenderProfile) => p.skipCountries.split(",").map((c) => c.trim()).filter(Boolean);

export async function getProfile(): Promise<SenderProfile> {
  return { ...DEFAULT_PROFILE, ...(await getSetting<Partial<SenderProfile>>("senderProfile", {})) };
}

export function pricesFor(b: BusinessDTO, p: SenderProfile, perUSD: Record<string, number>): Prices {
  const { currency, tiers } = tierPrices(b.country, perUSD);
  const lowest = tiers[0].monthly;
  return {
    starting: p.startingPrice.trim() || `${formatMoney(lowest, currency)}/month`,
    website: p.websitePrice.trim() || formatMoney(lowest * websiteBuildMultiplier(), currency),
  };
}

/** The template email, rewritten by AI when an API key is set (same facts, more natural). */
export async function draftFor(b: BusinessDTO, audit: AuditResult | null, p: SenderProfile, prices: Prices, research: Research | null): Promise<{ subject: string; body: string; focus: string; ai: boolean }> {
  const base = composeColdEmail(b, audit, p, prices, research);
  if (!aiEnabled()) return { ...base, ai: false };
  try {
    const facts = findingsFor(b, audit, research);
    const out = await askJson<{ subject: string; body: string }>(
      "You rewrite cold emails for a small creative and digital agency. Keep every fact, link and the P.S. opt-out line exactly. Never mention any price or number for cost; only say the work is affordable. Do not invent numbers, results, clients or claims. Keep the structure: a specific opening, one main opportunity, a brief intro, three areas to explore, cost-effective positioning, and the one-page plan offer. Make it warm, specific to this business and short (under 180 words). It must read like a personal note from one person, never a promotion: no hype or sales words (amazing, best, guaranteed, limited offer), no exclamation marks, no capitals for emphasis. Plain text, no markdown. Reply as JSON {\"subject\":\"...\",\"body\":\"...\"}.",
      `Business: ${b.name} (${b.industry ?? b.niche ?? "business"}, ${b.city}${b.country ? `, ${b.country}` : ""}).\nWhat they lack: ${facts.map((f) => f.lack).join("; ")}\nAbout them (from the web): ${research?.about ?? audit?.baseline?.metaDescription ?? "unknown"}\nListed on: ${research?.listings.join(", ") || "unknown"}\n\nDraft:\nSubject: ${base.subject}\n\n${base.body}`,
      1500,
    );
    if (out.subject && out.body && out.body.includes(p.website.replace(/\/$/, ""))) return { ...out, focus: base.focus, ai: true };
  } catch {
    /* fall back to the template */
  }
  return { ...base, ai: false };
}

let transport: nodemailer.Transporter | null = null;
/** Sends one plain-text email from the user's Gmail; returns its Message-ID so a follow-up can reply in the same thread. */
export async function sendMail(to: string, subject: string, body: string, fromName: string, inReplyTo?: string | null): Promise<string | null> {
  if (!emailConfigured()) throw new Error("Add GMAIL_USER and GMAIL_APP_PASSWORD in Vercel first.");
  const auth = { user: gmailUser()!, pass: process.env.GMAIL_APP_PASSWORD!.replace(/\s+/g, "") };
  // Gmail / Google Workspace by default; SMTP_HOST (and SMTP_PORT) for any other provider, e.g. Zoho or Outlook.
  transport ??= process.env.SMTP_HOST
    ? nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT) || 465, secure: (Number(process.env.SMTP_PORT) || 465) === 465, auth })
    : nodemailer.createTransport({ service: "gmail", auth });
  const info = await transport.sendMail({
    from: { name: fromName, address: fromAddress() },
    to,
    subject,
    text: body,
    replyTo: fromAddress(),
    ...(inReplyTo ? { inReplyTo, references: [inReplyTo] } : {}),
  });
  return info.messageId ?? null;
}
