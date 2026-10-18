import { describe, expect, it } from 'vitest'
import type {
  InteractionTarget,
  ProgressionMilestone,
  ProgressionState,
  PuzzleState,
} from '../src/index.ts'
import {
  attemptInteraction,
  canCompleteMilestone,
  completeMilestone,
  interactWithPuzzle,
} from '../src/index.ts'

function makeTarget(overrides: Partial<InteractionTarget> = {}): InteractionTarget {
  return {
    id: 'chest',
    name: 'Chest',
    prompt: 'Open',
    range: 3,
    available: true,
    completed: false,
    requiredItem: null,
    affects: [],
    ...overrides,
  }
}

function makePuzzle(overrides: Partial<PuzzleState> = {}): PuzzleState {
  return {
    id: 'p1',
    name: 'Lock',
    progress: 0,
    solved: false,
    requiredItems: [],
    itemStates: [],
    hint: null,
    ...overrides,
  }
}

const MILESTONE_ONE: ProgressionMilestone = {
  id: 'm1',
  name: 'First Steps',
  description: 'Finish the first objective',
  requiredObjectives: ['o1'],
  unlockedCapabilities: [],
  complete: false,
}

const MILESTONE_TWO: ProgressionMilestone = {
  id: 'm2',
  name: 'Second Step',
  description: 'Follow the first milestone',
  requiredObjectives: ['m1'],
  unlockedCapabilities: ['dash'],
  complete: false,
}

function makeProgression(
  milestones: readonly ProgressionMilestone[] = [],
  completedObjectives: readonly string[] = [],
): ProgressionState {
  return {
    milestones,
    completedObjectives,
    currentLevel: 'chapter-1',
    playTime: 120,
  }
}

/**
 * Run `completeMilestone` and return the thrown error message, or null when the call succeeds.
 *
 * @param state - progression state to complete within.
 * @param milestoneId - id of the milestone to complete.
 * @returns the rejection message, or null when no error was thrown.
 */
