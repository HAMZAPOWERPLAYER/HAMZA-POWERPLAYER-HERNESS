/**
 * Decide whether a set of per-file coverage results satisfies a coverage gate.
 * This module owns only the decision rules; it performs no I/O and holds no
 * state. Coverage numbers are supplied by the caller.
 *
 * @module @deepseek-ai/dsh-util-values/test-coverage-gate
 */

/** One file's coverage outcome. */
export interface FileCoverage {
  readonly path: string
  readonly statements: number
  readonly branches: number
  readonly functions: number
  readonly lines: number
}

/** A coverage gate's thresholds, all in percent. */
export interface CoverageThresholds {
  readonly statements: number
  readonly branches: number
  readonly functions: number
  readonly lines: number
}

/** The result of evaluating a coverage gate. */
export interface CoverageGateResult {
  readonly passed: boolean
  readonly failingFiles: readonly string[]
  readonly summary: string
}

/** Whether one file meets every threshold. */
/** Whether one file meets every threshold.
 * @param file - file coverage.
 * @param thresholds - coverage thresholds.
 * @returns whether the file meets every threshold.
 */
export function fileMeetsThresholds(file: FileCoverage, thresholds: CoverageThresholds): boolean {
  return file.statements >= thresholds.statements
    && file.branches >= thresholds.branches
    && file.functions >= thresholds.functions
    && file.lines >= thresholds.lines
}

/** Evaluate a coverage gate over a set of files. */
/** Evaluate a coverage gate over a set of files.
 * @param files - per-file coverage.
 * @param thresholds - coverage thresholds.
 * @returns the gate result.
 */
export function evaluateCoverageGate(files: readonly FileCoverage[], thresholds: CoverageThresholds): CoverageGateResult {
  const failingFiles = files.filter((file) => !fileMeetsThresholds(file, thresholds)).map((file) => file.path).sort()
  const passed = failingFiles.length === 0 && files.length > 0
  const summary = passed
    ? `coverage gate passed: ${files.length} file(s)`
    : failingFiles.length === 0
      ? 'coverage gate failed: no files supplied'
      : `coverage gate failed: ${failingFiles.length} of ${files.length} file(s)`
  return { passed, failingFiles, summary }
}

/** Render a per-file coverage line. */
/** Render a per-file coverage line.
 * @param file - file coverage.
 * @returns the coverage line.
 */
export function formatFileCoverage(file: FileCoverage): string {
  return `${file.path}: statements=${file.statements}% branches=${file.branches}% functions=${file.functions}% lines=${file.lines}%`
}
