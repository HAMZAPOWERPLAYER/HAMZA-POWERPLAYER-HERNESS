/**
 * Immutable progress tracking over a fixed list of labelled steps.
 *
 * Progress is represented as a value: every update returns a new `Progress`
 * with the targeted step replaced, so callers can compare snapshots and render
 * reports deterministically. This module owns only the step definitions,
 * transitions, derived counts, and text rendering; it performs no I/O, holds no
 * mutable state, and imports nothing.
 *
 * @module @deepseek-ai/dsh-util-values/progress-tracker
 */

/** The state a progress step can occupy. */
export type ProgressState = 'pending' | 'in-progress' | 'done' | 'failed'

/** One labelled step and its current state. */
export interface ProgressStep {
  /** Stable identifier, unique within a progress list. */
  readonly id: string
  /** Human-readable label rendered beside the step marker. */
  readonly label: string
  /** Current lifecycle state of the step. */
  readonly state: ProgressState
}

/** An ordered list of progress steps. */
export interface Progress {
  /** Steps in the order they were supplied. */
  readonly steps: readonly ProgressStep[]
}

/** Marker rendered for each state by {@link formatProgress}. */
const STATE_MARKERS: Readonly<Record<ProgressState, string>> = {
  pending: '[ ]',
  'in-progress': '[>]',
  done: '[x]',
  failed: '[!]',
}

/**
 * Create progress whose every step starts in the `pending` state.
 *
 * @param steps - step ids and labels, in display order.
 * @returns a new progress value with all steps pending.
 */
export function createProgress(steps: readonly { id: string; label: string }[]): Progress {
  return {
    steps: steps.map((step) => ({ id: step.id, label: step.label, state: 'pending' })),
  }
}

/**
 * Set the state of one step, returning a new progress value. The input progress
 * is left unchanged.
 *
 * @param progress - progress to update.
 * @param id - id of the step to update.
 * @param state - the new state for the step.
 * @returns a new progress value with the step updated.
 * @throws Error when no step carries `id`.
 */
export function updateStep(progress: Progress, id: string, state: ProgressState): Progress {
  const index = progress.steps.findIndex((step) => step.id === id)
  if (index === -1) {
    throw new Error(`unknown progress step: ${id}`)
  }
  return {
    steps: progress.steps.map((step, position) => (position === index ? { ...step, state } : step)),
  }
}

/**
 * Count the steps in each state, including states with zero steps.
 *
 * @param progress - progress to inspect.
 * @returns a count for every {@link ProgressState}; empty progress counts zero.
 */
export function progressCounts(progress: Progress): Readonly<Record<ProgressState, number>> {
  const counts: Record<ProgressState, number> = { pending: 0, 'in-progress': 0, done: 0, failed: 0 }
  for (const step of progress.steps) {
    counts[step.state] += 1
  }
  return counts
}

/**
 * Whether the progress is complete: it has at least one step and every step is
 * `done`. Empty progress, and any pending, in-progress, or failed step, is not
 * complete.
 *
 * @param progress - progress to inspect.
 * @returns `true` when at least one step exists and all steps are done.
 */
export function isProgressComplete(progress: Progress): boolean {
  if (progress.steps.length === 0) return false
  return progress.steps.every((step) => step.state === 'done')
}

/**
 * The step a caller should act on next: the first `in-progress` step when one
 * exists, otherwise the first `pending` step.
 *
 * @param progress - progress to inspect.
 * @returns the current step, or `undefined` when no step is in progress or pending.
 */
export function currentStep(progress: Progress): ProgressStep | undefined {
  return (
    progress.steps.find((step) => step.state === 'in-progress') ??
    progress.steps.find((step) => step.state === 'pending')
  )
}

/**
 * Render progress as one line per step, in step order: `[x] label` for done,
 * `[!] label` for failed, `[>] label` for in-progress, and `[ ] label` for
 * pending.
 *
 * @param progress - progress to render.
 * @returns the lines joined with `\n`, or `''` for empty progress.
 */
export function formatProgress(progress: Progress): string {
  return progress.steps.map((step) => `${STATE_MARKERS[step.state]} ${step.label}`).join('\n')
}
