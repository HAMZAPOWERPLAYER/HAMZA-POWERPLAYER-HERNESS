import { describe, expect, it } from 'vitest'
import {
  assignFileOwnership,
  assignTask,
  balanceWorkload,
  checkFileOwnershipConflicts,
  completeTask,
  createAgentAssignment,
  createCoordinationState,
  getAgentTasks,
  getAgentWorkload,
  getTaskAgents,
} from '../src/index.ts'

function makeAgent(
  agentId: string,
  taskIds: readonly string[],
  status?: 'idle' | 'working' | 'blocked' | 'completed' | 'error',
) {
  return createAgentAssignment({
    agentId,
    role: 'gameplay-programmer',
    taskIds,
    status,
    currentTask: null,
  })
}

function makeState(overrides: {
  agents?: ReturnType<typeof makeAgent>[]
  fileOwnership?: { filePath: string; agentId: string }[]
  taskAssignments?: { taskId: string; agentId: string }[]
  pendingTasks?: string[]
  completedTasks?: string[]
  blockedTasks?: string[]
} = {}) {
  return createCoordinationState({
    agents: overrides.agents ?? [makeAgent('a1', []), makeAgent('a2', [])],
    fileOwnership: overrides.fileOwnership ?? [],
    taskAssignments: overrides.taskAssignments ?? [],
    pendingTasks: overrides.pendingTasks ?? ['t1', 't2'],
    completedTasks: overrides.completedTasks ?? [],
    blockedTasks: overrides.blockedTasks ?? [],
  })
}

describe('createAgentAssignment', () => {
  it('applies the provided fields', () => {
    const agent = createAgentAssignment({
      agentId: 'a1',
      role: 'qa-engineer',
      taskIds: ['t1', 't2'],
      status: 'working',
      currentTask: 't1',
    })
    expect(agent).toEqual({
      agentId: 'a1',
      role: 'qa-engineer',
      taskIds: ['t1', 't2'],
      status: 'working',
      currentTask: 't1',
    })
  })

  it('defaults status to idle', () => {
    const agent = createAgentAssignment({
      agentId: 'a1',
      role: 'orchestrator',
      taskIds: [],
      currentTask: null,
    })
    expect(agent.status).toBe('idle')
    expect(agent.currentTask).toBeNull()
  })
})

describe('createCoordinationState', () => {
  it('preserves every collection unchanged', () => {
    const agent = makeAgent('a1', ['t1'])
    const state = createCoordinationState({
      agents: [agent],
      fileOwnership: [{ filePath: 'src/main.ts', agentId: 'a1' }],
      taskAssignments: [{ taskId: 't1', agentId: 'a1' }],
      pendingTasks: ['t2'],
      completedTasks: ['t0'],
      blockedTasks: ['t3'],
    })
    expect(state.agents).toEqual([agent])
    expect(state.fileOwnership).toEqual([{ filePath: 'src/main.ts', agentId: 'a1' }])
    expect(state.taskAssignments).toEqual([{ taskId: 't1', agentId: 'a1' }])
    expect(state.pendingTasks).toEqual(['t2'])
    expect(state.completedTasks).toEqual(['t0'])
    expect(state.blockedTasks).toEqual(['t3'])
  })
})

describe('assignTask', () => {
  it('gives the task to the agent, records the assignment, and drops it from pending', () => {
    const state = assignTask(makeState(), 'a1', 't1')
    expect(getAgentTasks(state, 'a1')).toEqual(['t1'])
    expect(state.taskAssignments).toEqual([{ taskId: 't1', agentId: 'a1' }])
    expect(state.pendingTasks).toEqual(['t2'])
  })

  it('does not duplicate a task the agent already holds', () => {
    const once = assignTask(makeState(), 'a1', 't1')
    const twice = assignTask(once, 'a1', 't1')
    expect(getAgentTasks(twice, 'a1')).toEqual(['t1'])
    expect(twice.taskAssignments).toHaveLength(1)
  })

  it('moves a single assignment record when the task is reassigned', () => {
    const assigned = assignTask(makeState(), 'a1', 't1')
    const reassigned = assignTask(assigned, 'a2', 't1')
    expect(getTaskAgents(reassigned, 't1')).toEqual(['a2'])
    expect(reassigned.taskAssignments).toEqual([{ taskId: 't1', agentId: 'a2' }])
  })

  it('throws for an unknown agent', () => {
    expect(() => assignTask(makeState(), 'ghost', 't1')).toThrow(/unknown agent: ghost/)
  })
})

