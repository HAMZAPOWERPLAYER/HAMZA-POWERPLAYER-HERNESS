/**
 * A documented subset reader for Flutter's `pubspec.yaml`.
 *
 * The reader handles the two-space indented form used by `flutter create` and
 * by the pubspec files the harness encounters, without pulling in a YAML
 * library. It does not implement anchors, aliases, multi-document streams,
 * block scalars, flow collections, or multi-line strings; it reads flat
 * `key: value` pairs and the three nested blocks `environment:`, `dependencies:`,
 * and `dev_dependencies:`, plus the `flutter: sdk: flutter` dependency form.
 *
 * All helpers are deterministic, hold no state, and perform no I/O.
 *
 * @module @deepseek-ai/dsh-util-values/flutter-pubspec-model
 */

/** Values read from one pubspec document. */
export interface FlutterPubspec {
  /** Package name, or `null` when the text declares none. */
  readonly name: string | null
  /** Package description, or `null` when the text declares none. */
  readonly description: string | null
  /** `sdk` value from the `environment:` block, or `null` when it is absent. */
  readonly sdkConstraint: string | null
  /** Direct dependency package names, sorted ascending and de-duplicated. */
  readonly dependencies: readonly string[]
  /** Development dependency package names, sorted ascending and de-duplicated. */
  readonly devDependencies: readonly string[]
  /** Total number of direct dependencies. */
  readonly dependencyCount: number
  /** Whether the document declares the Flutter SDK dependency (`flutter:\n  sdk: flutter`). */
  readonly hasFlutterSdkDependency: boolean
}

/** Read a documented pubspec subset from text. */
/** Read a documented pubspec subset from text.
 * @param text - pubspec.yaml text.
 * @returns the parsed pubspec values.
 */
export function parsePubspec(text: string): FlutterPubspec {
  let name: string | null = null
  let description: string | null = null
  let sdkConstraint: string | null = null
  const dependencies = new Set<string>()
  const devDependencies = new Set<string>()
  let hasFlutterSdkDependency = false

  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  let section: 'top' | 'environment' | 'dependencies' | 'dev_dependencies' = 'top'
  let insideFlutterSdkDependency = false

  for (const rawLine of lines) {
    const withoutComment = stripComment(rawLine)
    if (withoutComment.trim() === '') continue
    const indent = leadingSpaces(withoutComment)
    const trimmed = withoutComment.trim()

    if (indent === 0) {
      insideFlutterSdkDependency = false
      const pair = splitKeyValue(trimmed)
      if (pair === null) continue
      const [key, value] = pair
      if (key === 'name') name = unquote(value)
      else if (key === 'description') description = unquote(value)
      else if (key === 'environment') section = 'environment'
      else if (key === 'dependencies') {
        section = 'dependencies'
      } else if (key === 'dev_dependencies') {
        section = 'dev_dependencies'
      } else {
        section = 'top'
      }
      continue
    }

    if (indent >= 2) {
      if (section === 'environment') {
        const pair = splitKeyValue(trimmed)
        if (pair !== null && pair[0] === 'sdk') sdkConstraint = unquote(pair[1])
        continue
      }

      if (section === 'dependencies' || section === 'dev_dependencies') {
        if (indent >= 4) {
          // Nested keys of a dependency (git:, url:, sdk:, path:, ...) are
          // not package names. Only the flutter-sdk form is recorded.
          const pair = splitKeyValue(trimmed)
          if (pair !== null && pair[0] === 'sdk' && pair[1] === 'flutter' && insideFlutterSdkDependency) {
            hasFlutterSdkDependency = true
          }
          continue
        }
        if (trimmed.startsWith('- ')) {
          const value = unquote(trimmed.slice(2).trim())
          if (value !== '') {
            const target = section === 'dependencies' ? dependencies : devDependencies
            target.add(value)
          }
          continue
        }
        const pair = splitKeyValue(trimmed)
        if (pair === null) continue
        const [key, value] = pair
        const target = section === 'dependencies' ? dependencies : devDependencies
        if (key === 'flutter' && value === '') {
          insideFlutterSdkDependency = section === 'dependencies'
          continue
        }
        if (key === 'sdk' && value === 'flutter' && insideFlutterSdkDependency) {
          hasFlutterSdkDependency = true
          continue
        }
        target.add(key)
        continue
      }
    }
  }

  const sortedDependencies = [...dependencies].sort()
  const sortedDevDependencies = [...devDependencies].sort()

  return {
    name,
    description,
    sdkConstraint,
    dependencies: sortedDependencies,
    devDependencies: sortedDevDependencies,
    dependencyCount: sortedDependencies.length,
    hasFlutterSdkDependency,
  }
}

/** Compare declared dependencies against a known set. */
/** Compare declared dependencies against a known set.
 * @param declared - parsed pubspec.
 * @param known - dependency names the caller already has.
 * @returns missing and undeclared dependency names.
 */
export function pubspecDependencyDelta(
  declared: FlutterPubspec,
  known: readonly string[],
): { readonly missing: readonly string[]; readonly undeclared: readonly string[] } {
  const declaredSet = new Set(declared.dependencies)
  const knownSet = new Set(known)
  const missing = declared.dependencies.filter((item) => !knownSet.has(item)).sort()
  const undeclared = [...knownSet].filter((item) => !declaredSet.has(item)).sort()
  return { missing, undeclared }
}

/** Render one pubspec summary line. */
/** Render one pubspec summary line.
 * @param pubspec - parsed pubspec.
 * @returns the summary line.
 */
export function formatFlutterPubspec(pubspec: FlutterPubspec): string {
  const name = pubspec.name ?? 'unknown'
  const sdk = pubspec.sdkConstraint ?? 'unconstrained'
  return `name=${name} sdk=${sdk} deps=${pubspec.dependencyCount} devDeps=${pubspec.devDependencies.length} flutterSdk=${pubspec.hasFlutterSdkDependency ? 'yes' : 'no'}`
}

function stripComment(line: string): string {
  let inSingle = false
  let inDouble = false
  for (let index = 0; index < line.length; index++) {
    const char = line[index]
    if (char === "'" && !inDouble) inSingle = !inSingle
    else if (char === '"' && !inSingle) inDouble = !inDouble
    else if (char === '#' && !inSingle && !inDouble) return line.slice(0, index)
  }
  return line
}

function leadingSpaces(line: string): number {
  let count = 0
  while (count < line.length && line[count] === ' ') count++
  return count
}

function splitKeyValue(text: string): [string, string] | null {
  const colon = text.indexOf(':')
  if (colon === -1) return null
  const key = text.slice(0, colon).trim()
  if (key === '') return null
  const value = text.slice(colon + 1).trim()
  return [key, value]
}

function unquote(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length >= 2) {
    const first = trimmed[0]
    const last = trimmed[trimmed.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1)
    }
  }
  return trimmed
}
