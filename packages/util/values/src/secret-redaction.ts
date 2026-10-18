/**
 * Secret redaction helpers for logs, diagnostics, and reports.
 *
 * Redacts common credential shapes from arbitrary text so that logs and error
 * reports never carry full secrets. The helpers are pure string transforms and
 * hold no state; they are a defense-in-depth layer, not a guarantee that every
 * secret shape is caught.
 *
 * @module @deepseek-ai/dsh-util-values/secret-redaction
 */

/** Replacement text used in place of a redacted secret. */
export const REDACTED_PLACEHOLDER = '[REDACTED]'

/** Patterns whose full match is treated as a secret. */
const SECRET_PATTERNS: readonly RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bBearer\s+[A-Za-z0-9._-]{16,}\b/gi,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
]

/**
 * Redact known secret shapes in `text`, replacing each match with
 * {@link REDACTED_PLACEHOLDER}.
 * @param text - input text that may contain secrets.
 * @returns text with secret-shaped substrings redacted.
 */
export function redactSecrets(text: string): string {
  let result = text
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, REDACTED_PLACEHOLDER)
  }
  return result
}

/**
 * Redact the value of a `KEY=value` or `KEY: value` assignment when the key
 * name suggests a secret. Useful for environment dumps.
 *
 * @param line - a single assignment line.
 * @returns the line with the value redacted when the key is secret-like.
 */
export function redactSecretAssignment(line: string): string {
  const match = /^(\s*[A-Za-z_][A-Za-z0-9_]*\s*[:=]\s*)(.+)$/u.exec(line)
  if (!match) return line
  const prefix = match[1] as string
  const key = line.slice(0, prefix.length).toUpperCase()
  if (!/(SECRET|TOKEN|PASSWORD|PASSWD|API_KEY|PRIVATE_KEY|CREDENTIAL)/u.test(key)) {
    return line
  }
  return `${prefix}${REDACTED_PLACEHOLDER}`
}
