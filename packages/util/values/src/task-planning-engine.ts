/**
 * Hierarchical task planning engine for agent execution.
 *
 * A task plan decomposes an objective into dependency-ordered tasks, tracks
 * each task's lifecycle state separately, and reports completion only when
 * every task is verified—not merely implemented. All operations are pure:
 * they derive new plans from existing ones, hold no state, and perform no
 * I/O. Callers own persisting plans and applying transitions.
 *
 * @module @deepseek-ai/dsh-util-values/task-planning-engine
 */

import { type TaskState, canTransitionTaskState } from './task-state.ts'

/** One dependency in a task plan. */
export interface TaskDependency {
  /** Stable identifier of the task this task depends on. */
  readonly dependsOn: string
  /** Whether the dependency must be verified (not just implemented). */
  readonly requireVerified: boolean
}

/** One task in a hierarchical plan. */
export interface TaskPlanTask {
  /** Stable task identifier, unique within the plan. */
  readonly id: string
  /** Human-readable description of what the task accomplishes. */
  readonly description: string
  /** Requirements this task must satisfy. */
  readonly requirements: readonly string[]
  /** Constraints this task operates under. */
  readonly constraints: readonly string[]
  /** Tasks this task depends on, in declaration order. */
  readonly dependencies: readonly TaskDependency[]
  /** Tools this task requires. */
  readonly tools: readonly string[]
  /** Acceptance criteria this task must meet. */
  readonly acceptanceCriteria: readonly string[]
  /** Verification commands that establish the criteria. */
  readonly verificationCommands: readonly string[]
  /** Expected outputs this task produces. */
  readonly expectedOutputs: readonly string[]
  /** Risks this task carries. */
  readonly risks: readonly string[]
  /** Current lifecycle state. */
  readonly state: TaskState
  /** Completion state: not started, in progress, blocked, awaiting approval,
   *  implemented, verification pending, verified, failed, cancelled. */
  readonly completionState: CompletionState
  /** Optional note recorded at the last transition. */
  readonly note?: string
}

/** Completion state of a task, distinct from lifecycle state. */
export type CompletionState =
  | 'not-started'
  | 'in-progress'
  | 'blocked'
  | 'awaiting-approval'
  | 'implemented'
  | 'verification-pending'
  | 'verified'
  | 'failed'
  | 'cancelled'

/** A hierarchical task plan with objectives, dependencies, and progress. */
export interface TaskPlan {
  /** Stable plan identifier. */
  readonly id: string
  /** Objective the plan pursues. */
  readonly objective: string
  /** Tasks in declaration order. */
  readonly tasks: readonly TaskPlanTask[]
  /** Tasks whose dependencies are all satisfied and which may start. */
  readonly readyTaskIds: readonly string[]
  /** Tasks blocked on unsatisfied dependencies. */
  readonly blockedTaskIds: readonly string[]
  /** Number of tasks in each completion state, keyed by state. */
  readonly completionCounts: Readonly<Record<CompletionState, number>>
  /** Whether every task is verified. */
  readonly verified: boolean
}

/** Create a new task plan with all tasks in `not-started` state.
 * @param params - plan parameters.
 * @returns the new task plan.
 */
export function createTaskPlan(params: {
  /** Stable plan identifier. */
  readonly id: string
  /** Objective the plan pursues. */
  readonly objective: string
  /** Tasks to include, in declaration order. */
  readonly tasks: readonly Omit<TaskPlanTask, 'state' | 'completionState' | 'note'>[]
}): TaskPlan {
  const tasks: TaskPlanTask[] = params.tasks.map((task) => ({
    id: task.id,
    description: task.description,
    requirements: task.requirements,
    constraints: task.constraints,
    dependencies: task.dependencies,
    tools: task.tools,
    acceptanceCriteria: task.acceptanceCriteria,
    verificationCommands: task.verificationCommands,
    expectedOutputs: task.expectedOutputs,
    risks: task.risks,
    state: 'queued',
    completionState: 'not-started',
  }))
  const ready = computeReadyTaskIds(tasks)
  const blocked = computeBlockedTaskIds(tasks, ready)
  const counts = computeCompletionCounts(tasks)
  return {
    id: params.id,
    objective: params.objective,
    tasks,
    readyTaskIds: ready,
    blockedTaskIds: blocked,
    completionCounts: counts,
    verified: counts.verified === tasks.length && tasks.length > 0,
  }
}

/** Transition one task's completion state, returning a new plan.
 * @param plan - current plan.
 * @param taskId - id of the task to transition.
 * @param completionState - new completion state.
 * @param note - optional note about the transition.
 * @returns a new plan with the task transitioned.
 * @throws Error when no task carries `taskId`.
 */
