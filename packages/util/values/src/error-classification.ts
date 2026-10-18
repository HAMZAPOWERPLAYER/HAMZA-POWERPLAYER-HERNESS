/**
 * Pure error classification for retry and reporting decisions.
 *
 * Classifies a failure into a small set of categories and decides whether a
 * retry is appropriate. Deterministic, stateless, and free of I/O.
 *
 * @module @deepseek-ai/dsh-util-values/error-classification
 */

/** A coarse failure category. */
export type ErrorCategory =
  | 'transient'
  | 'permanent'
  | 'validation'
  | 'not-found'
  | 'permission'
  | 'unknown'

/** A classified failure. */
export interface ClassifiedError {
  readonly category: ErrorCategory
  readonly retryable: boolean
  readonly message: string
  readonly code?: string
}

function matches(haystack: string, needles: readonly string[]): boolean {
  const lower = haystack.toLowerCase()
  return needles.some((needle) => lower.includes(needle))
}

/**
 * Classify an error from its message, optional code, and optional HTTP status.
 * @param input - message plus optional code and status code.
 * @returns the classified error.
 */
export function classifyError(input: {
  message: string
  code?: string
  statusCode?: number
}): ClassifiedError {
  const { message, code, statusCode } = input
  const base = code === undefined ? { message } : { message, code }
  if (statusCode !== undefined) {
    if (statusCode === 408 || statusCode === 429 || statusCode >= 500) {
      return { ...base, category: 'transient', retryable: true }
    }
    if (statusCode === 404) return { ...base, category: 'not-found', retryable: false }
    if (statusCode === 401 || statusCode === 403) return { ...base, category: 'permission', retryable: false }
    if (statusCode === 400 || statusCode === 422) return { ...base, category: 'validation', retryable: false }
  }
  const text = code === undefined ? message : `${code} ${message}`
  if (matches(text, ['timeout', 'econn', 'network', 'socket hang up'])) {
    return { ...base, category: 'transient', retryable: true }
  }
  if (matches(text, ['not found', 'enoent'])) return { ...base, category: 'not-found', retryable: false }
  if (matches(text, ['permission', 'eacces', 'eperm'])) return { ...base, category: 'permission', retryable: false }
  if (matches(text, ['invalid', 'validation', 'malformed'])) return { ...base, category: 'validation', retryable: false }
  return { ...base, category: 'unknown', retryable: false }
}

/**
 * Whether a classified error should be retried.
 * @param error - classified error.
 * @returns `true` when retryable.
 */
export function isRetryableError(error: ClassifiedError): boolean {
  return error.retryable
}

/**
 * Extract a message from an unknown thrown value.
 * @param error - thrown value.
 * @returns the error message, or `String(error)` for non-errors.
 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
