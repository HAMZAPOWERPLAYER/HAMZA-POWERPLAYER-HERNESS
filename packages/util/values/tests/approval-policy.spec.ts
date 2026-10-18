import { describe, expect, it } from 'vitest'
import { approvalExplanation, decideApproval, type ApprovalContext } from '../src/approval-policy.ts'
import type { RiskLevel } from '../src/tool-risk.ts'

const ALL_RISKS: readonly RiskLevel[] = ['low', 'medium', 'high', 'critical']
const ALL_TRUST: readonly boolean[] = [true, false]

function context(overrides: Partial<ApprovalContext> = {}): ApprovalContext {
  return { risk: 'low', trustedWorkspace: false, dryRun: false, userApproved: false, ...overrides }
}

describe('decideApproval', () => {
  it('auto-approves every dry run, trusted or not', () => {
    for (const risk of ALL_RISKS) {
      for (const trustedWorkspace of ALL_TRUST) {
        expect(decideApproval(context({ risk, trustedWorkspace, dryRun: true }))).toBe('auto')
      }
    }
  })
  it('auto-approves an explicit prior user approval at any risk', () => {
    for (const risk of ALL_RISKS) {
      for (const trustedWorkspace of ALL_TRUST) {
        expect(decideApproval(context({ risk, trustedWorkspace, userApproved: true }))).toBe('auto')
      }
    }
  })
  it('requires approval for high and critical risk in either trust state', () => {
    for (const risk of ['high', 'critical'] as const) {
      for (const trustedWorkspace of ALL_TRUST) {
        expect(decideApproval(context({ risk, trustedWorkspace }))).toBe('require-approval')
      }
    }
  })
  it('auto-approves medium risk only in a trusted workspace', () => {
    expect(decideApproval(context({ risk: 'medium', trustedWorkspace: true }))).toBe('auto')
    expect(decideApproval(context({ risk: 'medium', trustedWorkspace: false }))).toBe('require-approval')
  })
  it('auto-approves low risk in either trust state', () => {
    for (const trustedWorkspace of ALL_TRUST) {
      expect(decideApproval(context({ risk: 'low', trustedWorkspace }))).toBe('auto')
    }
  })
  it('never returns deny', () => {
    for (const risk of ALL_RISKS) {
      for (const trustedWorkspace of ALL_TRUST) {
        for (const dryRun of ALL_TRUST) {
          for (const userApproved of ALL_TRUST) {
            const decision = decideApproval(context({ risk, trustedWorkspace, dryRun, userApproved }))
            expect(['auto', 'require-approval']).toContain(decision)
          }
        }
      }
    }
  })
})

describe('approvalExplanation', () => {
  it('explains a dry run', () => {
    const ctx = context({ risk: 'critical', trustedWorkspace: false, dryRun: true })
    expect(approvalExplanation(ctx, 'auto')).toBe('Auto-approved: the invocation is a dry run and has no side effects.')
  })
  it('explains a prior user approval', () => {
    const ctx = context({ risk: 'high', trustedWorkspace: false, userApproved: true })
    expect(approvalExplanation(ctx, 'auto')).toBe('Auto-approved: the user already approved this invocation.')
  })
  it('explains high and critical risk by workspace trust', () => {
    expect(approvalExplanation(context({ risk: 'high', trustedWorkspace: false }), 'require-approval'))
      .toBe('Approval required: high risk requires approval outside a trusted workspace.')
    expect(approvalExplanation(context({ risk: 'critical', trustedWorkspace: true }), 'require-approval'))
      .toBe('Approval required: critical risk requires approval even in a trusted workspace.')
  })
  it('explains medium risk by workspace trust', () => {
    expect(approvalExplanation(context({ risk: 'medium', trustedWorkspace: true }), 'auto'))
      .toBe('Auto-approved: medium risk is allowed in a trusted workspace.')
    expect(approvalExplanation(context({ risk: 'medium', trustedWorkspace: false }), 'require-approval'))
      .toBe('Approval required: medium risk requires approval outside a trusted workspace.')
  })
  it('explains low risk', () => {
    const ctx = context({ risk: 'low', trustedWorkspace: false })
    expect(approvalExplanation(ctx, 'auto')).toBe('Auto-approved: low risk needs no approval.')
  })
  it('attributes deny to the higher layer that applied it', () => {
    const ctx = context({ risk: 'critical', trustedWorkspace: true })
    expect(approvalExplanation(ctx, 'deny')).toBe('Denied: a higher-level policy forbids this invocation.')
  })
  it('is deterministic', () => {
    const ctx = context({ risk: 'medium', trustedWorkspace: false })
    expect(approvalExplanation(ctx, 'require-approval')).toBe(approvalExplanation(ctx, 'require-approval'))
  })
  it('names the risk level for decisions the risk drives', () => {
    for (const risk of ALL_RISKS) {
      for (const trustedWorkspace of ALL_TRUST) {
        const ctx = context({ risk, trustedWorkspace })
        expect(approvalExplanation(ctx, decideApproval(ctx))).toContain(`${risk} risk`)
      }
    }
  })
})
