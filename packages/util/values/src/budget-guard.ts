/**
 * Pure helpers for model cost and resource budgeting.
 *
 * A budget pairs caller-supplied limits with the usage observed so far. Prices
 * are never hardcoded here: callers convert tokens to cost and pass that cost
 * to {@link recordUsage}. Every helper is deterministic, stateless, returns a
 * new value instead of mutating its input, performs no I/O, and imports
 * nothing.
 *
 * @module @deepseek-ai/dsh-util-values/budget-guard
 */

/** Limits a budget enforces; an omitted limit is unconstrained. */
export interface BudgetLimits {
  /** Maximum `usage.tokens` allowed; a limit is exhausted once usage reaches it. */
  readonly maxTokens?: number
  /** Maximum `usage.requests` allowed; a limit is exhausted once usage reaches it. */
  readonly maxRequests?: number
  /** Maximum `usage.costUsd` allowed; a limit is exhausted once usage reaches it. */
  readonly maxCostUsd?: number
}

/** Resources consumed so far, in the units the matching limit is measured in. */
export interface BudgetUsage {
  /** Tokens consumed. */
  readonly tokens: number
  /** Requests issued. */
  readonly requests: number
  /** Cost consumed in US dollars. */
  readonly costUsd: number
}

/** The decision for one limits and usage pair. */
export interface BudgetStatus {
  /** `true` when no limit is met or exceeded. */
  readonly allowed: boolean
  /** Exhausted limit names in `tokens`, `requests`, `cost` order; empty when allowed. */
  readonly exhausted: readonly ('tokens' | 'requests' | 'cost')[]
  /** Usage the status was computed from. */
  readonly usage: BudgetUsage
  /** Limits the status was computed against. */
  readonly limits: BudgetLimits
}

/**
 * Create a usage record with every counter at zero.
 * @returns a new usage record.
 */
export function createUsage(): BudgetUsage {
  return { tokens: 0, requests: 0, costUsd: 0 }
}

/**
 * Decide whether usage is within limits and report every exhausted limit.
 *
 * A limit is exhausted when its usage is greater than or equal to the limit, so
 * usage exactly at a limit already reports `allowed: false`. Omitted limits are
 * unconstrained and never reported.
 *
 * @param limits - limits to check against.
 * @param usage - usage to check.
 * @returns the decision, the checked limits and usage, and the exhausted limit
 * names in `tokens`, `requests`, `cost` order.
 */
export function checkBudget(limits: BudgetLimits, usage: BudgetUsage): BudgetStatus {
  const exhausted: ('tokens' | 'requests' | 'cost')[] = []
  if (limits.maxTokens !== undefined && usage.tokens >= limits.maxTokens) exhausted.push('tokens')
  if (limits.maxRequests !== undefined && usage.requests >= limits.maxRequests) exhausted.push('requests')
  if (limits.maxCostUsd !== undefined && usage.costUsd >= limits.maxCostUsd) exhausted.push('cost')
  return { allowed: exhausted.length === 0, exhausted, usage, limits }
}

/**
 * Add consumed resources to a usage record.
 *
 * Each provided delta is added; an omitted delta leaves its counter unchanged.
 *
 * @param usage - usage to extend; the input is not modified.
 * @param delta - non-negative amounts to add.
 * @returns a new usage record with the provided deltas applied.
 * @throws Error when any provided delta is negative.
 */
export function recordUsage(
  usage: BudgetUsage,
  delta: { tokens?: number; requests?: number; costUsd?: number },
): BudgetUsage {
  const { tokens, requests, costUsd } = delta
  if (tokens !== undefined && tokens < 0) {
    throw new Error(`budget delta tokens must be non-negative: ${tokens}`)
  }
  if (requests !== undefined && requests < 0) {
    throw new Error(`budget delta requests must be non-negative: ${requests}`)
  }
  if (costUsd !== undefined && costUsd < 0) {
    throw new Error(`budget delta costUsd must be non-negative: ${costUsd}`)
  }
  return {
    tokens: usage.tokens + (tokens ?? 0),
    requests: usage.requests + (requests ?? 0),
    costUsd: usage.costUsd + (costUsd ?? 0),
  }
}

/**
 * Format a status as one deterministic line for logs and diagnostics.
 *
 * An allowed status formats as
 * `within budget (tokens <used>/<limit>, requests <used>/<limit>, cost $<used>/<limit>)`.
 * An exhausted status replaces the prefix with `exhausted: <names>`, listing
 * the exhausted limit names in `tokens`, `requests`, `cost` order. An unset
 * limit renders as `-`, and both cost amounts always carry exactly two
 * decimals.
 *
 * @param status - status to format.
 * @returns the formatted line.
 */
export function formatBudgetStatus(status: BudgetStatus): string {
  const tokenLimit = status.limits.maxTokens === undefined ? '-' : String(status.limits.maxTokens)
  const requestLimit = status.limits.maxRequests === undefined ? '-' : String(status.limits.maxRequests)
  const costLimit = status.limits.maxCostUsd === undefined ? '-' : `$${status.limits.maxCostUsd.toFixed(2)}`
  const summary = `tokens ${status.usage.tokens}/${tokenLimit}, requests ${status.usage.requests}/${requestLimit}, cost $${status.usage.costUsd.toFixed(2)}/${costLimit}`
  if (status.allowed) return `within budget (${summary})`
  return `exhausted: ${status.exhausted.join(', ')} (${summary})`
}
