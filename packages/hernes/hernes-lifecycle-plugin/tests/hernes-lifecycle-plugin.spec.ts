import { describe, expect, it } from 'vitest'
import { HernesLifecycleService } from '../src/index.ts'

describe('HernesLifecycleService', () => {
  it('tracks turn start and end', () => {
    const svc = new HernesLifecycleService(
      {} as unknown as { on?: unknown; effect?: unknown; set?: unknown },
      { emitTaskEvents: true, autoCompleteOnTurnEnd: false },
    )
    svc.onTurnStart('session-1', 1)
    svc.onTurnEnd('session-1', 1, { kind: 'completed' }, true)
  })

  it('tracks step start and end', () => {
    const svc = new HernesLifecycleService(
      {} as unknown as { on?: unknown; effect?: unknown; set?: unknown },
      { emitTaskEvents: true, autoCompleteOnTurnEnd: false },
    )
    svc.onStepStart('session-1', 1, 1)
    svc.onStepEnd('session-1', 1, 1, true)
  })

  it('creates a completion report', () => {
    const svc = new HernesLifecycleService(
      {} as unknown as { on?: unknown; effect?: unknown; set?: unknown },
      { emitTaskEvents: true, autoCompleteOnTurnEnd: false },
    )
    const report = svc.createReport('task-1', {
      filesModified: ['src/a.ts'],
      featuresImplemented: ['feature-a'],
      testsExecuted: [],
      commandsExecuted: [],
      verificationOutcomes: [{ command: 'tsc', exitStatus: 0 }],
      buildStatus: 'passed',
      knownLimitations: [],
      remainingWork: [],
    })
    expect(report.taskId).toBe('task-1')
    expect(report.buildStatus).toBe('passed')
  })
})
