/**
 * Requirement traceability for evidence-backed completion.
 *
 * Connects a user request to the evidence that supports it:
 * requirement → plan tasks → code changes → test cases → execution evidence
 * → final claims. Each requirement carries an explicit status and the
 * identifiers of the artifacts it touches, so completion is judged against a
 * traceable chain instead of a narrative summary. All helpers are pure: they
 * derive new traces from existing ones, perform no I/O, and hold no state.
 *
 * @module @deepseek-ai/dsh-util-values/requirement-trace
 */

import { type ClaimEvaluation, type ClaimState } from './claim-verifier.ts'
export type { ClaimEvaluation } from './claim-verifier.ts'

/** The status of a requirement relative to its evidence. */
export type RequirementStatus =
  | 'not-started'
  | 'in-progress'
  | 'implemented-but-untested'
  | 'tested-with-failures'
  | 'partially-verified'
  | 'verified-within-scope'
  | 'blocked'
  | 'deferred'

/** One traced requirement and the artifacts it touches. */
export interface RequirementTrace {
  /** Stable requirement identifier. */
  readonly id: string
  /** What the requirement demands. */
  readonly description: string
  /** Current status. */
  readonly status: RequirementStatus
  /** Plan task ids that implement this requirement. */
  readonly linkedTaskIds: readonly string[]
  /** File paths or edit ids changed for this requirement. */
  readonly linkedChangeIds: readonly string[]
  /** Test case ids that exercise this requirement. */
  readonly linkedTestIds: readonly string[]
  /** Evidence record ids that support this requirement. */
  readonly linkedEvidenceIds: readonly string[]
  /** Claim evaluation ids that evaluate this requirement. */
  readonly linkedClaimIds: readonly string[]
  /** Reason the requirement is deferred, when deferred. */
  readonly deferredReason?: string
  /** Reason the requirement is blocked, when blocked. */
  readonly blockedReason?: string
}

/** Inputs for building a {@link RequirementTrace}. */
export interface RequirementTraceInput {
  readonly id: string
  readonly description: string
  readonly status?: RequirementStatus
  readonly linkedTaskIds?: readonly string[]
  readonly linkedChangeIds?: readonly string[]
  readonly linkedTestIds?: readonly string[]
  readonly linkedEvidenceIds?: readonly string[]
  readonly linkedClaimIds?: readonly string[]
  readonly deferredReason?: string
  readonly blockedReason?: string
}

/**
 * Build a {@link RequirementTrace} with empty artifact lists and
 * `not-started` status unless the caller supplies otherwise.
 * @param input - requirement fields.
 * @returns a complete trace.
 */
export function createRequirementTrace(input: RequirementTraceInput): RequirementTrace {
  return {
    id: input.id,
    description: input.description,
    status: input.status ?? 'not-started',
    linkedTaskIds: input.linkedTaskIds ?? [],
    linkedChangeIds: input.linkedChangeIds ?? [],
    linkedTestIds: input.linkedTestIds ?? [],
    linkedEvidenceIds: input.linkedEvidenceIds ?? [],
    linkedClaimIds: input.linkedClaimIds ?? [],
    ...(input.deferredReason !== undefined ? { deferredReason: input.deferredReason } : {}),
    ...(input.blockedReason !== undefined ? { blockedReason: input.blockedReason } : {}),
  }
}

/** Add a plan task id to a requirement trace, returning a new trace. */
export function linkTask(trace: RequirementTrace, taskId: string): RequirementTrace {
  if (trace.linkedTaskIds.includes(taskId)) return trace
  return { ...trace, linkedTaskIds: [...trace.linkedTaskIds, taskId] }
}

/** Add a file path or edit id to a requirement trace, returning a new trace. */
export function linkChange(trace: RequirementTrace, changeId: string): RequirementTrace {
  if (trace.linkedChangeIds.includes(changeId)) return trace
  return { ...trace, linkedChangeIds: [...trace.linkedChangeIds, changeId] }
}

