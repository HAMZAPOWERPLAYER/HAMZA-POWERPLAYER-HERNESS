/**
 * Acceptance-criteria test plan primitives.
 *
 * A test plan records the criteria a task must satisfy and the verification
 * state of each one, so completion is judged against explicit criteria instead
 * of a narrative summary. Every operation is pure and returns a new plan; this
 * module holds no state and performs no I/O.
 *
 * @module @deepseek-ai/dsh-util-values/test-plan
 */

/** Verification state of a single acceptance criterion. */
export type AcceptanceState = 'pending' | 'passed' | 'failed' | 'skipped'

/** One acceptance criterion and its current verification state. */
export interface AcceptanceCriterion {
  /** Stable identifier, unique within a plan. */
  readonly id: string
  /** What must hold for this criterion to be satisfied. */
  readonly description: string
  /** Current verification state. */
  readonly state: AcceptanceState
  /** Optional command that verifies the criterion when executed. */
  readonly evidenceCommand?: string
}

/** A task's acceptance criteria and their verification states. */
export interface TestPlan {
  /** Task the plan belongs to. */
  readonly taskId: string
  /** Acceptance criteria in the order they were supplied. */
  readonly criteria: readonly AcceptanceCriterion[]
}

/**
 * Create a plan whose every criterion starts in the `pending` state.
 *
 * @param taskId - task the plan belongs to.
 * @param criteria - acceptance criteria without a state.
 * @returns a new plan with all criteria pending.
 */
export function createTestPlan(
  taskId: string,
  criteria: readonly Omit<AcceptanceCriterion, 'state'>[],
): TestPlan {
  return {
    taskId,
    criteria: criteria.map((criterion) => ({
      id: criterion.id,
      description: criterion.description,
      state: 'pending',
      ...(criterion.evidenceCommand !== undefined
        ? { evidenceCommand: criterion.evidenceCommand }
        : {}),
    })),
  }
}

/**
 * Record the verification state of one criterion, returning a new plan. The
 * input plan is left unchanged.
 *
 * @param plan - plan to update.
 * @param id - id of the criterion to update.
 * @param state - the recorded verification state.
 * @returns a new plan with the criterion updated.
 * @throws Error when no criterion carries `id`.
 */
export function recordCriterion(plan: TestPlan, id: string, state: AcceptanceState): TestPlan {
  const index = plan.criteria.findIndex((criterion) => criterion.id === id)
  if (index === -1) {
    throw new Error(`unknown criterion: ${id}`)
  }
  return {
    taskId: plan.taskId,
    criteria: plan.criteria.map((criterion, position) =>
      position === index ? { ...criterion, state } : criterion,
    ),
  }
}

/**
 * Whether a plan is complete: at least one criterion exists and none is
 * pending or failed.
 *
 * @param plan - plan to inspect.
 * @returns `true` when every criterion is passed or skipped.
 */
export function isPlanComplete(plan: TestPlan): boolean {
  if (plan.criteria.length === 0) return false
  return plan.criteria.every(
    (criterion) => criterion.state === 'passed' || criterion.state === 'skipped',
  )
}

/**
 * The criteria that still need work: pending or failed ones.
 *
 * @param plan - plan to inspect.
 * @returns the unverified criteria, in plan order.
 */
export function unverifiedCriteria(plan: TestPlan): readonly AcceptanceCriterion[] {
  return plan.criteria.filter(
    (criterion) => criterion.state === 'pending' || criterion.state === 'failed',
  )
}

/**
 * Share of criteria that passed, as a percentage. Skipped criteria count
 * toward the total but never toward the passed number.
 *
 * @param plan - plan to inspect.
 * @returns passed divided by total times 100, or `0` when the plan has no criteria.
 */
export function completionPercent(plan: TestPlan): number {
  if (plan.criteria.length === 0) return 0
  const passed = plan.criteria.filter((criterion) => criterion.state === 'passed').length
  return (passed / plan.criteria.length) * 100
}