describe('completeTask', () => {
  it('moves the task from the agent into completedTasks', () => {
    const assigned = assignTask(makeState(), 'a1', 't1')
    const state = completeTask(assigned, 't1')
    expect(state.completedTasks).toEqual(['t1'])
    expect(getAgentTasks(state, 'a1')).toEqual([])
    expect(state.taskAssignments).toEqual([])
    expect(state.pendingTasks).toEqual(['t2'])
  })

  it('removes the task from pendingTasks even when the lists overlap', () => {
    const state = makeState({
      agents: [makeAgent('a1', ['t1'])],
      taskAssignments: [{ taskId: 't1', agentId: 'a1' }],
      pendingTasks: ['t1', 't2'],
    })
    expect(completeTask(state, 't1').pendingTasks).toEqual(['t2'])
  })

  it('throws when the task is not assigned to any agent', () => {
    expect(() => completeTask(makeState(), 't9')).toThrow(/task t9 is not assigned to any agent/)
  })

  it('throws when completing the same task twice', () => {
    const assigned = assignTask(makeState(), 'a1', 't1')
    const done = completeTask(assigned, 't1')
    expect(() => completeTask(done, 't1')).toThrow(/task t1 is not assigned to any agent/)
  })
})

describe('assignFileOwnership', () => {
  it('records the owning agent for a new file', () => {
    const state = assignFileOwnership(makeState(), 'src/main.ts', 'a1')
    expect(state.fileOwnership).toEqual([{ filePath: 'src/main.ts', agentId: 'a1' }])
  })

  it('transfers ownership without duplicating the file entry', () => {
    const owned = assignFileOwnership(makeState(), 'src/main.ts', 'a1')
    const transferred = assignFileOwnership(owned, 'src/main.ts', 'a2')
    expect(transferred.fileOwnership).toEqual([{ filePath: 'src/main.ts', agentId: 'a2' }])
  })

  it('throws for an unknown agent', () => {
    expect(() => assignFileOwnership(makeState(), 'src/main.ts', 'ghost')).toThrow(/unknown agent: ghost/)
  })
})

describe('checkFileOwnershipConflicts', () => {
  it('reports nothing when each file has a single owner', () => {
    const state = makeState({
      fileOwnership: [
        { filePath: 'src/a.ts', agentId: 'a1' },
        { filePath: 'src/b.ts', agentId: 'a2' },
      ],
    })
    expect(checkFileOwnershipConflicts(state)).toHaveLength(0)
  })

  it('reports multi-owner files with unique agent ids, sorted by path', () => {
    const state = makeState({
      fileOwnership: [
        { filePath: 'src/z.ts', agentId: 'a1' },
        { filePath: 'src/z.ts', agentId: 'a2' },
        { filePath: 'src/a.ts', agentId: 'a3' },
        { filePath: 'src/a.ts', agentId: 'a1' },
      ],
    })
    expect(checkFileOwnershipConflicts(state)).toEqual([
      { filePath: 'src/a.ts', agentIds: ['a3', 'a1'] },
      { filePath: 'src/z.ts', agentIds: ['a1', 'a2'] },
    ])
  })

  it('does not treat repeated entries from the same agent as a conflict', () => {
    const state = makeState({
      fileOwnership: [
        { filePath: 'src/a.ts', agentId: 'a1' },
        { filePath: 'src/a.ts', agentId: 'a1' },
      ],
    })
    expect(checkFileOwnershipConflicts(state)).toHaveLength(0)
  })
})

