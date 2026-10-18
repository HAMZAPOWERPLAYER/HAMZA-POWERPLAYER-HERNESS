/**
 * Summaries of a {@link redactSecrets} pass over one text.
 *
 * Redaction replaces every secret-shaped substring with the same placeholder,
 * so a report can state how many substrings were removed and which candidate
 * labels the source text mentioned, but it cannot attribute individual removals
 * to individual patterns. All helpers are pure functions of their arguments and
 * perform no I/O.
 *
 * @module @deepseek-ai/dsh-util-values/redaction-report
 */

import { redactSecrets, REDACTED_PLACEHOLDER } from './secret-redaction.ts'

/** One candidate label and the redaction count attributed to it. */
export interface RedactionFinding {
  /** Candidate label the count is attributed to. */
  readonly label: string
  /** Redactions attributed to `label`. */
  readonly count: number
}

/** Output of {@link buildRedactionReport}: the redacted text plus inferred findings. */
export interface RedactionReport {
  /** `text` with every secret-shaped substring replaced by {@link REDACTED_PLACEHOLDER}. */
  readonly redactedText: string
  /** One finding per candidate label mentioned in the source text, sorted by label. */
  readonly findings: readonly RedactionFinding[]
  /** Number of {@link REDACTED_PLACEHOLDER} occurrences in `redactedText`. */
  readonly totalRedactions: number
}

/** Count non-overlapping occurrences of a non-empty `needle` in `haystack`. */
function countOccurrences(haystack: string, needle: string): number {
  let count = 0
  let index = haystack.indexOf(needle)
  while (index !== -1) {
    count++
    index = haystack.indexOf(needle, index + needle.length)
  }
  return count
}

/**
 * Redact `text` and infer which candidate labels were redacted.
 *
 * Every secret shape is replaced by the same {@link REDACTED_PLACEHOLDER}, so
 * the redacted text carries no record of which pattern matched. Attribution is
 * therefore inferred from the source text rather than counted per pattern: a
 * label is reported when its lowercase form occurs in `text`, and each reported
 * `count` is the total placeholder count, not a per-label tally. Labels absent
 * from `text` are omitted, and a label that occurs in `text` yields no finding
 * when nothing was redacted.
 *
 * @param text - source text that may contain secrets.
 * @param labels - candidate labels to check against the source text.
 * @returns the redacted text and the inferred findings, sorted by label in
 *   code-unit order.
 */
export function buildRedactionReport(text: string, labels: readonly string[]): RedactionReport {
  const redactedText = redactSecrets(text)
  const totalRedactions = countOccurrences(redactedText, REDACTED_PLACEHOLDER)
  const findings: RedactionFinding[] = []
  if (totalRedactions > 0) {
    const source = text.toLowerCase()
    for (const label of labels) {
      if (source.includes(label.toLowerCase())) findings.push({ label, count: totalRedactions })
    }
  }
  findings.sort((a, b) => a.label < b.label ? -1 : a.label > b.label ? 1 : 0)
  return { redactedText, findings, totalRedactions }
}

/**
 * Whether the report removed at least one secret-shaped substring.
 * @param report - report to inspect.
 * @returns `true` when the report counts any redaction.
 */
export function hasRedactions(report: RedactionReport): boolean {
  return report.totalRedactions > 0
}

/**
 * Render the report as one `label: count` line per finding plus a final
 * `total: N` line.
 * @param report - report to render.
 * @returns `'no redactions'` when {@link hasRedactions} is false, otherwise the
 *   finding lines followed by the placeholder total.
 */
export function formatRedactionReport(report: RedactionReport): string {
  if (!hasRedactions(report)) return 'no redactions'
  const lines = report.findings.map((finding) => `${finding.label}: ${finding.count}`)
  lines.push(`total: ${report.totalRedactions}`)
  return lines.join('\n')
}
