/**
 * Static reference-integrity audit for observed Unity `.unity` and `.prefab`
 * scene text.
 *
 * `auditUnityReferences` scans caller-supplied scene and prefab texts line by
 * line and reports the references it cannot resolve against a caller-supplied
 * GUID set and file listing: serialized components whose `m_Script` GUID is
 * absent, other `guid:` values that are absent, and `Assets/...` path tokens
 * that match no observed file path.
 *
 * The checks are static text heuristics over the observed text, not Unity
 * Editor validation: nothing here parses YAML structure, resolves `fileID`
 * values, or invokes Unity tooling. No function reads the filesystem, holds
 * state, or performs I/O, and results are deterministic, so the same input
 * always produces the same output.
 *
 * @module @deepseek-ai/dsh-util-values/unity-reference-integrity
 */

import type { UnityDiagnostic } from './unity-diagnostics.ts'

/** One observed scene or prefab file whose text the caller already read. */
export interface ObservedSceneText {
  /** Scene or prefab path, reported unchanged as a finding's `file`. */
  readonly scenePath: string
  /** Full file text to scan. */
  readonly text: string
}

/** One unresolvable reference found in an observed scene or prefab. */
export interface UnityReferenceFinding extends UnityDiagnostic {
  /** 1-based line number within `file` where the reference occurs. */
  readonly line: number
}

/** Result of auditing observed scene and prefab references. */
export interface UnityReferenceAuditResult {
  /** All findings ordered by scene path, then line number, then check, then message. */
  readonly findings: readonly UnityReferenceFinding[]
  /** Whether any finding has severity `error`. */
  readonly hasErrors: boolean
  /** Whether any finding has severity `warning`. */
  readonly hasWarnings: boolean
}

/** One planned finding, carrying a concrete `file` before it becomes a {@link UnityReferenceFinding}. */
interface PlannedFinding {
  /** Severity of the finding. */
  readonly severity: UnityDiagnostic['severity']
  /** Check identifier of the finding. */
  readonly category: string
  /** Human-readable message. */
  readonly message: string
  /** Path of the observed scene or prefab carrying the reference. */
  readonly file: string
  /** Suggested resolution. */
  readonly suggestion: string
  /** 1-based line number of the reference. */
  readonly line: number
}

/** A component script key: the exact lowercase `m_Script` key with its value on the same line. */
const SCRIPT_KEY = /\bm_Script\s*:/

/** A GUID reference: the lowercase `guid` key and an exactly 32-hexadecimal-digit value. */
const GUID_REFERENCE = /(?:^|[^\w])guid\s*:\s*([0-9a-fA-F]{32})(?![0-9A-Za-z])/

