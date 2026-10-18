/**
 * Pure allow/deny checks for dependency license obligations.
 *
 * This is a review aid only: it compares normalized license identifiers against
 * a {@link LicensePolicy} allow and deny list. It is NOT legal advice and NOT an
 * SPDX compatibility engine. It does not parse `OR`/`WITH` expressions, does
 * not compare license conditions, and does not apply copyleft or compatibility
 * rules; a decision reports only whether the policy names the identifier.
 *
 * Every helper is deterministic, holds no state, and performs no I/O. Callers
 * own collecting license fields from dependency manifests and interpreting the
 * decisions.
 *
 * @module @deepseek-ai/dsh-util-values/license-policy
 */

/** Outcome of comparing one license identifier against a policy. */
export type LicenseDecision = 'allowed' | 'denied' | 'unknown'

/**
 * Allow and deny list a license check compares against.
 *
 * Entries are compared after {@link normalizeLicenseId}, so spelling
 * differences that normalization does not erase, such as `Apache-2.0` versus
 * `Apache 2.0`, must be listed explicitly. Entries that normalize to the empty
 * string name no identifier and are ignored.
 */
export interface LicensePolicy {
  /** License identifiers the policy permits. */
  readonly allowed: readonly string[]
  /** License identifiers the policy forbids; denial outranks allowance. */
  readonly denied: readonly string[]
}

/** One license identifier and the decision a policy produced for it. */
export interface LicenseDecisionEntry {
  /** Normalized license identifier the decision applies to. */
  readonly id: string
  /** Decision for this identifier. */
  readonly decision: LicenseDecision
}

/** Decisions for one list of license identifiers, with the overall outcome. */
export interface LicenseEvaluation {
  /** One entry per distinct normalized identifier, in first-seen order. */
  readonly entries: readonly LicenseDecisionEntry[]
  /**
   * `'denied'` when any entry is denied, otherwise `'unknown'` when any entry
   * is unknown or the input list is empty, otherwise `'allowed'`.
   */
  readonly overall: LicenseDecision
  /** Normalized identifiers decided `'unknown'`, in first-seen order. */
  readonly unknownIds: readonly string[]
  /** Normalized identifiers decided `'denied'`, in first-seen order. */
  readonly deniedIds: readonly string[]
}

/**
 * Normalize a license identifier for policy comparison.
 *
 * Trims the identifier, collapses every internal whitespace run to one space,
 * and uppercases it. No other rewriting happens: `Apache-2.0` and
 * `Apache 2.0` remain different identifiers, so a policy must list the exact
 * spelling it accepts.
 *
 * @param id - license identifier as written in a manifest.
 * @returns the normalized identifier, or the empty string for a blank input.
 */
export function normalizeLicenseId(id: string): string {
  return id.trim().replace(/\s+/g, ' ').toUpperCase()
}

/**
 * Normalize policy entries and drop the ones that name no identifier.
 * @param ids - license identifiers listed by a policy.
 * @returns normalized identifiers that are not the empty string.
 */
function normalizeEntries(ids: readonly string[]): readonly string[] {
  return ids.map(normalizeLicenseId).filter(id => id !== '')
}

/**
 * Decide one already-normalized identifier against already-normalized lists.
 * @param normalized - identifier returned by {@link normalizeLicenseId}, never empty.
 * @param allowed - normalized allowed identifiers.
 * @param denied - normalized denied identifiers.
 * @returns `'denied'` when the deny list names the identifier, otherwise `'allowed'` or `'unknown'`.
 */
function decideNormalized(normalized: string, allowed: readonly string[], denied: readonly string[]): LicenseDecision {
  if (denied.includes(normalized)) return 'denied'
  return allowed.includes(normalized) ? 'allowed' : 'unknown'
}

