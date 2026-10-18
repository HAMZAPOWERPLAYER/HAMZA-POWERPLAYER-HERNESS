import { describe, expect, it } from 'vitest'
import {
  createHistogram,
  formatHistogram,
  histogramPercentile,
  recordSample,
  recordSamples,
} from '../src/latency-histogram.ts'

describe('createHistogram', () => {
  it('starts with one zeroed count per boundary and no samples', () => {
    expect(createHistogram([10, 20, 50])).toEqual({
      boundariesMs: [10, 20, 50],
      counts: [0, 0, 0],
      overflowCount: 0,
      total: 0,
      sumMs: 0,
      minMs: null,
      maxMs: null,
    })
  })
  it('throws on an empty boundary list', () => {
    expect(() => createHistogram([])).toThrow(/boundaries must not be empty/)
  })
  it('throws on duplicate boundaries', () => {
    expect(() => createHistogram([10, 10])).toThrow(/boundaries must be strictly increasing/)
  })
  it('throws on decreasing boundaries', () => {
    expect(() => createHistogram([20, 10])).toThrow(/boundaries must be strictly increasing/)
  })
  it('throws on a negative boundary', () => {
    expect(() => createHistogram([-1, 10])).toThrow(/boundaries must be finite and non-negative/)
  })
  it('throws on NaN and infinite boundaries', () => {
    for (const boundary of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => createHistogram([0, boundary])).toThrow(/boundaries must be finite and non-negative/)
    }
  })
  it('copies the boundary list instead of aliasing it', () => {
    const boundaries = [10, 20]
    const histogram = createHistogram(boundaries)
    boundaries[0] = 99
    expect(histogram.boundariesMs).toEqual([10, 20])
  })
})

describe('recordSample', () => {
  it('counts a sample equal to a boundary in that bucket', () => {
    const histogram = recordSample(createHistogram([10, 20]), 10)
    expect(histogram.counts).toEqual([1, 0])
    expect(histogram.overflowCount).toBe(0)
  })
  it('places a sample between boundaries in the first covering bucket', () => {
    expect(recordSample(createHistogram([10, 20]), 15).counts).toEqual([0, 1])
  })
  it('places a sample below the first boundary in the first bucket', () => {
    expect(recordSample(createHistogram([10, 20]), 5).counts).toEqual([1, 0])
  })
  it('counts a sample above the last boundary as overflow', () => {
    const histogram = recordSample(createHistogram([10, 20]), 20.5)
    expect(histogram.counts).toEqual([0, 0])
    expect(histogram.overflowCount).toBe(1)
  })
  it('accepts zero as a sample', () => {
    expect(recordSample(createHistogram([10]), 0).counts).toEqual([1])
  })
  it('accumulates total, sum, min and max', () => {
    const histogram = recordSamples(createHistogram([10]), [4, 8, 2])
    expect(histogram.total).toBe(3)
    expect(histogram.sumMs).toBe(14)
    expect(histogram.minMs).toBe(2)
    expect(histogram.maxMs).toBe(8)
  })
  it('keeps the running minimum and maximum across bucket and overflow samples', () => {
    expect(recordSamples(createHistogram([10]), [100, 1, 3])).toEqual({
      boundariesMs: [10],
      counts: [2],
      overflowCount: 1,
      total: 3,
      sumMs: 104,
      minMs: 1,
      maxMs: 100,
    })
  })
  it('leaves the input histogram untouched and returns a new value', () => {
    const empty = createHistogram([10])
    const recorded = recordSample(empty, 5)
    expect(empty).toEqual({
      boundariesMs: [10],
      counts: [0],
      overflowCount: 0,
      total: 0,
      sumMs: 0,
      minMs: null,
      maxMs: null,
    })
    expect(recorded).toEqual({
      boundariesMs: [10],
      counts: [1],
      overflowCount: 0,
      total: 1,
      sumMs: 5,
      minMs: 5,
      maxMs: 5,
    })
  })
  it('throws on a NaN sample', () => {
    expect(() => recordSample(createHistogram([10]), Number.NaN))
      .toThrow(/sample must be finite and non-negative/)
  })
  it('throws on a negative sample', () => {
    expect(() => recordSample(createHistogram([10]), -0.5))
      .toThrow(/sample must be finite and non-negative/)
  })
  it('throws on an infinite sample', () => {
    expect(() => recordSample(createHistogram([10]), Number.POSITIVE_INFINITY))
      .toThrow(/sample must be finite and non-negative/)
  })
})

