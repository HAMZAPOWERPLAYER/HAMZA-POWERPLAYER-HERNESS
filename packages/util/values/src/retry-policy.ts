/**
 * Pure retry-policy helpers for deciding whether a failed operation should be
 * retried and how long to wait before the next attempt.
 *
 * All helpers are deterministic, hold no state, and perform no I/O. Callers own
 * the attempt counter and scheduling.
 *
 * @module @deepseek-ai/dsh-util-values/retry-policy
 */

/** The outcome of a retry decision. */
export type RetryDecision = 'retry' | 'stop'

/** Inputs describing a failed attempt. */
export interface RetryContext {
  /** 1-based index of the attempt that just failed. */
  readonly attempt: number
  /** Maximum number of attempts allowed. */
  readonly maxAttempts: number
  /** HTTP status code returned by the failed attempt, when applicable. */
  readonly statusCode?: number
  /** Human-readable error message for the failed attempt, when applicable. */
  readonly error?: string
}

/** HTTP status codes that are safe to retry. */
const RETRYABLE_STATUS_CODES: readonly number[] = [408, 429, 500, 502, 503, 504]

/**
 * Whether an HTTP status code is retryable.
 * @param code - HTTP status code.
 * @returns `true` for 408, 429, 500, 502, 503, and 504.
 */
export function isRetryableStatusCode(code: number): boolean {
  return RETRYABLE_STATUS_CODES.includes(code)
}

/**
 * Compute the backoff delay in milliseconds for a given attempt using
 * exponential growth: `baseMs * 2^(attempt - 1)`, capped at `maxMs`.
 *
 * Deterministic: no jitter is applied. `attempt` is 1-based.
 *
 * @param attempt - 1-based attempt index.
 * @param baseMs - base delay in milliseconds.
 * @param maxMs - maximum delay in milliseconds.
 * @returns the capped backoff delay in milliseconds.
 */
export function computeBackoffMs(attempt: number, baseMs: number, maxMs: number): number {
  const delay = baseMs * 2 ** (attempt - 1)
  return Math.min(delay, maxMs)
}

/**
 * Decide whether a failed attempt should be retried.
 *
 * Retries only when `attempt < maxAttempts` and either no status code is present
 * or the status code is retryable. Non-retryable 4xx status codes always stop.
 *
 * @param ctx - context describing the failed attempt.
 * @returns `'retry'` or `'stop'`.
 */
export function shouldRetry(ctx: RetryContext): RetryDecision {
  if (ctx.attempt >= ctx.maxAttempts) return 'stop'
  if (ctx.statusCode === undefined) return 'retry'
  if (!isRetryableStatusCode(ctx.statusCode)) return 'stop'
  return 'retry'
}

/**
 * Compute the delay to wait before the next attempt.
 *
 * Returns the backoff delay when {@link shouldRetry} says retry, otherwise 0.
 *
 * @param ctx - context describing the failed attempt.
 * @param baseMs - base delay in milliseconds.
 * @param maxMs - maximum delay in milliseconds.
 * @returns delay in milliseconds, or 0 when not retrying.
 */
export function retryDelayMs(ctx: RetryContext, baseMs: number, maxMs: number): number {
  if (shouldRetry(ctx) !== 'retry') return 0
  return computeBackoffMs(ctx.attempt, baseMs, maxMs)
}
