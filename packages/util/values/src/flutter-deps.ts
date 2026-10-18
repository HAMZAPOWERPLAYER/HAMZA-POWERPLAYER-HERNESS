/**
 * Analyze Flutter dependency health from a parsed pubspec plus a known-good package set.
 *
 * Every function is pure: none reads a file, consults a registry, or performs
 * I/O, so the caller supplies both the parsed pubspec and the known set.
 *
 * @module @deepseek-ai/dsh-util-values/flutter-deps
 */

import { pubspecDependencyDelta, type FlutterPubspec } from './flutter-pubspec-model.ts'

/** One dependency-health finding for a Flutter pubspec. */
export interface FlutterDependencyIssue {
  /** Declared dependency package name, or `flutter` for SDK/constraint findings. */
  readonly name: string
  /** Issue kind. */
  readonly kind: 'missing' | 'undeclared' | 'flutter-sdk-missing' | 'sdk-constraint-missing'
  /** Human-readable explanation. */
  readonly detail: string
}

/** Compare a parsed pubspec against a known package set and report each issue once.
 * @param pubspec - parsed pubspec from {@link parsePubspec}.
 * @param knownPackages - package names known to be available.
 * @returns issues sorted by name then kind, each issue reported once.
 */
export function analyzeFlutterDependencies(
  pubspec: FlutterPubspec,
  knownPackages: readonly string[],
): readonly FlutterDependencyIssue[] {
  const { missing, undeclared } = pubspecDependencyDelta(pubspec, knownPackages)

  const issues: FlutterDependencyIssue[] = []

  for (const name of missing) {
    issues.push({ name, kind: 'missing', detail: 'not in known package set' })
  }
  for (const name of undeclared) {
    issues.push({ name, kind: 'undeclared', detail: 'not declared in pubspec' })
  }
  if (!pubspec.hasFlutterSdkDependency) {
    issues.push({
      name: 'flutter',
      kind: 'flutter-sdk-missing',
      detail: 'pubspec does not declare the Flutter SDK dependency',
    })
  }
  if (pubspec.sdkConstraint === null) {
    issues.push({
      name: 'flutter',
      kind: 'sdk-constraint-missing',
      detail: 'environment.sdk constraint not declared',
    })
  }

  issues.sort((left, right) => {
    if (left.name < right.name) return -1
    if (left.name > right.name) return 1
    if (left.kind < right.kind) return -1
    if (left.kind > right.kind) return 1
    return 0
  })

  return issues
}

/** Render one issue as `name: kind — detail`.
 * @param issue - issue to render.
 * @returns the rendered issue line.
 */
export function formatFlutterDependencyIssue(issue: FlutterDependencyIssue): string {
  return `${issue.name}: ${issue.kind} — ${issue.detail}`
}

/** Overall dependency health level for one pubspec against one known set.
 * @param pubspec - parsed pubspec from {@link parsePubspec}.
 * @param knownPackages - package names known to be available.
 * @returns `'critical'` when the Flutter SDK is missing, `'warning'` when any issue exists, else `'healthy'`.
 */
export function flutterDependencyHealth(
  pubspec: FlutterPubspec,
  knownPackages: readonly string[],
): 'healthy' | 'warning' | 'critical' {
  const issues = analyzeFlutterDependencies(pubspec, knownPackages)
  for (const issue of issues) {
    if (issue.kind === 'flutter-sdk-missing') return 'critical'
  }
  for (const issue of issues) {
    const kind = issue.kind
    if (
      kind === 'missing' ||
      kind === 'undeclared' ||
      kind === 'sdk-constraint-missing'
    ) {
      return 'warning'
    }
  }
  return 'healthy'
}
