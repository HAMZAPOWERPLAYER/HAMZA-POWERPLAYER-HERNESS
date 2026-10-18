/**
 * Execution budget model for agent loops.
 *
 * Represents configurable limits on tool calls, retries, elapsed time, context
 * size, concurrent operations, and provider usage. Budgets are enforced by
 * application code; the model never assumes a model will obey them. This module
 * performs no I/O and holds no state.
 *
 * @module @deepseek-ai/dsh-util-values/execution-budget
 */

/** A single budget dimension. */
export interface BudgetLimit {
  /** Human-readable name of the dimension. */
  readonly name: string;
  /** Maximum allowed value. */
  readonly limit: number;
  /** Current consumed value. */
  readonly consumed: number;
}

/** A complete execution budget. */
export interface ExecutionBudget {
  /** Maximum tool calls allowed. */
  readonly maxToolCalls: number;
  /** Tool calls consumed so far. */
  readonly toolCallsConsumed: number;
  /** Maximum retry attempts allowed. */
  readonly maxRetries: number;
  /** Retry attempts consumed so far. */
  readonly retriesConsumed: number;
  /** Maximum elapsed time in milliseconds. */
  readonly maxElapsedMs: number;
  /** Elapsed time in milliseconds so far. */
  readonly elapsedMs: number;
  /** Maximum context size in tokens. */
  readonly maxContextTokens: number;
  /** Context tokens currently in use. */
  readonly contextTokens: number;
  /** Maximum concurrent operations. */
  readonly maxConcurrency: number;
  /** Concurrent operations currently running. */
  readonly concurrency: number;
}

/** Default budget with conservative limits. */
export const DEFAULT_EXECUTION_BUDGET: ExecutionBudget = {
  maxToolCalls: 50,
  toolCallsConsumed: 0,
  maxRetries: 5,
  retriesConsumed: 0,
  maxElapsedMs: 300000,
  elapsedMs: 0,
  maxContextTokens: 100000,
  contextTokens: 0,
  maxConcurrency: 4,
  concurrency: 0,
};

/**
 * Whether a budget has been exhausted on any dimension.
 * @param budget - budget to check.
 * @returns whether any dimension has reached or exceeded its limit.
 */
export function isBudgetExhausted(budget: ExecutionBudget): boolean {
  return (
    budget.toolCallsConsumed >= budget.maxToolCalls ||
    budget.retriesConsumed >= budget.maxRetries ||
    budget.elapsedMs >= budget.maxElapsedMs ||
    budget.contextTokens >= budget.maxContextTokens ||
    budget.concurrency >= budget.maxConcurrency
  );
}

/**
 * Which dimensions are exhausted.
 * @param budget - budget to check.
 * @returns the names of exhausted dimensions.
 */
export function exhaustedDimensions(budget: ExecutionBudget): readonly string[] {
  const result: string[] = [];
  if (budget.toolCallsConsumed >= budget.maxToolCalls) result.push('tool-calls');
  if (budget.retriesConsumed >= budget.maxRetries) result.push('retries');
  if (budget.elapsedMs >= budget.maxElapsedMs) result.push('elapsed-time');
  if (budget.contextTokens >= budget.maxContextTokens) result.push('context-tokens');
  if (budget.concurrency >= budget.maxConcurrency) result.push('concurrency');
  return result;
}

/**
 * Consume one tool call from a budget, returning a new budget.
 * @param budget - current budget.
 * @returns a new budget with one additional tool call consumed.
 */
export function consumeToolCall(budget: ExecutionBudget): ExecutionBudget {
  return { ...budget, toolCallsConsumed: budget.toolCallsConsumed + 1 };
}

/**
 * Consume one retry from a budget, returning a new budget.
 * @param budget - current budget.
 * @returns a new budget with one additional retry consumed.
 */
export function consumeRetry(budget: ExecutionBudget): ExecutionBudget {
  return { ...budget, retriesConsumed: budget.retriesConsumed + 1 };
}

/**
 * Update elapsed time in a budget, returning a new budget.
 * @param budget - current budget.
 * @param elapsedMs - new elapsed time in milliseconds.
 * @returns a new budget with updated elapsed time.
 */
export function updateElapsed(budget: ExecutionBudget, elapsedMs: number): ExecutionBudget {
  return { ...budget, elapsedMs };
}

/**
 * Update context tokens in a budget, returning a new budget.
 * @param budget - current budget.
 * @param contextTokens - new context token count.
 * @returns a new budget with updated context tokens.
 */
export function updateContextTokens(budget: ExecutionBudget, contextTokens: number): ExecutionBudget {
  return { ...budget, contextTokens };
}

/**
 * Enter a concurrent operation, returning a new budget.
 * @param budget - current budget.
 * @returns a new budget with concurrency incremented, or null when at the limit.
 */
export function enterConcurrency(budget: ExecutionBudget): ExecutionBudget | null {
  if (budget.concurrency >= budget.maxConcurrency) return null;
  return { ...budget, concurrency: budget.concurrency + 1 };
}

/**
 * Leave a concurrent operation, returning a new budget.
 * @param budget - current budget.
 * @returns a new budget with concurrency decremented (never below zero).
 */
export function leaveConcurrency(budget: ExecutionBudget): ExecutionBudget {
  return { ...budget, concurrency: Math.max(0, budget.concurrency - 1) };
}
