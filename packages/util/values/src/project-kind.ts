/**
 * Pure project-kind detection from a list of repository markers.
 *
 * HERNES detects an engine or framework from real project files rather than
 * folder names. This module owns only the classification rules: callers supply
 * the marker paths they observed (from a directory listing or a project scan)
 * and receive a deterministic kind. No filesystem access, no caching, no state.
 *
 * @module @deepseek-ai/dsh-util-values/project-kind
 */

/** A detected project kind. */
export type ProjectKind =
  | 'unity'
  | 'godot'
  | 'flutter'
  | 'android'
  | 'node'
  | 'python'
  | 'unknown'

/** Marker paths that identify each kind. Paths use forward slashes. */
export const PROJECT_KIND_MARKERS: Readonly<Record<Exclude<ProjectKind, 'unknown'>, readonly string[]>> = {
  unity: ['ProjectSettings/ProjectSettings.asset'],
  godot: ['project.godot'],
  flutter: ['pubspec.yaml'],
  android: ['AndroidManifest.xml'],
  node: ['package.json'],
  python: ['pyproject.toml', 'setup.py', 'requirements.txt'],
}

/**
 * Normalize a marker path for comparison: forward slashes, trimmed, lowercased.
 * @param marker - raw path supplied by the caller.
 * @returns normalized marker.
 */
function normalize(marker: string): string {
  return marker.trim().replace(/\\/g, '/').toLowerCase()
}

/**
 * Whether the supplied markers contain any of the given needles (substring match
 * on normalized paths, so a marker like `app/src/main/AndroidManifest.xml`
 * still counts).
 * @param markers - normalized marker list.
 * @param needles - lowercase needles to look for.
 * @returns `true` when at least one marker contains a needle.
 */
function containsAny(markers: readonly string[], needles: readonly string[]): boolean {
  return needles.some((needle) => markers.some((marker) => marker.includes(needle)))
}

/**
 * Detect every project kind implied by the markers, in priority order (most
 * specific first). A repository can legitimately be several kinds at once
 * (e.g. a Flutter app that also has an Android manifest).
 *
 * @param markers - file paths or names observed in the project.
 * @returns all matching kinds, most specific first, never including `unknown`.
 */
export function detectProjectKinds(markers: readonly string[]): readonly ProjectKind[] {
  const normalized = markers.map(normalize)
  const kinds: ProjectKind[] = []
  if (containsAny(normalized, ['projectsettings/projectsettings.asset'])) {
    kinds.push('unity')
  }
  if (containsAny(normalized, ['project.godot'])) {
    kinds.push('godot')
  }
  if (containsAny(normalized, ['pubspec.yaml'])) {
    kinds.push('flutter')
  }
  // Android is only claimed when an Android manifest or Gradle build file is
  // present, so a plain Node repo with a stray gradle file does not qualify.
  if (
    containsAny(normalized, ['androidmanifest.xml']) ||
    containsAny(normalized, ['build.gradle', 'build.gradle.kts'])
  ) {
    kinds.push('android')
  }
  if (containsAny(normalized, ['package.json'])) {
    kinds.push('node')
  }
  if (containsAny(normalized, ['pyproject.toml', 'setup.py', 'requirements.txt'])) {
    kinds.push('python')
  }
  return kinds
}

/**
 * Detect the single primary project kind from a marker list. When several kinds
 * match, the most specific (game engine first, then framework, then language)
 * wins; `unknown` is returned when nothing matches.
 *
 * @param markers - file paths or names observed in the project.
 * @returns the primary project kind.
 */
export function detectProjectKind(markers: readonly string[]): ProjectKind {
  const kinds = detectProjectKinds(markers)
  return kinds.length > 0 ? (kinds[0] as ProjectKind) : 'unknown'
}

/**
 * Whether a kind is a game-engine project.
 * @param kind - project kind to test.
 * @returns `true` for Unity and Godot.
 */
export function isGameProjectKind(kind: ProjectKind): boolean {
  return kind === 'unity' || kind === 'godot'
}

/**
 * Marker paths a caller should look for to detect a given kind.
 * @param kind - project kind.
 * @returns the marker paths, or an empty list for `unknown`.
 */
export function markersForProjectKind(kind: ProjectKind): readonly string[] {
  if (kind === 'unknown') return []
  return PROJECT_KIND_MARKERS[kind]
}