/** One `Assets/...` path token: from the root to the first quote, comma, brace, bracket, colon, CR, or LF. */
const ASSET_PATH_TOKEN = /Assets\/[^"',}\]):\r\n]+/g

/**
 * Audit observed scene and prefab text against a known GUID set and an
 * observed file listing.
 *
 * Each observed text is scanned line by line. The checks and their limits:
 *
 * - `missing-script` (severity `error`): an `m_Script` line whose `guid`
 *   value is exactly 32 hexadecimal digits absent from `knownGuids`. The
 *   `m_Script` key and the `guid` key must appear on the same line, and an
 *   `m_Script` line that carries no such value is not examined.
 * - `unresolved-guid` (severity `warning`): any other line whose lowercase
 *   `guid` key carries a 32-hexadecimal-digit value absent from
 *   `knownGuids`. Values that are not exactly 32 hexadecimal digits are not
 *   examined. This broader check stays a warning because GUID references
 *   legitimately name assets outside a project's `.meta` listing, such as
 *   built-in resources and package assets.
 * - `broken-path` (severity `error`): an `Assets/...` path token absent
 *   from `observedPaths`. A token runs from `Assets/` to the first `"`,
 *   `'`, `,`, `}`, `]`, `)`, `:`, CR, or LF, is trimmed at both ends, and a
 *   token ending in `/` names a directory and is skipped. References rooted
 *   outside `Assets/`, such as `Packages/...`, are not examined.
 *
 * Every finding depends on the completeness of the supplied `knownGuids`
 * and `observedPaths`: a reference the Unity Editor would resolve still
 * reports a finding when its GUID or path is missing from the supplied
 * sets, so callers should include the GUIDs and paths their scenes
 * legitimately use. GUID values are folded to lowercase before comparison,
 * `knownGuids` entries are also trimmed, `\` separators in `observedPaths`
 * fold to `/`, and all comparisons are case-sensitive. Scene paths are
 * reported exactly as supplied. Repeated scene entries are scanned
 * separately and repeat their findings. Findings are ordered by scene path,
 * then 1-based line number, then check in the order `missing-script`,
 * `unresolved-guid`, `broken-path`, then message, so the same input always
 * produces the same output.
 *
 * @param observed - scene and prefab entries with their file path and full text.
 * @param knownGuids - GUID values that resolve; each value is trimmed and folded to lowercase before comparison.
 * @param observedPaths - file paths present in the project listing; `\` separators fold to `/` before comparison.
 * @returns the collected findings with their 1-based line numbers, and whether any finding is an error or a warning.
 */
export function auditUnityReferences(
  observed: readonly ObservedSceneText[],
  knownGuids: readonly string[],
  observedPaths: readonly string[],
): UnityReferenceAuditResult {
  const known = new Set<string>()
  for (const guid of knownGuids) known.add(guid.trim().toLowerCase())
  const paths = new Set<string>()
  for (const path of observedPaths) paths.add(path.replace(/\\/g, '/'))
  const planned: PlannedFinding[] = []
  for (const scene of observed) {
    let lineNumber = 0
    for (const line of scene.text.split('\n')) {
      lineNumber += 1
      const guidMatch = GUID_REFERENCE.exec(line)
      const rawGuid = guidMatch === null ? undefined : guidMatch[1]
      const guid = rawGuid?.toLowerCase() ?? null
      if (guid !== null && !known.has(guid)) {
        planned.push(SCRIPT_KEY.test(line)
          ? missingScriptFinding(scene, guid, lineNumber)
          : unresolvedGuidFinding(scene, guid, lineNumber))
      }
      for (const match of line.matchAll(ASSET_PATH_TOKEN)) {
        const token = match[0].trim()
        if (token.endsWith('/') || paths.has(token)) continue
        planned.push(brokenPathFinding(scene, token, lineNumber))
      }
    }
  }
  planned.sort((left, right) =>
    compareText(left.file, right.file)
    || left.line - right.line
    || categoryRank(left.category) - categoryRank(right.category)
    || compareText(left.message, right.message))
  return {
    findings: planned.map(finding => ({ ...finding })),
    hasErrors: planned.some(finding => finding.severity === 'error'),
    hasWarnings: planned.some(finding => finding.severity === 'warning'),
  }
}

/**
 * Build the `missing-script` finding for one scene line.
 * @param scene - observed scene carrying the reference.
 * @param guid - the unresolved `m_Script` GUID, folded to lowercase.
 * @param line - 1-based line number of the reference.
 * @returns the planned finding.
 */
function missingScriptFinding(scene: ObservedSceneText, guid: string, line: number): PlannedFinding {
  return {
    severity: 'error',
    category: 'missing-script',
    message: `m_Script references GUID ${guid}, which is absent from the known GUID set.`,
    file: scene.scenePath,
    suggestion: 'Restore the script asset so its GUID resolves, or remove the component.',
    line,
  }
}

/**
 * Build the `unresolved-guid` finding for one scene line.
 * @param scene - observed scene carrying the reference.
 * @param guid - the unresolved GUID, folded to lowercase.
 * @param line - 1-based line number of the reference.
 * @returns the planned finding.
 */
function unresolvedGuidFinding(scene: ObservedSceneText, guid: string, line: number): PlannedFinding {
  return {
    severity: 'warning',
    category: 'unresolved-guid',
    message: `GUID ${guid} is referenced but absent from the known GUID set.`,
    file: scene.scenePath,
    suggestion: "Restore the referenced asset's .meta file, or update the reference.",
    line,
  }
}

/**
 * Build the `broken-path` finding for one scene line.
 * @param scene - observed scene carrying the reference.
 * @param path - the unresolved `Assets/...` path token.
 * @param line - 1-based line number of the reference.
 * @returns the planned finding.
 */
function brokenPathFinding(scene: ObservedSceneText, path: string, line: number): PlannedFinding {
  return {
    severity: 'error',
    category: 'broken-path',
    message: `Path ${path} is referenced but matches no observed file path.`,
    file: scene.scenePath,
    suggestion: 'Correct the path, or add the file to the observed project listing.',
    line,
  }
}

/**
 * Rank the checks so findings on one line order deterministically.
 * @param category - check identifier of a finding.
 * @returns 0 for `missing-script`, 1 for `unresolved-guid`, 2 for `broken-path`.
 */
function categoryRank(category: string): number {
  if (category === 'missing-script') return 0
  return category === 'unresolved-guid' ? 1 : 2
}

/**
 * Order two strings lexicographically by UTF-16 code unit, as the default `Array.prototype.sort` does.
 * @param left - first string.
 * @param right - second string.
 * @returns a negative number, zero, or a positive number as `left` sorts before, with, or after `right`.
 */
function compareText(left: string, right: string): number {
  if (left === right) return 0
  return left < right ? -1 : 1
}
