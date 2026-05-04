/**
 * Token + USD cost estimation for the audit. We use rough heuristics rather than
 * the SDK's `tokens.count()` endpoint because that would require a network call
 * per file just to decide whether to make the real call. The estimate is intentionally
 * conservative (rounded up).
 *
 * Char-to-token ratio: Anthropic's tokenizer averages ~3.5–4 characters per token
 * for English prose. We use 3.5 to round up.
 */

export const CHARS_PER_TOKEN = 3.5;

/** Max output tokens we ask the API for per audit call. */
export const MAX_OUTPUT_TOKENS = 4096;

/** USD per 1M tokens (input, output). Conservative current rates as of 2026-05. */
export const PRICING: Record<string, { inputUsdPerMTok: number; outputUsdPerMTok: number }> = {
  // Opus 4.x family — premium tier.
  'claude-opus-4-7': { inputUsdPerMTok: 15.0, outputUsdPerMTok: 75.0 },
  'claude-opus-4-6': { inputUsdPerMTok: 15.0, outputUsdPerMTok: 75.0 },
  'claude-opus-4-5': { inputUsdPerMTok: 15.0, outputUsdPerMTok: 75.0 },
  // Sonnet 4.x — mid tier.
  'claude-sonnet-4-6': { inputUsdPerMTok: 3.0, outputUsdPerMTok: 15.0 },
  'claude-sonnet-4-5': { inputUsdPerMTok: 3.0, outputUsdPerMTok: 15.0 },
  // Haiku 4.x — cheapest.
  'claude-haiku-4-5': { inputUsdPerMTok: 1.0, outputUsdPerMTok: 5.0 },
};

/** Fallback when we don't recognize the model — assume Opus pricing (worst case). */
const FALLBACK_PRICING = { inputUsdPerMTok: 15.0, outputUsdPerMTok: 75.0 };

export function estimateInputTokens(systemPromptChars: number, userPromptChars: number): number {
  return Math.ceil((systemPromptChars + userPromptChars) / CHARS_PER_TOKEN);
}

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const baseModel = stripModelSuffix(model);
  const rate = PRICING[baseModel] ?? FALLBACK_PRICING;
  const inputUsd = (inputTokens / 1_000_000) * rate.inputUsdPerMTok;
  const outputUsd = (outputTokens / 1_000_000) * rate.outputUsdPerMTok;
  return inputUsd + outputUsd;
}

function stripModelSuffix(model: string): string {
  // Strip date suffixes like "claude-opus-4-7-20260101" → "claude-opus-4-7".
  const m = model.match(/^(claude-(?:opus|sonnet|haiku)-\d+-\d+)/);
  return m ? m[1] : model;
}

/**
 * Track cumulative spend across an audit run. Refuses to exceed the budget.
 */
export class Budget {
  private spent = 0;

  constructor(public readonly capUsd: number) {}

  get remainingUsd(): number {
    return Math.max(0, this.capUsd - this.spent);
  }

  get spentUsd(): number {
    return this.spent;
  }

  /** Returns true if we can afford `cost`, false otherwise. Does NOT charge. */
  canAfford(cost: number): boolean {
    return this.spent + cost <= this.capUsd;
  }

  /** Charge `cost` against the budget. Allows overshoot; check canAfford first. */
  charge(cost: number): void {
    this.spent += cost;
  }
}
