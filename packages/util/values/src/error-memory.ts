/**
 * Error memory for previously resolved failures.
 *
 * Maintains a durable record of resolved failures so that agents can reuse
 * prior diagnostic work instead of re-deriving root causes. Stored entries are
 * suggestions, not unquestionable truth — callers revalidate them against the
 * current project before acting. Performs no I/O and holds no state.
 *
 * @module @deepseek-ai/dsh-util-values/error-memory
 */

/** One resolved failure record. */
export interface ErrorMemoryEntry {
  /** Stable identifier for the error record. */
  readonly id: string
  /** Root cause identified during resolution. */
  readonly rootCause: string
  /** Verified fix applied to resolve the failure. */
  readonly fix: string
  /** File or component affected. */
  readonly affectedFile: string
  /** Versions known to be affected, if known. */
  readonly affectedVersions: readonly string[]
  /** Test that regresses the failure, if any. */
  readonly regressionTest?: string
  /** Epoch milliseconds when the record was created. */
  readonly createdAt: number
  /** Epoch milliseconds when the record was last revalidated. */
  readonly lastRevalidatedAt?: number
}

/** Create a new error memory entry.
 * @param params - entry parameters.
 * @returns the new error memory entry.
 */
export function createErrorMemoryEntry(params: {
  /** Stable identifier for the error record. */
  readonly id: string
  /** Root cause identified during resolution. */
  readonly rootCause: string
  /** Verified fix applied to resolve the failure. */
  readonly fix: string
  /** File or component affected. */
  readonly affectedFile: string
  /** Versions known to be affected, if known. */
  readonly affectedVersions?: readonly string[]
  /** Test that regresses the failure, if any. */
  readonly regressionTest?: string
  /** Epoch milliseconds when the record was created. */
  readonly createdAt?: number
}): ErrorMemoryEntry {
  return {
    id: params.id,
    rootCause: params.rootCause,
    fix: params.fix,
    affectedFile: params.affectedFile,
    affectedVersions: params.affectedVersions ?? [],
    ...(params.regressionTest !== undefined
      ? { regressionTest: params.regressionTest }
      : {}),
    createdAt: params.createdAt ?? Date.now(),
  }
}

/** Revalidate a stored error memory entry against the current project.
 *
 * Returns a new entry with `lastRevalidatedAt` set to `now`. The caller is
 * responsible for determining whether the fix still applies.
 *
 * @param entry - entry to revalidate.
 * @param now - epoch milliseconds for the revalidation timestamp.
 * @returns a new entry with `lastRevalidatedAt` set.
 */
export function revalidateErrorMemoryEntry(
  entry: ErrorMemoryEntry,
  now: number = Date.now(),
): ErrorMemoryEntry {
  return { ...entry, lastRevalidatedAt: now }
}

/** Search error memory entries by affected file or root cause substring.
 *
 * Matching is case-insensitive substring matching against `affectedFile`,
 * `rootCause`, and `fix`.
 *
 * @param entries - error memory entries to search.
 * @param query - substring to match against.
 * @returns matching entries, in input order.
 */
export function searchErrorMemory(
  entries: readonly ErrorMemoryEntry[],
  query: string,
): readonly ErrorMemoryEntry[] {
  const lowered = query.toLowerCase()
  return entries.filter(
    (entry) =>
      entry.affectedFile.toLowerCase().includes(lowered) ||
      entry.rootCause.toLowerCase().includes(lowered) ||
      entry.fix.toLowerCase().includes(lowered),
  )
}

/** Filter error memory entries by affected version.
 * @param entries - error memory entries to filter.
 * @param version - version string to match.
 * @returns entries whose affectedVersions include the version.
 */
export function filterErrorMemoryByVersion(
  entries: readonly ErrorMemoryEntry[],
  version: string,
): readonly ErrorMemoryEntry[] {
  return entries.filter((entry) =>
    entry.affectedVersions.some((v) => v === version || v.includes(version)),
  )
}

/** Summarize error memory: total entries, revalidated count, unique files. */
export interface ErrorMemorySummary {
  /** Total number of entries. */
  readonly total: number
  /** Number of entries that have been revalidated at least once. */
  readonly revalidated: number
  /** Number of unique affected files. */
  readonly uniqueFiles: number
  /** Versions mentioned across all entries, deduplicated and sorted. */
  readonly versions: readonly string[]
}

/** Summarize error memory entries.
 * @param entries - error memory entries to summarize.
 * @returns summary statistics.
 */
export function summarizeErrorMemory(
  entries: readonly ErrorMemoryEntry[],
): ErrorMemorySummary {
  const revalidated = entries.filter((e) => e.lastRevalidatedAt !== undefined).length
  const uniqueFiles = new Set(entries.map((e) => e.affectedFile)).size
  const versions = new Set<string>()
  for (const entry of entries) {
    for (const version of entry.affectedVersions) {
      versions.add(version)
    }
  }
  return {
    total: entries.length,
    revalidated,
    uniqueFiles,
    versions: [...versions].sort(),
  }
}
