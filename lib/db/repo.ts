import { prisma } from "./client";
import { STARTER_CATALOGUE } from "@/lib/services/starter-catalogue";
import { scoreProspect } from "@/lib/leads/score";
import type {
  BusinessDTO,
  IntentCategory,
  LeadPitch,
  PipelineStage,
  Platform,
  Priority,
  ServiceDef,
  SocialLeadDTO,
} from "@/lib/types";

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function toBusinessDTO(b: any): BusinessDTO {
  return {
    id: b.id,
    name: b.name,
    industry: b.industry ?? null,
    website: b.website ?? null,
    phone: b.phone ?? null,
    phoneSource: b.phoneSource ?? null,
    emailSource: b.emailSource ?? null,
    email: b.email ?? null,
    address: b.address ?? null,
    city: b.city,
    locality: b.locality ?? null,
    state: b.state ?? null,
    country: b.country ?? null,
    latitude: b.latitude ?? null,
    longitude: b.longitude ?? null,
    niche: b.niche ?? null,
    googleRating: b.googleRating ?? null,
    reviewCount: b.reviewCount ?? null,
    googlePlaceId: b.googlePlaceId ?? null,
    instagramUrl: b.instagramUrl ?? null,
    linkedinUrl: b.linkedinUrl ?? null,
    whatsapp: b.whatsapp ?? null,
    flags: parseJson<string[]>(b.opportunityFlags, []),
    shortlisted: !!b.shortlisted,
    lastContactedAt: b.lastContactedAt ? new Date(b.lastContactedAt).toISOString() : null,
    source: b.source ?? null,
    estimatedRevenue: b.estimatedRevenue ?? null,
    techStack: b.techStack ?? null,
    pipelineStage: b.pipelineStage as PipelineStage,
    priority: b.priority as Priority,
    monthlyBudget: b.monthlyBudget ?? null,
    notes: b.notes ?? null,
    pitchSummary: b.pitchSummary ?? null,
    matchedServiceIds: parseJson<string[]>(b.matchedServiceIds, []),
    readinessScore: b.readinessScore ?? null,
    opportunityScore: b.opportunityScore ?? null,
    lastAuditedAt: b.lastAuditedAt ? new Date(b.lastAuditedAt).toISOString() : null,
    emailedAt: b.emailedAt ? new Date(b.emailedAt).toISOString() : null,
    emailStatus: b.emailStatus ?? null,
    repliedAt: b.repliedAt ? new Date(b.repliedAt).toISOString() : null,
    followUpSentAt: b.followUpSentAt ? new Date(b.followUpSentAt).toISOString() : null,
    createdAt: new Date(b.createdAt).toISOString(),
    updatedAt: new Date(b.updatedAt).toISOString(),
    noteCount: b._count?.crmNotes ?? 0,
  };
}