/** Add a test case id to a requirement trace, returning a new trace. */
export function linkTest(trace: RequirementTrace, testId: string): RequirementTrace {
  if (trace.linkedTestIds.includes(testId)) return trace
  return { ...trace, linkedTestIds: [...trace.linkedTestIds, testId] }
}

/** Add an evidence record id to a requirement trace, returning a new trace. */
export function linkEvidence(trace: RequirementTrace, evidenceId: string): RequirementTrace {
  if (trace.linkedEvidenceIds.includes(evidenceId)) return trace
  return { ...trace, linkedEvidenceIds: [...trace.linkedEvidenceIds, evidenceId] }
}

/** Add a claim evaluation id to a requirement trace, returning a new trace. */
export function linkClaim(trace: RequirementTrace, claimId: string): RequirementTrace {
  if (trace.linkedClaimIds.includes(claimId)) return trace
  return { ...trace, linkedClaimIds: [...trace.linkedClaimIds, claimId] }
}

/**
 * Update a requirement's status, returning a new trace. Blocked and deferred
 * statuses require a reason; other statuses clear any stored reason.
 * @param trace - trace to update.
 * @param status - new status.
 * @param reason - optional reason, required for blocked/deferred.
 * @returns a new trace with the updated status.
 */
export function updateRequirementStatus(
  trace: RequirementTrace,
  status: RequirementStatus,
  reason?: string,
): RequirementTrace {
  const base = {
    id: trace.id,
    description: trace.description,
    status,
    linkedTaskIds: trace.linkedTaskIds,
    linkedChangeIds: trace.linkedChangeIds,
    linkedTestIds: trace.linkedTestIds,
    linkedEvidenceIds: trace.linkedEvidenceIds,
    linkedClaimIds: trace.linkedClaimIds,
  }
  if (status === 'blocked') {
    if (reason === undefined) throw new Error('status blocked requires a reason')
    return { ...base, blockedReason: reason }
  }
  if (status === 'deferred') {
    if (reason === undefined) throw new Error('status deferred requires a reason')
    return { ...base, deferredReason: reason }
  }
  return base
}

/**
 * Derive a requirement's status from its linked claim evaluations.
 *
 * - any linked claim `failed` → `tested-with-failures`
 * - all linked claims `verified` → `verified-within-scope`
 * - any linked claim `verified` or `partially-verified` → `partially-verified`
 * - otherwise → `implemented-but-untested`
 *
 * Blocked/deferred reasons on the trace take precedence.
 * @param trace - trace to evaluate.
 * @param evaluations - claim evaluations, matched by `linkedClaimIds`.
 * @returns the derived status.
 */
export function deriveRequirementStatus(
  trace: RequirementTrace,
  evaluations: readonly ClaimEvaluation[],
): RequirementStatus {
  if (trace.blockedReason !== undefined) return 'blocked'
  if (trace.deferredReason !== undefined) return 'deferred'

  const relevant = evaluations.filter(evaluation => trace.linkedClaimIds.includes(evaluation.claimId))
  if (relevant.length === 0) return trace.status

  const anyFailed = relevant.some(evaluation => evaluation.state === 'failed')
  const allVerified = relevant.every(evaluation => evaluation.state === 'verified')
  const anyVerified = relevant.some(evaluation => evaluation.state === 'verified')
  const anyPartially = relevant.some(evaluation => evaluation.state === 'partially-verified')

  if (anyFailed) return 'tested-with-failures'
  if (allVerified) return 'verified-within-scope'
  if (anyVerified || anyPartially) return 'partially-verified'
  return 'implemented-but-untested'
}

/**
 * Whether a requirement status is terminal (no further work expected).
 * @param status - status to test.
 * @returns whether the status is terminal.
 */
export function isTerminalRequirementStatus(status: RequirementStatus): boolean {
  return status === 'verified-within-scope' || status === 'tested-with-failures' || status === 'deferred'
}

/**
 * Whether a claim state is terminal.
 * @param state - claim state to test.
 * @returns whether the state is terminal.
 */
export function isTerminalClaimStateForRequirement(state: ClaimState): boolean {
  return state === 'verified' || state === 'failed' || state === 'blocked' || state === 'not-applicable'
}