export function transitionTaskCompletion(
  plan: TaskPlan,
  taskId: string,
  completionState: CompletionState,
  note?: string,
): TaskPlan {
  const index = plan.tasks.findIndex((task) => task.id === taskId)
  if (index === -1) {
    throw new Error(`unknown task: ${taskId}`)
  }
  const task = plan.tasks[index]!
  const updated: TaskPlanTask = {
    id: task.id,
    description: task.description,
    requirements: task.requirements,
    constraints: task.constraints,
    dependencies: task.dependencies,
    tools: task.tools,
    acceptanceCriteria: task.acceptanceCriteria,
    verificationCommands: task.verificationCommands,
    expectedOutputs: task.expectedOutputs,
    risks: task.risks,
    state: task.state,
    completionState,
    ...(note !== undefined ? { note } : {}),
  }
  const updatedTasks = [...plan.tasks]
  updatedTasks[index] = updated
  const ready = computeReadyTaskIds(updatedTasks)
  const blocked = computeBlockedTaskIds(updatedTasks, ready)
  const counts = computeCompletionCounts(updatedTasks)
  return {
    id: plan.id,
    objective: plan.objective,
    tasks: updatedTasks,
    readyTaskIds: ready,
    blockedTaskIds: blocked,
    completionCounts: counts,
    verified: counts.verified === updatedTasks.length && updatedTasks.length > 0,
  }
}

/** Transition one task's lifecycle state, returning a new plan.
 * @param plan - current plan.
 * @param taskId - id of the task to transition.
 * @param to - target lifecycle state.
 * @param note - optional note about the transition.
 * @returns a new plan with the task transitioned.
 * @throws Error when no task carries `taskId` or the transition is disallowed.
 */
export function transitionTaskLifecycle(
  plan: TaskPlan,
  taskId: string,
  to: TaskState,
  note?: string,
): TaskPlan {
  const index = plan.tasks.findIndex((task) => task.id === taskId)
  if (index === -1) {
    throw new Error(`unknown task: ${taskId}`)
  }
  const task = plan.tasks[index]!
  if (!canTransitionTaskState(task.state, to)) {
    throw new Error(`invalid task transition: ${task.state} -> ${to}`)
  }
  const updated: TaskPlanTask = {
    id: task.id,
    description: task.description,
    requirements: task.requirements,
    constraints: task.constraints,
    dependencies: task.dependencies,
    tools: task.tools,
    acceptanceCriteria: task.acceptanceCriteria,
    verificationCommands: task.verificationCommands,
    expectedOutputs: task.expectedOutputs,
    risks: task.risks,
    state: to,
    completionState: task.completionState,
    ...(note !== undefined ? { note } : {}),
  }
  const updatedTasks = [...plan.tasks]
  updatedTasks[index] = updated
  const ready = computeReadyTaskIds(updatedTasks)
  const blocked = computeBlockedTaskIds(updatedTasks, ready)
  const counts = computeCompletionCounts(updatedTasks)
  return {
    id: plan.id,
    objective: plan.objective,
    tasks: updatedTasks,
    readyTaskIds: ready,
    blockedTaskIds: blocked,
    completionCounts: counts,
    verified: counts.verified === updatedTasks.length && updatedTasks.length > 0,
  }
}

/** Revise a plan's objective or replace its task list.
 *
 * Preserves existing task states where task IDs match the new list; newly
 * added tasks start at `queued`/`not-started`. Tasks removed from the new
 * list are dropped. Completion flags are recomputed.
 *
 * @param plan - current plan.
 * @param params - revision parameters.
 * @returns the revised plan.
 */
