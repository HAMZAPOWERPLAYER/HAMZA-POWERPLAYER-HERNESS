/**
 * Idempotency classification model.
 *
 * Classifies operations as idempotent (safe to repeat) or non-idempotent, and
 * provides guidance for handling retries. This module performs no I/O and holds
 * no state.
 *
 * @module @deepseek-ai/dsh-util-values/idempotency
 */

/** Idempotency class of an operation. */
export type IdempotencyClass = 'read' | 'idempotent-write' | 'non-idempotent' | 'unknown';

/** An operation descriptor. */
export interface OperationDescriptor {
  /** Stable name. */
  readonly name: string;
  /** Idempotency class. */
  readonly idempotency: IdempotencyClass;
  /** Whether the operation has side effects. */
  readonly hasSideEffects: boolean;
}

/** Classify a named operation. */
export function classifyIdempotency(name: string, hasSideEffects: boolean, reversible: boolean): IdempotencyClass {
  const lower = name.toLowerCase();
  const readLike = /\b(read|list|inspect|get|check|validate|search|find)\b/.test(lower);
  if (readLike && !hasSideEffects) return 'read';
  if (!hasSideEffects) return 'read';
  if (reversible) return 'idempotent-write';
  return 'non-idempotent';
}

/** Whether an operation may be retried without inspecting state. */
export function mayRetryBlindly(op: OperationDescriptor): boolean {
  return op.idempotency === 'read' || op.idempotency === 'idempotent-write';
}

/** Whether an operation requires state inspection before retry. */
export function requiresStateInspection(op: OperationDescriptor): boolean {
  return op.idempotency === 'non-idempotent' || op.idempotency === 'unknown';
}
