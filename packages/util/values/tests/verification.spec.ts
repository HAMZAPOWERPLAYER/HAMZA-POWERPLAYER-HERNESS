import { describe, expect, it } from 'vitest'
import {
  classifyClaimSupport,
  createVerificationEntry,
  isClaimSupported,
  isVerificationSuccessful,
  type EvidenceRecord,
} from '../src/index.ts'

describe('evidence classification', () => {
  it('returns unknown for a claim with no evidence', () => {
    expect(classifyClaimSupport({ text: 'done', evidence: [] })).toBe('unknown')
    expect(isClaimSupported({ text: 'done', evidence: [] })).toBe(false)
  })

  it('picks the strongest category present', () => {
    const evidence: EvidenceRecord[] = [
      { id: '1', category: 'inferred', subject: 'guess' },
      { id: '2', category: 'verified-command', subject: 'test', source: 'pnpm test' },
    ]
    expect(classifyClaimSupport({ text: 'done', evidence })).toBe('verified-command')
    expect(isClaimSupported({ text: 'done', evidence })).toBe(true)
  })

  it('lets a failed verification override a passing one', () => {
    const evidence: EvidenceRecord[] = [
      { id: '1', category: 'verified-command', subject: 'test' },
      { id: '2', category: 'failed-verification', subject: 'build' },
    ]
    expect(classifyClaimSupport({ text: 'done', evidence })).toBe('failed-verification')
    expect(isClaimSupported({ text: 'done', evidence })).toBe(false)
  })
})

describe('verification ledger', () => {
  it('stamps a timestamp and reports success only on a zero exit', () => {
    const entry = createVerificationEntry({
      taskId: 't1',
      intendedChange: 'add feature',
      actualChange: 'added feature',
      verificationCommand: 'pnpm test',
      exitStatus: 0,
      outstandingIssues: [],
    })
    expect(typeof entry.timestamp).toBe('number')
    expect(isVerificationSuccessful(entry)).toBe(true)
  })

  it('is not successful when no command ran', () => {
    const entry = createVerificationEntry({
      taskId: 't2',
      intendedChange: 'x',
      actualChange: 'x',
      outstandingIssues: [],
    })
    expect(isVerificationSuccessful(entry)).toBe(false)
  })

  it('is not successful when outstanding issues remain', () => {
    const entry = createVerificationEntry({
      taskId: 't3',
      intendedChange: 'x',
      actualChange: 'x',
      verificationCommand: 'pnpm test',
      exitStatus: 0,
      outstandingIssues: ['flaky'],
    })
    expect(isVerificationSuccessful(entry)).toBe(false)
  })

  it('is not successful when the command exits non-zero', () => {
    const entry = createVerificationEntry({
      taskId: 't4',
      intendedChange: 'x',
      actualChange: 'x',
      verificationCommand: 'pnpm test',
      exitStatus: 1,
      outstandingIssues: [],
    })
    expect(isVerificationSuccessful(entry)).toBe(false)
  })

  it('honours an explicit timestamp', () => {
    const entry = createVerificationEntry({
      taskId: 't5',
      intendedChange: 'x',
      actualChange: 'x',
      outstandingIssues: [],
      timestamp: 12345,
    })
    expect(entry.timestamp).toBe(12345)
  })
})

describe('claim support flags', () => {
  it('reports false for non-fact-grade categories', () => {
    for (const category of ['inferred', 'assumed', 'unknown'] as const) {
      const evidence: EvidenceRecord[] = [{ id: '1', category, subject: 'x' }]
      expect(isClaimSupported({ text: 'x', evidence })).toBe(false)
    }
  })

  it('reports true for docs-supported claims', () => {
    const evidence: EvidenceRecord[] = [{ id: '1', category: 'supported-docs', subject: 'x' }]
    expect(isClaimSupported({ text: 'x', evidence })).toBe(true)
  })

  it('reports true for observed-source claims', () => {
    const evidence: EvidenceRecord[] = [{ id: '1', category: 'observed-source', subject: 'x' }]
    expect(isClaimSupported({ text: 'x', evidence })).toBe(true)
  })
})
