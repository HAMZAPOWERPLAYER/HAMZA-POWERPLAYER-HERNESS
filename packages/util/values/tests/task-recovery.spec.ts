import { describe, expect, it } from 'vitest'
import {
  buildPartialSuccessReport,
  isSafeToRetry,
  nextResumableStep,
  type TaskStep,
} from '../src/task-recovery.ts'

const step = (id: string, status: TaskStep['status'], idempotent = true): TaskStep => ({
  id,
  name: `step-${id}`,
  status,
  idempotent,
  ...(id === 'a' ? { changedFiles: ['src/a.ts'] } : {}),
})

describe('buildPartialSuccessReport', () => {
  it('categorizes steps correctly', () => {
    const steps = [step('a', 'completed'), step('b', 'failed'), step('c', 'interrupted'), step('d', 'not-started')]
    const report = buildPartialSuccessReport(steps)
    expect(report.completed).toHaveLength(1)
    expect(report.failed).toHaveLength(1)
    expect(report.interrupted).toHaveLength(1)
    expect(report.notStarted).toHaveLength(1)
  })

  it('collects changed files from completed steps', () => {
    const steps = [step('a', 'completed'), step('b', 'completed')]
    const report = buildPartialSuccessReport(steps)
    expect(report.changedFiles).toContain('src/a.ts')
  })

  it('is resumable when steps are interrupted or idempotent failures exist', () => {
    const report = buildPartialSuccessReport([step('a', 'interrupted')])
    expect(report.resumable).toBe(true)
  })

  it('is not resumable when only non-idempotent failures remain', () => {
    const report = buildPartialSuccessReport([step('a', 'failed', false)])
    expect(report.resumable).toBe(false)
  })

  it('provides recovery options', () => {
    const report = buildPartialSuccessReport([step('a', 'interrupted')])
    expect(report.recoveryOptions.length).toBeGreaterThan(0)
  })

  it('reports empty for no steps', () => {
    const report = buildPartialSuccessReport([])
    expect(report.completed).toEqual([])
    expect(report.changedFiles).toEqual([])
    expect(report.resumable).toBe(false)
  })
})

describe('isSafeToRetry', () => {
  it('allows retrying idempotent failed steps when source unchanged', () => {
    expect(isSafeToRetry(step('a', 'failed', true), false)).toBe(true)
  })

  it('denies retrying non-idempotent failed steps', () => {
    expect(isSafeToRetry(step('a', 'failed', false), false)).toBe(false)
  })

  it('denies retry when source changed', () => {
    expect(isSafeToRetry(step('a', 'failed', true), true)).toBe(false)
  })

  it('denies retry for completed steps', () => {
    expect(isSafeToRetry(step('a', 'completed', true), false)).toBe(false)
  })
})

describe('nextResumableStep', () => {
  it('returns the first non-completed step', () => {
    const steps = [step('a', 'completed'), step('b', 'interrupted'), step('c', 'not-started')]
    expect(nextResumableStep(steps)?.id).toBe('b')
  })

  it('returns null when all completed', () => {
    expect(nextResumableStep([step('a', 'completed')])).toBeNull()
  })
})
