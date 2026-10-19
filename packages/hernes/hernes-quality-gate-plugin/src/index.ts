/**
 * HERNES quality gate plugin.
 *
 * Wires game-quality-gate pure modules from @deepseek-ai/dsh-util-values
 * into the Cordis application. Provides quality gate evaluation for
 * architecture, correctness, security, testing, performance, and
 * maintainability.
 *
 * @module @deepseek-ai/dsh-hernes-quality-gate-plugin
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { z } from 'zod'
import {
  type QualityCategoryInput,
  type QualityGateResult,
  evaluateGameQualityGate,
} from '@deepseek-ai/dsh-util-values'

/** Plugin configuration schema. */
const Config = z.object({
  /** Whether to enable quality gate evaluation. */
  enableQualityGate: z.boolean().default(true),
  /** Minimum pass rate for quality gates. */
  minPassRate: z.number().min(0).max(100).default(80),
})

type Config = z.infer<typeof Config>

/** Quality gate service. */
export class HernesQualityGateService extends Service<Config> {
  static inject = ['sessions']
  static Config = Config

  constructor(ctx: Context, config: Config) {
    super(ctx, 'hernesQualityGate')
    this.config = config
    ctx.effect(() => {
      // cleanup on dispose
    })
  }

  /**
   * Evaluate a quality gate.
   * @param input - gate evaluation input.
   * @returns the gate evaluation result.
   */
  evaluateGate(input: readonly QualityCategoryInput[]): QualityGateResult {
    return evaluateGameQualityGate(input)
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    hernesQualityGate?: HernesQualityGateService
  }
}

export default HernesQualityGateService
