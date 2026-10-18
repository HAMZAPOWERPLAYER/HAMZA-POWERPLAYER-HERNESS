/**
 * Pure path-safety helpers for workspace containment checks.
 *
 * Normalizes separators, resolves `.`/`..` segments, and tests whether a
 * candidate path stays within an authorized root. No filesystem access: callers
 * supply the strings they observed and decide what to do with the result.
 *
 * @module @deepseek-ai/dsh-util-values/path-safety
 */

function normalizeSeparators(path: string): string {
  return path.replace(/\\/g, '/')
}

/**
 * Split a path into segments, dropping empty and `.` segments, and resolving
 * `..` by popping the previous segment. Does not touch the filesystem.
 * @param path - input path.
 * @returns normalized segment list.
 */
export function normalizePathSegments(path: string): string[] {
  const segments: string[] = []
  for (const part of normalizeSeparators(path).split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (segments.length > 0) segments.pop()
      continue
    }
    segments.push(part)
  }
  return segments
}

/**
 * Normalize a path to a canonical forward-slash form without a leading slash
 * unless the input was absolute.
 * @param path - input path.
 * @returns normalized path.
 */
export function normalizePath(path: string): string {
  const absolute = normalizeSeparators(path).startsWith('/')
  const segments = normalizePathSegments(path)
  const joined = segments.join('/')
  return absolute ? `/${joined}` : joined
}

/**
 * Whether `candidate` resolves inside `root` (inclusive of `root` itself).
 * Both arguments are normalized internally.
 *
 * @param root - authorized root.
 * @param candidate - path to test.
 * @returns `true` when candidate stays within root.
 */
export function isPathWithinRoot(root: string, candidate: string): boolean {
  const rootSegments = normalizePathSegments(root)
  if (rootSegments.length === 0) return false
  const candidateSegments = normalizePathSegments(candidate)
  if (candidateSegments.length < rootSegments.length) return false
  for (let i = 0; i < rootSegments.length; i += 1) {
    if (candidateSegments[i] !== rootSegments[i]) return false
  }
  return true
}

/**
 * Resolve a relative path against a root and return the normalized result, or
 * `null` when the result escapes the root.
 *
 * @param root - authorized root.
 * @param relativePath - path to resolve (may be absolute; treated as relative to root).
 * @returns the normalized contained path, or `null` when it escapes.
 */
export function resolveContainedPath(root: string, relativePath: string): string | null {
  const rootSegments = normalizePathSegments(root)
  const raw = normalizeSeparators(relativePath).trim()
  const absolute = raw.startsWith('/')
  const resolved: string[] = absolute ? [] : [...rootSegments]
  for (const part of raw.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (resolved.length === 0) return null
      resolved.pop()
      if (!absolute && resolved.length < rootSegments.length) return null
      continue
    }
    resolved.push(part)
  }
  if (absolute) {
    const candidate = `/${resolved.join('/')}`
    if (!isPathWithinRoot(root, candidate)) return null
    return resolved.join('/')
  }
  if (resolved.length < rootSegments.length) return null
  for (let i = 0; i < rootSegments.length; i += 1) {
    if (resolved[i] !== rootSegments[i]) return null
  }
  return resolved.join('/')
}
