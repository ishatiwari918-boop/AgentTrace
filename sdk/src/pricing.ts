export interface Price {
  inPerM: number;
  outPerM: number;
}

export type PriceTable = Record<string, Price>;

// USD per 1 million tokens. Verify against your provider's pricing page.
export const DEFAULT_PRICES: PriceTable = {
  "llama-3.3-70b-versatile": { inPerM: 0.59, outPerM: 0.79 },
  "llama-3.1-8b-instant": { inPerM: 0.05, outPerM: 0.08 },
};

function findPrice(model: string, table: PriceTable): Price | undefined {
  if (table[model]) return table[model];
  const keys = Object.keys(table)
    .filter((k) => model.startsWith(k))
    .sort((a, b) => b.length - a.length);
  return keys.length > 0 ? table[keys[0]] : undefined;
}

export function estimateCost(
  model: string,
  tokensIn: number,
  tokensOut: number,
  table: PriceTable
): number | null {
  const price = findPrice(model, table);
  if (!price) return null;
  const cost = (tokensIn * price.inPerM + tokensOut * price.outPerM) / 1_000_000;
  return Math.round(cost * 1e6) / 1e6;
}

const toInt = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? Math.round(v) : undefined;

export function extractUsage(result: unknown): {
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
} {
  const r = result as Record<string, any> | null;
  if (!r || typeof r !== "object") return {};
  const usage = r.usage ?? {};
  return {
    model: typeof r.model === "string" ? r.model : undefined,
    tokensIn: toInt(usage.prompt_tokens ?? usage.input_tokens),
    tokensOut: toInt(usage.completion_tokens ?? usage.output_tokens),
  };
}

export function extractText(result: unknown): string | undefined {
  const r = result as Record<string, any> | null;
  if (!r || typeof r !== "object") return undefined;
  const openai = r.choices?.[0]?.message?.content;
  if (typeof openai === "string") return openai;
  const anthropic = r.content?.[0]?.text;
  if (typeof anthropic === "string") return anthropic;
  return undefined;
}