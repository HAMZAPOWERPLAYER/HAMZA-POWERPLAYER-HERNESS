/**
 * Redact secrets from session-log text using the helpers in
 * `./secret-redaction.ts` and `./environment-diagnostics.ts`. This module owns
 * only the composition: it performs no I/O, holds no state, and does not read
 * or write any session file.
 *
 * @module @deepseek-ai/dsh-util-values/session-log-redaction
 */

import { redactSecrets, REDACTED_PLACEHOLDER } from './secret-redaction.ts'
import { buildDiagnostics } from './environment-diagnostics.ts'

/** A redacted session-log excerpt. */
export interface RedactedSessionLog {
  readonly redactedText: string
  readonly redactionCount: number
  readonly hadSecrets: boolean
}

/** Redact secrets from a session-log excerpt. */
/** Redact secrets from a session-log excerpt.
 * @param text - session-log text.
 * @param secretKeys - optional keys to treat as secret.
 * @returns the redacted log.
 */
export function redactSessionLog(text: string, secretKeys: readonly string[] = []): RedactedSessionLog {
  const redactedText = redactSecrets(text)
  const placeholderCount = countOccurrences(redactedText, REDACTED_PLACEHOLDER)
  const diagnostics = buildDiagnostics({ 'log': text }, secretKeys)
  const hadSecrets = placeholderCount > 0 || diagnostics.redactionCount > 0
  return { redactedText, redactionCount: placeholderCount, hadSecrets }
}

/** Whether a redacted log still contains the redaction placeholder. */
/** Whether a redacted log still contains the redaction placeholder.
 * @param log - redacted log.
 * @returns whether secrets were redacted.
 */
export function hasRedactedSecrets(log: RedactedSessionLog): boolean {
  return log.hadSecrets
}

/** Render a short status line for a redacted log. */
/** Render a short status line for a redacted log.
 * @param log - redacted log.
 * @returns the status line.
 */
export function formatRedactedSessionLog(log: RedactedSessionLog): string {
  if (!log.hadSecrets) return 'no secrets redacted'
  return `${log.redactionCount} secret(s) redacted`
}

function countOccurrences(text: string, needle: string): number {
  if (needle === '') return 0
  let count = 0
  let index = 0
  while (true) {
    const found = text.indexOf(needle, index)
    if (found === -1) return count
    count++
    index = found + needle.length
  }
}
