/**
 * Bounded build-log digestion for agent tool output.
 *
 * These helpers are pure: they read no files, run no commands, and observe no
 * clock or random source. A digest pairs exact counts of every matching line
 * with a small de-duplicated sample of those lines, so an agent can inspect a
 * long build log without receiving it in full.
 *
 * @module @deepseek-ai/dsh-util-values/log-digest
 */

/** Severity assigned to a digested log line. */
export type LogSeverity = 'error' | 'warning'

/** One matching log line retained in a digest. */
export interface LogEntry {
  /** 1-based line number in the normalized input; the first occurrence for a de-duplicated entry. */
  readonly line: number
  /** Line text after truncation to the digest's text budget. */
  readonly text: string
  /** Severity that classified the line. */
  readonly severity: LogSeverity
}

/** Bounded summary of a build log. */
export interface LogDigest {
  /** Lines in the normalized input; `0` for empty input. */
  readonly lines: number
  /** Every error-classified line, including duplicates and lines beyond the entry cap. */
  readonly errorCount: number
  /** Every warning-classified line, including duplicates and lines beyond the entry cap. */
  readonly warningCount: number
  /** De-duplicated error entries in first-appearance order, at most `maxEntriesPerSeverity` long. */
  readonly errors: readonly LogEntry[]
  /** De-duplicated warning entries in first-appearance order, at most `maxEntriesPerSeverity` long. */
  readonly warnings: readonly LogEntry[]
}

/** Bounds for {@link digestLog}; an omitted field keeps its documented default. */
export interface LogDigestOptions {
  /** Maximum retained entries per severity; defaults to `20` and must be at least `1`. */
  readonly maxEntriesPerSeverity?: number
  /** Characters kept from one line before `'...'` is appended; defaults to `300` and must be at least `1`. */
  readonly maxTextLength?: number
}

/** Default cap on retained entries per severity. */
const DEFAULT_MAX_ENTRIES_PER_SEVERITY = 20
/** Default number of characters kept from one line before the truncation marker. */
const DEFAULT_MAX_TEXT_LENGTH = 300
/** Marker appended to a line cut at the text budget. */
const TRUNCATION_MARKER = '...'
/** Error classification pattern; a line matching it is never classified as a warning. */
const ERROR_PATTERN = /\b(error|fatal|failed|failure|exception|cannot find)\b/i
/** Warning classification pattern. */
const WARNING_PATTERN = /\bwarn(ing)?\b/i

/**
 * Split input text into source lines.
 * @param text - raw input text.
 * @returns the lines after normalizing `'\r\n'` and `'\r'` to `'\n'` and removing exactly one trailing newline; `[]` when nothing remains.
 */
function splitLines(text: string): string[] {
  const normalized = text.replace(/\r\n?/g, '\n')
  const trimmed = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized
  return trimmed.length === 0 ? [] : trimmed.split('\n')
}

/**
 * Classify one normalized line.
 * @param line - normalized source line.
 * @returns `'error'` when the line matches the error pattern, otherwise `'warning'` when it matches the warning pattern, otherwise `undefined`.
 */
function classifyLine(line: string): LogSeverity | undefined {
  if (ERROR_PATTERN.test(line)) return 'error'
  if (WARNING_PATTERN.test(line)) return 'warning'
  return undefined
}

/**
 * Cut one line to the entry text budget.
 * @param line - normalized source line.
 * @param maxTextLength - characters kept before the truncation marker.
 * @returns the line unchanged when it fits, otherwise its first `maxTextLength` characters followed by `'...'`.
 */
function truncateLine(line: string, maxTextLength: number): string {
  if (line.length <= maxTextLength) return line
  return `${line.slice(0, maxTextLength)}${TRUNCATION_MARKER}`
}

