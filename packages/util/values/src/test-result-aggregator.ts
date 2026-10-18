/**
 * Aggregate multiple test runs into one report and decide whether the suite is
 * healthy.
 *
 * Every helper is pure: it derives its result only from its arguments, keeps
 * no state, performs no I/O, and imports only from the flaky-test-detector
 * module in this package.
 *
 * @module @deepseek-ai/dsh-util-values/test-result-aggregator
 */

import {
  isFlaky,
  summarizeRuns,
  worstFlakiness,
  type RunOutcome,
  type RunSummary,
} from './flaky-test-detector.ts'

/** One recorded test run, identified by name. */
export interface TestRun {
  /** Human-readable run name. */
  readonly name: string
  /** Outcomes recorded for the run, in run order. */
  readonly outcomes: readonly RunOutcome[]
}

/** A report aggregating several test runs. */
export interface AggregatedTestReport {
  /** Number of runs aggregated. */
  readonly runs: number
  /** Total number of recorded outcomes across all runs. */
  readonly totalTests: number
  /** Outcomes that passed, summed across runs. */
  readonly passed: number
  /** Outcomes that failed, summed across runs. */
  readonly failed: number
  /** Outcomes that were skipped, summed across runs. */
  readonly skipped: number
  /** Number of runs classified as flaky. */
  readonly flakyRuns: number
  /** Highest flakiness value among the runs (0 when there are none). */
  readonly flakiness: number
  /** Whether the suite is healthy. */
  readonly healthy: boolean
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
 * Aggregate multiple test runs into one report.
 *
 * `runs` is the number of supplied runs, `totalTests` is the sum of outcome
 * counts, and `passed`, `failed`, and `skipped` are summed across runs. A run
 * counts toward `flakyRuns` when its {@link summarizeRuns} result is flaky
 * under {@link isFlaky} with `minimumRuns`. `flakiness` is the maximum
 * flakiness value across runs (0 when there are none). The suite is `healthy`
 * only when there are no failures, no flaky runs, and at least one run.
 *
 * @param runs - runs to aggregate.
 * @param minimumRuns - least number of recorded runs required before a mixed history counts as flaky.
 * @returns the aggregated report.
 * @throws Error when `minimumRuns` is not a finite integer of at least 1.
 */
export function aggregateTestRuns(runs: readonly TestRun[], minimumRuns: number): AggregatedTestReport {
  assertValidMinimumRuns(minimumRuns)
  let totalTests = 0
  let passed = 0
  let failed = 0
  let skipped = 0
  const summaries: RunSummary[] = []
  for (const run of runs) {
    const summary = summarizeRuns(run.outcomes)
    summaries.push(summary)
    totalTests += summary.runs
    passed += summary.passed
    failed += summary.failed
    skipped += summary.skipped
  }
  let flakyRuns = 0
  for (const summary of summaries) {
    if (isFlaky(summary, minimumRuns)) flakyRuns += 1
  }
  const flakiness = worstFlakiness(summaries)
  const healthy = failed === 0 && flakyRuns === 0 && runs.length > 0
  return {
    runs: runs.length,
    totalTests,
    passed,
    failed,
    skipped,
    flakyRuns,
    flakiness,
    healthy,
  }
}

/**
 * Render an aggregated report as one deterministic diagnostic line.
 *
 * The line reads
 * `runs=<n> tests=<n> passed=<n> failed=<n> skipped=<n> flakyRuns=<n> flakiness=<f> healthy=<yes|no>`,
 * where `<f>` is {@link AggregatedTestReport.flakiness} rounded to three
 * decimals via `toFixed(3)`.
 *
 * @param report - report to render.
 * @returns the formatted line.
 */
export function formatAggregatedReport(report: AggregatedTestReport): string {
  const healthy = report.healthy ? 'yes' : 'no'
  return `runs=${report.runs} tests=${report.totalTests} passed=${report.passed} failed=${report.failed} skipped=${report.skipped} flakyRuns=${report.flakyRuns} flakiness=${report.flakiness.toFixed(3)} healthy=${healthy}`
}

/**
 * Return the run with the highest flakiness.
 *
 * Ties are broken by input order. Returns `null` for an empty list.
 *
 * @param runs - runs to inspect.
 * @param minimumRuns - least number of recorded runs required before a mixed history counts as flaky.
 * @returns the worst run, or `null` when `runs` is empty.
 * @throws Error when `minimumRuns` is not a finite integer of at least 1.
 */
export function worstRun(runs: readonly TestRun[], minimumRuns: number): TestRun | null {
  assertValidMinimumRuns(minimumRuns)
  let worst: TestRun | null = null
  let worstFlakinessValue = -1
  for (const run of runs) {
    const candidateFlakiness = summarizeRuns(run.outcomes).flakiness
    if (candidateFlakiness > worstFlakinessValue) {
      worst = run
      worstFlakinessValue = candidateFlakiness
    }
  }
  return worst
}
