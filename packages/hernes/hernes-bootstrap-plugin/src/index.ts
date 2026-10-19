/**
 * HERNES bootstrap plugin.
 *
 * Wires HERNES services into Cordis session events through documented extension
 * points. Registers session event listeners that delegate to the task lifecycle
 * service, providing the "what was actually executed" evidence layer.
 *
 * @module @deepseek-ai/dsh-hernes-bootstrap-plugin
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { z } from 'zod'

/** Plugin configuration schema. */
const Config = z.object({
  /** Whether to wire session event listeners. */
  enableEventWiring: z.boolean().default(true),
})

type Config = z.infer<typeof Config>

/** Bootstrap service. */
export class HernesBootstrapService extends Service<Config> {
  static inject = ['sessions']
  static Config = Config

  constructor(ctx: Context, config: Config) {
    super(ctx, 'hernesBootstrap')
    this.config = config
    ctx.effect(() => {
      // cleanup on dispose
    })
  }

  /**
   * Wire session event listeners to lifecycle service.
   * @param lifecycle - lifecycle service instance.
   */
  wireSessionEvents(lifecycle: {
    onTurnStart(sessionId: string, turn: number): void
    onTurnEnd(sessionId: string, turn: number, reason: { kind: string }, success: boolean): void
    onStepStart(sessionId: string, turn: number, step: number): void
    onStepEnd(sessionId: string, turn: number, step: number, success: boolean): void
  }): void {
    if (!this.config.enableEventWiring) return
    ctx.on('turn/start', ({ sessionId, turn }) => {
      lifecycle.onTurnStart(sessionId, turn)
    })
    ctx.on('turn/end', ({ sessionId, turn, reason, success }) => {
      lifecycle.onTurnEnd(sessionId, turn, reason, success)
    })
    ctx.on('step/start', ({ sessionId, turn, step }) => {
      lifecycle.onStepStart(sessionId, turn, step)
    })
    ctx.on('step/end', ({ sessionId, turn, step, success }) => {
      lifecycle.onStepEnd(sessionId, turn, step, success)
    })
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    hernesBootstrap?: HernesBootstrapService
  }
  interface Events {
    'turn/start'(this: unknown, { sessionId, turn }: { sessionId: string; turn: number }): void
    'turn/end'(this: unknown, { sessionId, turn, reason, success }: { sessionId: string; turn: number; reason: { kind: string }; success: boolean }): void
    'step/start'(this: unknown, { sessionId, turn, step }: { sessionId: string; turn: number; step: number }): void
    'step/end'(this: unknown, { sessionId, turn, step, success }: { sessionId: string; turn: number; step: number; success: boolean }): void
  }
}

export default HernesBootstrapService
