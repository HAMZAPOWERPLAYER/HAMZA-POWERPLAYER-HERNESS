import { describe, expect, it } from 'vitest'
import {
  AGENT_LOOP_TRANSITIONS,
  INITIAL_AGENT_LOOP_STATE,
  TERMINAL_AGENT_LOOP_STATES,
  canTransitionAgentLoop,
  isTerminalAgentLoopState,
  transitionAgentLoop,
  type AgentLoopState,
} from '../src/agent-loop-state.ts'

describe('TERMINAL_AGENT_LOOP_STATES', () => {
  it('contains terminal states', () => {
    expect(TERMINAL_AGENT_LOOP_STATES).toEqual(['completed', 'failed', 'cancelled'])
  })
})

describe('INITIAL_AGENT_LOOP_STATE', () => {
  it('is initializing', () => {
    expect(INITIAL_AGENT_LOOP_STATE).toBe('initializing')
  })
})

describe('isTerminalAgentLoopState', () => {
  it.each([['completed'], ['failed'], ['cancelled']])('reports %s as terminal', (state) => {
    expect(isTerminalAgentLoopState(state as AgentLoopState)).toBe(true)
  })

  it.each([['initializing'], ['planning'], ['executing-tool'], ['verifying']])('reports %s as non-terminal', (state) => {
    expect(isTerminalAgentLoopState(state as AgentLoopState)).toBe(false)
  })
})

describe('canTransitionAgentLoop', () => {
  it('allows initializing -> understanding', () => {
    expect(canTransitionAgentLoop('initializing', 'understanding')).toBe(true)
  })

  it('disallows transitions out of terminal states', () => {
    expect(canTransitionAgentLoop('completed', 'planning')).toBe(false)
    expect(canTransitionAgentLoop('failed', 'running')).toBe(false)
    expect(canTransitionAgentLoop('cancelled', 'understanding')).toBe(false)
  })

  it('disallows unknown transitions', () => {
    expect(canTransitionAgentLoop('initializing', 'executing-tool')).toBe(false)
    expect(canTransitionAgentLoop('executing-tool', 'initializing')).toBe(false)
  })

  it('allows executing-tool -> evaluating-result', () => {
    expect(canTransitionAgentLoop('executing-tool', 'evaluating-result')).toBe(true)
  })

  it('allows recovering -> awaiting-model-response', () => {
    expect(canTransitionAgentLoop('recovering', 'awaiting-model-response')).toBe(true)
  })
})

describe('transitionAgentLoop', () => {
  it('returns the target state when allowed', () => {
    expect(transitionAgentLoop('planning', 'gathering-context')).toBe('gathering-context')
  })

  it('returns null when disallowed', () => {
    expect(transitionAgentLoop('completed', 'planning')).toBeNull()
  })

  it('returns null from terminal states', () => {
    expect(transitionAgentLoop('failed', 'running')).toBeNull()
  })
})

describe('AGENT_LOOP_TRANSITIONS completeness', () => {
  it('every listed target is a valid state', () => {
    const states = new Set<AgentLoopState>([
      'initializing',
      'understanding',
      'planning',
      'gathering-context',
      'awaiting-model-response',
      'validating-tool-call',
      'awaiting-approval',
      'executing-tool',
      'evaluating-result',
      'verifying',
      'recovering',
      'completed',
      'failed',
      'cancelled',
    ])
    for (const [from, targets] of Object.entries(AGENT_LOOP_TRANSITIONS)) {
      for (const to of targets) {
        expect(states.has(from as AgentLoopState)).toBe(true)
        expect(states.has(to)).toBe(true)
      }
    }
  })
})
