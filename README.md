# Aurelius Radar — Kreatif Atelier commercial client intelligence

Two acquisition engines in one app (Next.js 15, TypeScript, Prisma/SQLite, Tailwind, Leaflet):

- **Engine A — Deep Commercial Audit:** inspect any brand's public site, tracking, SEO and social links, rank revenue gaps, match them to Aurelius services, and generate a full outreach pack.
- **Engine B — Social Intent Radar:** search public Reddit / X / LinkedIn posts for founders asking for agencies, developers, SEO or growth help; an AI (or rule-based) classifier keeps only real buyers and advice-seekers.

Tabs: Single Prospect Audit · Social Intent Radar · International Directory · Client CRM & Pipeline · Global Map.

**No seed or demo data.** Every prospect comes from a live import (OpenStreetMap, or Google Places with a key) or from you. Nothing is pre-loaded or invented.

## What's in it

- **Theme switcher** (top right): 8 themes (Electric Sunset, Cyber Neon, Citrus & Mint, Modern Studio, Maroon Velvet, Blush & Maroon, Midnight Blue, Cloud & Azure). Colours are CSS variables in `app/globals.css`; the choice is remembered in the browser.
- **International Directory:** import real businesses by market (US, Canada, UK, Europe, UAE, Singapore, Australia/NZ, South Africa, and Indian metros) or any city, optionally by niche (cafes, salons, clinics, dental, real estate, architecture, interior design, jewelry, furniture, boutiques, fitness...). Niche searches also find businesses with **no website**. Each prospect gets signal chips (Needs website, Low rating, Few reviews, No social link found) and a pre-audit **opportunity score** (budget potential 40 + urgency 35 + reachability 25).
- **Offer & pricing** (open a lead in the CRM, or click **Offer** in the directory): best services to lead with and why, plus Silver/Gold/Platinum monthly retainers **in the prospect's own currency**, a recommended starting tier, and a one-off website build price when no site exists. Prices come from `data/pricing.json` (your numbers: India Rs 25k / 50k / 1L, global $1,500 / $3,000 / $5,000 per month), converted with live ECB rates (falls back to built-in estimates).
- **Outreach kit:** WhatsApp (with a `wa.me` link), Instagram DM, cold email, LinkedIn, an objection battle card and a 1-page proposal. Built only from facts the app holds; never invents results.
- **CRM:** Kanban with tap-to-call, a 48-hour follow-up alert, "Mark contacted today", and notes.
- **Global Map:** pins coloured by stage (green paying, pink meeting/proposal, amber pitched, grey uncontacted), filters by niche and country, popup with call, website and WhatsApp.
- **Shortlist tab:** click ☆ Select on any directory row, CRM card or radar post and it appears in the Shortlist tab (businesses and posts together, with call, WhatsApp, offer and copy-reply buttons). Stored in the database.
- **Social Intent Radar:** keeps only people who *need* marketing help. Sellers (freelancers, agencies, "DM me", free audits, pricing, job ads, listicles) are rejected by a weighted rule set that also overrides the AI.

## Setup

```bash
npm install
cp .env.example .env        # then fill in the keys below
npx prisma generate
npx prisma db push          # creates ./prisma/dev.db
npm run db:seed             # optional: loads only the placeholder SERVICE catalogue (no prospects)
npm run dev                 # http://localhost:3000   (use: npm run dev -- -p 3001 if 3000 is taken)
npm run selftest            # offline checks of the logic (no DB/network/keys needed)
```

### Environment variables

