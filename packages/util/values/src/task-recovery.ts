/**
 * Task recovery and partial-success model.
 *
 * Represents interrupted execution, partial success, and safe resumption without
 * assuming a previously recorded operation completed. This module performs no
 * I/O and holds no state.
 *
 * @module @deepseek-ai/dsh-util-values/task-recovery
 */

/** Status of one recorded step. */
export type StepStatus = 'completed' | 'failed' | 'skipped' | 'interrupted' | 'not-started';

/** One step in a multi-step task. */
export interface TaskStep {
  /** Stable identifier. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Current status. */
  readonly status: StepStatus;
  /** Whether the step is idempotent (safe to repeat). */
  readonly idempotent: boolean;
  /** Files changed by the step, when known. */
  readonly changedFiles?: readonly string[];
  /** Error message, when failed. */
  readonly errorMessage?: string;
}

/** A partial-success report. */
export interface PartialSuccessReport {
  /** Steps that completed. */
  readonly completed: readonly TaskStep[];
  /** Steps that failed. */
  readonly failed: readonly TaskStep[];
  /** Steps that were interrupted. */
  readonly interrupted: readonly TaskStep[];
  /** Steps not started. */
  readonly notStarted: readonly TaskStep[];
  /** All files changed across completed steps. */
  readonly changedFiles: readonly string[];
  /** Whether the task can be resumed safely. */
  readonly resumable: boolean;
  /** Recovery options. */
  readonly recoveryOptions: readonly string[];
}

/**
 * Build a partial-success report from a list of steps.
 * @param steps - recorded steps.
 * @returns the partial-success report.
 */
export function buildPartialSuccessReport(steps: readonly TaskStep[]): PartialSuccessReport {
  const completed = steps.filter((s) => s.status === 'completed');
  const failed = steps.filter((s) => s.status === 'failed');
  const interrupted = steps.filter((s) => s.status === 'interrupted');
  const notStarted = steps.filter((s) => s.status === 'not-started' || s.status === 'skipped');

  const changedFiles = Array.from(new Set(completed.flatMap((s) => s.changedFiles ?? [])));

  const recoveryOptions: string[] = [];
  if (interrupted.length > 0) recoveryOptions.push('resume from interrupted step after validating current state');
  if (failed.some((s) => s.idempotent)) recoveryOptions.push('retry idempotent failed steps');
  if (failed.some((s) => !s.idempotent)) recoveryOptions.push('inspect non-idempotent failed steps before retry');
  if (completed.length > 0) recoveryOptions.push('preserve completed work; do not revert automatically');

  const resumable = interrupted.length > 0 || failed.some((s) => s.idempotent);

  return {
    completed,
    failed,
    interrupted,
    notStarted,
    changedFiles,
    resumable,
    recoveryOptions,
  };
}

/**
 * Whether a step may be retried safely.
 * @param step - step to evaluate.
 * @param sourceChanged - whether the source has changed since the step ran.
 * @returns whether retry is safe.
 */
export function isSafeToRetry(step: TaskStep, sourceChanged: boolean): boolean {
  if (step.status !== 'failed' && step.status !== 'interrupted') return false;
  if (!step.idempotent) return false;
  if (sourceChanged) return false;
  return true;
}

/**
 * Determine the next step to resume from.
 * @param steps - recorded steps in order.
 * @returns the first non-completed step, or null when all completed.
 */
export function nextResumableStep(steps: readonly TaskStep[]): TaskStep | null {
  for (const step of steps) {
    if (step.status !== 'completed') return step;
  }
  return null;
}
