import { describe, expect, it } from 'vitest'
import type { MilestoneDefinition, PuzzleDefinition, SoftLockInput } from '../src/game-reliability.ts'
import { analyzeSoftLocks } from '../src/game-reliability.ts'

function makePuzzle(overrides: Partial<PuzzleDefinition> = {}): PuzzleDefinition {
  return {
    id: 'p1',
    name: 'Lock',
    requiredItems: [],
    rewards: [],
    ...overrides,
  }
}

function makeMilestone(overrides: Partial<MilestoneDefinition> = {}): MilestoneDefinition {
  return {
    id: 'm1',
    name: 'First Steps',
    requiredItems: [],
    requiredPuzzles: [],
    ...overrides,
  }
}

function makeInput(overrides: Partial<SoftLockInput> = {}): SoftLockInput {
  return {
    items: [],
    puzzles: [],
    milestones: [],
    ...overrides,
  }
}

describe('unreachable-milestone-item', () => {
  it('fires when a milestone requires an item no source yields', () => {
    const report = analyzeSoftLocks(makeInput({ milestones: [makeMilestone({ requiredItems: ['key'] })] }))
    expect(report.findings).toHaveLength(1)
    const finding = report.findings[0]
    expect(finding?.code).toBe('unreachable-milestone-item')
    expect(finding?.severity).toBe('error')
    expect(finding?.message).toBe('Milestone m1 requires item key, which no reachable source grants.')
    expect(finding?.subject).toBe('m1')
    expect(finding?.suggestion).toBe('Add key to the starting items or reward it from a puzzle the player can solve.')
  })

  it('fires when the only source of the item is a blocked puzzle', () => {
    const report = analyzeSoftLocks(
      makeInput({
        puzzles: [makePuzzle({ id: 'forge', requiredItems: ['coal'], rewards: ['key'] })],
        milestones: [makeMilestone({ requiredItems: ['key'] })],
      }),
    )
    expect(report.findings.map((finding) => finding.code)).toEqual([
      'unreachable-milestone-item',
      'puzzle-unreachable-item',
    ])
    expect(report.reachableItems).toEqual([])
  })

  it('silent when the item is pre-granted', () => {
    const report = analyzeSoftLocks(
      makeInput({ items: ['key'], milestones: [makeMilestone({ requiredItems: ['key'] })] }),
    )
    expect(report.findings).toEqual([])
    expect(report.reachableItems).toEqual(['key'])
    expect(report.hasCritical).toBe(false)
  })

  it('silent when the item is reached through a puzzle reward chain', () => {
    const report = analyzeSoftLocks(
      makeInput({
        items: ['rusty-key'],
        puzzles: [makePuzzle({ id: 'unlock-door', requiredItems: ['rusty-key'], rewards: ['vault-key'] })],
        milestones: [makeMilestone({ requiredItems: ['vault-key'] })],
      }),
    )
    expect(report.findings).toEqual([])
    expect(report.reachableItems).toEqual(['rusty-key', 'vault-key'])
  })

  it('lists one finding per milestone and item in input order', () => {
    const report = analyzeSoftLocks(
      makeInput({
        milestones: [
          makeMilestone({ id: 'm1', requiredItems: ['i2', 'i1'] }),
          makeMilestone({ id: 'm2', requiredItems: ['i1'] }),
        ],
      }),
    )
    expect(report.findings.map((finding) => [finding.code, finding.subject, finding.message])).toEqual([
      ['unreachable-milestone-item', 'm1', 'Milestone m1 requires item i2, which no reachable source grants.'],
      ['unreachable-milestone-item', 'm1', 'Milestone m1 requires item i1, which no reachable source grants.'],
      ['unreachable-milestone-item', 'm2', 'Milestone m2 requires item i1, which no reachable source grants.'],
    ])
  })
})

