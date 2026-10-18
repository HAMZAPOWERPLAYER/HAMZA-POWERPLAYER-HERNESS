/**
 * Parse a unified diff into the file-change model used by
 * `./change-summary.ts`. This module performs no I/O and holds no state; it
 * only interprets text the caller already read.
 *
 * @module @deepseek-ai/dsh-util-values/git-diff-model
 */

import { summarizeChanges, type FileChange, type ChangeKind } from './change-summary.ts'

/** One file touched by a unified diff. */
export interface DiffFile {
  readonly path: string
  readonly kind: ChangeKind
  readonly previousPath?: string
}

/** Parse a unified diff into a list of touched files. */
/** Parse a unified diff into a list of touched files.
 * @param diff - unified diff text.
 * @returns the touched files.
 */
export function parseUnifiedDiff(diff: string): readonly DiffFile[] {
  const results: DiffFile[] = []
  const seen = new Set<string>()
  const lines = diff.split('\n')
  let currentOld: string | null = null
  let currentNew: string | null = null
  let currentKind: ChangeKind | null = null

  const flush = (): void => {
    if (currentKind === null) return
    const path = currentKind === 'removed' ? currentOld : currentNew
    if (path === null) return
    const key = `${currentKind}:${path}`
    if (seen.has(key)) return
    seen.add(key)
    const change: DiffFile = currentKind === 'renamed'
      ? (currentOld === null ? { path, kind: currentKind } : { path, kind: currentKind, previousPath: currentOld })
      : { path, kind: currentKind }
    results.push(change)
    currentOld = null
    currentNew = null
    currentKind = null
  }

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      flush()
      const match = /^diff --git a\/(.+) b\/(.+)$/.exec(line)
      if (match !== null) {
        currentOld = match[1] ?? null
        currentNew = match[2] ?? null
      }
      continue
    }
    if (line.startsWith('new file mode')) {
      currentKind = 'added'
      continue
    }
    if (line.startsWith('deleted file mode')) {
      currentKind = 'removed'
      continue
    }
    if (line.startsWith('rename from ')) {
      currentKind = 'renamed'
      currentOld = line.slice('rename from '.length).trim()
      continue
    }
    if (line.startsWith('rename to ')) {
      currentNew = line.slice('rename to '.length).trim()
      continue
    }
    if (line.startsWith('--- ')) {
      const value = line.slice(4).trim()
      if (value !== '/dev/null' && currentOld === null) currentOld = stripPrefix(value)
      continue
    }
    if (line.startsWith('+++ ')) {
      const value = line.slice(4).trim()
      if (value !== '/dev/null' && currentNew === null) currentNew = stripPrefix(value)
      if (currentKind === null) {
        if (currentOld === '/dev/null' || currentOld === null) currentKind = 'added'
        else if (currentNew === '/dev/null' || currentNew === null) currentKind = 'removed'
        else if (currentOld !== currentNew) currentKind = 'renamed'
        else currentKind = 'modified'
      }
      continue
    }
  }
  flush()
  return results
}

function stripPrefix(value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith('a/') || trimmed.startsWith('b/')) return trimmed.slice(2)
  return trimmed
}

/** Summarize a unified diff using the change-summary model. */
/** Summarize a unified diff using the change-summary model.
 * @param diff - unified diff text.
 * @returns the change summary.
 */
export function summarizeUnifiedDiff(diff: string): ReturnType<typeof summarizeChanges> {
  const changes: FileChange[] = parseUnifiedDiff(diff).map((file) =>
    file.previousPath === undefined
      ? { path: file.path, kind: file.kind }
      : { path: file.path, kind: file.kind, previousPath: file.previousPath },
  )
  return summarizeChanges(changes)
}

/** Render a one-line summary of a unified diff. */
/** Render a one-line summary of a unified diff.
 * @param diff - unified diff text.
 * @returns the summary line.
 */
export function formatUnifiedDiff(diff: string): string {
  const summary = summarizeUnifiedDiff(diff)
  return `added=${summary.added.length} modified=${summary.modified.length} removed=${summary.removed.length} renamed=${summary.renamed.length}`
}
