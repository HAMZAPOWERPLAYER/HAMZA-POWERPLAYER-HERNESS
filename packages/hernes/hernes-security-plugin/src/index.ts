/**
 * HERNES security plugin.
 *
 * Wires security-audit, approval-policy, and workspace-trust pure modules
 * from @deepseek-ai/dsh-util-values into the Cordis application.
 *
 * @module @deepseek-ai/dsh-hernes-security-plugin
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { z } from 'zod'
import {
  type ApprovalContext,
  type ApprovalDecision,
  type SecurityCheckResult,
  type TrustPolicy,
  approvalExplanation,
  auditFailures,
  auditPassed,
  decideApproval,
  runSecurityAudit,
  resolveTrust,
} from '@deepseek-ai/dsh-util-values'

/** Plugin configuration schema. */
const Config = z.object({
  /** Whether to enable security auditing. */
  enableAudit: z.boolean().default(true),
  /** Whether to enforce approval for consequential actions. */
  enforceApproval: z.boolean().default(true),
  /** Trusted roots for workspace trust resolution. */
  trustedRoots: z.array(z.string()).default([]),
})

type Config = z.infer<typeof Config>

/** Security service. */
export class HernesSecurityService extends Service<Config> {
  static inject = ['sessions']
  static Config = Config

  constructor(ctx: Context, config: Config) {
    super(ctx, 'hernesSecurity')
    this.config = config
    ctx.effect(() => {
      // cleanup on dispose
    })
  }

  /**
   * Run all security checks on inputs.
   * @param inputs - named input strings to check.
   * @returns check results.
   */
  runAudit(inputs: readonly { name: string; value: string | null | undefined }[]): readonly SecurityCheckResult[] {
    return runSecurityAudit(inputs)
  }

  /**
   * Whether all audit results passed.
   * @param results - security check results.
   * @returns whether all checks passed.
   */
  auditPassed(results: readonly SecurityCheckResult[]): boolean {
    return auditPassed(results)
  }

  /**
   * Get failure reasons from audit results.
   * @param results - security check results.
   * @returns failure reason strings.
   */
  auditFailures(results: readonly SecurityCheckResult[]): readonly string[] {
    return auditFailures(results)
  }

  /**
   * Decide whether an invocation runs immediately or needs approval.
   * @param ctx - approval context.
   * @returns the approval decision.
   */
  decideApproval(ctx: ApprovalContext): ApprovalDecision {
    return decideApproval(ctx)
  }

  /**
   * Explain an approval decision.
   * @param ctx - approval context.
   * @param decision - the decision to explain.
   * @returns a one-sentence explanation.
   */
  explainApproval(ctx: ApprovalContext, decision: ApprovalDecision): string {
    return approvalExplanation(ctx, decision)
  }

  /**
   * Resolve the trust level of a target path.
   * @param policy - trust policy.
   * @param workspaceRoot - workspace root path.
   * @param targetPath - target path to resolve.
   * @returns the resolved trust level.
   */
  resolveTrustLevel(policy: TrustPolicy, workspaceRoot: string, targetPath: string): 'trusted' | 'denied' | 'untrusted' {
    return resolveTrust(policy, workspaceRoot, targetPath)
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    hernesSecurity?: HernesSecurityService
  }
}

export default HernesSecurityService
