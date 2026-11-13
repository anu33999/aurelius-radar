import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { FLAG_LABEL, type ProspectFlag } from "@/lib/leads/score";
import { quoteFor } from "@/lib/leads/quote";
import { recommendServices } from "@/lib/leads/plan";
import { PIPELINE_STAGES, type BusinessDTO, type ServiceDef, type SocialLeadDTO } from "@/lib/types";

export type Scope = "directory" | "crm" | "shortlist" | "catalogue";
export const SCOPE_TITLE: Record<Scope, string> = {
  directory: "International Directory",
  crm: "Client CRM & Pipeline",
  shortlist: "Shortlist",
  catalogue: "Service Catalogue",
};

const stageLabel = (k: string) => PIPELINE_STAGES.find((s) => s.key === k)?.label ?? k;
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const fullUrl = (u: string | null) => (u ? (/^https?:/i.test(u) ? u : `https://${u}`) : "");

interface Col<T> { header: string; width: number; pdf?: number; get: (r: T) => string | number }

/** All columns go to Excel; the ones with a `pdf` width also go to the PDF. */
/** Rates are set per export (see buildXlsx / buildPdf) so the price columns can be in each prospect's own currency. */
let RATES: Record<string, number> | null = null;
let CATALOGUE: ServiceDef[] = [];
const topServices = (b: BusinessDTO) => (CATALOGUE.length ? recommendServices(b, CATALOGUE).slice(0, 4).map((s) => s.name).join("; ") : "");
const quote = (b: BusinessDTO) => (RATES ? quoteFor(b, RATES) : null);

export const BUSINESS_COLS: Col<BusinessDTO>[] = [
  { header: "Business", width: 30, pdf: 100, get: (b) => b.name },
  { header: "Niche", width: 16, pdf: 60, get: (b) => b.niche ?? b.industry ?? "" },
  { header: "City", width: 16, pdf: 70, get: (b) => b.city },
  { header: "Country", width: 16, pdf: 60, get: (b) => b.country ?? "" },
  { header: "Phone", width: 18, pdf: 80, get: (b) => b.phone ?? "" },
  { header: "Email", width: 26, get: (b) => b.email ?? "" },
  { header: "Website", width: 32, pdf: 100, get: (b) => fullUrl(b.website) },
  { header: "Instagram", width: 30, get: (b) => b.instagramUrl ?? "" },
  { header: "LinkedIn", width: 30, get: (b) => b.linkedinUrl ?? "" },
  { header: "Rating", width: 10, pdf: 38, get: (b) => (b.googleRating != null ? b.googleRating.toFixed(1) : "") },
  { header: "Reviews", width: 9, pdf: 40, get: (b) => b.reviewCount ?? "" },
  { header: "Opp. score", width: 11, pdf: 50, get: (b) => b.opportunityScore ?? "" },
  { header: "Signals", width: 34, pdf: 95, get: (b) => b.flags.filter((f) => f !== "NO_PHONE").map((f) => FLAG_LABEL[f as ProspectFlag] ?? f).join(", ") },
  { header: "Suggested price", width: 34, pdf: 110, get: (b) => quote(b)?.summary ?? "" },
  { header: "Services to pitch", width: 46, pdf: 120, get: (b) => topServices(b) },
  { header: "Currency", width: 9, get: (b) => quote(b)?.currency ?? "" },
  { header: "Suggested monthly", width: 14, get: (b) => quote(b)?.monthly ?? "" },
  { header: "Website build (one-off)", width: 16, get: (b) => quote(b)?.websiteBuild ?? "" },
  { header: "Stage", width: 16, pdf: 70, get: (b) => stageLabel(b.pipelineStage) },
  { header: "Priority", width: 10, get: (b) => b.priority },
  { header: "Last contacted", width: 14, get: (b) => day(b.lastContactedAt) },
  { header: "Budget", width: 14, get: (b) => b.monthlyBudget ?? "" },
  { header: "Notes", width: 40, get: (b) => b.notes ?? "" },
  { header: "Address", width: 36, get: (b) => b.address ?? "" },
  { header: "Shortlisted", width: 11, get: (b) => (b.shortlisted ? "Yes" : "") },
];

export const SERVICE_COLS: Col<ServiceDef>[] = [
  { header: "Code", width: 10, pdf: 50, get: (s) => s.code },
  { header: "Service", width: 44, pdf: 230, get: (s) => s.name },
  { header: "Practice area", width: 30, pdf: 150, get: (s) => s.practiceArea },
  { header: "Summary", width: 70, pdf: 330, get: (s) => s.summary },
  { header: "AI", width: 6, get: (s) => (s.isAI ? "Yes" : "") },
];

export const POST_COLS: Col<SocialLeadDTO>[] = [
  { header: "Platform", width: 11, pdf: 55, get: (p) => p.platform },
  { header: "Author", width: 20, pdf: 90, get: (p) => p.authorHandle ?? "" },
  { header: "Post", width: 70, pdf: 330, get: (p) => (p.postTitle ? `${p.postTitle}. ` : "") + p.postContent.replace(/\s+/g, " ").slice(0, 500) },
  { header: "Intent", width: 16, pdf: 70, get: (p) => (p.intentCategory === "BUYER_HIRING" ? "Buyer / hiring" : "Advice seeking") },
  { header: "Status", width: 12, pdf: 55, get: (p) => p.status },
  { header: "Posted", width: 12, get: (p) => day(p.postedAt) },
  { header: "Link", width: 50, get: (p) => p.sourceUrl },
];

