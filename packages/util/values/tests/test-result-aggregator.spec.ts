import { describe, expect, it } from 'vitest'
import {
  aggregateTestRuns,
  formatAggregatedReport,
  worstRun,
} from '../src/test-result-aggregator.ts'

describe('aggregateTestRuns', () => {
  it('returns an empty-report shape for no runs', () => {
    const report = aggregateTestRuns([], 1)
    expect(report.runs).toBe(0)
    expect(report.totalTests).toBe(0)
    expect(report.passed).toBe(0)
    expect(report.failed).toBe(0)
    expect(report.skipped).toBe(0)
    expect(report.flakyRuns).toBe(0)
    expect(report.flakiness).toBe(0)
    expect(report.healthy).toBe(false)
  })

  it('aggregates a single all-passed run', () => {
    expect(aggregateTestRuns([{ name: 'a', outcomes: ['passed', 'passed'] }], 1)).toEqual({
      runs: 1,
      totalTests: 2,
      passed: 2,
      failed: 0,
      skipped: 0,
      flakyRuns: 0,
      flakiness: 0,
      healthy: true,
    })
  })

  it('aggregates a single all-failed run as unhealthy', () => {
    const report = aggregateTestRuns([{ name: 'a', outcomes: ['failed', 'failed'] }], 1)
    expect(report.failed).toBe(2)
    expect(report.healthy).toBe(false)
    expect(report.flakyRuns).toBe(0)
  })

  it('sums counts across multiple runs', () => {
    const report = aggregateTestRuns([
      { name: 'a', outcomes: ['passed', 'failed', 'skipped'] },
      { name: 'b', outcomes: ['passed', 'passed'] },
    ], 2)
    expect(report.runs).toBe(2)
    expect(report.totalTests).toBe(5)
    expect(report.passed).toBe(3)
    expect(report.failed).toBe(1)
    expect(report.skipped).toBe(1)
  })

  it('counts flaky runs', () => {
    const report = aggregateTestRuns([
      { name: 'a', outcomes: ['passed', 'failed'] },
      { name: 'b', outcomes: ['passed', 'passed'] },
    ], 2)
    expect(report.flakyRuns).toBe(1)
  })

  it('counts multiple flaky runs', () => {
    const report = aggregateTestRuns([
      { name: 'a', outcomes: ['passed', 'failed'] },
      { name: 'b', outcomes: ['failed', 'passed'] },
    ], 2)
    expect(report.flakyRuns).toBe(2)
  })

  it('takes the maximum flakiness across runs', () => {
    const report = aggregateTestRuns([
      { name: 'a', outcomes: ['passed', 'failed', 'failed', 'failed'] },
      { name: 'b', outcomes: ['passed', 'failed'] },
    ], 2)
    expect(report.flakiness).toBe(0.5)
  })

  it('reports zero flakiness when there are no runs', () => {
    expect(aggregateTestRuns([], 1).flakiness).toBe(0)
  })

  it('is unhealthy when any run fails', () => {
    const report = aggregateTestRuns([
      { name: 'a', outcomes: ['passed', 'passed'] },
      { name: 'b', outcomes: ['passed', 'failed'] },
    ], 2)
    expect(report.healthy).toBe(false)
  })

  it('is unhealthy when a run is flaky', () => {
    const report = aggregateTestRuns([
      { name: 'a', outcomes: ['passed', 'failed'] },
    ], 1)
    expect(report.flakyRuns).toBe(1)
    expect(report.healthy).toBe(false)
  })

  it('is healthy for a single stable run', () => {
    const report = aggregateTestRuns([{ name: 'a', outcomes: ['passed', 'passed', 'passed'] }], 1)
    expect(report.healthy).toBe(true)
  })

  it('respects minimumRuns when counting flaky runs', () => {
    const report = aggregateTestRuns([{ name: 'a', outcomes: ['passed', 'failed'] }], 3)
    expect(report.flakyRuns).toBe(0)
  })

  it('still reports flakiness even when below minimumRuns', () => {
    const report = aggregateTestRuns([{ name: 'a', outcomes: ['passed', 'failed'] }], 3)
    expect(report.flakiness).toBe(0.5)
  })

  it('throws when minimumRuns is zero', () => {
    expect(() => aggregateTestRuns([], 0)).toThrow('minimumRuns must be at least 1')
  })

  it('throws when minimumRuns is negative', () => {
    expect(() => aggregateTestRuns([], -1)).toThrow('minimumRuns must be at least 1')
  })

  it('throws when minimumRuns is not a finite integer', () => {
    for (const minimumRuns of [1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => aggregateTestRuns([], minimumRuns)).toThrow('minimumRuns must be at least 1')
    }
  })

  it('throws even with runs when minimumRuns is invalid', () => {
    expect(() => aggregateTestRuns([{ name: 'a', outcomes: ['passed'] }], 0)).toThrow('minimumRuns must be at least 1')
  })
})

describe('formatAggregatedReport', () => {
  it('formats a healthy report', () => {
    const report = aggregateTestRuns([{ name: 'a', outcomes: ['passed', 'passed'] }], 1)
    expect(formatAggregatedReport(report)).toBe('runs=1 tests=2 passed=2 failed=0 skipped=0 flakyRuns=0 flakiness=0.000 healthy=yes')
  })

  it('formats an unhealthy report', () => {
    const report = aggregateTestRuns([{ name: 'a', outcomes: ['passed', 'failed'] }], 1)
    expect(formatAggregatedReport(report)).toBe('runs=1 tests=2 passed=1 failed=1 skipped=0 flakyRuns=1 flakiness=0.500 healthy=no')
  })

  it('rounds flakiness to three decimals', () => {
    const report = aggregateTestRuns([{ name: 'a', outcomes: ['passed', 'failed', 'failed'] }], 1)
    expect(formatAggregatedReport(report)).toContain('flakiness=0.333')
  })

  it('renders healthy=no for empty input', () => {
    const report = aggregateTestRuns([], 1)
    expect(formatAggregatedReport(report)).toContain('healthy=no')
  })
})

describe('worstRun', () => {
  it('returns null for an empty list', () => {
    expect(worstRun([], 1)).toBeNull()
  })

  it('returns the only run for a single run', () => {
    const result = worstRun([{ name: 'a', outcomes: ['passed', 'failed'] }], 1)
    expect(result?.name).toBe('a')
  })

  it('selects the run with highest flakiness', () => {
    const result = worstRun([
      { name: 'low', outcomes: ['passed', 'passed', 'failed', 'failed', 'failed', 'failed', 'failed'] },
      { name: 'high', outcomes: ['passed', 'failed'] },
    ], 1)
    expect(result?.name).toBe('high')
  })

  it('breaks ties by input order', () => {
    const result = worstRun([
      { name: 'first', outcomes: ['passed', 'failed'] },
      { name: 'second', outcomes: ['failed', 'passed'] },
    ], 1)
    expect(result?.name).toBe('first')
  })

  it('returns a run with zero flakiness when all are stable', () => {
    const result = worstRun([{ name: 'a', outcomes: ['passed', 'passed'] }], 1)
    expect(result?.name).toBe('a')
  })

  it('throws when minimumRuns is invalid', () => {
    expect(() => worstRun([{ name: 'a', outcomes: ['passed'] }], 0)).toThrow('minimumRuns must be at least 1')
  })

  it('throws for non-finite minimumRuns', () => {
    expect(() => worstRun([], 1.5)).toThrow('minimumRuns must be at least 1')
  })
})
