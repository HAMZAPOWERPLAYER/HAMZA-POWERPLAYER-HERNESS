/**
 * Explicit agent-loop state machine.
 *
 * Represents the execution states of a controlled agent loop and the legal
 * transitions between them. This module owns only state definitions and
 * transition rules; it performs no I/O and holds no mutable state.
 *
 * @module @deepseek-ai/dsh-util-values/agent-loop-state
 */

/** The states an agent loop can occupy. */
export type AgentLoopState =
  | 'initializing'
  | 'understanding'
  | 'planning'
  | 'gathering-context'
  | 'awaiting-model-response'
  | 'validating-tool-call'
  | 'awaiting-approval'
  | 'executing-tool'
  | 'evaluating-result'
  | 'verifying'
  | 'recovering'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** Terminal states from which no further transitions are allowed. */
export const TERMINAL_AGENT_LOOP_STATES: readonly AgentLoopState[] = [
  'completed',
  'failed',
  'cancelled',
];

/**
 * Whether a state is terminal.
 * @param state - agent loop state to test.
 * @returns whether no transition is allowed out of the state.
 */
export function isTerminalAgentLoopState(state: AgentLoopState): boolean {
  return TERMINAL_AGENT_LOOP_STATES.includes(state);
}

/**
 * Allowed transitions between agent-loop states. A transition not present here
 * is disallowed, including any transition out of a terminal state.
 */
export const AGENT_LOOP_TRANSITIONS: Readonly<Record<AgentLoopState, readonly AgentLoopState[]>> = {
  initializing: ['understanding', 'failed', 'cancelled'],
  understanding: ['planning', 'gathering-context', 'failed', 'cancelled'],
  planning: ['gathering-context', 'awaiting-model-response', 'failed', 'cancelled'],
  'gathering-context': ['awaiting-model-response', 'failed', 'cancelled'],
  'awaiting-model-response': [
    'validating-tool-call',
    'verifying',
    'completed',
    'recovering',
    'failed',
    'cancelled',
  ],
  'validating-tool-call': [
    'awaiting-approval',
    'executing-tool',
    'evaluating-result',
    'failed',
    'cancelled',
  ],
  'awaiting-approval': ['executing-tool', 'evaluating-result', 'cancelled', 'failed'],
  'executing-tool': ['evaluating-result', 'recovering', 'failed', 'cancelled'],
  'evaluating-result': [
    'verifying',
    'gathering-context',
    'awaiting-model-response',
    'recovering',
    'completed',
    'failed',
    'cancelled',
  ],
  verifying: ['completed', 'recovering', 'failed', 'cancelled'],
  recovering: ['gathering-context', 'awaiting-model-response', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
};

/**
 * Whether transitioning from `from` to `to` is allowed.
 * @param from - current state.
 * @param to - proposed next state.
 * @returns whether the transition is allowed.
 */
export function canTransitionAgentLoop(from: AgentLoopState, to: AgentLoopState): boolean {
  return AGENT_LOOP_TRANSITIONS[from].includes(to);
}

/**
 * Attempt a transition and return the next state when allowed, or `null` when
 * the transition is disallowed (including any transition from a terminal state).
 * @param from - current state.
 * @param to - proposed next state.
 * @returns the next state when allowed, otherwise `null`.
 */
export function transitionAgentLoop(
  from: AgentLoopState,
  to: AgentLoopState,
): AgentLoopState | null {
  return canTransitionAgentLoop(from, to) ? to : null;
}

/**
 * The initial state of a new agent loop.
 */
export const INITIAL_AGENT_LOOP_STATE: AgentLoopState = 'initializing';
