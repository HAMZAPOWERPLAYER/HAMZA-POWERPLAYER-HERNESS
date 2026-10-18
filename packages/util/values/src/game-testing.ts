/**
 * Automated game testing model.
 *
 * Provides test case definitions, test execution tracking, and test result
 * aggregation for game testing. All helpers are pure: they compute test state
 * transitions and results from caller-supplied input, perform no I/O, and hold
 * no state.
 *
 * Test cases and recorded results carry a check kind, so suites can tell
 * static, gameplay, build, and visual checks apart and report visual results
 * that hold no screenshot evidence.
 *
 * @module @deepseek-ai/dsh-util-values/game-testing
 */

/**
 * Kind of check a test performs.
 *
 * `static` checks examine code without running the game, `gameplay` checks run
 * the game under automation, `build` checks verify the packaged build output,
 * and `visual` checks verify rendered screens and need a screenshot as
 * evidence.
 */
export type CheckKind = 'static' | 'gameplay' | 'build' | 'visual';

/** One test case. */
export interface GameTestCase {
  /** Stable identifier. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Test type. */
  readonly type: 'unit' | 'integration' | 'e2e' | 'playthrough' | 'performance' | 'regression';
  /**
   * Declared check kind; omitted when the caller declares none, and then
   * `resolveCheckKind` derives the kind from `type`.
   */
  readonly checkKind?: CheckKind;
  /** Description. */
  readonly description: string;
  /** Preconditions. */
  readonly preconditions: readonly string[];
  /** Steps to execute. */
  readonly steps: readonly string[];
  /** Expected results. */
  readonly expectedResults: readonly string[];
  /** Whether the test is automated. */
  readonly automated: boolean;
  /** Platforms to test on. */
 readonly platforms: readonly string[];
  /** Estimated duration in seconds. */
  readonly estimatedDurationSeconds: number;
  /** Tags. */
  readonly tags: readonly string[];
}

/** One test run result. */
export interface TestRunResult {
  /** Test case id. */
  readonly testId: string;
  /** Check kind of the executed case, as resolved by `resolveCheckKind` when the run was recorded. */
  readonly checkKind: CheckKind;
  /** Whether the test passed. */
  readonly passed: boolean;
  /** Duration in seconds. */
  readonly durationSeconds: number;
  /** Error message, if failed. */
  readonly errorMessage: string | null;
  /** Screenshot path, if captured. */
  readonly screenshotPath: string | null;
  /** Log output. */
  readonly logOutput: string | null;
  /** Timestamp. */
  readonly timestamp: number;
}

/** Test suite result. */
export interface TestSuiteResult {
  /** Suite name. */
  readonly suiteName: string;
  /** Test results. */
  readonly results: readonly TestRunResult[];
  /** Total tests. */
  readonly total: number;
  /** Passed tests. */
  readonly passed: number;
  /** Failed tests. */
  readonly failed: number;
  /** Skipped tests. */
  readonly skipped: number;
  /** Visual results with no screenshot path, which hold no evidence and cannot claim visual verification. */
  readonly unverifiedVisual: number;
  /** Overall pass rate. */
  readonly passRate: number;
  /** Total duration. */
  readonly totalDurationSeconds: number;
}

/**
 * Create a test case.
 *
 * A declared `checkKind` is copied onto the case; when it is absent the case
 * omits the field entirely and `resolveCheckKind` derives the kind later.
 *
 * @param params - test case fields to package.
 * @returns the test case assembled from the supplied fields.
 */
export function createGameTestCase(params: {
  readonly id: string;
  readonly name: string;
  readonly type: 'unit' | 'integration' | 'e2e' | 'playthrough' | 'performance' | 'regression';
  readonly checkKind?: CheckKind;
  readonly description: string;
  readonly preconditions: readonly string[];
  readonly steps: readonly string[];
  readonly expectedResults: readonly string[];
  readonly automated: boolean;
  readonly platforms: readonly string[];
  readonly estimatedDurationSeconds: number;
  readonly tags: readonly string[];
}): GameTestCase {
  const test: GameTestCase = {
    id: params.id,
    name: params.name,
    type: params.type,
    description: params.description,
    preconditions: params.preconditions,
    steps: params.steps,
    expectedResults: params.expectedResults,
    automated: params.automated,
    platforms: params.platforms,
    estimatedDurationSeconds: params.estimatedDurationSeconds,
    tags: params.tags,
  };
  if (params.checkKind === undefined) return test;
  return { ...test, checkKind: params.checkKind };
}

