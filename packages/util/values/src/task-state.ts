/**
 * Explicit task-state machine for agent execution.
 *
 * Execution is represented as explicit states rather than conversational
 * history, so callers can reason about progress, approval, verification, and
 * failure deterministically. This module owns only the state definitions and
 * transition rules; it performs no I/O and holds no mutable state.
 *
 * @module @deepseek-ai/dsh-util-values/task-state
 */

/** The lifecycle states an agent task can occupy.
 *
 * `completed` records that the run ended; it does not by itself prove the
 * work is verified. Verification evidence is owned by the completion report,
 * so a task may be `completed` while that report is not verified.
 */
export type TaskState =
  | 'queued'
  | 'planning'
  | 'running'
  | 'waiting-approval'
  | 'verifying'
  | 'recoverable-failure'
  | 'completed'
  | 'cancelled'
  | 'failed'

/** Terminal states from which no further transitions are allowed. */
export const TERMINAL_TASK_STATES: readonly TaskState[] = ['completed', 'cancelled', 'failed']

/**
 * Whether a state is terminal.
 * @param state - task state to test.
 * @returns whether no transition is allowed out of the state.
 */
export function isTerminalTaskState(state: TaskState): boolean {
  return TERMINAL_TASK_STATES.includes(state)
}

/**
 * Allowed transitions between task states. A transition not present here is
 * disallowed, including any transition out of a terminal state.
 */
export const TASK_STATE_TRANSITIONS: Readonly<Record<TaskState, readonly TaskState[]>> = {
  queued: ['planning', 'cancelled', 'failed'],
  planning: ['running', 'cancelled', 'failed'],
  running: ['waiting-approval', 'verifying', 'recoverable-failure', 'completed', 'cancelled', 'failed'],
  'waiting-approval': ['running', 'cancelled', 'failed'],
  verifying: ['completed', 'recoverable-failure', 'failed'],
  'recoverable-failure': ['running', 'cancelled', 'failed'],
  completed: [],
  cancelled: [],
  failed: [],
}

/**
 * Whether transitioning from `from` to `to` is allowed.
 * @param from - current state.
 * @param to - proposed next state.
 * @returns `true` when the transition is allowed.
 */
export function canTransitionTaskState(from: TaskState, to: TaskState): boolean {
  return TASK_STATE_TRANSITIONS[from].includes(to)
}

/**
 * A structured task record. Immutable: transitions produce a new record.
 */
export interface TaskRecord {
  /** Stable task identifier. */
  readonly id: string
  /** Current lifecycle state. */
  readonly state: TaskState
  /** Epoch milliseconds when the task was created. */
  readonly createdAt: number
  /** Epoch milliseconds of the last state change. */
  readonly updatedAt: number
  /** Optional human-readable summary of the last transition. */
  readonly note?: string
}

/**
 * Create a new task record in the `queued` state.
 * @param id - stable task identifier.
 * @param now - optional epoch milliseconds; defaults to `Date.now()`.
 * @returns a new queued task record.
 */
export function createTaskRecord(id: string, now: number = Date.now()): TaskRecord {
  return { id, state: 'queued', createdAt: now, updatedAt: now }
}

/**
 * Transition a task record to a new state, returning a new record. Throws when
 * the transition is not allowed, so callers cannot silently skip states.
 *
 * @param record - current task record.
 * @param to - target state.
 * @param note - optional summary of why the transition happened.
 * @param now - optional epoch milliseconds; defaults to `Date.now()`.
 * @returns a new task record in the target state.
 * @throws Error when the transition is disallowed.
 */
export function transitionTaskState(
  record: TaskRecord,
  to: TaskState,
  note?: string,
  now: number = Date.now(),
): TaskRecord {
  if (!canTransitionTaskState(record.state, to)) {
    throw new Error(`invalid task transition: ${record.state} -> ${to}`)
  }
  return {
    id: record.id,
    state: to,
    createdAt: record.createdAt,
    updatedAt: now,
    ...(note !== undefined ? { note } : {}),
  }
}