function captureRejection(state: ProgressionState, milestoneId: string): string | null {
  try {
    completeMilestone(state, milestoneId)
    return null
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

describe('attemptInteraction', () => {
  it('succeeds at exactly the interaction range', () => {
    const r = attemptInteraction(makeTarget(), [], 3)
    expect(r.succeeded).toBe(true)
    expect(r.completed).toBe(true)
    expect(r.message).toBe('Interacted with Chest.')
    expect(r.newTargetPosition).toBeNull()
    expect(r.itemsGranted).toEqual([])
  })

  it('fails beyond the interaction range', () => {
    const r = attemptInteraction(makeTarget(), [], 3.5)
    expect(r.succeeded).toBe(false)
    expect(r.completed).toBe(false)
    expect(r.message).toBe('Chest is too far away.')
  })

  it('checks availability before range and items', () => {
    const r = attemptInteraction(makeTarget({ available: false, requiredItem: 'key' }), [], 99)
    expect(r.succeeded).toBe(false)
    expect(r.message).toBe('Chest is not available.')
  })

  it('fails without the required item', () => {
    const r = attemptInteraction(makeTarget({ requiredItem: 'key' }), ['sword'], 1)
    expect(r.succeeded).toBe(false)
    expect(r.completed).toBe(false)
    expect(r.message).toBe('Chest requires key.')
  })

  it('succeeds with the required item in the inventory', () => {
    const r = attemptInteraction(makeTarget({ requiredItem: 'key' }), ['key'], 1)
    expect(r.succeeded).toBe(true)
    expect(r.completed).toBe(true)
    expect(r.message).toBe('Interacted with Chest.')
  })

  it('reports an already-completed target as succeeded', () => {
    const r = attemptInteraction(makeTarget({ completed: true }), [], 1)
    expect(r.succeeded).toBe(true)
    expect(r.completed).toBe(true)
    expect(r.message).toBe('Chest has already been interacted with.')
  })

  it('reports the range failure before the completed state', () => {
    const r = attemptInteraction(makeTarget({ completed: true }), [], 10)
    expect(r.succeeded).toBe(false)
    expect(r.message).toBe('Chest is too far away.')
    expect(r.completed).toBe(true)
  })

  it('keeps the completed flag when the target is unavailable', () => {
    const r = attemptInteraction(makeTarget({ completed: true, available: false }), [], 1)
    expect(r.succeeded).toBe(false)
    expect(r.message).toBe('Chest is not available.')
    expect(r.completed).toBe(true)
  })
})

describe('interactWithPuzzle', () => {
  it('inspect adds a quarter step', () => {
    const r = interactWithPuzzle(makePuzzle(), [], 'inspect', null)
    expect(r.progress).toBe(0.25)
    expect(r.solved).toBe(false)
    expect(r.message).toBe('Inspected Lock.')
    expect(r.itemsGranted).toEqual([])
  })

  it('four inspections solve the puzzle', () => {
    let puzzle = makePuzzle()
    let result = interactWithPuzzle(puzzle, [], 'inspect', null)
    for (let i = 0; i < 3; i++) {
      puzzle = { ...puzzle, progress: result.progress, solved: result.solved }
      result = interactWithPuzzle(puzzle, [], 'inspect', null)
    }
    expect(result.progress).toBe(1)
    expect(result.solved).toBe(true)
    expect(result.message).toBe('Solved Lock!')
  })

  it('manipulate with a value adds a half step', () => {
    const r = interactWithPuzzle(makePuzzle({ progress: 0.25 }), [], 'manipulate', 'gear')
    expect(r.progress).toBe(0.75)
    expect(r.solved).toBe(false)
    expect(r.message).toBe('Manipulated Lock with gear.')
  })

  it('manipulate without a value does nothing', () => {
    const r = interactWithPuzzle(makePuzzle({ progress: 0.25 }), [], 'manipulate', null)
    expect(r.progress).toBe(0.25)
    expect(r.solved).toBe(false)
    expect(r.message).toBe('Nothing happened with Lock.')
  })

  it('use requires the item in the inventory', () => {
    const missing = interactWithPuzzle(makePuzzle(), [], 'use', 'key')
    expect(missing.progress).toBe(0)
    expect(missing.solved).toBe(false)
    expect(missing.message).toBe('Nothing happened with Lock.')
    const held = interactWithPuzzle(makePuzzle(), ['key'], 'use', 'key')
    expect(held.progress).toBe(0.5)
    expect(held.message).toBe('Used key on Lock.')
  })

  it('unknown actions do nothing', () => {
    const r = interactWithPuzzle(makePuzzle({ progress: 0.25 }), [], 'shout', 'loudly')
    expect(r.progress).toBe(0.25)
    expect(r.solved).toBe(false)
    expect(r.message).toBe('Nothing happened with Lock.')
  })

  it('caps progress at one and reports the solve', () => {
    const r = interactWithPuzzle(makePuzzle({ progress: 0.75 }), [], 'manipulate', 'gear')
    expect(r.progress).toBe(1)
    expect(r.solved).toBe(true)
    expect(r.message).toBe('Solved Lock!')
  })

  it('missing required items block every action', () => {
    const blocked = interactWithPuzzle(makePuzzle({ requiredItems: ['rusty key'] }), [], 'inspect', null)
    expect(blocked.solved).toBe(false)
    expect(blocked.progress).toBe(0)
    expect(blocked.message).toBe('Lock requires rusty key.')
    const ready = interactWithPuzzle(
      makePuzzle({ requiredItems: ['rusty key'] }),
      ['rusty key'],
      'inspect',
      null,
    )
    expect(ready.progress).toBe(0.25)
  })

  it('a solved puzzle short-circuits', () => {
    const r = interactWithPuzzle(makePuzzle({ solved: true, progress: 1 }), [], 'inspect', null)
    expect(r.solved).toBe(true)
    expect(r.progress).toBe(1)
    expect(r.message).toBe('Lock is already solved.')
  })
})

describe('completeMilestone', () => {
  it('marks the milestone complete and records its objective', () => {
    const s0 = makeProgression([MILESTONE_ONE], ['o1'])
    const s1 = completeMilestone(s0, 'm1')
    expect(s1.milestones[0].complete).toBe(true)
    expect(s1.completedObjectives).toContain('m1')
    expect(s1.completedObjectives).toHaveLength(2)
    expect(s1.currentLevel).toBe('chapter-1')
    expect(s1.playTime).toBe(120)
    expect(s0.milestones[0].complete).toBe(false)
    expect(s0.completedObjectives).toHaveLength(1)
  })

  it('does not duplicate an already-recorded objective', () => {
    const s0 = makeProgression([MILESTONE_ONE], ['o1', 'm1'])
    const s1 = completeMilestone(s0, 'm1')
    expect(s1.completedObjectives).toHaveLength(2)
    expect(s1.milestones[0].complete).toBe(true)
  })

  it('leaves other milestones untouched', () => {
    const s0 = makeProgression([MILESTONE_ONE, MILESTONE_TWO], ['m1'])
    const s1 = completeMilestone(s0, 'm2')
    expect(s1.milestones[0]).toEqual(MILESTONE_ONE)
    expect(s1.milestones[1].complete).toBe(true)
    expect(s1.milestones[0].complete).toBe(false)
  })

  it('throws for an unknown milestone', () => {
    expect(() => completeMilestone(makeProgression(), 'ghost')).toThrow(
      /^unknown milestone: ghost$/,
    )
  })

  it('throws when required objectives are missing and leaves the state unchanged', () => {
    const s0 = makeProgression([MILESTONE_ONE], [])
    expect(() => completeMilestone(s0, 'm1')).toThrow(/^missing objectives: o1$/)
    expect(s0.milestones[0].complete).toBe(false)
    expect(s0.completedObjectives).toEqual([])
  })

  it('rejects completing the same milestone twice', () => {
    const s0 = makeProgression([MILESTONE_ONE], ['o1'])
    const s1 = completeMilestone(s0, 'm1')
    expect(() => completeMilestone(s1, 'm1')).toThrow(/^milestone already complete$/)
    expect(s1.milestones[0].complete).toBe(true)
    expect(s1.completedObjectives).toEqual(['o1', 'm1'])
  })

  it('throws exactly the reason canCompleteMilestone reports', () => {
    const blocked: readonly (readonly [ProgressionState, string])[] = [
      [makeProgression(), 'ghost'],
      [makeProgression([MILESTONE_ONE], []), 'm1'],
      [completeMilestone(makeProgression([MILESTONE_ONE], ['o1']), 'm1'), 'm1'],
    ]
    for (const [state, milestoneId] of blocked) {
      const check = canCompleteMilestone(state, milestoneId)
      expect(check.canComplete).toBe(false)
      expect(check.reason).not.toBeNull()
      expect(captureRejection(state, milestoneId)).toBe(check.reason)
    }
  })
})

describe('canCompleteMilestone', () => {
  it('is ready when every objective is complete', () => {
    const r = canCompleteMilestone(makeProgression([MILESTONE_ONE], ['o1']), 'm1')
    expect(r.canComplete).toBe(true)
    expect(r.reason).toBeNull()
  })

  it('lists the missing objectives', () => {
    const r = canCompleteMilestone(makeProgression([MILESTONE_ONE], []), 'm1')
    expect(r.canComplete).toBe(false)
    expect(r.reason).toBe('missing objectives: o1')
  })

  it('lists every missing objective in order', () => {
    const milestone: ProgressionMilestone = {
      ...MILESTONE_ONE,
      requiredObjectives: ['o1', 'o2', 'o3'],
    }
    const r = canCompleteMilestone(makeProgression([milestone], ['o2']), 'm1')
    expect(r.canComplete).toBe(false)
    expect(r.reason).toBe('missing objectives: o1, o3')
  })

  it('reports an unknown milestone', () => {
    const r = canCompleteMilestone(makeProgression(), 'ghost')
    expect(r.canComplete).toBe(false)
    expect(r.reason).toBe('unknown milestone: ghost')
  })

  it('rejects an already-complete milestone', () => {
    const s0 = makeProgression([MILESTONE_ONE], ['o1'])
    const s1 = completeMilestone(s0, 'm1')
    const r = canCompleteMilestone(s1, 'm1')
    expect(r.canComplete).toBe(false)
    expect(r.reason).toBe('milestone already complete')
  })

  it('needs no objectives when the milestone has none', () => {
    const milestone: ProgressionMilestone = { ...MILESTONE_ONE, requiredObjectives: [] }
    const r = canCompleteMilestone(makeProgression([milestone]), 'm1')
    expect(r.canComplete).toBe(true)
    expect(r.reason).toBeNull()
  })

  it('chained milestones unlock through completion', () => {
    const s1 = completeMilestone(makeProgression([MILESTONE_ONE, MILESTONE_TWO], ['o1']), 'm1')
    expect(s1.completedObjectives).toContain('m1')
    const check = canCompleteMilestone(s1, 'm2')
    expect(check.canComplete).toBe(true)
    expect(check.reason).toBeNull()
    const s2 = completeMilestone(s1, 'm2')
    expect(s2.milestones[1].complete).toBe(true)
    expect(s2.completedObjectives).toContain('m2')
    expect(s2.completedObjectives).toHaveLength(3)
  })
})
