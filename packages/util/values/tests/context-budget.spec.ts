import { describe, expect, it } from 'vitest'
import {
  allocateBudget,
  fitsInBudget,
  isOverBudget,
  remainingTokens,
  trimToBudget,
  utilizationPercent,
  type ContextBudget,
} from '../src/context-budget.ts'

describe('remainingTokens', () => {
  it('positive remainder', () => {
    const b: ContextBudget = { maxTokens: 10, usedTokens: 3 }
    expect(remainingTokens(b)).toBe(7)
  })
  it('zero when exact', () => {
    const b: ContextBudget = { maxTokens: 5, usedTokens: 5 }
    expect(remainingTokens(b)).toBe(0)
  })
  it('clamps to zero when over', () => {
    const b: ContextBudget = { maxTokens: 5, usedTokens: 9 }
    expect(remainingTokens(b)).toBe(0)
  })
  it('max <= 0 yields zero', () => {
    const b: ContextBudget = { maxTokens: 0, usedTokens: 0 }
    expect(remainingTokens(b)).toBe(0)
    const b2: ContextBudget = { maxTokens: -3, usedTokens: 0 }
    expect(remainingTokens(b2)).toBe(0)
  })
})

describe('isOverBudget', () => {
  it('false when under', () => {
    expect(isOverBudget({ maxTokens: 10, usedTokens: 9 })).toBe(false)
  })
  it('false when exact', () => {
    expect(isOverBudget({ maxTokens: 10, usedTokens: 10 })).toBe(false)
  })
  it('true when over', () => {
    expect(isOverBudget({ maxTokens: 10, usedTokens: 11 })).toBe(true)
  })
})

describe('fitsInBudget', () => {
  it('true on exact fit', () => {
    expect(fitsInBudget({ maxTokens: 10, usedTokens: 7 }, 3)).toBe(true)
  })
  it('false on overflow', () => {
    expect(fitsInBudget({ maxTokens: 10, usedTokens: 7 }, 4)).toBe(false)
  })
  it('max <= 0', () => {
    expect(fitsInBudget({ maxTokens: 0, usedTokens: 0 }, 0)).toBe(true)
    expect(fitsInBudget({ maxTokens: 0, usedTokens: 0 }, 1)).toBe(false)
  })
})

describe('utilizationPercent', () => {
  it('precise ratio', () => {
    expect(utilizationPercent({ maxTokens: 4, usedTokens: 1 })).toBe(25)
  })
  it('zero when max <= 0', () => {
    expect(utilizationPercent({ maxTokens: 0, usedTokens: 5 })).toBe(0)
    expect(utilizationPercent({ maxTokens: -1, usedTokens: 5 })).toBe(0)
  })
  it('can exceed 100 when over', () => {
    expect(utilizationPercent({ maxTokens: 4, usedTokens: 8 })).toBe(200)
  })
})

describe('trimToBudget', () => {
  it('empty', () => {
    expect(trimToBudget([], 10)).toEqual([])
  })
  it('exact fit', () => {
    expect(trimToBudget([2, 3, 5], 10)).toEqual([2, 3, 5])
  })
  it('stops on overflow', () => {
    expect(trimToBudget([4, 4, 2], 6)).toEqual([4])
  })
  it('max <= 0', () => {
    expect(trimToBudget([1, 2], 0)).toEqual([])
    expect(trimToBudget([0, 0], 0)).toEqual([0, 0])
  })
})

describe('allocateBudget', () => {
  it('empty weights', () => {
    expect(allocateBudget(10, [])).toEqual([])
  })
  it('zero sum weights', () => {
    expect(allocateBudget(10, [0, 0])).toEqual([0, 0])
  })
  it('single weight gets all', () => {
    expect(allocateBudget(10, [5])).toEqual([10])
  })
  it('remainder to last', () => {
    expect(allocateBudget(10, [1, 1, 1])).toEqual([3, 3, 4])
  })
  it('exact-ish', () => {
    expect(allocateBudget(7, [1, 1])).toEqual([3, 4])
  })
})
