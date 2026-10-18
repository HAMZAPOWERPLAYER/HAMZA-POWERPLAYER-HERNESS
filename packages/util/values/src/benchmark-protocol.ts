/**
 * Pure arithmetic and decision rules for a benchmark measurement protocol.
 *
 * This module never measures anything: callers run the warm-up and measured
 * rounds, read their own clock, and pass the resulting samples in
 * milliseconds. The helpers validate a protocol, summarize the supplied
 * samples, compare two summaries against a relative noise threshold, and
 * render one line for logs, so a report from a low-resource machine can state
 * whether a change cleared a chosen threshold instead of treating any
 * difference as real. Every helper is deterministic, stateless, returns a new
 * value instead of mutating its input, performs no I/O, and imports nothing.
 *
 * @module @deepseek-ai/dsh-util-values/benchmark-protocol
 */

/**
 * Warm-up and measurement round counts for one benchmark run.
 *
 * A protocol is valid when `measuredRounds` is a finite integer of at least 1,
 * `warmupRounds` is a finite non-negative integer, and `warmupRounds` does not
 * exceed `measuredRounds`; check a hand-built protocol with
 * {@link validateProtocol} before use.
 */
export interface MeasurementProtocol {
  /** Rounds run before measurement to stabilize the machine; their samples are not summarized. */
  readonly warmupRounds: number
  /** Rounds whose samples are summarized; a finite integer of at least 1. */
  readonly measuredRounds: number
}

/**
 * Check a protocol and report every problem it has.
 *
 * Problems are reported in a fixed order: a `measuredRounds` below 1 or not a
 * finite integer, a `warmupRounds` below 0 or not a finite integer, then a
 * `warmupRounds` greater than `measuredRounds`. Every applicable problem is
 * reported, so an invalid protocol can produce more than one entry.
 *
 * @param protocol - protocol to check.
 * @returns problem messages in report order; an empty array means the protocol
 * is valid.
 */
export function validateProtocol(protocol: MeasurementProtocol): readonly string[] {
  const problems: string[] = []
  if (!Number.isInteger(protocol.measuredRounds) || protocol.measuredRounds < 1) {
    problems.push('measuredRounds must be at least 1')
  }
  if (!Number.isInteger(protocol.warmupRounds) || protocol.warmupRounds < 0) {
    problems.push('warmupRounds must be a non-negative integer')
  }
  if (protocol.warmupRounds > protocol.measuredRounds) {
    problems.push('measuredRounds must be at least warmupRounds')
  }
  return problems
}

/** Descriptive statistics of one run's measured samples, all in milliseconds. */
export interface SampleSummary {
  /** Number of summarized samples. */
  readonly count: number
  /** Smallest sample. */
  readonly minMs: number
  /** Largest sample. */
  readonly maxMs: number
  /** Middle sample for an odd count, or the mean of the two middle samples for an even count. */
  readonly medianMs: number
  /** Arithmetic mean of every sample. */
  readonly meanMs: number
  /** Sample standard deviation (n - 1 denominator); 0 when count < 2. */
  readonly standardDeviationMs: number
}

/**
 * Summarize measured samples in milliseconds.
 *
 * The caller's array is copied before sorting, so its order is preserved. The
 * median is the middle sample for an odd count and the mean of the two middle
 * samples for an even count. The standard deviation is the sample standard
 * deviation, dividing the squared deviations from the mean by `count - 1`, so
 * a single sample reports 0.
 *
 * @param samples - measured durations in milliseconds; each must be finite and non-negative.
 * @returns the summary of every supplied sample.
 * @throws Error when `samples` is empty or holds a value that is not finite
 * and non-negative.
 */
export function summarizeSamples(samples: readonly number[]): SampleSummary {
  if (samples.length === 0) throw new Error('samples must not be empty')
  for (const sample of samples) {
    if (!Number.isFinite(sample) || sample < 0) {
      throw new Error('samples must be finite and non-negative')
    }
  }
  const sorted = [...samples].sort((left, right) => left - right)
  const count = sorted.length
  const midpoint = Math.floor(count / 2)
  const medianMs = count % 2 === 1
    ? sorted[midpoint] as number
    : ((sorted[midpoint - 1] as number) + (sorted[midpoint] as number)) / 2
  let meanMs = 0
  for (const sample of sorted) meanMs += sample
  meanMs /= count
  let squaredDeviations = 0
  for (const sample of sorted) squaredDeviations += (sample - meanMs) ** 2
  const standardDeviationMs = count < 2 ? 0 : Math.sqrt(squaredDeviations / (count - 1))
  return {
    count,
    minMs: sorted[0] as number,
    maxMs: sorted[count - 1] as number,
    medianMs,
    meanMs,
    standardDeviationMs,
  }
}

