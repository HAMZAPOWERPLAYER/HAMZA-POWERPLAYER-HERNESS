import { describe, expect, it } from 'vitest'
import {
  createProgress,
  currentStep,
  formatProgress,
  isProgressComplete,
  progressCounts,
  updateStep,
} from '../src/progress-tracker.ts'

describe('createProgress', () => {
  it('creates every step in the pending state', () => {
    const progress = createProgress([
      { id: 'one', label: 'First' },
      { id: 'two', label: 'Second' },
    ])
    expect(progress).toEqual({
      steps: [
        { id: 'one', label: 'First', state: 'pending' },
        { id: 'two', label: 'Second', state: 'pending' },
      ],
    })
  })

  it('preserves the order of the supplied steps', () => {
    const progress = createProgress([
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta' },
      { id: 'c', label: 'Gamma' },
    ])
    expect(progress.steps.map((step) => step.id)).toEqual(['a', 'b', 'c'])
  })

  it('creates empty progress from no steps', () => {
    expect(createProgress([])).toEqual({ steps: [] })
  })
})

describe('updateStep', () => {
  it('updates the matching step in a new progress value', () => {
    const before = createProgress([
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta' },
    ])
    const after = updateStep(before, 'b', 'done')
    expect(after.steps[1]?.state).toBe('done')
    expect(after.steps[0]?.state).toBe('pending')
    expect(after).not.toBe(before)
  })

  it('leaves the input progress unchanged', () => {
    const before = createProgress([{ id: 'a', label: 'Alpha' }])
    updateStep(before, 'a', 'failed')
    expect(before.steps[0]?.state).toBe('pending')
  })

  it('applies every state', () => {
    let progress = createProgress([{ id: 'a', label: 'Alpha' }])
    for (const state of ['in-progress', 'done', 'failed', 'pending'] as const) {
      progress = updateStep(progress, 'a', state)
      expect(progress.steps[0]?.state).toBe(state)
    }
  })

  it('throws on an unknown id', () => {
    const progress = createProgress([{ id: 'a', label: 'Alpha' }])
    expect(() => updateStep(progress, 'missing', 'done')).toThrow(/unknown progress step/)
  })

  it('throws without changing the input progress', () => {
    const progress = createProgress([{ id: 'a', label: 'Alpha' }])
    expect(() => updateStep(progress, 'missing', 'done')).toThrow()
    expect(progress).toEqual({ steps: [{ id: 'a', label: 'Alpha', state: 'pending' }] })
  })
})

describe('progressCounts', () => {
  it('counts every state, including zeroes', () => {
    let progress = createProgress([
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta' },
      { id: 'c', label: 'Gamma' },
      { id: 'd', label: 'Delta' },
    ])
    progress = updateStep(progress, 'a', 'done')
    progress = updateStep(progress, 'b', 'in-progress')
    progress = updateStep(progress, 'c', 'failed')
    expect(progressCounts(progress)).toEqual({
      pending: 1,
      'in-progress': 1,
      done: 1,
      failed: 1,
    })
  })

  it('counts zero for empty progress', () => {
    expect(progressCounts(createProgress([]))).toEqual({
      pending: 0,
      'in-progress': 0,
      done: 0,
      failed: 0,
    })
  })
})

describe('isProgressComplete', () => {
  it('false for empty progress', () => {
    expect(isProgressComplete(createProgress([]))).toBe(false)
  })

  it('false when a step is pending', () => {
    const progress = createProgress([{ id: 'a', label: 'Alpha' }])
    expect(isProgressComplete(progress)).toBe(false)
  })

  it('false for mixed states', () => {
    let progress = createProgress([
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta' },
    ])
    progress = updateStep(progress, 'a', 'done')
    expect(isProgressComplete(progress)).toBe(false)
  })

  it('false when a step is in progress', () => {
    let progress = createProgress([{ id: 'a', label: 'Alpha' }])
    progress = updateStep(progress, 'a', 'in-progress')
    expect(isProgressComplete(progress)).toBe(false)
  })

  it('false when a step failed', () => {
    let progress = createProgress([
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta' },
    ])
    progress = updateStep(progress, 'a', 'done')
    progress = updateStep(progress, 'b', 'failed')
    expect(isProgressComplete(progress)).toBe(false)
  })

  it('true when every step is done', () => {
    let progress = createProgress([
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta' },
    ])
    progress = updateStep(progress, 'a', 'done')
    progress = updateStep(progress, 'b', 'done')
    expect(isProgressComplete(progress)).toBe(true)
  })
})

describe('currentStep', () => {
  it('prefers an in-progress step over an earlier pending step', () => {
    let progress = createProgress([
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta' },
      { id: 'c', label: 'Gamma' },
    ])
    progress = updateStep(progress, 'c', 'in-progress')
    expect(currentStep(progress)).toEqual({ id: 'c', label: 'Gamma', state: 'in-progress' })
  })

  it('returns the first in-progress step when several are in progress', () => {
    let progress = createProgress([
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta' },
    ])
    progress = updateStep(progress, 'a', 'in-progress')
    progress = updateStep(progress, 'b', 'in-progress')
    expect(currentStep(progress)?.id).toBe('a')
  })

  it('returns the first pending step when none is in progress', () => {
    let progress = createProgress([
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta' },
    ])
    progress = updateStep(progress, 'a', 'done')
    expect(currentStep(progress)?.id).toBe('b')
  })

  it('undefined for empty progress', () => {
    expect(currentStep(createProgress([]))).toBeUndefined()
  })

  it('undefined when every step is done or failed', () => {
    let progress = createProgress([
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta' },
    ])
    progress = updateStep(progress, 'a', 'done')
    progress = updateStep(progress, 'b', 'failed')
    expect(currentStep(progress)).toBeUndefined()
  })
})

describe('formatProgress', () => {
  it('renders all four markers in step order', () => {
    let progress = createProgress([
      { id: 'a', label: 'Done step' },
      { id: 'b', label: 'Failed step' },
      { id: 'c', label: 'Active step' },
      { id: 'd', label: 'Waiting step' },
    ])
    progress = updateStep(progress, 'a', 'done')
    progress = updateStep(progress, 'b', 'failed')
    progress = updateStep(progress, 'c', 'in-progress')
    expect(formatProgress(progress)).toBe(
      '[x] Done step\n[!] Failed step\n[>] Active step\n[ ] Waiting step',
    )
  })

  it('renders an empty string for empty progress', () => {
    expect(formatProgress(createProgress([]))).toBe('')
  })
})
