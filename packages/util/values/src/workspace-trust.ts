/**
 * Decide how much trust a tool invocation gets, from the workspace root, the
 * target path, and the tool's risk level. This module composes containment
 * checks from `./path-safety.ts`, risk ranking from `./tool-risk.ts`, and the
 * approval rules from `./approval-policy.ts`; it owns no state and performs no
 * I/O.
 *
 * @module @deepseek-ai/dsh-util-values/workspace-trust
 */

import { isPathWithinRoot } from './path-safety.ts'
import { type RiskLevel } from './tool-risk.ts'
import { decideApproval, approvalExplanation, type ApprovalDecision, type ApprovalContext } from './approval-policy.ts'

/** Workspace paths that are trusted for high-risk work and paths that stay untrusted inside them. */
export interface TrustPolicy {
  /** Roots that are trusted for high-risk work. */
  readonly trustedRoots: readonly string[]
  /** Paths that stay untrusted even inside a trusted root. */
  readonly deniedPaths: readonly string[]
}

/** Resolve a (possibly relative) path against a workspace root. */
function resolveAgainstWorkspace(path: string, workspaceRoot: string): string {
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) return path
  const trimmedRoot = workspaceRoot.replace(/\/+$/, '')
  if (trimmedRoot === '') return path
  return `${trimmedRoot}/${path}`
}

/** Resolve the trust level of a target path inside a workspace. */
/** Resolve the trust level of a target path inside a workspace.
 * @param policy - trust policy.
 * @param workspaceRoot - workspace root path.
 * @param targetPath - target path to resolve.
 * @returns the resolved trust level.
 */
export function resolveTrust(policy: TrustPolicy, workspaceRoot: string, targetPath: string): 'trusted' | 'denied' | 'untrusted' {
  const resolvedTarget = resolveAgainstWorkspace(targetPath, workspaceRoot)
  for (const denied of policy.deniedPaths) {
    if (isPathWithinRoot(resolveAgainstWorkspace(denied, workspaceRoot), resolvedTarget)) return 'denied'
  }
  for (const root of policy.trustedRoots) {
    if (isPathWithinRoot(resolveAgainstWorkspace(root, workspaceRoot), resolvedTarget)) return 'trusted'
  }
  return 'untrusted'
}

/** A tool invocation carrying its risk level and target path. */
export interface TrustedInvocation {
  readonly risk: RiskLevel
  readonly path: string
}

/** Map a resolved trust level into the approval context the approval policy consumes. */
/** Map a resolved trust level into the approval context the approval policy consumes.
 * @param trust - resolved trust level.
 * @param risk - tool risk level.
 * @param dryRun - whether the invocation is a dry run.
 * @returns the approval context.
 */
export function trustToApprovalContext(trust: 'trusted' | 'denied' | 'untrusted', risk: RiskLevel, dryRun: boolean): ApprovalContext {
  return {
    risk,
    trustedWorkspace: trust === 'trusted',
    dryRun,
    userApproved: false,
  }
}

/** Compose trust resolution and the approval policy into one decision. */
/** Compose trust resolution and the approval policy into one decision.
 * @param policy - trust policy.
 * @param workspaceRoot - workspace root path.
 * @param invocation - trusted invocation.
 * @param dryRun - whether the invocation is a dry run.
 * @returns the trust, decision, and explanation.
 */
export function decideTrustedInvocation(
  policy: TrustPolicy,
  workspaceRoot: string,
  invocation: TrustedInvocation,
  dryRun: boolean,
): { readonly trust: 'trusted' | 'denied' | 'untrusted'; readonly decision: ApprovalDecision; readonly explanation: string } {
  const trust = resolveTrust(policy, workspaceRoot, invocation.path)
  const context = trustToApprovalContext(trust, invocation.risk, dryRun)
  const decision = decideApproval(context)
  const explanation = approvalExplanation(context, decision)
  return { trust, decision, explanation }
}

/** Report structural problems in a trust policy. */
/** Report structural problems in a trust policy.
 * @param policy - trust policy.
 * @returns problem strings.
 */
export function auditTrustPolicy(policy: TrustPolicy): readonly string[] {
  const problems: string[] = []
  for (const denied of policy.deniedPaths) {
    for (const root of policy.trustedRoots) {
      if (isPathWithinRoot(root, denied)) problems.push(`denied path ${denied} is inside trusted root ${root}`)
    }
  }
  const seenRoots = new Set<string>()
  const seenDenied = new Set<string>()
  for (const root of policy.trustedRoots) {
    if (root.trim() === '') problems.push(`trusted root ${root} is empty`)
    if (seenRoots.has(root)) problems.push(`trusted root ${root} is duplicated`)
    seenRoots.add(root)
  }
  for (const denied of policy.deniedPaths) {
    if (seenDenied.has(denied)) problems.push(`denied path ${denied} is duplicated`)
    seenDenied.add(denied)
  }
  return problems
}
