/**
 * Security policy decisions for command and file access.
 *
 * Composes the existing path containment, risk classification, and approval
 * primitives into concrete allow/deny decisions. Performs no I/O and holds no
 * state; callers own executing the decision and recording the outcome.
 *
 * @module @deepseek-ai/dsh-util-values/security-policy
 */

import { isPathWithinRoot } from './path-safety.ts'
import { type RiskLevel, compareRisk } from './tool-risk.ts'
import { decideApproval, type ApprovalContext, type ApprovalDecision } from './approval-policy.ts'

/** What a policy allows or denies. */
export interface SecurityPolicy {
  /** Roots the caller is authorized to touch. */
  readonly trustedRoots: readonly string[]
  /** Roots the caller is never allowed to touch, checked before trusted roots. */
  readonly deniedRoots: readonly string[]
  /** Maximum risk level the caller may approve without user interaction. */
  readonly maxAutoApprovalRisk: RiskLevel
}

/** One access decision with its rationale. */
export interface AccessDecision {
  /** Whether the access is allowed. */
  readonly allowed: boolean
  /** Why the access was allowed or denied. */
  readonly reason: string
  /** Approval decision the underlying policy would make. */
  readonly approvalDecision: ApprovalDecision
}

/** Resolve whether a path may be accessed under one policy.
 * @param policy - security policy.
 * @param workspaceRoot - workspace root path.
 * @param targetPath - target path to check.
 * @returns the access decision.
 */
export function resolveAccess(policy: SecurityPolicy, workspaceRoot: string, targetPath: string): AccessDecision {
  const root = workspaceRoot.replace(/\\/g, '/')
  const target = resolveRoot(targetPath, root)

  for (const denied of policy.deniedRoots) {
    const deniedRoot = resolveRoot(denied, root)
    if (isPathWithinRoot(deniedRoot, target)) {
      return {
        allowed: false,
        reason: `path ${targetPath} is under denied root ${denied}`,
        approvalDecision: 'deny',
      }
    }
  }

  for (const trusted of policy.trustedRoots) {
    const trustedRoot = resolveRoot(trusted, root)
    if (isPathWithinRoot(trustedRoot, target)) {
      const context: ApprovalContext = {
        risk: 'low',
        trustedWorkspace: true,
        dryRun: false,
        userApproved: false,
      }
      const decision = decideApproval(context)
      return {
        allowed: decision === 'auto',
        reason: `path ${targetPath} is under trusted root ${trusted}`,
        approvalDecision: decision,
      }
    }
  }

  return {
    allowed: false,
    reason: `path ${targetPath} is under no trusted root`,
    approvalDecision: 'require-approval',
  }
}

/** Approve or deny a tool invocation under one policy.
 * @param policy - security policy.
 * @param invocation - invocation with risk level and target path.
 * @returns the access decision.
 */
export function decideInvocation(policy: SecurityPolicy, invocation: { readonly risk: RiskLevel; readonly path: string }): AccessDecision {
  const access = resolveAccess(policy, invocation.path.replace(/\\/g, '/'), invocation.path)

  // A denied-root decision overrides every other consideration: deny wins.
  if (access.approvalDecision === 'deny') {
    return { allowed: false, reason: access.reason, approvalDecision: 'deny' }
  }

  const context: ApprovalContext = {
    risk: invocation.risk,
    trustedWorkspace: access.allowed,
    dryRun: false,
    userApproved: false,
  }
  const decision = decideApproval(context)
  const riskExceedsLimit = compareRisk(invocation.risk, policy.maxAutoApprovalRisk) > 0
  const allowed = decision === 'auto' && access.allowed && !riskExceedsLimit
  const reason = riskExceedsLimit
    ? `risk ${invocation.risk} exceeds auto-approval limit ${policy.maxAutoApprovalRisk}`
    : access.reason
  return { allowed, reason, approvalDecision: decision }
}

function resolveRoot(root: string, workspaceRoot: string): string {
  if (root.startsWith('/') || /^[A-Za-z]:/.test(root)) return root
  const trimmed = workspaceRoot.replace(/\/+$/, '')
  return trimmed === '' ? root : `${trimmed}/${root}`
}
