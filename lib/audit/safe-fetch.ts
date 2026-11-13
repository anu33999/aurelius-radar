import { lookup } from "node:dns/promises";
import net from "node:net";

/**
 * The audit engine fetches URLs supplied by a user, so every hop is validated to prevent
 * server-side request forgery (private ranges, loopback, link-local, cloud metadata).
 */

function isPrivateIPv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const [a, b] = p;
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

function isPrivateIPv6(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === "::1" || v === "::") return true;
  if (v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80")) return true;
  if (v.startsWith("::ffff:")) return isPrivateIPv4(v.slice(7));
  return false;
}

export async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new Error("Private hostnames are not allowed");
  }
  if (net.isIP(host)) {
    if (net.isIPv4(host) ? isPrivateIPv4(host) : isPrivateIPv6(host)) throw new Error("Private addresses are not allowed");
    return;
  }
  const records = await lookup(host, { all: true });
  if (records.length === 0) throw new Error("Host did not resolve");
  for (const r of records) {
    if (r.family === 4 ? isPrivateIPv4(r.address) : isPrivateIPv6(r.address)) {
      throw new Error("Host resolves to a private address");
    }
  }
}

export function normaliseUrl(input: string): string {
  let u = input.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(u) && !/^https?:\/\//i.test(u)) throw new Error("Only http(s) URLs are supported");
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  const parsed = new URL(u);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("Only http(s) URLs are supported");
  return parsed.toString();
}

export interface SafeResponse {
  status: number;
  finalUrl: string;
  headers: Headers;
  text: string;
  bytes: number;
}

export async function safeFetch(
  url: string,
  opts: { timeoutMs?: number; maxBytes?: number; maxRedirects?: number } = {},
): Promise<SafeResponse> {
  const timeoutMs = opts.timeoutMs ?? 12000;
  const maxBytes = opts.maxBytes ?? 3_000_000;
  const maxRedirects = opts.maxRedirects ?? 5;

  let current = normaliseUrl(url);
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const parsed = new URL(current);
    await assertPublicHost(parsed.hostname);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(current, {
        redirect: "manual",
        signal: ctrl.signal,
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; AureliusAuditBot/1.0; +https://www.kreatifatelier.com)",
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        current = new URL(res.headers.get("location") as string, current).toString();
        continue;
      }

      // Read at most maxBytes.
      const reader = res.body?.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            total += value.byteLength;
            chunks.push(value);
            if (total >= maxBytes) {
              await reader.cancel();
              break;
            }
          }
        }
      }
      const text = new TextDecoder("utf-8").decode(Buffer.concat(chunks));
      return { status: res.status, finalUrl: current, headers: res.headers, text, bytes: total };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("Too many redirects");
}
