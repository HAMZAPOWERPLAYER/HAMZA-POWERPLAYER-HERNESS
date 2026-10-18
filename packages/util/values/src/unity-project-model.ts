/**
 * Unity project metadata read from file text: the editor version recorded in
 * `ProjectSettings/ProjectVersion.txt` and the declared dependencies of
 * `Packages/manifest.json`. Comparison and summary helpers work on the parsed
 * values. Nothing here touches the filesystem.
 *
 * Editor version text:
 *
 * - Text is split on `\n` and every line is trimmed, so a `\r` from a CRLF file
 *   disappears and a version never spans lines.
 * - The first line whose trimmed text begins with the exact key
 *   `m_EditorVersion` decides the result. Spaces are allowed around the `:`
 *   and around the value; `m_EditorVersionWithRevision` is a different key and
 *   is never read as the editor version. The revision hash that line may carry
 *   in parentheses is not a number and is not stored.
 * - The value must be `MAJOR.MINOR.PATCH[RELEASE]REVISION`: three decimal
 *   components, one lowercase release letter (`a`, `b`, `f`, or `p`), and
 *   optional revision digits. An omitted revision makes `revision` 0. Leading
 *   zeros are accepted and survive only in `raw`.
 * - Text with no `m_EditorVersion` line, or whose value is not that form,
 *   yields `null`.
 *
 * Package manifest text:
 *
 * - The text is read with `JSON.parse`; invalid JSON yields `null`.
 * - A root that is not an object, or a `dependencies` member that is not an
 *   object (absent, `null`, an array, or another value), yields `null`.
 * - Only string values are kept; every other value type is dropped. An empty
 *   `dependencies` object, or one whose values are all dropped, yields an
 *   empty record rather than `null`.
 *
 * Comparison uses the numeric fields in the order major, minor, patch, release
 * stream rank, revision, and never `raw`; the summary text is fixed so callers
 * can assert it.
 *
 * @module @deepseek-ai/dsh-util-values/unity-project-model
 */

/** One editor version parsed from Unity `ProjectSettings/ProjectVersion.txt` text. */
export interface UnityEditorVersion {
  /** Decimal major component, as in `6000` of `6000.0.23f1`. */
  readonly major: number
  /** Decimal minor component, as in `0` of `6000.0.23f1`. */
  readonly minor: number
  /** Decimal patch component, as in `23` of `6000.0.23f1`. */
  readonly patch: number
  /** Release stream: `a` alpha, `b` beta, `f` final, `p` patch. */
  readonly releaseType: 'a' | 'b' | 'f' | 'p'
  /** Revision digits after the release letter; `0` when the token omits them. */
  readonly revision: number
  /** The version token exactly as written on the line, including any leading zeros. */
  readonly raw: string
}

/** Release stream rank used by {@link compareEditorVersions}, oldest stream first. */
const RELEASE_TYPE_RANK: Readonly<Record<UnityEditorVersion['releaseType'], number>> = {
  a: 0,
  b: 1,
  f: 2,
  p: 3,
}

/** Release stream names used by {@link formatUnitySummary}. */
const RELEASE_TYPE_NAMES: Readonly<Record<UnityEditorVersion['releaseType'], string>> = {
  a: 'alpha',
  b: 'beta',
  f: 'final',
  p: 'patch',
}

/** An `m_EditorVersion` line: the exact key, spaces around `:`, then the value. */
const EDITOR_VERSION_LINE = /^m_EditorVersion\s*:\s*(.*)$/

/** A version token: three decimal components, one lowercase release letter from `abfp`, then optional revision digits. */
const VERSION_TOKEN = /^(\d+)\.(\d+)\.(\d+)([abfp])(\d*)$/

/**
 * Parse the editor version out of `ProjectSettings/ProjectVersion.txt` text.
 *
 * The value of the first `m_EditorVersion` line is read as for
 * {@link UnityEditorVersion}; when that value is not a version token the result
 * is `null`, so a later repeated key cannot mask a malformed file. The function
 * never throws.
 *
 * @param text - contents of a `ProjectSettings/ProjectVersion.txt` file.
 * @returns the parsed version, or `null` when the text carries none.
 */
export function parseEditorVersion(text: string): UnityEditorVersion | null {
  for (const rawLine of text.split('\n')) {
    const match = EDITOR_VERSION_LINE.exec(rawLine.trim())
    if (match === null) continue
    const token = (match[1] ?? '').trim()
    const tokenMatch = VERSION_TOKEN.exec(token)
    if (tokenMatch === null) return null
    const [, major = '', minor = '', patch = '', releaseType = '', revision = ''] = tokenMatch
    return {
      major: Number(major),
      minor: Number(minor),
      patch: Number(patch),
      releaseType: releaseType as UnityEditorVersion['releaseType'],
      revision: revision === '' ? 0 : Number(revision),
      raw: token,
    }
  }
  return null
}

/**
 * Order two parsed editor versions, oldest first.
 *
 * Comparison is numeric, field by field: major, minor, patch, release stream
 * rank (`a` < `b` < `f` < `p`), then revision. `raw` never participates, so two
 * tokens that differ only in leading zeros compare equal.
 *
 * @param a - first version to compare.
 * @param b - second version to compare.
 * @returns `-1` when `a` precedes `b`, `0` when the parsed fields are equal, `1` when `a` follows `b`.
 */
export function compareEditorVersions(a: UnityEditorVersion, b: UnityEditorVersion): number {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1
  const rankA = RELEASE_TYPE_RANK[a.releaseType]
  const rankB = RELEASE_TYPE_RANK[b.releaseType]
  if (rankA !== rankB) return rankA < rankB ? -1 : 1
  if (a.revision !== b.revision) return a.revision < b.revision ? -1 : 1
  return 0
}

/**
 * Read the declared dependencies of a Unity `Packages/manifest.json` file.
 *
 * The `dependencies` member holds package names mapped to version strings; any
 * member whose value is not a string is dropped, including a nested object or
 * array. A dropped-only object yields an empty record, and a dependency named
 * `__proto__` becomes an ordinary own property.
 *
 * @param text - contents of a `Packages/manifest.json` file.
 * @returns the string-valued dependency entries, or `null` when the text is not JSON or carries no `dependencies` object.
 */
export function parsePackageManifest(text: string): Readonly<Record<string, string>> | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (_error) {
    // Non-JSON manifest text carries no dependency list to read.
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
  const root = parsed as Readonly<Record<string, unknown>>
  const dependencies = root['dependencies']
  if (typeof dependencies !== 'object' || dependencies === null || Array.isArray(dependencies)) return null
  const entries: [string, string][] = []
  for (const [name, value] of Object.entries(dependencies as Readonly<Record<string, unknown>>)) {
    if (typeof value === 'string') entries.push([name, value])
  }
  return Object.fromEntries(entries)
}

/**
 * Render one summary line for a parsed editor version.
 *
 * @param version - parsed version, or `null` when the file carried none.
 * @returns `no Unity editor version found` for `null`, otherwise `Unity <raw> (<release stream name>)` such as `Unity 6000.0.23f1 (final)`.
 */
export function formatUnitySummary(version: UnityEditorVersion | null): string {
  if (version === null) return 'no Unity editor version found'
  return `Unity ${version.raw} (${RELEASE_TYPE_NAMES[version.releaseType]})`
}