describe('getAgentTasks', () => {
  it('returns the assigned tasks for a known agent', () => {
    const state = makeState({ agents: [makeAgent('a1', ['t1', 't2'])] })
    expect(getAgentTasks(state, 'a1')).toEqual(['t1', 't2'])
  })

  it('returns an empty list for an unknown agent', () => {
    expect(getAgentTasks(makeState(), 'ghost')).toEqual([])
  })
})

describe('getTaskAgents', () => {
  it('returns the agent holding an assigned task', () => {
    const state = makeState({ taskAssignments: [{ taskId: 't1', agentId: 'a1' }] })
    expect(getTaskAgents(state, 't1')).toEqual(['a1'])
  })

  it('returns an empty list for an unassigned task', () => {
    expect(getTaskAgents(makeState(), 't9')).toEqual([])
  })
})

describe('getAgentWorkload', () => {
  it('returns the number of tasks held by a known agent', () => {
    const state = makeState({ agents: [makeAgent('a1', ['t1', 't2', 't3'])] })
    expect(getAgentWorkload(state, 'a1')).toBe(3)
  })

  it('returns zero for an unknown agent', () => {
    expect(getAgentWorkload(makeState(), 'ghost')).toBe(0)
  })
})

describe('balanceWorkload', () => {
  it('returns the state unchanged when there are no agents', () => {
    const state = makeState({ agents: [], pendingTasks: [] })
    expect(balanceWorkload(state)).toEqual(state)
  })

  it('returns the state unchanged when workloads are already balanced', () => {
    const state = makeState({
      agents: [makeAgent('a1', ['t1', 't2']), makeAgent('a2', ['t3', 't4'])],
      taskAssignments: [
        { taskId: 't1', agentId: 'a1' },
        { taskId: 't2', agentId: 'a1' },
        { taskId: 't3', agentId: 'a2' },
        { taskId: 't4', agentId: 'a2' },
      ],
      pendingTasks: [],
    })
    expect(balanceWorkload(state)).toEqual(state)
  })

  it('does not move tasks when the top workload equals average plus one', () => {
    const state = makeState({
      agents: [makeAgent('a1', ['t1', 't2', 't3']), makeAgent('a2', ['t4'])],
      taskAssignments: [
        { taskId: 't1', agentId: 'a1' },
        { taskId: 't2', agentId: 'a1' },
        { taskId: 't3', agentId: 'a1' },
        { taskId: 't4', agentId: 'a2' },
      ],
      pendingTasks: [],
    })
    expect(balanceWorkload(state)).toEqual(state)
  })

  it("moves the overloaded agent's last task to the first underloaded agent", () => {
    const state = makeState({
      agents: [makeAgent('a1', ['t1', 't2', 't3', 't4', 't5']), makeAgent('a2', []), makeAgent('a3', [])],
      taskAssignments: [
        { taskId: 't1', agentId: 'a1' },
        { taskId: 't2', agentId: 'a1' },
        { taskId: 't3', agentId: 'a1' },
        { taskId: 't4', agentId: 'a1' },
        { taskId: 't5', agentId: 'a1' },
      ],
      pendingTasks: [],
    })
    const balanced = balanceWorkload(state)
    expect(getAgentTasks(balanced, 'a1')).toEqual(['t1', 't2', 't3', 't4'])
    expect(getAgentTasks(balanced, 'a2')).toEqual(['t5'])
    expect(getAgentTasks(balanced, 'a3')).toEqual([])
    expect(getTaskAgents(balanced, 't5')).toEqual(['a2'])
    expect(getTaskAgents(balanced, 't4')).toEqual(['a1'])
  })
})
