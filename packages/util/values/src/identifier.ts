/**
 * Kebab-case identifier validation and normalization.
 *
 * Identifiers name sessions, tools, presets, and other durable records, so they
 * must stay stable while text from users, configuration, or model output varies
 * in casing and separators. This module owns only the lexical rules:
 * validation, normalization, and composition of names. It performs no I/O,
 * holds no state, and imports nothing.
 *
 * @module @deepseek-ai/dsh-util-values/identifier
 */

/**
 * Matches a valid kebab-case identifier: lowercase alphanumeric runs separated
 * by single hyphens, with no leading, trailing, or repeated hyphen.
 */
export const IDENTIFIER_PATTERN: RegExp = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Whether a value is already a valid kebab-case identifier.
 * @param value - candidate identifier.
 * @returns `true` when `value` matches {@link IDENTIFIER_PATTERN}.
 */
export function isValidIdentifier(value: string): boolean {
  return IDENTIFIER_PATTERN.test(value)
}

/**
 * Normalize arbitrary text into a kebab-case identifier: trim outer whitespace,
 * lowercase, collapse every run of non-alphanumeric characters into one
 * hyphen, and strip leading and trailing hyphens. Only `a-z` and `0-9` count as
 * alphanumeric, so accented and non-Latin letters act as separators and are
 * dropped. Text without any alphanumeric character normalizes to the empty
 * string.
 *
 * @param value - text to normalize.
 * @returns the normalized identifier, possibly empty.
 */
export function normalizeIdentifier(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Compose a kebab-case identifier from parts, in the order given. Each part is
 * normalized with {@link normalizeIdentifier}, parts that normalize to nothing
 * are dropped, and the remainder are joined with single hyphens.
 *
 * @param parts - text fragments to combine, in output order.
 * @returns the joined identifier, or the empty string when every part normalizes to nothing.
 */
export function makeIdentifier(parts: readonly string[]): string {
  const normalized: string[] = []
  for (const part of parts) {
    const candidate = normalizeIdentifier(part)
    if (candidate.length > 0) normalized.push(candidate)
  }
  return normalized.join('-')
}

/**
 * Assert that a value is a valid kebab-case identifier.
 * @param value - candidate identifier.
 * @param name - label for the value in the failure message; defaults to `identifier`.
 * @returns `value` unchanged when it is valid.
 * @throws Error when `value` does not match {@link IDENTIFIER_PATTERN}.
 */
export function assertIdentifier(value: string, name = 'identifier'): string {
  if (!isValidIdentifier(value)) {
    throw new Error(`${name} must be a kebab-case identifier`)
  }
  return value
}
