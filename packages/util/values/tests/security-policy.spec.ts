import { describe, expect, it } from 'vitest'
import { resolveAccess, decideInvocation, type SecurityPolicy } from '../src/security-policy.ts'

const POLICY: SecurityPolicy = {
  trustedRoots: ['src', 'docs'],
  deniedRoots: ['src/secrets', 'docs/private'],
  maxAutoApprovalRisk: 'medium',
}

describe('resolveAccess', () => {
  it('allows a path under a trusted root', () => {
    const d = resolveAccess(POLICY, '/ws', 'src/main.ts')
    expect(d.allowed).toBe(true)
    expect(d.reason).toMatch(/trusted root/)
  })

  it('denies a path under a denied root even when it is also under a trusted root', () => {
    const d = resolveAccess(POLICY, '/ws', 'src/secrets/key.txt')
    expect(d.allowed).toBe(false)
    expect(d.reason).toMatch(/denied root/)
  })

  it('denies a path under no trusted root', () => {
    const d = resolveAccess(POLICY, '/ws', 'tmp/out.txt')
    expect(d.allowed).toBe(false)
    expect(d.reason).toMatch(/no trusted root/)
  })

  it('resolves relative roots against the workspace root', () => {
    const d = resolveAccess(POLICY, '/ws', '/ws/src/main.ts')
    expect(d.allowed).toBe(true)
  })

  it('treats absolute roots as given', () => {
    const p: SecurityPolicy = { trustedRoots: ['/ws/src'], deniedRoots: [], maxAutoApprovalRisk: 'low' }
    const d = resolveAccess(p, '/ws', '/ws/src/main.ts')
    expect(d.allowed).toBe(true)
  })

  it('denies when the trusted root list is empty', () => {
    const p: SecurityPolicy = { trustedRoots: [], deniedRoots: [], maxAutoApprovalRisk: 'low' }
    const d = resolveAccess(p, '/ws', 'src/main.ts')
    expect(d.allowed).toBe(false)
  })

  it('denies a path that equals a denied root', () => {
    const d = resolveAccess(POLICY, '/ws', 'src/secrets')
    expect(d.allowed).toBe(false)
    expect(d.reason).toMatch(/denied root/)
  })
})

describe('decideInvocation', () => {
  it('auto-approves a low-risk invocation under a trusted root', () => {
    const d = decideInvocation(POLICY, { risk: 'low', path: 'src/main.ts' })
    expect(d.allowed).toBe(true)
    expect(d.approvalDecision).toBe('auto')
  })

  it('requires approval for high risk even under a trusted root', () => {
    const d = decideInvocation(POLICY, { risk: 'high', path: 'src/main.ts' })
    expect(d.allowed).toBe(false)
    expect(d.approvalDecision).toBe('require-approval')
  })

  it('requires approval when risk exceeds the auto-approval limit', () => {
    const d = decideInvocation(POLICY, { risk: 'critical', path: 'src/main.ts' })
    expect(d.allowed).toBe(false)
    expect(d.reason).toMatch(/risk critical exceeds/)
  })

  it('denies a denied-root invocation regardless of risk', () => {
    const d = decideInvocation(POLICY, { risk: 'low', path: 'src/secrets/key.txt' })
    expect(d.allowed).toBe(false)
    expect(d.approvalDecision).toBe('deny')
  })

  it('denies an untrusted invocation regardless of risk', () => {
    const d = decideInvocation(POLICY, { risk: 'low', path: 'tmp/out.txt' })
    expect(d.allowed).toBe(false)
  })
})
