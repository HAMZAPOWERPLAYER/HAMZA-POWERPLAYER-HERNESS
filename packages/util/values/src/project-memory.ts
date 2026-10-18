/**
 * Project memory model with confidence and invalidation.
 *
 * Represents long-running project knowledge (architecture notes, decisions,
 * resolved defects, blockers, constraints) with an explicit confidence level
 * and invalidation rules. Assumptions remain distinguishable from verified
 * facts. Credentials are never stored. This module performs no I/O and holds
 * no state.
 *
 * @module @deepseek-ai/dsh-util-values/project-memory
 */

/** Categories of project memory. */
export type MemoryCategory =
  | 'architecture'
  | 'requirement'
  | 'decision'
  | 'resolved-defect'
  | 'blocker'
  | 'constraint'
  | 'test-instruction'
  | 'platform-constraint';

/** Confidence level of a memory entry. */
export type MemoryConfidence = 'verified' | 'user-provided' | 'observed' | 'suggested' | 'assumption';

/** One project memory entry. */
export interface MemoryEntry {
  /** Stable identifier. */
  readonly id: string;
  /** Category. */
  readonly category: MemoryCategory;
  /** Concise content. */
  readonly content: string;
  /** Confidence level. */
  readonly confidence: MemoryConfidence;
  /** Source that produced the entry, when known. */
  readonly source?: string;
  /** Timestamp of creation in milliseconds since epoch. */
  readonly createdAt: number;
  /** Timestamp of last validation in milliseconds since epoch, when validated. */
  readonly validatedAt?: number;
  /** Whether the entry is currently invalidated. */
  readonly invalidated: boolean;
  /** Reason for invalidation, when invalidated. */
  readonly invalidationReason?: string;
}

/** Whether a memory entry may be treated as a verified fact. */
export function isVerifiedMemory(entry: MemoryEntry): boolean {
  return entry.confidence === 'verified' && !entry.invalidated && entry.validatedAt !== undefined;
}

/** Whether a memory entry is an assumption that must not be upgraded silently. */
export function isAssumption(entry: MemoryEntry): boolean {
  return entry.confidence === 'assumption' || entry.confidence === 'suggested';
}

/** Invalidate an entry, returning a new entry. */
export function invalidateMemory(entry: MemoryEntry, reason: string): MemoryEntry {
  return {
    ...entry,
    invalidated: true,
    invalidationReason: reason,
    ...(entry.validatedAt !== undefined ? { validatedAt: entry.validatedAt } : {}),
  };
}

/** Validate an entry at a point in time, returning a new entry with verified confidence when appropriate. */
export function validateMemory(entry: MemoryEntry, now: number): MemoryEntry {
  if (entry.invalidated) return entry;
  return { ...entry, confidence: entry.confidence === 'assumption' ? 'observed' : entry.confidence, validatedAt: now };
}

/** Reasons that invalidate project memory. */
export type InvalidationTrigger =
  | 'source-changed'
  | 'dependency-changed'
  | 'engine-version-changed'
  | 'test-contradiction'
  | 'config-changed'
  | 'fix-no-longer-applies';

/** Whether a trigger invalidates an entry of a given category. */
export function triggerInvalidates(trigger: InvalidationTrigger, entry: MemoryEntry): boolean {
  switch (trigger) {
    case 'source-changed':
      return entry.category === 'architecture' || entry.category === 'decision' || entry.category === 'resolved-defect';
    case 'dependency-changed':
      return entry.category === 'platform-constraint' || entry.category === 'constraint';
    case 'engine-version-changed':
      return entry.category === 'platform-constraint' || entry.category === 'test-instruction';
    case 'test-contradiction':
      return true;
    case 'config-changed':
      return entry.category === 'requirement' || entry.category === 'constraint';
    case 'fix-no-longer-applies':
      return entry.category === 'resolved-defect';
    default:
      return false;
  }
}

/** Screen a memory entry for credential-like content. */
export function containsCredential(content: string): boolean {
  return /(?:password|secret|api[_-]?key|token|private[_-]?key)\s*[:=]/i.test(content) || /sk-[A-Za-z0-9]{20,}/.test(content);
}
