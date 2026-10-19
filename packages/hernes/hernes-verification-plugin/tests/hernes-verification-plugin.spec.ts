import { describe, expect, it } from 'vitest'
import { HernesVerificationService } from '../src/index.ts'

describe('HernesVerificationService', () => {
  it('evaluates a claim with no evidence as unverified', () => {
    const svc = new HernesVerificationService(
      {} as unknown as { on?: unknown; effect?: unknown; set?: unknown },
      { enforceVerification: true, maxRetries: 3 },
    )
    const result = svc.evaluateClaim({
      claimId: 'c1',
      claimText: 'tests pass',
      requiredEvidenceTypes: ['unit-test'],
      actualEvidence: [],
    })
    expect(result.state).toBe('unverified')
    expect(svc.isClaimVerified(result)).toBe(false)
  })

  it('evaluates a claim with fact-grade evidence as verified', () => {
    const svc = new HernesVerificationService(
      {} as unknown as { on?: unknown; effect?: unknown; set?: unknown },
      { enforceVerification: true, maxRetries: 3 },
    )
    const result = svc.evaluateClaim({
      claimId: 'c2',
      claimText: 'project compiles',
      requiredEvidenceTypes: ['type-check'],
      actualEvidence: [
        {
          record: { id: 'ev-1', category: 'verified-command', subject: 'tsc exit 0' },
          type: 'type-check',
        },
      ],
    })
    expect(result.state).toBe('verified')
    expect(svc.isClaimVerified(result)).toBe(true)
  })

  it('creates a tool result envelope', () => {
    const svc = new HernesVerificationService(
      {} as unknown as { on?: unknown; effect?: unknown; set?: unknown },
      { enforceVerification: true, maxRetries: 3 },
    )
    const result = svc.createToolResult({
      invocationId: 'inv-1',
      action: 'tsc',
      attempted: true,
      started: true,
      completed: true,
      exitStatus: 0,
      errors: [],
      mocked: false,
    })
    expect(svc.isToolResultSuccessful(result)).toBe(true)
  })

  it('rejects a mocked result', () => {
    const svc = new HernesVerificationService(
      {} as unknown as { on?: unknown; effect?: unknown; set?: unknown },
      { enforceVerification: true, maxRetries: 3 },
    )
    const result = svc.createToolResult({
      invocationId: 'inv-2',
      action: 'npm test',
      attempted: true,
      started: true,
      completed: true,
      exitStatus: 0,
      errors: [],
      mocked: true,
    })
    expect(svc.isToolResultSuccessful(result)).toBe(false)
  })
})
