import { describe, expect, it } from 'vitest'
import {
  applyEdits,
  computeChangeImpact,
  findReferencingFiles,
  stageEdits,
  validateEdit,
  validateEdits,
  type FileEdit,
} from '../src/multi-file-edit.ts'
import type { ObservedFile } from '../src/codebase-understanding.ts'

function observed(path: string, content: string | null = 'content'): ObservedFile {
  return { path, content }
}

describe('validateEdit', () => {
  it('validates an edit whose precondition matches', () => {
    const result = validateEdit(
      { path: 'a.ts', expectedContent: 'old', newContent: 'new', allowCreate: false },
      [observed('a.ts', 'old')],
    )
    expect(result.valid).toEqual([{ path: 'a.ts', newContent: 'new' }])
    expect(result.invalid).toEqual([])
    expect(result.allValid).toBe(true)
  })

  it('rejects when the precondition does not match', () => {
    const result = validateEdit(
      { path: 'a.ts', expectedContent: 'wrong', newContent: 'new', allowCreate: false },
      [observed('a.ts', 'old')],
    )
    expect(result.valid).toEqual([])
    expect(result.invalid).toHaveLength(1)
    expect(result.invalid[0]!.reason).toContain('does not match expected precondition')
    expect(result.allValid).toBe(false)
  })

  it('rejects an absent file when creation is not allowed', () => {
    const result = validateEdit(
      { path: 'new.ts', expectedContent: '', newContent: 'new', allowCreate: false },
      [observed('a.ts', 'old')],
    )
    expect(result.valid).toEqual([])
    expect(result.invalid[0]!.reason).toContain('creation is not allowed')
    expect(result.allValid).toBe(false)
  })

  it('allows creating a new file when creation is allowed', () => {
    const result = validateEdit(
      { path: 'new.ts', expectedContent: '', newContent: 'new', allowCreate: true },
      [observed('a.ts', 'old')],
    )
    expect(result.valid).toEqual([{ path: 'new.ts', newContent: 'new' }])
    expect(result.allValid).toBe(true)
  })

  it('returns an empty result for an absent file with creation allowed', () => {
    const result = validateEdit(
      { path: 'new.ts', expectedContent: '', newContent: 'new', allowCreate: true },
      [],
    )
    expect(result.valid).toEqual([{ path: 'new.ts', newContent: 'new' }])
    expect(result.invalid).toEqual([])
    expect(result.allValid).toBe(true)
  })
})

describe('validateEdits', () => {
  it('validates multiple edits, collecting all failures', () => {
    const edits: readonly FileEdit[] = [
      { path: 'a.ts', expectedContent: 'old', newContent: 'new', allowCreate: false },
      { path: 'b.ts', expectedContent: 'wrong', newContent: 'new', allowCreate: false },
    ]
    const result = validateEdits(edits, [observed('a.ts', 'old'), observed('b.ts', 'old')])
    expect(result.valid).toHaveLength(1)
    expect(result.invalid).toHaveLength(1)
    expect(result.allValid).toBe(false)
  })

  it('validates an empty edit list', () => {
    const result = validateEdits([], [])
    expect(result.valid).toEqual([])
    expect(result.invalid).toEqual([])
    expect(result.allValid).toBe(true)
  })
})

describe('stageEdits', () => {
  it('stages valid edits as pending edits', () => {
    const transaction = stageEdits(
      [{ path: 'a.ts', expectedContent: 'old', newContent: 'new', allowCreate: false }],
      [observed('a.ts', 'old')],
    )
    expect(transaction.edits).toEqual([
      { path: 'a.ts', newContent: 'new', create: false },
    ])
    expect(transaction.allValid).toBe(true)
  })

  it('marks a transaction invalid when any edit is invalid', () => {
    const transaction = stageEdits(
      [
        { path: 'a.ts', expectedContent: 'old', newContent: 'new', allowCreate: false },
        { path: 'b.ts', expectedContent: 'wrong', newContent: 'new', allowCreate: false },
      ],
      [observed('a.ts', 'old'), observed('b.ts', 'old')],
    )
    expect(transaction.allValid).toBe(false)
    expect(transaction.edits).toHaveLength(1)
  })
})

describe('applyEdits', () => {
  it('applies staged edits to observed state', () => {
    const transaction = stageEdits(
      [{ path: 'a.ts', expectedContent: 'old', newContent: 'new', allowCreate: false }],
      [observed('a.ts', 'old'), observed('b.ts', 'keep')],
    )
    const result = applyEdits(transaction, [observed('a.ts', 'old'), observed('b.ts', 'keep')])
    expect(result).toEqual([
      { path: 'a.ts', content: 'new' },
      { path: 'b.ts', content: 'keep' },
    ])
  })

  it('creates new files when a pending edit has create=true', () => {
    type PendingTxn = {
      readonly edits: readonly { readonly path: string; readonly newContent: string; readonly create: boolean }[]
      readonly allValid: boolean
    }
    const transaction: PendingTxn = {
      edits: [{ path: 'c.ts', newContent: 'new', create: true }],
      allValid: true,
    }
    const result = applyEdits(transaction, [observed('a.ts', 'old')])
    expect(result.map(f => ({ path: f.path, content: f.content }))).toEqual([
      { path: 'a.ts', content: 'old' },
      { path: 'c.ts', content: 'new' },
    ])
  })
})

describe('computeChangeImpact', () => {
  it('detects added, modified, and removed files', () => {
    const before = [observed('a.ts', 'old'), observed('b.ts', 'same'), observed('c.ts', 'gone')]
    const after = [observed('a.ts', 'new'), observed('b.ts', 'same'), observed('d.ts', 'new')]
    const changes = computeChangeImpact(before, after)
    const byPath = new Map(changes.map(c => [c.path, c]))
    expect(byPath.get('a.ts')!.kind).toBe('modified')
    expect(byPath.get('b.ts')).toBeUndefined()
    expect(byPath.get('c.ts')!.kind).toBe('removed')
    expect(byPath.get('d.ts')!.kind).toBe('added')
  })

  it('returns an empty array when nothing changed', () => {
    const files = [observed('a.ts', 'same'), observed('b.ts', 'same')]
    expect(computeChangeImpact(files, files)).toEqual([])
  })
})

describe('findReferencingFiles', () => {
  it('finds files whose content references a path', () => {
    const files = [
      observed('a.ts', "import './b.ts'"),
      observed('b.ts', 'export default {}'),
      observed('c.ts', "import './b.ts' and './a.ts'"),
    ]
    const referencing = findReferencingFiles('./b.ts', files)
    expect(referencing).toEqual(['a.ts', 'c.ts'])
  })

  it('returns an empty array when nothing references the path', () => {
    const files = [observed('a.ts', "import './x.ts'")]
    expect(findReferencingFiles('./b.ts', files)).toEqual([])
  })
})
