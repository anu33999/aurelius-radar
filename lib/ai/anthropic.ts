import Anthropic from "@anthropic-ai/sdk";

export function aiEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export function extractJson<T>(text: string): T {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : trimmed;
  const start = candidate.search(/[[{]/);
  if (start === -1) throw new Error("Model returned no JSON");
  const open = candidate[start];
  const close = open === "{" ? "}" : "]";
  const end = candidate.lastIndexOf(close);
  if (end <= start) throw new Error("Model returned incomplete JSON");
  return JSON.parse(candidate.slice(start, end + 1)) as T;
}

export async function askJson<T>(system: string, user: string, maxTokens = 4000): Promise<T> {
  const res = await getClient().messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  const text = res.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("\n");
  return extractJson<T>(text);
}
