/**
 * List-based Unity `.meta` audit for a project file listing.
 *
 * `auditUnityMeta` pairs the asset paths of a listing with their companion
 * `.meta` paths and reports what is missing, orphaned, or doubled.
 * `collectGuids` and `findGuidCollisions` read the GUID recorded in each
 * supplied `.meta` text and report every GUID that more than one path claims.
 * `formatUnityMetaAudit` renders a pairing report as text.
 *
 * Every function consumes only the path strings and file texts the caller
 * supplies: nothing here reads the filesystem, and no function holds state or
 * performs I/O. Results are deterministic, so the same input always produces
 * the same output.
 *
 * Unity writes one `.meta` file beside each asset and stores the GUID through
 * which scenes and prefabs reference that asset. A missing `.meta` loses the
 * asset's import settings and identity, a stray `.meta` is dead project data,
 * and one GUID shared by two assets breaks every reference that uses it, so
 * this audit looks for those three conditions.
 *
 * @module @deepseek-ai/dsh-util-values/unity-meta-audit
 */

/** Path prefix that puts an entry in scope; the comparison is case-sensitive. */
const ASSETS_PREFIX = 'Assets/'

/** Suffix Unity appends to an asset path to name its companion file. */
const META_SUFFIX = '.meta'

/** Suffix of a `.meta` file written for another `.meta` file. */
const META_OF_META_SUFFIX = '.meta.meta'

/** A `guid` key line: the exact key, spaces around `:`, then the value. */
const GUID_LINE = /^guid\s*:\s*(.*)$/

/** Exactly 32 hexadecimal digits, in either case. */
const GUID_VALUE = /^[0-9a-fA-F]{32}$/

/** Pairing problems found in one project file listing. */
export interface UnityMetaAudit {
  /** In-scope asset paths whose `<path>.meta` companion is absent from the listing, sorted. */
  readonly missingMeta: readonly string[]
  /** In-scope `.meta` paths whose underlying asset is absent from the listing, sorted. */
  readonly orphanMeta: readonly string[]
  /** In-scope `.meta` paths that end in `.meta.meta`, sorted. */
  readonly metaOfMeta: readonly string[]
}

/** One GUID read from a supplied `.meta` text. */
export interface UnityGuidEntry {
  /** Path of the `.meta` file, exactly as supplied. */
  readonly path: string
  /** The GUID as 32 hexadecimal digits, folded to lowercase. */
  readonly guid: string
}

/** One GUID claimed by more than one distinct `.meta` path. */
export interface UnityGuidCollision {
  /** The duplicated GUID, folded to lowercase. */
  readonly guid: string
  /** The two or more distinct `.meta` paths carrying that GUID, sorted. */
  readonly paths: readonly string[]
}

/**
 * Audit one project file listing for `.meta` pairing problems.
 *
 * Path rules:
 *
 * - Every path is normalized by replacing `\` with `/` before any comparison,
 *   and reported paths use `/`.
 * - Only paths that start with the case-sensitive prefix `Assets/` are
 *   considered. `assets/...`, a bare `Assets` entry, and paths such as
 *   `ProjectSettings/ProjectVersion.txt` fall outside the prefix and are
 *   ignored. `Assets/StreamingAssets/...` stays in scope: Unity writes `.meta`
 *   files for streaming assets like for any other asset.
 * - A path whose final segment is empty, such as `Assets/Scenes/`, marks a
 *   directory and is ignored.
 * - A path ending in `.meta` is never treated as an asset.
 * - Comparison uses the de-duplicated set of normalized paths, so a repeated
 *   entry never changes a result.
 *
 * `missingMeta` lists in-scope assets with no `<path>.meta` entry,
 * `orphanMeta` lists in-scope `.meta` paths with no entry at the asset path
 * formed by removing the `.meta` suffix, and `metaOfMeta` lists in-scope
 * `.meta` paths that end in `.meta.meta`. Every list is sorted
 * lexicographically by UTF-16 code unit and holds no duplicates.
 *
 * @param paths - project-relative path strings, assets and `.meta` files mixed.
 * @returns the three pairing problem lists; a clean listing yields three empty lists.
 */
export function auditUnityMeta(paths: readonly string[]): UnityMetaAudit {
  const assets = new Set<string>()
  const metas = new Set<string>()
  for (const entry of paths) {
    const path = entry.replace(/\\/g, '/')
    if (!path.startsWith(ASSETS_PREFIX) || path.endsWith('/')) continue
    if (path.endsWith(META_SUFFIX)) metas.add(path)
    else assets.add(path)
  }
  const missingMeta: string[] = []
  for (const asset of assets) {
    if (!metas.has(`${asset}${META_SUFFIX}`)) missingMeta.push(asset)
  }
  const orphanMeta: string[] = []
  const metaOfMeta: string[] = []
  for (const meta of metas) {
    if (meta.endsWith(META_OF_META_SUFFIX)) metaOfMeta.push(meta)
    if (!assets.has(meta.slice(0, meta.length - META_SUFFIX.length))) orphanMeta.push(meta)
  }
  return {
    missingMeta: missingMeta.sort(),
    orphanMeta: orphanMeta.sort(),
    metaOfMeta: metaOfMeta.sort(),
  }
}

