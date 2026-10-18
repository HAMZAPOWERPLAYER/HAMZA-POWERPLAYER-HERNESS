import { describe, expect, it } from 'vitest'
import {
  createTaskPlan,
  getBlockedTasks,
  getReadyTasks,
  getTask,
  getVerificationPendingTasks,
  reviseTaskPlan,
  transitionTaskCompletion,
  transitionTaskLifecycle,
  type CompletionState,
  type TaskPlanTask,
} from '../src/task-planning-engine.ts'

function task(params: {
  id: string
  description?: string
  dependencies?: readonly { readonly dependsOn: string; readonly requireVerified?: boolean }[]
  completionState?: CompletionState
}): TaskPlanTask {
  return {
    id: params.id,
    description: params.description ?? `task ${params.id}`,
    requirements: [],
    constraints: [],
    dependencies: params.dependencies ?? [],
    tools: [],
    acceptanceCriteria: [],
    verificationCommands: [],
    expectedOutputs: [],
    risks: [],
    state: 'queued',
    completionState: params.completionState ?? 'not-started',
  }
}

describe('createTaskPlan', () => {
  it('creates a plan with all tasks not-started and ready tasks computed', () => {
    const plan = createTaskPlan({
      id: 'plan-1',
      objective: 'build feature',
      tasks: [
        task({ id: 'a' }),
        task({ id: 'b', dependencies: [{ dependsOn: 'a' }] }),
      ],
    })
    expect(plan.id).toBe('plan-1')
    expect(plan.objective).toBe('build feature')
    expect(plan.tasks).toHaveLength(2)
    expect(plan.readyTaskIds).toEqual(['a'])
    expect(plan.blockedTaskIds).toEqual(['b'])
    expect(plan.completionCounts['not-started']).toBe(2)
    expect(plan.verified).toBe(false)
  })

  it('marks a plan verified when every task is verified', () => {
    const plan = createTaskPlan({
      id: 'plan-1',
      objective: 'build feature',
      tasks: [task({ id: 'a' })],
    })
    const updated = transitionTaskCompletion(plan, 'a', 'verified')
    expect(updated.verified).toBe(true)
  })

  it('reports a plan with no tasks as not verified', () => {
    const plan = createTaskPlan({ id: 'plan-1', objective: 'empty', tasks: [] })
    expect(plan.verified).toBe(false)
    expect(plan.readyTaskIds).toEqual([])
    expect(plan.blockedTaskIds).toEqual([])
  })

  it('orders ready tasks by declaration order', () => {
    const plan = createTaskPlan({
      id: 'plan-1',
      objective: 'order',
      tasks: [
        task({ id: 'c' }),
        task({ id: 'a' }),
        task({ id: 'b', dependencies: [{ dependsOn: 'a' }] }),
      ],
    })
    expect(plan.readyTaskIds).toEqual(['c', 'a'])
  })
})

describe('transitionTaskCompletion', () => {
  it('transitions one task and recomputes readiness', () => {
    const plan = createTaskPlan({
      id: 'plan-1',
      objective: 'chain',
      tasks: [task({ id: 'a' }), task({ id: 'b', dependencies: [{ dependsOn: 'a' }] })],
    })
    const updated = transitionTaskCompletion(plan, 'a', 'implemented')
    expect(updated.tasks.find((t) => t.id === 'a')!.completionState).toBe('implemented')
    expect(updated.readyTaskIds).toEqual(['b'])
    expect(updated.blockedTaskIds).toEqual([])
  })

  it('throws on unknown task id', () => {
    const plan = createTaskPlan({
      id: 'plan-1',
      objective: 'x',
      tasks: [task({ id: 'a' })],
    })
    expect(() => transitionTaskCompletion(plan, 'missing', 'implemented')).toThrow(
      'unknown task: missing',
    )
  })

  it('leaves the input plan unchanged', () => {
    const plan = createTaskPlan({
      id: 'plan-1',
      objective: 'x',
      tasks: [task({ id: 'a' })],
    })
    transitionTaskCompletion(plan, 'a', 'implemented')
    expect(plan.tasks[0].completionState).toBe('not-started')
  })

  it('records an optional note', () => {
    const plan = createTaskPlan({
      id: 'plan-1',
      objective: 'x',
      tasks: [task({ id: 'a' })],
    })
    const updated = transitionTaskCompletion(plan, 'a', 'verification-pending', 'awaiting ci')
    expect(updated.tasks.find((t) => t.id === 'a')!.note).toBe('awaiting ci')
  })
})

