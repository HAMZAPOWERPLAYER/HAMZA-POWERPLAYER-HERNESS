import { describe, expect, it } from 'vitest'
import { detectStaleContext, formatProvenance, isAuthoritativeContext, type ContextProvenance } from '../src/context-provenance.ts'

const baseProvenance: ContextProvenance = {
  source: 'src/game.ts',
  range: '10-20',
  sourceVersion: 'abc123',
  retrievalMethod: 'direct-read',
  observationKind: 'observed',
  retrievedAt: 1000,
}

describe('detectStaleContext', () => {
  it('returns null when versions match', () => {
    expect(detectStaleContext(baseProvenance, 'abc123')).toBeNull()
  })

  it('returns a stale signal when versions differ', () => {
    const signal = detectStaleContext(baseProvenance, 'def456')
    expect(signal).not.toBeNull()
    expect(signal!.source).toBe('src/game.ts')
    expect(signal!.reason).toContain('abc123')
    expect(signal!.reason).toContain('def456')
  })

  it('returns null when no current version is known', () => {
    expect(detectStaleContext(baseProvenance, undefined)).toBeNull()
  })

  it('returns null when no source version was recorded', () => {
    const noVersion: ContextProvenance = { ...baseProvenance, sourceVersion: undefined }
    expect(detectStaleContext(noVersion, 'anything')).toBeNull()
  })
})

describe('isAuthoritativeContext', () => {
  it('reports observed direct-read context as authoritative', () => {
    expect(isAuthoritativeContext(baseProvenance)).toBe(true)
  })

  it('reports summarized context as not authoritative', () => {
    const summarized: ContextProvenance = { ...baseProvenance, observationKind: 'summarized' }
    expect(isAuthoritativeContext(summarized)).toBe(false)
  })

  it('reports inferred context as not authoritative', () => {
    const inferred: ContextProvenance = { ...baseProvenance, observationKind: 'inferred' }
    expect(isAuthoritativeContext(inferred)).toBe(false)
  })

  it('reports search-derived context as not authoritative', () => {
    const search: ContextProvenance = { ...baseProvenance, retrievalMethod: 'search' }
    expect(isAuthoritativeContext(search)).toBe(false)
  })
})

describe('formatProvenance', () => {
  it('includes source, range, version, method, and kind', () => {
    const text = formatProvenance(baseProvenance)
    expect(text).toContain('src/game.ts')
    expect(text).toContain('10-20')
    expect(text).toContain('@abc123')
    expect(text).toContain('direct-read')
    expect(text).toContain('observed')
  })

  it('omits optional parts when absent', () => {
    const minimal: ContextProvenance = {
      source: 'file.md',
      range: undefined,
      sourceVersion: undefined,
      retrievalMethod: 'user-provided',
      observationKind: 'observed',
      retrievedAt: 1,
    }
    expect(formatProvenance(minimal)).toContain('file.md')
  })
})
