/**
 * Structured tool-result envelopes for honest execution evidence.
 *
 * A tool-result envelope records what the execution layer actually observed
 * when it ran (or tried to run) a tool or command. It separates the raw tool
 * output from any model interpretation of that output, and flags whether
 * execution was attempted, started, or completed, so callers cannot mistake a
 * planned command for a successful execution. All helpers are pure: they
 * build and inspect envelopes, perform no I/O, and hold no state.
 *
 * @module @deepseek-ai/dsh-util-values/tool-result
 */

/** One structured tool-result envelope. */
export interface ToolResultEnvelope {
  /** Stable identifier for this invocation. */
  readonly invocationId: string
  /** The action that was requested. */
  readonly action: string
  /** Whether execution was attempted at all. */
  readonly attempted: boolean
  /** Whether execution actually started. */
  readonly started: boolean
  /** Whether execution completed (not timed out or cancelled). */
  readonly completed: boolean
  /** Exit status, present only when the invocation completed. */
  readonly exitStatus?: number
  /** Whether the invocation timed out. */
  readonly timedOut: boolean
  /** Whether the invocation was cancelled. */
  readonly cancelled: boolean
  /** Whether captured output was truncated. */
  readonly truncated: boolean
  /** Tool errors recorded during execution. */
  readonly errors: readonly string[]
  /** Working-directory context in which the tool ran. */
  readonly workingDirectory?: string
  /** Whether the result is mocked or simulated rather than a real execution. */
  readonly mocked: boolean
  /** Number of retries that occurred before this result. */
  readonly retryCount: number
  /** Bounded raw output excerpt from the tool. */
  readonly output?: string
  /** The model's interpretation of the result, separate from raw output. */
  readonly interpretation?: string
}

/** Inputs for building a {@link ToolResultEnvelope}. */
export interface ToolResultEnvelopeInput {
  readonly invocationId: string
  readonly action: string
  readonly attempted?: boolean
  readonly started?: boolean
  readonly completed?: boolean
  readonly exitStatus?: number
  readonly timedOut?: boolean
  readonly cancelled?: boolean
  readonly truncated?: boolean
  readonly errors?: readonly string[]
  readonly workingDirectory?: string
  readonly mocked?: boolean
  readonly retryCount?: number
  readonly output?: string
  readonly interpretation?: string
}

/**
 * Build a {@link ToolResultEnvelope} with safe defaults: nothing was attempted
 * or executed unless the caller says so, and nothing is mocked by default.
 * @param input - envelope fields; booleans default to false, arrays to empty.
 * @returns a complete envelope.
 */
export function createToolResult(input: ToolResultEnvelopeInput): ToolResultEnvelope {
  const attempted = input.attempted ?? false
  const started = input.started ?? false
  const completed = input.completed ?? false
  return {
    invocationId: input.invocationId,
    action: input.action,
    attempted,
    started,
    completed,
    ...(input.exitStatus !== undefined ? { exitStatus: input.exitStatus } : {}),
    timedOut: input.timedOut ?? false,
    cancelled: input.cancelled ?? false,
    truncated: input.truncated ?? false,
    errors: input.errors ?? [],
    ...(input.workingDirectory !== undefined ? { workingDirectory: input.workingDirectory } : {}),
    mocked: input.mocked ?? false,
    retryCount: input.retryCount ?? 0,
    ...(input.output !== undefined ? { output: input.output } : {}),
    ...(input.interpretation !== undefined ? { interpretation: input.interpretation } : {}),
  }
}

/**
 * Whether a tool result represents a successful execution: it started,
 * completed, exited zero, was not timed out or cancelled, produced no errors,
 * and is not mocked.
 * @param result - envelope to inspect.
 * @returns `true` only when the execution itself succeeded.
 */
export function isToolResultSuccessful(result: ToolResultEnvelope): boolean {
  return (
    result.started &&
    result.completed &&
    result.exitStatus === 0 &&
    !result.timedOut &&
    !result.cancelled &&
    result.errors.length === 0 &&
    result.mocked === false
  )
}

/**
 * Whether a tool result represents a failed execution: it started but did not
 * complete successfully, timed out, was cancelled, exited non-zero, or
 * recorded errors.
 * @param result - envelope to inspect.
 * @returns `true` when execution was attempted and did not succeed.
 */
export function isToolResultFailed(result: ToolResultEnvelope): boolean {
  if (result.mocked === true) return false
  if (!result.attempted) return false
  if (result.started && result.completed && result.exitStatus === 0 && result.errors.length === 0) return false
  return true
}

/**
 * Whether a tool result records that execution was never attempted.
 * @param result - envelope to inspect.
 * @returns `true` when the invocation was not run.
 */
export function isToolResultNotRun(result: ToolResultEnvelope): boolean {
  return result.attempted === false && result.started === false && result.completed === false
}

/**
 * Whether a tool result is mocked or simulated rather than a real execution.
 * @param result - envelope to inspect.
 * @returns `true` when the result is mocked.
 */
export function isToolResultMocked(result: ToolResultEnvelope): boolean {
  return result.mocked === true
}

/**
 * Classify a tool result into a single status.
 * @param result - envelope to classify.
 * @returns one of `mocked`, `not-run`, `successful`, `failed`.
 */
export function classifyToolResult(result: ToolResultEnvelope): 'mocked' | 'not-run' | 'successful' | 'failed' {
  if (result.mocked === true) return 'mocked'
  if (result.attempted === false && result.started === false && result.completed === false) return 'not-run'
  if (isToolResultSuccessful(result)) return 'successful'
  return 'failed'
}

/**
 * Summarize a tool result as a concise, deterministic string.
 * @param result - envelope to summarize.
 * @returns a one-line summary of what happened.
 */
export function toolResultSummary(result: ToolResultEnvelope): string {
  const parts: string[] = [`${result.action} (${result.invocationId})`]
  if (result.mocked === true) parts.push('mocked')
  else if (!result.attempted) parts.push('not run')
  else if (!result.started) parts.push('attempted, did not start')
  else if (!result.completed) parts.push('started, did not complete')
  else if (result.exitStatus === 0) parts.push(`exit 0`)
  else parts.push(`exit ${result.exitStatus ?? 'unknown'}`)
  if (result.timedOut) parts.push('timed out')
  if (result.cancelled) parts.push('cancelled')
  if (result.truncated) parts.push('output truncated')
  if (result.errors.length > 0) parts.push(`${result.errors.length} error(s)`)
  if (result.retryCount > 0) parts.push(`${result.retryCount} retry(ies)`)
  return parts.join('; ')
}
