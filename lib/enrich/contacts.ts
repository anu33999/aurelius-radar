import { safeFetch } from "@/lib/audit/safe-fetch";

/**
 * Contact details a business publishes on its own website. Only explicit, machine-readable sources are
 * used: tel: and mailto: links, wa.me / WhatsApp API links, and schema.org "telephone"/"email" fields.
 * Free text is never mined for digits (it would pick up dates, prices and order numbers).
 */
export interface FoundContacts {
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
}

const digitsOk = (v: string) => {
  const d = v.replace(/[^\d]/g, "");
  return d.length >= 7 && d.length <= 15;
};

function clean(v: string): string {
  let s = v;
  try {
    s = decodeURIComponent(s);
  } catch {
    // keep as is
  }
  return s.replace(/^tel:/i, "").replace(/\s+/g, " ").trim();
}

const JUNK_EMAIL = /(example\.|sentry|wixpress|\.png$|\.jpe?g$|\.gif$|\.webp$|\.svg$|@2x|domain\.com|email\.com|yourcompany|noreply|no-reply)/i;

export function extractContacts(html: string): FoundContacts & { contactUrl: string | null } {
  const phones: string[] = [];
  for (const m of html.matchAll(/href\s*=\s*["']tel:([^"'#?]+)["']/gi)) phones.push(clean(m[1]));
  for (const m of html.matchAll(/"telephone"\s*:\s*"([^"]{5,40})"/gi)) phones.push(clean(m[1]));
  for (const m of html.matchAll(/itemprop\s*=\s*["']telephone["'][^>]*content\s*=\s*["']([^"']{5,40})["']/gi)) phones.push(clean(m[1]));

  const emails: string[] = [];
  for (const m of html.matchAll(/href\s*=\s*["']mailto:([^"'?#]+)/gi)) emails.push(clean(m[1]).toLowerCase());
  for (const m of html.matchAll(/"email"\s*:\s*"(?:mailto:)?([^"\s]+@[^"\s]+)"/gi)) emails.push(clean(m[1]).toLowerCase());

  const wa = /(?:wa\.me\/|api\.whatsapp\.com\/send\/?\?phone=|whatsapp:\/\/send\?phone=)(?:%2B|\+)?(\d{7,15})/i.exec(html)?.[1];
  const contactHref = /href\s*=\s*["']([^"'#]*(?:contact|kontakt|contacto|reach-us|get-in-touch)[^"'#]*)["']/i.exec(html)?.[1] ?? null;

  return {
    phone: phones.find(digitsOk) ?? null,
    email: emails.find((e) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(e) && !JUNK_EMAIL.test(e)) ?? null,
    whatsapp: wa ? `+${wa}` : null,
    contactUrl: contactHref,
  };
}

/** Homepage first; if it lists no phone, the site's contact page (same host only). */
export async function findContacts(website: string): Promise<FoundContacts> {
  const home = await safeFetch(website, { timeoutMs: 9000, maxBytes: 1_500_000, maxRedirects: 4 });
  const found = extractContacts(home.text);
  if (!found.phone && found.contactUrl) {
    try {
      const url = new URL(found.contactUrl, home.finalUrl);
      if (url.hostname === new URL(home.finalUrl).hostname && /^https?:$/.test(url.protocol)) {
        const page = extractContacts((await safeFetch(url.toString(), { timeoutMs: 8000, maxBytes: 1_500_000, maxRedirects: 3 })).text);
        return { phone: page.phone, email: found.email ?? page.email, whatsapp: found.whatsapp ?? page.whatsapp };
      }
    } catch {
      // contact page unreachable: keep what the homepage gave
    }
  }
  return { phone: found.phone, email: found.email, whatsapp: found.whatsapp };
}
