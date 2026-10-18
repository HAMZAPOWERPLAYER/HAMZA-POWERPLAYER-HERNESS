import { describe, expect, it } from 'vitest'
import {
  createErrorMemoryEntry,
  filterErrorMemoryByVersion,
  revalidateErrorMemoryEntry,
  searchErrorMemory,
  summarizeErrorMemory,
  type ErrorMemoryEntry,
} from '../src/error-memory.ts'

function entry(overrides: Partial<ErrorMemoryEntry> = {}): ErrorMemoryEntry {
  return {
    id: overrides.id ?? 'err-1',
    rootCause: overrides.rootCause ?? 'null pointer dereference',
    fix: overrides.fix ?? 'add null check',
    affectedFile: overrides.affectedFile ?? 'src/parser.ts',
    affectedVersions: overrides.affectedVersions ?? ['1.0.0'],
    regressionTest: overrides.regressionTest,
    createdAt: overrides.createdAt ?? 1_000_000_000_000,
    lastRevalidatedAt: overrides.lastRevalidatedAt,
  }
}

describe('createErrorMemoryEntry', () => {
  it('creates an entry with all fields', () => {
    const e = createErrorMemoryEntry({
      id: 'err-1',
      rootCause: 'null pointer',
      fix: 'add guard',
      affectedFile: 'src/a.ts',
      affectedVersions: ['1.0.0', '1.1.0'],
      regressionTest: 'test_repro.ts',
      createdAt: 1_700_000_000_000,
    })
    expect(e.id).toBe('err-1')
    expect(e.rootCause).toBe('null pointer')
    expect(e.fix).toBe('add guard')
    expect(e.affectedFile).toBe('src/a.ts')
    expect(e.affectedVersions).toEqual(['1.0.0', '1.1.0'])
    expect(e.regressionTest).toBe('test_repro.ts')
    expect(e.createdAt).toBe(1_700_000_000_000)
    expect(e.lastRevalidatedAt).toBeUndefined()
  })

  it('defaults affectedVersions to empty array', () => {
    const e = createErrorMemoryEntry({
      id: 'err-1',
      rootCause: 'x',
      fix: 'y',
      affectedFile: 'z.ts',
    })
    expect(e.affectedVersions).toEqual([])
  })

  it('defaults regressionTest to undefined', () => {
    const e = createErrorMemoryEntry({
      id: 'err-1',
      rootCause: 'x',
      fix: 'y',
      affectedFile: 'z.ts',
    })
    expect(e.regressionTest).toBeUndefined()
  })

  it('defaults createdAt to current time when not supplied', () => {
    const before = Date.now()
    const e = createErrorMemoryEntry({
      id: 'err-1',
      rootCause: 'x',
      fix: 'y',
      affectedFile: 'z.ts',
    })
    expect(e.createdAt).toBeGreaterThanOrEqual(before)
    expect(e.createdAt).toBeLessThanOrEqual(Date.now())
  })
})

