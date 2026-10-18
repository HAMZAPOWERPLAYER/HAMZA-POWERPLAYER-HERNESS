import { describe, expect, it } from 'vitest'
import {
  compareSummaries,
  formatSampleSummary,
  summarizeRounds,
  summarizeSamples,
  validateProtocol,
  type ComparisonVerdict,
} from '../src/benchmark-protocol.ts'

/**
 * Compare two single-sample runs by their medians.
 *
 * @param beforeMedianMs - median of the baseline run.
 * @param afterMedianMs - median of the run compared against the baseline.
 * @param minimumRelativeChange - relative noise threshold within (0, 1].
 * @returns the verdict for the pair.
 */
function verdict(beforeMedianMs: number, afterMedianMs: number, minimumRelativeChange: number): ComparisonVerdict {
  return compareSummaries(summarizeSamples([beforeMedianMs]), summarizeSamples([afterMedianMs]), minimumRelativeChange)
}

describe('validateProtocol', () => {
  it('accepts the minimal protocol', () => {
    expect(validateProtocol({ warmupRounds: 0, measuredRounds: 1 })).toEqual([])
  })

  it('accepts equal warm-up and measured rounds', () => {
    expect(validateProtocol({ warmupRounds: 2, measuredRounds: 2 })).toEqual([])
  })

  it('accepts warm-up rounds below the measured rounds', () => {
    expect(validateProtocol({ warmupRounds: 5, measuredRounds: 6 })).toEqual([])
  })

  it('reports measuredRounds below 1', () => {
    expect(validateProtocol({ warmupRounds: 0, measuredRounds: 0 }))
      .toEqual(['measuredRounds must be at least 1'])
  })

  it('reports a measuredRounds that is not a finite integer', () => {
    for (const measuredRounds of [0.5, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(validateProtocol({ warmupRounds: 0, measuredRounds }))
        .toEqual(['measuredRounds must be at least 1'])
    }
  })

  it('reports a negative warmupRounds', () => {
    expect(validateProtocol({ warmupRounds: -1, measuredRounds: 2 }))
      .toEqual(['warmupRounds must be a non-negative integer'])
  })

  it('reports a warmupRounds that is not a finite integer', () => {
    for (const warmupRounds of [1.5, 3.5, Number.NaN]) {
      expect(validateProtocol({ warmupRounds, measuredRounds: 4 }))
        .toEqual(['warmupRounds must be a non-negative integer'])
    }
  })

  it('reports warm-up rounds above the measured rounds', () => {
    expect(validateProtocol({ warmupRounds: 3, measuredRounds: 2 }))
      .toEqual(['measuredRounds must be at least warmupRounds'])
  })

  it('reports the measuredRounds problem before the round-count problem', () => {
    expect(validateProtocol({ warmupRounds: 5, measuredRounds: 0 }))
      .toEqual(['measuredRounds must be at least 1', 'measuredRounds must be at least warmupRounds'])
  })

  it('reports every problem in the documented order', () => {
    expect(validateProtocol({ warmupRounds: 2.5, measuredRounds: 0.5 })).toEqual([
      'measuredRounds must be at least 1',
      'warmupRounds must be a non-negative integer',
      'measuredRounds must be at least warmupRounds',
    ])
  })
})

describe('summarizeSamples', () => {
  it('throws on an empty sample list', () => {
    expect(() => summarizeSamples([])).toThrow('samples must not be empty')
  })

  it('throws on a negative sample', () => {
    expect(() => summarizeSamples([1, -0.001])).toThrow('samples must be finite and non-negative')
  })

  it('throws on NaN and infinite samples', () => {
    for (const sample of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => summarizeSamples([1, sample])).toThrow('samples must be finite and non-negative')
    }
  })

  it('summarizes a single sample with zero standard deviation', () => {
    expect(summarizeSamples([7])).toEqual({
      count: 1,
      minMs: 7,
      maxMs: 7,
      medianMs: 7,
      meanMs: 7,
      standardDeviationMs: 0,
    })
  })

  it('finds the median of an unsorted odd list without reordering it', () => {
    const samples = [3, 1, 2]
    expect(summarizeSamples(samples)).toEqual({
      count: 3,
      minMs: 1,
      maxMs: 3,
      medianMs: 2,
      meanMs: 2,
      standardDeviationMs: 1,
    })
    expect(samples).toEqual([3, 1, 2])
  })

  it('averages the two middle samples for an even count', () => {
    const summary = summarizeSamples([4, 1, 3, 2])
    expect(summary.count).toBe(4)
    expect(summary.minMs).toBe(1)
    expect(summary.maxMs).toBe(4)
    expect(summary.medianMs).toBe(2.5)
    expect(summary.meanMs).toBe(2.5)
  })

  it('divides squared deviations by n - 1', () => {
    expect(summarizeSamples([1, 1, 1, 5]).standardDeviationMs).toBe(2)
  })

  it('computes mean and standard deviation against hand-computed values', () => {
    expect(summarizeSamples([0, 2, 4])).toEqual({
      count: 3,
      minMs: 0,
      maxMs: 4,
      medianMs: 2,
      meanMs: 2,
      standardDeviationMs: 2,
    })
  })

  it('leaves the caller array untouched', () => {
    const samples = [5, 1, 3]
    const summary = summarizeSamples(samples)
    expect(summary.medianMs).toBe(3)
    expect(samples).toEqual([5, 1, 3])
  })
})

