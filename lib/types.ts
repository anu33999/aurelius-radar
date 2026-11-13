export type Platform = "REDDIT" | "TWITTER" | "LINKEDIN";
export type IntentCategory = "BUYER_HIRING" | "ADVICE_SEEKING";
export type GapStatus = "CONFIRMED" | "LIKELY" | "UNVERIFIABLE";
export type PipelineStage =
  | "LEAD"
  | "PITCH_SENT"
  | "MEETING_BOOKED"
  | "PROPOSAL_SHARED"
  | "CLOSED_WON"
  | "CLOSED_LOST";
export type Priority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export const PIPELINE_STAGES: { key: PipelineStage; label: string }[] = [
  { key: "LEAD", label: "New" },
  { key: "PITCH_SENT", label: "Pitched" },
  { key: "MEETING_BOOKED", label: "Meeting Booked" },
  { key: "PROPOSAL_SHARED", label: "In Negotiation" },
  { key: "CLOSED_WON", label: "Closed Won" },
  { key: "CLOSED_LOST", label: "Lost" },
];

export interface ServiceDef {
  code: string;
  name: string;
  practiceArea: string;
  summary: string;
  tags: string[];
  isAI: boolean;
}

export interface Gap {
  id: string;
  title: string;
  status: GapStatus;
  evidence: string;
  impact: string;
  /** Higher = bigger commercial leak. Used to rank the top 5 revenue opportunities. */
  weight: number;
  tags: string[];
  quickWin: boolean;
}

export interface Baseline {
  inputUrl: string;
  finalUrl: string | null;
  fetchedAt: string;
  httpStatus: number | null;
  fetchError: string | null;
  https: boolean;
  cms: { name: string; evidence: string } | null;
  viewportMeta: boolean;
  title: string | null;
  metaDescription: string | null;
  h1Count: number;
  canonical: boolean;
  robotsNoindex: boolean;
  sitemap: "found" | "not_found" | "unknown";
  structuredData: string[];
  tracking: {
    metaPixel: boolean;
    gtm: boolean;
    ga4: boolean;
    googleAds: boolean;
    tiktokPixel: boolean;
    linkedinInsight: boolean;
    heatmap: string | null;
  };
  widgets: { liveChat: string | null; whatsapp: boolean; whatsappNumber?: string | null; crm: string | null };
  /** What the site already offers customers, so outreach never suggests something they have. Missing on audits made before this was added. */
  features?: { booking: string | null; events: boolean; newsletter: boolean; ordering: string | null; menu: boolean };
  formCount: number;
  ecommerce: boolean;
  social: Record<"instagram" | "linkedin" | "x" | "youtube" | "facebook", string | null>;
  performance: {
    source: "PageSpeed Insights" | "unavailable";
    mobileScore: number | null;
    lcpSeconds: number | null;
    cls: number | null;
    tbtMs: number | null;
    note: string;
  };
  pageWeightKb: number | null;
  scriptCount: number;
  imageCount: number;
  imagesMissingAlt: number;
  links: { metaAdLibrary: string; googleAdsTransparency: string; googleMaps: string };
}

export interface ServiceMatchGroup {
  quickWins: { service: ServiceDef; because: string }[];
  coreGrowth: { service: ServiceDef; because: string }[];
  doNotPitch: { area: string; reason: string }[];
}

export interface PitchPack {
  generatedBy: "AI" | "TEMPLATE";
  coldEmail: { subject: string; body: string };
  whatsapp: string;
  linkedinInMail: string;
  coldCallScript: string;
  discoveryQuestions: string[];
  proposal: {
    scope: string[];
    deliverables: string[];
    kpis: string[];
    sla: string[];
    commercials: string;
  };
  score: {
    total: number;
    rubric: { criterion: string; points: number; max: number; note: string }[];
  };
}

export interface AuditResult {
  businessName: string;
  website: string | null;
  baseline: Baseline | null;
  gaps: Gap[];
  topOpportunities: Gap[];
  match: ServiceMatchGroup;
  pitch: PitchPack;
  readinessScore: number;
  opportunityScore: number;
  warnings: string[];
}

export interface LeadPitch {
  comment: string;
  dm: string;
  generatedBy: "AI" | "TEMPLATE";
}

export interface SocialLeadDTO {
  id: string;
  platform: Platform;
  sourceUrl: string;
  authorHandle: string | null;
  postTitle: string | null;
  postContent: string;
  postedAt: string | null;
  painPoint: string | null;
  matchedServices: string[];
  intentCategory: IntentCategory;
  classifiedBy: "AI" | "RULES";
  confidence: number | null;
  status: "NEW" | "CONTACTED" | "ARCHIVED";
  pitchDraft: LeadPitch | null;
  shortlisted: boolean;
  createdAt: string;
}

export interface BusinessDTO {
  id: string;
  name: string;
  industry: string | null;
  website: string | null;
  phone: string | null;
  /** "WEB_SEARCH" when the phone was read from search results (show as unverified); null otherwise. */
  phoneSource: string | null;
  email: string | null;
  /** "WEB_SEARCH" when the email was read from search results (verify); null otherwise. */
  emailSource: string | null;
  address: string | null;
  city: string;
  locality: string | null;
  state: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  niche: string | null;
  googleRating: number | null;
  reviewCount: number | null;
  googlePlaceId: string | null;
  instagramUrl: string | null;
  linkedinUrl: string | null;
  /** Confirmed WhatsApp number (OSM contact:whatsapp or a wa.me link on their site). A phone number alone is never assumed to be on WhatsApp. */
  whatsapp: string | null;
  flags: string[];
  shortlisted: boolean;
  lastContactedAt: string | null;
  source: string | null;
  estimatedRevenue: string | null;
  techStack: string | null;
  pipelineStage: PipelineStage;
  priority: Priority;
  monthlyBudget: string | null;
  notes: string | null;
  pitchSummary: string | null;
  matchedServiceIds: string[];
  readinessScore: number | null;
  opportunityScore: number | null;
  lastAuditedAt: string | null;
  /** When the cold email went out from the app; emailStatus is SENT, FAILED or OPTED_OUT. */
  emailedAt: string | null;
  emailStatus: string | null;
  /** When a reply from their address was found in Gmail, and when the single follow-up went out. */
  repliedAt: string | null;
  followUpSentAt: string | null;
  createdAt: string;
  updatedAt: string;
  noteCount: number;
}