/**
 * Summarize the measured rounds of a validated protocol.
 *
 * The samples are the measured rounds themselves; the warm-up rounds have
 * already been discarded by the caller. Extra samples beyond
 * `protocol.measuredRounds` are summarized too.
 *
 * @param protocol - protocol the samples were collected under.
 * @param samples - measured durations in milliseconds, at least
 * `protocol.measuredRounds` of them.
 * @returns the summary of every supplied sample.
 * @throws Error when the protocol is invalid, reporting only its first
 * problem, or when fewer than `protocol.measuredRounds` samples are supplied.
 */
export function summarizeRounds(protocol: MeasurementProtocol, samples: readonly number[]): SampleSummary {
  const problems = validateProtocol(protocol)
  if (problems.length > 0) throw new Error(`protocol is not valid: ${problems[0] as string}`)
  if (samples.length < protocol.measuredRounds) {
    throw new Error(`expected ${protocol.measuredRounds} measured rounds, received ${samples.length}`)
  }
  return summarizeSamples(samples)
}

/** Verdict for one median comparison. */
export type ComparisonVerdict = 'improved' | 'regressed' | 'within-noise'

/**
 * Compare two summaries by their medians against a relative noise threshold.
 *
 * The relative change is `(after.medianMs - before.medianMs) / before.medianMs`.
 * A change smaller than the threshold is `within-noise`; a decrease of at
 * least the threshold is `improved`, and an increase of at least the threshold
 * is `regressed`, so both bounds are inclusive. When `before.medianMs` is 0
 * the relative change is undefined: an increase is `regressed` and anything
 * else is `within-noise`.
 *
 * @param before - summary of the baseline run.
 * @param after - summary of the run compared against the baseline.
 * @param minimumRelativeChange - smallest relative median change treated as
 * real, within (0, 1].
 * @returns the verdict for the pair.
 * @throws Error when `minimumRelativeChange` is not finite or outside (0, 1].
 */
export function compareSummaries(
  before: SampleSummary,
  after: SampleSummary,
  minimumRelativeChange: number,
): ComparisonVerdict {
  if (!Number.isFinite(minimumRelativeChange) || minimumRelativeChange <= 0 || minimumRelativeChange > 1) {
    throw new Error('minimumRelativeChange must be within (0, 1]')
  }
  if (before.medianMs === 0) return after.medianMs > 0 ? 'regressed' : 'within-noise'
  const relativeChange = (after.medianMs - before.medianMs) / before.medianMs
  if (relativeChange <= -minimumRelativeChange) return 'improved'
  if (relativeChange >= minimumRelativeChange) return 'regressed'
  return 'within-noise'
}

/**
 * Render a sample summary as one line for logs and diagnostics.
 *
 * The line is `n=<count> min=<min> median=<median> mean=<mean> max=<max>
 * sd=<sd>`, and every statistic is rounded to three decimals by
 * {@link roundToThreeDecimals}.
 *
 * @param summary - summary to render.
 * @returns the formatted line.
 */
export function formatSampleSummary(summary: SampleSummary): string {
  return [
    `n=${summary.count}`,
    `min=${roundToThreeDecimals(summary.minMs)}`,
    `median=${roundToThreeDecimals(summary.medianMs)}`,
    `mean=${roundToThreeDecimals(summary.meanMs)}`,
    `max=${roundToThreeDecimals(summary.maxMs)}`,
    `sd=${roundToThreeDecimals(summary.standardDeviationMs)}`,
  ].join(' ')
}

/**
 * Round a number to three decimals and render it with exactly three decimals,
 * so every formatted summary keeps a fixed width.
 *
 * @param value - number to round.
 * @returns the value with three decimals, e.g. `2.5` renders as `2.500`.
 */
function roundToThreeDecimals(value: number): string {
  return value.toFixed(3)
}
