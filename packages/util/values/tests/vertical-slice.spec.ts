import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SLICE_MILESTONES,
  canCompleteSliceMilestone,
  completeSliceMilestone,
  createVerticalSlicePlan,
  evaluateSliceQuality,
  getCompletedMilestones,
  getRemainingMilestones,
  type SliceMilestone,
} from '../src/index.ts'

function makePlan(ids: readonly string[]) {
  return createVerticalSlicePlan({
    id: 'slice-1',
    genre: 'platformer',
    coreExperience: 'Tight jump-and-run through a haunted factory',
    milestones: ids.map(id => ({
      id,
      name: id,
      description: `Milestone ${id}`,
      requiredSystems: ['movement'],
      requiredAssets: ['hero'],
      acceptanceCriteria: ['Criterion passes'],
    })),
    platforms: ['pc'],
    estimatedDurationDays: 14,
  })
}

describe('createVerticalSlicePlan', () => {
  it('starts at zero progress with every milestone incomplete', () => {
    const plan = makePlan(['run', 'jump'])
    expect(plan.id).toBe('slice-1')
    expect(plan.genre).toBe('platformer')
    expect(plan.coreExperience).toBe('Tight jump-and-run through a haunted factory')
    expect(plan.platforms).toEqual(['pc'])
    expect(plan.estimatedDurationDays).toBe(14)
    expect(plan.progress).toBe(0)
    expect(plan.milestones).toHaveLength(2)
    expect(plan.milestones.map(m => m.complete)).toEqual([false, false])
  })

  it('does not reuse the caller milestone objects', () => {
    const stub = {
      id: 'run',
      name: 'Run',
      description: 'Move the player.',
      requiredSystems: ['movement'],
      requiredAssets: ['hero'],
      acceptanceCriteria: ['Player moves'],
    }
    const plan = createVerticalSlicePlan({
      id: 'slice-1',
      genre: 'platformer',
      coreExperience: 'core',
      milestones: [stub],
      platforms: ['pc'],
      estimatedDurationDays: 14,
    })
    expect(plan.milestones[0]! === (stub as unknown as SliceMilestone)).toBe(false)
    expect(Object.hasOwn(stub, 'complete')).toBe(false)
    expect(plan.milestones[0]!.complete).toBe(false)
  })

  it('forces every milestone incomplete even when the input already carries a completion flag', () => {
    const preCompleted = {
      id: 'run',
      name: 'Run',
      description: 'Move the player.',
      requiredSystems: ['movement'],
      requiredAssets: ['hero'],
      acceptanceCriteria: ['Player moves'],
      complete: true,
    }
    const plan = createVerticalSlicePlan({
      id: 'slice-1',
      genre: 'platformer',
      coreExperience: 'core',
      milestones: [preCompleted],
      platforms: ['pc'],
      estimatedDurationDays: 14,
    })
    expect(plan.milestones[0]!.complete).toBe(false)
    expect(plan.progress).toBe(0)
  })
})

describe('completeSliceMilestone', () => {
  it('marks one milestone complete and recomputes progress', () => {
    const plan = makePlan(['run', 'jump'])
    const updated = completeSliceMilestone(plan, 'jump')
    expect(updated.milestones.map(m => m.complete)).toEqual([false, true])
    expect(updated.progress).toBe(0.5)
    expect(updated.id).toBe('slice-1')
    expect(updated.platforms).toEqual(['pc'])
  })

  it('leaves the input plan unchanged', () => {
    const plan = makePlan(['run', 'jump'])
    completeSliceMilestone(plan, 'run')
    expect(plan.milestones[0]!.complete).toBe(false)
    expect(plan.progress).toBe(0)
  })

  it('accumulates progress across successive completions', () => {
    const plan = makePlan(['a', 'b', 'c', 'd'])
    const one = completeSliceMilestone(plan, 'a')
    expect(one.progress).toBe(0.25)
    const two = completeSliceMilestone(one, 'c')
    expect(two.progress).toBe(0.5)
    expect(two.milestones.map(m => m.complete)).toEqual([true, false, true, false])
  })

  it('reaches full progress when every milestone is completed', () => {
    const plan = makePlan(['run', 'jump'])
    const updated = completeSliceMilestone(completeSliceMilestone(plan, 'run'), 'jump')
    expect(updated.progress).toBe(1)
    expect(getRemainingMilestones(updated)).toHaveLength(0)
  })

  it('keeps an already completed milestone stable when completed again', () => {
    const plan = makePlan(['run', 'jump'])
    const once = completeSliceMilestone(plan, 'run')
    const twice = completeSliceMilestone(once, 'run')
    expect(twice.milestones[0]!.complete).toBe(true)
    expect(twice.progress).toBe(once.progress)
  })

  it('throws for an unknown milestone id', () => {
    const plan = makePlan(['run'])
    expect(() => completeSliceMilestone(plan, 'ghost')).toThrow(/unknown milestone: ghost/)
  })
})