/** Sort so the sheet reads sensibly: CRM by pipeline stage, others by opportunity. */
export function sortBusinesses(rows: BusinessDTO[], scope: Scope): BusinessDTO[] {
  const order = PIPELINE_STAGES.map((s) => s.key as string);
  return [...rows].sort((a, b) =>
    scope === "crm"
      ? order.indexOf(a.pipelineStage) - order.indexOf(b.pipelineStage) || (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0)
      : (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0) || a.name.localeCompare(b.name),
  );
}

function sheet<T>(wb: ExcelJS.Workbook, name: string, cols: Col<T>[], rows: T[]) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = cols.map((c) => ({ header: c.header, width: c.width }));
  for (const r of rows) ws.addRow(cols.map((c) => c.get(r)));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6D28D9" } };
  head.alignment = { vertical: "middle" };
  ws.eachRow((row, i) => { if (i > 1) row.alignment = { vertical: "top", wrapText: true }; });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  // Make URL cells clickable.
  cols.forEach((c, ci) => {
    if (!/website|instagram|linkedin|link/i.test(c.header)) return;
    rows.forEach((r, ri) => {
      const v = String(c.get(r));
      if (/^https?:/i.test(v)) ws.getCell(ri + 2, ci + 1).value = { text: v, hyperlink: v };
    });
  });
}

export async function buildXlsx(scope: Scope, businesses: BusinessDTO[], posts: SocialLeadDTO[], perUSD: Record<string, number> | null = null, catalogue: ServiceDef[] = []): Promise<Buffer> {
  RATES = perUSD;
  CATALOGUE = catalogue;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Aurelius Radar";
  if (scope === "catalogue") {
    sheet(wb, "Service catalogue", SERVICE_COLS, [...catalogue].sort((a, b) => a.practiceArea.localeCompare(b.practiceArea) || a.name.localeCompare(b.name)));
    return Buffer.from(await wb.xlsx.writeBuffer());
  }
  sheet(wb, scope === "shortlist" ? "Businesses" : "Prospects", BUSINESS_COLS, sortBusinesses(businesses, scope));
  if (scope === "shortlist") sheet(wb, "Posts", POST_COLS, posts);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** pdfkit's built-in fonts are Latin-1 only; replace anything else so it never throws or prints garbage boxes. */
const latin = (s: string) => s.replace(/[^\x20-\x7E -ÿ]/g, "?");

function pdfTable<T>(doc: PDFKit.PDFDocument, cols: Col<T>[], rows: T[], title: string) {
  const used = cols.filter((c) => c.pdf);
  const left = doc.page.margins.left;
  const bottom = () => doc.page.height - doc.page.margins.bottom;
  const header = () => {
    let x = left;
    const y = doc.y;
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#6D28D9");
    for (const c of used) { doc.text(c.header, x, y, { width: c.pdf! - 4 }); x += c.pdf!; }
    doc.moveTo(left, y + 12).lineTo(x, y + 12).strokeColor("#6D28D9").stroke();
    doc.y = y + 16;
  };
  doc.font("Helvetica-Bold").fontSize(14).fillColor("#111").text(latin(title), left, doc.y);
  doc.moveDown(0.6);
  if (!rows.length) { doc.font("Helvetica").fontSize(9).fillColor("#555").text("Nothing here yet."); return; }
  header();
  doc.font("Helvetica").fontSize(7.5).fillColor("#111");
  for (const r of rows) {
    const cells = used.map((c) => latin(String(c.get(r))));
    const h = Math.max(...cells.map((t, i) => doc.heightOfString(t, { width: used[i].pdf! - 4 }))) + 6;
    if (doc.y + h > bottom()) { doc.addPage(); header(); doc.font("Helvetica").fontSize(7.5).fillColor("#111"); }
    const y = doc.y;
    let x = left;
    cells.forEach((t, i) => { doc.text(t, x, y, { width: used[i].pdf! - 4 }); x += used[i].pdf!; });
    doc.y = y + h;
    doc.moveTo(left, doc.y - 3).lineTo(x, doc.y - 3).strokeColor("#E5E7EB").lineWidth(0.5).stroke();
  }
}

export function buildPdf(scope: Scope, businesses: BusinessDTO[], posts: SocialLeadDTO[], perUSD: Record<string, number> | null = null, catalogue: ServiceDef[] = []): Promise<Buffer> {
  RATES = perUSD;
  CATALOGUE = catalogue;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 30 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const date = new Date().toISOString().slice(0, 10);
    doc.font("Helvetica-Bold").fontSize(18).fillColor("#111").text(`Aurelius Radar: ${SCOPE_TITLE[scope]}`);
    doc.font("Helvetica").fontSize(9).fillColor("#555").text(`Kreatif Atelier · exported ${date} · ${businesses.length} business(es)${scope === "shortlist" ? `, ${posts.length} post(s)` : ""}`);
    doc.moveDown(1);
    if (scope === "catalogue") {
      pdfTable(doc, SERVICE_COLS, [...catalogue].sort((a, b) => a.practiceArea.localeCompare(b.practiceArea) || a.name.localeCompare(b.name)), `${catalogue.length} services`);
      doc.end();
      return;
    }
    pdfTable(doc, BUSINESS_COLS, sortBusinesses(businesses, scope), scope === "shortlist" ? "Businesses" : SCOPE_TITLE[scope]);
    if (scope === "shortlist") { doc.moveDown(1.5); pdfTable(doc, POST_COLS, posts, "Posts"); }
    doc.end();
  });
}