describe('revalidateErrorMemoryEntry', () => {
  it('sets lastRevalidatedAt', () => {
    const e = createErrorMemoryEntry({ id: 'err-1', rootCause: 'x', fix: 'y', affectedFile: 'f.ts' })
    const updated = revalidateErrorMemoryEntry(e, 2_000_000_000_000)
    expect(updated.lastRevalidatedAt).toBe(2_000_000_000_000)
    expect(updated.id).toBe('err-1')
    expect(updated.rootCause).toBe('x')
  })

  it('does not mutate the original entry', () => {
    const e = createErrorMemoryEntry({ id: 'err-1', rootCause: 'x', fix: 'y', affectedFile: 'f.ts' })
    const before = e.lastRevalidatedAt
    revalidateErrorMemoryEntry(e, 2_000_000_000_000)
    expect(e.lastRevalidatedAt).toBe(before)
  }
})

describe('searchErrorMemory', () => {
  const entries: ErrorMemoryEntry[] = [
    createErrorMemoryEntry({
      id: 'err-1',
      rootCause: 'null pointer dereference in parser',
      fix: 'add null check',
      affectedFile: 'src/parser.ts',
    }),
    createErrorMemoryEntry({
      id: 'err-2',
      rootCause: 'type mismatch in compiler',
      fix: 'add type cast',
      affectedFile: 'src/compiler.ts',
    }),
    createErrorMemoryEntry({
      id: 'err-3',
      rootCause: 'out of memory',
      fix: 'increase heap',
      affectedFile: 'src/parser.ts',
    }),
  ]

  it('finds entries by affected file', () => {
    const found = searchErrorMemory(entries, 'parser.ts')
    expect(found).toHaveLength(2)
    expect(found.map((e) => e.id)).toEqual(['err-1', 'err-3'])
  })

  it('finds entries by root cause substring', () => {
    const found = searchErrorMemory(entries, 'null pointer')
    expect(found).toHaveLength(1)
    expect(found[0].id).toBe('err-1')
  })

  it('finds entries by fix substring', () => {
    const found = searchErrorMemory(entries, 'increase heap')
    expect(found).toHaveLength(1)
    expect(found[0].id).toBe('err-3')
  })

  it('is case-insensitive', () => {
    const found = searchErrorMemory(entries, 'NULL POINTER')
    expect(found).toHaveLength(1)
    expect(found[0].id).toBe('err-1')
  })

  it('returns empty when nothing matches', () => {
    const found = searchErrorMemory(entries, 'nonexistent')
    expect(found).toEqual([])
  })

  it('returns empty for empty entries', () => {
    expect(searchErrorMemory([], 'x')).toEqual([])
  })
})

describe('filterErrorMemoryByVersion', () => {
  const entries: ErrorMemoryEntry[] = [
    createErrorMemoryEntry({
      id: 'err-1',
      rootCause: 'x',
      fix: 'y',
      affectedFile: 'a.ts',
      affectedVersions: ['1.0.0', '1.1.0'],
    }),
    createErrorMemoryEntry({
      id: 'err-2',
      rootCause: 'x',
      fix: 'y',
      affectedFile: 'b.ts',
      affectedVersions: ['2.0.0'],
    }),
    createErrorMemoryEntry({
      id: 'err-3',
      rootCause: 'x',
      fix: 'y',
      affectedFile: 'c.ts',
      affectedVersions: [],
    }),
  ]

  it('filters by exact version', () => {
    const found = filterErrorMemoryByVersion(entries, '1.0.0')
    expect(found).toHaveLength(1)
    expect(found[0].id).toBe('err-1')
  })

  it('filters by version substring', () => {
    const found = filterErrorMemoryByVersion(entries, '1.0')
    expect(found).toHaveLength(1)
    expect(found[0].id).toBe('err-1')
  })

  it('returns empty when no entry matches', () => {
    const found = filterErrorMemoryByVersion(entries, '3.0.0')
    expect(found).toEqual([])
  })

  it('returns empty for empty entries', () => {
    expect(filterErrorMemoryByVersion([], '1.0.0')).toEqual([])
  })
})

describe('summarizeErrorMemory', () => {
  it('summarizes empty entries', () => {
    const s = summarizeErrorMemory([])
    expect(s.total).toBe(0)
    expect(s.revalidated).toBe(0)
    expect(s.uniqueFiles).toBe(0)
    expect(s.versions).toEqual([])
  })

  it('summarizes entries with revalidation', () => {
    const entries: ErrorMemoryEntry[] = [
      revalidateErrorMemoryEntry(
        createErrorMemoryEntry({
          id: 'err-1',
          rootCause: 'x',
          fix: 'y',
          affectedFile: 'a.ts',
          affectedVersions: ['1.0.0'],
        }),
        2_000_000_000_000
      ),
      createErrorMemoryEntry({
        id: 'err-2',
        rootCause: 'x',
        fix: 'y',
        affectedFile: 'b.ts',
        affectedVersions: ['2.0.0'],
      }),
    ]
    const s = summarizeErrorMemory(entries)
    expect(s.total).toBe(2)
    expect(s.revalidated).toBe(1)
    expect(s.uniqueFiles).toBe(2)
    expect(s.versions).toEqual(['1.0.0', '2.0.0'])
  })

  it('deduplicates versions', () => {
    const entries: ErrorMemoryEntry[] = [
      createErrorMemoryEntry({
        id: 'err-1',
        rootCause: 'x',
        fix: 'y',
        affectedFile: 'a.ts',
        affectedVersions: ['1.0.0', '1.1.0'],
      }),
      createErrorMemoryEntry({
        id: 'err-2',
        rootCause: 'x',
        fix: 'y',
        affectedFile: 'b.ts',
        affectedVersions: ['1.0.0', '2.0.0'],
      }),
    ]
    const s = summarizeErrorMemory(entries)
    expect(s.versions).toEqual(['1.0.0', '1.1.0', '2.0.0'])
  })
})
