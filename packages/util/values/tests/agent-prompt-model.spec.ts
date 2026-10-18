import { describe, expect, it } from 'vitest'
import { assemblePrompt, formatPrompt, promptSectionNames, type PromptSection } from '../src/agent-prompt-model.ts'

function section(name: string, content: string, priority: number): PromptSection {
  return { name, content, priority }
}

describe('assemblePrompt', () => {
  it('returns an empty assembly for no sections', () => {
    const a = assemblePrompt([], 10)
    expect(a.sections).toEqual([])
    expect(a.dropped).toEqual([])
    expect(a.estimatedTokens).toBe(0)
    expect(a.withinBudget).toBe(true)
  })

  it('throws for a negative budget', () => {
    expect(() => assemblePrompt([section('a', 'abcd', 1)], -1)).toThrow('budgetTokens must be non-negative')
  })

  it('includes every section when the budget is generous', () => {
    const a = assemblePrompt([section('a', 'abcd', 1), section('b', 'abcd', 2)], 100)
    expect(a.withinBudget).toBe(true)
    expect(a.dropped).toEqual([])
    expect(a.estimatedTokens).toBe(6)
  })

  it('orders included sections by descending priority', () => {
    const a = assemblePrompt([section('low', 'abcd', 1), section('high', 'abcd', 5)], 100)
    expect(a.sections.map((s) => s.name)).toEqual(['high', 'low'])
  })

  it('keeps input order for equal priority', () => {
    const a = assemblePrompt([section('first', 'abcd', 1), section('second', 'abcd', 1)], 100)
    expect(a.sections.map((s) => s.name)).toEqual(['first', 'second'])
  })

  it('drops the lowest priority section when the budget is tight', () => {
    const a = assemblePrompt([section('high', 'abcd', 10), section('low', 'abcd', 1)], 5)
    expect(a.sections.map((s) => s.name)).toEqual(['high'])
    expect(a.dropped).toEqual(['low'])
    expect(a.withinBudget).toBe(false)
  })

  it('drops multiple sections lowest priority first', () => {
    const a = assemblePrompt([section('high', 'abcd', 10), section('mid', 'abcd', 5), section('low', 'abcd', 1)], 5)
    expect(a.dropped).toEqual(['low', 'mid'])
  })

  it('counts a separator only between included sections', () => {
    const a = assemblePrompt([section('a', 'abcd', 2), section('b', 'abcd', 1)], 100)
    expect(a.estimatedTokens).toBe(1 + 4 + 1)
  })

  it('includes a section exactly at the budget boundary', () => {
    const a = assemblePrompt([section('a', 'abcd', 1)], 1)
    expect(a.withinBudget).toBe(true)
    expect(a.sections).toHaveLength(1)
  })

  it('drops a section one token over the budget', () => {
    const a = assemblePrompt([section('a', 'abcd', 1)], 0)
    expect(a.withinBudget).toBe(false)
    expect(a.dropped).toEqual(['a'])
  })

  it('includes a high-priority large section and drops two low ones', () => {
    const a = assemblePrompt([section('high', 'abcdabcd', 10), section('low1', 'a', 1), section('low2', 'a', 1)], 4)
    expect(a.sections.map((s) => s.name)).toEqual(['high'])
    expect(a.dropped).toEqual(['low1', 'low2'])
  })

  it('reports estimatedTokens of the included sections only', () => {
    const a = assemblePrompt([section('a', 'abcd', 10), section('b', 'abcdabcd', 1)], 5)
    expect(a.estimatedTokens).toBe(1)
  })
})

describe('formatPrompt', () => {
  it('renders an empty assembly as an empty string', () => {
    expect(formatPrompt({ sections: [], dropped: [], estimatedTokens: 0, withinBudget: true })).toBe('')
  })

  it('joins included sections with a blank line', () => {
    const a = assemblePrompt([section('a', 'aaaa', 2), section('b', 'bbbb', 1)], 100)
    expect(formatPrompt(a)).toBe('aaaa\n\nbbbb')
  })
})

describe('promptSectionNames', () => {
  it('returns the included names in order', () => {
    const a = assemblePrompt([section('a', 'aaaa', 1), section('b', 'bbbb', 2)], 100)
    expect(promptSectionNames(a)).toEqual(['b', 'a'])
  })
})
