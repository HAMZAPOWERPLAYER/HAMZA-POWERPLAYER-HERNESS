/**
 * Item and puzzle reachability analysis for game progression design.
 *
 * `analyzeSoftLocks` reads design-time definitions — the items the player
 * starts with, the items each puzzle requires and rewards, and the items and
 * puzzles each milestone requires — and reports the ways a player can get
 * stuck: a milestone requiring an item no source can ever yield, a puzzle
 * requiring an item that is neither pre-granted nor a reward of any other
 * puzzle, two puzzles that each need an item only the other rewards, and a
 * milestone naming a puzzle that does not exist. Callers adapt the runtime
 * models into these definitions: `PuzzleState.requiredItems` becomes
 * `requiredItems`, the items granted when a puzzle is solved become `rewards`,
 * and milestone objectives that name puzzles become `requiredPuzzles`.
 *
 * The analysis reads only the supplied definitions. It cannot see runtime
 * puzzle state, item consumption, timing, or completion paths outside the
 * definitions, so a finding marks a problem in the definitions and is not
 * runtime evidence that a player gets stuck. `mutual-deadlock` reports
 * two-puzzle cycles; longer cycles have no dedicated check, and a milestone
 * that requires an item behind one still appears as
 * `unreachable-milestone-item`. Every function is pure: it reads only its
 * arguments, performs no I/O, and keeps no state, so the same input always
 * yields the same result.
 *
 * @module @deepseek-ai/dsh-util-values/game-reliability
 */

/** One puzzle as a design-time requirement and reward definition. */
export interface PuzzleDefinition {
  /** Stable identifier. */
  readonly id: string
  /** Human-readable name. */
  readonly name: string
  /** Item ids the player must hold before the puzzle can be solved. */
  readonly requiredItems: readonly string[]
  /** Item ids granted when the puzzle is solved. */
  readonly rewards: readonly string[]
}

/** One milestone as a design-time requirement definition. */
export interface MilestoneDefinition {
  /** Stable identifier. */
  readonly id: string
  /** Human-readable name. */
  readonly name: string
  /** Item ids the player must hold for the milestone. */
  readonly requiredItems: readonly string[]
  /** Puzzle ids that must be solved for the milestone. */
  readonly requiredPuzzles: readonly string[]
}

/** Input models for {@link analyzeSoftLocks}. */
export interface SoftLockInput {
  /** Item ids obtainable with no puzzle solved: the starting inventory and any other pre-granted items. */
  readonly items: readonly string[]
  /** Puzzles with their item requirements and rewards. */
  readonly puzzles: readonly PuzzleDefinition[]
  /** Milestones with their item and puzzle requirements. */
  readonly milestones: readonly MilestoneDefinition[]
}

/** Stable identifier of the check that reported a soft-lock finding. */
export type SoftLockCode =
  /** A milestone requires an item that the reachability fixed point never reaches. */
  | 'unreachable-milestone-item'
  /** A puzzle requires an item that is neither pre-granted nor a reward of any other puzzle. */
  | 'puzzle-unreachable-item'
  /** Two puzzles each require an item that only the other puzzle rewards. */
  | 'mutual-deadlock'
  /** A milestone requires a puzzle id that no puzzle defines. */
  | 'unknown-puzzle-reference'

/** Severity of one soft-lock finding. */
export type SoftLockSeverity = 'error' | 'warning'

/** One soft-lock reported by {@link analyzeSoftLocks}. */
export interface SoftLockFinding {
  /** Stable identifier of the check that reported the finding. */
  readonly code: SoftLockCode
  /** Severity of the finding; every current check reports `error`, and no check reports `warning` today. */
  readonly severity: SoftLockSeverity
  /** Human-readable description of the soft-lock. */
  readonly message: string
  /** Id of the puzzle or milestone at fault; for `mutual-deadlock`, the two puzzle ids joined by ` & ` in input order. */
  readonly subject: string
  /** Actionable change that removes the reported soft-lock. */
  readonly suggestion: string
}

/** Result of {@link analyzeSoftLocks}. */
export interface SoftLockReport {
  /** Every finding in the documented stable order. */
  readonly findings: readonly SoftLockFinding[]
  /** Item ids reachable from the pre-granted items and puzzle rewards, in discovery order; a duplicated id appears once. */
  readonly reachableItems: readonly string[]
  /** Whether any finding has `error` severity. */
  readonly hasCritical: boolean
}

/**
 * Ids of the puzzles other than `selfId` that reward `item`.
 *
 * @param puzzles - puzzles to search.
 * @param item - item id to look for.
 * @param selfId - puzzle id excluded from the search.
 * @returns the ids of the other granting puzzles, in input order.
 */
function otherPuzzleGranters(
  puzzles: readonly PuzzleDefinition[],
  item: string,
  selfId: string,
): readonly string[] {
  const ids: string[] = []
  for (const puzzle of puzzles) {
    if (puzzle.id === selfId) continue
    if (puzzle.rewards.includes(item)) ids.push(puzzle.id)
  }
  return ids
}

/**
 * Find the first required item whose only possible granting puzzle is `sourceId`.
 *
 * @param requiredItems - item ids a puzzle requires, in listed order.
 * @param preGranted - item ids obtainable with no puzzle solved.
 * @param puzzles - every puzzle definition.
 * @param selfId - the puzzle that requires the item; its own rewards cannot help it.
 * @param sourceId - the one other puzzle that may grant the item.
 * @returns the first matching item id, or null when none matches.
 */
