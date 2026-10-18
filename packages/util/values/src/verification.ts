/**
 * Evidence categories, evidence records, and verification-ledger primitives.
 *
 * HERNES reports only what it can support. Every completion claim must be
 * backed by evidence drawn from one of the categories below; a claim with no
 * supporting evidence is classified as `assumed` or `unknown`, never as
 * verified. These primitives are pure data and carry no runtime state.
 *
 * @module @deepseek-ai/dsh-util-values/verification
 */

/**
 * How a piece of evidence was obtained. Ordered from strongest to weakest so
 * that {@link classifyClaimSupport} can pick the strongest category present.
 */
export type EvidenceCategory =
  | 'verified-command'
  | 'observed-source'
  | 'supported-docs'
  | 'inferred'
  | 'assumed'
  | 'unknown'
  | 'failed-verification'

/** Numeric rank of each category, lower is stronger. */
export const EVIDENCE_CATEGORY_RANK: Readonly<Record<EvidenceCategory, number>> = {
  'verified-command': 0,
  'observed-source': 1,
  'supported-docs': 2,
  inferred: 3,
  assumed: 4,
  unknown: 5,
  'failed-verification': 6,
}

/**
 * A single piece of evidence backing (or refuting) a claim.
 */
export interface EvidenceRecord {
  /** Stable identifier for this record. */
  readonly id: string
  /** How the evidence was obtained. */
  readonly category: EvidenceCategory
  /** Short description of what the evidence concerns. */
  readonly subject: string
  /** Optional human-readable detail (command output excerpt, file location, etc.). */
  readonly detail?: string
  /** Optional recorded location of the evidence: command, file path, URL, or tool call id. */
  readonly source?: string
  /** Optional epoch milliseconds when the evidence was gathered. */
  readonly timestamp?: number
}

/**
 * A claim the agent intends to make about completed work.
 */
export interface Claim {
  /** The claim text. */
  readonly text: string
  /** Evidence supporting (or refuting) the claim. */
  readonly evidence: readonly EvidenceRecord[]
}

/**
 * Classify a claim by the strongest evidence it carries. A claim with any
 * `failed-verification` evidence is classified as failed regardless of other
 * evidence, so a failed check can never be masked by a passing one.
 *
 * @param claim - the claim and its evidence.
 * @returns the resulting evidence category.
 */
export function classifyClaimSupport(claim: Claim): EvidenceCategory {
  if (claim.evidence.length === 0) {
    return 'unknown'
  }
  if (claim.evidence.some((record) => record.category === 'failed-verification')) {
    return 'failed-verification'
  }
  let best: EvidenceCategory = (claim.evidence[0] as EvidenceRecord).category
  for (let i = 1; i < claim.evidence.length; i += 1) {
    const candidate = claim.evidence[i] as EvidenceRecord
    if (EVIDENCE_CATEGORY_RANK[candidate.category] < EVIDENCE_CATEGORY_RANK[best]) {
      best = candidate.category
    }
  }
  return best
}

/**
 * Whether a claim is supported strongly enough to be stated as fact. Only
 * `verified-command`, `observed-source`, and `supported-docs` qualify.
 *
 * @param claim - the claim and its evidence.
 * @returns `true` when the claim is fact-grade.
 */
export function isClaimSupported(claim: Claim): boolean {
  const category = classifyClaimSupport(claim)
  return (
    category === 'verified-command' ||
    category === 'observed-source' ||
    category === 'supported-docs'
  )
}

/**
 * A structured record of one verification attempt.
 */
export interface VerificationEntry {
  /** Task the entry belongs to. */
  readonly taskId: string
  /** What the change was supposed to do. */
  readonly intendedChange: string
  /** What the change actually did. */
  readonly actualChange: string
  /** Command executed for verification, if any. */
  readonly verificationCommand?: string
  /** Exit status of {@link VerificationEntry.verificationCommand}, if run. */
  readonly exitStatus?: number
  /** Location of captured output or log, if any. */
  readonly outputLocation?: string
  /** Epoch milliseconds when the entry was recorded. */
  readonly timestamp: number
  /** Issues still open after this entry. */
  readonly outstandingIssues: readonly string[]
}

/**
 * Build a {@link VerificationEntry}, stamping `timestamp` with the current
 * time when the caller does not supply one.
 *
 * @param entry - all ledger fields except the timestamp, which defaults to
 *   `Date.now()` when omitted.
 * @returns a complete {@link VerificationEntry}.
 */
export function createVerificationEntry(
  entry: Omit<VerificationEntry, 'timestamp'> & { readonly timestamp?: number },
): VerificationEntry {
  return {
    taskId: entry.taskId,
    intendedChange: entry.intendedChange,
    actualChange: entry.actualChange,
    ...(entry.verificationCommand !== undefined ? { verificationCommand: entry.verificationCommand } : {}),
    ...(entry.exitStatus !== undefined ? { exitStatus: entry.exitStatus } : {}),
    ...(entry.outputLocation !== undefined ? { outputLocation: entry.outputLocation } : {}),
    timestamp: entry.timestamp ?? Date.now(),
    outstandingIssues: entry.outstandingIssues,
  }
}

/**
 * Whether a verification entry represents a successful verification: a command
 * ran and exited zero with no outstanding issues.
 *
 * @param entry - the ledger entry to inspect.
 * @returns `true` only when a command ran and exited 0.
 */
export function isVerificationSuccessful(entry: VerificationEntry): boolean {
  return (
    entry.verificationCommand !== undefined &&
    entry.exitStatus === 0 &&
    entry.outstandingIssues.length === 0
  )
}