function toLeadDTO(l: any): SocialLeadDTO {
  return {
    id: l.id,
    platform: l.platform as Platform,
    sourceUrl: l.sourceUrl,
    authorHandle: l.authorHandle ?? null,
    postTitle: l.postTitle ?? null,
    postContent: l.postContent,
    postedAt: l.postedAt ? new Date(l.postedAt).toISOString() : null,
    painPoint: l.painPoint ?? null,
    matchedServices: parseJson<string[]>(l.matchedServices, []),
    intentCategory: l.intentCategory as IntentCategory,
    classifiedBy: (l.classifiedBy === "AI" ? "AI" : "RULES") as "AI" | "RULES",
    confidence: l.confidence ?? null,
    status: l.status,
    pitchDraft: parseJson<LeadPitch | null>(l.pitchDraft, null),
    shortlisted: !!l.shortlisted,
    createdAt: new Date(l.createdAt).toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* catalogue                                                           */
/* ------------------------------------------------------------------ */

export async function getCatalogue(): Promise<{ services: ServiceDef[]; isStarter: boolean }> {
  try {
    const rows: any[] = await prisma.service.findMany({ orderBy: { code: "asc" } });
    if (rows.length > 0) {
      return {
        isStarter: false,
        services: rows.map((r) => ({
          code: r.code,
          name: r.name,
          practiceArea: r.practiceArea,
          summary: r.summary ?? "",
          tags: (r.tags ?? "").split(",").map((t: string) => t.trim().toLowerCase()).filter(Boolean),
          isAI: !!r.isAI,
        })),
      };
    }
  } catch {
    // DB not initialised yet - fall through to the starter set.
  }
  return { services: STARTER_CATALOGUE, isStarter: true };
}

export async function replaceCatalogue(services: ServiceDef[]): Promise<number> {
  await prisma.service.deleteMany({});
  let n = 0;
  for (const svc of services) {
    await prisma.service.create({
      data: {
        code: svc.code,
        name: svc.name,
        practiceArea: svc.practiceArea,
        summary: svc.summary,
        tags: svc.tags.join(","),
        isAI: svc.isAI,
      },
    });
    n++;
  }
  return n;
}

/* ------------------------------------------------------------------ */
/* businesses                                                          */
/* ------------------------------------------------------------------ */

export interface BusinessFilter {
  q?: string;
  city?: string;
  country?: string;
  locality?: string;
  stage?: string;
  industry?: string;
}

/** All matching businesses, newest first; pass `page` to fetch one slice (the API pages so no response gets too large). */
export async function listBusinesses(f: BusinessFilter = {}, page?: { skip: number; take: number }): Promise<BusinessDTO[]> {
  const where: any = {};
  if (f.city) where.city = f.city;
  if (f.country) where.country = f.country;
  if (f.locality) where.locality = f.locality;
  if (f.stage) where.pipelineStage = f.stage;
  if (f.industry) where.industry = f.industry;
  if (f.q) {
    // Postgres `contains` is case-sensitive by default.
    const q = { contains: f.q, mode: "insensitive" };
    where.OR = [
      { name: q },
      { industry: q },
      { website: q },
      { locality: q },
      { city: q },
      { country: q },
    ];
  }
  const rows: any[] = await prisma.business.findMany({
    where,
    // Newest imports first, and a fixed order after that: edits, audits and contact lookups never move a row.
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    // The saved audit JSON can be large and the list never shows it (it is fetched per business).
    omit: { auditJson: true, researchJson: true },
    include: { _count: { select: { crmNotes: true } } },
    ...(page ? { skip: page.skip, take: page.take } : {}),
  });
  return rows.map(toBusinessDTO);
}

export async function getBusiness(id: string): Promise<BusinessDTO | null> {
  const row = await prisma.business.findUnique({
    where: { id },
    include: { _count: { select: { crmNotes: true } } },
  });
  return row ? toBusinessDTO(row) : null;
}

export interface BusinessInput {
  name: string;
  industry?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string;
  locality?: string | null;
  state?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  niche?: string | null;
  googleRating?: number | null;
  reviewCount?: number | null;
  googlePlaceId?: string | null;
  instagramUrl?: string | null;
  linkedinUrl?: string | null;
  whatsapp?: string | null;
  pipelineStage?: PipelineStage;
  lastContactedAt?: Date | null;
  shortlisted?: boolean;
  source?: string | null;
  estimatedRevenue?: string | null;
  techStack?: string | null;
  monthlyBudget?: string | null;
  priority?: Priority;
}

export async function createBusiness(input: BusinessInput): Promise<BusinessDTO> {
  const row = await prisma.business.create({
    data: businessData(input),
    include: { _count: { select: { crmNotes: true } } },
  });
  return toBusinessDTO(row);
}

function businessData(input: BusinessInput) {
  // Pre-audit opportunity score and flags from whatever listing data we have.
  const prospect = scoreProspect({
    niche: input.niche,
    website: input.website,
    phone: input.phone,
    email: input.email,
    googleRating: input.googleRating,
    reviewCount: input.reviewCount,
    instagramUrl: input.instagramUrl,
    linkedinUrl: input.linkedinUrl,
  });
  return {
      name: input.name,
      industry: input.industry ?? null,
      website: input.website ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
      city: input.city?.trim() || "Unspecified",
      locality: input.locality ?? null,
      state: input.state ?? null,
      country: input.country ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      niche: input.niche ?? null,
      googleRating: input.googleRating ?? null,
      reviewCount: input.reviewCount ?? null,
      googlePlaceId: input.googlePlaceId ?? null,
      instagramUrl: input.instagramUrl ?? null,
      linkedinUrl: input.linkedinUrl ?? null,
      whatsapp: input.whatsapp ?? null,
      opportunityFlags: JSON.stringify(prospect.flags),
      opportunityScore: prospect.score,
      pipelineStage: input.pipelineStage ?? "LEAD",
      lastContactedAt: input.lastContactedAt ?? null,
      source: input.source ?? "MANUAL",
      estimatedRevenue: input.estimatedRevenue ?? null,
      techStack: input.techStack ?? null,
      monthlyBudget: input.monthlyBudget ?? null,
      priority: input.priority ?? "MEDIUM",
  };
}

/**
 * Insert businesses that do not already exist (matched on lower-cased name + city + country).
 * Existing ones are left alone, except that a confirmed WhatsApp number they lack is filled in,
 * so re-running a search backfills listings imported before WhatsApp was captured.
 */
export async function bulkCreateBusinesses(items: BusinessInput[]): Promise<{ created: number; skipped: number }> {
  const existing: any[] = await prisma.business.findMany({ select: { id: true, name: true, city: true, country: true, whatsapp: true } });
  const keyOf = (n: string, c?: string | null, k?: string | null) => `${n.toLowerCase()}|${(c ?? "").toLowerCase()}|${(k ?? "").toLowerCase()}`;
  const byKey = new Map(existing.map((e) => [keyOf(e.name, e.city, e.country), e]));
  const seen = new Set(byKey.keys());
  const fresh: BusinessInput[] = [];
  for (const item of items) {
    const key = keyOf(item.name, item.city, item.country);
    if (seen.has(key)) {
      const old = byKey.get(key);
      if (old && item.whatsapp && !old.whatsapp) {
        await prisma.business.update({ where: { id: old.id }, data: { whatsapp: item.whatsapp } });
        old.whatsapp = item.whatsapp;
      }
      continue;
    }
    seen.add(key);
    fresh.push(item);
  }
  // Batched inserts: large-radius imports return thousands of rows, too many for one query each.
  let created = 0;
  for (let i = 0; i < fresh.length; i += 500) {
    const res = await prisma.business.createMany({ data: fresh.slice(i, i + 500).map(businessData), skipDuplicates: true });
    created += res.count;
  }
  return { created, skipped: items.length - created };
}

const EDITABLE: (keyof BusinessDTO)[] = [
  "name",
  "industry",
  "website",
  "phone",
  "email",
  "address",
  "city",
  "locality",
  "state",
  "country",
  "latitude",
  "longitude",
  "niche",
  "googleRating",
  "reviewCount",
  "instagramUrl",
  "linkedinUrl",
  "whatsapp",
  "emailStatus",
  "lastContactedAt",
  "shortlisted",
  "estimatedRevenue",
  "techStack",
  "pipelineStage",
  "priority",
  "monthlyBudget",
  "notes",
  "pitchSummary",
];

export async function updateBusiness(id: string, patch: Record<string, unknown>): Promise<BusinessDTO | null> {
  const data: Record<string, unknown> = {};
  for (const key of EDITABLE) {
    if (key in patch) data[key] = patch[key as string];
  }
  if (Object.keys(data).length === 0) return getBusiness(id);
  // Moving a lead out of "New" counts as contact, which starts the 48-hour follow-up clock.
  if (typeof data.pipelineStage === "string" && data.pipelineStage !== "LEAD" && !("lastContactedAt" in data)) {
    const cur: any = await prisma.business.findUnique({ where: { id }, select: { pipelineStage: true } });
    if (cur && cur.pipelineStage !== data.pipelineStage) data.lastContactedAt = new Date();
  }
  if (typeof data.lastContactedAt === "string") data.lastContactedAt = new Date(data.lastContactedAt);
  // A phone typed in by a person is no longer an unverified web-search number.
  if ("phone" in data) data.phoneSource = null;
  const row = await prisma.business.update({
    where: { id },
    data,
    include: { _count: { select: { crmNotes: true } } },
  });
  return toBusinessDTO(row);
}

export async function deleteBusiness(id: string): Promise<void> {
  await prisma.business.delete({ where: { id } });
}

export async function saveAuditToBusiness(args: {
  businessId?: string;
  name: string;
  website: string | null;
  techStack: string | null;
  matchedServiceCodes: string[];
  readinessScore: number;
  opportunityScore: number;
  pitchSummary: string;
  auditJson: string;
  instagramUrl?: string | null;
  linkedinUrl?: string | null;
  whatsapp?: string | null;
}): Promise<BusinessDTO> {
  const data = {
    website: args.website,
    techStack: args.techStack,
    matchedServiceIds: JSON.stringify(args.matchedServiceCodes),
    readinessScore: args.readinessScore,
    opportunityScore: args.opportunityScore,
    pitchSummary: args.pitchSummary,
    auditJson: args.auditJson,
    lastAuditedAt: new Date(),
    ...(args.instagramUrl ? { instagramUrl: args.instagramUrl } : {}),
    ...(args.linkedinUrl ? { linkedinUrl: args.linkedinUrl } : {}),
    ...(args.whatsapp ? { whatsapp: `+${args.whatsapp}` } : {}),
  };
  if (args.businessId) {
    const row = await prisma.business.update({
      where: { id: args.businessId },
      data,
      include: { _count: { select: { crmNotes: true } } },
    });
    return toBusinessDTO(row);
  }
  const row = await prisma.business.create({
    data: { name: args.name, city: "Unspecified", source: "AUDIT", ...data },
    include: { _count: { select: { crmNotes: true } } },
  });
  return toBusinessDTO(row);
}

/* ------------------------------------------------------------------ */
/* contact enrichment (phone / email / WhatsApp from the business's own site) */
/* ------------------------------------------------------------------ */

const contactCandidates = { website: { not: null }, phone: null, contactsCheckedAt: null };

export async function countContactCandidates(): Promise<number> {
  return prisma.business.count({ where: contactCandidates as any });
}

export async function listContactCandidates(take: number): Promise<{ id: string; website: string }[]> {
  return (await prisma.business.findMany({ where: contactCandidates as any, select: { id: true, website: true }, orderBy: { createdAt: "asc" }, take })) as any;
}

/** Fill only empty fields (never overwrite what a person entered), re-score, and mark the site as checked. */
export async function saveFoundContacts(id: string, found: { phone: string | null; email: string | null; whatsapp: string | null }): Promise<void> {
  const b: any = await prisma.business.findUnique({ where: { id } });
  if (!b) return;
  const phone = b.phone ?? found.phone;
  const email = b.email ?? found.email;
  const whatsapp = b.whatsapp ?? found.whatsapp;
  const prospect = scoreProspect({
    niche: b.niche, website: b.website, phone, email, googleRating: b.googleRating, reviewCount: b.reviewCount, instagramUrl: b.instagramUrl, linkedinUrl: b.linkedinUrl,
  });
  await prisma.business.update({
    where: { id },
    data: { phone, email, whatsapp, contactsCheckedAt: new Date(), opportunityFlags: JSON.stringify(prospect.flags), opportunityScore: prospect.score },
  });
}

const placesCandidates = { phone: null, placesCheckedAt: null };

export async function countPlacesCandidates(): Promise<number> {
  return prisma.business.count({ where: placesCandidates as any });
}

export async function listPlacesCandidates(take: number) {
  return (await prisma.business.findMany({
    where: placesCandidates as any,
    select: { id: true, name: true, city: true, country: true, latitude: true, longitude: true },
    orderBy: [{ opportunityScore: "desc" }, { createdAt: "asc" }],
    take,
  })) as { id: string; name: string; city: string; country: string | null; latitude: number | null; longitude: number | null }[];
}

/** Store a Google match (filling empty fields only) or just mark the business as looked up. */
export async function savePlacesMatch(
  id: string,
  m: { placeId: string; phone: string | null; website: string | null; rating: number | null; reviewCount: number | null } | null,
): Promise<void> {
  if (!m) {
    await prisma.business.update({ where: { id }, data: { placesCheckedAt: new Date() } });
    return;
  }
  const b: any = await prisma.business.findUnique({ where: { id } });
  if (!b) return;
  const merged = {
    phone: b.phone ?? m.phone,
    website: b.website ?? m.website,
    googleRating: b.googleRating ?? m.rating,
    reviewCount: b.reviewCount ?? m.reviewCount,
  };
  const prospect = scoreProspect({
    niche: b.niche, website: merged.website, phone: merged.phone, email: b.email, googleRating: merged.googleRating, reviewCount: merged.reviewCount, instagramUrl: b.instagramUrl, linkedinUrl: b.linkedinUrl,
  });
  // googlePlaceId is unique: if another row already holds this place (a duplicate listing), keep the details but not the id.
  const taken = b.googlePlaceId ? true : !!(await prisma.business.findUnique({ where: { googlePlaceId: m.placeId }, select: { id: true } }));
  await prisma.business.update({
    where: { id },
    data: {
      ...merged,
      ...(taken ? {} : { googlePlaceId: m.placeId }),
      placesCheckedAt: new Date(),
      opportunityFlags: JSON.stringify(prospect.flags),
      opportunityScore: prospect.score,
    },
  });
}

const webPhoneCandidates = { phone: null, webPhoneCheckedAt: null };

export async function countWebPhoneCandidates(): Promise<number> {
  return prisma.business.count({ where: webPhoneCandidates as any });
}

export async function listWebPhoneCandidates(take: number) {
  return (await prisma.business.findMany({
    where: webPhoneCandidates as any,
    select: { id: true, name: true, city: true, country: true, locality: true, address: true },
    orderBy: [{ opportunityScore: "desc" }, { createdAt: "asc" }],
    take,
  })) as { id: string; name: string; city: string; country: string | null; locality: string | null; address: string | null }[];
}

/** Save a web-search phone (marked unverified) if the business still has none, re-score, and mark it tried. */
export async function saveWebPhone(id: string, phone: string | null): Promise<void> {
  const b: any = await prisma.business.findUnique({ where: { id } });
  if (!b) return;
  if (!phone || b.phone) {
    await prisma.business.update({ where: { id }, data: { webPhoneCheckedAt: new Date() } });
    return;
  }
  const prospect = scoreProspect({
    niche: b.niche, website: b.website, phone, email: b.email, googleRating: b.googleRating, reviewCount: b.reviewCount, instagramUrl: b.instagramUrl, linkedinUrl: b.linkedinUrl,
  });
  await prisma.business.update({
    where: { id },
    data: { phone, phoneSource: "WEB_SEARCH", webPhoneCheckedAt: new Date(), opportunityFlags: JSON.stringify(prospect.flags), opportunityScore: prospect.score },
  });
}

export async function getAuditJson(businessId: string): Promise<string | null> {
  const row = await prisma.business.findUnique({ where: { id: businessId }, select: { auditJson: true } });
  return row?.auditJson ?? null;
}

/* ------------------------------------------------------------------ */
/* notes                                                               */
/* ------------------------------------------------------------------ */

export async function listNotes(businessId: string) {
  const rows: any[] = await prisma.businessNote.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((n) => ({
    id: n.id as string,
    content: n.content as string,
    author: n.author as string,
    createdAt: new Date(n.createdAt).toISOString(),
  }));
}

export async function addNote(businessId: string, content: string, author?: string) {
  const n = await prisma.businessNote.create({
    data: { businessId, content, ...(author ? { author } : {}) },
  });
  return { id: n.id as string, content: n.content as string, author: n.author as string, createdAt: new Date(n.createdAt).toISOString() };
}

/* ------------------------------------------------------------------ */
/* social leads                                                        */
/* ------------------------------------------------------------------ */

export interface LeadInput {
  platform: Platform;
  sourceUrl: string;
  authorHandle: string | null;
  postTitle: string | null;
  postContent: string;
  postedAt: Date | null;
  painPoint: string | null;
  matchedServices: string[];
  intentCategory: IntentCategory;
  classifiedBy: "AI" | "RULES";
  confidence: number | null;
  pitchDraft: LeadPitch | null;
}

/** Inserts new leads; existing source URLs are left untouched so status/notes are never overwritten. */
export async function insertNewLeads(items: LeadInput[]): Promise<{ created: number; duplicates: number }> {
  let created = 0;
  let duplicates = 0;
  for (const l of items) {
    const exists = await prisma.socialIntentLead.findUnique({ where: { sourceUrl: l.sourceUrl }, select: { id: true } });
    if (exists) {
      duplicates++;
      continue;
    }
    await prisma.socialIntentLead.create({
      data: {
        platform: l.platform,
        sourceUrl: l.sourceUrl,
        authorHandle: l.authorHandle,
        postTitle: l.postTitle,
        postContent: l.postContent,
        postedAt: l.postedAt,
        painPoint: l.painPoint,
        matchedServices: JSON.stringify(l.matchedServices),
        intentCategory: l.intentCategory,
        classifiedBy: l.classifiedBy,
        confidence: l.confidence,
        pitchDraft: l.pitchDraft ? JSON.stringify(l.pitchDraft) : null,
      },
    });
    created++;
  }
  return { created, duplicates };
}

export async function listLeads(filter: { platform?: string; status?: string; category?: string; shortlisted?: boolean } = {}): Promise<SocialLeadDTO[]> {
  const where: any = {};
  if (filter.platform) where.platform = filter.platform;
  if (filter.status) where.status = filter.status;
  if (filter.category) where.intentCategory = filter.category;
  if (filter.shortlisted) where.shortlisted = true;
  const rows: any[] = await prisma.socialIntentLead.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    take: 500,
  });
  return rows.map(toLeadDTO);
}

