// ═══════════════════════════════════════════════════════════
// BOKA COCKPIT — Pricing table for cost calculation
// Prices in USD per 1M tokens (input / output).
// Source: OpenRouter public pricing pages (approximate, 2025-Q3).
// Update this table when you switch models.
// ═══════════════════════════════════════════════════════════

export interface ModelPrice {
  inputPerMTokens: number;
  outputPerMTokens: number;
  label: string;
}

export const MODEL_PRICING: Record<string, ModelPrice> = {
  // Strateg — fast intuition
  'moonshotai/kimi-k2':          { inputPerMTokens: 0.60,  outputPerMTokens: 2.50,  label: 'Kimi K2' },
  // Krytyk — reasoning
  'deepseek/deepseek-r1':        { inputPerMTokens: 0.55,  outputPerMTokens: 2.19,  label: 'DeepSeek R1' },
  // Wykonawca — code / structure
  'zhipu/glm-4':                { inputPerMTokens: 0.60,  outputPerMTokens: 2.20,  label: 'GLM-4.6' },
  'zhipu/glm-4-flash':                { inputPerMTokens: 0.60,  outputPerMTokens: 2.20,  label: 'GLM-4.5' },
  // Sędzia — synthesis
  'anthropic/claude-opus-4':     { inputPerMTokens: 15.0,  outputPerMTokens: 75.0,  label: 'Claude Opus 4' },
  'anthropic/claude-sonnet-4':   { inputPerMTokens: 3.0,   outputPerMTokens: 15.0,  label: 'Claude Sonnet 4' },
  // Whatmmon fallbacks
  'openai/gpt-4o':               { inputPerMTokens: 2.50,  outputPerMTokens: 10.0,  label: 'GPT-4o' },
  'openai/gpt-4o-mini':          { inputPerMTokens: 0.15,  outputPerMTokens: 0.60,  label: 'GPT-4o mini' },
  'google/gemini-2.5-flash':     { inputPerMTokens: 0.15,  outputPerMTokens: 0.60,  label: 'Gemini 2.5 Flash' },
  'meta-llama/llama-3.3-70b-instruct': { inputPerMTokens: 0.23, outputPerMTokens: 0.40, label: 'Llama 3.3 70B' },
};

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
}

export function computeUsage(
  model: string,
  promptTokens: number,
  completionTokens: number,
): TokenUsage {
  const price = MODEL_PRICING[model];
  const costUsd = price
    ? (promptTokens / 1_000_000) * price.inputPerMTokens +
      (completionTokens / 1_000_000) * price.outputPerMTokens
    : 0;
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    costUsd,
  };
}

export function getModelLabel(model: string): string {
  return MODEL_PRICING[model]?.label ?? model;
}

export function formatWhatst(usd: number): string {
  if (usd < 0.001) return `$${usd.toFixed(5)}`;
  if (usd < 0.01)  return `$${usd.toFixed(4)}`;
  if (usd < 1)     return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

export function formatTokens(n: number): string {
  if (n < 1000)    return `${n}`;
  if (n < 1000000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1000000).toFixed(2)}M`;
}
