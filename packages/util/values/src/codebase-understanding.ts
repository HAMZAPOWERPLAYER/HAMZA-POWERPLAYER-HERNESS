/**
 * Lightweight codebase understanding from observed file lists and content.
 *
 * All helpers are pure: they derive a dependency graph and ranked context from
 * caller-supplied file lists, perform no I/O, hold no state, and import only
 * local value primitives. They are intended for language-agnostic projects
 * where a language server or AST indexer is unavailable.
 *
 * @module @deepseek-ai/dsh-util-values/codebase-understanding
 */

/** One observed file. */
export interface ObservedFile {
  /** Repository-relative path. */
  readonly path: string
  /** File content, or null when unreadable. */
  readonly content: string | null
}

/** One dependency edge from an importing file to an imported file. */
export interface DependencyEdge {
  /** File that imports. */
  readonly from: string
  /** File that is imported. */
  readonly to: string
}

/** A dependency graph built from observed files. */
export interface DependencyGraph {
  /** Every file in the graph. */
  readonly files: readonly string[]
  /** Edges in declaration order. */
  readonly edges: readonly DependencyEdge[]
  /** Files with no incoming edges. */
  readonly roots: readonly string[]
  /** Files with no outgoing edges. */
  readonly leaves: readonly string[]
  /** Files involved in at least one cycle. */
  readonly cyclicFiles: readonly string[]
}

/** Build a dependency graph from import/require statements in file content.
 * @param files - observed files to scan for imports.
 * @returns the dependency graph.
 */
export function buildDependencyGraph(files: readonly ObservedFile[]): DependencyGraph {
  const edges: DependencyEdge[] = []
  for (const file of files) {
    if (file.content === null) continue
    for (const target of extractImports(file.content)) {
      const resolved = resolveImport(file.path, target, files)
      if (resolved !== null) {
        edges.push({ from: file.path, to: resolved })
      }
    }
  }
  const incoming = new Map<string, number>()
  const outgoing = new Map<string, number>()
  for (const file of files) {
    incoming.set(file.path, 0)
    outgoing.set(file.path, 0)
  }
  for (const edge of edges) {
    outgoing.set(edge.from, (outgoing.get(edge.from) ?? 0) + 1)
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1)
  }
  const roots = files
    .filter((file) => (incoming.get(file.path) ?? 0) === 0)
    .map((file) => file.path)
  const leaves = files
    .filter((file) => (outgoing.get(file.path) ?? 0) === 0)
    .map((file) => file.path)
  const cyclicFiles = findCyclicFiles(files.map((file) => file.path), edges)
  return { files: files.map((file) => file.path), edges, roots, leaves, cyclicFiles }
}

/** Rank files by relevance to a set of query terms. */
export interface RankedFile {
  /** File path. */
  readonly path: string
  /** Relevance score; higher is more relevant. */
  readonly score: number
  /** Matched query terms. */
  readonly matchedTerms: readonly string[]
}

/** Rank files by relevance to query terms.
 * @param files - observed files to rank.
 * @param queryTerms - search terms to match against file content.
 * @returns files ranked by relevance score, highest first.
 */
export function rankFilesByRelevance(
  files: readonly ObservedFile[],
  queryTerms: readonly string[],
): readonly RankedFile[] {
  const terms = queryTerms.map((term) => term.toLowerCase())
  const ranked: RankedFile[] = []
  for (const file of files) {
    if (file.content === null) continue
    const lowered = file.content.toLowerCase()
    let score = 0
    const matched: string[] = []
    for (const term of terms) {
      const count = countOccurrences(lowered, term)
      if (count > 0) {
        matched.push(term)
        score += count
      }
    }
    if (matched.length > 0) {
      ranked.push({ path: file.path, score, matchedTerms: matched })
    }
  }
  ranked.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
  return ranked
}

/** Files likely affected by a change to one file. */
export interface AffectedFiles {
  /** The changed file. */
  readonly changedFile: string
  /** Files that import the changed file (direct dependents). */
  readonly directDependents: readonly string[]
  /** All files reachable from the changed file through import edges. */
  readonly transitiveDependents: readonly string[]
}

