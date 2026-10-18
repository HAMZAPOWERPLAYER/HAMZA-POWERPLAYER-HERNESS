import { describe, expect, it } from 'vitest'
import {
  checkBudget,
  createUsage,
  formatBudgetStatus,
  recordUsage,
  type BudgetUsage,
} from '../src/budget-guard.ts'

describe('createUsage', () => {
  it('starts every counter at zero', () => {
    expect(createUsage()).toEqual({ tokens: 0, requests: 0, costUsd: 0 })
  })
})

describe('checkBudget', () => {
  it('allows usage when no limits are set', () => {
    const status = checkBudget({}, { tokens: 500, requests: 7, costUsd: 2.5 })
    expect(status.allowed).toBe(true)
    expect(status.exhausted).toEqual([])
    expect(status.usage).toEqual({ tokens: 500, requests: 7, costUsd: 2.5 })
    expect(status.limits).toEqual({})
  })

  it('leaves missing limits unconstrained', () => {
    const status = checkBudget({ maxTokens: 10 }, { tokens: 9, requests: 1000, costUsd: 99 })
    expect(status.allowed).toBe(true)
    expect(status.exhausted).toEqual([])
    expect(status.limits.maxRequests).toBeUndefined()
    expect(status.limits.maxCostUsd).toBeUndefined()
  })

  it('reports tokens exhausted at the limit', () => {
    const status = checkBudget({ maxTokens: 100 }, { tokens: 100, requests: 0, costUsd: 0 })
    expect(status.allowed).toBe(false)
    expect(status.exhausted).toEqual(['tokens'])
  })

  it('reports tokens exhausted above the limit', () => {
    const status = checkBudget({ maxTokens: 100 }, { tokens: 101, requests: 0, costUsd: 0 })
    expect(status.allowed).toBe(false)
    expect(status.exhausted).toEqual(['tokens'])
  })

  it('reports requests exhausted at and above the limit', () => {
    const atLimit = checkBudget({ maxRequests: 5 }, { tokens: 0, requests: 5, costUsd: 0 })
    const aboveLimit = checkBudget({ maxRequests: 5 }, { tokens: 0, requests: 6, costUsd: 0 })
    expect(atLimit.allowed).toBe(false)
    expect(atLimit.exhausted).toEqual(['requests'])
    expect(aboveLimit.exhausted).toEqual(['requests'])
  })

  it('reports cost exhausted at and above the limit', () => {
    const atLimit = checkBudget({ maxCostUsd: 0.25 }, { tokens: 0, requests: 0, costUsd: 0.25 })
    const aboveLimit = checkBudget({ maxCostUsd: 0.25 }, { tokens: 0, requests: 0, costUsd: 0.26 })
    expect(atLimit.allowed).toBe(false)
    expect(atLimit.exhausted).toEqual(['cost'])
    expect(aboveLimit.exhausted).toEqual(['cost'])
  })

  it('reports every exhausted limit in tokens, requests, cost order', () => {
    const status = checkBudget(
      { maxTokens: 1, maxRequests: 2, maxCostUsd: 0.5 },
      { tokens: 1, requests: 2, costUsd: 0.5 },
    )
    expect(status.allowed).toBe(false)
    expect(status.exhausted).toEqual(['tokens', 'requests', 'cost'])
  })
})

describe('recordUsage', () => {
  it('adds every provided delta', () => {
    expect(recordUsage(createUsage(), { tokens: 10, requests: 1, costUsd: 0.05 }))
      .toEqual({ tokens: 10, requests: 1, costUsd: 0.05 })
  })

  it('accumulates across calls without mutating earlier usage', () => {
    const first = recordUsage(createUsage(), { tokens: 10, requests: 1, costUsd: 0.05 })
    const second = recordUsage(first, { tokens: 5, requests: 2, costUsd: 0.05 })
    expect(second).toEqual({ tokens: 15, requests: 3, costUsd: 0.1 })
    expect(first).toEqual({ tokens: 10, requests: 1, costUsd: 0.05 })
  })

  it('leaves omitted counters unchanged', () => {
    const usage: BudgetUsage = { tokens: 1, requests: 2, costUsd: 0.5 }
    expect(recordUsage(usage, { tokens: 4 })).toEqual({ tokens: 5, requests: 2, costUsd: 0.5 })
    expect(recordUsage(usage, {})).toEqual({ tokens: 1, requests: 2, costUsd: 0.5 })
  })

  it('accepts zero deltas', () => {
    expect(recordUsage(createUsage(), { tokens: 0, requests: 0, costUsd: 0 }))
      .toEqual({ tokens: 0, requests: 0, costUsd: 0 })
  })

  it('throws on a negative delta', () => {
    expect(() => recordUsage(createUsage(), { tokens: -1 }))
      .toThrow('budget delta tokens must be non-negative: -1')
    expect(() => recordUsage(createUsage(), { requests: -2 }))
      .toThrow('budget delta requests must be non-negative: -2')
    expect(() => recordUsage(createUsage(), { costUsd: -0.01 }))
      .toThrow('budget delta costUsd must be non-negative: -0.01')
  })
})

describe('formatBudgetStatus', () => {
  it('summarizes a within-budget status', () => {
    const status = checkBudget({ maxTokens: 100, maxRequests: 5 }, { tokens: 10, requests: 2, costUsd: 0.1 })
    expect(formatBudgetStatus(status)).toBe('within budget (tokens 10/100, requests 2/5, cost $0.10/-)')
  })

  it('renders zero usage and unset limits with the $0.00/- shape', () => {
    const text = formatBudgetStatus(checkBudget({}, createUsage()))
    expect(text).toBe('within budget (tokens 0/-, requests 0/-, cost $0.00/-)')
    expect(text).toContain('$0.00/-')
  })

  it('names the exhausted limits', () => {
    const status = checkBudget({ maxTokens: 4, maxCostUsd: 0.1 }, { tokens: 4, requests: 0, costUsd: 0.1 })
    const text = formatBudgetStatus(status)
    expect(text).toContain('exhausted: tokens, cost')
    expect(text).toBe('exhausted: tokens, cost (tokens 4/4, requests 0/-, cost $0.10/$0.10)')
  })

  it('formats a set cost limit with two decimals', () => {
    const status = checkBudget({ maxCostUsd: 5 }, createUsage())
    expect(formatBudgetStatus(status)).toBe('within budget (tokens 0/-, requests 0/-, cost $0.00/$5.00)')
  })
})
