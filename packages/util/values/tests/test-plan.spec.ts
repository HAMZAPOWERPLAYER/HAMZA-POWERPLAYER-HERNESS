import { describe, expect, it } from 'vitest'
import {
  type AcceptanceState,
  type TestPlan,
  completionPercent,
  createTestPlan,
  isPlanComplete,
  recordCriterion,
  unverifiedCriteria,
} from '../src/test-plan.ts'

/** Build a plan whose criteria carry the given states in order. */
function planFromStates(states: readonly AcceptanceState[]): TestPlan {
  let plan = createTestPlan(
    'task-1',
    states.map((_, index) => ({ id: `c${index}`, description: `criterion ${index}` })),
  )
  states.forEach((state, index) => {
    plan = recordCriterion(plan, `c${index}`, state)
  })
  return plan
}

describe('createTestPlan', () => {
  it('starts every criterion pending and preserves its fields', () => {
    const plan = createTestPlan('task-9', [
      { id: 'a', description: 'alpha', evidenceCommand: 'pnpm test' },
      { id: 'b', description: 'beta' },
    ])
    expect(plan.taskId).toBe('task-9')
    expect(plan.criteria.length).toBe(2)
    expect(plan.criteria.map((criterion) => criterion.state)).toEqual(['pending', 'pending'])
    expect(plan.criteria[0]).toEqual({
      id: 'a',
      description: 'alpha',
      state: 'pending',
      evidenceCommand: 'pnpm test',
    })
    expect(plan.criteria[1]?.evidenceCommand).toBeUndefined()
  })

  it('creates a plan with no criteria', () => {
    const plan = createTestPlan('task-empty', [])
    expect(plan.criteria).toEqual([])
    expect(plan.criteria.length).toBe(0)
  })
})

describe('recordCriterion', () => {
  it('updates only the matching criterion', () => {
    const before = planFromStates(['pending', 'pending'])
    const after = recordCriterion(before, 'c1', 'passed')
    expect(after.criteria.map((criterion) => criterion.state)).toEqual(['pending', 'passed'])
    expect(after.taskId).toBe(before.taskId)
    expect(before.criteria.map((criterion) => criterion.state)).toEqual(['pending', 'pending'])
  })

  it('replaces an already recorded state', () => {
    const passed = recordCriterion(planFromStates(['pending']), 'c0', 'passed')
    const failed = recordCriterion(passed, 'c0', 'failed')
    expect(passed.criteria[0]?.state).toBe('passed')
    expect(failed.criteria[0]?.state).toBe('failed')
  })

  it('records skipped', () => {
    const plan = recordCriterion(planFromStates(['pending']), 'c0', 'skipped')
    expect(plan.criteria[0]?.state).toBe('skipped')
  })

  it('throws for an unknown id', () => {
    const plan = planFromStates(['pending', 'failed'])
    expect(() => recordCriterion(plan, 'missing', 'passed')).toThrow(/unknown criterion/)
  })
})

describe('isPlanComplete', () => {
  it('is false for a plan with no criteria', () => {
    expect(isPlanComplete(createTestPlan('task-empty', []))).toBe(false)
  })

  it('is false while any criterion is pending', () => {
    expect(isPlanComplete(planFromStates(['passed', 'pending']))).toBe(false)
  })

  it('is false when any criterion failed', () => {
    expect(isPlanComplete(planFromStates(['passed', 'skipped', 'failed']))).toBe(false)
  })

  it('is true when every criterion passed', () => {
    expect(isPlanComplete(planFromStates(['passed', 'passed']))).toBe(true)
  })

  it('is true when passed and skipped are mixed', () => {
    expect(isPlanComplete(planFromStates(['passed', 'skipped']))).toBe(true)
  })

  it('is true when every criterion was skipped', () => {
    expect(isPlanComplete(planFromStates(['skipped', 'skipped']))).toBe(true)
  })
})

describe('unverifiedCriteria', () => {
  it('returns pending and failed criteria in plan order', () => {
    const plan = planFromStates(['pending', 'passed', 'failed', 'skipped'])
    expect(unverifiedCriteria(plan)).toEqual([
      { id: 'c0', description: 'criterion 0', state: 'pending' },
      { id: 'c2', description: 'criterion 2', state: 'failed' },
    ])
  })

  it('is empty when nothing is pending or failed', () => {
    expect(unverifiedCriteria(planFromStates(['passed', 'skipped']))).toEqual([])
  })

  it('is empty for a plan with no criteria', () => {
    expect(unverifiedCriteria(createTestPlan('task-empty', []))).toEqual([])
  })
})

describe('completionPercent', () => {
  it('is 0 for a plan with no criteria', () => {
    expect(completionPercent(createTestPlan('task-empty', []))).toBe(0)
  })

  it('is 0 when no criterion passed', () => {
    expect(completionPercent(planFromStates(['pending', 'failed', 'skipped']))).toBe(0)
  })

  it('is 25 when one of four criteria passed', () => {
    expect(completionPercent(planFromStates(['passed', 'pending', 'failed', 'skipped']))).toBe(25)
  })

  it('does not count skipped as passed', () => {
    expect(completionPercent(planFromStates(['passed', 'skipped']))).toBe(50)
  })

  it('is 100 when every criterion passed', () => {
    expect(completionPercent(planFromStates(['passed', 'passed', 'passed']))).toBe(100)
  })
})
