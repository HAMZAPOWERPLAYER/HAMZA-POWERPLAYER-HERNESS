import { describe, expect, it } from 'vitest'
import { HernesQualityGateService } from '../src/index.ts'

describe('HernesQualityGateService', () => {
  it('evaluates quality gate', () => {
    const svc = new HernesQualityGateService(
      {} as unknown as { on?: unknown; effect?: unknown; set?: unknown },
      { enableQualityGate: true, minPassRate: 80 },
    )
    const result = svc.evaluateGate([
      { category: 'architecture', checks: [{ id: 'c1', description: 'fits project', status: 'pass' }] },
      { category: 'correctness', checks: [{ id: 'c2', description: 'valid refs', status: 'pass' }] },
    ])
    expect(result.overall).toBeDefined()
  })
})
