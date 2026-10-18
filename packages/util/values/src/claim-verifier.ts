/**
 * Claim-to-evidence verification with explicit claim states.
 *
 * A completion claim is only as good as the evidence behind it. This module
 * evaluates a claim against the evidence types it requires and the evidence
 * actually gathered, producing an explicit claim state
 * (`verified`, `partially-verified`, `unverified`, `failed`, `blocked`,
 * `not-applicable`). It never promotes a claim to verified merely because its
 * text appears in a log or summary. All helpers are pure: they compute states
 * from caller-supplied evidence, perform no I/O, and hold no state.
 *
 * @module @deepseek-ai/dsh-util-values/claim-verifier
 */

import {
  type EvidenceCategory,
  type EvidenceRecord,
  classifyClaimSupport,
  isClaimSupported,
} from './verification.ts'

/** The state of a completion claim relative to its evidence. */
export type ClaimState =
  | 'verified'
  | 'partially-verified'
  | 'unverified'
  | 'failed'
  | 'blocked'
  | 'not-applicable'

/** The type of a piece of evidence: what kind of verification it represents. */
export type EvidenceType =
  | 'source-inspection'
  | 'file-change'
  | 'type-check'
  | 'unit-test'
  | 'integration-test'
  | 'build'
  | 'runtime'
  | 'engine-diagnostic'
  | 'security-audit'
  | 'manual-review'
  | 'external-tool'
  | 'unavailable'
  | 'incomplete'

/** One evidence record paired with its evidence type. */
export interface TypedEvidence {
  /** The underlying evidence record (strength category, subject, source, …). */
  readonly record: EvidenceRecord
  /** The kind of verification this evidence represents. */
  readonly type: EvidenceType
}

/** Inputs for evaluating one claim. */
export interface ClaimEvaluationInput {
  /** Stable claim identifier. */
  readonly claimId: string
  /** The claim text being evaluated. */
  readonly claimText: string
  /** Evidence types required to consider this claim verified. */
  readonly requiredEvidenceTypes: readonly EvidenceType[]
  /** Evidence actually gathered, each paired with its type. */
  readonly actualEvidence: readonly TypedEvidence[]
  /** Optional reason the claim is blocked (for example, missing SDK). */
  readonly blockedReason?: string
  /** Whether the claim applies to the current context at all. When false,
   *  the claim is `not-applicable` rather than verified or unverified. */
  readonly applicable?: boolean
}

/** The evaluated result of one claim. */
export interface ClaimEvaluation {
  /** Stable claim identifier. */
  readonly claimId: string
  /** The claim text being evaluated. */
  readonly claimText: string
  /** Explicit claim state. */
  readonly state: ClaimState
  /** Required evidence types that are satisfied by actual evidence. */
  readonly satisfiedTypes: readonly EvidenceType[]
  /** Required evidence types that have no matching actual evidence. */
  readonly missingTypes: readonly EvidenceType[]
  /** Strongest evidence category present. */
  readonly strongestCategory: EvidenceCategory
  /** Whether the claim reaches fact-grade support. */
  readonly isFactGrade: boolean
  /** Deterministic explanation of the verdict. */
  readonly explanation: string
}

/**
 * Evaluate one claim against its required evidence types and actual evidence.
 *
 * A `failed-verification` evidence record always wins: a failed check can
 * never be masked by a passing one. A claim with no evidence is `unverified`,
 * not `verified`. A claim is `verified` only when every required evidence type
 * is satisfied and the evidence is fact-grade.
 *
 * @param input - claim, required evidence types, and actual evidence.
 * @returns the claim evaluation.
 */