export function reviseTaskPlan(
  plan: TaskPlan,
  params: {
    /** New objective, or the existing objective when omitted. */
    readonly objective?: string
    /** New task list, or the existing tasks when omitted. */
    readonly tasks?: readonly Omit<TaskPlanTask, 'state' | 'completionState' | 'note'>[]
  },
): TaskPlan {
  const objective = params.objective ?? plan.objective
  const incomingTasks = params.tasks ?? plan.tasks.map((task) => ({
    id: task.id,
    description: task.description,
    requirements: task.requirements,
    constraints: task.constraints,
    dependencies: task.dependencies,
    tools: task.tools,
    acceptanceCriteria: task.acceptanceCriteria,
    verificationCommands: task.verificationCommands,
    expectedOutputs: task.expectedOutputs,
    risks: task.risks,
  }))
  const existingById = new Map(plan.tasks.map((task) => [task.id, task]))
  const tasks: TaskPlanTask[] = incomingTasks.map((task) => {
    const existing = existingById.get(task.id)
    if (existing === undefined) {
      return {
        id: task.id,
        description: task.description,
        requirements: task.requirements ?? [],
        constraints: task.constraints ?? [],
        dependencies: task.dependencies ?? [],
        tools: task.tools ?? [],
        acceptanceCriteria: task.acceptanceCriteria ?? [],
        verificationCommands: task.verificationCommands ?? [],
        expectedOutputs: task.expectedOutputs ?? [],
        risks: task.risks ?? [],
        state: 'queued',
        completionState: 'not-started',
      }
    }
    return {
      id: existing.id,
      description: task.description,
      requirements: task.requirements ?? existing.requirements,
      constraints: task.constraints ?? existing.constraints,
      dependencies: task.dependencies ?? existing.dependencies,
      tools: task.tools ?? existing.tools,
      acceptanceCriteria: task.acceptanceCriteria ?? existing.acceptanceCriteria,
      verificationCommands: task.verificationCommands ?? existing.verificationCommands,
      expectedOutputs: task.expectedOutputs ?? existing.expectedOutputs,
      risks: task.risks ?? existing.risks,
      state: existing.state,
      completionState: existing.completionState,
      ...(existing.note !== undefined ? { note: existing.note } : {}),
    }
  })
  const ready = computeReadyTaskIds(tasks)
  const blocked = computeBlockedTaskIds(tasks, ready)
  const counts = computeCompletionCounts(tasks)
  return {
    id: plan.id,
    objective,
    tasks,
    readyTaskIds: ready,
    blockedTaskIds: blocked,
    completionCounts: counts,
    verified: counts.verified === tasks.length && tasks.length > 0,
  }
}

/** Get one task by identifier.
 * @param plan - plan to search.
 * @param taskId - task identifier.
 * @returns the task, or `undefined` when not found.
 */
export function getTask(plan: TaskPlan, taskId: string): TaskPlanTask | undefined {
  return plan.tasks.find((task) => task.id === taskId)
}

/** Tasks that are ready to start (dependencies satisfied, not started).
 * @param plan - plan to inspect.
 * @returns ready tasks.
 */
export function getReadyTasks(plan: TaskPlan): readonly TaskPlanTask[] {
  return plan.tasks.filter((task) => plan.readyTaskIds.includes(task.id))
}

/** Tasks that are blocked on unsatisfied dependencies.
 * @param plan - plan to inspect.
 * @returns blocked tasks.
 */
export function getBlockedTasks(plan: TaskPlan): readonly TaskPlanTask[] {
  return plan.tasks.filter((task) => plan.blockedTaskIds.includes(task.id))
}

/** Tasks that are implemented but not yet verified.
 * @param plan - plan to inspect.
 * @returns verification-pending tasks.
 */
export function getVerificationPendingTasks(plan: TaskPlan): readonly TaskPlanTask[] {
  return plan.tasks.filter((task) => task.completionState === 'verification-pending')
}

/** Compute the set of task IDs whose dependencies are all satisfied. */
function computeReadyTaskIds(tasks: readonly TaskPlanTask[]): readonly string[] {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const done = new Set<string>()
  for (const task of tasks) {
    if (task.completionState === 'verified' || task.completionState === 'implemented') {
      done.add(task.id)
    }
  }
  const ready: string[] = []
  for (const task of tasks) {
    if (task.completionState !== 'not-started') continue
    const allDepsSatisfied = task.dependencies.every((dep) => {
      const depTask = byId.get(dep.dependsOn)
      if (depTask === undefined) return false
      if (dep.requireVerified) return depTask.completionState === 'verified'
      return depTask.completionState === 'verified' || depTask.completionState === 'implemented'
    })
    if (allDepsSatisfied) ready.push(task.id)
  }
  return ready
}

/** Compute the set of task IDs blocked on unsatisfied dependencies. */
function computeBlockedTaskIds(
  tasks: readonly TaskPlanTask[],
  readyIds: readonly string[],
): readonly string[] {
  const ready = new Set(readyIds)
  const blocked: string[] = []
  for (const task of tasks) {
    if (task.completionState !== 'not-started') continue
    if (ready.has(task.id)) continue
    blocked.push(task.id)
  }
  return blocked
}

/** Count tasks in each completion state. */
function computeCompletionCounts(tasks: readonly TaskPlanTask[]): Readonly<Record<CompletionState, number>> {
  const counts: Record<CompletionState, number> = {
    'not-started': 0,
    'in-progress': 0,
    blocked: 0,
    'awaiting-approval': 0,
    implemented: 0,
    'verification-pending': 0,
    verified: 0,
    failed: 0,
    cancelled: 0,
  }
  for (const task of tasks) {
    counts[task.completionState] += 1
  }
  return counts
}
