import { ImapFlow } from "imapflow";
import { listAwaitingReply, markReplied } from "@/lib/db/repo";
import { emailConfigured, fromAddress, gmailUser } from "./send";

const AUTO_SUBJECT = /^(auto(matic)?[ -]?(reply|response|antwort)|out of (the )?office|abwesenheit|away from|thank you for (your )?(email|message|contacting)|thanks for (your )?(email|message|contacting)|we('ve| have)? received your|delivery status notification|undeliverable|mail delivery (failed|subsystem))/i;

/**
 * Who has written back: the email addresses of everyone who sent a message to the Gmail inbox since
 * a date. Uses the same app password as sending (IMAP). Read-only: nothing is marked, moved or deleted.
 * Throws if Gmail can't be reached, so callers never send a follow-up without knowing about replies.
 */
export async function addressesThatWrote(since: Date): Promise<Set<string>> {
  if (!emailConfigured()) throw new Error("Gmail isn't set up");
  const client = new ImapFlow({
    host: process.env.IMAP_HOST || "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: gmailUser()!, pass: process.env.GMAIL_APP_PASSWORD!.replace(/\s+/g, "") },
    logger: false,
  });
  const from = new Set<string>();
  await client.connect();
  try {
    // "All Mail" also covers replies that were archived or labelled.
    const lock = await client.getMailboxLock(process.env.IMAP_HOST ? "INBOX" : "[Gmail]/All Mail", { readOnly: true }).catch(() => client.getMailboxLock("INBOX", { readOnly: true }));
    try {
      for await (const m of client.fetch({ since }, { envelope: true, headers: ["auto-submitted", "x-autoreply", "x-autorespond", "precedence"] })) {
        // Out-of-office and "we received your message" auto-responses are not replies.
        const headers = m.headers?.toString().toLowerCase() ?? "";
        const subject = m.envelope?.subject ?? "";
        if (/auto-submitted:\s*auto-|x-autore(ply|spond)|precedence:\s*(auto_reply|bulk|junk)/.test(headers) || AUTO_SUBJECT.test(subject)) continue;
        for (const a of m.envelope?.from ?? []) if (a.address) from.add(a.address.toLowerCase());
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }
  from.delete(gmailUser()!.toLowerCase());
  from.delete(fromAddress().toLowerCase());
  return from;
}

/** Adds n working days (Mon–Fri) to a date. */
export function addBusinessDays(d: Date, n: number): Date {
  const out = new Date(d);
  let left = n;
  while (left > 0) {
    out.setDate(out.getDate() + 1);
    if (out.getDay() !== 0 && out.getDay() !== 6) left--;
  }
  return out;
}

/** Look for replies from everyone emailed in the last 30 days and record them. Returns how many new replies were found. */
export async function recordReplies(awaiting?: { id: string; email: string; emailedAt: Date }[]): Promise<number> {
  const list = awaiting ?? (await listAwaitingReply());
  if (!list.length) return 0;
  const wrote = await addressesThatWrote(new Date(Math.min(...list.map((a) => a.emailedAt.getTime()))));
  const replied = list.filter((a) => wrote.has(a.email.toLowerCase())).map((a) => a.id);
  await markReplied(replied);
  return replied.length;
}