/**
 * Digest build-log text into exact severity counts and a bounded sample of matching lines.
 *
 * Line numbering starts at 1. `'\r\n'` and `'\r'` are normalized to `'\n'`,
 * then exactly one trailing newline is removed, so a file-ending newline does
 * not create a phantom line. A line is an error when it matches
 * `/\b(error|fatal|failed|failure|exception|cannot find)\b/i` and a warning when
 * it matches `/\bwarn(ing)?\b/i`; a line matching both patterns is counted only
 * as an error.
 *
 * Counts include every matching line. The `errors` and `warnings` arrays are
 * de-duplicated by truncated text in first-appearance order and capped at
 * `maxEntriesPerSeverity`. Truncation is applied before de-duplication, so
 * lines longer than `maxTextLength` that share a truncated prefix collapse
 * into one entry; retained entry text is at most `maxTextLength` characters
 * plus the `'...'` marker.
 *
 * @param text - build-log text to digest.
 * @param options - entry cap and line text budget; defaults to 20 entries per severity and 300 characters per line.
 * @returns counts for every line plus the de-duplicated, capped matching entries.
 * @throws Error when `maxEntriesPerSeverity` is below 1 or `maxTextLength` is below 1.
 */
export function digestLog(text: string, options: LogDigestOptions = {}): LogDigest {
  const maxEntriesPerSeverity = options.maxEntriesPerSeverity ?? DEFAULT_MAX_ENTRIES_PER_SEVERITY
  const maxTextLength = options.maxTextLength ?? DEFAULT_MAX_TEXT_LENGTH
  if (maxEntriesPerSeverity < 1) {
    throw new Error(`log digest maxEntriesPerSeverity must be at least 1: ${maxEntriesPerSeverity}`)
  }
  if (maxTextLength < 1) {
    throw new Error(`log digest maxTextLength must be at least 1: ${maxTextLength}`)
  }

  const sourceLines = splitLines(text)
  const errors: LogEntry[] = []
  const warnings: LogEntry[] = []
  const seenErrorText = new Set<string>()
  const seenWarningText = new Set<string>()
  let errorCount = 0
  let warningCount = 0

  for (const [index, line] of sourceLines.entries()) {
    const severity = classifyLine(line)
    if (severity === undefined) continue
    const entryText = truncateLine(line, maxTextLength)
    if (severity === 'error') {
      errorCount += 1
      if (seenErrorText.has(entryText)) continue
      seenErrorText.add(entryText)
      if (errors.length < maxEntriesPerSeverity) errors.push({ line: index + 1, text: entryText, severity })
      continue
    }
    warningCount += 1
    if (seenWarningText.has(entryText)) continue
    seenWarningText.add(entryText)
    if (warnings.length < maxEntriesPerSeverity) warnings.push({ line: index + 1, text: entryText, severity })
  }

  return { lines: sourceLines.length, errorCount, warningCount, errors, warnings }
}

/**
 * Test whether a digest counted any error line.
 * @param digest - digest to inspect; its counts are authoritative, so entries dropped by de-duplication or the entry cap never hide errors.
 * @returns whether `errorCount` is greater than zero.
 */
export function hasErrors(digest: LogDigest): boolean {
  return digest.errorCount > 0
}

/**
 * Render a digest as a counts line followed by one error run and one warning run.
 *
 * Every rendered line is separated by `'\n'` and nothing follows the warning
 * run. A digest without entries yields only
 * `'<lines> lines, <errors> errors, <warnings> warnings'`.
 *
 * @param digest - digest to render.
 * @returns the counts line and, when present, `error: line <n>: <text>` followed by `warning: line <n>: <text>` lines.
 */
export function formatLogDigest(digest: LogDigest): string {
  const rendered = [`${digest.lines} lines, ${digest.errorCount} errors, ${digest.warningCount} warnings`]
  for (const entry of digest.errors) rendered.push(`error: line ${entry.line}: ${entry.text}`)
  for (const entry of digest.warnings) rendered.push(`warning: line ${entry.line}: ${entry.text}`)
  return rendered.join('\n')
}
