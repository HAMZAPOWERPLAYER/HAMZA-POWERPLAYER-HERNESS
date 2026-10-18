import { describe, expect, it } from 'vitest'
import {
  createCompletionReport,
  hasVerificationFailure,
  isCompletionVerified,
} from '../src/index.ts'

describe('createCompletionReport', () => {
  it('applies defaults', () => {
    const r = createCompletionReport({ taskId: 't1' })
    expect(r.filesModified).toEqual([])
    expect(r.buildStatus).toBe('not-run')
    expect(typeof r.timestamp).toBe('number')
  })
  it('honours provided fields', () => {
    const r = createCompletionReport({
      taskId: 't2',
      filesModified: ['a.ts'],
      buildStatus: 'passed',
      verificationOutcomes: [{ command: 'pnpm test', exitStatus: 0 }],
      timestamp: 99,
    })
    expect(r.filesModified).toEqual(['a.ts'])
    expect(r.timestamp).toBe(99)
  })
})

describe('isCompletionVerified', () => {
  it('false when build not passed', () => {
    const r = createCompletionReport({ taskId: 't', buildStatus: 'passed', verificationOutcomes: [{ command: 'x', exitStatus: 0 }] })
    // mutate via new report with failed build
    const r2 = createCompletionReport({ taskId: 't', buildStatus: 'failed', verificationOutcomes: [{ command: 'x', exitStatus: 0 }] })
    expect(isCompletionVerified(r)).toBe(true)
    expect(isCompletionVerified(r2)).toBe(false)
  })
  it('false when no verification ran', () => {
    const r = createCompletionReport({ taskId: 't', buildStatus: 'passed' })
    expect(isCompletionVerified(r)).toBe(false)
  })
  it('false when a command failed', () => {
    const r = createCompletionReport({ taskId: 't', buildStatus: 'passed', verificationOutcomes: [{ command: 'x', exitStatus: 1 }] })
    expect(isCompletionVerified(r)).toBe(false)
  })
  it('false when remaining work exists', () => {
    const r = createCompletionReport({ taskId: 't', buildStatus: 'passed', verificationOutcomes: [{ command: 'x', exitStatus: 0 }], remainingWork: ['more'] })
    expect(isCompletionVerified(r)).toBe(false)
  })
})

describe('hasVerificationFailure', () => {
  it('true when non-zero exit present', () => {
    const r = createCompletionReport({ taskId: 't', verificationOutcomes: [{ command: 'x', exitStatus: 1 }] })
    expect(hasVerificationFailure(r)).toBe(true)
  })
  it('false when all zero', () => {
    const r = createCompletionReport({ taskId: 't', verificationOutcomes: [{ command: 'x', exitStatus: 0 }] })
    expect(hasVerificationFailure(r)).toBe(false)
  })
  it('false when none ran', () => {
    const r = createCompletionReport({ taskId: 't' })
    expect(hasVerificationFailure(r)).toBe(false)
  })
})