export async function updateLead(id: string, patch: { status?: string; pitchDraft?: LeadPitch; shortlisted?: boolean }): Promise<SocialLeadDTO> {
  const data: Record<string, unknown> = {};
  if (patch.status) data.status = patch.status;
  if (patch.pitchDraft) data.pitchDraft = JSON.stringify(patch.pitchDraft);
  if (typeof patch.shortlisted === "boolean") data.shortlisted = patch.shortlisted;
  const row = await prisma.socialIntentLead.update({ where: { id }, data });
  return toLeadDTO(row);
}

export async function getLead(id: string): Promise<SocialLeadDTO | null> {
  const row = await prisma.socialIntentLead.findUnique({ where: { id } });
  return row ? toLeadDTO(row) : null;
}

/* ------------------------------------------------------------------ */
/* settings + cold email                                               */
/* ------------------------------------------------------------------ */

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row ? parseJson<T>(row.value, fallback) : fallback;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const v = JSON.stringify(value);
  await prisma.setting.upsert({ where: { key }, create: { key, value: v }, update: { value: v } });
}

/** Businesses to email, with their saved audit (if any) for the personal part of the message. */
export async function saveResearch(id: string, research: unknown): Promise<void> {
  await prisma.business.update({ where: { id }, data: { researchJson: JSON.stringify(research) } });
}

