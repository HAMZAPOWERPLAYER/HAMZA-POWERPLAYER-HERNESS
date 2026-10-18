import { describe, expect, it } from 'vitest'
import { auditTrustPolicy, decideTrustedInvocation, resolveTrust, trustToApprovalContext } from '../src/workspace-trust.ts'

describe('resolveTrust', () => {
  it('returns trusted for a target inside a trusted root', () => {
    const policy = { trustedRoots: ['src'], deniedPaths: [] }
    expect(resolveTrust(policy, '/ws', 'src/a.ts')).toBe('trusted')
  })

  it('returns untrusted for a target outside every root', () => {
    const policy = { trustedRoots: ['src'], deniedPaths: [] }
    expect(resolveTrust(policy, '/ws', 'docs/x.txt')).toBe('untrusted')
  })

  it('returns denied for a target inside a denied path', () => {
    const policy = { trustedRoots: ['src'], deniedPaths: ['src/secrets'] }
    expect(resolveTrust(policy, '/ws', 'src/secrets/key.txt')).toBe('denied')
  })

  it('denial wins over a trusted root', () => {
    const policy = { trustedRoots: ['src'], deniedPaths: ['src/secrets'] }
    expect(resolveTrust(policy, '/ws', 'src/secrets/key.txt')).toBe('denied')
  })

  it('resolves relative roots against the workspace root', () => {
    const policy = { trustedRoots: ['src'], deniedPaths: [] }
    expect(resolveTrust(policy, '/ws', '/ws/src/a.ts')).toBe('trusted')
  })

  it('keeps absolute roots as given', () => {
    const policy = { trustedRoots: ['/ws/src'], deniedPaths: [] }
    expect(resolveTrust(policy, '/ws', '/ws/src/a.ts')).toBe('trusted')
  })

  it('does not count a sibling prefix as inside', () => {
    const policy = { trustedRoots: ['src'], deniedPaths: [] }
    expect(resolveTrust(policy, '/ws', 'srcx/a.ts')).toBe('untrusted')
  })

  it('denies a target that equals a denied path', () => {
    const policy = { trustedRoots: ['src'], deniedPaths: ['src/secrets'] }
    expect(resolveTrust(policy, '/ws', 'src/secrets')).toBe('denied')
  })
})

describe('trustToApprovalContext', () => {
  it('sets trustedWorkspace true only for trusted', () => {
    expect(trustToApprovalContext('trusted', 'low', false).trustedWorkspace).toBe(true)
    expect(trustToApprovalContext('untrusted', 'low', false).trustedWorkspace).toBe(false)
    expect(trustToApprovalContext('denied', 'low', false).trustedWorkspace).toBe(false)
  })

  it('passes dryRun through and never sets userApproved', () => {
    const ctx = trustToApprovalContext('trusted', 'high', true)
    expect(ctx.dryRun).toBe(true)
    expect(ctx.userApproved).toBe(false)
  })
})

describe('decideTrustedInvocation', () => {
  const policy = { trustedRoots: ['src'], deniedPaths: ['src/secrets'] }

  it('auto-approves a low-risk trusted invocation', () => {
    const r = decideTrustedInvocation(policy, '/ws', { risk: 'low', path: 'src/a.ts' }, false)
    expect(r.trust).toBe('trusted')
    expect(r.decision).toBe('auto')
  })

  it('requires approval for high risk even in a trusted workspace', () => {
    const r = decideTrustedInvocation(policy, '/ws', { risk: 'high', path: 'src/a.ts' }, false)
    expect(r.trust).toBe('trusted')
    expect(r.decision).toBe('require-approval')
  })

  it('requires approval for medium risk outside a trusted workspace', () => {
    const r = decideTrustedInvocation(policy, '/ws', { risk: 'medium', path: 'docs/x.txt' }, false)
    expect(r.trust).toBe('untrusted')
    expect(r.decision).toBe('require-approval')
  })

  it('auto-approves a medium-risk trusted invocation', () => {
    const r = decideTrustedInvocation(policy, '/ws', { risk: 'medium', path: 'src/a.ts' }, false)
    expect(r.decision).toBe('auto')
  })

  it('dry run auto-approves regardless of trust', () => {
    const r = decideTrustedInvocation(policy, '/ws', { risk: 'critical', path: 'src/secrets/x' }, true)
    expect(r.trust).toBe('denied')
    expect(r.decision).toBe('auto')
  })

  it('denied paths do not produce a deny decision', () => {
    const r = decideTrustedInvocation(policy, '/ws', { risk: 'critical', path: 'src/secrets/x' }, false)
    expect(r.trust).toBe('denied')
    expect(r.decision).toBe('require-approval')
  })

  it('includes an explanation string', () => {
    const r = decideTrustedInvocation(policy, '/ws', { risk: 'low', path: 'src/a.ts' }, false)
    expect(r.explanation.length).toBeGreaterThan(0)
  })
})

describe('auditTrustPolicy', () => {
  it('reports a denied path inside a trusted root', () => {
    const p = auditTrustPolicy({ trustedRoots: ['src'], deniedPaths: ['src/secrets'] })
    expect(p).toContain('denied path src/secrets is inside trusted root src')
  })

  it('reports an empty trusted root', () => {
    const p = auditTrustPolicy({ trustedRoots: [''], deniedPaths: [] })
    expect(p).toContain('trusted root  is empty')
  })

  it('reports a duplicated trusted root', () => {
    const p = auditTrustPolicy({ trustedRoots: ['src', 'src'], deniedPaths: [] })
    expect(p).toContain('trusted root src is duplicated')
  })

  it('reports a duplicated denied path', () => {
    const p = auditTrustPolicy({ trustedRoots: [], deniedPaths: ['x', 'x'] })
    expect(p).toContain('denied path x is duplicated')
  })

  it('returns an empty array for a clean policy', () => {
    const p = auditTrustPolicy({ trustedRoots: ['src', 'docs'], deniedPaths: ['tmp'] })
    expect(p).toEqual([])
  })
})
