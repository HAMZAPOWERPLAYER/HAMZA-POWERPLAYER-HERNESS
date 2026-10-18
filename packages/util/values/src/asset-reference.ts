/**
 * Parse Unity `.meta` asset reference files into the GUID and the referenced
 * asset path for dependency-graph inspection.
 *
 * The reader scans text instead of using a YAML parser, so it reads the
 * `guid:` and `fileID:` keys in any order but cannot resolve YAML anchors,
 * aliases, or multi-line values. Performs no I/O and holds no state.
 *
 * @module @deepseek-ai/dsh-util-values/asset-reference
 */

/** One asset reference read from a `.meta` file. */
export interface AssetReference {
  /** Asset GUID declared in the file. */
  readonly guid: string
  /** Asset file ID, or `null` when the file declares none. */
  readonly fileID: string | null
  /** Asset path the `.meta` file belongs to, or `null` when absent. */
  readonly assetPath: string | null
}

/** Read one `.meta` file's asset reference.
 * @param text - `.meta` file text.
 * @returns the parsed reference, or `null` when no `guid` is declared.
 */
export function parseAssetReference(text: string): AssetReference | null {
  const guidMatch = /(?:^|\n)\s*guid:\s*([0-9A-Fa-f]{32})/m.exec(text)
  const guid = guidMatch?.[1] ?? null
  if (guid === null) return null
  const fileIDMatch = /(?:^|\n)\s*fileID:\s*([0-9]+)/m.exec(text)
  const fileID = fileIDMatch?.[1] ?? null
  const assetPathMatch = /(?:^|\n)\s*assetPath:\s*"([^"]*)"/m.exec(text)
  const assetPath = assetPathMatch?.[1] ?? null
  return { guid, fileID, assetPath }
}

/** Group asset references by GUID, reporting collisions. */
export interface AssetReferenceGroup {
  readonly guid: string
  readonly assetPaths: readonly string[]
}

/** Find GUIDs claimed by more than one asset path.
 * @param references - parsed asset references.
 * @returns collision groups sorted by guid, each group's paths sorted.
 */
export function findAssetGuidCollisions(references: readonly AssetReference[]): readonly AssetReferenceGroup[] {
  const byGuid = new Map<string, string[]>()
  for (const ref of references) {
    if (ref.assetPath === null) continue
    const paths = byGuid.get(ref.guid) ?? []
    paths.push(ref.assetPath)
    byGuid.set(ref.guid, paths)
  }
  const collisions: AssetReferenceGroup[] = []
  for (const [guid, paths] of byGuid) {
    if (paths.length < 2) continue
    collisions.push({ guid, assetPaths: [...paths].sort() })
  }
  collisions.sort((a, b) => (a.guid < b.guid ? -1 : a.guid > b.guid ? 1 : 0))
  return collisions
}

/** Render one collision group.
 * @param collision - collision group to render.
 * @returns the rendered collision line.
 */
export function formatAssetGuidCollision(collision: AssetReferenceGroup): string {
  return `GUID ${collision.guid}: ${collision.assetPaths.join(', ')}`
}
