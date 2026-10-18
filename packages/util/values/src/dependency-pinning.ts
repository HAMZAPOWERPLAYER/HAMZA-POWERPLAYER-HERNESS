/**
 * Package.json dependency-specifier classification and policy auditing for
 * supply-chain review.
 *
 * Every function here is pure: none reads a manifest, consults a registry, or
 * performs I/O, so the caller decides which dependency sections feed an audit.
 *
 * @module @deepseek-ai/dsh-util-values/dependency-pinning
 */

/**
 * The resolver family a dependency specifier belongs to.
 *
 * - `exact`: a pinned `major.minor.patch` version, optionally with prerelease
 *   or build metadata.
 * - `caret`: a `^` compatible range.
 * - `tilde`: a `~` patch/minor range.
 * - `range`: a comparator, union, or hyphen range.
 * - `workspace`: a pnpm `workspace:` protocol specifier.
 * - `file`: a `file:`, `link:`, or `portal:` local specifier.
 * - `git`: a git host shorthand, git URL, or `.git` URL.
 * - `url`: an `http://` or `https://` tarball URL.
 * - `tag`: a dist-tag name such as `latest`.
 * - `wildcard`: a `*` range or an `x`/`X` version segment.
 * - `unknown`: a value no other kind describes.
 */
export type SpecifierKind =
  | 'exact'
  | 'caret'
  | 'tilde'
  | 'range'
  | 'workspace'
  | 'file'
  | 'git'
  | 'url'
  | 'tag'
  | 'wildcard'
  | 'unknown'

/** Registry dist-tag names that resolve to a moving version. */
const DIST_TAGS: ReadonlySet<string> = new Set(['latest', 'next', 'beta', 'alpha', 'canary', 'rc'])

/** Git host markers of a `<host>:<owner>/<repo>` shorthand specifier. */
const GIT_HOST_MARKERS = ['github:', 'gitlab:', 'bitbucket:'] as const

/** A pinned `major.minor.patch` version with optional prerelease and build metadata. */
const EXACT_VERSION_PATTERN = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/

/** One `.`-separated version segment made only of digits. */
const NUMERIC_SEGMENT_PATTERN = /^\d+$/

/**
 * Whether a specifier carries an npm git-host shorthand marker.
 *
 * @param value - specifier to inspect.
 * @returns whether any host marker occurs in the value.
 */
function containsGitHost(value: string): boolean {
  return GIT_HOST_MARKERS.some(marker => value.includes(marker))
}

/**
 * Whether a version-shaped value uses an `x`/`X` wildcard segment: every
 * `.`-separated segment is either digits or a bare `x`, and at least one
 * segment is `x`.
 *
 * @param value - specifier to inspect.
 * @returns whether the value is an `x`-segment version pattern.
 */
function isWildcardSegmentPattern(value: string): boolean {
  let sawWildcard = false
  for (const segment of value.split('.')) {
    if (segment === 'x' || segment === 'X') {
      sawWildcard = true
      continue
    }
    if (!NUMERIC_SEGMENT_PATTERN.test(segment)) return false
  }
  return sawWildcard
}

/**
 * Classify one manifest specifier by the resolver family it selects.
 *
 * Classification is lexical and the rules are applied in order; the first
 * match wins:
 *
 * 1. An empty or whitespace-only value is `unknown`.
 * 2. A `workspace:` prefix is `workspace`, including `workspace:*`.
 * 3. A `file:`, `link:`, or `portal:` prefix is `file`.
 * 4. A `git+` prefix, a `github:`, `gitlab:`, or `bitbucket:` substring, or a
 *    `.git` suffix is `git`. This precedes rule 5, so `git+https://…` is `git`.
 * 5. An `http://` or `https://` prefix is `url`.
 * 6. An `npm:` prefix is classified by the remainder, so `npm:^1.0.0` is
 *    `caret` and a bare `npm:` is `unknown`.
 * 7. A `*` anywhere, or a version pattern whose `.`-separated segments are all
 *    digits or a bare `x`/`X` with at least one `x` segment (`x`, `1.x`,
 *    `1.X`, `1.x.x`), is `wildcard`. This precedes rule 9, so `^1.2.*` is
 *    `wildcard`.
 * 8. A dist-tag name — `latest`, `next`, `beta`, `alpha`, `canary`, or `rc`,
 *    compared case-insensitively — is `tag`.
 * 9. A `^` prefix is `caret`; a `~` prefix is `tilde`. This precedes rule 10,
 *    so `^1.0.0 || ^2.0.0` is `caret`.
 * 10. A `>`, `<`, or `=` prefix, a `||` union, or a ` - ` hyphen range is
 *     `range`. This precedes rule 11, so `=1.2.3` is `range`.
 * 11. An exact `major.minor.patch` version with optional prerelease and build
 *     metadata is `exact`.
 * 12. Every other value is `unknown`.
 *
 * Only rule 1 tolerates surrounding whitespace; every other rule reads the raw
 * value. Values that only resemble a resolvable specifier fall through to
 * `unknown`, including shorthand `owner/repo` git specifiers with no host
 * marker and `npm:` alias targets such as `@scope/name@1.0.0`. The result is
 * the resolver family, not a resolution guarantee.
 *
 * @param value - one dependency specifier, exactly as written in the manifest.
 * @returns the matching specifier kind.
 */
