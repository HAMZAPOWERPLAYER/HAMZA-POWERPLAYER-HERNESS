/**
 * Pure approval policy for tool invocations.
 *
 * Combines an invocation's risk level, workspace trust, dry-run mode, and prior
 * user approval into an {@link ApprovalDecision}. All helpers are deterministic,
 * hold no state, and perform no I/O; callers own the approval prompt and the
 * recording of the user's answer.
 *
 * @module @deepseek-ai/dsh-util-values/approval-policy
 */

import { requiresApproval, type RiskLevel } from './tool-risk.ts'

/**
 * Outcome of the approval policy for one invocation.
 *
 * `'deny'` is reserved for policy denial applied by higher layers:
 * {@link decideApproval} never returns it, so callers must not depend on
 * receiving it.
 */
export type ApprovalDecision = 'auto' | 'require-approval' | 'deny'

/** Inputs the approval policy evaluates for one invocation. */
export interface ApprovalContext {
  /** Risk level of the invocation. */
  readonly risk: RiskLevel
  /** Whether the invocation targets a workspace the user marked as trusted. */
  readonly trustedWorkspace: boolean
  /** Whether the invocation has no side effects, such as a preview or dry run. */
  readonly dryRun: boolean
  /** Whether the user already approved this invocation explicitly. */
  readonly userApproved: boolean
}

/**
 * Decide whether an invocation runs immediately or needs approval first.
 *
 * Rules are evaluated in order, first match winning:
 * 1. `dryRun` auto-approves, because a dry run has no side effects.
 * 2. `userApproved` auto-approves, whatever the risk and trust are.
 * 3. High and critical risk always require approval, trusted workspace or not.
 * 4. Medium risk auto-approves only in a trusted workspace.
 * 5. Low risk auto-approves.
 *
 * A `'deny'` decision is reserved for policy denial by higher layers: this
 * function never returns it, so callers must not depend on receiving it.
 *
 * @param ctx - risk, workspace trust, dry-run mode, and prior user approval.
 * @returns `'auto'` or `'require-approval'` for the given context.
 */
export function decideApproval(ctx: ApprovalContext): ApprovalDecision {
  if (ctx.dryRun) return 'auto'
  if (ctx.userApproved) return 'auto'
  if (requiresApproval(ctx.risk)) return 'require-approval'
  if (ctx.risk === 'medium') return ctx.trustedWorkspace ? 'auto' : 'require-approval'
  return 'auto'
}

/**
 * Clause naming the rule that {@link decideApproval} applies to `ctx`.
 * @param ctx - risk, workspace trust, dry-run mode, and prior user approval.
 * @returns a lowercase clause without a trailing period.
 */
function decisionReason(ctx: ApprovalContext): string {
  if (ctx.dryRun) return 'the invocation is a dry run and has no side effects'
  if (ctx.userApproved) return 'the user already approved this invocation'
  if (requiresApproval(ctx.risk)) {
    return ctx.trustedWorkspace
      ? `${ctx.risk} risk requires approval even in a trusted workspace`
      : `${ctx.risk} risk requires approval outside a trusted workspace`
  }
  if (ctx.risk === 'medium') {
    return ctx.trustedWorkspace
      ? 'medium risk is allowed in a trusted workspace'
      : 'medium risk requires approval outside a trusted workspace'
  }
  return 'low risk needs no approval'
}

/**
 * Explain one approval decision in a deterministic sentence.
 *
 * The sentence names the rule that {@link decideApproval} applies to `ctx`, so
 * callers pass the decision that function returned for the same context. A
 * `'deny'` decision is attributed to the higher layer that applied it, because
 * this policy never produces denial itself.
 *
 * @param ctx - risk, workspace trust, dry-run mode, and prior user approval.
 * @param decision - decision to explain.
 * @returns a one-sentence explanation ending in a period.
 */
export function approvalExplanation(ctx: ApprovalContext, decision: ApprovalDecision): string {
  if (decision === 'deny') return 'Denied: a higher-level policy forbids this invocation.'
  const lead = decision === 'auto' ? 'Auto-approved' : 'Approval required'
  return `${lead}: ${decisionReason(ctx)}.`
}
