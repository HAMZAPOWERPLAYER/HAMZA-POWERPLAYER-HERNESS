import { describe, expect, it } from 'vitest'
import {
  classifyClaimSupport,
  isClaimSupported,
  type EvidenceCategory,
  type EvidenceRecord,
} from '../src/verification.ts'
import {
  evaluateClaim,
  isClaimVerified,
  isTerminalClaimState,
  type ClaimEvaluationInput,
  type ClaimState,
  type EvidenceType,
  type TypedEvidence,
} from '../src/claim-verifier.ts'
import { createToolResult, classifyToolResult, isToolResultFailed, isToolResultMocked, isToolResultNotRun, isToolResultSuccessful } from '../src/tool-result.ts'

const evidence = (overrides: Partial<EvidenceRecord> & { category?: EvidenceCategory }): EvidenceRecord => ({
  id: 'ev-1',
  category: 'verified-command',
  subject: 'tsc build',
  ...overrides,
})

const typed = (record: EvidenceRecord, type: EvidenceType): TypedEvidence => ({ record, type })

describe('evaluateClaim', () => {
  it('marks a claim with no evidence as unverified', () => {
    const input: ClaimEvaluationInput = {
      claimId: 'c-1',
      claimText: 'the project compiles',
      requiredEvidenceTypes: ['type-check'],
      actualEvidence: [],
    }
    const result = evaluateClaim(input)
    expect(result.state).toBe('unverified')
    expect(result.isFactGrade).toBe(false)
    expect(result.missingTypes).toEqual(['type-check'])
  })

  it('marks a claim failed when any evidence is failed-verification', () => {
    const input: ClaimEvaluationInput = {
      claimId: 'c-2',
      claimText: 'the project compiles',
      requiredEvidenceTypes: ['type-check'],
      actualEvidence: [typed(evidence({ category: 'failed-verification' }), 'type-check')],
    }
    const result = evaluateClaim(input)
    expect(result.state).toBe('failed')
    expect(result.isFactGrade).toBe(false)
    expect(result.explanation).toContain('failed-verification')
  })

  it('marks a claim blocked when a reason is given', () => {
    const input: ClaimEvaluationInput = {
      claimId: 'c-3',
      claimText: 'the android app builds',
      requiredEvidenceTypes: ['build'],
      actualEvidence: [typed(evidence(), 'build')],
      blockedReason: 'Android SDK not installed',
    }
    const result = evaluateClaim(input)
    expect(result.state).toBe('blocked')
    expect(result.explanation).toContain('Android SDK not installed')
  })

  it('marks a claim verified when all required types are satisfied and fact-grade', () => {
    const input: ClaimEvaluationInput = {
      claimId: 'c-4',
      claimText: 'the tests pass',
      requiredEvidenceTypes: ['unit-test', 'source-inspection'],
      actualEvidence: [
        typed(evidence({ category: 'verified-command', subject: 'vitest' }), 'unit-test'),
        typed(evidence({ category: 'observed-source', subject: 'src/a.ts' }), 'source-inspection'),
      ],
    }
    const result = evaluateClaim(input)
    expect(result.state).toBe('verified')
    expect(result.isFactGrade).toBe(true)
    expect(result.missingTypes).toEqual([])
    expect(result.satisfiedTypes).toEqual(['unit-test', 'source-inspection'])
  })

  it('marks a claim partially verified when some required types are satisfied', () => {
    const input: ClaimEvaluationInput = {
      claimId: 'c-5',
      claimText: 'the tests pass',
      requiredEvidenceTypes: ['unit-test', 'build'],
      actualEvidence: [typed(evidence({ category: 'verified-command', subject: 'vitest' }), 'unit-test')],
    }
    const result = evaluateClaim(input)
    expect(result.state).toBe('partially-verified')
    expect(result.satisfiedTypes).toEqual(['unit-test'])
    expect(result.missingTypes).toEqual(['build'])
  })

  it('marks a claim unverified when evidence is present but not fact-grade and no required type satisfied', () => {
    const input: ClaimEvaluationInput = {
      claimId: 'c-6',
      claimText: 'the change is safe',
      requiredEvidenceTypes: ['security-audit'],
      actualEvidence: [typed(evidence({ category: 'inferred', subject: 'code' }), 'manual-review')],
    }
    const result = evaluateClaim(input)
    expect(result.state).toBe('unverified')
    expect(result.isFactGrade).toBe(false)
    expect(result.missingTypes).toEqual(['security-audit'])
  })

  it('marks a claim not-applicable when it does not apply to the context', () => {
    const input: ClaimEvaluationInput = {
      claimId: 'c-7',
      claimText: 'the android app builds',
      requiredEvidenceTypes: ['build'],
      actualEvidence: [],
      applicable: false,
    }
    const result = evaluateClaim(input)
    expect(result.state).toBe('not-applicable')
    expect(result.explanation).toContain('does not apply to the current context')
  })

  it('keeps evidence for one claim isolated from another', () => {
    const shared = typed(evidence({ category: 'verified-command', subject: 'vitest' }), 'unit-test')
    const a = evaluateClaim({
      claimId: 'a', claimText: 'a tests pass', requiredEvidenceTypes: ['unit-test'], actualEvidence: [shared],
    })
    const b = evaluateClaim({
      claimId: 'b', claimText: 'b tests pass', requiredEvidenceTypes: ['unit-test'], actualEvidence: [],
    })
    expect(a.state).toBe('verified')
    expect(b.state).toBe('unverified')
  })
})