describe('canCompleteSliceMilestone', () => {
  it('allows completing an incomplete milestone', () => {
    const plan = makePlan(['run', 'jump'])
    expect(canCompleteSliceMilestone(plan, 'run')).toEqual({ canComplete: true, reason: null })
  })

  it('refuses an already completed milestone', () => {
    const plan = completeSliceMilestone(makePlan(['run', 'jump']), 'run')
    expect(canCompleteSliceMilestone(plan, 'run')).toEqual({
      canComplete: false,
      reason: 'milestone already complete',
    })
  })

  it('refuses an unknown milestone id', () => {
    const plan = makePlan(['run'])
    expect(canCompleteSliceMilestone(plan, 'ghost')).toEqual({
      canComplete: false,
      reason: 'unknown milestone: ghost',
    })
  })
})

describe('getRemainingMilestones', () => {
  it('lists only incomplete milestones in plan order', () => {
    const plan = completeSliceMilestone(makePlan(['a', 'b', 'c']), 'b')
    expect(getRemainingMilestones(plan).map(m => m.id)).toEqual(['a', 'c'])
  })

  it('is empty once every milestone is complete', () => {
    const plan = makePlan(['a', 'b'])
    const updated = completeSliceMilestone(completeSliceMilestone(plan, 'a'), 'b')
    expect(getRemainingMilestones(updated)).toHaveLength(0)
  })
})

describe('getCompletedMilestones', () => {
  it('lists only completed milestones', () => {
    const plan = completeSliceMilestone(makePlan(['a', 'b', 'c']), 'b')
    expect(getCompletedMilestones(plan).map(m => m.id)).toEqual(['b'])
  })

  it('is empty on a fresh plan', () => {
    expect(getCompletedMilestones(makePlan(['a', 'b']))).toHaveLength(0)
  })
})

describe('evaluateSliceQuality', () => {
  it('reports all gates passed when every result passed', () => {
    const gateResults = [
      { gateId: 'fun', passed: true, evidence: ['playtest-notes'] },
      { gateId: 'stable', passed: true, evidence: [] },
    ]
    const outcome = evaluateSliceQuality(makePlan(['a']), gateResults)
    expect(outcome.allGatesPassed).toBe(true)
    expect(outcome.results).toEqual(gateResults)
  })

  it('fails the set when any result failed', () => {
    const gateResults = [
      { gateId: 'fun', passed: true, evidence: ['playtest-notes'] },
      { gateId: 'stable', passed: false, evidence: [] },
    ]
    const outcome = evaluateSliceQuality(makePlan(['a']), gateResults)
    expect(outcome.allGatesPassed).toBe(false)
    expect(outcome.results).toEqual(gateResults)
  })

  it('passes an empty gate set', () => {
    const outcome = evaluateSliceQuality(makePlan(['a']), [])
    expect(outcome.allGatesPassed).toBe(true)
    expect(outcome.results).toHaveLength(0)
  })

  it('returns copies of the gate results rather than the input objects', () => {
    const gateResults = [{ gateId: 'fun', passed: false, evidence: [] }]
    const outcome = evaluateSliceQuality(makePlan(['a']), gateResults)
    expect(outcome.results === gateResults).toBe(false)
    expect(outcome.results[0] === gateResults[0]).toBe(false)
    expect(outcome.results).toEqual(gateResults)
  })
})

describe('DEFAULT_SLICE_MILESTONES', () => {
  it('declares five default milestones with stable ids in order', () => {
    expect(DEFAULT_SLICE_MILESTONES).toHaveLength(5)
    expect(DEFAULT_SLICE_MILESTONES.map(m => m.id)).toEqual([
      'core-mechanic',
      'first-level',
      'ui-hud',
      'audio',
      'polish',
    ])
  })

  it('has no duplicate milestone ids', () => {
    const ids = DEFAULT_SLICE_MILESTONES.map(m => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('starts every default milestone incomplete with systems, assets, and criteria', () => {
    for (const milestone of DEFAULT_SLICE_MILESTONES) {
      expect(milestone.complete).toBe(false)
      expect(milestone.name.length).toBeGreaterThan(0)
      expect(milestone.description.length).toBeGreaterThan(0)
      expect(milestone.requiredSystems.length).toBeGreaterThanOrEqual(1)
      expect(milestone.requiredAssets.length).toBeGreaterThanOrEqual(1)
      expect(milestone.acceptanceCriteria.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('feeds directly into a plan that completes at one-fifth per milestone', () => {
    const plan = createVerticalSlicePlan({
      id: 'default-slice',
      genre: 'any',
      coreExperience: 'core',
      milestones: DEFAULT_SLICE_MILESTONES,
      platforms: ['pc'],
      estimatedDurationDays: 30,
    })
    expect(plan.milestones).toHaveLength(5)
    expect(plan.progress).toBe(0)
    const updated = completeSliceMilestone(plan, 'core-mechanic')
    expect(updated.progress).toBe(0.2)
    expect(getCompletedMilestones(updated).map(m => m.id)).toEqual(['core-mechanic'])
  })
})
