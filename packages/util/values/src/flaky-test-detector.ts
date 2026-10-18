/**
 * Heuristic flakiness assessment from recorded CI run outcomes.
 *
 * Every helper is pure: it derives its result only from its arguments, keeps
 * no state, performs no I/O, and imports nothing. A mixed pass/fail history is
 * a heuristic signal, not proof of a race or an identification of a
 * nondeterminism cause; the same pattern can come from changed inputs, an
 * environment difference, or a defect that was fixed between runs.
 *
 * Skipped runs count toward `runs` and are excluded from every rate.
 *
 * @module @deepseek-ai/dsh-util-values/flaky-test-detector
 */

/** Outcome recorded for one CI run of a test. */
export type RunOutcome = 'passed' | 'failed' | 'skipped'

/** Counts over recorded runs and the flakiness those counts imply. */
export interface RunSummary {
  /** Total recorded runs, including skipped runs. */
  readonly runs: number
  /** Runs that passed. */
  readonly passed: number
  /** Runs that failed. */
  readonly failed: number
  /** Runs that were skipped; counted in `runs` only. */
  readonly skipped: number
  /** min(passed, failed) / (passed + failed) when both are non-zero, otherwise 0; rounded to 3 decimals. */
  readonly flakiness: number
}

/**
 * Round a number to three decimal places.
 * @param value - number to round.
 * @returns `value` rounded to the nearest thousandth.
 */
function roundToThreeDecimals(value: number): number {
  return Math.round(value * 1000) / 1000
}

/**
 * Reject a run-count threshold the verdicts cannot use.
 * @param minimumRuns - threshold to validate.
 * @throws Error when `minimumRuns` is not a finite integer of at least 1.
 */
function assertValidMinimumRuns(minimumRuns: number): void {
  if (!Number.isFinite(minimumRuns) || !Number.isInteger(minimumRuns) || minimumRuns < 1) {
    throw new Error('minimumRuns must be at least 1')
  }
}

/**
 * Count a recorded outcome list and derive its flakiness.
 *
 * A summary is flaky only when its history contains at least one pass and one
 * failure, so an all-passed, all-failed, or skipped-only history reports
 * `flakiness: 0`, and skipped runs never raise the value.
 *
 * @param outcomes - recorded outcomes in run order; order does not affect the result.
 * @returns the counts and the flakiness for `outcomes`, with `flakiness` rounded to 3 decimals.
 */
export function summarizeRuns(outcomes: readonly RunOutcome[]): RunSummary {
  let passed = 0
  let failed = 0
  let skipped = 0
  for (const outcome of outcomes) {
    switch (outcome) {
      case 'passed':
        passed += 1
        break
      case 'failed':
        failed += 1
        break
      case 'skipped':
        skipped += 1
        break
    }
  }
  const decided = passed + failed
  const flakiness = passed > 0 && failed > 0 ? roundToThreeDecimals(Math.min(passed, failed) / decided) : 0
  return { runs: outcomes.length, passed, failed, skipped, flakiness }
}

/**
 * Whether a summary has enough runs and a mixed history.
 * @param summary - summary to judge.
 * @param minimumRuns - least number of recorded runs required before a mixed history counts.
 * @returns `true` when `summary.runs` is at least `minimumRuns` and `summary.flakiness` is greater than zero.
 * @throws Error when `minimumRuns` is not a finite integer of at least 1.
 */
export function isFlaky(summary: RunSummary, minimumRuns: number): boolean {
  assertValidMinimumRuns(minimumRuns)
  return summary.runs >= minimumRuns && summary.flakiness > 0
}

/**
 * Classify a summary as flaky, stable, or not yet decidable.
 * @param summary - summary to judge.
 * @param minimumRuns - least number of recorded runs required before `flaky` or `stable` is returned.
 * @returns `'insufficient-runs'` when `summary.runs` is below `minimumRuns`, otherwise `'flaky'`
 * when `summary.flakiness` is greater than zero and `'stable'` when it is zero.
 * @throws Error when `minimumRuns` is not a finite integer of at least 1.
 */
export function flakyVerdict(summary: RunSummary, minimumRuns: number): 'flaky' | 'stable' | 'insufficient-runs' {
  assertValidMinimumRuns(minimumRuns)
  if (summary.runs < minimumRuns) return 'insufficient-runs'
  return summary.flakiness > 0 ? 'flaky' : 'stable'
}

/**
 * Render a summary as one deterministic diagnostic line.
 *
 * The line reads
 * `runs=<n> passed=<n> failed=<n> skipped=<n> flakiness=<f> verdict=<verdict>`.
 * `flakiness` renders as `String(value)`, so trailing zeros are dropped and a
 * whole number has no decimal separator (for example `0`, `0.5`, `0.333`).
 *
 * @param summary - summary to render.
 * @param minimumRuns - least number of recorded runs required before a mixed history counts as flaky.
 * @returns the formatted line.
 * @throws Error when `minimumRuns` is not a finite integer of at least 1.
 */
export function formatFlakinessReport(summary: RunSummary, minimumRuns: number): string {
  const verdict = flakyVerdict(summary, minimumRuns)
  return `runs=${summary.runs} passed=${summary.passed} failed=${summary.failed} skipped=${summary.skipped} flakiness=${String(summary.flakiness)} verdict=${verdict}`
}

/**
 * Report the highest flakiness among flaky summaries.
 * @param summaries - summaries to inspect.
 * @returns the greatest `flakiness` value above zero, or `0` when `summaries` is
 * empty or contains no flaky summary.
 */
export function worstFlakiness(summaries: readonly RunSummary[]): number {
  let worst = 0
  for (const summary of summaries) {
    if (summary.flakiness > worst) worst = summary.flakiness
  }
  return worst
}