describe('recordSamples', () => {
  it('returns the histogram unchanged for an empty list', () => {
    expect(recordSamples(createHistogram([10, 20]), [])).toEqual({
      boundariesMs: [10, 20],
      counts: [0, 0],
      overflowCount: 0,
      total: 0,
      sumMs: 0,
      minMs: null,
      maxMs: null,
    })
  })
  it('records every sample in order', () => {
    expect(recordSamples(createHistogram([10, 20]), [30, 5, 15, 10])).toEqual({
      boundariesMs: [10, 20],
      counts: [2, 1],
      overflowCount: 1,
      total: 4,
      sumMs: 60,
      minMs: 5,
      maxMs: 30,
    })
  })
  it('discards earlier samples when one sample is invalid and leaves the input untouched', () => {
    const empty = createHistogram([10])
    expect(() => recordSamples(empty, [5, Number.NaN])).toThrow(/sample must be finite and non-negative/)
    expect(empty.counts).toEqual([0])
    expect(empty.total).toBe(0)
  })
})

describe('histogramPercentile', () => {
  it('returns null for an empty histogram', () => {
    expect(histogramPercentile(createHistogram([10, 20]), 50)).toBeNull()
  })
  it('returns null for an empty histogram even at a percentile outside (0, 100]', () => {
    expect(histogramPercentile(createHistogram([10]), 0)).toBeNull()
  })
  it('returns the covering bucket upper bound, not the recorded sample', () => {
    expect(histogramPercentile(recordSample(createHistogram([10, 50]), 7), 50)).toBe(10)
  })
  it('returns the first bucket for the smallest rank', () => {
    const histogram = recordSamples(createHistogram([10, 20, 30]), [5, 5, 5, 5, 15, 15, 15, 25, 25, 35])
    expect(histogramPercentile(histogram, 1)).toBe(10)
  })
  it('rounds the nearest rank up with Math.ceil', () => {
    const histogram = recordSamples(createHistogram([10, 20, 30]), [5, 5, 5, 5, 15, 15, 15, 25, 25, 35])
    expect(histogramPercentile(histogram, 41)).toBe(20)
  })
  it('uses the bucket containing an exact rank', () => {
    const histogram = recordSamples(createHistogram([10, 20, 30]), [5, 5, 5, 5, 15, 15, 15, 25, 25, 35])
    expect(histogramPercentile(histogram, 40)).toBe(10)
    expect(histogramPercentile(histogram, 70)).toBe(20)
  })
  it('returns the last bucket boundary at p=100, or the recorded maximum when that rank overflows', () => {
    const bounded = recordSamples(createHistogram([10, 20]), [5, 15])
    const overflowing = recordSamples(createHistogram([10, 20]), [5, 15, 999])
    expect(histogramPercentile(bounded, 100)).toBe(20)
    expect(histogramPercentile(overflowing, 100)).toBe(999)
    expect(histogramPercentile(overflowing, 67)).toBe(999)
  })
  it('throws when the percentile is outside (0, 100]', () => {
    const histogram = recordSample(createHistogram([10]), 5)
    for (const percentile of [0, -1, 100.5, 101, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => histogramPercentile(histogram, percentile)).toThrow(/percentile must be within \(0, 100\]/)
    }
  })
})

describe('formatHistogram', () => {
  it('formats an empty histogram with n/a statistics', () => {
    expect(formatHistogram(createHistogram([10, 20]))).toBe('samples=0 min=n/a max=n/a sum=0')
  })
  it('formats a single-bucket histogram with its bucket line', () => {
    expect(formatHistogram(recordSample(createHistogram([10]), 7))).toBe([
      'samples=1 min=7 max=7 sum=7',
      '<= 10ms: 1',
    ].join('\n'))
  })
  it('lists only non-empty buckets and omits the overflow line when nothing overflowed', () => {
    const histogram = recordSamples(createHistogram([10, 20, 30]), [5, 25])
    expect(formatHistogram(histogram).split('\n')).toEqual([
      'samples=2 min=5 max=25 sum=30',
      '<= 10ms: 1',
      '<= 30ms: 1',
    ])
    expect(formatHistogram(histogram)).toContain('<= 30ms: 1')
  })
  it('appends the overflow line only when the overflow bucket is non-empty', () => {
    expect(formatHistogram(recordSamples(createHistogram([10, 20]), [3, 12, 12, 33]))).toBe([
      'samples=4 min=3 max=33 sum=60',
      '<= 10ms: 1',
      '<= 20ms: 2',
      '> 20ms: 1',
    ].join('\n'))
    expect(formatHistogram(recordSamples(createHistogram([10, 20]), [3, 12]))).toBe([
      'samples=2 min=3 max=12 sum=15',
      '<= 10ms: 1',
      '<= 20ms: 1',
    ].join('\n'))
  })
  it('formats min and max from overflow samples', () => {
    expect(formatHistogram(recordSamples(createHistogram([10]), [2, 40]))).toBe([
      'samples=2 min=2 max=40 sum=42',
      '<= 10ms: 1',
      '> 10ms: 1',
    ].join('\n'))
  })
})