/**
 * Read the GUID recorded in each supplied `.meta` text.
 *
 * Lines are split on `\n` and trimmed, so a `\r` from a CRLF file disappears.
 * The first line whose trimmed text begins with the exact key `guid` decides
 * the result for that file: spaces are allowed around the `:` and around the
 * value, and a value that is not exactly 32 hexadecimal digits yields no entry.
 * The GUID is folded to lowercase. Entries whose path does not end in the
 * lowercase suffix `.meta` are ignored, and the stored path is the supplied
 * path unchanged.
 *
 * @param entries - supplied paths with their file text; entries for paths other than `.meta` files are ignored.
 * @returns one entry per read GUID, sorted by path and then by GUID when one path appears more than once.
 */
export function collectGuids(
  entries: readonly { readonly path: string; readonly content: string }[],
): readonly UnityGuidEntry[] {
  const collected: UnityGuidEntry[] = []
  for (const entry of entries) {
    if (!entry.path.endsWith(META_SUFFIX)) continue
    const guid = readGuid(entry.content)
    if (guid === null) continue
    collected.push({ path: entry.path, guid })
  }
  collected.sort((left, right) => compareText(left.path, right.path) || compareText(left.guid, right.guid))
  return collected
}

/**
 * Report every GUID claimed by more than one distinct `.meta` path.
 *
 * GUIDs are read as for {@link collectGuids}, so an uppercase and a lowercase
 * spelling of one value collide. Paths are compared exactly as supplied, so the
 * same path repeated with the same GUID yields no collision and paths that
 * differ only in separator style are distinct.
 *
 * @param entries - supplied paths with their file text; entries for paths other than `.meta` files are ignored.
 * @returns one entry per colliding GUID, sorted by GUID, each holding its distinct paths sorted.
 */
export function findGuidCollisions(
  entries: readonly { readonly path: string; readonly content: string }[],
): readonly UnityGuidCollision[] {
  const pathsByGuid = new Map<string, Set<string>>()
  for (const entry of collectGuids(entries)) {
    let paths = pathsByGuid.get(entry.guid)
    if (paths === undefined) {
      paths = new Set<string>()
      pathsByGuid.set(entry.guid, paths)
    }
    paths.add(entry.path)
  }
  const collisions: UnityGuidCollision[] = []
  for (const [guid, paths] of pathsByGuid) {
    if (paths.size < 2) continue
    collisions.push({ guid, paths: [...paths].sort() })
  }
  collisions.sort((left, right) => compareText(left.guid, right.guid))
  return collisions
}

/**
 * Render a pairing audit as one line per non-empty category.
 *
 * Categories appear in the fixed order missing meta, orphan meta, meta of
 * meta, each as `<label>: <count> (<path>, <path>)`. An audit whose three lists
 * are all empty renders as `unity meta audit: clean`.
 *
 * @param audit - audit to render, typically from {@link auditUnityMeta}.
 * @returns the report text, without a trailing newline.
 */
export function formatUnityMetaAudit(audit: UnityMetaAudit): string {
  const lines: string[] = []
  appendCategory(lines, 'missing meta', audit.missingMeta)
  appendCategory(lines, 'orphan meta', audit.orphanMeta)
  appendCategory(lines, 'meta of meta', audit.metaOfMeta)
  if (lines.length === 0) return 'unity meta audit: clean'
  return lines.join('\n')
}

/** Append the `label: count (paths)` line for one category unless the category is empty. */
function appendCategory(lines: string[], label: string, paths: readonly string[]): void {
  if (paths.length === 0) return
  lines.push(`${label}: ${paths.length} (${paths.join(', ')})`)
}

/**
 * Read the GUID of one `.meta` text.
 *
 * @param content - `.meta` file text to scan.
 * @returns the lowercase GUID, or `null` when the first `guid` line carries no 32-digit hexadecimal value.
 */
function readGuid(content: string): string | null {
  for (const rawLine of content.split('\n')) {
    const match = GUID_LINE.exec(rawLine.trim())
    if (match === null) continue
    const value = (match[1] ?? '').trim()
    return GUID_VALUE.test(value) ? value.toLowerCase() : null
  }
  return null
}

/** Order two strings lexicographically by UTF-16 code unit, as `Array.prototype.sort` does by default. */
function compareText(left: string, right: string): number {
  if (left === right) return 0
  return left < right ? -1 : 1
}