/**
 * Resolve the check kind of a test case.
 *
 * A declared `checkKind` is returned as it stands. Otherwise the kind derives
 * from `type`: `unit` cases run code without gameplay and resolve to `static`;
 * `integration`, `e2e`, `playthrough`, `performance`, and `regression` run the
 * game and resolve to `gameplay`. `build` and `visual` checks have no matching
 * `type` and must be declared on the case.
 *
 * @param test - test case to resolve the check kind for.
 * @returns the declared check kind, or the kind derived from the test type.
 */
export function resolveCheckKind(test: GameTestCase): CheckKind {
  if (test.checkKind !== undefined) return test.checkKind;
  return test.type === 'unit' ? 'static' : 'gameplay';
}

/**
 * Record a test run result.
 *
 * @param test - test case the run executed; its resolved check kind is recorded with the result.
 * @param passed - whether the test passed.
 * @param durationSeconds - run duration in seconds.
 * @param errorMessage - failure message, or null when none.
 * @param screenshotPath - captured screenshot path, or null when none.
 * @param logOutput - captured log output, or null when none.
 * @param timestamp - when the run occurred.
 * @returns the recorded test run result.
 */
export function recordTestResult(
  test: GameTestCase,
  passed: boolean,
  durationSeconds: number,
  errorMessage: string | null,
  screenshotPath: string | null,
  logOutput: string | null,
  timestamp: number,
): TestRunResult {
  return {
    testId: test.id,
    checkKind: resolveCheckKind(test),
    passed,
    durationSeconds,
    errorMessage,
    screenshotPath,
    logOutput,
    timestamp,
  };
}

/**
 * Aggregate test run results into a suite result.
 *
 * @param suiteName - name of the suite.
 * @param results - individual test run results to aggregate.
 * @returns totals, pass rate, total duration, and the count of visual results that hold no screenshot evidence.
 */
export function aggregateTestSuite(
  suiteName: string,
  results: readonly TestRunResult[],
): TestSuiteResult {
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const skipped = total - passed - failed;
  const unverifiedVisual = results.filter((r) => r.checkKind === 'visual' && r.screenshotPath === null).length;
  const passRate = total === 0 ? 0 : (passed / total) * 100;
  const totalDuration = results.reduce((sum, r) => sum + r.durationSeconds, 0);

  return {
    suiteName,
    results,
    total,
    passed,
    failed,
    skipped,
    unverifiedVisual,
    passRate,
    totalDurationSeconds: totalDuration,
  };
}

/**
 * Check if a test suite meets quality thresholds.
 *
 * A visual result with no screenshot path counts against the suite, because it
 * holds no evidence for the screen it ran against.
 *
 * @param result - suite result to evaluate.
 * @param minPassRate - minimum acceptable pass percentage.
 * @param maxDurationSeconds - maximum acceptable total duration in seconds.
 * @returns whether every threshold is met, with one message per issue found.
 */
export function checkSuiteQuality(
  result: TestSuiteResult,
  minPassRate: number,
  maxDurationSeconds: number,
): {
  readonly passes: boolean;
  readonly issues: readonly string[];
} {
  const issues: string[] = [];

  if (result.passRate < minPassRate) {
    issues.push(`pass rate ${result.passRate.toFixed(1)}% is below minimum ${minPassRate}%`);
  }

  if (result.totalDurationSeconds > maxDurationSeconds) {
    issues.push(`total duration ${result.totalDurationSeconds.toFixed(1)}s exceeds maximum ${maxDurationSeconds}s`);
  }

  if (result.failed > 0) {
    issues.push(`${result.failed} test(s) failed`);
  }

  if (result.unverifiedVisual > 0) {
    issues.push(`${result.unverifiedVisual} visual check(s) lack screenshot evidence and cannot claim visual verification`);
  }

  return {
    passes: issues.length === 0,
    issues,
  };
}

/**
 * Filter test results by status.
 *
 * @param results - test run results to filter.
 * @param status - status to keep; skipped matches nothing because skips are not tracked separately.
 * @returns the results matching the status.
 */
export function filterResultsByStatus(
  results: readonly TestRunResult[],
  status: 'passed' | 'failed' | 'skipped',
): readonly TestRunResult[] {
  return results.filter((r) => {
    if (status === 'passed') return r.passed;
    if (status === 'failed') return !r.passed;
    return false; // skipped not tracked separately in this model
  });
}

/**
 * Get failed tests with error messages.
 *
 * @param results - test run results to filter.
 * @returns failed test ids with their error messages, or unknown error when a message is absent.
 */
export function getFailedTests(
  results: readonly TestRunResult[],
): readonly { readonly testId: string; readonly errorMessage: string }[] {
  return results
    .filter((r) => !r.passed)
    .map((r) => ({ testId: r.testId, errorMessage: r.errorMessage ?? 'unknown error' }));
}