/**
 * Decide whether a policy allows one license identifier.
 *
 * Denial outranks allowance: an identifier listed in both lists is `'denied'`.
 * An identifier the policy does not list is `'unknown'` and never implicitly
 * allowed. Matching is case- and whitespace-insensitive through
 * {@link normalizeLicenseId}.
 *
 * @param id - license identifier as written in a manifest.
 * @param policy - allow and deny list to compare against.
 * @returns the decision for `id`.
 */
export function evaluateLicense(id: string, policy: LicensePolicy): LicenseDecision {
  const normalized = normalizeLicenseId(id)
  if (normalized === '') return 'unknown'
  return decideNormalized(normalized, normalizeEntries(policy.allowed), normalizeEntries(policy.denied))
}

/**
 * Decide a whole list of license identifiers against one policy.
 *
 * Identifiers are normalized and de-duplicated first, so two spellings that
 * normalize alike contribute one entry and one derived id. A blank identifier
 * contributes an entry with an empty `id` and decision `'unknown'`.
 *
 * The overall decision is `'denied'` when any entry is denied; otherwise
 * `'unknown'` when any entry is unknown or `ids` is empty; otherwise
 * `'allowed'`.
 *
 * @param ids - license identifiers as written in manifests.
 * @param policy - allow and deny list to compare against.
 * @returns one entry per distinct identifier plus the derived id lists.
 */
export function evaluateLicenses(ids: readonly string[], policy: LicensePolicy): LicenseEvaluation {
  const allowed = normalizeEntries(policy.allowed)
  const denied = normalizeEntries(policy.denied)
  const entries: LicenseDecisionEntry[] = []
  const unknownIds: string[] = []
  const deniedIds: string[] = []
  const seen = new Set<string>()
  for (const id of ids) {
    const normalized = normalizeLicenseId(id)
    if (seen.has(normalized)) continue
    seen.add(normalized)
    const decision = normalized === '' ? 'unknown' : decideNormalized(normalized, allowed, denied)
    entries.push({ id: normalized, decision })
    if (decision === 'denied') deniedIds.push(normalized)
    else if (decision === 'unknown') unknownIds.push(normalized)
  }
  let overall: LicenseDecision = 'allowed'
  if (deniedIds.length > 0) overall = 'denied'
  else if (unknownIds.length > 0 || entries.length === 0) overall = 'unknown'
  return { entries, overall, unknownIds, deniedIds }
}

/**
 * Render an evaluation as a deterministic multi-line report.
 *
 * The first line is `overall: <decision>`. A `denied: a, b` line follows only
 * when at least one identifier was denied, then an `unknown: a, b` line only
 * when at least one identifier was unknown. Lines are joined with `\n`.
 *
 * @param evaluation - evaluation to render.
 * @returns the report text without a trailing newline.
 */
export function formatLicenseEvaluation(evaluation: LicenseEvaluation): string {
  const lines = [`overall: ${evaluation.overall}`]
  if (evaluation.deniedIds.length > 0) lines.push(`denied: ${evaluation.deniedIds.join(', ')}`)
  if (evaluation.unknownIds.length > 0) lines.push(`unknown: ${evaluation.unknownIds.join(', ')}`)
  return lines.join('\n')
}

/**
 * List dependency names that carry no usable license under a policy.
 *
 * A name is returned when its license is `null`, blank, or evaluates to
 * `'unknown'`. A denied license is still a known license, so it is not
 * returned here; use {@link evaluateLicenses} for that decision. Callers own
 * collecting the license field from each manifest, including deciding what an
 * absent field means.
 *
 * @param licenses - license field per dependency name, or `null` when absent.
 * @param policy - allow and deny list to compare against.
 * @returns matching names sorted in code-unit order.
 */
export function unlicensedDependencies(
  licenses: Readonly<Record<string, string | null>>,
  policy: LicensePolicy,
): readonly string[] {
  const names: string[] = []
  for (const name of Object.keys(licenses)) {
    const license = licenses[name]
    if (license === null || license === undefined || evaluateLicense(license, policy) === 'unknown') names.push(name)
  }
  return names.sort()
}
