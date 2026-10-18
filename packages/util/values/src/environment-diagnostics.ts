/**
 * Redacted snapshots of environment and configuration values.
 *
 * Diagnostics frequently print the values a process runs with. These helpers
 * classify keys and values, replace secret-bearing content with a placeholder,
 * and verify that a report carries no unredacted entry whose key names a
 * secret. Every helper is a pure function of its arguments and performs no I/O.
 *
 * @module @deepseek-ai/dsh-util-values/environment-diagnostics
 */

import { REDACTED_PLACEHOLDER, redactSecretAssignment, redactSecrets } from './secret-redaction.ts'

/**
 * Key-name tokens that mark a key as secret-bearing, mirroring the key tokens
 * of {@link redactSecretAssignment}. The test reads the key text directly so
 * that keys outside that helper's `KEY=value` grammar are classified too.
 */
const SECRET_KEY_TOKENS = /SECRET|TOKEN|PASSWORD|PASSWD|API_KEY|PRIVATE_KEY|CREDENTIAL/u

/** Key-name tokens whose unredacted entries {@link assertNoUnredactedSecrets} rejects. */
const GUARDED_KEY_TOKENS = /SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY|CREDENTIAL/u

/** One environment value in a {@link DiagnosticsReport}. */
export interface DiagnosticEntry {
  /** Configuration key, exactly as given to {@link buildDiagnostics}. */
  readonly key: string
  /** Printable value: the original, its secret-shaped substrings redacted, or the placeholder. */
  readonly value: string
  /** Whether the key or the value caused a redaction. */
  readonly redacted: boolean
}

/** A key-sorted, redacted snapshot of environment values. */
export interface DiagnosticsReport {
  /** Every input entry, sorted by key in code-unit order. */
  readonly entries: readonly DiagnosticEntry[]
  /** Number of entries whose {@link DiagnosticEntry.redacted} flag is set. */
  readonly redactionCount: number
}

/**
 * Whether `key` names a value that must never be printed verbatim.
 *
 * Identifier-shaped keys go through the key test of
 * {@link redactSecretAssignment}, probed with a placeholder value because that
 * helper classifies only non-empty assignment lines; the token test then
 * covers keys the assignment grammar cannot express, such as dashed names.
 * @param key - configuration key to classify.
 * @returns whether the key names a secret-bearing value.
 */
function isSecretLikeKey(key: string): boolean {
  const probe = `${key}=probe`
  return redactSecretAssignment(probe) !== probe || SECRET_KEY_TOKENS.test(key.toUpperCase())
}

/**
 * Build a redacted diagnostics report from environment-style key/value pairs.
 *
 * An entry is replaced by {@link REDACTED_PLACEHOLDER} when its key appears in
 * `secretKeys` (compared case-insensitively) or when the key itself names a
 * secret. Every other value still passes through {@link redactSecrets}, so a
 * secret shape embedded in an otherwise ordinary value is removed as well and
 * the entry is marked redacted when that pass changed it. Entries are sorted by
 * key in code-unit order, independent of the host locale, and the report passes
 * {@link assertNoUnredactedSecrets}.
 *
 * @param input - environment-style key/value pairs to snapshot.
 * @param secretKeys - additional key names whose values are redacted whole,
 *   compared case-insensitively.
 * @returns the key-sorted entries and the count of redacted entries.
 */
export function buildDiagnostics(
  input: Readonly<Record<string, string>>,
  secretKeys?: readonly string[],
): DiagnosticsReport {
  const explicitKeys = new Set((secretKeys ?? []).map((key) => key.toLowerCase()))
  const entries: DiagnosticEntry[] = []
  for (const [key, value] of Object.entries(input)) {
    if (explicitKeys.has(key.toLowerCase()) || isSecretLikeKey(key)) {
      entries.push({ key, value: REDACTED_PLACEHOLDER, redacted: true })
      continue
    }
    const redactedValue = redactSecrets(value)
    entries.push({ key, value: redactedValue, redacted: redactedValue !== value })
  }
  entries.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  return { entries, redactionCount: entries.filter((entry) => entry.redacted).length }
}

/**
 * Render a report as one `key: value` line per entry, in report order.
 * @param report - report to render.
 * @returns the lines joined by newlines, or `''` for an empty report.
 */
export function formatDiagnostics(report: DiagnosticsReport): string {
  return report.entries.map((entry) => `${entry.key}: ${entry.value}`).join('\n')
}

/**
 * Reject a report that still carries an unredacted entry whose key names a
 * secret; such a report must not reach a log or an error message.
 * @param report - report to verify.
 */
export function assertNoUnredactedSecrets(report: DiagnosticsReport): void {
  const offenders = report.entries
    .filter((entry) => !entry.redacted && GUARDED_KEY_TOKENS.test(entry.key.toUpperCase()))
    .map((entry) => entry.key)
  if (offenders.length > 0) {
    throw new Error(`unredacted secret-bearing key(s): ${offenders.join(', ')}`)
  }
}