export function classifySpecifier(value: string): SpecifierKind {
  if (value.trim() === '') return 'unknown'
  if (value.startsWith('workspace:')) return 'workspace'
  if (value.startsWith('file:') || value.startsWith('link:') || value.startsWith('portal:')) return 'file'
  if (value.startsWith('git+') || containsGitHost(value) || value.endsWith('.git')) return 'git'
  if (value.startsWith('http://') || value.startsWith('https://')) return 'url'
  if (value.startsWith('npm:')) return classifySpecifier(value.slice('npm:'.length))
  if (value.includes('*') || isWildcardSegmentPattern(value)) return 'wildcard'
  if (DIST_TAGS.has(value.toLowerCase())) return 'tag'
  if (value.startsWith('^')) return 'caret'
  if (value.startsWith('~')) return 'tilde'
  if (
    value.startsWith('>') ||
    value.startsWith('<') ||
    value.startsWith('=') ||
    value.includes('||') ||
    value.includes(' - ')
  ) {
    return 'range'
  }
  if (EXACT_VERSION_PATTERN.test(value)) return 'exact'
  return 'unknown'
}

/**
 * The specifier kinds a manifest may use.
 */
export interface DependencyPolicy {
  /** Accepted kinds; an empty list makes every dependency a violation. */
  readonly allowedKinds: readonly SpecifierKind[]
}

/**
 * One dependency whose specifier kind the policy does not accept.
 */
export interface DependencyViolation {
  /** Dependency name, exactly as written in the manifest. */
  readonly name: string
  /** The rejected specifier, unchanged. */
  readonly specifier: string
  /** Kind {@link classifySpecifier} assigned to {@link DependencyViolation.specifier}. */
  readonly kind: SpecifierKind
}

/**
 * Report every dependency whose specifier kind the policy does not allow.
 *
 * @param dependencies - dependency names mapped to their manifest specifiers,
 *   as read from one or more manifest sections; merging sections is the
 *   caller's responsibility.
 * @param policy - the kinds the manifest may use.
 * @returns the violations sorted by dependency name in code-unit order, empty
 *   when every specifier satisfies the policy.
 */
export function auditDependencySpecifiers(
  dependencies: Readonly<Record<string, string>>,
  policy: DependencyPolicy,
): readonly DependencyViolation[] {
  const violations: DependencyViolation[] = []
  for (const [name, specifier] of Object.entries(dependencies)) {
    const kind = classifySpecifier(specifier)
    if (!policy.allowedKinds.includes(kind)) violations.push({ name, specifier, kind })
  }
  violations.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)
  return violations
}

/**
 * Render an audit result as one `name: specifier (kind)` line per violation.
 *
 * @param violations - violations to render, in the order they should appear.
 * @returns `every specifier satisfies the policy` for an empty list, otherwise
 *   the lines joined by newlines with no trailing newline.
 */
export function formatDependencyAudit(violations: readonly DependencyViolation[]): string {
  if (violations.length === 0) return 'every specifier satisfies the policy'
  return violations.map(violation => `${violation.name}: ${violation.specifier} (${violation.kind})`).join('\n')
}