function soleOtherRewardItem(
  requiredItems: readonly string[],
  preGranted: ReadonlySet<string>,
  puzzles: readonly PuzzleDefinition[],
  selfId: string,
  sourceId: string,
): string | null {
  for (const item of requiredItems) {
    if (preGranted.has(item)) continue
    const granters = otherPuzzleGranters(puzzles, item, selfId)
    if (granters.length === 1 && granters[0] === sourceId) return item
  }
  return null
}

/**
 * Analyze item and puzzle reachability and report soft-locks.
 *
 * Reachability is a fixed point over puzzle rewards: it starts from
 * `input.items` and repeatedly adds the rewards of every puzzle whose required
 * items are all reachable. Each pass either solves at least one previously
 * unsolved puzzle or the iteration stops, so the loop is bounded by the number
 * of puzzles plus one final pass. Findings are grouped by check in the order
 * `unreachable-milestone-item`, `puzzle-unreachable-item`, `mutual-deadlock`,
 * `unknown-puzzle-reference`; within a check they follow the input order of
 * the milestone or puzzle, then the order the item or puzzle ids are listed.
 * A `mutual-deadlock` pair is reported once, oriented by the earlier puzzle in
 * input order. The input arrays are never modified.
 *
 * @param input - pre-granted items, puzzles, and milestones to analyze.
 * @returns the findings in stable order, the reachable items in discovery order, and whether any finding has `error` severity.
 */
export function analyzeSoftLocks(input: SoftLockInput): SoftLockReport {
  const preGranted = new Set(input.items)
  const reachable: string[] = []
  const reachableSet = new Set<string>()
  const addReachable = (item: string): void => {
    if (!reachableSet.has(item)) {
      reachableSet.add(item)
      reachable.push(item)
    }
  }
  for (const item of input.items) addReachable(item)

  const solved = new Set<string>()
  let changed = true
  while (changed) {
    changed = false
    for (const puzzle of input.puzzles) {
      if (solved.has(puzzle.id)) continue
      if (!puzzle.requiredItems.every((item) => reachableSet.has(item))) continue
      solved.add(puzzle.id)
      changed = true
      for (const reward of puzzle.rewards) addReachable(reward)
    }
  }

  const puzzleIds = new Set(input.puzzles.map((puzzle) => puzzle.id))
  const findings: SoftLockFinding[] = []

  for (const milestone of input.milestones) {
    for (const item of milestone.requiredItems) {
      if (reachableSet.has(item)) continue
      findings.push({
        code: 'unreachable-milestone-item',
        severity: 'error',
        message: `Milestone ${milestone.id} requires item ${item}, which no reachable source grants.`,
        subject: milestone.id,
        suggestion: `Add ${item} to the starting items or reward it from a puzzle the player can solve.`,
      })
    }
  }

  for (const puzzle of input.puzzles) {
    for (const item of puzzle.requiredItems) {
      if (preGranted.has(item)) continue
      if (otherPuzzleGranters(input.puzzles, item, puzzle.id).length > 0) continue
      const selfDeadlock = puzzle.rewards.includes(item)
      findings.push({
        code: 'puzzle-unreachable-item',
        severity: 'error',
        message: selfDeadlock
          ? `Puzzle ${puzzle.id} requires item ${item}, which only ${puzzle.id} itself rewards; the puzzle can never hold its own reward before solving.`
          : `Puzzle ${puzzle.id} requires item ${item}, which no puzzle rewards and the starting items omit.`,
        subject: puzzle.id,
        suggestion: `Add ${item} to the starting items or reward it from a different puzzle the player can solve.`,
      })
    }
  }

  for (const [aIndex, a] of input.puzzles.entries()) {
    for (const [bIndex, b] of input.puzzles.entries()) {
      if (bIndex <= aIndex) continue
      const itemA = soleOtherRewardItem(a.requiredItems, preGranted, input.puzzles, a.id, b.id)
      if (itemA === null) continue
      const itemB = soleOtherRewardItem(b.requiredItems, preGranted, input.puzzles, b.id, a.id)
      if (itemB === null) continue
      findings.push({
        code: 'mutual-deadlock',
        severity: 'error',
        message: `Puzzles ${a.id} and ${b.id} deadlock each other: ${a.id} requires ${itemA}, which only ${b.id} rewards, and ${b.id} requires ${itemB}, which only ${a.id} rewards.`,
        subject: `${a.id} & ${b.id}`,
        suggestion: `Add ${itemA} or ${itemB} to the starting items or reward it from a puzzle outside the pair.`,
      })
    }
  }

  for (const milestone of input.milestones) {
    for (const puzzleId of milestone.requiredPuzzles) {
      if (puzzleIds.has(puzzleId)) continue
      findings.push({
        code: 'unknown-puzzle-reference',
        severity: 'error',
        message: `Milestone ${milestone.id} requires puzzle ${puzzleId}, which no puzzle defines.`,
        subject: milestone.id,
        suggestion: `Define puzzle ${puzzleId} or remove it from milestone ${milestone.id}.`,
      })
    }
  }

  return {
    findings,
    reachableItems: reachable,
    hasCritical: findings.some((finding) => finding.severity === 'error'),
  }
}
