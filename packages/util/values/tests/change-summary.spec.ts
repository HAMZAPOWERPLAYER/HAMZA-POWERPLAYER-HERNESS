import { describe, expect, it } from 'vitest'
import {
  formatChangeSummary,
  hasBreakingFileRemovals,
  summarizeChanges,
  type ChangeKind,
} from '../src/change-summary.ts'

describe('summarizeChanges', () => {
  it('returns empty groups for no changes', () => {
    expect(summarizeChanges([])).toEqual({ added: [], modified: [], removed: [], renamed: [], total: 0 })
  })

  it('groups paths for added, modified, and removed changes', () => {
    const summary = summarizeChanges([
      { path: 'a.ts', kind: 'added' },
      { path: 'b.ts', kind: 'modified' },
      { path: 'c.ts', kind: 'removed' },
    ])
    expect(summary.added).toEqual(['a.ts'])
    expect(summary.modified).toEqual(['b.ts'])
    expect(summary.removed).toEqual(['c.ts'])
    expect(summary.renamed).toEqual([])
    expect(summary.total).toBe(3)
  })

  it('records a renamed path with its previous path', () => {
    const summary = summarizeChanges([{ path: 'new.ts', kind: 'renamed', previousPath: 'old.ts' }])
    expect(summary.renamed).toEqual([{ from: 'old.ts', to: 'new.ts' }])
    expect(summary.total).toBe(1)
  })

  it('falls back to path when a rename has no previous path', () => {
    const summary = summarizeChanges([{ path: 'same.ts', kind: 'renamed' }])
    expect(summary.renamed).toEqual([{ from: 'same.ts', to: 'same.ts' }])
  })

  it('ignores previousPath for non-renamed kinds', () => {
    const summary = summarizeChanges([{ path: 'a.ts', kind: 'modified', previousPath: 'old.ts' }])
    expect(summary.modified).toEqual(['a.ts'])
    expect(summary.renamed).toEqual([])
    expect(summary.total).toBe(1)
  })

  it('keeps input order within each group', () => {
    const summary = summarizeChanges([
      { path: 'b.ts', kind: 'added' },
      { path: 'a.ts', kind: 'added' },
      { path: 'z.ts', kind: 'modified' },
      { path: 'y.ts', kind: 'modified' },
    ])
    expect(summary.added).toEqual(['b.ts', 'a.ts'])
    expect(summary.modified).toEqual(['z.ts', 'y.ts'])
  })

  it('counts every change in total', () => {
    const kinds: readonly ChangeKind[] = ['added', 'modified', 'removed', 'renamed']
    const summary = summarizeChanges(kinds.map((kind) => ({ path: 'f.ts', kind })))
    expect(summary.total).toBe(4)
    expect(summary.added.length + summary.modified.length + summary.removed.length + summary.renamed.length).toBe(4)
  })
})

describe('hasBreakingFileRemovals', () => {
  it('true when at least one file was removed', () => {
    expect(hasBreakingFileRemovals(summarizeChanges([{ path: 'a.ts', kind: 'removed' }]))).toBe(true)
  })

  it('false when no file was removed', () => {
    const summary = summarizeChanges([
      { path: 'a.ts', kind: 'added' },
      { path: 'b.ts', kind: 'modified' },
      { path: 'c.ts', kind: 'renamed', previousPath: 'd.ts' },
    ])
    expect(hasBreakingFileRemovals(summary)).toBe(false)
  })

  it('false for no changes', () => {
    expect(hasBreakingFileRemovals(summarizeChanges([]))).toBe(false)
  })
})

describe('formatChangeSummary', () => {
  it('returns an empty string when total is zero', () => {
    expect(formatChangeSummary(summarizeChanges([]))).toBe('')
  })

  it('renders one line per non-empty group in fixed order', () => {
    const summary = summarizeChanges([
      { path: 'new.ts', kind: 'renamed', previousPath: 'old.ts' },
      { path: 'gone.ts', kind: 'removed' },
      { path: 'touched.ts', kind: 'modified' },
      { path: 'b.ts', kind: 'added' },
      { path: 'a.ts', kind: 'added' },
    ])
    expect(formatChangeSummary(summary)).toBe(
      'added: b.ts, a.ts\nmodified: touched.ts\nremoved: gone.ts\nrenamed: old.ts -> new.ts',
    )
  })

  it('omits groups with no entries', () => {
    expect(formatChangeSummary(summarizeChanges([{ path: 'a.ts', kind: 'added' }]))).toBe('added: a.ts')
    expect(formatChangeSummary(summarizeChanges([{ path: 'b.ts', kind: 'removed' }]))).toBe('removed: b.ts')
  })

  it('renders each renamed pair as from -> to', () => {
    const summary = summarizeChanges([
      { path: 'b.ts', kind: 'renamed', previousPath: 'a.ts' },
      { path: 'd.ts', kind: 'renamed', previousPath: 'c.ts' },
    ])
    expect(formatChangeSummary(summary)).toBe('renamed: a.ts -> b.ts, c.ts -> d.ts')
  })

  it('renders a rename without a previous path as path -> path', () => {
    expect(formatChangeSummary(summarizeChanges([{ path: 'same.ts', kind: 'renamed' }]))).toBe('renamed: same.ts -> same.ts')
  })
})