| Variable | Needed for | Without it |
|---|---|---|
| `TINYFISH_API_KEY`, `TAVILY_API_KEY` or `BRAVE_API_KEY` (one is enough; priority Tavily, TinyFish, Brave) | Social Intent Radar scans; looking up a site from a brand name | Radar scanning is disabled with a clear message; audits still work if you paste a URL |
| `ANTHROPIC_API_KEY` | AI intent classifier, AI-written pitches and reply drafts | Rule-based classifier and template pitches are used and labelled as such |
| `PAGESPEED_API_KEY` (optional) | Higher PageSpeed Insights quota | Anonymous quota is used |
| `SENDER_NAME` (optional) | Signature in lead reply drafts and outreach kit | "Kreatif Atelier" |
| `GOOGLE_PLACES_API_KEY` (optional) | Rating, review count and phone on niche imports (Places API New, Text Search). Check Google's terms on storing Places data | OpenStreetMap is used (no ratings). Google does not expose whether a profile is "claimed", so the app never claims it |
| `STUDIO_LOCATION` (optional) | Studio location in outreach wording, e.g. "Jaipur, India" | Omitted |

## Important: replace the starter catalogue

The real 206-service catalogue was not available when this project was generated, so service matching ships with a **starter catalogue** (~55 services under your 11 practice areas, with matcher tags). Replace it with the real one:

```bash
npm run catalogue:import -- path/to/catalogue.json    # or .csv, or your service-architecture .html
```

or use **Import service catalogue** in the Audit tab. Accepted columns/keys (case-insensitive): `code|id`, `name|title|service`, `practiceArea|division|department`, `summary|description`, `tags`, `isAI`. Tags are auto-derived from names and practice areas when absent. The HTML importer looks for JSON embedded in `<script>` tags and is best-effort — if it can't parse your file, export JSON or CSV.

Also edit **`data/proof.json`**: it holds the proof points used in outreach. Entries still containing `TODO` are treated as placeholders and earn no "commercial proof" points in the pitch score. Add only real, cleared outcomes.

## How the honesty rules work

- Every gap is **Confirmed Issue**, **Likely Opportunity** or **Unverifiable Online**. Pixels, GA4, CAPI, abandoned-cart flows, Google Business Profile rank and social engagement can't be measured from outside, so they are never reported as failures. A missing pixel is phrased "not detected in public markup", and drops to *Unverifiable* when a GTM container is present.
- **What NOT to pitch** is derived from positive findings (fast site, tracking present, WhatsApp + forms present, no storefront, etc.).
- Pitch templates never invent prices or statistics. The proposal's commercials line says no figure has been assumed unless you enter a budget.
- Radar drafts are for you to review and post manually. Nothing is ever posted or sent automatically.

## Notes and limits

- **Database:** SQLite for zero-setup. `@db.Text` from the original schema is omitted because SQLite doesn't support native types; to move to Postgres/MySQL change the provider and add `@db.Text` back to the long-text fields. The schema also has a few additions: `Business.country/niche/googleRating/reviewCount/googlePlaceId/instagramUrl/linkedinUrl/opportunityFlags/lastContactedAt/locality/source/auditJson`, `SocialIntentLead.classifiedBy/confidence`, and a `Service` table for the catalogue.
- **TinyFish search:** it has no domain filter and returns ~10 results per query with short snippets and no post date, so the radar scopes with `site:` operators, post-filters by domain, and takes X/LinkedIn dates from post IDs. Tavily returns longer content and dates, so classification is somewhat better with it.
- **Radar coverage:** it can only return what the search API has indexed, so it will miss posts that are very new or not indexed. X and LinkedIn dates are decoded from post IDs; Reddit results without a date are kept and shown as "date unknown".
- **Directory:** the OpenStreetMap import only stores what OSM contains (often no phone/email, and no reviews). Coverage varies by country. Verify before outreach. Market centres/radii in `lib/hubs.ts` are approximate; niche tags are in `lib/niches.ts`. "No website" means none is listed in the source, so confirm before pitching.
- **Not built:** Instagram handle lookup and Google Business Profile "claimed" status cannot be read from public APIs. Instagram/LinkedIn links are stored when OSM lists them or when a website audit finds them.
- **Pricing:** `data/pricing.json` holds your asking prices and market multipliers; the planner never presents them as market data.
- **SSRF protection:** the audit fetcher blocks private, loopback and link-local addresses on every redirect hop.
- Don't expose this app publicly without authentication — it has no login and stores prospect data.
