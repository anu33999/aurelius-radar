import { tagsFromText } from "@/lib/ai/classify-intent";
import type { ServiceDef } from "@/lib/types";

/* Practice-area defaults so imported services still match even when the source has no tags. */
const AREA_TAGS: [RegExp, string[]][] = [
  [/digital marketing|social|content/i, ["social", "content"]],
  [/pr|reputation/i, ["pr", "reputation"]],
  [/seo|search/i, ["seo"]],
  [/paid|performance|ads/i, ["performance-ads"]],
  [/analytic|data|measure/i, ["analytics", "tracking"]],
  [/growth|lead/i, ["lead-gen", "cro"]],
  [/brand|design|creative/i, ["branding"]],
  [/produc|video|film|photo/i, ["video", "content"]],
  [/tech|web|develop|product|ux|ui/i, ["web"]],
  [/automation|ai|advisory|transform/i, ["automation", "ai"]],
  [/promotion/i, ["promotions"]],
];

function pick(o: Record<string, unknown>, keys: string[]): string {
  for (const k of Object.keys(o)) {
    if (keys.includes(k.toLowerCase().replace(/[\s_-]/g, ""))) {
      const v = o[k];
      if (typeof v === "string" || typeof v === "number") return String(v).trim();
      if (Array.isArray(v)) return v.join(", ");
    }
  }
  return "";
}

function toService(o: Record<string, unknown>, index: number): ServiceDef | null {
  const name = pick(o, ["name", "title", "service", "servicename", "offering"]);
  if (!name) return null;
  const code = pick(o, ["code", "id", "taxonomycode", "servicecode", "sku"]) || `SVC-${String(index + 1).padStart(3, "0")}`;
  const practiceArea = pick(o, ["practicearea", "practice", "division", "department", "area", "category", "domain"]) || "General";
  const summary = pick(o, ["summary", "description", "includes", "whatitincludes", "about"]);
  const rawTags = pick(o, ["tags", "keywords"]);
  const aiRaw = o["isAI"] ?? o["ai"] ?? o["aipowered"] ?? o["isai"];
  const isAI = aiRaw === true || /^(true|yes|1)$/i.test(String(aiRaw ?? ""));

  const tags = new Set<string>(
    rawTags.split(/[,;|]/).map((t) => t.trim().toLowerCase()).filter(Boolean),
  );
  for (const t of tagsFromText(`${name} ${summary}`)) tags.add(t);
  for (const [re, ts] of AREA_TAGS) if (re.test(practiceArea)) ts.forEach((t) => tags.add(t));
  if (isAI) tags.add("ai");
  return { code, name, practiceArea, summary, tags: [...tags], isAI };
}

function fromArray(arr: unknown[]): ServiceDef[] {
  const out: ServiceDef[] = [];
  arr.forEach((item, i) => {
    if (item && typeof item === "object") {
      const s = toService(item as Record<string, unknown>, i);
      if (s) out.push(s);
    }
  });
  return out;
}

/** Walk any JSON structure and return the largest array of service-like objects. */
function findServiceArray(node: unknown): unknown[] | null {
  let best: unknown[] | null = null;
  const visit = (n: unknown) => {
    if (Array.isArray(n)) {
      const looksLike = n.length > 0 && n.filter((x) => x && typeof x === "object" && !Array.isArray(x)).length >= Math.max(3, n.length * 0.6);
      if (looksLike && fromArray(n).length >= Math.max(3, n.length * 0.6)) {
        if (!best || n.length > best.length) best = n;
      }
      n.forEach(visit);
    } else if (n && typeof n === "object") {
      Object.values(n as Record<string, unknown>).forEach(visit);
    }
  };
  visit(node);
  return best;
}

function parseCsv(text: string): ServiceDef[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim());
  return fromArray(rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""]))));
}

function parseHtml(html: string): ServiceDef[] {
  // Pull every <script> body and try to parse JSON literals found inside it.
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  let best: ServiceDef[] = [];
  for (const body of scripts) {
    const candidates: string[] = [body.trim()];
    for (const m of body.matchAll(/=\s*(\[[\s\S]*?\]|\{[\s\S]*?\})\s*;/g)) candidates.push(m[1]);
    // Greedy: from first [ or { to the matching last ] or }.
    const first = body.search(/[[{]/);
    if (first >= 0) {
      const last = Math.max(body.lastIndexOf("]"), body.lastIndexOf("}"));
      if (last > first) candidates.push(body.slice(first, last + 1));
    }
    for (const c of candidates) {
      try {
        const arr = findServiceArray(JSON.parse(c));
        if (arr) {
          const svc = fromArray(arr);
          if (svc.length > best.length) best = svc;
        }
      } catch {
        /* not JSON */
      }
    }
  }
  return best;
}

export function parseCatalogue(text: string, filename = ""): ServiceDef[] {
  const t = text.trim();
  let services: ServiceDef[] = [];
  if (/\.html?$/i.test(filename) || /^<!doctype html|^<html/i.test(t)) services = parseHtml(t);
  else if (/\.csv$/i.test(filename)) services = parseCsv(t);
  else {
    try {
      const arr = findServiceArray(JSON.parse(t));
      services = arr ? fromArray(arr) : [];
    } catch {
      services = parseCsv(t);
    }
  }
  // De-duplicate on code.
  const seen = new Set<string>();
  return services.filter((s) => (seen.has(s.code) ? false : (seen.add(s.code), true)));
}
