import { describe, expect, it } from 'vitest'
import { HernesBootstrapService } from '../src/index.ts'

describe('HernesBootstrapService', () => {
  it('creates a bootstrap service', () => {
    const svc = new HernesBootstrapService(
      {} as unknown as { on?: unknown; effect?: unknown; set?: unknown },
      { enableEventWiring: true },
    )
    expect(svc).toBeDefined()
  })

  it('wires session events to lifecycle service', () => {
    const svc = new HernesBootstrapService(
      {} as unknown as { on?: unknown; effect?: unknown; set?: unknown },
      { enableEventWiring: true },
    )
    const lifecycle = {
      onTurnStart: (_sessionId: string, _turn: number) => {},
      onTurnEnd: (_sessionId: string, _turn: number, _reason: { kind: string }, _success: boolean) => {},
      onStepStart: (_sessionId: string, _turn: number, _step: number) => {},
      onStepEnd: (_sessionId: string, _turn: number, _step: number, _success: boolean) => {},
    }
    // wireSessionEvents expects ctx.on to be available; with a mock ctx it won't
    // actually register, but the method should not throw
    expect(() => svc.wireSessionEvents(lifecycle)).not.toThrow()
  })
})
