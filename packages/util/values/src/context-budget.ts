/**
 * Pure helpers for reasoning about a token budget.
 *
 * These functions are stateless and perform no I/O: they describe how many
 * tokens remain, whether a value fits, and how to split or trim token counts
 * against a limit. They hold no mutable state.
 *
 * @module @deepseek-ai/dsh-util-values/context-budget
 */

/** A token budget with a maximum and the amount already consumed. */
export interface ContextBudget {
  /** Maximum number of tokens available. */
  readonly maxTokens: number
  /** Number of tokens already consumed. */
  readonly usedTokens: number
}

/**
 * Tokens still available, never negative.
 * @param budget - budget to inspect.
 * @returns `max(0, maxTokens - usedTokens)`.
 */
export function remainingTokens(budget: ContextBudget): number {
  return Math.max(0, budget.maxTokens - budget.usedTokens)
}

/**
 * Whether the budget has been exceeded.
 * @param budget - budget to inspect.
 * @returns `true` when `usedTokens` is greater than `maxTokens`.
 */
export function isOverBudget(budget: ContextBudget): boolean {
  return budget.usedTokens > budget.maxTokens
}

/**
 * Whether `additional` tokens still fit within the budget.
 * @param budget - budget to inspect.
 * @param additional - tokens to add.
 * @returns `true` when `usedTokens + additional <= maxTokens`.
 */
export function fitsInBudget(budget: ContextBudget, additional: number): boolean {
  return budget.usedTokens + additional <= budget.maxTokens
}

/**
 * Utilization as a percentage.
 * @param budget - budget to inspect.
 * @returns `usedTokens / maxTokens * 100`, or `0` when `maxTokens <= 0`. May exceed 100 when over budget.
 */
export function utilizationPercent(budget: ContextBudget): number {
  if (budget.maxTokens <= 0) return 0
  return (budget.usedTokens / budget.maxTokens) * 100
}

/**
 * Greedily select leading items whose cumulative sum stays within `maxTokens`.
 *
 * Items are considered in order; an item is included when adding it keeps the
 * running total at or below `maxTokens`, and selection stops at the first item
 * that would exceed the remaining room.
 *
 * @param items - token counts to select from.
 * @param maxTokens - maximum cumulative total to allow.
 * @returns the selected token counts, in their original order.
 */
export function trimToBudget(items: readonly number[], maxTokens: number): readonly number[] {
  const selected: number[] = []
  let cumulative = 0
  for (const item of items) {
    if (cumulative + item <= maxTokens) {
      selected.push(item)
      cumulative += item
    } else {
      break
    }
  }
  return selected
}

/**
 * Distribute `total` among `weights` proportionally, as integers.
 *
 * Each entry except the last receives `floor(total * weight / sumWeights)`; the
 * last receives the remainder so the result sums to `total`. When the weights
 * sum to zero, every entry is zero.
 *
 * @param total - total amount to distribute.
 * @param weights - proportional weights.
 * @returns integer allocations with the same length as `weights`.
 */
export function allocateBudget(total: number, weights: readonly number[]): readonly number[] {
  const sumWeights = weights.reduce((sum, weight) => sum + weight, 0)
  if (sumWeights === 0) return weights.map(() => 0)
  const allocations: number[] = []
  let allocated = 0
  for (let index = 0; index < weights.length - 1; index++) {
    const weight = weights[index] as number
    const share = Math.floor((total * weight) / sumWeights)
    allocations.push(share)
    allocated += share
  }
  if (weights.length > 0) {
    allocations.push(total - allocated)
  }
  return allocations
}