describe('summarizeRounds', () => {
  it('returns the summary for a valid protocol', () => {
    expect(summarizeRounds({ warmupRounds: 0, measuredRounds: 3 }, [2, 4, 6])).toEqual({
      count: 3,
      minMs: 2,
      maxMs: 6,
      medianMs: 4,
      meanMs: 4,
      standardDeviationMs: 2,
    })
  })

  it('summarizes extra samples beyond the measured rounds', () => {
    expect(summarizeRounds({ warmupRounds: 0, measuredRounds: 2 }, [1, 2, 3])).toEqual({
      count: 3,
      minMs: 1,
      maxMs: 3,
      medianMs: 2,
      meanMs: 2,
      standardDeviationMs: 1,
    })
  })

  it('throws the first protocol problem', () => {
    expect(() => summarizeRounds({ warmupRounds: -1, measuredRounds: 0 }, []))
      .toThrow('protocol is not valid: measuredRounds must be at least 1')
  })

  it('checks the protocol before the sample count', () => {
    expect(() => summarizeRounds({ warmupRounds: 1.5, measuredRounds: 3 }, []))
      .toThrow('protocol is not valid: warmupRounds must be a non-negative integer')
  })

  it('throws when fewer samples than measured rounds are supplied', () => {
    expect(() => summarizeRounds({ warmupRounds: 0, measuredRounds: 3 }, [1, 2]))
      .toThrow('expected 3 measured rounds, received 2')
  })
})

describe('compareSummaries', () => {
  it('accepts a decrease exactly at the threshold as improved', () => {
    expect(verdict(100, 90, 0.1)).toBe('improved')
  })

  it('accepts a decrease beyond the threshold as improved', () => {
    expect(verdict(100, 80, 0.1)).toBe('improved')
  })

  it('treats a smaller decrease as within-noise', () => {
    expect(verdict(100, 95, 0.1)).toBe('within-noise')
  })

  it('accepts an increase exactly at the threshold as regressed', () => {
    expect(verdict(100, 110, 0.1)).toBe('regressed')
  })

  it('accepts an increase beyond the threshold as regressed', () => {
    expect(verdict(100, 120, 0.1)).toBe('regressed')
  })

  it('treats a smaller increase as within-noise', () => {
    expect(verdict(100, 105, 0.1)).toBe('within-noise')
  })

  it('treats an unchanged median as within-noise below any threshold', () => {
    expect(verdict(100, 100, 0.0001)).toBe('within-noise')
  })

  it('treats a doubling at threshold 1 as regressed', () => {
    expect(verdict(100, 200, 1)).toBe('regressed')
  })

  it('treats a halving at threshold 1 as within-noise', () => {
    expect(verdict(100, 50, 1)).toBe('within-noise')
  })

  it('treats an unchanged zero baseline as within-noise', () => {
    expect(verdict(0, 0, 0.5)).toBe('within-noise')
  })

  it('treats any increase over a zero baseline as regressed', () => {
    expect(verdict(0, 0.0001, 0.5)).toBe('regressed')
    expect(verdict(0, 5, 0.5)).toBe('regressed')
  })

  it('throws when the threshold is outside (0, 1]', () => {
    for (const minimumRelativeChange of [0, -0.5, 1.0001, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => verdict(100, 90, minimumRelativeChange))
        .toThrow('minimumRelativeChange must be within (0, 1]')
    }
  })
})

describe('formatSampleSummary', () => {
  it('formats a computed summary as one line', () => {
    expect(formatSampleSummary(summarizeSamples([1, 2, 3])))
      .toBe('n=3 min=1.000 median=2.000 mean=2.000 max=3.000 sd=1.000')
  })

  it('rounds the mean and standard deviation to three decimals', () => {
    expect(formatSampleSummary(summarizeSamples([1, 2, 4])))
      .toBe('n=3 min=1.000 median=2.000 mean=2.333 max=4.000 sd=1.528')
  })

  it('rounds an irrational standard deviation', () => {
    expect(formatSampleSummary(summarizeSamples([10, 20])))
      .toBe('n=2 min=10.000 median=15.000 mean=15.000 max=20.000 sd=7.071')
  })

  it('keeps the count unpadded while padding every statistic', () => {
    expect(formatSampleSummary(summarizeSamples([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])))
      .toBe('n=10 min=1.000 median=5.500 mean=5.500 max=10.000 sd=3.028')
  })
})
