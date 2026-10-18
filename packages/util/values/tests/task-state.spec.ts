import { describe, expect, it } from 'vitest'
import {
  canTransitionTaskState,
  createTaskRecord,
  isTerminalTaskState,
  TASK_STATE_TRANSITIONS,
  TERMINAL_TASK_STATES,
  transitionTaskState,
} from '../src/index.ts'

describe('isTerminalTaskState', () => {
  it('true for terminal states', () => {
    for (const s of ['completed', 'cancelled', 'failed'] as const) {
      expect(isTerminalTaskState(s)).toBe(true)
    }
  })
  it('false otherwise', () => {
    expect(isTerminalTaskState('running')).toBe(false)
    expect(isTerminalTaskState('queued')).toBe(false)
  })
})

describe('canTransitionTaskState', () => {
  it('allows queued -> planning', () => {
    expect(canTransitionTaskState('queued', 'planning')).toBe(true)
  })
  it('disallows completed -> running', () => {
    expect(canTransitionTaskState('completed', 'running')).toBe(false)
  })
  it('disallows same-state self-transition unless listed', () => {
    expect(canTransitionTaskState('running', 'running')).toBe(false)
  })
})

describe('transitionTaskState', () => {
  it('produces a new record in the target state', () => {
    const r0 = createTaskRecord('t1', 1000)
    const r1 = transitionTaskState(r0, 'planning', 'start', 2000)
    expect(r1.state).toBe('planning')
    expect(r1.id).toBe('t1')
    expect(r1.createdAt).toBe(1000)
    expect(r1.updatedAt).toBe(2000)
    expect(r1.note).toBe('start')
    expect(r0.state).toBe('queued')
  })
  it('throws on disallowed transition', () => {
    const r0 = createTaskRecord('t2', 1000)
    expect(() => transitionTaskState(r0, 'completed')).toThrow(/invalid task transition/)
  })
  it('omits note when not provided', () => {
    const r0 = createTaskRecord('t3', 1000)
    const r1 = transitionTaskState(r0, 'planning', undefined, 2000)
    expect(r1.note).toBeUndefined()
  })
  it('covers every allowed transition', () => {
    for (const from of Object.keys(TASK_STATE_TRANSITIONS) as (keyof typeof TASK_STATE_TRANSITIONS)[]) {
      for (const to of TASK_STATE_TRANSITIONS[from]) {
        expect(canTransitionTaskState(from, to)).toBe(true)
      }
    }
  })
  it('covers terminal states list', () => {
    expect(TERMINAL_TASK_STATES.length).toBe(3)
  })
})
