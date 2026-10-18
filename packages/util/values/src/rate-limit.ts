/**
 * Pure token-bucket rate-limit helpers.
 *
 * A bucket is an immutable value: every helper returns a new bucket instead of
 * mutating its input, and elapsed time is passed in explicitly rather than
 * read from a clock. Callers own storage, clock reads, and scheduling. Every
 * helper is deterministic, stateless, performs no I/O, and imports nothing.
 *
 * @module @deepseek-ai/dsh-util-values/rate-limit
 */

/** A token bucket: its capacity, the tokens currently available, and its refill rate. */
export interface TokenBucket {
  /** Maximum number of tokens the bucket holds. */
  readonly capacity: number
  /** Tokens currently available. */
  readonly tokens: number
  /** Tokens added per second while refilling. */
  readonly refillPerSecond: number
}

/**
 * Create a bucket that starts full.
 * @param capacity - maximum tokens the bucket holds; must be non-negative.
 * @param refillPerSecond - tokens added per second; must be finite and non-negative.
 * @returns a new bucket holding `capacity` tokens.
 * @throws Error when `capacity` is negative or `refillPerSecond` is negative or not finite.
 */
export function createTokenBucket(capacity: number, refillPerSecond: number): TokenBucket {
  if (capacity < 0) throw new Error(`token bucket capacity must be non-negative: ${capacity}`)
  if (!Number.isFinite(refillPerSecond) || refillPerSecond < 0) {
    throw new Error(`token bucket refill rate must be finite and non-negative: ${refillPerSecond}`)
  }
  return { capacity, tokens: capacity, refillPerSecond }
}

/**
 * Refill a bucket for elapsed time without exceeding its capacity.
 * @param bucket - bucket to refill; the input bucket is not modified.
 * @param elapsedMs - milliseconds elapsed since `bucket` was current; must be non-negative.
 * @returns a new bucket holding `min(capacity, tokens + refillPerSecond * elapsedMs / 1000)` tokens.
 * @throws Error when `elapsedMs` is negative.
 */
export function refill(bucket: TokenBucket, elapsedMs: number): TokenBucket {
  if (elapsedMs < 0) throw new Error(`token bucket elapsed time must be non-negative: ${elapsedMs}`)
  return {
    capacity: bucket.capacity,
    tokens: Math.min(bucket.capacity, bucket.tokens + bucket.refillPerSecond * elapsedMs / 1000),
    refillPerSecond: bucket.refillPerSecond,
  }
}

/**
 * Consume tokens from a bucket that holds at least `amount` of them.
 * @param bucket - bucket to consume from; the input bucket is not modified.
 * @param amount - number of tokens to consume; defaults to 1.
 * @returns the decision and its resulting bucket: on success a new bucket
 * holding `amount` fewer tokens, otherwise `allowed: false` and the unchanged
 * bucket.
 */
export function tryConsume(bucket: TokenBucket, amount = 1): { allowed: boolean; bucket: TokenBucket } {
  if (bucket.tokens < amount) return { allowed: false, bucket }
  return {
    allowed: true,
    bucket: {
      capacity: bucket.capacity,
      tokens: bucket.tokens - amount,
      refillPerSecond: bucket.refillPerSecond,
    },
  }
}

/**
 * Whether a bucket has no tokens left to consume.
 * @param bucket - bucket to inspect.
 * @returns `true` when `tokens` is at or below zero.
 */
export function isExhausted(bucket: TokenBucket): boolean {
  return bucket.tokens <= 0
}

/**
 * Wait until a bucket holds `amount` tokens.
 * @param bucket - bucket to inspect.
 * @param amount - number of tokens needed; defaults to 1.
 * @returns `0` when the bucket already holds `amount` tokens, otherwise the
 * milliseconds needed for the refill rate to cover the shortfall.
 * @throws Error when a shortfall exists at a non-positive refill rate, which
 * would mean waiting forever.
 */
export function retryAfterMs(bucket: TokenBucket, amount = 1): number {
  if (bucket.tokens >= amount) return 0
  if (bucket.refillPerSecond <= 0) {
    throw new Error(`token bucket cannot cover a ${amount - bucket.tokens}-token shortfall at refill rate ${bucket.refillPerSecond}`)
  }
  return (amount - bucket.tokens) / bucket.refillPerSecond * 1000
}
