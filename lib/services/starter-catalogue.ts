import type { ServiceDef } from "@/lib/types";

/**
 * STARTER CATALOGUE.
 *
 * This is NOT the real 206-service Aurelius catalogue. The real catalogue lives in your
 * service-architecture HTML file, which was not available when this project was generated.
 * These entries are a representative starter set organised under the 11 practice areas
 * described in the Kreatif Atelier company profile, with matcher tags attached.
 *
 * Replace it with the real data:
 *   npm run catalogue:import -- path/to/catalogue.json   (or .csv / the architecture .html)
 * or paste JSON into the Catalogue panel in the Audit tab.
 *
 * Service codes below are placeholders - they are replaced on import.
 */
const s = (
  code: string,
  name: string,
  practiceArea: string,
  summary: string,
  tags: string[],
  isAI = false,
): ServiceDef => ({ code, name, practiceArea, summary, tags, isAI });

export const STARTER_CATALOGUE: ServiceDef[] = [
  // Digital marketing
  s("DM-01", "Short-form video & Reels programme", "Digital marketing", "Always-on Reels/Shorts content system with a monthly calendar and commercial CTAs", ["video", "reels", "social", "content"]),
  s("DM-02", "Social & community management", "Digital marketing", "Channel strategy, posting cadence, community replies and reporting", ["social", "content"]),
  s("DM-03", "WhatsApp Business API campaigns", "Digital marketing", "Broadcasts, catalogue flows and click-to-WhatsApp journeys", ["whatsapp", "automation", "lifecycle"]),
  s("DM-04", "Email & lifecycle marketing", "Digital marketing", "Welcome, post-purchase, win-back and abandoned-cart flows", ["email", "lifecycle", "abandoned-cart", "automation"]),
  s("DM-05", "CRM & retention programmes", "Digital marketing", "Segmentation, loyalty and repeat-purchase journeys", ["crm", "lifecycle", "ecommerce"]),
  s("DM-06", "Creator & influencer campaigns", "Digital marketing", "Creator sourcing, briefs and performance tracking", ["social", "video", "content"]),
  // PR and reputation
  s("PR-01", "Media relations", "PR and reputation", "Press outreach and earned-media placement", ["pr", "reputation"]),
  s("PR-02", "Thought leadership for founders", "PR and reputation", "LinkedIn and byline programme positioning the founder as the category voice", ["pr", "linkedin", "content"]),
  s("PR-03", "Online reputation management", "PR and reputation", "Review generation, response playbooks and listing hygiene", ["reputation", "local-seo", "reviews"]),
  s("PR-04", "Crisis communication", "PR and reputation", "Holding statements and response protocols", ["pr", "reputation"]),
  // Sales promotions
  s("SP-01", "Festive & seasonal campaigns", "Sales promotions", "Offer architecture and creative for peak-season revenue", ["promotions", "ecommerce", "content"]),
  s("SP-02", "Contests & gamification", "Sales promotions", "Contest mechanics that build lists and engagement", ["promotions", "social", "lead-gen"]),
  s("SP-03", "Dealer & loyalty programmes", "Sales promotions", "Channel incentives and loyalty design", ["promotions", "crm"]),
  // SEO
  s("SEO-01", "Technical SEO audit & fixes", "SEO", "Crawlability, indexing, canonicals, sitemap and structured data fixes", ["seo", "technical-seo", "schema"]),
  s("SEO-02", "Local SEO & Google Business Profile", "SEO", "GBP optimisation, citations and multi-location landing pages", ["local-seo", "seo", "reviews", "schema"]),
  s("SEO-03", "Multi-location schema & store pages", "SEO", "LocalBusiness schema and location page templates", ["local-seo", "schema", "seo"]),
  s("SEO-04", "Content clusters & programmatic SEO", "SEO", "Topic clusters and templated pages that capture non-branded demand", ["seo", "content"]),
  s("SEO-05", "Core Web Vitals optimisation", "SEO", "LCP/CLS/INP fixes for ranking and conversion", ["speed", "mobile", "seo", "web"]),
  s("SEO-06", "Migration & recovery SEO", "SEO", "Redirect mapping and traffic recovery after a rebuild", ["seo", "technical-seo", "web"]),
  // Brand and design
  s("BD-01", "Brand strategy & positioning", "Brand and design", "Positioning, messaging and audience architecture", ["branding"]),
  s("BD-02", "Visual identity & guidelines", "Brand and design", "Identity system with usage guidelines", ["branding", "content"]),
  s("BD-03", "Packaging design", "Brand and design", "Retail and DTC packaging systems", ["branding", "packaging", "ecommerce"]),
  s("BD-04", "Pitch decks & sales collateral", "Brand and design", "Investor and sales decks, brochures, company profiles", ["pitch-deck", "branding", "b2b"]),
  s("BD-05", "Design systems", "Brand and design", "Reusable UI/brand component libraries", ["branding", "web"]),
  // Paid media
  s("PM-01", "Meta Ads (prospecting & retargeting)", "Paid media", "Full-funnel Meta campaigns with creative testing", ["performance-ads", "meta-ads", "social"]),
  s("PM-02", "Google Search & Shopping Ads", "Paid media", "Search, Shopping and Performance Max management", ["performance-ads", "google-ads", "ecommerce"]),
  s("PM-03", "LinkedIn Ads for B2B", "Paid media", "ABM and lead-gen campaigns on LinkedIn", ["performance-ads", "linkedin", "b2b", "lead-gen"]),
  s("PM-04", "YouTube & video ads", "Paid media", "Video campaign strategy and creative", ["performance-ads", "video"]),
  s("PM-05", "Creative strategy & testing", "Paid media", "Hooks, angles and an iterative creative-testing cadence", ["performance-ads", "content", "video"]),
  // Analytics
  s("AN-01", "GA4 & GTM implementation", "Analytics", "Clean event schema, conversions and consent-aware tagging", ["tracking", "analytics"]),
  s("AN-02", "Server-side tracking & Meta CAPI", "Analytics", "Server-side GTM and Conversions API for resilient attribution", ["tracking", "analytics", "meta-ads"]),
  s("AN-03", "Marketing dashboards & reporting", "Analytics", "Live ROAS/CPA/pipeline dashboards", ["analytics", "reporting"]),
  s("AN-04", "A/B testing programme", "Analytics", "Hypothesis-led experiments on landing pages and checkout", ["cro", "analytics"]),
  s("AN-05", "Attribution & marketing-mix modelling", "Analytics", "Channel contribution and budget allocation modelling", ["analytics", "performance-ads"], true),
  // Growth and lead generation
  s("GL-01", "Go-to-market & growth audit", "Growth and lead generation", "Funnel diagnosis and a prioritised growth roadmap", ["lead-gen", "cro"]),
  s("GL-02", "Landing page CRO", "Growth and lead generation", "Conversion-focused landing pages and form optimisation", ["cro", "landing-page", "lead-gen", "web"]),
  s("GL-03", "Lead capture & qualification pipelines", "Growth and lead generation", "Forms, WhatsApp and CRM routing with lead scoring", ["lead-gen", "crm", "automation", "forms"]),
  s("GL-04", "Outbound & inbound lead generation", "Growth and lead generation", "Outbound sequencing and inbound content engines", ["lead-gen", "b2b", "linkedin"]),
  s("GL-05", "CRM setup & lead scoring", "Growth and lead generation", "HubSpot/Zoho/Salesforce configuration and pipelines", ["crm", "lead-gen", "automation"]),
  // Production
  s("PD-01", "Product photography", "Production", "Catalogue and lifestyle photography", ["content", "ecommerce", "photography"]),
  s("PD-02", "Commercial film & brand video", "Production", "Brand films, explainers and ad creative", ["video", "content"]),
  s("PD-03", "Motion & animation", "Production", "2D/3D motion graphics for ads and explainers", ["video", "content"]),
  s("PD-04", "Reels production studio", "Production", "Batch-shot short-form video production", ["video", "reels", "content"]),
  // Technology
  s("TC-01", "Shopify custom build & optimisation", "Technology", "Shopify theme builds, apps and checkout optimisation", ["web", "ecommerce", "shopify", "cro"]),
  s("TC-02", "Next.js / custom web builds", "Technology", "Fast, SEO-ready marketing sites and web apps", ["web", "speed", "seo"]),
  s("TC-03", "Website redesign & UX", "Technology", "UX research, UI design and rebuild", ["web", "cro", "mobile"]),
  s("TC-04", "Mobile responsiveness & performance engineering", "Technology", "Mobile-first fixes and performance budgets", ["mobile", "speed", "web"]),
  s("TC-05", "Custom calculators & lead tools", "Technology", "Interactive calculators that capture qualified leads", ["lead-gen", "web", "cro"]),
  s("TC-06", "Marketing automation build (n8n / Make / Zapier)", "Technology", "Workflow automation across forms, CRM, email and WhatsApp", ["automation", "crm", "lead-gen"]),
  s("TC-07", "Website maintenance & security", "Technology", "Updates, backups, SSL and uptime monitoring", ["web", "security"]),
  // Advisory, AI and people
  s("AI-01", "AI chatbot & lead-qualification assistant", "Advisory, AI and people", "Website/WhatsApp assistant that answers and qualifies", ["ai", "chatbot", "lead-gen", "automation", "whatsapp"], true),
  s("AI-02", "AI content & creative workflows", "Advisory, AI and people", "Governed AI-assisted content production pipelines", ["ai", "content", "automation"], true),
  s("AI-03", "Fractional CMO", "Advisory, AI and people", "Senior marketing leadership on a retained basis", ["lead-gen", "strategy"]),
  s("AI-04", "Digital transformation advisory", "Advisory, AI and people", "Process, tooling and automation roadmap", ["automation", "strategy"]),
  s("AI-05", "Marketing team training", "Advisory, AI and people", "Upskilling in-house teams on performance and AI tooling", ["strategy", "ai"]),
];
