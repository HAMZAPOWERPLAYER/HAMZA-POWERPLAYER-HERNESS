import { describe, expect, it } from 'vitest'
import {
  createTokenBucket,
  isExhausted,
  refill,
  retryAfterMs,
  tryConsume,
  type TokenBucket,
} from '../src/rate-limit.ts'

describe('createTokenBucket', () => {
  it('starts full at the requested capacity', () => {
    expect(createTokenBucket(5, 2)).toEqual({ capacity: 5, tokens: 5, refillPerSecond: 2 })
  })
  it('allows an empty bucket that never refills', () => {
    expect(createTokenBucket(0, 0)).toEqual({ capacity: 0, tokens: 0, refillPerSecond: 0 })
  })
  it('throws on negative capacity', () => {
    expect(() => createTokenBucket(-1, 1)).toThrow(/token bucket capacity must be non-negative/)
  })
  it('throws on negative refill rate', () => {
    expect(() => createTokenBucket(5, -0.5)).toThrow(/token bucket refill rate must be finite and non-negative/)
  })
  it('throws on non-finite refill rate', () => {
    for (const rate of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => createTokenBucket(5, rate)).toThrow(/token bucket refill rate must be finite and non-negative/)
    }
  })
})

describe('refill', () => {
  it('adds tokens proportional to the elapsed time', () => {
    expect(refill({ capacity: 10, tokens: 0, refillPerSecond: 2 }, 1500))
      .toEqual({ capacity: 10, tokens: 3, refillPerSecond: 2 })
  })
  it('handles elapsed time below one second', () => {
    expect(refill({ capacity: 10, tokens: 0, refillPerSecond: 2 }, 500))
      .toEqual({ capacity: 10, tokens: 1, refillPerSecond: 2 })
  })
  it('clamps at capacity', () => {
    expect(refill({ capacity: 5, tokens: 4, refillPerSecond: 1 }, 10_000))
      .toEqual({ capacity: 5, tokens: 5, refillPerSecond: 1 })
  })
  it('keeps the bucket unchanged when no time elapsed', () => {
    expect(refill({ capacity: 5, tokens: 2, refillPerSecond: 1 }, 0))
      .toEqual({ capacity: 5, tokens: 2, refillPerSecond: 1 })
  })
  it('does not mutate the input bucket', () => {
    const before: TokenBucket = { capacity: 5, tokens: 2, refillPerSecond: 1 }
    refill(before, 1000)
    expect(before).toEqual({ capacity: 5, tokens: 2, refillPerSecond: 1 })
  })
  it('throws on negative elapsed time', () => {
    expect(() => refill({ capacity: 5, tokens: 2, refillPerSecond: 1 }, -1))
      .toThrow(/token bucket elapsed time must be non-negative/)
  })
})

describe('tryConsume', () => {
  it('consumes one token by default', () => {
    expect(tryConsume({ capacity: 5, tokens: 2, refillPerSecond: 1 }))
      .toEqual({ allowed: true, bucket: { capacity: 5, tokens: 1, refillPerSecond: 1 } })
  })
  it('consumes exactly the available tokens', () => {
    expect(tryConsume({ capacity: 5, tokens: 2, refillPerSecond: 1 }, 2))
      .toEqual({ allowed: true, bucket: { capacity: 5, tokens: 0, refillPerSecond: 1 } })
  })
  it('consumes a custom amount', () => {
    expect(tryConsume({ capacity: 5, tokens: 3, refillPerSecond: 1 }, 2).bucket)
      .toEqual({ capacity: 5, tokens: 1, refillPerSecond: 1 })
  })
  it('denies when fewer tokens are available than requested', () => {
    const denied = tryConsume({ capacity: 5, tokens: 1, refillPerSecond: 1 }, 2)
    expect(denied.allowed).toBe(false)
    expect(denied.bucket).toEqual({ capacity: 5, tokens: 1, refillPerSecond: 1 })
  })
  it('denies from an exhausted bucket and returns it unchanged', () => {
    const exhausted: TokenBucket = { capacity: 5, tokens: 0, refillPerSecond: 1 }
    const denied = tryConsume(exhausted)
    expect(denied.allowed).toBe(false)
    expect(denied.bucket).toBe(exhausted)
  })
})

describe('isExhausted', () => {
  it('is false while tokens remain', () => {
    expect(isExhausted({ capacity: 5, tokens: 1, refillPerSecond: 1 })).toBe(false)
  })
  it('is true when tokens reach zero', () => {
    expect(isExhausted({ capacity: 5, tokens: 0, refillPerSecond: 1 })).toBe(true)
    expect(isExhausted(createTokenBucket(0, 0))).toBe(true)
  })
  it('is true when tokens are negative', () => {
    expect(isExhausted({ capacity: 5, tokens: -0.5, refillPerSecond: 1 })).toBe(true)
  })
})

describe('retryAfterMs', () => {
  it('is zero when the bucket already holds the amount', () => {
    expect(retryAfterMs({ capacity: 5, tokens: 3, refillPerSecond: 2 })).toBe(0)
    expect(retryAfterMs({ capacity: 5, tokens: 2, refillPerSecond: 1 }, 2)).toBe(0)
  })
  it('covers one missing token at the refill rate', () => {
    expect(retryAfterMs({ capacity: 5, tokens: 0, refillPerSecond: 2 })).toBe(500)
  })
  it('covers a multi-token shortfall at the refill rate', () => {
    expect(retryAfterMs({ capacity: 5, tokens: 1, refillPerSecond: 4 }, 3)).toBe(500)
  })
  it('is zero when nothing is needed, even without refill', () => {
    expect(retryAfterMs({ capacity: 5, tokens: 0, refillPerSecond: 0 }, 0)).toBe(0)
  })
  it('throws when a non-positive refill rate cannot cover the shortfall', () => {
    expect(() => retryAfterMs({ capacity: 5, tokens: 0, refillPerSecond: 0 }, 1))
      .toThrow(/token bucket cannot cover a 1-token shortfall at refill rate 0/)
  })
  it('agrees with refill: waiting the returned time makes the amount consumable', () => {
    const drained = tryConsume(createTokenBucket(4, 2), 4).bucket
    const wait = retryAfterMs(drained, 3)
    expect(wait).toBe(1500)
    expect(tryConsume(refill(drained, wait), 3).allowed).toBe(true)
  })
})