describe('puzzle-unreachable-item', () => {
  it('fires when no puzzle rewards the required item', () => {
    const report = analyzeSoftLocks(makeInput({ puzzles: [makePuzzle({ requiredItems: ['key'] })] }))
    expect(report.findings).toHaveLength(1)
    const finding = report.findings[0]
    expect(finding?.code).toBe('puzzle-unreachable-item')
    expect(finding?.severity).toBe('error')
    expect(finding?.message).toBe('Puzzle p1 requires item key, which no puzzle rewards and the starting items omit.')
    expect(finding?.subject).toBe('p1')
    expect(finding?.suggestion).toBe('Add key to the starting items or reward it from a different puzzle the player can solve.')
  })

  it('fires as a self-deadlock when only the puzzle itself rewards the item', () => {
    const report = analyzeSoftLocks(makeInput({ puzzles: [makePuzzle({ requiredItems: ['gear'], rewards: ['gear'] })] }))
    expect(report.findings).toHaveLength(1)
    const finding = report.findings[0]
    expect(finding?.code).toBe('puzzle-unreachable-item')
    expect(finding?.message).toBe(
      'Puzzle p1 requires item gear, which only p1 itself rewards; the puzzle can never hold its own reward before solving.',
    )
  })

  it('silent when the required item is pre-granted', () => {
    const report = analyzeSoftLocks(makeInput({ items: ['key'], puzzles: [makePuzzle({ requiredItems: ['key'] })] }))
    expect(report.findings).toEqual([])
    expect(report.hasCritical).toBe(false)
  })

  it('silent when another puzzle rewards the required item', () => {
    const report = analyzeSoftLocks(
      makeInput({
        puzzles: [makePuzzle({ id: 'lock', requiredItems: ['key'] }), makePuzzle({ id: 'chest', rewards: ['key'] })],
      }),
    )
    expect(report.findings).toEqual([])
  })

  it('silent when the reward arrives through a later fixed-point pass', () => {
    const report = analyzeSoftLocks(
      makeInput({
        items: ['a'],
        puzzles: [
          makePuzzle({ id: 'dependent', requiredItems: ['token'] }),
          makePuzzle({ id: 'press', requiredItems: ['a'], rewards: ['token'] }),
        ],
      }),
    )
    expect(report.findings).toEqual([])
    expect(report.reachableItems).toEqual(['a', 'token'])
  })
})

describe('mutual-deadlock', () => {
  it('fires when two puzzles each require an item only the other rewards', () => {
    const report = analyzeSoftLocks(
      makeInput({
        puzzles: [
          makePuzzle({ id: 'door', requiredItems: ['x'], rewards: ['y'] }),
          makePuzzle({ id: 'vault', requiredItems: ['y'], rewards: ['x'] }),
        ],
      }),
    )
    expect(report.findings).toHaveLength(1)
    const finding = report.findings[0]
    expect(finding?.code).toBe('mutual-deadlock')
    expect(finding?.severity).toBe('error')
    expect(finding?.subject).toBe('door & vault')
    expect(finding?.message).toBe(
      'Puzzles door and vault deadlock each other: door requires x, which only vault rewards, and vault requires y, which only door rewards.',
    )
    expect(finding?.suggestion).toBe('Add x or y to the starting items or reward it from a puzzle outside the pair.')
    expect(report.reachableItems).toEqual([])
  })

  it('fires when both puzzles require the same item only each other rewards', () => {
    const report = analyzeSoftLocks(
      makeInput({
        puzzles: [
          makePuzzle({ id: 'a', requiredItems: ['k'], rewards: ['k'] }),
          makePuzzle({ id: 'b', requiredItems: ['k'], rewards: ['k'] }),
        ],
      }),
    )
    expect(report.findings).toHaveLength(1)
    expect(report.findings[0]?.code).toBe('mutual-deadlock')
    expect(report.findings[0]?.message).toBe(
      'Puzzles a and b deadlock each other: a requires k, which only b rewards, and b requires k, which only a rewards.',
    )
  })

  it('silent when a pre-granted item breaks the cycle', () => {
    const report = analyzeSoftLocks(
      makeInput({
        items: ['x'],
        puzzles: [
          makePuzzle({ id: 'door', requiredItems: ['x'], rewards: ['y'] }),
          makePuzzle({ id: 'vault', requiredItems: ['y'], rewards: ['x'] }),
        ],
      }),
    )
    expect(report.findings).toEqual([])
    expect(report.reachableItems).toEqual(['x', 'y'])
  })

  it('silent when a third puzzle rewards one side of the cycle', () => {
    const report = analyzeSoftLocks(
      makeInput({
        puzzles: [
          makePuzzle({ id: 'door', requiredItems: ['x'], rewards: ['y'] }),
          makePuzzle({ id: 'vault', requiredItems: ['y'], rewards: ['x'] }),
          makePuzzle({ id: 'foundry', rewards: ['x'] }),
        ],
      }),
    )
    expect(report.findings).toEqual([])
    expect(report.reachableItems).toEqual(['x', 'y'])
  })
})