export function evaluateClaim(input: ClaimEvaluationInput): ClaimEvaluation {
  const records = input.actualEvidence.map((e) => e.record)
  const strongest = classifyClaimSupport({ text: input.claimText, evidence: records })
  const factGrade = isClaimSupported({ text: input.claimText, evidence: records })

  const presentTypes = new Set(input.actualEvidence.map((e) => e.type))
  const satisfiedTypes = input.requiredEvidenceTypes.filter((type) => presentTypes.has(type))
  const missingTypes = input.requiredEvidenceTypes.filter((type) => !presentTypes.has(type))

  const hasFailed = records.some((record) => record.category === 'failed-verification')
  const hasEvidence = records.length > 0

  let state: ClaimState
  if (hasFailed) {
    state = 'failed'
  } else if (input.applicable === false) {
    state = 'not-applicable'
  } else if (input.blockedReason !== undefined) {
    state = 'blocked'
  } else if (!hasEvidence) {
    state = 'unverified'
  } else if (missingTypes.length === 0 && factGrade) {
    state = 'verified'
  } else if (factGrade || satisfiedTypes.length > 0) {
    state = 'partially-verified'
  } else {
    state = 'unverified'
  }

  const explanation = buildExplanation(input, state, strongest, factGrade, satisfiedTypes, missingTypes, input.blockedReason)

  return {
    claimId: input.claimId,
    claimText: input.claimText,
    state,
    satisfiedTypes,
    missingTypes,
    strongestCategory: strongest,
    isFactGrade: factGrade,
    explanation,
  }
}

/**
 * Whether a claim evaluation supports stating the claim as fact.
 * @param evaluation - evaluation to inspect.
 * @returns `true` only when the claim is `verified`.
 */
export function isClaimVerified(evaluation: ClaimEvaluation): boolean {
  return evaluation.state === 'verified'
}

/**
 * Build a deterministic explanation for a claim evaluation.
 */
function buildExplanation(
  input: ClaimEvaluationInput,
  state: ClaimState,
  strongest: EvidenceCategory,
  factGrade: boolean,
  satisfiedTypes: readonly EvidenceType[],
  missingTypes: readonly EvidenceType[],
  blockedReason: string | undefined,
): string {
  const required = input.requiredEvidenceTypes.length === 0 ? 'none' : input.requiredEvidenceTypes.join(', ')
  const satisfied = satisfiedTypes.length === 0 ? 'none' : satisfiedTypes.join(', ')
  const missing = missingTypes.length === 0 ? 'none' : missingTypes.join(', ')

  switch (state) {
    case 'failed':
      return `Claim failed: evidence carries a failed-verification record (strongest category: ${strongest}). Required types: ${required}. Satisfied: ${satisfied}.`
    case 'not-applicable':
      return `Claim not applicable: ${input.claimText} does not apply to the current context. Required types: ${required}. Satisfied: ${satisfied}.`
    case 'blocked':
      return `Claim blocked: ${blockedReason}. Required types: ${required}. Satisfied: ${satisfied}. Missing: ${missing}.`
    case 'unverified':
      return `Claim unverified: no supporting evidence (strongest category: ${strongest}). Required types: ${required}. Satisfied: ${satisfied}. Missing: ${missing}.`
    case 'verified':
      return `Claim verified: all required evidence types satisfied (${satisfied}) with fact-grade support (strongest category: ${strongest}).`
    case 'partially-verified':
      return `Claim partially verified: ${satisfiedTypes.length} of ${input.requiredEvidenceTypes.length} required evidence types satisfied (${satisfied}); fact-grade: ${factGrade}. Missing: ${missing}.`
    case 'not-applicable':
      return `Claim not applicable: no evidence required.`
    default:
      return `Claim state ${state}: required types ${required}; satisfied ${satisfied}; missing ${missing}.`
  }
}

/**
 * Whether a claim state is terminal (no further evidence can change it).
 * @param state - claim state to test.
 * @returns whether the state is terminal.
 */
export function isTerminalClaimState(state: ClaimState): boolean {
  return state === 'verified' || state === 'failed' || state === 'blocked' || state === 'not-applicable'
}
