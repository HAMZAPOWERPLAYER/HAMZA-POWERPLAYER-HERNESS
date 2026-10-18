/**
 * Ignore-rule parsing and matching: a small, documented subset of
 * gitignore-style behavior, kept pure. Rules are parsed from text lines and
 * matched against repository-relative path strings; nothing touches the
 * filesystem.
 *
 * Supported syntax: `#` comment lines, `!` negation, a trailing `/` for
 * directory-only rules, `*` inside one path segment, and `**` for any depth.
 * Matching is case-sensitive and anchored at the start of the path, so a
 * pattern matches the path itself or one of its leading directory prefixes.
 * Empty and `.` segments are dropped, and `..` stays a literal segment.
 *
 * This is not full gitignore support. `[abc]` character classes, `?` wildcards,
 * and backslash escapes are unsupported, so those characters match literally
 * and `**` is the way to match at any depth. `**` matches zero or more
 * segments, so `a/**` also matches `a` itself. A negated rule re-includes a path
 * even when an earlier rule ignored a parent directory, which gitignore
 * forbids. Backslashes separate segments in the tested path only; inside a
 * pattern they are literal.
 *
 * @module @deepseek-ai/dsh-util-values/ignore-rules
 */

/** Regular expression metacharacters, escaped so only `*` keeps its wildcard meaning. */
const REGEXP_METACHARACTERS = /[.*+?^${}()|[\]\\]/g

/** One parsed ignore-file line. */
export interface IgnoreRule {
  /** Pattern text with a leading `!` and any trailing `/` removed; empty when the line carried only markers. */
  readonly pattern: string
  /** Whether the line started with `!`, re-including paths that earlier rules ignored. */
  readonly negated: boolean
  /** Whether the line ended with `/`, restricting the rule to directories and their contents. */
  readonly directoryOnly: boolean
}

/**
 * Parse one ignore-file line.
 *
 * Trailing whitespace is removed first, so a whitespace-only line counts as
 * blank. Blank lines and lines whose first character is `#` produce no rule. A
 * leading `!` marks the rule negated, and a trailing `/` marks it directory-only
 * and is removed from the stored pattern. Everything else, including leading
 * whitespace and backslashes, belongs to the pattern.
 *
 * @param line - raw ignore-file line without its line terminator.
 * @returns the parsed rule, or `null` for a blank or comment line.
 */
export function parseIgnoreRule(line: string): IgnoreRule | null {
  const trimmed = line.replace(/\s+$/, '')
  if (trimmed === '' || trimmed.startsWith('#')) return null
  const negated = trimmed.startsWith('!')
  const body = negated ? trimmed.slice(1) : trimmed
  const directoryOnly = body.endsWith('/')
  return {
    pattern: directoryOnly ? body.replace(/\/+$/, '') : body,
    negated,
    directoryOnly,
  }
}

/**
 * Parse every line of an ignore file, dropping blank and comment lines.
 *
 * @param lines - raw ignore-file lines.
 * @returns rules in file order; later rules take precedence in {@link isIgnored}.
 */
export function parseIgnoreRules(lines: readonly string[]): readonly IgnoreRule[] {
  const rules: IgnoreRule[] = []
  for (const line of lines) {
    const rule = parseIgnoreRule(line)
    if (rule !== null) rules.push(rule)
  }
  return rules
}

/**
 * Test one rule's pattern against one path, ignoring the rule's negation.
 *
 * The path is normalized by replacing `\` with `/` and dropping empty and `.`
 * segments. The pattern matches when it covers the whole path, or when it covers
 * a leading directory prefix of it; a prefix match ignores a `directoryOnly`
 * rule's directory requirement because the path lies inside a matched
 * directory. A `directoryOnly` rule matches the path itself only when
 * `isDirectory` is `true`. A pattern with no segments, such as one parsed from
 * a bare `/`, matches nothing.
 *
 * @param rule - parsed rule whose pattern is tested.
 * @param path - repository-relative path of the file or directory to test.
 * @param isDirectory - whether `path` names a directory.
 * @returns whether the rule's pattern matches `path`.
 */
export function matchesIgnoreRule(rule: IgnoreRule, path: string, isDirectory: boolean): boolean {
  const pattern = splitSegments(rule.pattern)
  if (pattern.length === 0) return false
  const segments = splitSegments(path.replace(/\\/g, '/'))
  if (matchesExact(pattern, segments)) return !rule.directoryOnly || isDirectory
  return matchesAnyPrefix(pattern, segments.slice(0, segments.length - 1))
}

/**
 * Apply rules to one path with last-match-wins precedence.
 *
 * Every rule is tested in order and the last matching rule decides; a negated
 * last match re-includes the path, and a path no rule matches is not ignored.
 *
 * @param rules - rules in file order.
 * @param path - repository-relative path of the file or directory to test.
 * @param isDirectory - whether `path` names a directory.
 * @returns whether the last matching rule ignores `path`; `false` when no rule matches.
 */
export function isIgnored(rules: readonly IgnoreRule[], path: string, isDirectory: boolean): boolean {
  let ignored = false
  for (const rule of rules) {
    if (matchesIgnoreRule(rule, path, isDirectory)) ignored = !rule.negated
  }
  return ignored
}

/** Split a pattern or a normalized path into segments, dropping empty and `.` segments. */
function splitSegments(value: string): string[] {
  const segments: string[] = []
  for (const part of value.split('/')) {
    if (part === '' || part === '.') continue
    segments.push(part)
  }
  return segments
}

/** Whether a pattern segment matches one path segment: `*` matches any run of characters, everything else is literal. */
function matchesSegment(pattern: string, segment: string): boolean {
  const source = pattern
    .split('*')
    .map(part => part.replace(REGEXP_METACHARACTERS, '\\$&'))
    .join('[^/]*')
  return new RegExp(`^${source}$`).test(segment)
}

/** Whether the pattern consumes the path from the given positions, with `**` consuming any number of segments. */
function matchesExactAt(pattern: readonly string[], path: readonly string[], patternIndex: number, pathIndex: number): boolean {
  const patternSegment = pattern[patternIndex]
  if (patternSegment === undefined) return pathIndex === path.length
  if (patternSegment === '**') {
    for (let next = pathIndex; next <= path.length; next += 1) {
      if (matchesExactAt(pattern, path, patternIndex + 1, next)) return true
    }
    return false
  }
  const pathSegment = path[pathIndex]
  if (pathSegment === undefined) return false
  return matchesSegment(patternSegment, pathSegment)
    && matchesExactAt(pattern, path, patternIndex + 1, pathIndex + 1)
}

/** Whether the pattern consumes every path segment. */
function matchesExact(pattern: readonly string[], path: readonly string[]): boolean {
  return matchesExactAt(pattern, path, 0, 0)
}

/** Whether the pattern consumes some leading run of the path segments. */
function matchesAnyPrefix(pattern: readonly string[], path: readonly string[]): boolean {
  for (let length = 0; length <= path.length; length += 1) {
    if (matchesExact(pattern, path.slice(0, length))) return true
  }
  return false
}
