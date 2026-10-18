/**
 * Evidence-based completion report primitives.
 *
 * A completion claim is only as good as the evidence behind it. This module
 * assembles a structured report from concrete facts (files changed, commands
 * run, test results) and exposes a check for whether mandatory acceptance
 * criteria were actually verified. It holds no state and performs no I/O.
 *
 * @module @deepseek-ai/dsh-util-values/completion-report
 */

/** Outcome of a single verification command. */
export interface VerificationOutcome {
  readonly command: string
  readonly exitStatus: number
  readonly summary?: string
}

/** A structured completion report. */
export interface CompletionReport {
  readonly taskId: string
  readonly filesModified: readonly string[]
  readonly featuresImplemented: readonly string[]
  readonly testsExecuted: readonly string[]
  readonly commandsExecuted: readonly string[]
  readonly verificationOutcomes: readonly VerificationOutcome[]
  readonly buildStatus: 'passed' | 'failed' | 'not-run'
  readonly knownLimitations: readonly string[]
  readonly remainingWork: readonly string[]
  /** Epoch milliseconds when the report was assembled. */
  readonly timestamp: number
}

/** Inputs for assembling a completion report. */
export interface CompletionReportInput {
  readonly taskId: string
  readonly filesModified?: readonly string[]
  readonly featuresImplemented?: readonly string[]
  readonly testsExecuted?: readonly string[]
  readonly commandsExecuted?: readonly string[]
  readonly verificationOutcomes?: readonly VerificationOutcome[]
  readonly buildStatus?: CompletionReport['buildStatus']
  readonly knownLimitations?: readonly string[]
  readonly remainingWork?: readonly string[]
  readonly timestamp?: number
}

/**
 * Assemble a {@link CompletionReport} with sensible empty defaults.
 * @param input - report fields; arrays default to empty, buildStatus to 'not-run'.
 * @returns a complete report.
 */
export function createCompletionReport(input: CompletionReportInput): CompletionReport {
  return {
    taskId: input.taskId,
    filesModified: input.filesModified ?? [],
    featuresImplemented: input.featuresImplemented ?? [],
    testsExecuted: input.testsExecuted ?? [],
    commandsExecuted: input.commandsExecuted ?? [],
    verificationOutcomes: input.verificationOutcomes ?? [],
    buildStatus: input.buildStatus ?? 'not-run',
    knownLimitations: input.knownLimitations ?? [],
    remainingWork: input.remainingWork ?? [],
    timestamp: input.timestamp ?? Date.now(),
  }
}

/**
 * Whether the report supports a claim of successful completion: build passed,
 * at least one verification command ran and exited zero, and no remaining work.
 * @param report - the report to inspect.
 * @returns `true` only when all mandatory criteria are met.
 */
export function isCompletionVerified(report: CompletionReport): boolean {
  if (report.buildStatus !== 'passed') return false
  if (report.verificationOutcomes.length === 0) return false
  if (!report.verificationOutcomes.every((outcome) => outcome.exitStatus === 0)) return false
  if (report.remainingWork.length > 0) return false
  return true
}

/**
 * Whether any verification command failed (non-zero exit).
 * @param report - the report to inspect.
 * @returns `true` when at least one outcome exited non-zero.
 */
export function hasVerificationFailure(report: CompletionReport): boolean {
  return report.verificationOutcomes.some((outcome) => outcome.exitStatus !== 0)
}
