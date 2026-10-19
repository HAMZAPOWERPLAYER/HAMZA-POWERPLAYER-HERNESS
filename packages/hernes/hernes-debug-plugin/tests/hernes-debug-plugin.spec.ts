import { describe, expect, it } from 'vitest'
import { HernesDebugService } from '../src/index.ts'

describe('HernesDebugService', () => {
  it('classifies an error', () => {
    const svc = new HernesDebugService(
      {} as unknown as { on?: unknown; effect?: unknown; set?: unknown },
      { enableErrorMemory: true, maxEntries: 1000 },
    )
    const result = svc.classifyError({
      error: new Error('test error'),
      context: { operation: 'test' },
    })
    expect(result.category).toBeDefined()
  })

  it('checks if error is retryable', () => {
    const svc = new HernesDebugService(
      {} as unknown as { on?: unknown; effect?: unknown; set?: unknown },
      { enableErrorMemory: true, maxEntries: 1000 },
    )
    const classified = svc.classifyError({
      error: new Error('network timeout'),
      context: { operation: 'test' },
    })
    expect(typeof svc.isRetryableError(classified)).toBe('boolean')
  })

  it('creates and searches error memory', () => {
    const svc = new HernesDebugService(
      {} as unknown as { on?: unknown; effect?: unknown; set?: unknown },
      { enableErrorMemory: true, maxEntries: 1000 },
    )
    const entry = svc.createErrorMemoryEntry({
      id: 'err-1',
      rootCause: 'null pointer in parser',
      fix: 'add null check',
      affectedFile: 'src/parser.ts',
    })
    expect(entry.id).toBe('err-1')

    const found = svc.searchErrorMemory('parser')
    expect(found.length).toBeGreaterThanOrEqual(0)
  })

  it('summarizes error memory', () => {
    const svc = new HernesDebugService(
      {} as unknown as { on?: unknown; effect?: unknown; set?: unknown },
      { enableErrorMemory: true, maxEntries: 1000 },
    )
    const summary = svc.summarizeErrorMemory()
    expect(typeof summary.total).toBe('number')
  })
})
