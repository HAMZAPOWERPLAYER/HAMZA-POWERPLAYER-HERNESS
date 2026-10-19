import { describe, expect, it } from 'vitest'
import { formatUnifiedDiff, parseUnifiedDiff, summarizeUnifiedDiff } from '../src/git-diff-model.ts'

describe('parseUnifiedDiff', () => {
  it('detects an added file', () => {
    const diff = 'diff --git a/new.txt b/new.txt\nnew file mode 100644\n--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1 @@\n+hi\n'
    const files = parseUnifiedDiff(diff)
    expect(files).toHaveLength(1)
    expect(files[0]!.kind).toBe('added')
    expect(files[0]!.path).toBe('new.txt')
  })

  it('detects a deleted file', () => {
    const diff = 'diff --git a/old.txt b/old.txt\ndeleted file mode 100644\n--- a/old.txt\n+++ /dev/null\n@@ -1 +0,0 @@\n-old\n'
    const files = parseUnifiedDiff(diff)
    expect(files).toHaveLength(1)
    expect(files[0]!.kind).toBe('removed')
    expect(files[0]!.path).toBe('old.txt')
  })

  it('detects a modified file', () => {
    const diff = 'diff --git a/x.txt b/x.txt\n--- a/x.txt\n+++ b/x.txt\n@@ -1 +1 @@\n-old\n+new\n'
    const files = parseUnifiedDiff(diff)
    expect(files).toHaveLength(1)
    expect(files[0]!.kind).toBe('modified')
    expect(files[0]!.path).toBe('x.txt')
  })

  it('detects a rename', () => {
    const diff = 'diff --git a/a.txt b/b.txt\nrename from a.txt\nrename to b.txt\n'
    const files = parseUnifiedDiff(diff)
    expect(files).toHaveLength(1)
    expect(files[0]!.kind).toBe('renamed')
    expect(files[0]!.path).toBe('b.txt')
    expect(files[0]!.previousPath).toBe('a.txt')
  })

  it('handles multiple files', () => {
    const diff = 'diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-x\n+y\ndiff --git a/b.txt b/b.txt\nnew file mode 100644\n--- /dev/null\n+++ b/b.txt\n@@ -0,0 +1 @@\n+z\n'
    const files = parseUnifiedDiff(diff)
    expect(files).toHaveLength(2)
  })

  it('returns an empty list for an empty diff', () => {
    expect(parseUnifiedDiff('')).toEqual([])
  })
})

describe('summarizeUnifiedDiff', () => {
  it('counts each kind', () => {
    const diff = 'diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-x\n+y\ndiff --git a/b.txt b/b.txt\nnew file mode 100644\n--- /dev/null\n+++ b/b.txt\n@@ -0,0 +1 @@\n+z\n'
    const s = summarizeUnifiedDiff(diff)
    expect(s.added).toHaveLength(1)
    expect(s.modified).toHaveLength(1)
    expect(s.total).toBe(2)
  })
})

describe('formatUnifiedDiff', () => {
  it('renders a compact line', () => {
    const diff = 'diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-x\n+y\n'
    expect(formatUnifiedDiff(diff)).toBe('added=0 modified=1 removed=0 renamed=0')
  })
})
