import { describe, expect, it } from 'vitest'
import { reviewIntegration } from '../src/game-integration-review.ts'
import { createAgentAssignment, createCoordinationState } from '../src/game-multi-agent.ts'

function makeState(fileOwnership: { filePath: string; agentId: string }[] = []) {
  return createCoordinationState({
    agents: [
      createAgentAssignment({ agentId: 'a1', role: 'gameplay-programmer', taskIds: [], currentTask: null }),
      createAgentAssignment({ agentId: 'a2', role: 'qa-engineer', taskIds: [], currentTask: null }),
    ],
    fileOwnership,
    taskAssignments: [],
    pendingTasks: [],
    completedTasks: [],
    blockedTasks: [],
  })
}

const ownedState = () => makeState([{ filePath: 'src/main.ts', agentId: 'a1' }])

describe('reviewIntegration', () => {
  it('approves an owned change set with a passed run and no disagreements', () => {
    const result = reviewIntegration(ownedState(), { files: ['src/main.ts'] }, { status: 'passed' })
    expect(result.findings).toEqual([])
    expect(result.approved).toBe(true)
    expect(result.summary).toBe('integration approved')
  })
  it('records a warning finding for a changed file without a recorded owner', () => {
    const result = reviewIntegration(makeState(), { files: ['src/new.ts'] }, { status: 'passed' })
    expect(result.findings).toEqual([
      {
        id: 'changed-file-unowned',
        severity: 'warning',
        message: `changed file 'src/new.ts' has no recorded owner`,
        filePath: 'src/new.ts',
      },
    ])
    expect(result.approved).toBe(false)
    expect(result.summary).toBe('integration not approved: 1 finding')
  })
  it('records nothing for a changed file with a recorded owner', () => {
    const result = reviewIntegration(ownedState(), { files: ['src/main.ts'] }, { status: 'passed' })
    expect(result.findings).toEqual([])
  })
  it('records an error finding for a changed file owned outside the state', () => {
    const state = makeState([{ filePath: 'src/main.ts', agentId: 'ghost' }])
    const result = reviewIntegration(state, { files: ['src/main.ts'] }, { status: 'passed' })
    expect(result.findings).toEqual([
      {
        id: 'changed-file-owner-out-of-scope',
        severity: 'error',
        message: `changed file 'src/main.ts' has an owner not recorded in the coordination state: ghost`,
        filePath: 'src/main.ts',
      },
    ])
    expect(result.approved).toBe(false)
  })
  it('records nothing for a changed file owned by a listed agent', () => {
    const result = reviewIntegration(ownedState(), { files: ['src/main.ts'] }, { status: 'passed' })
    expect(result.findings).toEqual([])
  })
  it('records an error finding for an ownership conflict on a changed file', () => {
    const state = makeState([
      { filePath: 'src/main.ts', agentId: 'a1' },
      { filePath: 'src/main.ts', agentId: 'a2' },
    ])
    const result = reviewIntegration(state, { files: ['src/main.ts'] }, { status: 'passed' })
    expect(result.findings).toEqual([
      {
        id: 'changed-file-ownership-conflict',
        severity: 'error',
        message: `changed file 'src/main.ts' is owned by more than one agent: a1, a2`,
        filePath: 'src/main.ts',
      },
    ])
    expect(result.approved).toBe(false)
  })
  it('records no conflict finding for a conflicted file outside the change set', () => {
    const state = makeState([
      { filePath: 'src/other.ts', agentId: 'a1' },
      { filePath: 'src/other.ts', agentId: 'a2' },
      { filePath: 'src/main.ts', agentId: 'a1' },
    ])
    const result = reviewIntegration(state, { files: ['src/main.ts'] }, { status: 'passed' })
    expect(result.findings).toEqual([])
  })
  it('records an error finding for a failed test run with its failures', () => {
    const result = reviewIntegration(
      ownedState(),
      { files: ['src/main.ts'] },
      { status: 'failed', failures: ['movement.spec.ts > slides on slopes'] },
    )
    expect(result.findings).toEqual([
      {
        id: 'tests-failed',
        severity: 'error',
        message: `recorded test run failed: movement.spec.ts > slides on slopes`,
        filePath: null,
      },
    ])
    expect(result.approved).toBe(false)
  })
  it('records no test finding for a passed run without failures', () => {
    const result = reviewIntegration(ownedState(), { files: ['src/main.ts'] }, { status: 'passed' })
    expect(result.findings).toEqual([])
  })
  it('records a warning finding for a run that has not been run', () => {
    const result = reviewIntegration(ownedState(), { files: ['src/main.ts'] }, { status: 'not-run' })
    expect(result.findings).toEqual([
      {
        id: 'tests-not-run',
        severity: 'warning',
        message: 'recorded test run has not been run',
        filePath: null,
      },
    ])
    expect(result.approved).toBe(false)
  })
  it('marks the run failed when failures are recorded despite a passed status', () => {
    const result = reviewIntegration(
      ownedState(),
      { files: ['src/main.ts'] },
      { status: 'passed', failures: ['combat.spec.ts > parry timing'] },
    )
    expect(result.findings).toEqual([
      {
        id: 'tests-failed',
        severity: 'error',
        message: `recorded test run failed: combat.spec.ts > parry timing`,
        filePath: null,
      },
    ])
    expect(result.approved).toBe(false)
  })
  it('records no test finding for an empty failure list', () => {
    const result = reviewIntegration(ownedState(), { files: ['src/main.ts'] }, { status: 'passed', failures: [] })
    expect(result.findings).toEqual([])
  })
  it('records an error finding for each recorded disagreement', () => {
    const result = reviewIntegration(
      ownedState(),
      { files: ['src/main.ts'] },
      { status: 'passed' },
      [{ topic: 'physics engine choice', agents: ['a1', 'a2'] }],
    )
    expect(result.findings).toEqual([
      {
        id: 'unresolved-disagreement',
        severity: 'error',
        message: `unresolved disagreement recorded for 'physics engine choice' between agents: a1, a2`,
        filePath: null,
      },
    ])
    expect(result.approved).toBe(false)
    expect(result.summary).toBe('integration not approved: 1 finding')
  })
  it('records no disagreement finding for an empty list', () => {
    const result = reviewIntegration(ownedState(), { files: ['src/main.ts'] }, { status: 'passed' }, [])
    expect(result.findings).toEqual([])
    expect(result.approved).toBe(true)
  })
  it('approves an empty change set when the run passed', () => {
    const result = reviewIntegration(makeState(), { files: [] }, { status: 'passed' })
    expect(result.findings).toEqual([])
    expect(result.approved).toBe(true)
  })
  it('still requires a run for an empty change set', () => {
    const result = reviewIntegration(makeState(), { files: [] }, { status: 'not-run' })
    expect(result.findings).toEqual([
      {
        id: 'tests-not-run',
        severity: 'warning',
        message: 'recorded test run has not been run',
        filePath: null,
      },
    ])
    expect(result.approved).toBe(false)
  })
  it('orders findings by change set, then test run, then disagreements', () => {
    const state = makeState([
      { filePath: 'src/a.ts', agentId: 'a1' },
      { filePath: 'src/a.ts', agentId: 'a2' },
    ])
    const result = reviewIntegration(
      state,
      { files: ['src/b.ts', 'src/a.ts'] },
      { status: 'failed' },
      [
        { topic: 'rendering pipeline', agents: ['a1'] },
        { topic: 'save format', agents: ['a2'] },
      ],
    )
    expect(result.findings).toEqual([
      {
        id: 'changed-file-unowned',
        severity: 'warning',
        message: `changed file 'src/b.ts' has no recorded owner`,
        filePath: 'src/b.ts',
      },
      {
        id: 'changed-file-ownership-conflict',
        severity: 'error',
        message: `changed file 'src/a.ts' is owned by more than one agent: a1, a2`,
        filePath: 'src/a.ts',
      },
      {
        id: 'tests-failed',
        severity: 'error',
        message: 'recorded test run failed',
        filePath: null,
      },
      {
        id: 'unresolved-disagreement',
        severity: 'error',
        message: `unresolved disagreement recorded for 'rendering pipeline' between agents: a1`,
        filePath: null,
      },
      {
        id: 'unresolved-disagreement',
        severity: 'error',
        message: `unresolved disagreement recorded for 'save format' between agents: a2`,
        filePath: null,
      },
    ])
    expect(result.approved).toBe(false)
    expect(result.summary).toBe('integration not approved: 5 findings')
  })
  it('reviews a repeated change set path once', () => {
    const result = reviewIntegration(makeState(), { files: ['src/new.ts', 'src/new.ts'] }, { status: 'passed' })
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]?.id).toBe('changed-file-unowned')
  })
  it('leaves every input unchanged', () => {
    const state = ownedState()
    const changeSet = { files: ['src/main.ts'] }
    const testRun = { status: 'failed' as const, failures: ['ui.spec.ts > menu focus'] }
    const disagreements = [{ topic: 'input mapping', agents: ['a1', 'a2'] }]
    const before = structuredClone({ state, changeSet, testRun, disagreements })
    reviewIntegration(state, changeSet, testRun, disagreements)
    expect({ state, changeSet, testRun, disagreements }).toEqual(before)
  })
  it('returns equal results for equal recorded inputs', () => {
    const first = reviewIntegration(
      makeState(),
      { files: ['src/new.ts'] },
      { status: 'not-run' },
      [{ topic: 'audio format', agents: ['a2'] }],
    )
    const second = reviewIntegration(
      makeState(),
      { files: ['src/new.ts'] },
      { status: 'not-run' },
      [{ topic: 'audio format', agents: ['a2'] }],
    )
    expect(second).toEqual(first)
  })
})