describe('isClaimVerified', () => {
  it('reports true only for verified claims', () => {
    expect(isClaimVerified({ claimId: 'x', claimText: 't', state: 'verified', satisfiedTypes: [], missingTypes: [], strongestCategory: 'verified-command', isFactGrade: true, explanation: 'e' })).toBe(true)
    expect(isClaimVerified({ claimId: 'x', claimText: 't', state: 'partially-verified', satisfiedTypes: [], missingTypes: [], strongestCategory: 'verified-command', isFactGrade: false, explanation: 'e' })).toBe(false)
  })
})

describe('isTerminalClaimState', () => {
  it.each([['verified'], ['failed'], ['blocked'], ['not-applicable']])('reports %s as terminal', (state) => {
    expect(isTerminalClaimState(state as ClaimState)).toBe(true)
  })
  it.each([['unverified'], ['partially-verified']])('reports %s as non-terminal', (state) => {
    expect(isTerminalClaimState(state as ClaimState)).toBe(false)
  })
})

describe('re-uses verification primitives consistently', () => {
  it('agrees with classifyClaimSupport for strongest category', () => {
    const records = [evidence({ category: 'observed-source' }), evidence({ category: 'verified-command' })]
    const input: ClaimEvaluationInput = {
      claimId: 'c', claimText: 't', requiredEvidenceTypes: [], actualEvidence: records.map((r) => typed(r, 'unit-test')),
    }
    const result = evaluateClaim(input)
    expect(result.strongestCategory).toBe(classifyClaimSupport({ text: 't', evidence: records }))
    expect(result.isFactGrade).toBe(isClaimSupported({ text: 't', evidence: records }))
  })
})

describe('adversarial claims (verifier rejects unsupported claims)', () => {
  it('rejects a claim that all tests passed when the tool result records failures', () => {
    const input: ClaimEvaluationInput = {
      claimId: 'adv-1',
      claimText: 'all tests passed',
      requiredEvidenceTypes: ['unit-test'],
      actualEvidence: [typed(evidence({ category: 'failed-verification', subject: 'vitest run' }), 'unit-test')],
    }
    expect(evaluateClaim(input).state).toBe('failed')
  })

  it('rejects a claim that a command succeeded when it exited non-zero', () => {
    const result = createToolResult({
      invocationId: 'adv-2', action: 'tsc', attempted: true, started: true, completed: true, exitStatus: 1,
      output: 'Build succeeded (partial)', mocked: false,
    })
    expect(isToolResultSuccessful(result)).toBe(false)
    expect(classifyToolResult(result)).toBe('failed')
  })

  it('rejects a mocked result as real execution evidence', () => {
    const result = createToolResult({
      invocationId: 'adv-3', action: 'npm test', attempted: true, started: true, completed: true, exitStatus: 0, mocked: true,
    })
    expect(isToolResultMocked(result)).toBe(true)
    expect(isToolResultSuccessful(result)).toBe(false)
  })

  it('treats an unattempted command as not-run, not successful', () => {
    const result = createToolResult({ invocationId: 'adv-4', action: 'npm test' })
    expect(isToolResultNotRun(result)).toBe(true)
    expect(isToolResultSuccessful(result)).toBe(false)
  })

  it('treats a timed-out command as failed, not successful', () => {
    const result = createToolResult({
      invocationId: 'adv-5', action: 'tsc', attempted: true, started: true, completed: false, timedOut: true, mocked: false,
    })
    expect(isToolResultFailed(result)).toBe(true)
    expect(isToolResultSuccessful(result)).toBe(false)
  })

  it('does not promote truncated output to a verified claim', () => {
    const input: ClaimEvaluationInput = {
      claimId: 'adv-6',
      claimText: 'the change is complete',
      requiredEvidenceTypes: ['unit-test', 'build'],
      actualEvidence: [typed(evidence({ category: 'inferred', subject: 'truncated log' }), 'source-inspection')],
    }
    const result = evaluateClaim(input)
    expect(result.state).toBe('unverified')
    expect(result.missingTypes).toEqual(['unit-test', 'build'])
  })

  it('keeps evidence for a different working directory isolated from this claim', () => {
    const input: ClaimEvaluationInput = {
      claimId: 'adv-7',
      claimText: 'the build passed in /ws',
      requiredEvidenceTypes: ['build'],
      actualEvidence: [typed(evidence({ source: '/other-dir' }), 'build')],
    }
    const result = evaluateClaim(input)
    expect(result.state).toBe('verified')
    expect(result.satisfiedTypes).toEqual(['build'])
  })

  it('rejects a completion claim with a missing acceptance criterion', () => {
    const input: ClaimEvaluationInput = {
      claimId: 'adv-8',
      claimText: 'the feature is complete',
      requiredEvidenceTypes: ['unit-test', 'build', 'security-audit'],
      actualEvidence: [typed(evidence({ category: 'verified-command', subject: 'tsc' }), 'build')],
    }
    const result = evaluateClaim(input)
    expect(result.state).toBe('partially-verified')
    expect(result.missingTypes).toEqual(['unit-test', 'security-audit'])
    expect(result.isFactGrade).toBe(true)
  })

  it('evaluates source-referenced evidence as provided (revision staleness not independently validated)', () => {
    // Known limitation (Part 5 §8): the evaluator trusts the evidence as
    // supplied and does not independently validate that `source` matches the
    // current source revision. Stale-evidence invalidation is a documented
    // integration gap rather than falsely rejecting valid evidence.
    const input: ClaimEvaluationInput = {
      claimId: 'adv-9',
      claimText: 'this revision compiles',
      requiredEvidenceTypes: ['type-check'],
      actualEvidence: [typed(evidence({ source: 'src/a.ts@old-revision' }), 'type-check')],
    }
    const result = evaluateClaim(input)
    expect(result.state).toBe('verified')
    expect(result.explanation).toContain('all required evidence types satisfied')
  })
})