export async function getEmailTargets(ids: string[]): Promise<{ business: BusinessDTO; auditJson: string | null; researchJson: string | null }[]> {
  const rows: any[] = await prisma.business.findMany({ where: { id: { in: ids } }, include: { _count: { select: { crmNotes: true } } } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.filter((id) => byId.has(id)).map((id) => ({ business: toBusinessDTO(byId.get(id)), auditJson: byId.get(id).auditJson ?? null, researchJson: byId.get(id).researchJson ?? null }));
}

export async function countEmailsSentSince(since: Date): Promise<number> {
  // Follow-ups count too: Gmail's daily limit covers every email the account sends.
  const [first, followUps] = await Promise.all([
    prisma.business.count({ where: { emailedAt: { gte: since }, emailStatus: "SENT" } }),
    prisma.business.count({ where: { followUpSentAt: { gte: since } } }),
  ]);
  return first + followUps;
}

/**
 * Claim a business for sending: succeeds only if it was never emailed, so two clicks, two tabs or
 * the cron running at the same time can never send the same business two emails.
 */
export async function claimForSend(id: string): Promise<boolean> {
  const r = await prisma.business.updateMany({ where: { id, email: { not: null }, OR: [{ emailStatus: null }, { emailStatus: "FAILED" }] } as any, data: { emailStatus: "SENDING" } });
  return r.count === 1;
}

export async function markEmailed(id: string, ok: boolean, error: string | null, knownStage?: string, sent?: { subject: string; messageId: string | null; focus: string | null; body?: string }): Promise<void> {
  const stage = knownStage ?? (await prisma.business.findUnique({ where: { id }, select: { pipelineStage: true } }))?.pipelineStage;
  await prisma.business.update({
    where: { id },
    data: ok
      ? { emailedAt: new Date(), emailStatus: "SENT", emailError: null, emailQueuedAt: null, ...(sent ? { emailSubject: sent.subject, emailMessageId: sent.messageId, emailFocus: sent.focus, emailBody: sent.body ?? null } : {}), lastContactedAt: new Date(), ...(stage === "LEAD" ? { pipelineStage: "PITCH_SENT" } : {}) }
      : { emailStatus: "FAILED", emailError: error?.slice(0, 500) ?? "Send failed", emailQueuedAt: null },
  });
}

/** Businesses that can be queued: an email address, never emailed, not opted out. */
const queueable = { email: { not: null }, OR: [{ emailStatus: null }, { emailStatus: "FAILED" }] };

export async function queueForEmail(ids: string[], skipCountries: string[] = []): Promise<number> {
  let n = 0;
  for (let i = 0; i < ids.length; i += 1000) {
    const r = await prisma.business.updateMany({ where: { id: { in: ids.slice(i, i + 1000) }, emailQueuedAt: null, ...queueable, ...(skipCountries.length ? { NOT: { country: { in: skipCountries } } } : {}) } as any, data: { emailQueuedAt: new Date() } });
    n += r.count;
  }
  return n;
}

export async function clearEmailQueue(): Promise<number> {
  return (await prisma.business.updateMany({ where: { emailQueuedAt: { not: null } }, data: { emailQueuedAt: null } })).count;
}

export async function countEmailQueue(): Promise<number> {
  return prisma.business.count({ where: { emailQueuedAt: { not: null }, ...queueable } as any });
}

export async function nextQueuedIds(take: number, skipCountries: string[] = []): Promise<string[]> {
  const rows = await prisma.business.findMany({ where: { emailQueuedAt: { not: null }, ...queueable, ...(skipCountries.length ? { NOT: { country: { in: skipCountries } } } : {}) } as any, orderBy: [{ emailQueuedAt: "asc" }, { id: "asc" }], select: { id: true }, take });
  return rows.map((r: { id: string }) => r.id);
}

export async function unqueue(id: string): Promise<void> {
  await prisma.business.update({ where: { id }, data: { emailQueuedAt: null } });
}

export async function queueAgain(id: string): Promise<void> {
  await prisma.business.update({ where: { id }, data: { emailQueuedAt: new Date() } });
}

/** How many businesses in the directory share this website domain (several = a chain or group). */
export async function countSameDomain(domain: string): Promise<number> {
  return prisma.business.count({ where: { website: { contains: domain, mode: "insensitive" } } as any });
}

/** Sent emails from the last 30 days that haven't had a reply recorded yet. */
export async function listAwaitingReply(): Promise<{ id: string; email: string; emailedAt: Date; followUpSentAt: Date | null }[]> {
  const since = new Date(Date.now() - 30 * 86400_000);
  return (await prisma.business.findMany({
    where: { emailStatus: "SENT", repliedAt: null, emailedAt: { gte: since }, email: { not: null } },
    select: { id: true, email: true, emailedAt: true, followUpSentAt: true },
  })) as any;
}

export async function markReplied(ids: string[]): Promise<void> {
  if (ids.length) await prisma.business.updateMany({ where: { id: { in: ids } }, data: { repliedAt: new Date() } });
}

/** Sent, no reply, no follow-up yet, sent on or before `before`. */
export async function listFollowUpsDue(before: Date, take: number): Promise<{ business: BusinessDTO; subject: string | null; messageId: string | null; focus: string | null }[]> {
  const rows: any[] = await prisma.business.findMany({
    where: { emailStatus: "SENT", repliedAt: null, followUpSentAt: null, emailedAt: { lte: before, gte: new Date(Date.now() - 30 * 86400_000) }, email: { not: null } },
    include: { _count: { select: { crmNotes: true } } },
    orderBy: { emailedAt: "asc" },
    take,
  });
  return rows.map((r) => ({ business: toBusinessDTO(r), subject: r.emailSubject ?? null, messageId: r.emailMessageId ?? null, focus: r.emailFocus ?? null }));
}

/** Claim a follow-up so it can only ever be sent once. */
export async function claimFollowUp(id: string): Promise<boolean> {
  return (await prisma.business.updateMany({ where: { id, followUpSentAt: null, repliedAt: null }, data: { followUpSentAt: new Date() } })).count === 1;
}

export async function countReplies(): Promise<number> {
  return prisma.business.count({ where: { repliedAt: { not: null } } });
}

export interface OutreachRow {
  id: string;
  name: string;
  email: string | null;
  city: string;
  country: string | null;
  website: string | null;
  phone: string | null;
  pipelineStage: string;
  status: string | null;
  queued: boolean;
  sentAt: string | null;
  subject: string | null;
  body: string | null;
  followUpAt: string | null;
  repliedAt: string | null;
  error: string | null;
}

/** Everyone the outreach has touched: sent, failed, opted out, or waiting in the queue. */
export async function listOutreach(): Promise<OutreachRow[]> {
  const rows: any[] = await prisma.business.findMany({
    where: { OR: [{ emailStatus: { not: null } }, { emailQueuedAt: { not: null } }] } as any,
    select: { id: true, name: true, email: true, city: true, country: true, website: true, phone: true, pipelineStage: true, emailStatus: true, emailQueuedAt: true, emailedAt: true, emailSubject: true, emailBody: true, followUpSentAt: true, repliedAt: true, emailError: true },
    orderBy: [{ emailedAt: { sort: "desc", nulls: "last" } }, { id: "asc" }],
  });
  const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);
  return rows.map((r) => ({
    id: r.id, name: r.name, email: r.email, city: r.city, country: r.country, website: r.website, phone: r.phone, pipelineStage: r.pipelineStage,
    status: r.emailStatus, queued: !!r.emailQueuedAt, sentAt: iso(r.emailedAt), subject: r.emailSubject, body: r.emailBody,
    followUpAt: iso(r.followUpSentAt), repliedAt: iso(r.repliedAt), error: r.emailError,
  }));
}

/** Manual corrections from the Outreach tab. */
export async function setOutreachFlag(id: string, flag: "replied" | "not-replied" | "opt-out"): Promise<void> {
  if (flag === "replied") await prisma.business.update({ where: { id }, data: { repliedAt: new Date() } });
  else if (flag === "not-replied") await prisma.business.update({ where: { id }, data: { repliedAt: null } });
  else await prisma.business.update({ where: { id }, data: { emailStatus: "OPTED_OUT", emailQueuedAt: null } });
}

/* email finder */
const siteEmailCandidates = { website: { not: null }, email: null, emailCheckedAt: null };
const webEmailCandidates = { website: null, email: null, webEmailCheckedAt: null };

export async function countEmailFinderCandidates(): Promise<{ sites: number; web: number }> {
  const [sites, web] = await Promise.all([prisma.business.count({ where: siteEmailCandidates as any }), prisma.business.count({ where: webEmailCandidates as any })]);
  return { sites, web };
}

export async function listSiteEmailCandidates(take: number): Promise<{ id: string; website: string }[]> {
  return (await prisma.business.findMany({ where: siteEmailCandidates as any, select: { id: true, website: true }, orderBy: [{ opportunityScore: "desc" }, { id: "asc" }], take })) as any;
}

export async function listWebEmailCandidates(take: number): Promise<{ id: string; name: string; city: string; locality: string | null }[]> {
  return (await prisma.business.findMany({ where: webEmailCandidates as any, select: { id: true, name: true, city: true, locality: true }, orderBy: [{ opportunityScore: "desc" }, { id: "asc" }], take })) as any;
}

/** Fill the email only if still empty; always mark as checked so the loop moves on. */
export async function saveFoundEmail(id: string, email: string | null, source: "SITE" | "WEB_SEARCH"): Promise<void> {
  const now = new Date();
  const mark = source === "SITE" ? { emailCheckedAt: now } : { webEmailCheckedAt: now };
  if (email) {
    const r = await prisma.business.updateMany({ where: { id, email: null }, data: { email, emailSource: source === "WEB_SEARCH" ? "WEB_SEARCH" : null, ...mark } as any });
    if (r.count) return;
  }
  await prisma.business.update({ where: { id }, data: mark as any });
}

export async function firstEmailSentAt(): Promise<Date | null> {
  const r = await prisma.business.findFirst({ where: { emailStatus: "SENT", emailedAt: { not: null } }, orderBy: { emailedAt: "asc" }, select: { emailedAt: true } });
  return r?.emailedAt ?? null;
}

/** Undo a send claim when Gmail refused the email (it was never sent), so it goes out later. */
export async function releaseClaim(id: string): Promise<void> {
  await prisma.business.updateMany({ where: { id, emailStatus: "SENDING" }, data: { emailStatus: null, emailError: null } });
}

export async function claimFollowUpUndo(id: string): Promise<void> {
  await prisma.business.update({ where: { id }, data: { followUpSentAt: null } });
}

/** Emails Gmail refused because of its own block: not the business's fault, so they go back to unsent. */
export async function resetGmailBlockFailures(): Promise<number> {
  return (await prisma.business.updateMany({
    where: { emailStatus: "FAILED", OR: [{ emailError: { contains: "5.4.5" } }, { emailError: { contains: "534" } }, { emailError: { contains: "Invalid login" } }] } as any,
    data: { emailStatus: null, emailError: null },
  })).count;
}
