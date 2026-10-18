/**
 * Rough token estimates derived from text length.
 *
 * The helpers here divide text length by a fixed characters-per-token ratio
 * and add a fixed framing allowance per message. They are a heuristic, not a
 * tokenizer: every result approximates a model's token count and is never an
 * exact count, and the estimate ignores the model, provider, and content that
 * determine real tokenization.
 *
 * Every helper is pure, stateless, performs no I/O, and imports nothing.
 *
 * @module @deepseek-ai/dsh-util-values/token-estimate
 */

/** Characters per estimated token assumed by every estimate in this module. */
export const CHARS_PER_TOKEN_ESTIMATE = 4

/** A token count produced by the character heuristic, never an exact count. */
export interface TokenEstimate {
  /** Approximate number of tokens. */
  readonly tokens: number
  /** How `tokens` was produced; this module reports only `'heuristic'`. */
  readonly method: 'heuristic'
}

/** Fixed framing allowance added to every message by the message-list estimate. */
const MESSAGE_OVERHEAD_TOKENS = 4

/**
 * Roughly estimate the tokens in one string.
 *
 * A heuristic, not a tokenizer: it divides the string's length by
 * {@link CHARS_PER_TOKEN_ESTIMATE} and rounds up, so the result never claims
 * to be an exact token count. Length is measured in UTF-16 code units.
 *
 * @param text - text to estimate.
 * @returns the estimate; `0` tokens for the empty string.
 */
export function estimateTokens(text: string): TokenEstimate {
  return { tokens: Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE), method: 'heuristic' }
}

/**
 * Roughly estimate the tokens in a list of message texts.
 *
 * A heuristic, not a tokenizer: each message costs its own
 * {@link estimateTokens} estimate plus a fixed per-message allowance for role
 * and delimiter framing. The result is an approximation, not an exact count.
 *
 * @param messages - message texts to estimate.
 * @returns the estimate; `0` tokens for an empty list.
 */
export function estimateMessageTokens(messages: readonly string[]): TokenEstimate {
  let tokens = 0
  for (const message of messages) {
    tokens += estimateTokens(message).tokens + MESSAGE_OVERHEAD_TOKENS
  }
  return { tokens, method: 'heuristic' }
}

/**
 * Select the leading texts whose estimates fit within a token budget.
 *
 * Texts are considered in order and selection stops at the first text that
 * would push the cumulative {@link estimateTokens} total above `budgetTokens`;
 * later texts are not considered, even when they are smaller. Because the
 * totals are heuristic, the result does not guarantee that a real tokenizer
 * fits the same budget.
 *
 * @param texts - texts to select from, in order.
 * @param budgetTokens - maximum cumulative token estimate to allow.
 * @returns the selected texts, in their original order.
 */
export function estimateBatchWithinBudget(texts: readonly string[], budgetTokens: number): readonly string[] {
  const selected: string[] = []
  let cumulative = 0
  for (const text of texts) {
    const tokens = estimateTokens(text).tokens
    if (cumulative + tokens > budgetTokens) break
    selected.push(text)
    cumulative += tokens
  }
  return selected
}

/**
 * Render an estimate for display.
 *
 * @param estimate - estimate to render.
 * @returns the approximate count prefixed with `~` and labelled with its method, e.g. `~12 tokens (heuristic)`.
 */
export function formatTokenEstimate(estimate: TokenEstimate): string {
  return `~${estimate.tokens} tokens (${estimate.method})`
}
