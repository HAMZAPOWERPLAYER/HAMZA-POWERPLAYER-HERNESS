import { describe, expect, it } from 'vitest'
import {
  computeBackoffMs,
  isRetryableStatusCode,
  retryDelayMs,
  shouldRetry,
} from '../src/retry-policy.ts'

describe('isRetryableStatusCode', () => {
  it('true for retryable codes', () => {
    for (const code of [408, 429, 500, 502, 503, 504]) {
      expect(isRetryableStatusCode(code)).toBe(true)
    }
  })
  it('false for non-retryable codes', () => {
    for (const code of [200, 400, 401, 403, 404, 410]) {
      expect(isRetryableStatusCode(code)).toBe(false)
    }
  })
})

describe('computeBackoffMs', () => {
  it('exponential growth', () => {
    expect(computeBackoffMs(1, 100, 10000)).toBe(100)
    expect(computeBackoffMs(2, 100, 10000)).toBe(200)
    expect(computeBackoffMs(3, 100, 10000)).toBe(400)
  })
  it('caps at maxMs', () => {
    expect(computeBackoffMs(10, 100, 1000)).toBe(1000)
  })
})

describe('shouldRetry', () => {
  it('retries when attempt < maxAttempts and no status', () => {
    expect(shouldRetry({ attempt: 1, maxAttempts: 3 })).toBe('retry')
  })
  it('retries for retryable status', () => {
    expect(shouldRetry({ attempt: 1, maxAttempts: 3, statusCode: 503 })).toBe('retry')
  })
  it('stops at maxAttempts', () => {
    expect(shouldRetry({ attempt: 3, maxAttempts: 3 })).toBe('stop')
  })
  it('stops for non-retryable 4xx', () => {
    expect(shouldRetry({ attempt: 1, maxAttempts: 3, statusCode: 404 })).toBe('stop')
    expect(shouldRetry({ attempt: 1, maxAttempts: 3, statusCode: 401 })).toBe('stop')
  })
  it('retries 429', () => {
    expect(shouldRetry({ attempt: 1, maxAttempts: 3, statusCode: 429 })).toBe('retry')
  })
})

describe('retryDelayMs', () => {
  it('returns backoff when retrying', () => {
    expect(retryDelayMs({ attempt: 2, maxAttempts: 3 }, 100, 10000)).toBe(200)
  })
  it('returns 0 when stopping', () => {
    expect(retryDelayMs({ attempt: 3, maxAttempts: 3 }, 100, 10000)).toBe(0)
    expect(retryDelayMs({ attempt: 1, maxAttempts: 3, statusCode: 404 }, 100, 10000)).toBe(0)
  })
})
