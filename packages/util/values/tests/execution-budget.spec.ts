import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EXECUTION_BUDGET,
  consumeRetry,
  consumeToolCall,
  enterConcurrency,
  exhaustedDimensions,
  isBudgetExhausted,
  leaveConcurrency,
  updateContextTokens,
  updateElapsed,
  type ExecutionBudget,
} from '../src/execution-budget.ts'

describe('DEFAULT_EXECUTION_BUDGET', () => {
  it('has conservative defaults', () => {
    expect(DEFAULT_EXECUTION_BUDGET.maxToolCalls).toBe(50)
    expect(DEFAULT_EXECUTION_BUDGET.maxRetries).toBe(5)
    expect(DEFAULT_EXECUTION_BUDGET.maxElapsedMs).toBe(300000)
    expect(DEFAULT_EXECUTION_BUDGET.maxConcurrency).toBe(4)
  })
})

describe('isBudgetExhausted', () => {
  it('reports false for a fresh budget', () => {
    expect(isBudgetExhausted(DEFAULT_EXECUTION_BUDGET)).toBe(false)
  })

  it('reports true when tool calls are exhausted', () => {
    const budget: ExecutionBudget = { ...DEFAULT_EXECUTION_BUDGET, toolCallsConsumed: 50 }
    expect(isBudgetExhausted(budget)).toBe(true)
  })

  it('reports true when retries are exhausted', () => {
    const budget: ExecutionBudget = { ...DEFAULT_EXECUTION_BUDGET, retriesConsumed: 5 }
    expect(isBudgetExhausted(budget)).toBe(true)
  })

  it('reports true when elapsed time is exhausted', () => {
    const budget: ExecutionBudget = { ...DEFAULT_EXECUTION_BUDGET, elapsedMs: 300000 }
    expect(isBudgetExhausted(budget)).toBe(true)
  })

  it('reports true when context tokens are exhausted', () => {
    const budget: ExecutionBudget = { ...DEFAULT_EXECUTION_BUDGET, contextTokens: 100000 }
    expect(isBudgetExhausted(budget)).toBe(true)
  })

  it('reports true when concurrency is exhausted', () => {
    const budget: ExecutionBudget = { ...DEFAULT_EXECUTION_BUDGET, concurrency: 4 }
    expect(isBudgetExhausted(budget)).toBe(true)
  })
})

describe('exhaustedDimensions', () => {
  it('lists exhausted dimensions', () => {
    const budget: ExecutionBudget = { ...DEFAULT_EXECUTION_BUDGET, toolCallsConsumed: 50, concurrency: 4 }
    expect(exhaustedDimensions(budget)).toContain('tool-calls')
    expect(exhaustedDimensions(budget)).toContain('concurrency')
    expect(exhaustedDimensions(budget)).not.toContain('retries')
  })

  it('is empty for a fresh budget', () => {
    expect(exhaustedDimensions(DEFAULT_EXECUTION_BUDGET)).toEqual([])
  })
})

describe('consumeToolCall', () => {
  it('increments tool calls and returns a new object', () => {
    const next = consumeToolCall(DEFAULT_EXECUTION_BUDGET)
    expect(next).not.toBe(DEFAULT_EXECUTION_BUDGET)
    expect(next.toolCallsConsumed).toBe(1)
    expect(DEFAULT_EXECUTION_BUDGET.toolCallsConsumed).toBe(0)
  })
})

describe('consumeRetry', () => {
  it('increments retries and returns a new object', () => {
    const next = consumeRetry(DEFAULT_EXECUTION_BUDGET)
    expect(next.retriesConsumed).toBe(1)
    expect(DEFAULT_EXECUTION_BUDGET.retriesConsumed).toBe(0)
  })
})

describe('updateElapsed', () => {
  it('updates elapsed time', () => {
    const next = updateElapsed(DEFAULT_EXECUTION_BUDGET, 1000)
    expect(next.elapsedMs).toBe(1000)
    expect(next.toolCallsConsumed).toBe(DEFAULT_EXECUTION_BUDGET.toolCallsConsumed)
  })
})

describe('updateContextTokens', () => {
  it('updates context tokens', () => {
    const next = updateContextTokens(DEFAULT_EXECUTION_BUDGET, 4000)
    expect(next.contextTokens).toBe(4000)
  })
})

describe('enterConcurrency / leaveConcurrency', () => {
  it('increments concurrency', () => {
    const next = enterConcurrency(DEFAULT_EXECUTION_BUDGET)
    expect(next?.concurrency).toBe(1)
  })

  it('returns null when at the limit', () => {
    const atLimit: ExecutionBudget = { ...DEFAULT_EXECUTION_BUDGET, concurrency: 4 }
    expect(enterConcurrency(atLimit)).toBeNull()
  })

  it('decrements concurrency but never below zero', () => {
    const zero: ExecutionBudget = { ...DEFAULT_EXECUTION_BUDGET, concurrency: 0 }
    const next = leaveConcurrency(zero)
    expect(next.concurrency).toBe(0)
  })
})
