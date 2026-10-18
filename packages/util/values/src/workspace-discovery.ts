/**
 * Pure workspace summarization from an observed file list.
 *
 * Produces a compact capability summary (project kinds, tests, CI, docs) from
 * paths the caller already listed. It performs no filesystem access, so the
 * summary is only as fresh as the supplied list.
 *
 * @module @deepseek-ai/dsh-util-values/workspace-discovery
 */

import { detectProjectKinds, type ProjectKind } from './project-kind.ts'

/** A compact summary of an observed workspace. */
export interface WorkspaceSummary {
  /** Every project kind implied by the file list, most specific first. */
  readonly projectKinds: readonly ProjectKind[]
  /** The most specific kind, or `unknown`. */
  readonly primaryKind: ProjectKind
  /** Whether any test path was observed. */
  readonly hasTests: boolean
  /** Whether any CI configuration was observed. */
  readonly hasCi: boolean
  /** Whether any documentation was observed. */
  readonly hasDocs: boolean
  /** Number of paths in the input. */
  readonly fileCount: number
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase()
}

/**
 * Summarize an observed workspace from its file paths.
 * @param files - file paths observed in the workspace.
 * @returns the workspace summary.
 */
export function summarizeWorkspace(files: readonly string[]): WorkspaceSummary {
  const normalized = files.map(normalizePath)
  const projectKinds = detectProjectKinds(files)
  const primaryKind: ProjectKind = projectKinds.length > 0 ? (projectKinds[0] as ProjectKind) : 'unknown'
  return {
    projectKinds,
    primaryKind,
    hasTests: normalized.some(
      (path) =>
        path.includes('/test/') ||
        path.includes('/tests/') ||
        path.endsWith('.spec.ts') ||
        path.endsWith('.test.ts') ||
        path.endsWith('.spec.tsx') ||
        path.endsWith('.test.tsx'),
    ),
    hasCi: normalized.some(
      (path) =>
        path.includes('.github/workflows/') ||
        path.includes('.gitlab-ci') ||
        path.endsWith('jenkinsfile'),
    ),
    hasDocs: normalized.some((path) => path.startsWith('docs/') || path.includes('/docs/') || path.endsWith('.md')),
    fileCount: files.length,
  }
}

/**
 * Whether the workspace contains more than one project kind.
 * @param summary - workspace summary.
 * @returns `true` when several kinds were detected.
 */
export function isMultiStack(summary: WorkspaceSummary): boolean {
  return summary.projectKinds.length > 1
}
