/**
 * Pure text truncation and byte-summary helpers.
 *
 * These functions are stateless and perform no I/O. Each truncation stops at a
 * caller-supplied character or line budget and reports how much input it
 * dropped, so shortened text is never mistaken for the whole. Lengths count
 * UTF-16 code units, matching `String.prototype.length`.
 *
 * @module @deepseek-ai/dsh-util-values/text-truncation
 */

/** Text retained by a truncation, plus what the truncation dropped. */
export interface TruncationResult {
  /** Retained text; the original input when `truncated` is false. */
  readonly text: string
  /** Whether any input characters were dropped. */
  readonly truncated: boolean
  /** Dropped input characters, counted before any replacement marker; `0` when `truncated` is false. */
  readonly removedChars: number
}

/**
 * Shorten `text` to at most `maxChars` UTF-16 code units, ending with `ellipsis`.
 *
 * The kept prefix is the longest one whose length plus `ellipsis.length` stays
 * within `maxChars`, clamped at zero. The result exceeds `maxChars` only when
 * `ellipsis` alone is longer than `maxChars`. The cut can fall between the
 * halves of a surrogate pair.
 *
 * @param text - text to shorten.
 * @param maxChars - budget for the result in UTF-16 code units.
 * @param ellipsis - marker appended when text is dropped.
 * @returns the shortened text, or `text` unchanged when `text.length <= maxChars`.
 */
export function truncateChars(text: string, maxChars: number, ellipsis = '…'): TruncationResult {
  if (text.length <= maxChars) return { text, truncated: false, removedChars: 0 }
  const prefix = text.slice(0, Math.max(0, maxChars - ellipsis.length))
  return { text: `${prefix}${ellipsis}`, truncated: true, removedChars: text.length - prefix.length }
}

/**
 * Keep the first `maxLines` lines of `text`, split on `'\n'`.
 *
 * No marker is appended: the kept text ends where the dropped lines began, and
 * `removedChars` counts their characters including the `'\n'` separators. A
 * budget of zero or less keeps nothing, except that empty input reports no
 * truncation because nothing was dropped.
 *
 * @param text - text to shorten.
 * @param maxLines - number of leading lines to keep.
 * @returns the kept lines, or `text` unchanged when it has at most `maxLines` lines.
 */
export function truncateLines(text: string, maxLines: number): TruncationResult {
  if (maxLines <= 0) return { text: '', truncated: text.length > 0, removedChars: text.length }
  const lines = text.split('\n')
  if (lines.length <= maxLines) return { text, truncated: false, removedChars: 0 }
  const kept = lines.slice(0, maxLines).join('\n')
  return { text: kept, truncated: true, removedChars: text.length - kept.length }
}

/** Bytes in one kibibyte. */
const KIB = 1024
/** Bytes in one mebibyte. */
const MIB = KIB * 1024
/** Bytes in one gibibyte. */
const GIB = MIB * 1024
/** Bytes in one tebibyte. */
const TIB = GIB * 1024

/**
 * Render a byte count for display, using the 1024-based units `B`, `KiB`,
 * `MiB`, `GiB`, and `TiB`.
 *
 * Values below one kibibyte are whole bytes; larger values keep one decimal and
 * never step down, so `1023` stays `'1023 B'` and `1024` becomes `'1.0 KiB'`.
 *
 * @param bytes - byte count to render.
 * @returns the formatted count; `'0 B'` for negative or non-finite input.
 */
export function summarizeBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  if (bytes < KIB) return `${Math.round(bytes)} B`
  if (bytes < MIB) return `${(bytes / KIB).toFixed(1)} KiB`
  if (bytes < GIB) return `${(bytes / MIB).toFixed(1)} MiB`
  if (bytes < TIB) return `${(bytes / GIB).toFixed(1)} GiB`
  return `${(bytes / TIB).toFixed(1)} TiB`
}