describe('unknown-puzzle-reference', () => {
  it('fires when a milestone requires a puzzle that does not exist', () => {
    const report = analyzeSoftLocks(makeInput({ milestones: [makeMilestone({ requiredPuzzles: ['ghost'] })] }))
    expect(report.findings).toHaveLength(1)
    const finding = report.findings[0]
    expect(finding?.code).toBe('unknown-puzzle-reference')
    expect(finding?.severity).toBe('error')
    expect(finding?.message).toBe('Milestone m1 requires puzzle ghost, which no puzzle defines.')
    expect(finding?.subject).toBe('m1')
    expect(finding?.suggestion).toBe('Define puzzle ghost or remove it from milestone m1.')
  })

  it('silent when the referenced puzzle exists', () => {
    const report = analyzeSoftLocks(
      makeInput({ puzzles: [makePuzzle({ id: 'lock' })], milestones: [makeMilestone({ requiredPuzzles: ['lock'] })] }),
    )
    expect(report.findings).toEqual([])
    expect(report.hasCritical).toBe(false)
  })
})

describe('analyzeSoftLocks report', () => {
  it('empty inputs produce an empty report', () => {
    const report = analyzeSoftLocks({ items: [], puzzles: [], milestones: [] })
    expect(report.findings).toEqual([])
    expect(report.reachableItems).toEqual([])
    expect(report.hasCritical).toBe(false)
  })

  it('groups findings by check in the documented order', () => {
    const report = analyzeSoftLocks(
      makeInput({
        puzzles: [
          makePuzzle({ id: 'door', requiredItems: ['x'], rewards: ['y'] }),
          makePuzzle({ id: 'vault', requiredItems: ['y'], rewards: ['x'] }),
          makePuzzle({ id: 'lamp', requiredItems: ['oil'] }),
        ],
        milestones: [makeMilestone({ id: 'escape', requiredItems: ['ghost-key'], requiredPuzzles: ['ghost-puzzle'] })],
      }),
    )
    expect(report.findings.map((finding) => finding.code)).toEqual([
      'unreachable-milestone-item',
      'puzzle-unreachable-item',
      'mutual-deadlock',
      'unknown-puzzle-reference',
    ])
    expect(report.hasCritical).toBe(true)
  })

  it('reports reachable items in discovery order and duplicates once', () => {
    const report = analyzeSoftLocks(
      makeInput({
        items: ['a', 'b', 'a'],
        puzzles: [makePuzzle({ id: 'press', requiredItems: ['a'], rewards: ['c', 'a'] })],
      }),
    )
    expect(report.reachableItems).toEqual(['a', 'b', 'c'])
  })

  it('reaches rewards through several fixed-point passes', () => {
    const report = analyzeSoftLocks(
      makeInput({
        items: ['start'],
        puzzles: [
          makePuzzle({ id: 'third', requiredItems: ['second'], rewards: ['final'] }),
          makePuzzle({ id: 'second', requiredItems: ['first'], rewards: ['second'] }),
          makePuzzle({ id: 'first', requiredItems: ['start'], rewards: ['first'] }),
        ],
        milestones: [makeMilestone({ requiredItems: ['final'] })],
      }),
    )
    expect(report.findings).toEqual([])
    expect(report.reachableItems).toEqual(['start', 'first', 'second', 'final'])
  })

  it('the same input always yields the same report', () => {
    const input = makeInput({
      items: ['rusty-key'],
      puzzles: [makePuzzle({ id: 'unlock-door', requiredItems: ['rusty-key'], rewards: ['vault-key'] })],
      milestones: [makeMilestone({ id: 'escape', requiredItems: ['gold-key'], requiredPuzzles: ['ghost'] })],
    })
    expect(analyzeSoftLocks(input)).toEqual(analyzeSoftLocks(input))
  })

  it('does not mutate frozen inputs', () => {
    const puzzle = Object.freeze({
      id: 'lock',
      name: 'Lock',
      requiredItems: Object.freeze(['lamp']),
      rewards: Object.freeze(['gem']),
    })
    const milestone = Object.freeze({
      id: 'm1',
      name: 'First Steps',
      requiredItems: Object.freeze(['gem']),
      requiredPuzzles: Object.freeze(['lock']),
    })
    const items = Object.freeze(['lamp'])
    const input = Object.freeze({ items, puzzles: Object.freeze([puzzle]), milestones: Object.freeze([milestone]) })
    const report = analyzeSoftLocks(input)
    expect(report.findings).toEqual([])
    expect(report.reachableItems).toEqual(['lamp', 'gem'])
    expect(puzzle.requiredItems).toEqual(['lamp'])
    expect(milestone.requiredPuzzles).toEqual(['lock'])
    expect(items).toEqual(['lamp'])
  })
})
