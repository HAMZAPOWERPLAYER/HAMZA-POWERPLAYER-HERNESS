/**
 * HERNES verification plugin.
 *
 * Wires verification, claim-verifier, and tool-result envelope pure modules
 * from @deepseek-ai/dsh-util-values into the Cordis application. Provides
 * evidence-based claim verification and structured tool-result handling.
 *
 * @module @deepseek-ai/dsh-hernes-verification-plugin
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { z } from 'zod'
import {
  type ClaimEvaluation,
  type ClaimEvaluationInput,
  type EvidenceCategory,
  type ToolResultEnvelope,
  type ToolResultEnvelopeInput,
  classifyClaimSupport,
  createToolResult,
  evaluateClaim,
  isClaimVerified,
  isToolResultSuccessful,
} from '@deepseek-ai/dsh-util-values'

/** Plugin configuration schema. */
const Config = z.object({
  /** Whether to enforce verification before completion. */
  enforceVerification: z.boolean().default(true),
  /** Maximum retry count for tool execution. */
  maxRetries: z.number().int().positive().default(3),
})

type Config = z.infer<typeof Config>

/** Verification service. */
export class HernesVerificationService extends Service<Config> {
  static inject = ['sessions']
  static Config = Config

  constructor(ctx: Context, config: Config) {
    super(ctx, 'hernesVerification')
    this.config = config
    ctx.effect(() => {
      // cleanup on dispose
    })
  }

  /**
   * Evaluate a claim against its evidence.
   * @param input - claim, required evidence types, and actual evidence.
   * @returns the claim evaluation.
   */
  evaluateClaim(input: ClaimEvaluationInput): ClaimEvaluation {
    return evaluateClaim(input)
  }

  /**
   * Whether a claim is verified.
   * @param evaluation - the claim evaluation.
   * @returns true only when the claim is verified.
   */
  isClaimVerified(evaluation: ClaimEvaluation): boolean {
    return isClaimVerified(evaluation)
  }

  /**
   * Create a structured tool-result envelope.
   * @param input - envelope fields.
   * @returns a complete envelope.
   */
  createToolResult(input: ToolResultEnvelopeInput): ToolResultEnvelope {
    return createToolResult(input)
  }

  /**
   * Whether a tool result represents a successful execution.
   * @param result - envelope to inspect.
   * @returns true only when the execution itself succeeded.
   */
  isToolResultSuccessful(result: ToolResultEnvelope): boolean {
    return isToolResultSuccessful(result)
  }

  /**
   * Classify a claim by its evidence.
   * @param text - the claim text.
   * @param evidence - the evidence records.
   * @returns the evidence category.
   */
  classifyClaim(text: string, evidence: readonly { id: string; category: EvidenceCategory; subject: string }[]): EvidenceCategory {
    return classifyClaimSupport({ text, evidence: evidence as never })
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    hernesVerification?: HernesVerificationService
  }
}

export default HernesVerificationService
