import { describe, expect, it } from 'vitest'
import { HernesEditService } from '../src/index.ts'

describe('HernesEditService', () => {
  it('validates a single edit', () => {
    const svc = new HernesEditService(
      {} as unknown as { on?: unknown; effect?: unknown; set?: unknown },
      { requirePreconditions: true },
    )
    const result = svc.validateEdit(
      { path: 'src/a.ts', expectedContent: 'old', newContent: 'new', allowCreate: false },
      [{ path: 'src/a.ts', content: 'old' }],
    )
    expect(result.allValid).toBe(true)
    expect(result.valid).toHaveLength(1)
  })

  it('rejects edit with mismatched precondition', () => {
    const svc = new HernesEditService(
      {} as unknown as { on?: unknown; effect?: unknown; set?: unknown },
      { requirePreconditions: true },
    )
    const result = svc.validateEdit(
      { path: 'src/a.ts', expectedContent: 'wrong', newContent: 'new', allowCreate: false },
      [{ path: 'src/a.ts', content: 'actual' }],
    )
    expect(result.allValid).toBe(false)
    expect(result.invalid).toHaveLength(1)
  })

  it('validates multiple edits', () => {
    const svc = new HernesEditService(
      {} as unknown as { on?: unknown; effect?: unknown; set?: unknown },
      { requirePreconditions: true },
    )
    const result = svc.validateEdits(
      [
        { path: 'src/a.ts', expectedContent: 'old', newContent: 'new', allowCreate: false },
        { path: 'src/b.ts', expectedContent: 'old2', newContent: 'new2', allowCreate: false },
      ],
      [{ path: 'src/a.ts', content: 'old' }, { path: 'src/b.ts', content: 'old2' }],
    )
    expect(result.allValid).toBe(true)
    expect(result.valid).toHaveLength(2)
  })
})
