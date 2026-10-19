import { describe, expect, it } from 'vitest'
import { HernesSecurityService } from '../src/index.ts'

describe('HernesSecurityService', () => {
  it('runs security audit on inputs', () => {
    const svc = new HernesSecurityService(
      {} as unknown as { on?: unknown; effect?: unknown; set?: unknown },
      { enableAudit: true, enforceApproval: true, trustedRoots: ['src'] },
    )
    const results = svc.runAudit([
      { name: 'cmd', value: 'src/main.ts' },
      { name: 'cmd2', value: '../secret' },
    ])
    expect(results.length).toBeGreaterThan(0)
  })

  it('reports audit passed when all checks pass', () => {
    const svc = new HernesSecurityService(
      {} as unknown as { on?: unknown; effect?: unknown; set?: unknown },
      { enableAudit: true, enforceApproval: true, trustedRoots: [] },
    )
    const results = svc.runAudit([{ name: 'safe', value: 'src/main.ts' }])
    expect(svc.auditPassed(results)).toBe(true)
  })

  it('reports audit failures', () => {
    const svc = new HernesSecurityService(
      {} as unknown as { on?: unknown; effect?: unknown; set?: unknown },
      { enableAudit: true, enforceApproval: true, trustedRoots: [] },
    )
    const results = svc.runAudit([
      { name: 'traversal', value: '../secret' },
    ])
    const failures = svc.auditFailures(results)
    expect(failures.length).toBeGreaterThan(0)
  })

  it('decides approval for low risk', () => {
    const svc = new HernesSecurityService(
      {} as unknown as { on?: unknown; effect?: unknown; set?: unknown },
      { enableAudit: true, enforceApproval: true, trustedRoots: [] },
    )
    const decision = svc.decideApproval({
      risk: 'low',
      trustedWorkspace: false,
      dryRun: false,
      userApproved: false,
    })
    expect(decision).toBe('auto')
  })

  it('explains approval decision', () => {
    const svc = new HernesSecurityService(
      {} as unknown as { on?: unknown; effect?: unknown; set?: unknown },
      { enableAudit: true, enforceApproval: true, trustedRoots: [] },
    )
    const explanation = svc.explainApproval(
      { risk: 'low', trustedWorkspace: false, dryRun: false, userApproved: false },
      'auto',
    )
    expect(explanation).toContain('Auto-approved')
  })
})
