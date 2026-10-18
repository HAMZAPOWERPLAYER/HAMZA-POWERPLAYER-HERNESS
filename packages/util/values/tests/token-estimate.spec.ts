import { describe, expect, it } from 'vitest'
import {
  CHARS_PER_TOKEN_ESTIMATE,
  estimateBatchWithinBudget,
  estimateMessageTokens,
  estimateTokens,
  formatTokenEstimate,
} from '../src/token-estimate.ts'

describe('CHARS_PER_TOKEN_ESTIMATE', () => {
  it('is the divisor estimateTokens rounds up', () => {
    expect(CHARS_PER_TOKEN_ESTIMATE).toBe(4)
    expect(estimateTokens('a'.repeat(CHARS_PER_TOKEN_ESTIMATE)).tokens).toBe(1)
    expect(estimateTokens('a'.repeat(CHARS_PER_TOKEN_ESTIMATE + 1)).tokens).toBe(2)
  })
})

describe('estimateTokens', () => {
  it('empty text is zero', () => {
    expect(estimateTokens('')).toEqual({ tokens: 0, method: 'heuristic' })
  })
  it('exact multiples of the ratio need no rounding', () => {
    expect(estimateTokens('abcd')).toEqual({ tokens: 1, method: 'heuristic' })
    expect(estimateTokens('abcdefgh')).toEqual({ tokens: 2, method: 'heuristic' })
  })
  it('rounds partial tokens up', () => {
    expect(estimateTokens('a')).toEqual({ tokens: 1, method: 'heuristic' })
    expect(estimateTokens('abcde')).toEqual({ tokens: 2, method: 'heuristic' })
  })
  it('counts whitespace like any other character', () => {
    expect(estimateTokens('    ').tokens).toBe(1)
  })
})

describe('estimateMessageTokens', () => {
  it('empty list is zero', () => {
    expect(estimateMessageTokens([])).toEqual({ tokens: 0, method: 'heuristic' })
  })
  it('empty message costs the framing overhead only', () => {
    expect(estimateMessageTokens([''])).toEqual({ tokens: 4, method: 'heuristic' })
  })
  it('adds the overhead to every message', () => {
    expect(estimateMessageTokens(['abcd', 'abcdefgh'])).toEqual({ tokens: 11, method: 'heuristic' })
  })
  it('rounds each message up before adding overhead', () => {
    expect(estimateMessageTokens(['abcde'])).toEqual({ tokens: 6, method: 'heuristic' })
  })
})

describe('estimateBatchWithinBudget', () => {
  it('empty list', () => {
    expect(estimateBatchWithinBudget([], 10)).toEqual([])
  })
  it('includes texts while the cumulative estimate fits', () => {
    const texts = ['abcd', 'abcdefgh', 'abcdefghijkl']
    expect(estimateBatchWithinBudget(texts, 6)).toEqual(texts)
  })
  it('stops at the first text that overflows', () => {
    expect(estimateBatchWithinBudget(['abcd', 'abcdefgh', 'abcdefghijkl'], 4)).toEqual(['abcd', 'abcdefgh'])
  })
  it('does not skip an overflowing text to reach a smaller later one', () => {
    expect(estimateBatchWithinBudget(['abcdefghijkl', 'a'], 2)).toEqual([])
  })
  it('includes zero-cost texts when no room remains', () => {
    expect(estimateBatchWithinBudget(['', 'abcd'], 0)).toEqual([''])
  })
  it('negative budget admits nothing', () => {
    expect(estimateBatchWithinBudget(['', 'a'], -1)).toEqual([])
  })
})

describe('formatTokenEstimate', () => {
  it('formats zero', () => {
    expect(formatTokenEstimate({ tokens: 0, method: 'heuristic' })).toBe('~0 tokens (heuristic)')
  })
  it('prefixes the count with ~ and labels the method', () => {
    expect(formatTokenEstimate({ tokens: 12, method: 'heuristic' })).toBe('~12 tokens (heuristic)')
    expect(formatTokenEstimate(estimateTokens('abcd'))).toContain('heuristic')
  })
  it('formats a message estimate', () => {
    expect(formatTokenEstimate(estimateMessageTokens(['abcd']))).toBe('~5 tokens (heuristic)')
  })
})
