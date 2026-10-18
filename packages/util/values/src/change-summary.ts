/**
 * Deterministic summarizing of file-level changes.
 *
 * Groups a change list into added, modified, removed, and renamed buckets and
 * renders the result as stable, human-readable lines. The helpers hold no
 * state, perform no I/O, and derive their result only from their arguments.
 *
 * @module @deepseek-ai/dsh-util-values/change-summary
 */

/** Kind of change applied to one file. */
export type ChangeKind = 'added' | 'modified' | 'removed' | 'renamed'

/** One file-level change. */
export interface FileChange {
  /** Path of the file after the change. */
  readonly path: string
  /** Which change happened to the file. */
  readonly kind: ChangeKind
  /** Path before a rename; ignored for every other kind. */
  readonly previousPath?: string
}

/** File changes grouped by kind, in input order within each group. */
export interface ChangeSummary {
  /** Paths of files added. */
  readonly added: readonly string[]
  /** Paths of files modified. */
  readonly modified: readonly string[]
  /** Paths of files removed. */
  readonly removed: readonly string[]
  /** Source and destination paths of renamed files. */
  readonly renamed: readonly { from: string; to: string }[]
  /** Number of input changes, equal to the sum of the group lengths. */
  readonly total: number
}

/**
 * Group `changes` by kind, preserving input order within each group.
 *
 * @param changes - file changes to summarize.
 * @returns the grouped summary; a renamed entry pairs `previousPath ?? path` as `from` with `path` as `to`.
 */
export function summarizeChanges(changes: readonly FileChange[]): ChangeSummary {
  const added: string[] = []
  const modified: string[] = []
  const removed: string[] = []
  const renamed: { from: string; to: string }[] = []
  for (const change of changes) {
    switch (change.kind) {
      case 'added':
        added.push(change.path)
        break
      case 'modified':
        modified.push(change.path)
        break
      case 'removed':
        removed.push(change.path)
        break
      case 'renamed':
        renamed.push({ from: change.previousPath ?? change.path, to: change.path })
        break
    }
  }
  return { added, modified, removed, renamed, total: changes.length }
}

/**
 * Whether the summary contains at least one removed file.
 *
 * @param summary - summary to inspect.
 * @returns `true` when `summary.removed` is non-empty.
 */
export function hasBreakingFileRemovals(summary: ChangeSummary): boolean {
  return summary.removed.length > 0
}

/**
 * Render the summary as one line per non-empty group.
 *
 * Lines appear in the fixed order added, modified, removed, renamed; entries
 * inside a group keep input order. Entries join with `', '`, each renamed pair
 * renders as `'from -> to'`, and lines join with `'\n'`.
 *
 * @param summary - summary to render.
 * @returns the formatted summary, or `''` when `summary.total` is `0`.
 */
export function formatChangeSummary(summary: ChangeSummary): string {
  if (summary.total === 0) return ''
  const lines: string[] = []
  if (summary.added.length > 0) lines.push(`added: ${summary.added.join(', ')}`)
  if (summary.modified.length > 0) lines.push(`modified: ${summary.modified.join(', ')}`)
  if (summary.removed.length > 0) lines.push(`removed: ${summary.removed.join(', ')}`)
  if (summary.renamed.length > 0) {
    lines.push(`renamed: ${summary.renamed.map((pair) => `${pair.from} -> ${pair.to}`).join(', ')}`)
  }
  return lines.join('\n')
}