/** Find files affected by a change to one file.
 * @param graph - dependency graph.
 * @param changedFile - path of the changed file.
 * @returns affected files report.
 */
export function findAffectedFiles(
  graph: DependencyGraph,
  changedFile: string,
): AffectedFiles {
  const directDependents = graph.edges
    .filter((edge) => edge.to === changedFile)
    .map((edge) => edge.from)
    .sort()
  const transitive = new Set<string>()
  const queue = [...directDependents]
  while (queue.length > 0) {
    const current = queue.shift()!
    if (transitive.has(current)) continue
    transitive.add(current)
    for (const edge of graph.edges) {
      if (edge.to === current && !transitive.has(edge.from)) {
        queue.push(edge.from)
      }
    }
  }
  return {
    changedFile,
    directDependents,
    transitiveDependents: [...transitive].sort(),
  }
}

/** Extract import/require targets from file content. */
function extractImports(content: string): readonly string[] {
  const targets: string[] = []
  const patterns = [
    /import\s+(?:[^'"]*\s+from\s+)?['"]([^'"]+)['"]/g,
    /import\s+['"]([^'"]+)['"]/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]
  for (const pattern of patterns) {
    let match: RegExpExecArray | null
    while ((match = pattern.exec(content)) !== null) {
      const target = match[1]
      if (target !== undefined && !targets.includes(target)) {
        targets.push(target)
      }
    }
  }
  return targets
}

/** Resolve an import target to a file path in the observed file set. */
function resolveImport(
  fromPath: string,
  target: string,
  files: readonly ObservedFile[],
): string | null {
  const byPath = new Map(files.map((file) => [file.path, file]))
  // Strip leading ./ from relative imports.
  const normalizedTarget = target.replace(/^\.\//, '')
  // Direct relative match.
  if (byPath.has(normalizedTarget)) return normalizedTarget
  // Relative match with common extensions.
  const dir = fromPath.lastIndexOf('/')
  const baseDir = dir === -1 ? '' : fromPath.slice(0, dir + 1)
  const candidates = [
    `${normalizedTarget}.ts`,
    `${normalizedTarget}.tsx`,
    `${normalizedTarget}.js`,
    `${normalizedTarget}.jsx`,
    `${normalizedTarget}/index.ts`,
    `${normalizedTarget}/index.tsx`,
    `${normalizedTarget}/index.js`,
    `${normalizedTarget}/index.jsx`,
  ]
  for (const candidate of candidates) {
    const resolved = baseDir + candidate
    if (byPath.has(resolved)) return resolved
  }
  return null
}

/** Count overlapping substring occurrences. */
function countOccurrences(haystack: string, needle: string): number {
  if (needle === '') return 0
  let count = 0
  let index = 0
  while (true) {
    const found = haystack.indexOf(needle, index)
    if (found === -1) return count
    count += 1
    index = found + needle.length
  }
}

/** Files involved in at least one dependency cycle. */
function findCyclicFiles(files: readonly string[], edges: readonly DependencyEdge[]): readonly string[] {
  const adjacency = new Map<string, string[]>()
  for (const file of files) adjacency.set(file, [])
  for (const edge of edges) {
    const targets = adjacency.get(edge.from)
    if (targets !== undefined) targets.push(edge.to)
  }
  const cyclic = new Set<string>()
  const visited = new Set<string>()
  const stack = new Set<string>()
  const dfs = (node: string): boolean => {
    if (stack.has(node)) return true
    if (visited.has(node)) return false
    visited.add(node)
    stack.add(node)
    const targets = adjacency.get(node) ?? []
    let foundCycle = false
    for (const target of targets) {
      if (dfs(target)) foundCycle = true
    }
    stack.delete(node)
    if (foundCycle) cyclic.add(node)
    return foundCycle
  }
  for (const file of files) dfs(file)
  return [...cyclic].sort()
}
