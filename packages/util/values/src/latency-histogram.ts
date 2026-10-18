/**
 * Pure fixed-boundary latency histograms.
 *
 * A histogram stores one count per caller-supplied boundary plus a single
 * overflow count, so its memory stays bounded no matter how many samples are
 * recorded. Every helper is deterministic, stateless, returns a new histogram
 * instead of mutating its input, performs no I/O, and imports nothing.
 * Timings are passed in explicitly rather than read from a clock. Callers own
 * the boundary choice, storage, and clock reads.
 *
 * @module @deepseek-ai/dsh-util-values/latency-histogram
 */

/**
 * An immutable histogram over fixed latency boundaries.
 *
 * Instances come from {@link createHistogram} and are extended by
 * {@link recordSample}. A value built by hand must keep `boundariesMs`
 * non-empty and `counts` one entry per boundary for the percentile and
 * formatting helpers to stay defined.
 */
export interface LatencyHistogram {
  /** Bucket upper bounds in milliseconds, strictly increasing and non-negative. */
  readonly boundariesMs: readonly number[]
  /** Recorded sample count per boundary; `counts[i]` counts samples at or below `boundariesMs[i]`. */
  readonly counts: readonly number[]
  /** Samples greater than the last boundary. */
  readonly overflowCount: number
  /** Number of samples recorded. */
  readonly total: number
  /** Sum of every recorded sample in milliseconds. */
  readonly sumMs: number
  /** Smallest recorded sample, or `null` while `total` is 0. */
  readonly minMs: number | null
  /** Largest recorded sample, or `null` while `total` is 0. */
  readonly maxMs: number | null
}

/**
 * Create an empty histogram over fixed upper bounds.
 *
 * The boundaries are copied, so later mutation of the caller's array does not
 * affect the histogram.
 *
 * @param boundariesMs - strictly increasing, non-negative bucket upper bounds in milliseconds.
 * @returns a histogram with every count and statistic at zero.
 * @throws Error when `boundariesMs` is empty, holds a non-finite or negative
 * bound, or is not strictly increasing.
 */
export function createHistogram(boundariesMs: readonly number[]): LatencyHistogram {
  if (boundariesMs.length === 0) throw new Error('boundaries must not be empty')
  for (let index = 0; index < boundariesMs.length; index += 1) {
    const boundary = boundariesMs[index] as number
    if (!Number.isFinite(boundary) || boundary < 0) {
      throw new Error('boundaries must be finite and non-negative')
    }
    if (index > 0 && boundary <= (boundariesMs[index - 1] as number)) {
      throw new Error('boundaries must be strictly increasing')
    }
  }
  return {
    boundariesMs: [...boundariesMs],
    counts: boundariesMs.map(() => 0),
    overflowCount: 0,
    total: 0,
    sumMs: 0,
    minMs: null,
    maxMs: null,
  }
}

/**
 * Record one latency sample.
 *
 * The sample is counted in the first bucket whose boundary is at or above it,
 * or as overflow when every boundary is below it.
 *
 * @param histogram - histogram to extend; the input is not modified.
 * @param milliseconds - observed latency in milliseconds; must be finite and non-negative.
 * @returns a new histogram with the sample counted and the statistics updated.
 * @throws Error when `milliseconds` is not finite or is negative.
 */
export function recordSample(histogram: LatencyHistogram, milliseconds: number): LatencyHistogram {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    throw new Error('sample must be finite and non-negative')
  }
  let bucket = -1
  for (let index = 0; index < histogram.boundariesMs.length; index += 1) {
    if (milliseconds <= (histogram.boundariesMs[index] as number)) {
      bucket = index
      break
    }
  }
  const counts = [...histogram.counts]
  let overflowCount = histogram.overflowCount
  if (bucket === -1) overflowCount += 1
  else counts[bucket] = (counts[bucket] as number) + 1
  return {
    boundariesMs: [...histogram.boundariesMs],
    counts,
    overflowCount,
    total: histogram.total + 1,
    sumMs: histogram.sumMs + milliseconds,
    minMs: histogram.minMs === null ? milliseconds : Math.min(histogram.minMs, milliseconds),
    maxMs: histogram.maxMs === null ? milliseconds : Math.max(histogram.maxMs, milliseconds),
  }
}

/**
 * Record several latency samples in order.
 *
 * @param histogram - histogram to extend; the input is not modified.
 * @param samples - observed latencies in milliseconds; each must be finite and non-negative.
 * @returns a new histogram with every sample counted in order.
 * @throws Error when a sample is not finite or is negative; the input histogram
 * keeps the samples recorded by earlier calls only.
 */
export function recordSamples(histogram: LatencyHistogram, samples: readonly number[]): LatencyHistogram {
  let recorded = histogram
  for (const sample of samples) recorded = recordSample(recorded, sample)
  return recorded
}

/**
 * Estimate a latency percentile with the nearest-rank method.
 *
 * The result is the upper bound of the bucket containing
 * `ceil(percentile / 100 * total)` recorded samples, so precision is bounded by
 * the configured boundaries: the returned value is never a recorded sample
 * except when that rank falls in the overflow bucket, which returns the largest
 * recorded sample. An empty histogram yields `null` for every percentile.
 *
 * @param histogram - histogram to read.
 * @param percentile - percentile to estimate, within (0, 100].
 * @returns the covering bucket upper bound or the overflow maximum, and `null`
 * when `total` is 0.
 * @throws Error when `total` is non-zero and `percentile` is not a finite
 * number within (0, 100].
 */
export function histogramPercentile(histogram: LatencyHistogram, percentile: number): number | null {
  if (histogram.total === 0) return null
  if (!Number.isFinite(percentile) || percentile <= 0 || percentile > 100) {
    throw new Error(`percentile must be within (0, 100]: ${percentile}`)
  }
  const rank = Math.ceil(percentile / 100 * histogram.total)
  let cumulative = 0
  for (let index = 0; index < histogram.counts.length; index += 1) {
    cumulative += histogram.counts[index] as number
    if (rank <= cumulative) return histogram.boundariesMs[index] as number
  }
  return histogram.maxMs
}

/**
 * Render a histogram as one deterministic block for logs and diagnostics.
 *
 * The first line is `samples=<total> min=<min|n/a> max=<max|n/a> sum=<sum>`,
 * followed by one `<= <boundary>ms: <count>` line per non-empty bucket, and
 * finally `> <lastBoundary>ms: <overflowCount>` when the overflow bucket is
 * non-empty. Lines are joined with `\n` and the block has no trailing newline.
 *
 * @param histogram - histogram to render.
 * @returns the rendered block; an empty histogram renders only the first line.
 */
export function formatHistogram(histogram: LatencyHistogram): string {
  const min = histogram.minMs === null ? 'n/a' : String(histogram.minMs)
  const max = histogram.maxMs === null ? 'n/a' : String(histogram.maxMs)
  const lines = [`samples=${histogram.total} min=${min} max=${max} sum=${histogram.sumMs}`]
  for (let index = 0; index < histogram.counts.length; index += 1) {
    const count = histogram.counts[index] as number
    if (count === 0) continue
    lines.push(`<= ${histogram.boundariesMs[index] as number}ms: ${count}`)
  }
  if (histogram.overflowCount > 0) {
    lines.push(`> ${histogram.boundariesMs[histogram.boundariesMs.length - 1] as number}ms: ${histogram.overflowCount}`)
  }
  return lines.join('\n')
}