describe('transitionTaskLifecycle', () => {
  it('transitions one task lifecycle state', () => {
    const plan = createTaskPlan({
      id: 'plan-1',
      objective: 'x',
      tasks: [task({ id: 'a' })],
    })
    const updated = transitionTaskLifecycle(plan, 'a', 'planning')
    expect(updated.tasks.find((t) => t.id === 'a')!.state).toBe('planning')
  })

  it('throws on disallowed transition', () => {
    const plan = createTaskPlan({
      id: 'plan-1',
      objective: 'x',
      tasks: [task({ id: 'a' })],
    })
    expect(() => transitionTaskLifecycle(plan, 'a', 'completed')).toThrow(
      'invalid task transition: queued -> completed',
    )
  })

  it('throws on unknown task id', () => {
    const plan = createTaskPlan({
      id: 'plan-1',
      objective: 'x',
      tasks: [task({ id: 'a' })],
    })
    expect(() => transitionTaskLifecycle(plan, 'missing', 'running')).toThrow(
      'unknown task: missing',
    )
  })
})

describe('reviseTaskPlan', () => {
  it('replaces the task list while preserving existing task states', () => {
    const plan = createTaskPlan({
      id: 'plan-1',
      objective: 'old',
      tasks: [task({ id: 'a' })],
    })
    const implemented = transitionTaskCompletion(plan, 'a', 'implemented')
    const updated = reviseTaskPlan(implemented, {
      objective: 'new',
      tasks: [
        { id: 'a', description: 'updated a' },
        { id: 'b', description: 'new task b' },
      ],
    })
    expect(updated.objective).toBe('new')
    expect(updated.tasks).toHaveLength(2)
    expect(updated.tasks.find((t) => t.id === 'a')!.state).toBe('queued')
    expect(updated.tasks.find((t) => t.id === 'a')!.completionState).toBe('implemented')
    expect(updated.tasks.find((t) => t.id === 'b')!.completionState).toBe('not-started')
  })

  it('keeps the existing objective when none is supplied', () => {
    const plan = createTaskPlan({
      id: 'plan-1',
      objective: 'keep',
      tasks: [task({ id: 'a' })],
    })
    const updated = reviseTaskPlan(plan, { tasks: [{ id: 'a', description: 'same' }] })
    expect(updated.objective).toBe('keep')
  })
})

describe('getters', () => {
  const plan = (() => {
    const p = createTaskPlan({
      id: 'plan-1',
      objective: 'x',
      tasks: [
        task({ id: 'a' }),
        task({ id: 'b' }),
        task({ id: 'c', dependencies: [{ dependsOn: 'nonexistent' }] }),
      ],
    })
    return transitionTaskCompletion(
      transitionTaskCompletion(p, 'a', 'verified'),
      'b',
      'verification-pending',
    )
  })()

  it('getTask returns a task by id', () => {
    expect(getTask(plan, 'b')!.id).toBe('b')
    expect(getTask(plan, 'missing')).toBeUndefined()
  })

  it('getReadyTasks returns ready tasks', () => {
    expect(getReadyTasks(plan).map((t) => t.id)).toEqual([])
  })

  it('getBlockedTasks returns blocked tasks', () => {
    expect(getBlockedTasks(plan).map((t) => t.id)).toEqual(['c'])
  })

  it('getVerificationPendingTasks returns verification-pending tasks', () => {
    expect(getVerificationPendingTasks(plan).map((t) => t.id)).toEqual(['b'])
  })
})
