import { describe, expect, it } from 'vitest'
import {
  flakyVerdict,
  formatFlakinessReport,
  isFlaky,
  summarizeRuns,
  worstFlakiness,
} from '../src/flaky-test-detector.ts'

describe('summarizeRuns', () => {
  it('reports zero for an empty run list', () => {
    expect(summarizeRuns([])).toEqual({ runs: 0, passed: 0, failed: 0, skipped: 0, flakiness: 0 })
  })
  it('counts an all-passed history without flakiness', () => {
    expect(summarizeRuns(['passed', 'passed', 'passed']))
      .toEqual({ runs: 3, passed: 3, failed: 0, skipped: 0, flakiness: 0 })
  })
  it('counts an all-failed history as stable', () => {
    expect(summarizeRuns(['failed', 'failed']))
      .toEqual({ runs: 2, passed: 0, failed: 2, skipped: 0, flakiness: 0 })
  })
  it('scores one pass and one failure at 0.5', () => {
    expect(summarizeRuns(['passed', 'failed']).flakiness).toBe(0.5)
  })
  it('counts skipped runs in runs but not in passed or failed', () => {
    expect(summarizeRuns(['skipped', 'skipped']))
      .toEqual({ runs: 2, passed: 0, failed: 0, skipped: 2, flakiness: 0 })
  })
  it('ignores skipped runs when scoring a mixed history', () => {
    expect(summarizeRuns(['passed', 'skipped', 'failed', 'skipped']))
      .toEqual({ runs: 4, passed: 1, failed: 1, skipped: 2, flakiness: 0.5 })
  })
  it('rounds an uneven mix to three decimals', () => {
    expect(summarizeRuns(['passed', 'failed', 'failed']).flakiness).toBe(0.333)
  })
  it('rounds a repeating ratio to three decimals', () => {
    expect(summarizeRuns(['passed', 'failed', 'failed', 'failed', 'failed', 'failed', 'failed']).flakiness)
      .toBe(0.143)
  })
  it('rounds a repeating ratio up to three decimals', () => {
    expect(summarizeRuns(['passed', 'passed', 'failed', 'failed', 'failed', 'failed', 'failed']).flakiness)
      .toBe(0.286)
  })
  it('summarizes a rich mix with exact counts', () => {
    expect(summarizeRuns(['passed', 'passed', 'failed', 'skipped']))
      .toEqual({ runs: 4, passed: 2, failed: 1, skipped: 1, flakiness: 0.333 })
  })
  it('is independent of run order', () => {
    const forward = summarizeRuns(['passed', 'failed', 'failed', 'passed'])
    const reordered = summarizeRuns(['passed', 'passed', 'failed', 'failed'])
    expect(forward).toEqual(reordered)
    expect(forward.flakiness).toBe(0.5)
  })
})

describe('isFlaky', () => {
  it('is false below the minimum run count', () => {
    expect(isFlaky(summarizeRuns(['passed', 'failed']), 3)).toBe(false)
  })
  it('is true at the minimum run count', () => {
    expect(isFlaky(summarizeRuns(['passed', 'failed']), 2)).toBe(true)
  })
  it('is true above the minimum run count', () => {
    expect(isFlaky(summarizeRuns(['passed', 'failed']), 1)).toBe(true)
  })
  it('is false for a stable all-passed summary', () => {
    expect(isFlaky(summarizeRuns(['passed', 'passed', 'passed']), 1)).toBe(false)
  })
  it('is false for an all-failed summary', () => {
    expect(isFlaky(summarizeRuns(['failed', 'failed', 'failed']), 1)).toBe(false)
  })
  it('is false for a skipped-only summary', () => {
    expect(isFlaky(summarizeRuns(['skipped', 'skipped', 'skipped']), 1)).toBe(false)
  })
  it('throws when minimumRuns is zero', () => {
    expect(() => isFlaky(summarizeRuns(['passed', 'failed']), 0))
      .toThrow('minimumRuns must be at least 1')
  })
  it('throws when minimumRuns is negative', () => {
    expect(() => isFlaky(summarizeRuns(['passed', 'failed']), -2))
      .toThrow('minimumRuns must be at least 1')
  })
  it('throws when minimumRuns is not a finite integer', () => {
    for (const minimumRuns of [1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => isFlaky(summarizeRuns(['passed', 'failed']), minimumRuns))
        .toThrow('minimumRuns must be at least 1')
    }
  })
})

describe('flakyVerdict', () => {
  it('is insufficient-runs below the minimum run count', () => {
    expect(flakyVerdict(summarizeRuns(['passed', 'failed']), 5)).toBe('insufficient-runs')
  })
  it('is stable for a mixed-free history with enough runs', () => {
    expect(flakyVerdict(summarizeRuns(['passed', 'passed']), 2)).toBe('stable')
  })
  it('is flaky for a mixed history with enough runs', () => {
    expect(flakyVerdict(summarizeRuns(['passed', 'failed']), 2)).toBe('flaky')
  })
  it('is flaky when runs equal the minimum exactly', () => {
    expect(flakyVerdict(summarizeRuns(['failed', 'passed', 'passed']), 3)).toBe('flaky')
  })
  it('throws when minimumRuns is zero', () => {
    expect(() => flakyVerdict(summarizeRuns(['passed', 'failed']), 0))
      .toThrow('minimumRuns must be at least 1')
  })
})

describe('formatFlakinessReport', () => {
  it('formats a stable verdict', () => {
    expect(formatFlakinessReport(summarizeRuns(['passed', 'passed']), 1))
      .toBe('runs=2 passed=2 failed=0 skipped=0 flakiness=0 verdict=stable')
  })
  it('formats a flaky verdict with a rounded value', () => {
    expect(formatFlakinessReport(summarizeRuns(['passed', 'failed', 'failed']), 1))
      .toBe('runs=3 passed=1 failed=2 skipped=0 flakiness=0.333 verdict=flaky')
  })
  it('formats an insufficient-runs verdict', () => {
    expect(formatFlakinessReport(summarizeRuns(['passed', 'failed']), 5))
      .toBe('runs=2 passed=1 failed=1 skipped=0 flakiness=0.5 verdict=insufficient-runs')
  })
  it('formats a skipped-only history', () => {
    expect(formatFlakinessReport(summarizeRuns(['skipped', 'skipped', 'skipped']), 1))
      .toBe('runs=3 passed=0 failed=0 skipped=3 flakiness=0 verdict=stable')
  })
  it('renders a half without trailing zeros', () => {
    expect(formatFlakinessReport(summarizeRuns(['passed', 'failed', 'failed', 'passed']), 1))
      .toContain('flakiness=0.5')
  })
  it('throws when minimumRuns is zero', () => {
    expect(() => formatFlakinessReport(summarizeRuns(['passed']), 0))
      .toThrow('minimumRuns must be at least 1')
  })
})

describe('worstFlakiness', () => {
  it('is zero for an empty list', () => {
    expect(worstFlakiness([])).toBe(0)
  })
  it('is zero when no summary is flaky', () => {
    expect(worstFlakiness([
      summarizeRuns(['passed', 'passed']),
      summarizeRuns(['failed', 'failed', 'failed']),
      summarizeRuns(['skipped']),
    ])).toBe(0)
  })
  it('is the maximum flakiness in a multi-flaky list', () => {
    expect(worstFlakiness([
      summarizeRuns(['passed', 'failed', 'failed', 'failed']),
      summarizeRuns(['passed', 'failed']),
      summarizeRuns(['passed', 'passed', 'failed', 'failed', 'failed', 'failed', 'failed']),
    ])).toBe(0.5)
  })
})
