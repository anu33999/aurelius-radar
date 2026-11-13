export interface SearchHit {
  title: string;
  url: string;
  content: string;
  publishedDate: string | null;
}

export type TimeRange = "day" | "week" | "month";

export const tavilyConfigured = () => !!process.env.TAVILY_API_KEY;
export const tinyfishConfigured = () => !!process.env.TINYFISH_API_KEY;
export const braveConfigured = () => !!process.env.BRAVE_API_KEY;
export const searchConfigured = () => tavilyConfigured() || tinyfishConfigured() || braveConfigured();

export type SearchProviderName = "Tavily" | "TinyFish" | "Brave";

/** Priority: Tavily, then TinyFish, then Brave. */
export function activeSearchProvider(): SearchProviderName | null {
  if (tavilyConfigured()) return "Tavily";
  if (tinyfishConfigured()) return "TinyFish";
  if (braveConfigured()) return "Brave";
  return null;
}

async function tavilySearch(query: string, opts: { includeDomains?: string[]; timeRange?: TimeRange; maxResults?: number }): Promise<SearchHit[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.TAVILY_API_KEY}` },
    body: JSON.stringify({
      query,
      search_depth: "advanced",
      max_results: opts.maxResults ?? 10,
      include_domains: opts.includeDomains,
      time_range: opts.timeRange,
      include_answer: false,
      include_raw_content: false,
    }),
  });
  if (!res.ok) throw new Error(`Tavily ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { results?: { title?: string; url: string; content?: string; published_date?: string }[] };
  return (data.results ?? []).map((r) => ({
    title: r.title ?? "",
    url: r.url,
    content: r.content ?? "",
    publishedDate: r.published_date ?? null,
  }));
}

async function braveSearch(query: string, opts: { timeRange?: TimeRange; maxResults?: number }): Promise<SearchHit[]> {
  const fresh = opts.timeRange === "day" ? "pd" : opts.timeRange === "week" ? "pw" : opts.timeRange === "month" ? "pm" : "";
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${Math.min(opts.maxResults ?? 10, 20)}${fresh ? `&freshness=${fresh}` : ""}`;
  const res = await fetch(url, {
    headers: { accept: "application/json", "x-subscription-token": process.env.BRAVE_API_KEY as string },
  });
  if (!res.ok) throw new Error(`Brave ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { web?: { results?: { title?: string; url: string; description?: string; page_age?: string }[] } };
  return (data.web?.results ?? []).map((r) => ({
    title: (r.title ?? "").replace(/<[^>]+>/g, ""),
    url: r.url,
    content: (r.description ?? "").replace(/<[^>]+>/g, ""),
    publishedDate: r.page_age ?? null,
  }));
}

const TINYFISH_ENDPOINT = "https://api.search.tinyfish.ai";

/** TinyFish has no domain filter, so domain scoping is done with site: operators in the query. */
export function withSiteOperators(query: string, domains?: string[]): string {
  if (!domains || domains.length === 0 || /\bsite:/i.test(query)) return query;
  return `(${domains.map((d) => `site:${d}`).join(" OR ")}) ${query}`;
}

export function buildTinyfishUrl(query: string, opts: { includeDomains?: string[]; timeRange?: TimeRange }): string {
  const params = new URLSearchParams({ query: withSiteOperators(query, opts.includeDomains) });
  const minutes = opts.timeRange === "day" ? 1440 : opts.timeRange === "week" ? 10080 : opts.timeRange === "month" ? 43200 : 0;
  if (minutes) params.set("recency_minutes", String(minutes));
  return `${TINYFISH_ENDPOINT}?${params.toString()}`;
}

async function tinyfishSearch(query: string, opts: { includeDomains?: string[]; timeRange?: TimeRange }): Promise<SearchHit[]> {
  const res = await fetch(buildTinyfishUrl(query, opts), {
    headers: { "X-API-Key": process.env.TINYFISH_API_KEY as string, accept: "application/json" },
  });
  if (!res.ok) throw new Error(`TinyFish ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { results?: { title?: string; url?: string; snippet?: string; site_name?: string }[] };
  const domains = opts.includeDomains;
  return (data.results ?? [])
    .filter((r): r is { title?: string; url: string; snippet?: string } => typeof r.url === "string")
    .filter((r) => {
      if (!domains || domains.length === 0) return true;
      try {
        const host = new URL(r.url).hostname.replace(/^www\./, "");
        return domains.some((d) => host === d || host.endsWith(`.${d}`));
      } catch {
        return false;
      }
    })
    .map((r) => ({ title: r.title ?? "", url: r.url, content: r.snippet ?? "", publishedDate: null }));
}

/** Tavily, then TinyFish, then Brave. Throws if no provider is configured. */
export async function webSearch(
  query: string,
  opts: { includeDomains?: string[]; timeRange?: TimeRange; maxResults?: number } = {},
): Promise<SearchHit[]> {
  if (tavilyConfigured()) return tavilySearch(query, opts);
  if (tinyfishConfigured()) return tinyfishSearch(query, opts);
  if (braveConfigured()) return braveSearch(query, opts);
  throw new Error("No search provider configured. Set TINYFISH_API_KEY, TAVILY_API_KEY or BRAVE_API_KEY in .env.");
}

const NOT_OFFICIAL = /(^|\.)(zomato|swiggy|justdial|indiamart|sulekha|tripadvisor|linkedin|facebook|instagram|twitter|x|youtube|wikipedia|glassdoor|ambitionbox|crunchbase|yelp|magicpin|dineout|bing|google|quora|reddit|medium|pinterest|tiktok|naukri|indeed)\.(com|in|org|net|co\.in)$/i;

export async function resolveOfficialWebsite(name: string): Promise<string | null> {
  try {
    const hits = await webSearch(`${name} official website`, { maxResults: 8 });
    for (const h of hits) {
      try {
        const u = new URL(h.url);
        if (!NOT_OFFICIAL.test(u.hostname)) return u.origin;
      } catch {
        /* skip */
      }
    }
  } catch {
    /* provider failure -> caller handles null */
  }
  return null;
}
