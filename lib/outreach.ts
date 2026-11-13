/** Helpers for turning a stored phone number into tap-to-call and WhatsApp links. */
const DIAL: Record<string, string> = {
  "United States": "1", Canada: "1", "United Kingdom": "44", Ireland: "353", Netherlands: "31", Germany: "49",
  "United Arab Emirates": "971", Singapore: "65", Australia: "61", "New Zealand": "64", "South Africa": "27", India: "91",
};

/** Digits in international format, or null when the country code cannot be determined safely. */
export function internationalDigits(phone: string | null | undefined, country?: string | null): string | null {
  if (!phone) return null;
  const raw = phone.trim();
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length < 7) return null;
  if (raw.startsWith("+")) return digits;
  if (raw.startsWith("00")) return digits.slice(2);
  const cc = country ? DIAL[country] : undefined;
  if (!cc) return null;
  if (digits.startsWith(cc) && digits.length > 10) return digits;
  if (digits.startsWith("0")) return cc + digits.slice(1);
  if ((cc === "1" || cc === "91") && digits.length === 10) return cc + digits;
  return null;
}

export const telHref = (phone: string | null | undefined, country?: string | null) => {
  const d = internationalDigits(phone, country);
  return d ? `tel:+${d}` : phone ? `tel:${phone.replace(/[^\d+]/g, "")}` : null;
};

export function waLink(phone: string | null | undefined, text: string, country?: string | null): string | null {
  const d = internationalDigits(phone, country);
  return d ? `https://wa.me/${d}?text=${encodeURIComponent(text)}` : null;
}

/** Opens a pre-filled draft in Gmail on the web (sent from whichever Gmail account is signed in). Nothing is sent automatically. */
export function gmailLink(to: string | null | undefined, subject = "", body = ""): string | null {
  if (!to || !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(to.trim())) return null;
  const p = new URLSearchParams({ view: "cm", fs: "1", to: to.trim() });
  if (subject) p.set("su", subject);
  if (body) p.set("body", body);
  return `https://mail.google.com/mail/?${p.toString()}`;
}
